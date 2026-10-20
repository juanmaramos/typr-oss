import lingui from "eslint-plugin-lingui";
import tseslint from "typescript-eslint";

// Lingui's rule otherwise treats internal routes, query keys and AI prompts as UI.
// Delegate its macro/Trans recognition and limit reports to display positions.
const displayNames = new Set([
  "title",
  "text",
  "description",
  "label",
  "placeholder",
  "tooltip",
  "alt",
  "aria-label",
  "aria-description",
  "aria-roledescription",
  "emptyMessage",
  "errorMessage",
  "loadingText",
  "buttonText",
  "cancelLabel",
  "confirmLabel",
  "content",
  "message",
]);
const nameOf = (node) => node?.name ?? node?.value;
const displayVariable = (name) =>
  !/(?:_KEY|_HREF|_URL)_PREFIX$/.test(name ?? "") && (displayNames.has(name)
    || /(?:label|title|description|message|placeholder|tooltip|text|prefix|summary|caption)$/i.test(name ?? ""));
const naturalLanguage = (node) => {
  const text = node.type === "TemplateLiteral"
    ? node.quasis.map((part) => part.value.cooked ?? "").join(" ")
    : String(node.value ?? "");
  return /[\p{L}]+\s+[\p{L}]+/u.test(text);
};
const displayPosition = (node) => {
  for (let current = node; current; current = current.parent) {
    if (current.type === "JSXAttribute") {
      return displayNames.has(nameOf(current.name));
    }
    if (current.type === "JSXExpressionContainer" && current.parent?.type === "JSXElement") {
      return true;
    }
    if (current.type === "JSXText") {
      return true;
    }
    if (current.type === "Property") {
      if (["loading", "success", "error"].includes(nameOf(current.key))) {
        const call = current.parent?.parent;
        if (
          call?.type === "CallExpression" && call.callee.type === "MemberExpression"
          && ["toast", "sonnerToast"].includes(call.callee.object.name) && call.callee.property.name === "promise"
        ) {
          return true;
        }
      }
      if (nameOf(current.key) === "content") {
        const role = current.parent.properties?.find((property) => nameOf(property.key) === "role")?.value;
        if (role?.value === "system" || role?.expression?.value === "system") {
          return false;
        }
        for (let owner = current.parent; owner; owner = owner.parent) {
          if (
            owner.type === "CallExpression"
            && ["generateObject", "generateText", "streamText"].includes(owner.callee.name)
          ) {
            return false;
          }
        }
      }
      return displayNames.has(nameOf(current.key));
    }
    if (current.type === "VariableDeclarator") {
      return displayVariable(nameOf(current.id));
    }
    if (current.type === "AssignmentExpression") {
      const name = current.left.type === "Identifier"
        ? current.left.name
        : current.left.type === "MemberExpression"
        ? nameOf(current.left.property)
        : undefined;
      return displayVariable(name);
    }
    if (current.type === "ReturnStatement") {
      if (naturalLanguage(node)) {
        return true;
      }
      let owner = current.parent;
      while (owner && !["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression"].includes(owner.type)) {
        owner = owner.parent;
      }
      const name = owner?.id?.name ?? owner?.parent?.id?.name ?? owner?.parent?.key?.name ?? "";
      return /(?:Label|Title|Summary|Description|Message|Reason|StatusText|Display|formatDate)/.test(name);
    }
    // Do not infer display intent from the variable holding an entire callback.
    if (["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression"].includes(current.type)) {
      return current.body === node && (naturalLanguage(node) || displayVariable(current.parent?.id?.name));
    }
    if (current.type === "NewExpression" && /Error$/.test(current.callee.name ?? "")) {
      return naturalLanguage(node);
    }
    if (current.type === "CallExpression") {
      const callee = current.callee;
      if (
        callee.type === "MemberExpression" && ["toast", "sonnerToast"].includes(callee.object.name)
        && ["dismiss", "getHistory", "getToasts"].includes(callee.property.name)
      ) {
        return false;
      }
      if (
        (callee.type === "Identifier" && ["alert", "confirm", "toast", "sonnerToast"].includes(callee.name))
        || (callee.type === "MemberExpression" && ["toast", "sonnerToast"].includes(callee.object.name))
      ) {
        return true;
      }
      // Native DOM tag names stay technical even when the element is named label/content.
      if (
        callee.type === "MemberExpression" && callee.object.name === "document"
        && callee.property.name === "createElement" && current.arguments[0] === node
      ) {
        return false;
      }
      // Technical selector strings and date-format tokens are not rendered copy.
      if (
        callee.type === "MemberExpression"
        && ["includes", "startsWith", "endsWith", "replace", "watch", "getAttribute"].includes(callee.property.name)
        && current.arguments.includes(node)
      ) {
        return false;
      }
      if (callee.type === "Identifier" && callee.name === "format") {
        let argument = node;
        while (argument.parent && argument.parent !== current) {
          argument = argument.parent;
        }
        if (current.arguments[1] === argument) {
          return false;
        }
      }
      // Zod's positional validation messages are displayed by forms too.
      if (callee.type === "MemberExpression") {
        const messageIndex = ["email", "url", "nonempty"].includes(callee.property.name)
          ? 0
          : ["min", "max", "length", "regex", "refine"].includes(callee.property.name)
          ? 1
          : -1;
        if (messageIndex >= 0 && current.arguments[messageIndex] === node) {
          return true;
        }
      }
      // A helper argument can still be rendered by an enclosing JSX expression.
    }
    if (current.type === "BinaryExpression" && current.operator !== "+") {
      return false;
    }
  }
  return false;
};
const originalRule = lingui.rules["no-unlocalized-strings"];
export const uiStringsRule = {
  ...originalRule,
  create(context) {
    const delegate = originalRule.create(
      new Proxy({}, {
        get(target, key) {
          if (key === "report") {
            return (report) => {
              if (displayPosition(report.node)) {
                context.report(report);
              }
            };
          }
          return Reflect.get(context, key);
        },
      }),
    );
    // Lingui allows native title attributes as technical DOM attributes.
    // Reuse its regular literal handling for these visible attributes too.
    const attributeVisitor = delegate["JSXAttribute :matches(Literal,TemplateLiteral)"];
    return {
      ...delegate,
      "JSXAttribute :matches(Literal,TemplateLiteral)"(node) {
        let attr = node.parent;
        while (attr && attr.type !== "JSXAttribute") {
          attr = attr.parent;
        }
        // Do not mark these visible attributes visited: Literal:exit must validate them.
        if (["title", "aria-description", "aria-roledescription"].includes(nameOf(attr?.name))) {
          return;
        }
        attributeVisitor(node);
      },
    };
  },
};

