import { parse as parseJavaScript } from "@babel/parser";
import { createCompiledCatalog, getCatalogs } from "@lingui/cli/api";
import { getConfig } from "@lingui/conf";
import { parse as parseIcu } from "@messageformat/parser";
import { ESLint } from "eslint";
import assert from "node:assert/strict";
import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

export function placeholders(message) {
  const args = new Set();
  const visit = (tokens, initialTags = []) => {
    let tags = [...initialTags];
    for (const token of tokens) {
      if (token.arg) {
        args.add(token.arg);
      }
      if (token.type === "content") {
        for (const [, closing, index, selfClosing] of token.value.matchAll(/<(\/?)(\d+)\s*(\/?)>/g)) {
          if (closing) {
            if (selfClosing || tags.pop() !== index) {
              throw new Error("Mismatched rich-text component tag.");
            }
          } else if (!selfClosing) {
            tags.push(index);
          }
        }
      }
      if (token.cases) {
        if (!token.cases.some((branch) => branch.key === "other")) {
          throw new Error("ICU choices require an other branch.");
        }
        const branches = token.cases.map((branch) => visit(branch.tokens, tags));
        if (branches.some((branch) => JSON.stringify(branch) !== JSON.stringify(branches[0]))) {
          throw new Error("Mismatched rich-text component tags across ICU branches.");
        }
        tags = branches[0];
      }
    }
    return tags;
  };
  if (visit(parseIcu(message)).length) {
    throw new Error("Unclosed rich-text component tag.");
  }
  // Lingui rich-text components are placeholders too, e.g. <0>Help</0>.
  for (const match of message.matchAll(/<([\w]+)(?:\s[^>]*)?\s*\/?>/g)) {
    args.add(`<${match[1]}>`);
  }
  return [...args].sort();
}

export function validateCatalogs(extracted, catalogs, sourceLocale = "en") {
  const errors = [];
  for (const [locale, catalog] of Object.entries(catalogs)) {
    const active = Object.fromEntries(Object.entries(catalog).filter(([, item]) => !item.obsolete));
    for (const [id, source] of Object.entries(extracted)) {
      const item = active[id];
      // Explicit i18n._("message") entries use the ID as the source text.
      const sourceMessage = source.message ?? id;
      if (!item) {
        errors.push(`${locale}: missing catalog entry for ${JSON.stringify(sourceMessage)}`);
        continue;
      }
      if ((item.message ?? id) !== sourceMessage || (item.context ?? "") !== (source.context ?? "")) {
        errors.push(`${locale}: stale source message for ${JSON.stringify(id)}`);
      }
      if (locale !== sourceLocale && !item.translation?.trim()) {
        errors.push(`${locale}: missing translation for ${JSON.stringify(sourceMessage)}`);
        continue;
      }
      if (item.translation?.trim()) {
        try {
          assert.deepEqual(placeholders(item.translation), placeholders(sourceMessage));
        } catch {
          errors.push(`${locale}: invalid ICU or mismatched placeholders for ${JSON.stringify(sourceMessage)}`);
        }
      }
    }
    for (const id of Object.keys(active)) {
      if (!Object.hasOwn(extracted, id)) {
        errors.push(`${locale}: stale catalog entry ${JSON.stringify(id)}`);
      }
    }
  }
  return errors;
}

// Parse the generated module as data. Never execute a committed catalog in CI.
export function readCompiledMessages(source) {
  const ast = parseJavaScript(source, { sourceType: "module", plugins: ["typescript"] });
  const declaration = ast.program.body
    .find((node) =>
      node.type === "ExportNamedDeclaration"
      && node.declaration?.declarations?.some((item) => item.id.name === "messages")
    )
    ?.declaration.declarations.find((item) => item.id.name === "messages");
  let init = declaration?.init;
  if (init?.type === "TSAsExpression") {
    init = init.expression;
  }
  if (
    init?.type !== "CallExpression" || init.callee.type !== "MemberExpression"
    || init.callee.object.name !== "JSON" || init.callee.property.name !== "parse"
    || init.arguments.length !== 1 || init.arguments[0].type !== "StringLiteral"
  ) {
    throw new Error("Expected Lingui's generated JSON.parse catalog; run lingui:compile.");
  }
  return JSON.parse(init.arguments[0].value);
}

const ownedSourceDirectories = ["apps/desktop/src", "packages/ui/src", "packages/utils/src", "packages/tiptap/src"];

