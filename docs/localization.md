# Desktop localization

The desktop app and shared `@typr/ui`, `@typr/utils` and `@typr/tiptap` source use Lingui. English is the source language; Spanish translations and both compiled catalogs are committed together with source changes.

Use `<Trans>` for JSX text. Use `t` from `useLingui()` in each component for attributes, tooltips, dialog/toast text and dynamic copy. For static display metadata, use `msg` descriptors and resolve them at render time so changing the locale refreshes their labels. Helpers outside React use extracted `i18n._(...)` messages. A macro `useLingui` call must be destructured; use the runtime hook from `@lingui/react` when only subscribing to locale changes.

After changing copy:

```sh
pnpm -F @typr/desktop lingui:extract --clean
# Translate new entries in apps/desktop/src/locales/es/messages.po.
pnpm -F @typr/desktop lingui:compile
pnpm i18n:check
pnpm test:i18n
```

`i18n:check` is read-only. It runs focused ESLint rules over the app and shared sources, asks Lingui to collect source messages without rewriting PO files, and compares catalog contents semantically. It rejects missing/stale active source entries, empty Spanish translations, invalid ICU messages or missing choice fallbacks, interpolation/rich-text placeholder mismatches and malformed numeric component tags, and missing/stale compiled messages. It rejects production-source exclusion patterns. It also fails closed if catalogs are removed, an owned source directory is omitted, or extraction returns no messages from any required source tree. Reference locations and PO ordering do not affect the result.

The ESLint rule reuses Lingui's macro/`Trans` detection and checks display positions: JSX text, visible/accessibility attributes, display metadata such as `label`, `title`, `description`, `content` and `message`, toast/dialog calls, natural-language helper return values, named display helpers, app-owned natural-language `Error` messages, nested JSX helper fallbacks, named display variables and positional form-validation messages. Internal command names, query keys, CSS, type strings, model prompts, real user content and canonical provenance data are not UI translations. The configuration documents narrow exceptions for exact product/provider names, keyboard key names, URL/file examples, API-key examples, empty HTML/editor schema and technical tool/telemetry calls, model-generation prompt contexts, date-format token arguments, selector/method keys, toast dismissal IDs, storage-key prefixes, and exact missing React provider invariants. If a string at a display position is truly canonical data, an adjacent `eslint-disable-next-line typr-i18n/ui-strings` must explain why; unused suppression comments fail. Do not exempt a whole UI file. New rendering helpers should use these display field names, or extend the small rule and its tests to cover a new display boundary. Static linting does not infer arbitrary data flow or translate native/backend error payloads automatically.

## Commit and CI enforcement

The Husky pre-commit hook runs `pnpm i18n:check:staged`. It materializes the Git index in a temporary directory, reuses installed dependencies read-only, checks that snapshot, and removes it. Unstaged Spanish/catalog fixes cannot make untranslated staged code pass. The working tree and index remain unchanged. Run `pnpm prepare` after an install that skipped lifecycle scripts to enable local hooks.

Local Git hooks can be disabled or bypassed (`--no-verify`), so they cannot guarantee that every possible commit is translated. The GitHub Actions **Translations** job is the shared enforcement point. It runs the same check and its regression suite on every push, pull request and merge queue, with no path filters or secrets. Main's branch protection/ruleset must require the **Translations** status check and prohibit bypass for the merge policy to enforce it. Review still verifies translation quality and dynamically generated/native copy; a nonempty catalog check cannot judge language quality.
