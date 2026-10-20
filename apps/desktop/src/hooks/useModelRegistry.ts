import { getLocalChatModelDescription } from "@/lib/model-metadata";
import { useLingui } from "@lingui/react";
import { useQuery } from "@tanstack/react-query";

import { localModelAvailability } from "@/lib/model-availability";
import { commands as localLlmCommands, type SupportedModel } from "@typr/plugin-local-llm";
import { useModelLifecycle } from "./useModelState";

export function useModelRegistry() {
  useLingui();
  // Fetch model metadata directly from backend (static data)
  const modelsQuery = useQuery({
    queryKey: ["models"],
    queryFn: () => localLlmCommands.listSupportedModels(),
    staleTime: 60 * 1000, // 1 minute - models don't change often
  });

  // ✅ FIXED: Use event-driven state instead of polling
  const lifecycle = useModelLifecycle("llm");
  const { getModel } = lifecycle;

  // Enhanced models with status (no transformations, clean types)
  const modelsWithStatus = (modelsQuery.data || []).map(model => ({
    ...model,
    description: getLocalChatModelDescription(model.id),
    isDownloaded: getModel(model.id.toString())?.isDownloaded,
    isDownloading: getModel(model.id.toString())?.isDownloading,
    availability: localModelAvailability(lifecycle, getModel(model.id.toString())),
  }));

  return {
    models: modelsWithStatus,

    // Convenient filters
    selectableModels: modelsWithStatus.filter(m => m.show_in_selector),
    downloadedModels: modelsWithStatus.filter(m => m.isDownloaded),
    downloadingModels: modelsWithStatus.filter(m => m.isDownloading),

    // Status
    isLoading: modelsQuery.isPending || lifecycle.isPending,
    error: modelsQuery.error ?? lifecycle.error,

    // Actions
    refetch: () => {
      void modelsQuery.refetch();
      void lifecycle.refetch();
    },
  };
}

/**
 * Helper to get a specific model by ID
 */
export function useModel(modelId: SupportedModel) {
  const { models } = useModelRegistry();
  return models.find(m => m.id === modelId) || null;
}
