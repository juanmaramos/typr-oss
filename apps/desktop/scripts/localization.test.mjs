import { createCompiledCatalog, getCatalogs } from "@lingui/cli/api";
import { getConfig } from "@lingui/conf";
import { ESLint } from "eslint";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { withStagedSnapshot } from "./check-staged-translations.mjs";
import {
  assertSourceCoverage,
  checkTranslations,
  placeholders,
  readCompiledMessages,
  repoRoot,
  validateCatalogs,
} from "./check-translations.mjs";

const eslint = new ESLint({
  cwd: repoRoot,
  overrideConfigFile: path.join(repoRoot, "apps/desktop/scripts/localization-eslint.config.mjs"),
});
const lint = async (source, filename = "apps/desktop/src/localization-fixture.tsx") =>
  (await eslint.lintText(source, { filePath: filename }))[0].messages;

for (
  const [label, source] of [
    ["nested JSX fallback", "const View = () => <p>{highlightText(note.title || \"New note\", query)}</p>"],
    ["named title", "const noteTitle = note.title || \"Current note\""],
    ["named prefix", "const prefix = isUser ? \"You: \" : \"Assistant: \""],
    ["validation message", "const schema = z.string().min(2, \"At least two characters\")"],
    ["visible JSX", "const View = () => <p>Missing translation</p>"],
    ["native title", "const View = () => <div title=\"Missing translation\" />"],
    ["native role description", "const View = () => <div title=\"Drag to move\" aria-roledescription=\"slide\" />"],
    ["accessibility", "const View = () => <input aria-label=\"Missing translation\" />"],
    ["conditional tooltip", "const View = () => <Button tooltip={true ? \"Stop recording\" : \"Start recording\"} />"],
    ["display metadata", "const choices = [{ value: \"private\", label: \"Invited people\" }]"],
    ["toast", "toast.error(\"Could not download model\")"],
    ["imported toast alias", "sonnerToast.error(\"Could not download model\")"],
    ["format first argument fallback", "const View = () => <p>{format(date || \"Unknown date\", \"MMM d\")}</p>"],
    [
      "promise toast message",
      "sonnerToast.promise(job, {loading: \"Downloading model\", success: \"Downloaded model\"})",
    ],
    ["text display prop", "const View = () => <Tab text=\"Missing translation\" />"],
    [
      "reassigned display variable",
      "let userFriendlyMessage = t`Known`; userFriendlyMessage = \"Missing translation\"; const View = () => <p>{userFriendlyMessage}</p>",
    ],
    ["user-facing error subclass", "throw new EmptyChatResponseError(\"The model returned no response\")"],
    ["helper return copy", "function getUnsupportedReason() { return \"Please try again\"; }"],
    ["single-word display helper", "function getStatusLabel() { return \"Ready\"; }"],
    ["user-facing thrown errors", "throw new Error(\"Could not open project file\")"],
  ]
) {
  test(`raw ${label} fails enforcement`, async () => {
    assert.ok((await lint(source)).some((message) => message.ruleId === "typr-i18n/ui-strings"));
  });
}

test("shared UI, utilities and editor sources are enforced too", async () => {
  for (
    const filename of [
      "packages/ui/src/fixture.tsx",
      "packages/utils/src/fixture.ts",
      "packages/tiptap/src/fixture.tsx",
    ]
  ) {
    assert.ok(
      (await lint("const options = [{ label: \"Untranslated option\" }]", filename)).some((message) =>
        message.ruleId === "typr-i18n/ui-strings"
      ),
    );
  }
});

test("macros, descriptors, technical attributes, tool prompts and product names pass", async () => {
  assert.deepEqual(
    await lint(`
    import { Trans, useLingui } from "@lingui/react/macro";
    import { msg } from "@lingui/core/macro";
    const options = [{ value: "private", label: msg\`Invited people\` }];
    const existingExplicitMessage = () => t({ message: "Already localized", id: "already-localized" });
    const command = "command_name";
    sonnerToast.dismiss("changelog-notification");
    const prompt = tool({ description: "A technical prompt for the AI model" });
    const View = () => {
      const { t } = useLingui();
      return <div className="text-sm" role="dialog" title={t\`Settings\`}><Trans>Save</Trans><p>Typr</p><input placeholder="sk-..." /></div>;
    };
  `),
    [],
  );
});

