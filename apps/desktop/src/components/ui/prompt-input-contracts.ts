export const promptInputClassNames = {
  root: "border-input bg-muted/50 cursor-text rounded-composer border p-2",
  editAura: "ai-edit-aura absolute -inset-[2px] rounded-floating-pill",
  projectInlineSurface: "rounded-composer border border-border/60 bg-background px-3 py-1.5 shadow-2xs",
  floatingInlineSurface: "rounded-composer border border-border/60 bg-background px-3.5 py-2.5 shadow-float-pill",
  floatingDockSurface: "border-0 rounded-floating-pill bg-sidebar px-4 py-2 shadow-float-pill",
  floatingShellSurface:
    "pointer-events-auto flex w-full overflow-hidden rounded-floating-pill bg-sidebar shadow-float-surface",
  floatingExpandedSurface: "max-w-none overflow-hidden rounded-floating-surface bg-sidebar shadow-float-dock",
} as const;

export const promptTextareaContracts = {
  sidebar: {
    minHeight: 44,
    className: "py-3 text-sm leading-5 placeholder:text-muted-foreground/70",
  },
  floatingInline: {
    minHeight: 36,
    className: "py-1.5 text-[15px] leading-6 placeholder:text-muted-foreground/70",
  },
  projectInline: {
    minHeight: 32,
    className: "py-1.5 text-sm leading-5 placeholder:text-muted-foreground/70",
  },
  floatingDock: {
    minHeight: 40,
    className: "py-[9px] text-[15px] leading-[22px] text-foreground placeholder:text-muted-foreground/70",
  },
} as const;
