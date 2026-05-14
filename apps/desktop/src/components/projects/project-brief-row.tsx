import { ProjectBriefBuildingStatus } from "@/components/projects/project-brief-building-status";
import type { ProjectBriefView } from "@/components/projects/project-brief-panel";
import { useRightPanel } from "@/contexts";
import { Badge } from "@typr/ui/components/ui/badge";
import { Button } from "@typr/ui/components/ui/button";
import { Skeleton } from "@typr/ui/components/ui/skeleton";
import { Trans, useLingui } from "@lingui/react/macro";

const PROJECT_BRIEF_ROW_PREVIEW_MAX_CHARS = 240;

interface ProjectBriefRowProps {
  brief: ProjectBriefView | null;
  buildingLabel?: string;
  isBuilding?: boolean;
  onRefresh?: () => void;
  sourceCount: number;
  status?: string | null;
}

export function ProjectBriefRow({
  brief,
  buildingLabel,
  isBuilding = false,
  onRefresh,
  sourceCount,
  status,
}: ProjectBriefRowProps) {
  const { t } = useLingui();
  const { showSidebar } = useRightPanel();
  const translatedBuildingLabel = buildingLabel ?? t`Building`;

  if (sourceCount === 0) {
    return null;
  }

  const isFailed = status === "Failed" && !isBuilding;
  const isStale = Boolean(brief?.isStale) && !isBuilding && !isFailed;
  const sourceCountLabel = sourceCount === 1 ? t`${sourceCount} source` : t`${sourceCount} sources`;
  const lead = getRowSummarySection(brief);
  const preview = lead
    ? toPlainPreview(lead.markdown, PROJECT_BRIEF_ROW_PREVIEW_MAX_CHARS)
    : isBuilding
    ? t`Building project brief from included sources...`
    : isFailed
    ? t`Brief didn’t update. Retry after sources finish indexing.`
    : t`Project brief will appear after Typr reviews these sources.`;

  return (
    <div className="group mb-5 flex w-full items-center gap-2 rounded-lg bg-sidebar px-2 py-2.5 transition-colors hover:bg-sidebar-accent">
      <button
        type="button"
        onClick={() => showSidebar("project-brief")}
        className="flex min-w-0 flex-1 items-center gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <span className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors group-hover:text-foreground">
          <i className="ri-file-ai-2-line text-lg" />
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-2.5">
            <span className="text-sm font-medium text-foreground">
              <Trans>Project brief</Trans>
            </span>
            {isStale && (
              <Badge variant="warning" size="sm">
                <Trans>Needs refresh</Trans>
              </Badge>
            )}
            {isFailed && (
              <Badge variant="destructive" size="sm">
                <Trans>Failed</Trans>
              </Badge>
            )}
            {isBuilding && <ProjectBriefBuildingStatus label={translatedBuildingLabel} />}
            <span className="truncate text-xs text-muted-foreground/80">
              {sourceCountLabel}
            </span>
          </span>
          {isBuilding
            ? (
              <span className="mt-1.5 block max-w-xl">
                <Skeleton className="h-4 w-full rounded-full" />
              </span>
            )
            : <span className="mt-0.5 block line-clamp-3 text-sm leading-5 text-muted-foreground">{preview}</span>}
        </span>
      </button>

      {(!brief || isFailed) && !isBuilding && onRefresh && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 shrink-0 rounded-full px-2 text-xs text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
          onClick={(event) => {
            event.stopPropagation();
            onRefresh();
          }}
        >
          {isFailed ? <Trans>Retry</Trans> : <Trans>Build</Trans>}
        </Button>
      )}

      <button
        type="button"
        onClick={() => showSidebar("project-brief")}
        className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-60 transition-colors group-hover:text-foreground group-hover:opacity-100"
      >
        <i className="ri-arrow-right-line text-base" />
        <span className="sr-only">
          <Trans>Open project brief</Trans>
        </span>
      </button>
    </div>
  );
}

function getRowSummarySection(brief: ProjectBriefView | null) {
  if (!brief) {
    return null;
  }

  return brief.sections.find(section => section.id === "project-brief" && section.markdown.trim().length > 0)
    ?? brief.sections.find(section => section.markdown.trim().length > 0)
    ?? null;
}

function toPlainPreview(markdown: string, maxChars: number) {
  const preview = markdown
    .replace(/\[((?:[SF]\d+)(?:\s*,\s*[SF]\d+)*)\]/g, "")
    .replace(/[`*_>#-]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (preview.length <= maxChars) {
    return preview;
  }

  const sentenceBoundary = preview.slice(0, maxChars).match(/.*[.!?]/)?.[0]?.trim();
  if (sentenceBoundary) {
    return sentenceBoundary;
  }

  const wordBoundary = preview.slice(0, maxChars).replace(/\s+\S*$/, "").trim();
  return wordBoundary || preview.slice(0, maxChars).trim();
}
