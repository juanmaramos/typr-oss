import type { ProjectBriefView } from "@/components/projects/project-brief-panel";
import { Markdown } from "@/components/ui/markdown";
import { Badge } from "@typr/ui/components/ui/badge";
import { cn } from "@typr/ui/lib/utils";
import { Trans, useLingui } from "@lingui/react/macro";
import { type ReactNode, useMemo } from "react";

interface ProjectSummaryTabProps {
  brief: ProjectBriefView | null;
  sourceCount: number;
}

function formatBriefUpdatedAt(updatedAt: string) {
  const date = new Date(updatedAt);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function ProjectSummaryTab({ brief, sourceCount }: ProjectSummaryTabProps) {
  const { t } = useLingui();
  const sections = useMemo(
    () => (brief?.sections ?? []).filter(section => section.markdown.trim().length > 0),
    [brief?.sections],
  );
  const updatedAt = brief ? formatBriefUpdatedAt(brief.updatedAt) : null;
  const [leadSection, ...supportingSections] = sections;
  const sourceCountLabel = sourceCount === 1 ? t`${sourceCount} note` : t`${sourceCount} notes`;
  const briefSourceCountLabel = brief?.sourceCount === 1
    ? t`${brief.sourceCount} note`
    : t`${brief?.sourceCount ?? 0} notes`;

  if (sourceCount === 0) {
    return (
      <ProjectSummaryEmptyState
        title={<Trans>No summary yet</Trans>}
        description={<Trans>Add notes to this project before Typr builds a generated summary.</Trans>}
      />
    );
  }

  if (!brief || sections.length === 0) {
    return (
      <ProjectSummaryEmptyState
        title={<Trans>Summary not generated</Trans>}
        description={t`The generated summary will appear from ${sourceCountLabel} once the brief pipeline is connected.`}
      />
    );
  }

  return (
    <div className="h-full min-h-0 overflow-y-auto pb-6 pr-1">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-foreground">
              <Trans>Project summary</Trans>
            </h2>
            <Badge
              variant="outline"
              className={cn(
                "rounded-full border bg-muted/50 px-2 py-0.5 text-xs font-medium text-muted-foreground",
                brief.isStale && "border-warning/40 bg-warning/10 text-warning-foreground",
              )}
            >
              {brief.isStale ? <Trans>Needs refresh</Trans> : <Trans>Current</Trans>}
            </Badge>
          </div>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            <Trans>Latest understanding from {briefSourceCountLabel}</Trans>
            {updatedAt ? <Trans>· Updated {updatedAt}</Trans> : ""}.
          </p>
        </div>
      </div>

      {leadSection && (
        <section className="max-w-[68ch]">
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {leadSection.title}
          </h3>
          <Markdown className="prose prose-sm max-w-none text-[15px] leading-7 text-foreground prose-p:my-0 prose-strong:text-foreground">
            {leadSection.markdown}
          </Markdown>
        </section>
      )}

      {supportingSections.length > 0 && (
        <div className="mt-7 grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-x-8 gap-y-6">
          {supportingSections.map(section => (
            <section key={section.id} className="min-w-0">
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {section.title}
              </h3>
              <Markdown className="prose prose-sm max-w-none text-sm leading-6 text-foreground/90 prose-p:my-1 prose-ul:my-1.5 prose-li:my-0.5 prose-strong:text-foreground">
                {section.markdown}
              </Markdown>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function ProjectSummaryEmptyState({ title, description }: { title: ReactNode; description: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 justify-center px-10 pb-6 pt-6">
      <div className="mx-auto flex max-w-sm flex-col items-center justify-center text-center">
        <div className="mb-5 flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
          <i className="ri-sparkling-2-line text-xl" />
        </div>
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}