test("native DOM tag names are technical even in display-named variables", async () => {
  assert.deepEqual(
    await lint(`
    const label = document.createElement("span");
    const content = document.createElement("div");
  `),
    [],
  );
  assert.ok((await lint("const label = helper(\"Missing translation\")")).some(
    (message) => message.ruleId === "typr-i18n/ui-strings",
  ));
});

test("extraction fails closed for removed catalogs, missing shared roots and excluded source trees", () => {
  const directories = ["apps/desktop/src", "packages/ui/src", "packages/utils/src", "packages/tiptap/src"];
  const catalog = {
    config: { rootDir: repoRoot },
    include: directories.map((directory) => path.join(repoRoot, directory)),
  };
  const entries = Object.fromEntries(
    directories.map((directory) => [directory, { origin: [[`${directory}/fixture.tsx`, 1]] }]),
  );
  assert.doesNotThrow(() => assertSourceCoverage(repoRoot, [catalog], [entries]));
  assert.throws(() => assertSourceCoverage(repoRoot, []), /at least one catalog/);
  assert.throws(
    () =>
      assertSourceCoverage(repoRoot, [{
        ...catalog,
        exclude: [path.join(repoRoot, "apps/desktop/src/components/settings/**")],
      }]),
    /Production source exclusions/,
  );
  assert.throws(
    () => assertSourceCoverage(repoRoot, [{ ...catalog, include: catalog.include.slice(1) }]),
    /complete source root/,
  );
  assert.throws(() => assertSourceCoverage(repoRoot, [catalog], [{}]), /no messages/);
  const sharedRemoved = { ...entries };
  delete sharedRemoved["packages/ui/src"];
  assert.throws(() => assertSourceCoverage(repoRoot, [catalog], [sharedRemoved]), /no messages.*packages\/ui\/src/);
  assert.throws(() => assertSourceCoverage(repoRoot, [catalog, catalog], [entries, {}]), /empty catalog/);
});

const extracted = { greeting: { message: "Hello {name}", context: "" } };
const translated = {
  en: { greeting: { message: "Hello {name}", translation: "Hello {name}" } },
  es: { greeting: { message: "Hello {name}", translation: "Hola {name}" } },
};
test("explicit source IDs are valid messages too", () => {
  assert.deepEqual(
    validateCatalogs({ "Explicit {name}": {} }, {
      en: { "Explicit {name}": { translation: "Explicit {name}" } },
      es: { "Explicit {name}": { translation: "Explícito {name}" } },
    }),
    [],
  );
});

test("complete catalogs pass independent of key ordering", () => {
  assert.deepEqual(validateCatalogs(extracted, translated), []);
});
test("missing Spanish cannot fall back silently to English", () => {
  const catalogs = structuredClone(translated);
  catalogs.es.greeting.translation = "";
  assert.match(validateCatalogs(extracted, catalogs).join("\n"), /missing translation/);
});
test("fresh descriptor missing from catalogs fails", () => {
  assert.match(
    validateCatalogs({ ...extracted, fresh: { message: "Fresh static descriptor" } }, translated).join("\n"),
    /missing catalog entry/,
  );
});
test("changed source and obsolete active catalogs fail", () => {
  assert.match(validateCatalogs({ greeting: { message: "Changed {name}" } }, translated).join("\n"), /stale source/);
  assert.match(validateCatalogs({}, translated).join("\n"), /stale catalog entry/);
});
test("Spanish interpolation and rich text placeholders must match", () => {
  const catalogs = structuredClone(translated);
  catalogs.es.greeting.translation = "Hola {wrong}";
  assert.match(validateCatalogs(extracted, catalogs).join("\n"), /mismatched placeholders/);
  assert.deepEqual(placeholders("{count, plural, one {<0>{name}</0>} other {# items}}"), ["<0>", "count", "name"]);
});
test("invalid ICU fails rather than crashing or silently dropping variables", () => {
  const catalogs = structuredClone(translated);
  catalogs.es.greeting.translation = "Hola {name";
  assert.match(validateCatalogs(extracted, catalogs).join("\n"), /invalid ICU/);
});
test("ICU plural, select and nested choices require runtime fallback branches", () => {
  for (
    const message of [
      "{count, plural, one {One item}}",
      "{role, select, admin {Admin}}",
      "{position, selectordinal, one {First}}",
      "{count, plural, one {{role, select, admin {Admin}}} other {Other}}",
    ]
  ) {
    assert.throws(() => placeholders(message), /other branch/);
  }
  assert.doesNotThrow(() => placeholders("{count, plural, one {One item} other {# items}}"));
});