export const sourceGlobs = [
  "apps/desktop/src/**/*.{ts,tsx}",
  "packages/{ui,utils,tiptap}/src/**/*.{ts,tsx}",
];
export default [
  {
    ignores: ["**/node_modules/**", "**/locales/**", "**/*.test.{ts,tsx}", "**/*.spec.{ts,tsx}", "**/routeTree.gen.ts"],
  },
  {
    files: sourceGlobs,
    languageOptions: { parser: tseslint.parser, parserOptions: { ecmaFeatures: { jsx: true } } },
    plugins: { lingui, "typr-i18n": { rules: { "ui-strings": uiStringsRule } } },
    rules: {
      "typr-i18n/ui-strings": ["error", {
        // Product/provider names and technical examples do not change by locale.
        ignore: [
          "^ri-[a-z0-9-]+(?: [a-z0-9:-]+)*$",
          "^'?use[A-Z][A-Za-z]+'? (?:must|should) be used within .+$",
          "^(?:Typr|LinkedIn|Groq|Apple|Outlook|AssemblyAI|OpenAI|OpenRouter|Ollama|Whisper|Gemma|Llama|Claude|GPT|Deepgram|Anthropic|Google|Microsoft|Slack|Notion|GitHub|Obsidian|YouTube|Windows|macOS|Linux|AI|API|PDF|DOCX|HTML|Markdown|JSON|CSV|MP3|MP4|WAV|M4A|FLAC|AAC|OGG|WEBM|URL|HTTP|HTTPS|SDK|CPU|GPU|RAM|GB|MB|KB|Hz|kHz)$",
          "^(?:https?://|[a-z]+://|[\\w.-]+@[\\w.-]+\\.|\\.\\w+$)",
          "^(?:Ctrl|Cmd|Alt|Shift|Enter|Escape|Tab|Backspace|Delete|Space|F[0-9]+|⌘[⇧⌥⌃A-Z]+)$",
          "^(?:sk-|aai_)\\.\\.\\.$",
          "^(?:</?[a-z][^>]*>)+$",
          "^(?:speaker\\+|inline\\*)$",
          "^(?:group-|text-|bg-|data-)[a-z\\[\\].:-]+$",
        ],
        ignoreFunctions: [
          "tool",
          "console.*",
          "Sentry.addBreadcrumb",
          "addTelemetryBreadcrumb",
          "debugLogFor",
          "logChatSubmit",
          "templateCommands.render",
        ],
        ignoreNames: [
          "className",
          "class",
          "style",
          "id",
          "key",
          "type",
          "role",
          "variant",
          "size",
          "side",
          "align",
          "value",
          "name",
          "href",
          "src",
          "target",
          "rel",
          "data-testid",
          "data-state",
          "data-slot",
          "color",
          "width",
          "height",
          "viewBox",
          "d",
          "fill",
          "stroke",
          "as",
          "to",
          "htmlFor",
          "accept",
          "autoComplete",
          "inputMode",
          "method",
          "format",
          "icon",
          "shortcut",
          "keys",
        ],
      }],
      "lingui/no-trans-inside-trans": "error",
      "lingui/no-single-variables-to-translate": "error",
      "lingui/t-call-in-function": "error",
    },
  },
];
