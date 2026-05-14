import { debugLogFor } from "@/components/utils/debug-logger";
import { useTypr } from "@/contexts";
import { useAllModels } from "@/hooks/useModels";
import { projectBriefQueryKeys } from "@/lib/project-briefs";
import { getProjectSourceDigestProgress } from "@/lib/project-knowledge";
import {
  enqueueProjectBriefRefreshJob,
  isActiveProjectKnowledgeJob,
  listProjectKnowledgeJobs,
  projectKnowledgeJobQueryKeys,
} from "@/lib/project-knowledge-jobs";
import { getProjectActionErrorMessage } from "@/lib/projects";
import { trackEvent } from "@/utils/analytics-events";
import type { ProjectBrief } from "@typr/plugin-db";
import { toast } from "@typr/ui/components/ui/toast";
import { resolveAiTaskModelId } from "@typr/utils";
import { commands as connectorCommands } from "@typr/plugin-connector";
import { useIsMutating, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export function getProjectBriefRefreshMutationKey(projectId: string) {
  return [projectBriefQueryKeys.refresh, projectId] as const;
}

function debugProjectBrief(event: string, payload?: Record<string, unknown>) {
  debugLogFor("DEBUG_PROJECT_BRIEF", "ProjectBriefDebug", event, payload ?? {});
}

export function useProjectBriefRefresh(projectId: string) {
  const queryClient = useQueryClient();
  const { userId } = useTypr();
  const { selectedModel, isAutoMode } = useAllModels();
  const mutationKey = getProjectBriefRefreshMutationKey(projectId);
  const activeRefreshCount = useIsMutating({ mutationKey, exact: true });
  const jobsQuery = useQuery({
    queryKey: [projectKnowledgeJobQueryKeys.byProject, projectId],
    queryFn: () => listProjectKnowledgeJobs(projectId),
    enabled: Boolean(projectId),
    refetchInterval: 2_000,
  });
  const digestProgressQuery = useQuery({
    queryKey: ["project-source-digest-progress", projectId],
    queryFn: () => getProjectSourceDigestProgress(projectId),
    enabled: Boolean(projectId),
    refetchInterval: 2_000,
  });
  const activeJobCount = (jobsQuery.data ?? []).filter(isActiveProjectKnowledgeJob).length;

  const mutation = useMutation({
    mutationKey,
    mutationFn: async (variables?: { sourceCount?: number; trigger?: "auto" | "manual" }) => {
      const taskDefaults = await connectorCommands.getAiTaskDefaults().catch(() => null);
      const modelId = resolveAiTaskModelId({
        task: "projectBrief",
        defaults: taskDefaults,
        fallbackModelId: isAutoMode ? "auto" : selectedModel?.id ?? "auto",
      }) ?? "auto";
      debugProjectBrief("refresh:enqueue", {
        projectId,
        modelId,
        isAutoMode,
        trigger: variables?.trigger ?? "manual",
      });

      return enqueueProjectBriefRefreshJob({
        projectId,
        modelId,
      });
    },
    onMutate: async (variables) => {
      trackEvent("project_brief_refresh", userId, {
        project_id: projectId,
        trigger: variables?.trigger ?? "manual",
        source_count: variables?.sourceCount ?? 0,
        status: "requested",
      });

      const latestKey = [projectBriefQueryKeys.latest, projectId];
      await queryClient.cancelQueries({ queryKey: latestKey });

      const currentBrief = queryClient.getQueryData<ProjectBrief | null>(latestKey);
      if (currentBrief) {
        queryClient.setQueryData<ProjectBrief>(latestKey, {
          ...currentBrief,
          status: "Building",
          error_message: null,
          updated_at: new Date().toISOString(),
        });
      }
    },
    onSuccess: (job, variables) => {
      trackEvent("project_brief_refresh", userId, {
        project_id: projectId,
        trigger: variables?.trigger ?? "manual",
        source_count: variables?.sourceCount ?? 0,
        status: job ? "queued" : "skipped",
      });
    },
    onError: (error, variables) => {
      const message = getProjectActionErrorMessage(error);
      const trigger = variables?.trigger ?? "manual";
      trackEvent("project_brief_refresh", userId, {
        project_id: projectId,
        trigger,
        source_count: variables?.sourceCount ?? 0,
        status: "failed",
      });
      debugProjectBrief("refresh:error", {
        projectId,
        trigger,
        sourceCount: variables?.sourceCount ?? 0,
        error: message,
      });

      if (trigger === "auto") {
        return;
      }

      toast({
        id: "project-brief-refresh-error",
        title: "Couldn’t refresh brief",
        content: message,
      });
    },
    onSettled: async () => {
      debugProjectBrief("refresh:settled", { projectId });

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [projectKnowledgeJobQueryKeys.byProject, projectId] }),
        queryClient.invalidateQueries({ queryKey: ["project-source-digest-progress", projectId] }),
        queryClient.invalidateQueries({ queryKey: [projectBriefQueryKeys.latest, projectId] }),
        queryClient.invalidateQueries({ queryKey: [projectBriefQueryKeys.freshness, projectId] }),
      ]);
    },
  });

  return {
    ...mutation,
    digestProgress: digestProgressQuery.data ?? null,
    isRefreshing: mutation.isPending || activeRefreshCount > 0 || activeJobCount > 0,
  };
}
