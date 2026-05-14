import { ProjectBriefBuildingStatus } from "@/components/projects/project-brief-building-status";
import { ProjectBriefMarkdown } from "@/components/projects/project-brief-citations";
import type { ProjectBriefView } from "@/components/projects/project-brief-panel";
import { useRightPanel } from "@/contexts";
import { useProjectBriefRefresh } from "@/hooks/useProjectBriefRefresh";
import {
  getLatestProjectBrief,
  getProjectBriefFreshness,
  listProjectBriefSources,
  projectBriefQueryKeys,
  projectBriefToViewWithFreshness,
} from "@/lib/project-briefs";
import { listProjectFiles, projectFileQueryKeys } from "@/lib/project-files";
import {
  getProjectActionErrorMessage,
  listIncludedSessionsByProject,
  listProjects,
  projectQueryKeys,
} from "@/lib/projects";
import type { ProjectBriefSource } from "@typr/plugin-db";
import { Badge } from "@typr/ui/components/ui/badge";
import { Button } from "@typr/ui/components/ui/button";
import { Skeleton } from "@typr/ui/components/ui/skeleton";
import { toast } from "@typr/ui/components/ui/toast";
import { cn } from "@typr/ui/lib/utils";
import { Trans, useLingui } from "@lingui/react/macro";
import { useQuery } from "@tanstack/react-query";
import { useMatch, useNavigate } from "@tanstack/react-router";
import { openPath } from "@tauri-apps/plugin-opener";
import { type ReactNode, useMemo } from "react";

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

