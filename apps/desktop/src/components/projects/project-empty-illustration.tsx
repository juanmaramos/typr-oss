export function ProjectEmptyIllustration() {
  return (
    <div
      aria-hidden="true"
      className="relative mb-6 h-44 w-64 overflow-hidden rounded-2xl border border-border/70 bg-background shadow-sm"
    >
      <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-br from-primary/20 via-primary/10 to-muted" />
      <div className="absolute left-1/2 top-8 w-48 -translate-x-1/2 rounded-xl border border-border/70 bg-background/90 p-3 shadow-sm backdrop-blur-sm">
        <div className="mb-3 flex h-7 items-center gap-2 rounded-lg border border-border/60 bg-muted/40 px-2">
          <span className="size-1.5 rounded-full bg-muted-foreground/20" />
          <span className="h-1.5 w-20 rounded-full bg-muted-foreground/15" />
          <span className="ml-auto h-1.5 w-8 rounded-full bg-muted-foreground/10" />
        </div>

        <div className="space-y-2.5">
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-md bg-primary/10 text-primary">
              <i className="ri-folder-3-line text-sm" />
            </span>
            <span className="h-1.5 w-20 rounded-full bg-muted-foreground/15" />
            <span className="h-1.5 w-7 rounded-full bg-muted-foreground/10" />
          </div>
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-md bg-muted text-muted-foreground">
              <i className="ri-article-line text-sm" />
            </span>
            <span className="h-1.5 w-24 rounded-full bg-muted-foreground/15" />
            <span className="h-1.5 w-5 rounded-full bg-muted-foreground/10" />
          </div>
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-background via-background/90 to-transparent" />
    </div>
  );
}

export function ProjectNotesEmptyIllustration() {
  return (
    <div
      aria-hidden="true"
      className="relative mb-6 h-44 w-64 overflow-hidden rounded-2xl border border-border/80 bg-muted/20 shadow-sm"
    >
      <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-br from-primary/15 via-muted/70 to-background" />

      <div className="absolute left-1/2 top-7 w-40 -translate-x-1/2 rounded-xl border border-border/80 bg-background/95 p-3 shadow-sm backdrop-blur-sm">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <i className="ri-article-line text-base" />
          </div>
          <div className="flex flex-1 flex-col gap-1.5 pt-1">
            <span className="h-1.5 w-full rounded-full bg-muted-foreground/25" />
            <span className="h-1.5 w-14 rounded-full bg-muted-foreground/20" />
          </div>
        </div>

        <div className="space-y-2">
          <span className="block h-1.5 w-full rounded-full bg-muted-foreground/25" />
          <span className="block h-1.5 w-32 rounded-full bg-muted-foreground/20" />
          <span className="block h-1.5 w-36 rounded-full bg-muted-foreground/20" />
        </div>

        <div className="mt-4 flex items-center gap-2 rounded-lg bg-muted/50 px-2 py-1.5">
          <span className="flex size-5 items-center justify-center rounded-md bg-background text-muted-foreground">
            <i className="ri-mic-line text-xs" />
          </span>
          <span className="h-1.5 w-16 rounded-full bg-muted-foreground/25" />
        </div>
      </div>

      <div className="absolute bottom-9 left-1/2 h-6 w-24 -translate-x-1/2 rounded-full bg-muted/70 blur-md" />
      <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-background via-background/90 to-transparent" />
    </div>
  );
}
