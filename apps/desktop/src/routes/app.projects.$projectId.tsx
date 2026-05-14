import { ProjectAskLauncher } from "@/components/projects/project-ask-launcher";
import { ProjectBriefRow } from "@/components/projects/project-brief-row";
import { ProjectEmptyState } from "@/components/projects/project-empty-state";
import { ProjectHeader } from "@/components/projects/project-header";
import type { ProjectIconColor, ProjectIconValue } from "@/components/projects/project-icons";
import { ProjectNotesPanel } from "@/components/projects/project-notes-panel";
import { ProjectNotesPickerDialog } from "@/components/projects/project-notes-picker-dialog";
import { ProjectPageShell } from "@/components/projects/project-page-shell";
import { debugLogFor } from "@/components/utils/debug-logger";
import { useTypr } from "@/contexts";
import { useProjectBriefRefresh } from "@/hooks/useProjectBriefRefresh";
import {
  getLatestProjectBrief,
  getProjectBriefFreshness,
  projectBriefMatchesFreshness,
  projectBriefQueryKeys,
  projectBriefToViewWithFreshness,
} from "@/lib/project-briefs";
import { markAndEnqueueProjectBriefRefresh, projectKnowledgeJobQueryKeys } from "@/lib/project-knowledge-jobs";
import {
  clampProjectDescription,
  deleteProject,
  getProjectActionErrorMessage,
  isProjectQueryKey,
  listProjects,
  listProjectSources,
  listSessionsByProject,
  normalizeProjectName,
  projectQueryKeys,
  removeSessionFromProject,
  setLastSelectedProjectId,
  setProjectSourceStatus,
  updateProject,
} from "@/lib/projects";
import { trackEvent } from "@/utils/analytics-events";
import type { ProjectSourceStatus, Session } from "@typr/plugin-db";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@typr/ui/components/ui/alert-dialog";
import { Button } from "@typr/ui/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@typr/ui/components/ui/dropdown-menu";
import { Skeleton } from "@typr/ui/components/ui/skeleton";
import { toast } from "@typr/ui/components/ui/toast";
import { Trans, useLingui } from "@lingui/react/macro";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { format } from "date-fns";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { type KeyboardEvent, useEffect, useMemo, useState } from "react";

export const Route = createFileRoute("/app/projects/$projectId")({
  component: Component,
});

function debugProjectBrief(event: string, payload?: Record<string, unknown>) {
  debugLogFor("DEBUG_PROJECT_BRIEF", "ProjectBriefDebug", event, payload ?? {});
}

