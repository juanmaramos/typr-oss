import { useLingui } from "@lingui/react/macro";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useTypr } from "@/contexts";
import { projectBriefQueryKeys } from "@/lib/project-briefs";
import { markAndEnqueueProjectBriefRefresh, projectKnowledgeJobQueryKeys } from "@/lib/project-knowledge-jobs";
import {
  assignSessionToProject,
  getProjectActionErrorMessage,
  isProjectQueryKey,
} from "@/lib/projects";
import { trackEvent } from "@/utils/analytics-events";
import { toast } from "@typr/ui/components/ui/toast";
import { useSessions } from "@typr/utils/contexts";

export type ProjectNoteAddSource = "bulk_action" | "sidebar_drag_drop";

interface AddNotesToProjectVariables {
  projectId: string;
  noteIds: string[];
}

export function useAddNotesToProject(source: ProjectNoteAddSource) {
  const { t } = useLingui();
  const queryClient = useQueryClient();
  const sessionsStore = useSessions(state => state.sessions);
  const { userId } = useTypr();

  return useMutation({
    mutationFn: async ({ projectId, noteIds }: AddNotesToProjectVariables) => {
      await Promise.all(noteIds.map(noteId => assignSessionToProject(noteId, projectId)));
      return noteIds;
    },
    onSuccess: async (noteIds, variables) => {
      trackEvent("project_notes_added", userId, {
        project_id: variables.projectId,
        note_count: noteIds.length,
        source,
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
    },
    onError: (error) => {
      toast({
        id: "add-project-notes-error",
        title: t`Couldn’t add notes`,
        content: getProjectActionErrorMessage(error),
      });
    },
  });
}
