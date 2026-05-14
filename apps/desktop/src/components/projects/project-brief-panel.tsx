import { Markdown } from "@/components/ui/markdown";
import { Badge } from "@typr/ui/components/ui/badge";
import { cn } from "@typr/ui/lib/utils";
import { Trans, useLingui } from "@lingui/react/macro";
import { useMemo } from "react";

export interface ProjectBriefSection {
  id: string;
  title: string;
  markdown: string;
}

export interface ProjectBriefView {
  sections: ProjectBriefSection[];
  sourceCount: number;
  updatedAt: string;
  isStale?: boolean;
}

interface ProjectBriefPanelProps {
  brief: ProjectBriefView | null;
  sourceCount: number;
}

export function ProjectBriefPanel({ brief, sourceCount }: ProjectBriefPanelProps) {
  const { t } = useLingui();
  const hasSources = sourceCount > 0;

  const sections = useMemo(
    () => (brief?.sections ?? []).filter(section => section.markdown.trim().length > 0),
    [brief?.sections],
  );

  if (!hasSources) {
    return null;
  }

  const leadSection = sections[0];
  const sourceCountLabel = sourceCount === 1 ? t`${sourceCount} note` : t`${sourceCount} notes`;
  const briefSourceCountLabel = brief?.sourceCount === 1
    ? t`${brief.sourceCount} note`
    : t`${brief?.sourceCount ?? 0} notes`;

  return (
    <section className="shrink-0 pb-4 pt-2">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 max-w-[640px]">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-foreground">
              <Trans>Project summary</Trans>
            </h2>
            <Badge
              variant="outline"
              className={cn(
                "rounded-full border bg-muted/50 px-2 py-0.5 text-xs font-medium text-muted-foreground",
                brief?.isStale && "border-warning/40 bg-warning/10 text-warning-foreground",
              )}
            >
              {brief
                ? (brief.isStale ? <Trans>Needs refresh</Trans> : <Trans>Current</Trans>)
                : <Trans>Not generated</Trans>}
            </Badge>
          </div>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            {brief
              ? <Trans>Latest understanding from {briefSourceCountLabel}.</Trans>
              : <Trans>Latest understanding will appear from {sourceCountLabel}.</Trans>}
          </p>
        </div>
      </div>

      {!brief && (
        <p className="mt-2 max-w-[600px] text-sm leading-6 text-muted-foreground/80">
          <Trans>
            The generated brief will summarize the current state, decisions, open questions, and follow-ups from this
            project's notes.
          </Trans>
        </p>
      )}

      {brief && leadSection && (
        <section className="mt-3 max-w-[640px]">
          <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {leadSection.title}
          </h3>
          <Markdown className="prose prose-sm max-h-12 max-w-none overflow-hidden text-sm leading-6 text-foreground prose-p:my-0 prose-strong:text-foreground">
            {leadSection.markdown}
          </Markdown>
        </section>
      )}
    </section>
  );
}
