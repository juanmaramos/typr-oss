import { useQuery } from "@tanstack/react-query";

import { commands as localLlmCommands, type SupportedModel } from "@typr/plugin-local-llm";
import { useModelState } from "./useModelState";

/**
 * 🎯 CLEAN: Single source of truth for model data
 *
 * Senior engineer approach:
 * - Backend is authoritative (no hardcoded data)
 * - No transformations (use backend types directly)
 * - Simple, predictable behavior
 */
export function useModelRegistry() {
  // Fetch model metadata directly from backend (static data)
  const modelsQuery = useQuery({
    queryKey: ["models"],
    queryFn: () => localLlmCommands.listSupportedModels(),
    staleTime: 60 * 1000, // 1 minute - models don't change often
  });

  // ✅ FIXED: Use event-driven state instead of polling
  const { getModel, isLoading: stateLoading } = useModelState();

  // Enhanced models with status (no transformations, clean types)
  const modelsWithStatus = (modelsQuery.data || []).map(model => ({
    ...model,
    isDownloaded: getModel(model.id.toString())?.isDownloaded || false,
    isDownloading: getModel(model.id.toString())?.isDownloading || false,
  }));

  return {
    models: modelsWithStatus,

    // Convenient filters
    selectableModels: modelsWithStatus.filter(m => m.show_in_selector),
    downloadedModels: modelsWithStatus.filter(m => m.isDownloaded),
    downloadingModels: modelsWithStatus.filter(m => m.isDownloading),

    // Status
    isLoading: modelsQuery.isLoading || stateLoading,
    error: modelsQuery.error,

    // Actions
    refetch: () => {
      modelsQuery.refetch(); // Only refetch metadata, state comes via events
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
