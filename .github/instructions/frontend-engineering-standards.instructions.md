---
applyTo: "apps/desktop/src/**/*.tsx,apps/desktop/src/**/*.ts,packages/ui/src/**/*.tsx,packages/ui/src/**/*.ts,packages/tiptap/src/**/*.tsx,packages/tiptap/src/**/*.ts,packages/utils/src/**/*.tsx,packages/utils/src/**/*.ts"
---

# Frontend Engineering Standards

Before implementing code, check two things:

- Is this a hack?
- Would a senior engineer on this codebase accept this as production code?

## React Component Standards

- Use functional components with hooks. Do not introduce class components.
- Prefer focused components with a single clear responsibility.
- Use `React.memo()` for components that are meaningfully expensive and receive stable props.
- Use `useCallback` for handlers passed to memoized children or dependency-sensitive hooks.
- Use `useMemo` for expensive derived values. Do not wrap trivial expressions.
- Use `useId()` for accessibility relationships such as label/input pairing and ARIA attributes.
- Use `React.lazy()` and `Suspense` for meaningfully heavy routes or panels when it improves initial load or interaction cost.
- Use `useTransition` for non-urgent updates when it keeps typing or interaction responsive.

## Current Stack Constraints

- This repo is on React 18 with Vite/Tauri. Do not introduce React 19-only hooks such as `use` or `useOptimistic`.
- Do not introduce Server Components in this project.
- This repo uses TanStack Router. Do not introduce React Router APIs such as `createBrowserRouter`, route `loader`/`action`, or `useNavigate` from `react-router`.
- Follow the existing route conventions under `apps/desktop/src/routes/`.

## Zustand Standards

- Keep stores scoped by domain. Do not grow a catch-all global store.
- Type store state, actions, and selectors explicitly.
- Prefer selectors over subscribing components to entire stores.
- Use `useShallow` when selecting object or array slices that would otherwise cause avoidable rerenders.
- Keep server state in React Query, not Zustand.
- For nested immutable updates, prefer the repo's existing `mutative` and store helper patterns over ad hoc mutation.
- Use middleware deliberately:
  - `persist` for durable user preferences or local UI state
  - `subscribeWithSelector` for external subscriptions
  - `devtools` when it materially improves development debugging
- Expose focused custom hooks when they make store access or business logic clearer.

## Quality Bar

- Match existing repo patterns before introducing a new abstraction.
- Avoid duplicate state, effect-driven control flow, and incidental complexity when direct data flow is available.
- Prefer conservative, production-grade implementations over clever shortcuts.