export function ProjectBriefSidebarView() {
  const { t } = useLingui();
  const projectMatch = useMatch({ from: "/app/projects/$projectId", shouldThrow: false });
  const projectId = projectMatch?.params.projectId ?? "";
  const navigate = useNavigate();
  const { hidePanel } = useRightPanel();
  const refreshBriefMutation = useProjectBriefRefresh(projectId);

  const projectsQuery = useQuery({
    queryKey: [projectQueryKeys.all],
    queryFn: listProjects,
    enabled: Boolean(projectId),
  });

  const project = useMemo(
    () => (projectsQuery.data ?? []).find(item => item.id === projectId) ?? null,
    [projectId, projectsQuery.data],
  );

  const sessionsQuery = useQuery({
    queryKey: [projectQueryKeys.includedSessions, projectId],
    queryFn: () => listIncludedSessionsByProject(projectId, 250, null),
    enabled: Boolean(project),
  });

  const projectBriefQuery = useQuery({
    queryKey: [projectBriefQueryKeys.latest, projectId],
    queryFn: () => getLatestProjectBrief(projectId),
    enabled: Boolean(project),
  });

  const projectBriefFreshnessQuery = useQuery({
    queryKey: [projectBriefQueryKeys.freshness, projectId],
    queryFn: () => getProjectBriefFreshness(projectId),
    enabled: Boolean(project),
  });

  const projectBriefSourcesQuery = useQuery({
    queryKey: [projectBriefQueryKeys.sources, projectBriefQuery.data?.id],
    queryFn: () => listProjectBriefSources(projectBriefQuery.data!.id),
    enabled: Boolean(projectBriefQuery.data?.id),
  });

  const projectFilesQuery = useQuery({
    queryKey: [projectFileQueryKeys.list, projectId],
    queryFn: () => listProjectFiles(projectId),
    enabled: Boolean(projectId),
  });

  const sourceCount = projectBriefFreshnessQuery.data?.sourceCount ?? sessionsQuery.data?.length ?? 0;
  const brief = projectBriefToViewWithFreshness(projectBriefQuery.data, projectBriefFreshnessQuery.data);
  const buildingLabel = getProjectBriefBuildingLabel(refreshBriefMutation.digestProgress, t);
  const mode = getBriefMode(
    sourceCount,
    refreshBriefMutation.isRefreshing ? "Building" : projectBriefQuery.data?.status,
  );
  const isLoading = projectsQuery.isLoading || sessionsQuery.isLoading || projectBriefQuery.isLoading
    || projectBriefFreshnessQuery.isLoading;
  const briefStatus = getBriefStatusChip(mode, brief, t);
  const showBriefToolbar = mode === "generating" || Boolean(briefStatus) || Boolean(brief) || sourceCount > 0;
  const fileStoragePathById = useMemo(
    () => new Map((projectFilesQuery.data ?? []).map(file => [file.id, file.storage_path])),
    [projectFilesQuery.data],
  );

  const handleOpenSource = async (source: ProjectBriefSource) => {
    if (source.source_type === "note") {
      navigate({
        to: "/app/note/$id",
        params: { id: source.source_id },
      });
      return;
    }

    const storagePath = fileStoragePathById.get(source.source_id);
    if (storagePath) {
      await openPath(storagePath);
    }
  };

  const handleCopy = async (brief: ProjectBriefView) => {
    const text = briefToText(brief);

    try {
      await navigator.clipboard.writeText(text);
      toast({
        id: "project-brief-copy",
        title: <Trans>Copied brief</Trans>,
        content: <Trans>Project brief copied to clipboard.</Trans>,
        dismissible: true,
        duration: 3000,
      });
    } catch (error) {
      toast({
        id: "project-brief-copy-error",
        title: <Trans>Couldn’t copy brief</Trans>,
        content: getProjectActionErrorMessage(error),
      });
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-sidebar">
      <div className="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-border/70 bg-background px-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-foreground">
            <Trans>Project brief</Trans>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-8 text-muted-foreground hover:text-foreground"
            onClick={hidePanel}
          >
            <i className="ri-close-line text-base" />
            <span className="sr-only">
              <Trans>Close project brief</Trans>
            </span>
          </Button>
        </div>
      </div>

      {showBriefToolbar && (
        <div className="flex min-h-10 shrink-0 items-center justify-between gap-3 border-b border-border/70 bg-background px-3 py-1.5">
          <div className="flex min-w-0 items-center gap-2">
            {mode === "generating" && <ProjectBriefBuildingStatus label={buildingLabel} />}
            {mode !== "generating" && briefStatus && (
              <Badge variant={briefStatus.variant} size="sm">
                {briefStatus.label}
              </Badge>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              disabled={!brief}
              className="size-7 rounded-md text-muted-foreground hover:text-foreground disabled:opacity-40"
              onClick={() => brief && handleCopy(brief)}
            >
              <i className="ri-file-copy-line text-sm" />
              <span className="sr-only">
                <Trans>Copy project brief</Trans>
              </span>
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              disabled={sourceCount === 0 || refreshBriefMutation.isRefreshing}
              className="size-7 rounded-md text-muted-foreground hover:text-foreground disabled:opacity-40"
              onClick={() =>
                refreshBriefMutation.mutate({
                  sourceCount,
                  trigger: "manual",
                })}
            >
              <i className="ri-refresh-line text-sm" />
              <span className="sr-only">
                <Trans>Refresh project brief</Trans>
              </span>
            </Button>
          </div>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {isLoading
          ? <ProjectBriefSidebarSkeleton />
          : (
            <ProjectBriefSidebarContent
              brief={brief}
              errorMessage={projectBriefQuery.data?.error_message ?? null}
              mode={mode}
              onOpenSource={handleOpenSource}
              sources={projectBriefSourcesQuery.data ?? []}
              sourceCount={sourceCount}
            />
          )}
      </div>
    </div>
  );
}

function getProjectBriefBuildingLabel(
  progress: { ready: number; total: number } | null,
  t: ReturnType<typeof useLingui>["t"],
) {
  if (!progress || progress.total === 0 || progress.ready >= progress.total) {
    return t`Building`;
  }

  return t`Building ${progress.ready}/${progress.total}`;
}

function ProjectBriefSidebarContent({
  brief,
  errorMessage,
  mode,
  onOpenSource,
  sources,
  sourceCount,
}: {
  brief: ProjectBriefView | null;
  errorMessage: string | null;
  mode: ProjectBriefMode;
  onOpenSource: (source: ProjectBriefSource) => void;
  sources: ProjectBriefSource[];
  sourceCount: number;
}) {
  const { t } = useLingui();
  const sections = brief?.sections.filter(section => section.markdown.trim().length > 0) ?? [];
  const updatedAt = brief ? formatBriefUpdatedAt(brief.updatedAt) : null;
  const sourceCountLabel = sourceCount === 1 ? t`${sourceCount} source` : t`${sourceCount} sources`;
  const briefSourceCountLabel = brief?.sourceCount === 1
    ? t`${brief.sourceCount} source`
    : t`${brief?.sourceCount ?? 0} sources`;

  if (mode === "no-notes" || sourceCount === 0) {
    return (
      <ProjectBriefState
        variant="no-notes"
        title={<Trans>No notes to brief</Trans>}
        description={<Trans>Add a few related notes, then Typr can keep a brief for this project.</Trans>}
      />
    );
  }

  if (mode === "generating") {
    return <ProjectBriefGeneratingSkeleton sourceCount={sourceCount} />;
  }

  if (mode === "failed") {
    return (
      <ProjectBriefState
        variant="failed"
        title={<Trans>Brief didn’t update</Trans>}
        description={errorMessage || (
          <Trans>The brief failed to refresh. Try again after the sources finish indexing.</Trans>
        )}
      />
    );
  }

  if (!brief) {
    return (
      <ProjectBriefState
        variant="not-generated"
        title={<Trans>Brief not ready yet</Trans>}
        description={t`Typr will build this from ${sourceCountLabel} in this project.`}
      />
    );
  }

  return (
    <div className="pb-6">
      <div className="mb-6">
        <p className="text-xs leading-5 text-muted-foreground">
          <Trans>Generated from {briefSourceCountLabel}</Trans>
          {updatedAt ? <Trans>· Updated {updatedAt}</Trans> : ""}
        </p>
      </div>

      <div className="space-y-6">
        {sections.map(section => (
          <section key={section.id}>
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {section.title}
            </h3>
            <ProjectBriefMarkdown
              className="prose prose-sm max-w-none text-sm leading-6 text-foreground prose-p:my-1 prose-ul:my-1.5 prose-li:my-0.5 prose-strong:text-foreground"
              markdown={section.markdown}
              onOpenSource={onOpenSource}
              sources={sources}
            />
          </section>
        ))}
      </div>
    </div>
  );
}

function ProjectBriefState({
  description,
  title,
  variant,
}: {
  description: ReactNode;
  title: ReactNode;
  variant: "no-notes" | "not-generated" | "failed";
}) {
  return (
    <div className="flex h-full min-h-[320px] flex-col items-center justify-center px-4 text-center">
      <ProjectBriefStateIcon variant={variant} />
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      <p className="mt-2 max-w-xs text-sm leading-6 text-muted-foreground">{description}</p>
    </div>
  );
}

function ProjectBriefStateIcon({ variant }: { variant: "no-notes" | "not-generated" | "failed" }) {
  const iconClassName = {
    "no-notes": "ri-article-line",
    "not-generated": "ri-sparkling-2-line",
    failed: "ri-error-warning-line",
  }[variant];

  return (
    <div
      aria-hidden="true"
      className={cn(
        "mb-4 flex size-11 items-center justify-center rounded-2xl border bg-muted/40 text-muted-foreground",
        variant === "failed" && "border-destructive/30 bg-destructive/10 text-destructive",
        variant === "not-generated" && "border-primary/20 bg-primary/10 text-primary",
        variant === "no-notes" && "border-border/70",
      )}
    >
      <i className={cn("text-lg", iconClassName)} />
    </div>
  );
}

function ProjectBriefSidebarSkeleton() {
  return (
    <div className="space-y-5">
      <div>
        <Skeleton className="h-5 w-28 rounded-full" />
        <Skeleton className="mt-3 h-4 w-full rounded-full" />
        <Skeleton className="mt-2 h-4 w-2/3 rounded-full" />
      </div>
      {Array.from({ length: 4 }, (_, index) => (
        <div key={index}>
          <Skeleton className="h-3 w-32 rounded-full" />
          <Skeleton className="mt-3 h-4 w-full rounded-full" />
          <Skeleton className="mt-2 h-4 w-5/6 rounded-full" />
        </div>
      ))}
    </div>
  );
}

function ProjectBriefGeneratingSkeleton({ sourceCount }: { sourceCount: number }) {
  const { t } = useLingui();
  const sourceCountLabel = sourceCount === 1 ? t`${sourceCount} source` : t`${sourceCount} sources`;

  return (
    <div className="space-y-6 pb-6">
      <div>
        <p className="text-xs leading-5 text-muted-foreground">
          <Trans>Generating from {sourceCountLabel}</Trans>
        </p>
      </div>

      {Array.from({ length: 4 }, (_, index) => (
        <section key={index}>
          <Skeleton className="h-3 w-32 rounded-full" />
          <div className="mt-3 space-y-2">
            <Skeleton className="h-4 w-full rounded-full" />
            <Skeleton className="h-4 w-11/12 rounded-full" />
            {index < 2 && <Skeleton className="h-4 w-4/5 rounded-full" />}
          </div>
        </section>
      ))}
    </div>
  );
}

function briefToText(brief: ProjectBriefView) {
  return brief.sections
    .filter(section => section.markdown.trim().length > 0)
    .map(section => `## ${section.title}\n\n${section.markdown.trim()}`)
    .join("\n\n");
}

type ProjectBriefMode = "no-notes" | "not-generated" | "generating" | "current" | "stale" | "failed";

function getBriefMode(sourceCount: number, status?: string): ProjectBriefMode {
  if (sourceCount === 0) {
    return "no-notes";
  }

  if (status === "Building") {
    return "generating";
  }

  if (status === "Failed") {
    return "failed";
  }

  if (status === "NeedsRefresh") {
    return "stale";
  }

  if (status === "Current") {
    return "current";
  }

  return "not-generated";
}

function getBriefStatusChip(
  mode: ProjectBriefMode,
  brief: ProjectBriefView | null,
  t: ReturnType<typeof useLingui>["t"],
): { label: string; variant: "secondary" | "info" | "success" | "warning" | "destructive" } | null {
  if (mode === "no-notes") {
    return null;
  }

  if (mode === "generating") {
    return null;
  }

  if (mode === "failed") {
    return { label: t`Failed`, variant: "destructive" };
  }

  if (!brief) {
    return null;
  }

  return brief.isStale ? { label: t`Needs refresh`, variant: "warning" } : null;
}
