/** One icon-width between groups; shared spacing keeps floating Chat and Transcript aligned. */
export const floatingToolbarClassNames = {
  header: "flex flex-nowrap items-center gap-3 border-b border-border/60 bg-muted/25 px-5 py-2.5",
  actions: "ml-auto flex shrink-0 flex-nowrap items-center gap-7",
  compactActions: "gap-4",
  group: "flex shrink-0 flex-nowrap items-center gap-2",
} as const;
