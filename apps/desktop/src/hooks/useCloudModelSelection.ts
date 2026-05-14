import { commands as connectorCommands } from "@typr/plugin-connector";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

/** Sentinel value stored when user selects Auto mode */
export const AUTO_MODEL_ID = "auto";

/**
 * Hook for managing cloud model selection state
 *
 * This stores the currently selected cloud model using the connector store.
 * When a cloud model is selected, it takes precedence over local model selection.
 *
 * Special value "auto" delegates to the runtime resolver:
 * - Cloud Auto resolves to the best configured provider model
 * - Empty storage means no cloud model is selected, so local/manual models can be used
 *
 * Auto must be stored explicitly. This keeps selecting a local model from being
 * immediately displayed as Auto after the cloud model selection is cleared.
 */
export function useCloudModelSelection() {
  const queryClient = useQueryClient();

  // Get current cloud model selection from store.
  const cloudModelQuery = useQuery({
    queryKey: ["cloud-model", "current"],
    queryFn: async () => {
      const result = await connectorCommands.getCloudModel();
      return result?.trim() ?? "";
    },
    staleTime: 30 * 1000,
  });

  const selectCloudModel = useCallback(async (modelId: string) => {
    await connectorCommands.setCloudModel(modelId);

    // Invalidate relevant queries to trigger re-renders
    queryClient.invalidateQueries({ queryKey: ["cloud-model", "current"] });
    queryClient.invalidateQueries({ queryKey: ["models", "current"] });
    queryClient.invalidateQueries({ queryKey: ["models"] });
  }, [queryClient]);

  const clearCloudSelection = useCallback(async () => {
    await connectorCommands.setCloudModel("");

    // Invalidate queries
    queryClient.invalidateQueries({ queryKey: ["cloud-model", "current"] });
    queryClient.invalidateQueries({ queryKey: ["models", "current"] });
    queryClient.invalidateQueries({ queryKey: ["models"] });
  }, [queryClient]);

  const selectedCloudModelId = cloudModelQuery.data ?? "";
  const isAutoMode = selectedCloudModelId === AUTO_MODEL_ID;

  return {
    selectedCloudModelId,
    selectCloudModel,
    clearCloudSelection,
    hasCloudSelection: selectedCloudModelId.length > 0 && selectedCloudModelId !== AUTO_MODEL_ID,
    isAutoMode,
    isLoading: cloudModelQuery.isLoading,
  };
}