test("numeric rich-text components must have paired tags while named HTML examples remain valid", () => {
  for (const message of ["Hello <0>{name}</1>", "Hello <0>{name}</0></0>", "Hello <0>{name}"]) {
    assert.throws(() => placeholders(message), /component tag/);
  }
  assert.deepEqual(placeholders("<1>{name}</1> <0>Help</0> <2/>"), ["<0>", "<1>", "<2>", "name"]);
  assert.doesNotThrow(() => placeholders("Wrap the word in <strong> tags"));
  assert.throws(() => placeholders("{count, plural, one {<0>One item} other {Other items</0>}}"), /component tag/);
  assert.doesNotThrow(() => placeholders("<0>{count, plural, one {One item</0>} other {Other items</0>}}"));
});

test("compiled catalogs are parsed as data and cannot execute code", () => {
  assert.deepEqual(
    readCompiledMessages(
      "import type {Messages} from \"@lingui/core\"; export const messages = JSON.parse(\"{\\\"id\\\":[\\\"Hola\\\"]}\") as Messages;",
    ),
    { id: ["Hola"] },
  );
  assert.throws(
    () => readCompiledMessages("export const messages = (() => { throw new Error(\"executed\") })();"),
    /Expected Lingui/,
  );
});

test("staged snapshot ignores unstaged source and translations, preserves Git state and cleans up", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "typr-i18n-staging-test-"));
  const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" });
  let snapshotPath;
  try {
    git("init", "--quiet");
    await writeFile(path.join(root, "source.tsx"), "<p>Staged source</p>");
    await writeFile(path.join(root, "es.po"), "msgstr \"\"");
    await writeFile(path.join(root, "lingui.config.js"), "module.exports = { locales: [\"en\", \"es\"] }");
    git("add", ".");
    await writeFile(path.join(root, "source.tsx"), "<Trans>Unstaged fix</Trans>");
    await writeFile(path.join(root, "es.po"), "msgstr \"Unstaged Spanish fix\"");
    await writeFile(path.join(root, "lingui.config.js"), "module.exports = { locales: [\"en\"] }");
    const before = git("diff", "--cached");
    await withStagedSnapshot(root, async (snapshot) => {
      snapshotPath = snapshot;
      assert.match(await readFile(path.join(snapshot, "lingui.config.js"), "utf8"), /"es"/);
      assert.equal(await readFile(path.join(snapshot, "source.tsx"), "utf8"), "<p>Staged source</p>");
      assert.equal(await readFile(path.join(snapshot, "es.po"), "utf8"), "msgstr \"\"");
    });
    assert.equal(git("diff", "--cached"), before);
    assert.equal(await readFile(path.join(root, "es.po"), "utf8"), "msgstr \"Unstaged Spanish fix\"");
    await assert.rejects(readFile(path.join(snapshotPath, "es.po")), { code: "ENOENT" });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("real Lingui extraction includes app and shared descriptors, stays read-only, and rejects stale compiled catalogs", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "typr-i18n-catalog-test-"));
  const desktop = path.join(root, "apps/desktop");
  try {
    for (const dir of ["apps/desktop/src", "packages/ui/src", "packages/utils/src", "packages/tiptap/src"]) {
      await mkdir(path.join(root, dir), { recursive: true });
      await writeFile(
        path.join(root, dir, "fixture.tsx"),
        `import { msg } from "@lingui/core/macro"; export const label = msg\`Shared source ${dir}\`;`,
      );
    }
    await symlink(path.join(repoRoot, "apps/desktop/node_modules"), path.join(desktop, "node_modules"), "dir");
    const configPath = path.join(desktop, "lingui.config.js");
    await writeFile(
      configPath,
      `module.exports = {
      sourceLocale: "en", locales: ["en", "es"],
      catalogs: [{path: "<rootDir>/src/locales/{locale}/messages", include: ["<rootDir>/src", "<rootDir>/../../packages/ui/src", "<rootDir>/../../packages/utils/src", "<rootDir>/../../packages/tiptap/src"], exclude: ["**/locales/**"]}]
    }`,
    );
    const [catalog] = await getCatalogs(getConfig({ cwd: desktop, configPath }));
    const extracted = await catalog.collect();
    assert.equal(Object.keys(extracted).length, 4);
    const files = [];
    for (const locale of ["en", "es"]) {
      const entries = Object.fromEntries(
        Object.entries(extracted).map((
          [id, entry],
        ) => [id, { ...entry, translation: locale === "en" ? entry.message : `Traducido ${entry.message}` }]),
      );
      await catalog.write(locale, entries);
      const compiled = createCompiledCatalog(
        locale,
        Object.fromEntries(Object.entries(entries).map(([id, entry]) => [id, entry.translation])),
        { namespace: "ts", strict: true },
      );
      const filename = catalog.getFilename(locale).replace(/\.po$/, ".ts");
      await writeFile(filename, compiled.source);
      files.push(catalog.getFilename(locale), filename);
    }
    const before = await Promise.all(files.map((file) => readFile(file, "utf8")));
    await checkTranslations(root, { lint: false });
    assert.deepEqual(await Promise.all(files.map((file) => readFile(file, "utf8"))), before);
    await writeFile(files[3], before[3].replace("Traducido", "Stale"));
    await assert.rejects(checkTranslations(root, { lint: false }), /stale compiled catalog/);
    await writeFile(files[3], before[3]);
    // Exercise the real CLI subprocess through a symlink, not only the snapshot helper.
    await mkdir(path.join(desktop, "scripts"), { recursive: true });
    for (
      const filename of ["check-translations.mjs", "check-staged-translations.mjs", "localization-eslint.config.mjs"]
    ) {
      await writeFile(
        path.join(desktop, "scripts", filename),
        await readFile(path.join(repoRoot, "apps/desktop/scripts", filename)),
      );
    }
    await writeFile(path.join(desktop, "package.json"), "{}");
    const gitEnv = { ...process.env };
    delete gitEnv.GIT_INDEX_FILE;
    const git = (...args) => execFileSync("git", args, { cwd: root, env: gitEnv });
    git("init", "--quiet");
    git("add", ".");
    const aliasDirectory = await mkdtemp(path.join(tmpdir(), "typr-i18n-cli-alias-"));
    try {
      const alias = path.join(aliasDirectory, "repository with spaces");
      await symlink(root, alias, "dir");
      const runStaged = () =>
        spawnSync(process.execPath, [path.join(alias, "apps/desktop/scripts/check-staged-translations.mjs")], {
          cwd: root,
          env: gitEnv,
          encoding: "utf8",
        });
      const valid = runStaged();
      assert.equal(valid.status, 0, valid.stderr);
      assert.match(valid.stdout, /Translations: UI strings/);
      const incomplete = before[2].replace(/msgstr "Traducido[^"\n]+"/, "msgstr \"\"");
      assert.notEqual(incomplete, before[2]);
      await writeFile(files[2], incomplete);
      git("add", "apps/desktop/src/locales/es/messages.po");
      await writeFile(files[2], before[2]); // Unstaged complete Spanish cannot hide the staged omission.
      const invalid = runStaged();
      assert.notEqual(invalid.status, 0);
      assert.match(invalid.stderr, /missing translation/);
      git("add", "apps/desktop/src/locales/es/messages.po");
    } finally {
      await rm(aliasDirectory, { recursive: true, force: true });
    }
    const pluralSource = "{count, plural, one {# item} other {# items}}";
    await writeFile(
      path.join(desktop, "src/plural.ts"),
      `import { msg } from "@lingui/core/macro"; export const label = msg\`${pluralSource}\`;`,
    );
    const withPlural = await catalog.collect();
    for (const locale of ["en", "es"]) {
      const entries = Object.fromEntries(
        Object.entries(withPlural).map((
          [id, entry],
        ) => [id, {
          ...entry,
          translation: entry.message === pluralSource && locale === "es"
            ? "{count, plural, one {# elemento}}"
            : entry.message,
        }]),
      );
      await catalog.write(locale, entries);
      const compiled = createCompiledCatalog(
        locale,
        Object.fromEntries(Object.entries(entries).map(([id, entry]) => [id, entry.translation])),
        { namespace: "ts", strict: true },
      );
      assert.deepEqual(compiled.errors, []); // Lingui strict compilation alone permits the runtime bug.
      await writeFile(catalog.getFilename(locale).replace(/\.po$/, ".ts"), compiled.source);
    }
    await assert.rejects(checkTranslations(root, { lint: false }), /invalid ICU/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
