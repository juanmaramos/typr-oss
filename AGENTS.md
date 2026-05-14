# AI Rules

## FRONTEND

### Guidelines for React

#### REACT_CODING_STANDARDS

- Use functional components with hooks instead of class components.
- Implement `React.memo()` for components that are meaningfully expensive and render often with the same props.
- Use `useCallback` for event handlers passed to memoized children or dependency-sensitive hooks.
- Prefer `useMemo` for expensive derived values to avoid unnecessary recomputation.
- Implement `useId()` for accessibility attributes and label/input relationships.
- Use `React.lazy()` and `Suspense` for meaningfully heavy panels or components when code-splitting improves load cost.
- Use `useTransition` for non-urgent state updates when it helps keep the UI responsive.
- This repo is on React 18. Do not introduce React 19-only hooks such as `use` or `useOptimistic`.
- Do not introduce Server Components in this project.

#### ROUTING

- This repo uses TanStack Router with a file-based route tree under `apps/desktop/src/routes/`.
- Do not introduce React Router APIs such as `createBrowserRouter`, route `loader`/`action`, or hooks from `react-router`.
- Use the existing TanStack Router APIs and route conventions already present in the app.
- Prefer the existing lazy-loading patterns used by the route tree when splitting route code.

#### STATE MANAGEMENT

- Use React Query for server state and asynchronous backend data.
- Use Zustand for client state and UI state.
- Create separate stores for distinct state domains instead of one large store.
- Use TypeScript with strict typing for store state, actions, and selectors.
- Prefer selectors to avoid unnecessary rerenders.
- Prefer `useShallow` when selecting object or array slices.
- Use the repo's existing `mutative`-based immutable update patterns for complex nested updates.
- Use middleware deliberately:
  - `persist` for durable local UI preferences
  - `subscribeWithSelector` for external subscriptions
  - `devtools` when it materially improves development debugging
- Create custom hooks when they make store access or business logic clearer.
- Do not put server data in Zustand stores.

#### DESKTOP SERVICE BOUNDARIES

- For file-system-adjacent, privacy-sensitive, CPU-heavy, or canonical-data-producing work, prefer a Tauri/Rust service boundary over browser-only React utilities.
- React should orchestrate user actions, query/mutation state, and rendering; it should not own durable extraction, indexing, local-file parsing, or canonical memory generation side effects.
- Examples that should default to Rust/Tauri commands or plugins: PDF/DOCX extraction, OCR, file indexing, filesystem crawling, background retries, native integrations, and anything that feeds Project brief, Ask context, or future canonical memory.
- Keep persistence writes and source provenance close to the backend operation that produced them when practical, or expose a narrow command that returns typed extraction output for the existing DB layer to persist.
- Use browser/JS libraries for these services only when there is a clear product reason, the work is small and non-canonical, or the Rust/native option creates disproportionate packaging risk. Document that tradeoff before implementing.
- Avoid native system binaries or external services unless the product explicitly accepts install, packaging, privacy, and offline-mode implications.

#### ASSEMBLYAI

- Before writing AssemblyAI code, read https://www.assemblyai.com/docs/agent-instructions.md and https://www.assemblyai.com/docs/llms.txt. The API has changed; do not rely on memorized parameter names.

#### UI EMPTY STATES

- Empty-state illustrations should be CSS-only React markup unless a real product/media asset is required.
- Use existing design tokens for all color, border, background, shadow, radius, and typography choices. Do not hardcode hex/rgb colors or one-off shadows.
- Match the illustration metaphor to the empty state: folders/projects for project lists, notes/documents for empty note/source lists, search/list states for no results.
- Keep illustrations quiet and functional: one small scene, muted contrast, no stock-like art, no decorative gradients unrelated to the product.
- Use existing `@typr/ui` components for CTAs and controls. Do not add custom pill button radii or bespoke button styles unless the design system already defines that variant.

#### INTERNATIONALIZATION

- All new or changed user-facing strings in the desktop app must use the repo's Lingui approach:
  - JSX text uses `<Trans>...</Trans>` from `@lingui/react/macro`.
  - Attribute strings, placeholders, toast titles/content, dialog messages, tooltips, aria labels, and dynamic strings use `t` from `useLingui()`.
  - Non-component helpers use the existing Lingui `i18n._(...)` pattern only when hooks are not available.
- Do not leave raw English UI copy in components, routes, sonner/toast calls, onboarding flows, dialogs, tooltips, or accessibility labels unless it is a brand name, file extension, URL/example value, log/debug string, analytics event name, or other non-user-facing technical token.
- When adding or changing user-facing copy, run `pnpm -F @typr/desktop lingui:extract` and `pnpm -F @typr/desktop lingui:compile`, update both `en` and `es` catalogs, and confirm the extraction output does not introduce missing Spanish translations.
- Before finishing frontend work, search the touched files for raw strings in user-facing positions (`title`, `content`, `label`, `placeholder`, `aria-label`, `tooltip`, visible JSX text) and convert any misses to Lingui.

## Always ask yourself before implementing code

- Is this a hack?
- Would a senior engineer on this codebase accept this as production code?
