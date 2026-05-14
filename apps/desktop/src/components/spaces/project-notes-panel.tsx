import { Badge } from "@typr/ui/components/ui/badge";
import { Button } from "@typr/ui/components/ui/button";
import { Card, CardContent } from "@typr/ui/components/ui/card";
import { cn } from "@typr/ui/lib/utils";
import { Trans } from "@lingui/react/macro";
import type { ReactNode } from "react";

interface ProjectNotesPanelProps {
  children: ReactNode;
  count: number;
  onAddNotes: () => void;
}

export function ProjectNotesPanel({ children, count, onAddNotes }: ProjectNotesPanelProps) {
  const hasNotes = count > 0;

  return (
    <Card className="min-h-0 flex-1 rounded-[24px] border bg-background shadow-sm">
      <CardContent className="flex h-full min-h-0 flex-col p-0">
        <div className="flex items-center justify-between gap-4 border-b border/50 px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="text-sm font-semibold text-foreground">
              <Trans>Notes</Trans>
            </div>
            <Badge
              variant="outline"
              className="rounded-full border bg-muted/50 px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
            >
              {count}
            </Badge>
          </div>

          {hasNotes && (
            <Button type="button" size="sm" className="rounded-full" onClick={onAddNotes}>
              <i className="ri-add-line mr-1 text-base" />
              <Trans>Add notes</Trans>
            </Button>
          )}
        </div>

        <div
          className={cn(
            "min-h-0 flex-1",
            hasNotes ? "px-6 py-5" : "flex items-center justify-center px-10 py-10",
          )}
        >
          {children}
        </div>
      </CardContent>
    </Card>
  );
}
