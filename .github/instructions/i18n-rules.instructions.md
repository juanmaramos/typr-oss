---
applyTo: "**/*.tsx,**/*.ts"
---

# i18n Rules (Lingui v5)

Every user-visible string must be translatable. No exceptions.

## Imports

```tsx
import { Trans, useLingui } from "@lingui/react/macro";
```

## JSX text

Wrap in `<Trans>`:
```tsx
<p><Trans>No notes found</Trans></p>
```

## Attributes and props (placeholder, aria-label, title)

Use `` t`...` `` from `useLingui()`:
```tsx
const { t } = useLingui();
<input placeholder={t`Search notes...`} />
<div aria-label={t`Speaker rename scope`}>
```

## CRITICAL: `t` is scoped per component

Every component that uses `t` must call `const { t } = useLingui()` at the top of its own body. `t` does NOT inherit from parent components.

```tsx
// BAD — crashes at runtime: "Can't find variable: t"
const MemoizedChild = memo(() => {
  return <div aria-label={t`Label`}>...</div>
})

// GOOD
const MemoizedChild = memo(() => {
  const { t } = useLingui()
  return <div aria-label={t`Label`}>...</div>
})
```

This applies to: `memo()` components, components defined in the same file as their parent, callback-heavy components with attribute strings.

## After adding/changing strings

```bash
pnpm -F desktop lingui:extract
pnpm -F desktop lingui:compile --typescript
```
