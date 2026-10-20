import { useQuery } from "@tanstack/react-query";
import { useModelPreferences } from "./useModelPreferences";
import { cloudChatModelQueryOptions } from "@/lib/model-selection";

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
  const { selectCloudChat } = useModelPreferences();
  const cloudModelQuery = useQuery(cloudChatModelQueryOptions());

  const selectedCloudModelId = cloudModelQuery.data ?? "";
  const isAutoMode = selectedCloudModelId === AUTO_MODEL_ID;

  return {
    selectedCloudModelId,
    selectCloudModel: selectCloudChat,
    hasCloudSelection: selectedCloudModelId.length > 0 && !isAutoMode,
    isAutoMode,
    isLoading: cloudModelQuery.isLoading,
  };
}
