import { Button } from "@typr/ui/components/ui/button";
import { Trans } from "@lingui/react/macro";

interface SpaceEmptyStateProps {
  onAddNotes: () => void;
}

export function SpaceEmptyState({ onAddNotes }: SpaceEmptyStateProps) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center text-center">
      <div className="relative mb-5 h-20 w-20">
        <div className="absolute left-3 top-4 h-14 w-10 rounded-2xl border border bg-background shadow-md" />
        <div className="absolute right-3 top-1 h-14 w-10 -rotate-[8deg] rounded-2xl border border bg-background shadow-md" />
      </div>

      <h2 className="text-[24px] font-semibold tracking-tight text-foreground">
        <Trans>No notes here yet</Trans>
      </h2>
      <p className="mt-3 max-w-sm text-sm leading-6 text-muted-foreground">
        <Trans>Add a few notes to start collecting the context you want to reopen from this project.</Trans>
      </p>

      <Button type="button" className="mt-6 rounded-full" onClick={onAddNotes}>
        <i className="ri-add-line mr-1 text-base" />
        <Trans>Add notes</Trans>
      </Button>
    </div>
  );
}
