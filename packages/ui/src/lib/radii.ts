/** Shape roles shared by CSS utilities, native-style React markup and class merging. */
export const radii = {
  compact: "var(--radius-compact)",
  control: "var(--radius-control)",
  surface: "var(--radius-surface)",
  composer: "var(--radius-composer)",
  floating: "var(--radius-floating)",
  pill: "var(--radius-pill)",
} as const;

export type RadiusRole = keyof typeof radii;

/** Conventional shadcn/Tailwind names resolve to roles, without additional sizes. */
export const radiusScale = {
  ...radii,
  none: "0",
  DEFAULT: radii.compact,
  xs: radii.compact,
  sm: radii.compact,
  md: radii.control,
  lg: radii.surface,
  xl: radii.surface,
  "2xl": radii.surface,
  "3xl": radii.composer,
  full: radii.pill,
} as const;
