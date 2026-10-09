import { CreateProjectDialog } from "@/components/projects/create-project-dialog";
import { ProjectIcon } from "@/components/projects/project-icon";
import { useAddNotesToProject } from "@/hooks/useAddNotesToProject";
import { isActiveNoteProjectDrag, NOTE_PROJECT_DRAG_END_EVENT, readDroppedNoteId } from "@/lib/note-project-drag";
import { getRecentProjects, listProjects, listSessionsByProject, projectQueryKeys } from "@/lib/projects";
import { Button } from "@typr/ui/components/ui/button";
import { Skeleton } from "@typr/ui/components/ui/skeleton";
import { cn } from "@typr/ui/lib/utils";
import { Trans, useLingui } from "@lingui/react/macro";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { DragEvent } from "react";
import type { ProjectSource } from "@typr/plugin-db";

const SIDEBAR_PROJECT_PREVIEW_LIMIT = 3;

export function ProjectsSection() {
  const { t } = useLingui();
  const navigate = useNavigate();
  const location = useLocation();
  const shouldReduceMotion = useReducedMotion();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [draggedOverProjectId, setDraggedOverProjectId] = useState<string | null>(null);
  const pendingDropKeys = useRef(new Set<string>());
  const queryClient = useQueryClient();
  const addNotesToProject = useAddNotesToProject("sidebar_drag_drop");
  const activeProjectMatch = location.pathname.match(/^\/app\/projects\/(.+)$/);
  const activeProjectId = activeProjectMatch?.[1] ?? null;

  useEffect(() => {
    const clearDraggedOverProject = () => setDraggedOverProjectId(null);
    window.addEventListener(NOTE_PROJECT_DRAG_END_EVENT, clearDraggedOverProject);
    return () => window.removeEventListener(NOTE_PROJECT_DRAG_END_EVENT, clearDraggedOverProject);
  }, []);

  const projectsQuery = useQuery({
    queryKey: [projectQueryKeys.all],
    queryFn: listProjects,
  });

  const visibleProjects = useMemo(
    () => getRecentProjects(projectsQuery.data ?? [], SIDEBAR_PROJECT_PREVIEW_LIMIT),
    [projectsQuery.data],
  );

  const hasMoreProjects = (projectsQuery.data?.length ?? 0) > visibleProjects.length;
  const projectCountQueries = useQueries({
    queries: visibleProjects.map(project => ({
      queryKey: [projectQueryKeys.sessions, project.id, "sidebar-count"],
      queryFn: async () => (await listSessionsByProject(project.id, null, null)).length,
      enabled: !projectsQuery.isLoading,
      staleTime: 30 * 1000,
    })),
  });
  const projectCounts = new Map(
    visibleProjects.map((project, index) => [project.id, projectCountQueries[index]?.data]),
  );

  return (
    <section className="px-3 pb-4 pt-3">
      <div className="group/header mb-1 flex items-center justify-between">
        <button
          type="button"
          className="text-[13px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
          onClick={() => navigate({ to: "/app/projects" })}
        >
          <Trans>Projects</Trans>
        </button>
        <div className="flex items-center gap-0.5">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn(
              "h-6 w-6 rounded-full text-muted-foreground transition-opacity hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              isCollapsed
                ? "opacity-100"
                : "opacity-0 group-hover/header:opacity-100 focus-visible:opacity-100",
            )}
            onClick={() => setIsCollapsed(current => !current)}
            aria-label={isCollapsed ? t`Expand projects` : t`Collapse projects`}
            aria-expanded={!isCollapsed}
          >
            <i className={cn("text-sm", isCollapsed ? "ri-expand-diagonal-line" : "ri-collapse-diagonal-line")} />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6 rounded-full text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            onClick={() => setCreateDialogOpen(true)}
            aria-label={t`Create project`}
          >
            <i className="ri-add-line text-sm" />
          </Button>
        </div>
      </div>

      {!isCollapsed && projectsQuery.isLoading && (
        <div className="space-y-1">
          {Array.from({ length: 2 }, (_, index) => <Skeleton key={index} className="h-8 rounded-md" />)}
        </div>
      )}

      {!isCollapsed && !projectsQuery.isLoading && visibleProjects.length > 0 && (
        <div>
          <AnimatePresence initial={false}>
            {visibleProjects.map(project => {
              const isActive = activeProjectId === project.id;
              const isDragTarget = draggedOverProjectId === project.id;
              const handleDragEnter = (event: DragEvent<HTMLButtonElement>) => {
                if (!isActiveNoteProjectDrag(event.dataTransfer)) {
                  return;
                }
                event.preventDefault();
                setDraggedOverProjectId(current => current === project.id ? current : project.id);
              };
              const handleDragLeave = (event: DragEvent<HTMLButtonElement>) => {
                if (!isActiveNoteProjectDrag(event.dataTransfer)) {
                  return;
                }
                if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) {
                  return;
                }
                setDraggedOverProjectId(current => current === project.id ? null : current);
              };
              const handleDragOver = (event: DragEvent<HTMLButtonElement>) => {
                if (!isActiveNoteProjectDrag(event.dataTransfer)) {
                  return;
                }
                event.preventDefault();
                event.dataTransfer.dropEffect = "link";
              };
              const handleDrop = (event: DragEvent<HTMLButtonElement>) => {
                const noteId = readDroppedNoteId(event.dataTransfer);
                if (!noteId) {
                  setDraggedOverProjectId(current => current === project.id ? null : current);
                  return;
                }
                event.preventDefault();
                event.stopPropagation();
                setDraggedOverProjectId(current => current === project.id ? null : current);

                const sources = queryClient.getQueryData<ProjectSource[]>([projectQueryKeys.sources, project.id]);
                if (sources?.some(source => source.session_id === noteId && source.status === "Included")) {
                  return;
                }

                const pendingKey = JSON.stringify([project.id, noteId]);
                if (pendingDropKeys.current.has(pendingKey)) {
                  return;
                }
                pendingDropKeys.current.add(pendingKey);
                void addNotesToProject.mutateAsync({ projectId: project.id, noteIds: [noteId] })
                  .catch(() => undefined)
                  .finally(() => pendingDropKeys.current.delete(pendingKey));
              };

              return (
                <motion.button
                  key={project.id}
                  layout={!shouldReduceMotion}
                  initial={shouldReduceMotion ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={shouldReduceMotion ? undefined : { opacity: 0 }}
                  transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
                  type="button"
                  onClick={() => navigate({ to: "/app/projects/$projectId", params: { projectId: project.id } })}
                  onDragEnter={handleDragEnter}
                  onDragLeave={handleDragLeave}
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                  className={cn(
                    "relative flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] transition-colors duration-200",
                    isActive
                      ? "bg-sidebar-accent text-sidebar-accent-foreground before:absolute before:bottom-0 before:left-0 before:top-0 before:w-[3px] before:rounded-l-md before:bg-primary"
                      : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                    isDragTarget && "bg-sidebar-accent text-sidebar-accent-foreground ring-1 ring-sidebar-ring",
                  )}
                >
                  <ProjectIcon
                    icon={project.icon_value}
                    color={project.icon_color}
                    size="sm"
                    className="rounded-none bg-transparent ring-0"
                    iconClassName={cn(isActive && "text-sidebar-accent-foreground/80")}
                  />
                  <span className="truncate font-medium">{project.name}</span>
                  {(projectCounts.get(project.id) ?? 0) > 0 && (
                    <span
                      className={cn(
                        "ml-auto shrink-0 text-xs tabular-nums",
                        isActive ? "text-sidebar-accent-foreground/70" : "text-muted-foreground",
                      )}
                    >
                      {projectCounts.get(project.id)}
                    </span>
                  )}
                </motion.button>
              );
            })}
          </AnimatePresence>

          {hasMoreProjects && (
            <button
              type="button"
              onClick={() => navigate({ to: "/app/projects" })}
              className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            >
              <i className="ri-arrow-right-line text-sm" />
              <Trans>View all projects</Trans>
            </button>
          )}
        </div>
      )}

      {!isCollapsed && !projectsQuery.isLoading && visibleProjects.length === 0 && !createDialogOpen && (
        <div>
          <button
            type="button"
            onClick={() => setCreateDialogOpen(true)}
            className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <i className="ri-folder-add-line shrink-0 text-sm" />
            <Trans>Create first project</Trans>
          </button>
        </div>
      )}

      <CreateProjectDialog open={createDialogOpen} onOpenChange={setCreateDialogOpen} />
    </section>
  );
}
