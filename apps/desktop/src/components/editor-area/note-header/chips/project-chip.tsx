import { useSession } from "@typr/utils/contexts";
import { Trans, useLingui } from "@lingui/react/macro";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ProjectIcon } from "@/components/projects/project-icon";
import { useTypr } from "@/contexts";
import { projectBriefQueryKeys } from "@/lib/project-briefs";
import { markAndEnqueueProjectBriefRefresh, projectKnowledgeJobQueryKeys } from "@/lib/project-knowledge-jobs";
import {
  assignSessionToProject,
  createProject,
  getProjectActionErrorMessage,
  isProjectQueryKey,
  listProjects,
  listProjectsBySession,
  normalizeProjectName,
  projectQueryKeys,
  removeSessionFromProject,
} from "@/lib/projects";
import { trackEvent } from "@/utils/analytics-events";
import { Button } from "@typr/ui/components/ui/button";
import { Checkbox } from "@typr/ui/components/ui/checkbox";
import { Input } from "@typr/ui/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@typr/ui/components/ui/popover";
import { toast } from "@typr/ui/components/ui/toast";
import { useMemo, useState } from "react";
import { noteHeaderChipClassName } from "../styles";

export function ProjectChip({ sessionId }: { sessionId: string }) {
  const { t } = useLingui();
  const queryClient = useQueryClient();
  const { userId } = useTypr();
  const refreshSession = useSession(sessionId, (s) => s.refresh);
  const [open, setOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");

  const projectsQuery = useQuery({
    queryKey: [projectQueryKeys.all],
    queryFn: listProjects,
  });

  const membershipsQuery = useQuery({
    queryKey: [projectQueryKeys.sessionMemberships, sessionId],
    queryFn: () => listProjectsBySession(sessionId),
  });

  const memberships = membershipsQuery.data ?? [];
  const membershipIds = useMemo(
    () => new Set(memberships.map(project => project.id)),
    [memberships],
  );
  const primaryProject = memberships[0] ?? null;
  const overflowCount = Math.max(0, memberships.length - 1);

  const refreshProjectMembership = async (projectId: string) => {
    await markAndEnqueueProjectBriefRefresh(projectId);
    await Promise.all([
      queryClient.invalidateQueries({
        predicate: query => isProjectQueryKey(query.queryKey[0]),
      }),
      queryClient.invalidateQueries({ queryKey: [projectKnowledgeJobQueryKeys.byProject, projectId] }),
      queryClient.invalidateQueries({ queryKey: [projectBriefQueryKeys.latest, projectId] }),
      queryClient.invalidateQueries({ queryKey: [projectBriefQueryKeys.freshness, projectId] }),
      refreshSession(),
    ]);
  };

  const addProjectMutation = useMutation({
    mutationFn: async (projectId: string) => {
      await assignSessionToProject(sessionId, projectId);
    },
    onSuccess: async (_result, projectId) => {
      trackEvent("project_notes_added", userId, {
        project_id: projectId,
        note_count: 1,
        source: "note_header",
      });
      await refreshProjectMembership(projectId);
    },
    onError: (error) => {
      toast({
        id: "project-add-error",
        title: <Trans>Couldn’t add project</Trans>,
        content: getProjectActionErrorMessage(error),
      });
    },
  });

  const removeProjectMutation = useMutation({
    mutationFn: async (projectId: string) => {
      await removeSessionFromProject(sessionId, projectId);
    },
    onSuccess: async (_result, projectId) => {
      trackEvent("project_note_removed", userId, {
        project_id: projectId,
      });
      await refreshProjectMembership(projectId);
    },
    onError: (error) => {
      toast({
        id: "project-remove-error",
        title: <Trans>Couldn’t remove project</Trans>,
        content: getProjectActionErrorMessage(error),
      });
    },
  });

  const createProjectMutation = useMutation({
    mutationFn: async (name: string) => {
      const project = await createProject(name);
      await assignSessionToProject(sessionId, project.id);
      return project;
    },
    onSuccess: async (project) => {
      trackEvent("project_created", userId, {
        project_id: project.id,
        source: "note_header",
        has_description: false,
      });
      trackEvent("project_notes_added", userId, {
        project_id: project.id,
        note_count: 1,
        source: "note_header",
      });
      setNewProjectName("");
      await refreshProjectMembership(project.id);
    },
    onError: (error) => {
      toast({
        id: "project-create-error",
        title: <Trans>Couldn’t create project</Trans>,
        content: getProjectActionErrorMessage(error),
      });
    },
  });

  const isMutating = addProjectMutation.isPending || removeProjectMutation.isPending || createProjectMutation.isPending;

  const toggleProject = (projectId: string) => {
    if (membershipIds.has(projectId)) {
      removeProjectMutation.mutate(projectId);
      return;
    }

    addProjectMutation.mutate(projectId);
  };

  const handleCreateProject = () => {
    const name = normalizeProjectName(newProjectName);
    if (!name) {
      return;
    }

    createProjectMutation.mutate(name);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={noteHeaderChipClassName}
          aria-label={primaryProject ? t`Edit projects` : t`Add to project`}
        >
          <ProjectIcon
            icon={primaryProject?.icon_value}
            color={primaryProject?.icon_color}
            size="sm"
            className="ring-0"
          />
          <span className="max-w-[150px] truncate">
            {primaryProject ? primaryProject.name : t`Add to project`}
          </span>
          {overflowCount > 0 && <span className="text-muted-foreground">+{overflowCount}</span>}
        </button>
      </PopoverTrigger>

      <PopoverContent align="start" sideOffset={8} className="w-72 overflow-hidden p-0">
        <div className="border-b px-3 py-2.5">
          <div className="text-sm font-medium text-foreground">
            <Trans>Projects</Trans>
          </div>
          <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
            <Trans>Add this note to one or more projects.</Trans>
          </p>
        </div>

        <div className="max-h-64 overflow-y-auto p-1.5">
          {projectsQuery.isLoading || membershipsQuery.isLoading
            ? (
              <div className="px-2 py-1.5 text-sm text-muted-foreground">
                <Trans>Loading projects…</Trans>
              </div>
            )
            : (projectsQuery.data ?? []).length === 0
            ? (
              <div className="px-2 py-1.5 text-sm text-muted-foreground">
                <Trans>No projects yet.</Trans>
              </div>
            )
            : (projectsQuery.data ?? []).map((project) => {
              const checked = membershipIds.has(project.id);

              return (
                <button
                  key={project.id}
                  type="button"
                  disabled={isMutating}
                  onClick={() => toggleProject(project.id)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-foreground transition-colors hover:bg-surface-400 disabled:pointer-events-none disabled:opacity-50"
                >
                  <ProjectIcon icon={project.icon_value} color={project.icon_color} size="sm" className="ring-0" />
                  <span className="min-w-0 flex-1 truncate">{project.name}</span>
                  <Checkbox checked={checked} className="pointer-events-none size-4" aria-hidden="true" />
                </button>
              );
            })}
        </div>

        <form
          className="border-t px-2.5 py-2"
          onSubmit={(event) => {
            event.preventDefault();
            handleCreateProject();
          }}
        >
          <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <Trans>Create project</Trans>
          </div>
          <div className="flex items-center gap-2">
            <Input
              value={newProjectName}
              onChange={event => setNewProjectName(event.target.value)}
              placeholder={t`Project name`}
              className="h-8 text-sm"
            />
            <Button
              type="submit"
              size="sm"
              className="h-8 px-2.5"
              disabled={createProjectMutation.isPending || !normalizeProjectName(newProjectName)}
            >
              <Trans>Create</Trans>
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}
