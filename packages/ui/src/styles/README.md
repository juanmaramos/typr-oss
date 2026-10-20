# Typr Design System

This folder contains the core styling for the Typr application.

## Style Architecture

We follow a simplified approach based on shadcn/ui conventions:

### Key Files

- `global.css` - Main entry point with all core styles and design tokens
- `fonts.css` - Font face definitions
- `animations.css` - Animation keyframes and transition utilities

### Design Token Convention

Our design tokens follow the shadcn/ui naming convention:

```css
--{category}-{variant}-{property}-{state}
```

For example:
- `--primary` - Primary brand color
- `--primary-foreground` - Text color on primary backgrounds
- `--hover-accent-color` - Special color for hover states

### Usage

1. **Import in Components**:
   ```tsx
   import '@/styles/global.css';
   ```

2. **Tailwind Classes**:
   We use Tailwind utility classes combined with our custom components layer:
   ```tsx
   <button className="btn-primary">Click Me</button>
   ```

3. **CSS Variables**:
   Access design tokens via CSS variables:
   ```css
   .my-element {
     color: hsl(var(--primary));
   }
   ```

## Component Styling

Component styles are organized in the `@layer components` section of global.css.

### Key Component Classes
- `.btn`, `.btn-primary`, `.btn-secondary`, `.btn-outline` 
- `.card`, `.card-header`, `.card-content`
- `.input`
- `.selection-card` - For selectable card UI elements

### Component States
We use state modifier classes that can be applied to any component:
- `.is-active` - For hover/focus states
- `.is-selected` - For selected items (like the model cards in the transcription UI)
- `.is-disabled` - For disabled elements
- `.is-loading` - For loading states

### Form Components
- `.form-group` - Container for form elements
- `.form-label` - Form labels
- `.form-hint` - Helper text
- `.form-error` - Error messages

### Indicators (like in the transcription UI)
- `.accuracy-indicator` - Green dots
- `.speed-indicator` - Blue dots

## Utility Classes

We provide custom utilities in the `@layer utilities` section of global.css:

- Typography: `.typography-h1`, `.typography-p`, etc.
- Truncation: `.truncate-1`, `.truncate-2`, `.truncate-3`
- Scrollbars: `.scrollbar-none`, `.scrollbar-thin`
- Backgrounds: `.bg-grid`, `.bg-dots`
- Hover effects: `.hover-bg-ring`, `.hover-border-ring`, etc.
- Responsive: `.sm-only:hidden`, `.md-up:hidden`, `.sm-only:flex`, etc.
- File UI: `.file-size`, `.finder-button`

## Dark Mode

Dark mode is implemented via the `.dark` class applied to a parent element, usually:

```tsx
<html className={theme === 'dark' ? 'dark' : ''}>
```

## Best Practices

1. Use design tokens instead of hard-coded values
2. Prefer component classes over custom styles
3. Use the typography utilities for consistent text styling
4. Follow the established naming conventions
5. Use state classes (`.is-active`, `.is-selected`) for interactive elements
6. Leverage responsive utilities for mobile-first development
7. Standardize transitions with CSS variables (e.g., `transition-duration: var(--transition-base)`)

## UI Patterns Examples

### Selection Cards (as shown in the Transcription UI)

```html
<div class="selection-card is-selected">
  <h3 class="text-lg font-medium">Tiny</h3>
  
  <div class="flex items-center gap-4 mt-2">
    <div class="flex items-center gap-2">
      <span class="text-sm">Accuracy</span>
      <div class="accuracy-indicator">
        <div class="dot"></div>
        <div class="dot empty"></div>
        <div class="dot empty"></div>
      </div>
    </div>
    
    <div class="flex items-center gap-2">
      <span class="text-sm">Speed</span>
      <div class="speed-indicator">
        <div class="dot"></div>
        <div class="dot"></div>
        <div class="dot"></div>
      </div>
    </div>
  </div>
  
  <div class="mt-4">
    <button class="finder-button">
      <span>Show in Finder</span>
    </button>
  </div>
</div>
```
## Corner radius roles

Use the shared `--radius` base (currently `0.5rem`) to tune the entire shape system, following shadcn's base-token pattern. Shape does not change between light and dark themes.

| Role | Default | Use |
| --- | --- | --- |
| `rounded-compact` | 4px | Checkboxes, menu items, search highlights |
| `rounded-control` | 8px | Buttons, inputs, selects, small interactive controls |
| `rounded-surface` | 12px | Cards, dialogs, menus, popovers, segmented-control containers |
| `rounded-composer` | 24px | Prompt composers |
| `rounded-floating` | 32px | Floating assistant shells and docks |
| `rounded-pill` / `rounded-full` | Fully rounded | Avatars, indicators, circular actions and capsules |

Values are defined once in `globals.css`. `lib/radii.ts` exposes their CSS references to Tailwind and React styles; the desktop app inherits the shared preset without another radius map. Conventional names remain aliases: `sm`/`xs` → compact, `md` → control, `lg`/`xl`/`2xl` → surface, `3xl` → composer. They introduce no extra sizes. Prefer role names in new code.

Shared primitives own their radius. Do not add numeric radius overrides at call sites. Preserve intentional joined edges with directional utilities such as `rounded-l-none`; use `inherit` or a calculated inset from a role for nested decorative borders. Motion capsules use the pill role while their dimensions animate. The shared `cn` merger recognizes every role, including directional and responsive forms.
