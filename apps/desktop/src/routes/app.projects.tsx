import { CreateProjectDialog } from "@/components/projects/create-project-dialog";
import { ProjectEmptyIllustration } from "@/components/projects/project-empty-illustration";
import { ProjectIcon } from "@/components/projects/project-icon";
import { ProjectPageShell } from "@/components/projects/project-page-shell";
import { useTypr } from "@/contexts";
import {
  deleteProject,
  getProjectActionErrorMessage,
  isProjectQueryKey,
  listProjects,
  type Project,
  projectQueryKeys,
} from "@/lib/projects";
import { trackEvent } from "@/utils/analytics-events";
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
import { Input } from "@typr/ui/components/ui/input";
import { Skeleton } from "@typr/ui/components/ui/skeleton";
import { toast } from "@typr/ui/components/ui/toast";
import { Trans, useLingui } from "@lingui/react/macro";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Outlet, useLocation } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import { useMemo, useState } from "react";

export const Route = createFileRoute("/app/projects")({
  component: Component,
});

function Component() {
  const location = useLocation();

  if (location.pathname !== "/app/projects") {
    return <Outlet />;
  }

  return <ProjectsIndex />;
}

function ProjectsIndex() {
  const { t } = useLingui();
  const navigate = Route.useNavigate();
  const queryClient = useQueryClient();
  const { userId } = useTypr();
  const [search, setSearch] = useState("");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);

  const projectsQuery = useQuery({
    queryKey: [projectQueryKeys.all],
    queryFn: listProjects,
  });

  const deleteProjectMutation = useMutation({
    mutationFn: async (projectId: string) => deleteProject(projectId),
    onSuccess: async (_result, projectId) => {
      trackEvent("project_deleted", userId, {
        project_id: projectId,
      });
      await queryClient.invalidateQueries({
        predicate: query => isProjectQueryKey(query.queryKey[0]),
      });
      setProjectToDelete(null);
    },
    onError: (error) => {
      toast({
        id: "projects-delete-error",
        title: <Trans>Couldn’t delete project</Trans>,
        content: getProjectActionErrorMessage(error),
      });
    },
  });

  const filteredProjects = useMemo(() => {
    const projects = projectsQuery.data ?? [];
    const query = search.trim().toLowerCase();

    if (!query) {
      return projects;
    }

    return projects.filter(project =>
      project.name.toLowerCase().includes(query)
      || (project.description ?? "").toLowerCase().includes(query)
    );
  }, [projectsQuery.data, search]);
  const projectDeleteName = projectToDelete?.name ?? t`this project`;

  if (projectsQuery.isLoading) {
    return (
      <div className="flex h-full overflow-hidden bg-background">
        <ProjectsIndexSkeleton />
      </div>
    );
  }

  return (
    <div className="flex h-full overflow-hidden bg-background">
      <ProjectPageShell>
        <div className="flex shrink-0 items-start justify-between gap-8">
          <div className="min-w-0">
            <h1 className="typography-h2 text-foreground">
              <Trans>Projects</Trans>
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              <Trans>Browse grouped notes and reopen the context around a topic.</Trans>
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Input
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder={t`Search projects`}
              className="h-9 w-56 rounded-xl border bg-background text-sm"
            />
          </div>
        </div>

        <div className="mt-8 pb-8">
          {filteredProjects.length === 0
            ? (
              <div className="flex min-h-[360px] items-center justify-center px-8 py-12 text-center">
                {search.trim()
                  ? (
                    <div>
                      <div className="text-sm font-medium text-foreground">
                        <Trans>No projects found</Trans>
                      </div>
                      <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
                        <Trans>Try a different search.</Trans>
                      </p>
                    </div>
                  )
                  : (
                    <div className="mx-auto flex max-w-md flex-col items-center">
                      <ProjectEmptyIllustration />
                      <div className="text-lg font-semibold tracking-tight text-foreground">
                        <Trans>No projects yet</Trans>
                      </div>
                      <p className="mt-3 max-w-sm text-sm leading-6 text-muted-foreground">
                        <Trans>Create a project to group notes around a topic, client, or initiative.</Trans>
                      </p>
                      <Button
                        type="button"
                        variant="secondary"
                        className="mt-6"
                        onClick={() => setCreateDialogOpen(true)}
                      >
                        <i className="ri-add-line mr-1 text-base" />
                        <Trans>Create project</Trans>
                      </Button>
                    </div>
                  )}
              </div>
            )
            : (
              <div className="divide-y divide-border/60">
                {filteredProjects.map(project => (
                  <div
                    key={project.id}
                    className="group flex w-full items-center gap-3 rounded-md px-3 py-3 transition-colors hover:bg-surface-400/50"
                  >
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() =>
                        navigate({
                          to: "/app/projects/$projectId",
                          params: { projectId: project.id },
                        })}
                      className="h-auto min-w-0 flex-1 justify-start gap-3 rounded-lg px-0 py-0 text-left whitespace-normal hover:bg-transparent"
                    >
                      <ProjectIcon icon={project.icon_value} color={project.icon_color} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-foreground">{project.name}</div>
                        {project.description && (
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">
                            {project.description}
                          </p>
                        )}
                      </div>
                    </Button>

                    <div className="flex shrink-0 items-center gap-2">
                      <div className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(project.updated_at), { addSuffix: true })}
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-8 text-muted-foreground opacity-0 transition-opacity hover:bg-surface-400 hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100"
                            aria-label={t`Project actions for ${project.name}`}
                          >
                            <i className="ri-more-2-fill text-base" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44 rounded-xl border bg-background p-1.5">
                          <DropdownMenuItem
                            className="rounded-lg text-sm text-destructive focus:bg-destructive/5 focus:text-destructive"
                            onSelect={() => setProjectToDelete(project)}
                          >
                            <i className="ri-delete-bin-line text-sm" />
                            <Trans>Delete project</Trans>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                ))}
              </div>
            )}
        </div>
      </ProjectPageShell>

      <CreateProjectDialog open={createDialogOpen} onOpenChange={setCreateDialogOpen} />
      <AlertDialog
        open={projectToDelete !== null}
        onOpenChange={(open) => {
          if (!open && !deleteProjectMutation.isPending) {
            setProjectToDelete(null);
          }
        }}
      >
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>
              <Trans>Delete “{projectDeleteName}”?</Trans>
            </AlertDialogTitle>
            <AlertDialogDescription>
              <Trans>
                This deletes the project, its brief, source membership, and local project file copies. Notes stay in
                Notes and can be added to another project later.
              </Trans>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteProjectMutation.isPending}>
              <Trans>Cancel</Trans>
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleteProjectMutation.isPending || !projectToDelete}
              onClick={(event) => {
                event.preventDefault();
                if (projectToDelete) {
                  deleteProjectMutation.mutate(projectToDelete.id);
                }
              }}
            >
              <Trans>Delete project</Trans>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ProjectsIndexSkeleton() {
  return (
    <ProjectPageShell>
      <div className="flex items-start justify-between gap-8">
        <div>
          <Skeleton className="h-10 w-40 rounded-2xl" />
          <Skeleton className="mt-4 h-5 w-96 max-w-full rounded-full" />
        </div>
        <Skeleton className="h-9 w-56 rounded-xl" />
      </div>
      <div className="mt-8">
        {Array.from(
          { length: 6 },
          (_, index) => (
            <div key={index} className="flex items-center gap-3 border-b border-border/60 px-3 py-3 last:border-b-0">
              <Skeleton className="h-8 w-8 rounded-lg" />
              <div className="min-w-0 flex-1">
                <Skeleton className="h-4 w-48 rounded-full" />
                <Skeleton className="mt-2 h-3 w-64 rounded-full" />
              </div>
              <Skeleton className="h-3 w-16 rounded-full" />
            </div>
          ),
        )}
      </div>
    </ProjectPageShell>
  );
}