function Component() {
  const { t } = useLingui();
  const { projectId } = Route.useParams();
  const navigate = Route.useNavigate();
  const queryClient = useQueryClient();
  const { userId } = useTypr();
  const shouldReduceMotion = useReducedMotion();
  const [isNotesPickerOpen, setIsNotesPickerOpen] = useState(false);
  const [isDeleteProjectDialogOpen, setIsDeleteProjectDialogOpen] = useState(false);
  const [sourceToRemove, setSourceToRemove] = useState<Session | null>(null);

  const projectsQuery = useQuery({
    queryKey: [projectQueryKeys.all],
    queryFn: listProjects,
  });

  const project = useMemo(
    () => (projectsQuery.data ?? []).find(item => item.id === projectId) ?? null,
    [projectId, projectsQuery.data],
  );

  const sessionsQuery = useQuery({
    queryKey: [projectQueryKeys.sessions, projectId],
    queryFn: () => listSessionsByProject(projectId, 250, null),
    enabled: Boolean(project),
  });

  const sourcesQuery = useQuery({
    queryKey: [projectQueryKeys.sources, projectId],
    queryFn: () => listProjectSources(projectId),
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

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (!project) {
      return;
    }

    setName(project.name);
    setDescription(project.description ?? "");
    setLastSelectedProjectId(userId, project.id);
  }, [project, userId]);

  useEffect(() => {
    if (projectsQuery.isFetched && !project) {
      navigate({ to: "/app/projects", replace: true });
    }
  }, [navigate, project, projectsQuery.isFetched]);

  const updateProjectMutation = useMutation({
    mutationFn: async (next: {
      name: string;
      description: string;
      iconColor?: ProjectIconColor;
      iconValue?: ProjectIconValue;
    }) => {
      const currentProject = project!;
      return updateProject({
        ...currentProject,
        name: next.name,
        description: next.description || null,
        icon_value: next.iconValue ?? currentProject.icon_value,
        icon_color: next.iconColor ?? currentProject.icon_color,
        updated_at: new Date().toISOString(),
      });
    },
    onSuccess: async (project) => {
      trackEvent("project_updated", userId, {
        project_id: project.id,
      });
      await Promise.all([
        queryClient.invalidateQueries({
          predicate: query => isProjectQueryKey(query.queryKey[0]),
        }),
        queryClient.invalidateQueries({ queryKey: [projectKnowledgeJobQueryKeys.byProject, projectId] }),
        queryClient.invalidateQueries({ queryKey: [projectBriefQueryKeys.latest, projectId] }),
        queryClient.invalidateQueries({ queryKey: [projectBriefQueryKeys.freshness, projectId] }),
      ]);
      setName(project.name);
      setDescription(project.description ?? "");
    },
    onError: (error) => {
      toast({
        id: "projects-update-error",
        title: <Trans>Couldn’t update project</Trans>,
        content: getProjectActionErrorMessage(error),
      });
    },
  });

  const deleteProjectMutation = useMutation({
    mutationFn: async () => deleteProject(projectId),
    onSuccess: async () => {
      trackEvent("project_deleted", userId, {
        project_id: projectId,
      });
      await queryClient.invalidateQueries({
        predicate: query => isProjectQueryKey(query.queryKey[0]),
      });
      navigate({ to: "/app/projects", replace: true });
    },
    onError: (error) => {
      toast({
        id: "projects-delete-error",
        title: <Trans>Couldn’t delete project</Trans>,
        content: getProjectActionErrorMessage(error),
      });
    },
  });

  const sortedSessions = useMemo(
    () =>
      [...(sessionsQuery.data ?? [])].sort((a, b) =>
        new Date(b.visited_at).getTime() - new Date(a.visited_at).getTime()
      ),
    [sessionsQuery.data],
  );

  const sourceStatusBySessionId = useMemo(
    () => new Map((sourcesQuery.data ?? []).map(source => [source.session_id, source.status])),
    [sourcesQuery.data],
  );

  const includedSourceCount = useMemo(
    () =>
      sortedSessions.filter(session => (sourceStatusBySessionId.get(session.id) ?? "Included") === "Included")
        .length,
    [sortedSessions, sourceStatusBySessionId],
  );

  const projectBriefPreview = useMemo(
    () => projectBriefToViewWithFreshness(projectBriefQuery.data, projectBriefFreshnessQuery.data),
    [projectBriefFreshnessQuery.data, projectBriefQuery.data],
  );
  const usableProjectSourceCount = projectBriefFreshnessQuery.data?.sourceCount ?? includedSourceCount;

  const refreshBriefMutation = useProjectBriefRefresh(projectId);
  const isBriefRefreshing = refreshBriefMutation.isRefreshing;
  const buildingProgress = refreshBriefMutation.digestProgress;
  const buildingLabel =
    !buildingProgress || buildingProgress.total === 0 || buildingProgress.ready >= buildingProgress.total
      ? t`Building`
      : t`Building ${buildingProgress.ready}/${buildingProgress.total}`;
  const refreshBrief = refreshBriefMutation.mutate;

  useEffect(() => {
    const freshness = projectBriefFreshnessQuery.data;
    if (!project || !freshness || freshness.sourceCount === 0 || isBriefRefreshing) {
      return;
    }

    if (projectBriefQuery.isLoading || projectBriefFreshnessQuery.isLoading) {
      return;
    }

    const brief = projectBriefQuery.data;
    if (brief?.status === "Building") {
      return;
    }

    const shouldRefresh = !brief
      || brief.status === "NeedsRefresh"
      || !projectBriefMatchesFreshness(brief, freshness);

    if (!shouldRefresh) {
      return;
    }

    console.info("[project-brief] auto-refresh:scheduled", {
      projectId,
      sourceCount: freshness.sourceCount,
      previousStatus: brief?.status ?? null,
      fingerprint: freshness.sourceFingerprint,
    });
    debugProjectBrief("auto-refresh:scheduled", {
      projectId,
      sourceCount: freshness.sourceCount,
      fingerprint: freshness.sourceFingerprint,
      previousStatus: brief?.status ?? null,
    });
    refreshBrief({ sourceCount: freshness.sourceCount, trigger: "auto" });
  }, [
    isBriefRefreshing,
    project,
    projectBriefFreshnessQuery.data,
    projectBriefFreshnessQuery.isLoading,
    projectBriefQuery.data,
    projectBriefQuery.isLoading,
    projectId,
    refreshBrief,
  ]);

  const setSourceStatusMutation = useMutation({
    mutationFn: ({ sessionId, status }: { sessionId: string; status: ProjectSourceStatus }) =>
      setProjectSourceStatus(projectId, sessionId, status),
    onSuccess: async (_result, variables) => {
      trackEvent("project_source_status_changed", userId, {
        project_id: projectId,
        status: variables.status,
      });
      await markAndEnqueueProjectBriefRefresh(projectId);
      await Promise.all([
        queryClient.invalidateQueries({
          predicate: query => isProjectQueryKey(query.queryKey[0]),
        }),
        queryClient.invalidateQueries({ queryKey: [projectKnowledgeJobQueryKeys.byProject, projectId] }),
        queryClient.invalidateQueries({ queryKey: [projectBriefQueryKeys.latest, projectId] }),
        queryClient.invalidateQueries({ queryKey: [projectBriefQueryKeys.freshness, projectId] }),
      ]);
    },
    onError: (error) => {
      toast({
        id: "project-source-status-error",
        title: <Trans>Couldn’t update source</Trans>,
        content: getProjectActionErrorMessage(error),
      });
    },
  });

  const removeSourceMutation = useMutation({
    mutationFn: (sessionId: string) => removeSessionFromProject(sessionId, projectId),
    onSuccess: async () => {
      setSourceToRemove(null);
      trackEvent("project_note_removed", userId, {
        project_id: projectId,
      });
      await markAndEnqueueProjectBriefRefresh(projectId);
      await Promise.all([
        queryClient.invalidateQueries({
          predicate: query => isProjectQueryKey(query.queryKey[0]),
        }),
        queryClient.invalidateQueries({ queryKey: [projectKnowledgeJobQueryKeys.byProject, projectId] }),
        queryClient.invalidateQueries({ queryKey: [projectBriefQueryKeys.latest, projectId] }),
        queryClient.invalidateQueries({ queryKey: [projectBriefQueryKeys.freshness, projectId] }),
      ]);
    },
    onError: (error) => {
      toast({
        id: "project-source-remove-error",
        title: <Trans>Couldn’t remove note</Trans>,
        content: getProjectActionErrorMessage(error),
      });
    },
  });

  const persistNameIfNeeded = () => {
    if (!project) {
      return;
    }

    const nextName = normalizeProjectName(name);
    if (!nextName) {
      setName(project.name);
      return;
    }

    if (nextName !== project.name) {
      updateProjectMutation.mutate({ name: nextName, description });
    }
  };

  const persistDescriptionIfNeeded = () => {
    if (!project) {
      return;
    }

    const nextDescription = description.trim();
    const currentDescription = project.description ?? "";

    if (nextDescription !== currentDescription) {
      updateProjectMutation.mutate({
        name: normalizeProjectName(name) || project.name,
        description: nextDescription,
      });
    }
  };

  const handleIconChange = (next: { icon: ProjectIconValue; color: ProjectIconColor }) => {
    if (!project) {
      return;
    }

    if (next.icon === project.icon_value && next.color === project.icon_color) {
      return;
    }

    updateProjectMutation.mutate({
      name: normalizeProjectName(name) || project.name,
      description,
      iconValue: next.icon,
      iconColor: next.color,
    });
  };

  const handleNameKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      event.currentTarget.blur();
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setName(project?.name ?? "");
      event.currentTarget.blur();
    }
  };

  const handleDeleteProject = () => {
    deleteProjectMutation.mutate();
  };
  const sourceToRemoveTitle = sourceToRemove?.title || t`this note`;

  if (projectsQuery.isLoading) {
    return (
      <div className="flex h-full overflow-hidden bg-background">
        <main className="flex flex-1 overflow-hidden">
          <ProjectDetailSkeleton />
        </main>
      </div>
    );
  }

  if (!project) {
    return null;
  }

  return (
    <div className="flex h-full overflow-hidden bg-background">
      <main className="flex flex-1 overflow-hidden">
        <ProjectPageShell>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={projectId}
              className="flex min-h-full min-w-0 flex-col"
              initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: -4 }}
              transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="shrink-0">
                <ProjectHeader
                  name={name}
                  description={description}
                  iconValue={project.icon_value}
                  iconColor={project.icon_color}
                  onNameChange={setName}
                  onNameBlur={persistNameIfNeeded}
                  onNameKeyDown={handleNameKeyDown}
                  onDescriptionChange={nextDescription => setDescription(clampProjectDescription(nextDescription))}
                  onDescriptionBlur={persistDescriptionIfNeeded}
                  onIconChange={handleIconChange}
                  onDelete={() => setIsDeleteProjectDialogOpen(true)}
                  isDeleting={deleteProjectMutation.isPending}
                />
              </div>

              <ProjectBriefRow
                brief={projectBriefPreview}
                buildingLabel={buildingLabel}
                sourceCount={usableProjectSourceCount}
                status={projectBriefQuery.data?.status ?? null}
                isBuilding={projectBriefQuery.data?.status === "Building" || isBriefRefreshing}
                onRefresh={() =>
                  refreshBriefMutation.mutate({
                    sourceCount: usableProjectSourceCount,
                    trigger: "manual",
                  })}
              />
              <ProjectAskLauncher project={project} sourceCount={usableProjectSourceCount} />

              <ProjectNotesPanel
                count={sortedSessions.length}
                onAddNotes={() => setIsNotesPickerOpen(true)}
                projectId={projectId}
              >
                {sessionsQuery.isLoading && (
                  <div className="space-y-3 pb-1">
                    {Array.from({ length: 4 }, (_, index) => <ProjectSessionRowSkeleton key={index} />)}
                  </div>
                )}

                {!sessionsQuery.isLoading && sortedSessions.length === 0 && (
                  <ProjectEmptyState onAddNotes={() => setIsNotesPickerOpen(true)} />
                )}

                {!sessionsQuery.isLoading && sortedSessions.length > 0 && (
                  <ul className="pb-1" aria-label={t`Project notes`}>
                    {sortedSessions.map(session => (
                      <ProjectSessionRow
                        key={session.id}
                        session={session}
                        projectId={projectId}
                        status={sourceStatusBySessionId.get(session.id) ?? "Included"}
                        isUpdating={setSourceStatusMutation.isPending || removeSourceMutation.isPending}
                        onInclude={() =>
                          setSourceStatusMutation.mutate({
                            sessionId: session.id,
                            status: "Included",
                          })}
                        onExclude={() =>
                          setSourceStatusMutation.mutate({
                            sessionId: session.id,
                            status: "ExcludedFromBrief",
                          })}
                        onRemove={() => setSourceToRemove(session)}
                      />
                    ))}
                  </ul>
                )}
              </ProjectNotesPanel>
            </motion.div>
          </AnimatePresence>
        </ProjectPageShell>
      </main>

      <AlertDialog
        open={sourceToRemove !== null}
        onOpenChange={(open) => {
          if (!open && !removeSourceMutation.isPending) {
            setSourceToRemove(null);
          }
        }}
      >
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>
              <Trans>Remove “{sourceToRemoveTitle}” from this project?</Trans>
            </AlertDialogTitle>
            <AlertDialogDescription>
              <Trans>
                The note stays in Notes and any other projects. It will no longer be used by this project’s brief or
                Ask, and the brief will refresh without it.
              </Trans>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removeSourceMutation.isPending}>
              <Trans>Cancel</Trans>
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={removeSourceMutation.isPending || !sourceToRemove}
              onClick={(event) => {
                event.preventDefault();
                if (sourceToRemove) {
                  removeSourceMutation.mutate(sourceToRemove.id);
                }
              }}
            >
              <Trans>Remove from project</Trans>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={isDeleteProjectDialogOpen}
        onOpenChange={(open) => {
          if (!open && !deleteProjectMutation.isPending) {
            setIsDeleteProjectDialogOpen(false);
          }
        }}
      >
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>
              <Trans>Delete “{project.name}”?</Trans>
            </AlertDialogTitle>
            <AlertDialogDescription>
              <Trans>
                This deletes the project, its brief, source membership, and local project file copies. Notes stay in
                Typr and can be added to another project later.
              </Trans>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteProjectMutation.isPending}>
              <Trans>Cancel</Trans>
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleteProjectMutation.isPending}
              onClick={(event) => {
                event.preventDefault();
                handleDeleteProject();
              }}
            >
              <Trans>Delete project</Trans>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ProjectNotesPickerDialog
        open={isNotesPickerOpen}
        onOpenChange={setIsNotesPickerOpen}
        projectId={projectId}
        userId={userId}
      />
    </div>
  );
}

