import { ProjectNotesEmptyIllustration } from "@/components/projects/project-empty-illustration";
import { Button } from "@typr/ui/components/ui/button";
import { Trans } from "@lingui/react/macro";

interface ProjectEmptyStateProps {
  onAddNotes: () => void;
}

export function ProjectEmptyState({ onAddNotes }: ProjectEmptyStateProps) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center text-center">
      <ProjectNotesEmptyIllustration />

      <h2 className="text-lg font-semibold tracking-tight text-foreground">
        <Trans>No notes here yet</Trans>
      </h2>
      <p className="mt-3 max-w-sm text-sm leading-6 text-muted-foreground">
        <Trans>Add related notes so this project is easy to reopen later.</Trans>
      </p>

      <Button type="button" variant="secondary" className="mt-6" onClick={onAddNotes}>
        <i className="ri-add-line mr-1 text-base" />
        <Trans>Add notes</Trans>
      </Button>
    </div>
  );
}
