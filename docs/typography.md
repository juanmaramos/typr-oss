# Shared typography

Desktop and `@typr/ui` consume the typography theme in
`packages/ui/src/lib/typography.ts` through the shared Tailwind preset. The existing
`typography-h1` through `typography-h4`, `typography-title`, and body/content classes
in `packages/ui/src/styles/globals.css` remain the shared heading/content styles.
Use the standard Tailwind type scale for normal UI text, and the compact UI scale
below when its existing size is needed. Do not add component-local pixel sizes.

| Utility | Font size | Existing uses |
| --- | --- | --- |
| `text-ui-micro` | 8px | Responsive rating metadata |
| `text-ui-fine` | 9px | Model capability metadata |
| `text-ui-tiny` | 10px | Keyboard hints, counts, small metadata |
| `text-ui-caption` | 11px | Captions, sidebar metadata, badges |
| `text-ui-label` | 12px | Compact labels |
| `text-ui` | 13px | Sidebar items and compact controls |
| `text-ui-control` | 14px | Font preview controls |
| `text-ui-body` | 15px | Prompt input and project body text |
| `text-ui-heading` | 16px | Font preview close control |
| `text-ui-title` | 17px | Floating chat empty-state title |
| `text-ui-section` | 24px | Space empty-state title |
| `text-ui-page` | 32px | Project title input |

These compact utilities intentionally set **only font size**. They preserve the
previous inherited line height; replacing them with `text-xs` or `text-sm` would
also apply Tailwind's default line height and can change control/row heights. Use
`leading-*` explicitly where needed. `leading-ui-composer` preserves the floating
composer's 22px line height; `tracking-ui-eyebrow` preserves the project eyebrow's
0.14em tracking. Standard responsive, important, and slash line-height modifiers
work as usual.

The shared preset also owns font families and the existing weight discipline
(normal/medium 400, semibold 500, bold 600). The font preview utility keeps dynamic
font-family selection while using the shared fixed text sizes and weights. Its
system-font controls use `font-system`. The unused `TypographyProvider` is not
mounted by this change, so fonts do not change.

Both desktop `cn` and shared UI `cn` use the same Tailwind merger. Custom UI font
sizes are registered as sizes, so they override `text-sm` without dropping a text
color; shared family, line-height, and tracking utilities likewise merge correctly.

Icon glyph `font-size` controls geometry and remains separate. PDF export metrics
belong to document layout and are also unchanged. The only intentional appearance
change is the floating chat header title: it now uses `text-sm`, matching chat
message text, while keeping its original weight and tight line height.

Verification: `pnpm -F @typr/desktop test` includes CSS contract tests comparing
the compact utilities with the previous arbitrary sizes, checks for inherited line
height, and tests shared/desktop class-merging and modifiers. Run the desktop build
to verify TypeScript and the production Tailwind stylesheet.