function ProjectDetailSkeleton() {
  return (
    <ProjectPageShell>
      <div className="mb-6 flex items-start justify-between gap-6">
        <div className="min-w-0 flex-1">
          <div className="mb-4 flex items-start gap-4">
            <Skeleton className="h-12 w-12 rounded-2xl" />
            <div className="min-w-0 flex-1">
              <Skeleton className="h-3 w-16 rounded-full" />
              <Skeleton className="mt-3 h-10 w-80 max-w-full rounded-2xl" />
            </div>
          </div>
          <Skeleton className="mt-4 h-4 w-full max-w-xl rounded-full" />
          <Skeleton className="mt-2 h-4 w-96 max-w-full rounded-full" />
        </div>

        <Skeleton className="h-10 w-10 rounded-full" />
      </div>

      <div className="pt-2">
        <div className="mb-6 flex items-center gap-2">
          <Skeleton className="h-5 w-14 rounded-full" />
          <Skeleton className="h-5 w-8 rounded-full" />
        </div>

        <div className="space-y-3 pb-1">
          {Array.from({ length: 4 }, (_, index) => <ProjectSessionRowSkeleton key={index} />)}
        </div>
      </div>
    </ProjectPageShell>
  );
}

function ProjectSessionRowSkeleton() {
  return (
    <div className="px-2 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <Skeleton className="h-5 w-96 max-w-full rounded-full" />
          <div className="mt-3 flex items-center gap-2">
            <Skeleton className="h-3 w-28 rounded-full" />
          </div>
        </div>
        <Skeleton className="h-5 w-5 rounded-full" />
      </div>
    </div>
  );
}

