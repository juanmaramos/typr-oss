---
applyTo: "apps/desktop/src/**"
---

# React Patterns for Typr Desktop

## Data Fetching

Always use React Query. Never call Tauri commands directly in render.

```tsx
import { commands as dbCommands } from "@typr/plugin-db";

const { data } = useQuery({
  queryKey: ["sessions", sessionId],
  queryFn: () => dbCommands.getSession(sessionId),
});
```

## State Management

- **Server state**: React Query (`useQuery`, `useMutation`, `useQueryClient`)
- **Client state**: Zustand stores in `src/stores/`
- **Layout state**: `useLayout()` context from `src/contexts/layout.tsx`
- **Never mix**: Don't put server data in Zustand stores

## Component Imports

```tsx
// UI components (Radix + shadcn)
import { Button } from "@typr/ui/components/ui/button";

// Icons
import { FileTextIcon } from "lucide-react";    // Lucide
import { cn } from "@typr/ui/lib/utils";         // className merging
```

## Keyboard Shortcuts

- Define in `src/data/shortcuts.ts` with `id`, `macKey`, `windowsKey`
- Register with `useHotkeys("mod+key", handler, { enableOnFormTags: true, enableOnContentEditable: true })`
- Display with `<ShortcutById shortcutId="my-shortcut" />`
- Never hardcode key symbols like `⌘` or `Ctrl` in JSX

## Routing

TanStack Router with file-based routes at `src/routes/`.

```tsx
import { useNavigate, useMatch } from "@tanstack/react-router";

const match = useMatch({ from: "/app/note/$id", shouldThrow: false });
const sessionId = match?.params.id;
```

## Animations

Use `motion/react` (Framer Motion):
```tsx
import { motion } from "motion/react";
```

## useEffect Rules

Only use `useEffect` to synchronize with external systems (third-party libraries, imperative DOM APIs with cleanup, Tauri event listeners with `unlisten`). Do not use it for:

- **Derived state** — compute inline or use `useMemo`
- **Event-triggered side effects** (toasts, navigation, analytics) — put them in the event handler directly
- **State that resets when a prop changes** — use a `key` prop on the child instead
- **Fetching data** — use React Query (`useQuery`)
- **Notifying a parent** — call the callback in the event handler alongside `setState`

Legitimate uses: Tauri event listeners, `ResizeObserver`/`IntersectionObserver` on a ref, imperative panel library handles (e.g. `react-resizable-panels`), animation setup on mount.
