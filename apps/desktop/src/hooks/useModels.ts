import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";

import { localChatModelQueryOptions } from "@/lib/model-selection";
import { type SupportedModel } from "@typr/plugin-local-llm";
import { AUTO_MODEL_ID, useCloudModelSelection } from "./useCloudModelSelection";
import { useGroqModels } from "./useGroqModels";
import { useModelPreferences } from "./useModelPreferences";
import { useModelRegistry } from "./useModelRegistry";
import { useOpenAIModels } from "./useOpenAIModels";
import { useOpenRouterModels } from "./useOpenRouterModels";

import { ModelOption, ModelProvider, ModelType } from "../types/models";

/**
 * 🎯 CLEAN: Local models using proper backend types
 */
export function useLocalModels() {
  const { selectableModels: models, isLoading: modelsLoading, error: modelsError, refetch: refetchModels } =
    useModelRegistry();
  const { hasCloudSelection, isAutoMode, isLoading: cloudSelectionLoading } = useCloudModelSelection();

  // Get current selected model
  const currentModelQuery = useQuery(localChatModelQueryOptions());

  // Transform for legacy compatibility (clean approach)
  const localModelOptions = useMemo((): ModelOption[] => {
    return models.map(model => ({
      id: `local-${model.id}`,
      name: model.name,
      provider: ModelProvider.LOCAL,
      type: ModelType.LOCAL,
      isAvailable: model.availability.canSelect,
      availability: model.availability,
      isDownloaded: model.isDownloaded,
      isDownloading: model.isDownloading,
      // If cloud model is selected, no local model should show as selected
      isSelected: !hasCloudSelection && !isAutoMode && currentModelQuery.data === model.id,
      description: model.description,
      size: model.size,
      customIcon: model.icon,
    }));
  }, [models, currentModelQuery.data, hasCloudSelection, isAutoMode]);

  return {
    models: localModelOptions,
    currentModel: currentModelQuery.data,
    isLoading: modelsLoading || currentModelQuery.isLoading || cloudSelectionLoading,
    error: modelsError || currentModelQuery.error,
    refetch: () => {
      refetchModels();
      currentModelQuery.refetch();
    },
  };
}

/**
 * Cloud models including OpenAI and Groq
 * Previously called "custom models" but now includes our cloud providers
 */
export function useCustomModels() {
  const {
    models: openaiModels,
    isLoading: openaiLoading,
    error: openaiError,
    refetch: refetchOpenaiModels,
  } = useOpenAIModels();
  const {
    models: groqModels,
    isLoading: groqLoading,
    error: groqError,
    refetch: refetchGroqModels,
  } = useGroqModels();
  const {
    models: openRouterModels,
    isLoading: openRouterLoading,
    error: openRouterError,
    refetch: refetchOpenRouterModels,
  } = useOpenRouterModels();

  return {
    models: [...openaiModels, ...groqModels, ...openRouterModels], // Cloud providers
    isEnabled: true, // Cloud models are always enabled
    isLoading: openaiLoading || groqLoading || openRouterLoading,
    error: openaiError || groqError || openRouterError,
    refetch: () => {
      refetchOpenaiModels();
      refetchGroqModels();
      refetchOpenRouterModels();
    },
  };
}

/**
 * 🎯 CLEAN: Model selection actions
 */
export function useModelSelection() {
  const { selectLocalChat, selectCloudChat } = useModelPreferences();
  const selectModel = useCallback(async (model: ModelOption) => {
    if (model.availability && !model.availability.canSelect) {
      throw new Error("model_not_ready");
    }
    if (model.type === ModelType.LOCAL) {
      await selectLocalChat(model.id.replace(/^local-/, "") as SupportedModel);
    } else if (model.type === ModelType.CLOUD) {
      if (!model.isAvailable) {
        throw new Error("cloud_api_key_missing");
      }
      await selectCloudChat(model.id);
    }
  }, [selectLocalChat, selectCloudChat]);

  return { selectModel, selectLocalModel: selectLocalChat };
}

/**
 * 🎯 CLEAN: All available models
 */
export function useAllModels() {
  const { models: localModels, isLoading: localLoading, error: localError } = useLocalModels();
  const { models: customModels, isLoading: customLoading, error: customError } = useCustomModels();
  const { isAutoMode } = useCloudModelSelection();

  // Combine all model sources with proper sorting
  const allModels = useMemo((): ModelOption[] => {
    const combined = [...localModels, ...customModels];

    return combined.sort((a, b) => {
      // Sort by: selected first, then downloaded, then by vendor+name
      if (a.isSelected && !b.isSelected) {
        return -1;
      }
      if (!a.isSelected && b.isSelected) {
        return 1;
      }
      if (a.isAvailable && !b.isAvailable) {
        return -1;
      }
      if (!a.isAvailable && b.isAvailable) {
        return 1;
      }
      if (a.isDownloaded && !b.isDownloaded) {
        return -1;
      }
      if (!a.isDownloaded && b.isDownloaded) {
        return 1;
      }
      // Cloud models: sort by vendor first, then model name within vendor
      if (a.type === ModelType.CLOUD && b.type === ModelType.CLOUD) {
        const vendorCmp = (a.vendor || "").localeCompare(b.vendor || "");
        if (vendorCmp !== 0) {
          return vendorCmp;
        }
      }
      return (a.name || "").localeCompare(b.name || "");
    });
  }, [localModels, customModels]);

  // Show the saved selection even when it needs setup; display must not silently pick a different model.
  const selectedModel = useMemo(() => allModels.find(model => model.isSelected) ?? null, [allModels]);

  // Downloaded models only
  const downloadedModels = useMemo(() => allModels.filter(model => model.isDownloaded), [allModels]);

  return {
    allModels,
    downloadedModels,
    selectedModel,
    isAutoMode,
    isLoading: localLoading || customLoading,
    error: localError || customError,
  };
}

/**
 * 🎯 CLEAN: Model selection state management
 */
export function useModelSelectionState() {
  const { isAutoMode, selectCloudModel } = useCloudModelSelection();

  return {
    isAutoMode,
    setAutoMode: async () => {
      await selectCloudModel(AUTO_MODEL_ID);
    },
    setManualMode: () => {
      // Manual selection handled by selectModel functions — they call selectCloudModel directly
    },
  };
}