function ProjectSessionRow({
  isUpdating,
  onExclude,
  onInclude,
  onRemove,
  projectId,
  session,
  status,
}: {
  session: Session;
  projectId: string;
  status: ProjectSourceStatus;
  isUpdating: boolean;
  onInclude: () => void;
  onExclude: () => void;
  onRemove: () => void;
}) {
  const { t } = useLingui();
  const navigate = Route.useNavigate();
  const timestamp = session.record_start ?? session.created_at;
  const isExcluded = status === "ExcludedFromBrief";
  const needsReview = status === "NeedsReview";
  const sourceTitle = session.title || t`Untitled note`;

  return (
    <li>
      <div className="group flex items-center gap-2 rounded-lg px-2 py-3 transition-colors hover:bg-surface-400/50">
        <button
          type="button"
          onClick={() =>
            navigate({
              to: "/app/note/$id",
              params: { id: session.id },
              search: { from: "project", projectId },
            })}
          className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left"
        >
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-foreground">
              {session.title || <Trans>Untitled note</Trans>}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>{format(new Date(timestamp), "MMM d, h:mm a")}</span>
              {isExcluded && (
                <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                  <Trans>Excluded from brief</Trans>
                </span>
              )}
              {needsReview && (
                <span className="inline-flex items-center rounded-full bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning-foreground">
                  <Trans>Needs review</Trans>
                </span>
              )}
            </div>
          </div>

          <i className="ri-arrow-right-line text-lg text-muted-foreground/70 transition-colors group-hover:text-foreground" />
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
              disabled={isUpdating}
              aria-label={t`Source actions for ${sourceTitle}`}
            >
              <i className="ri-more-2-fill text-base" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48 rounded-xl border bg-background p-1.5">
            {status !== "Included" && (
              <DropdownMenuItem className="rounded-lg text-sm" onSelect={onInclude}>
                <i className="ri-check-line text-sm" />
                <Trans>Include in brief</Trans>
              </DropdownMenuItem>
            )}
            {status !== "ExcludedFromBrief" && (
              <DropdownMenuItem className="rounded-lg text-sm" onSelect={onExclude}>
                <i className="ri-eye-off-line text-sm" />
                <Trans>Exclude from brief</Trans>
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              className="rounded-lg text-sm text-destructive focus:bg-destructive/5 focus:text-destructive"
              onSelect={onRemove}
            >
              <i className="ri-close-line text-sm" />
              <Trans>Remove from project</Trans>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  );
}