export function assertSourceCoverage(root, catalogs, extractions) {
  if (!catalogs.length) {
    throw new Error("Translation checks require at least one catalog.");
  }
  const allowedExcludes = new Set(["**/node_modules/**", "**/*.test.{ts,tsx}", "**/*.spec.{ts,tsx}", "**/locales/**"]);
  const localeDirectory = path.join(root, "apps/desktop/src/locales");
  for (const catalog of catalogs) {
    for (const exclude of catalog.exclude ?? []) {
      const directory = path.resolve(catalog.config.rootDir, exclude.replace(/\/\*\*$/, "").replace(/\/$/, ""));
      if (!allowedExcludes.has(exclude) && directory !== localeDirectory) {
        throw new Error(`Production source exclusions cannot disable translation extraction: ${exclude}`);
      }
    }
  }
  for (const directory of ownedSourceDirectories) {
    const required = path.join(root, directory);
    if (
      !catalogs.some((catalog) =>
        catalog.include.some((include) => path.resolve(catalog.config.rootDir, include) === required)
      )
    ) {
      throw new Error(`Translation extraction must include the complete source root: ${directory}`);
    }
    if (
      extractions
      && !extractions.some((entries, index) =>
        Object.values(entries).some((entry) =>
          (entry.origin ?? []).some(([filename]) => {
            const relative = path.relative(required, path.resolve(catalogs[index].config.rootDir, filename));
            return relative !== "" && !relative.startsWith(`..${path.sep}`) && relative !== ".."
              && !path.isAbsolute(relative);
          })
        )
      )
    ) {
      throw new Error(`Translation extraction produced no messages from required source root: ${directory}`);
    }
  }
  if (extractions?.some((entries) => Object.keys(entries).length === 0)) {
    throw new Error("Translation extraction produced an empty catalog.");
  }
}

export async function checkTranslations(root = repoRoot, { lint = true } = {}) {
  const errors = [];
  const desktop = path.join(root, "apps/desktop");
  if (lint) {
    const eslint = new ESLint({
      cwd: root,
      overrideConfigFile: path.join(desktop, "scripts/localization-eslint.config.mjs"),
      // Warnings from unused suppression comments must fail just like errors.
      overrideConfig: { linterOptions: { reportUnusedDisableDirectives: "error" } },
    });
    const results = await eslint.lintFiles([
      "apps/desktop/src",
      "packages/ui/src",
      "packages/utils/src",
      "packages/tiptap/src",
    ]);
    if (results.some((result) => result.errorCount || result.warningCount)) {
      errors.push(await (await eslint.loadFormatter("stylish")).format(results));
    }
  }
  const config = getConfig({ cwd: desktop, configPath: path.join(desktop, "lingui.config.js") });
  if (config.sourceLocale !== "en" || !["en", "es"].every((locale) => config.locales.includes(locale))) {
    throw new Error("Translation checks require English source messages and both en/es catalogs.");
  }
  const catalogs = await getCatalogs(config);
  assertSourceCoverage(root, catalogs);
  const extractions = [];
  for (const catalog of catalogs) {
    // collect() is Lingui's read-only extractor; no PO rewriting or order comparison.
    const extracted = await catalog.collect();
    if (!extracted || Object.keys(extracted).length === 0) {
      throw new Error("Lingui source extraction failed or produced an empty catalog.");
    }
    extractions.push(extracted);
    const translations = await catalog.readAll();
    errors.push(...validateCatalogs(extracted, translations, config.sourceLocale));
    for (const [locale, messages] of Object.entries(translations)) {
      const active = Object.fromEntries(
        Object.entries(messages)
          .filter(([id, item]) => Object.hasOwn(extracted, id) && !item.obsolete)
          .map(([id, item]) => [id, item.translation || (locale === config.sourceLocale ? (item.message ?? id) : "")]),
      );
      const compiled = createCompiledCatalog(locale, active, { namespace: "json", strict: true });
      errors.push(...compiled.errors.map((error) => `${locale}: ${error.error.message}`));
      const filename = catalog.getFilename(locale).replace(/\.po$/, ".ts");
      try {
        assert.deepEqual(readCompiledMessages(await readFile(filename, "utf8")), JSON.parse(compiled.source).messages);
      } catch {
        errors.push(
          `${locale}: missing or stale compiled catalog (${path.relative(root, filename)}). Run lingui:compile.`,
        );
      }
    }
  }
  assertSourceCoverage(root, catalogs, extractions);
  if (errors.length) {
    throw new Error(`Translation check failed:\n${errors.join("\n")}`);
  }
  return { catalogs: catalogs.length };
}

const invokedPath = process.argv[1] ? await realpath(process.argv[1]).catch(() => null) : null;
if (fileURLToPath(import.meta.url) === invokedPath) {
  checkTranslations(process.argv[2] ? path.resolve(process.argv[2]) : repoRoot)
    .then(() => console.log("Translations: UI strings, en/es catalogs, placeholders and compiled messages passed."))
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
