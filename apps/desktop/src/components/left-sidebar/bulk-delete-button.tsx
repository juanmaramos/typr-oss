import { Trans, useLingui } from "@lingui/react/macro";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";

import { ProjectIcon } from "@/components/projects/project-icon";
import { useTypr } from "@/contexts";
import { useBulkDelete } from "@/hooks/useBulkDelete";
import { projectBriefQueryKeys } from "@/lib/project-briefs";
import { markAndEnqueueProjectBriefRefresh, projectKnowledgeJobQueryKeys } from "@/lib/project-knowledge-jobs";
import {
  assignSessionToProject,
  getProjectActionErrorMessage,
  isProjectQueryKey,
  listProjects,
  projectQueryKeys,
} from "@/lib/projects";
import { useMultiSelectNotes } from "@/stores/useMultiSelectNotes";
import { trackEvent } from "@/utils/analytics-events";
import { NumberBadge } from "@typr/ui/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@typr/ui/components/ui/popover";
import { toast } from "@typr/ui/components/ui/toast";
import { useSessions } from "@typr/utils/contexts";

export function BulkActionBar() {
  const {
    getSelectedCount,
    clearSelection,
    isMultiSelectMode,
  } = useMultiSelectNotes();

  const selectedCount = getSelectedCount();

  if (!isMultiSelectMode || selectedCount === 0) {
    return null;
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: 10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 10, opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="pointer-events-none absolute inset-x-0 bottom-3 z-20 flex justify-center px-3"
      >
        <div className="pointer-events-auto flex items-center gap-0.5 rounded-full border-0 bg-background/90 px-1 py-1 shadow-float-pill backdrop-blur-md">
          <button
            type="button"
            onClick={clearSelection}
            className="flex items-center justify-center h-7 w-7 rounded-full text-muted-foreground hover:bg-surface-400 transition-colors"
          >
            <i className="ri-close-line text-sm" />
          </button>

          <NumberBadge value={selectedCount} aria-label={`${selectedCount} selected`} />

          <MoveToProjectButton />
          <TrashMenuButton />
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

function MoveToProjectButton() {
  const { t } = useLingui();
  const queryClient = useQueryClient();
  const sessionsStore = useSessions((s) => s.sessions);
  const { userId } = useTypr();
  const {
    selectedNoteIds,
    clearSelection,
  } = useMultiSelectNotes();
  const [open, setOpen] = useState(false);

  const projectsQuery = useQuery({
    queryKey: [projectQueryKeys.all],
    queryFn: listProjects,
  });

  const addToProjectMutation = useMutation({
    mutationFn: async ({ projectId, noteIds }: { projectId: string; noteIds: string[] }) => {
      await Promise.all(noteIds.map(noteId => assignSessionToProject(noteId, projectId)));
      return noteIds;
    },
    onSuccess: async (noteIds, variables) => {
      trackEvent("project_notes_added", userId, {
        project_id: variables.projectId,
        note_count: noteIds.length,
        source: "bulk_action",
      });
      await markAndEnqueueProjectBriefRefresh(variables.projectId);
      await Promise.all([
        queryClient.invalidateQueries({
          predicate: query => isProjectQueryKey(query.queryKey[0]),
        }),
        queryClient.invalidateQueries({
          queryKey: [projectKnowledgeJobQueryKeys.byProject, variables.projectId],
        }),
        queryClient.invalidateQueries({
          queryKey: [projectBriefQueryKeys.latest, variables.projectId],
        }),
        queryClient.invalidateQueries({
          queryKey: [projectBriefQueryKeys.freshness, variables.projectId],
        }),
        ...noteIds.map(noteId => sessionsStore[noteId]?.getState().refresh()).filter(Boolean),
      ]);
      clearSelection();
      setOpen(false);
    },
    onError: (error) => {
      toast({
        id: "bulk-move-project-error",
        title: <Trans>Couldn’t add notes</Trans>,
        content: getProjectActionErrorMessage(error),
      });
    },
  });

  const projects = projectsQuery.data ?? [];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-surface-400"
          aria-label={t`Add to project`}
        >
          <i className="ri-folder-transfer-line text-sm" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 rounded-lg border bg-popover p-1 shadow-float-surface" align="center" side="top">
        <div className="px-2 py-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <Trans>Add to project</Trans>
        </div>

        {projectsQuery.isLoading && (
          <div className="px-2 py-1.5 text-sm text-muted-foreground">
            <Trans>Loading projects…</Trans>
          </div>
        )}

        {!projectsQuery.isLoading && projects.length === 0 && (
          <div className="px-2 py-1.5 text-sm text-muted-foreground">
            <Trans>No projects yet.</Trans>
          </div>
        )}

        {projects.map(project => (
          <button
            key={project.id}
            type="button"
            disabled={addToProjectMutation.isPending}
            onClick={() => {
              addToProjectMutation.mutate({
                projectId: project.id,
                noteIds: Array.from(selectedNoteIds),
              });
            }}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground transition-colors hover:bg-surface-400 disabled:pointer-events-none disabled:opacity-50"
          >
            <ProjectIcon icon={project.icon_value} color={project.icon_color} size="sm" className="ring-0" />
            <span className="truncate">{project.name}</span>
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

function TrashMenuButton() {
  const { handleBulkDelete, isDeleting } = useBulkDelete();
  const { getSelectedCount } = useMultiSelectNotes();
  const [open, setOpen] = useState(false);
  const count = getSelectedCount();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex items-center justify-center h-7 w-7 rounded-full text-muted-foreground hover:bg-surface-400 transition-colors"
        >
          <i className="ri-more-fill text-sm" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-48 rounded-lg border bg-popover p-1 shadow-float-surface" align="end" side="top">
        <button
          type="button"
          disabled={isDeleting}
          onClick={() => {
            setOpen(false);
            handleBulkDelete();
          }}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-destructive transition-colors hover:bg-destructive/10"
        >
          <i className="ri-delete-bin-line text-sm" />
          {count === 1 ? <Trans>Delete note</Trans> : <Trans>Delete {count} notes</Trans>}
        </button>
      </PopoverContent>
    </Popover>
  );
}
