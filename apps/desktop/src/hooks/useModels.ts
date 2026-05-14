import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";

import { debugLogFor } from "@/components/utils/debug-logger";
import { commands as localLlmCommands, type SupportedModel } from "@typr/plugin-local-llm";
import { AUTO_MODEL_ID, useCloudModelSelection } from "./useCloudModelSelection";
import { isGroqModel, useGroqModels } from "./useGroqModels";
import { useModelRegistry } from "./useModelRegistry";
import { isOpenAIModel, useOpenAIModels } from "./useOpenAIModels";
import { isOpenRouterModel, useOpenRouterModels } from "./useOpenRouterModels";

import { ModelOption, ModelProvider, ModelType } from "../types/models";

/**
 * 🎯 CLEAN: Local models using proper backend types
 */
export function useLocalModels() {
  const { selectableModels: models, isLoading: modelsLoading, error: modelsError, refetch: refetchModels } =
    useModelRegistry();
  const { hasCloudSelection, isLoading: cloudSelectionLoading } = useCloudModelSelection();

  // Get current selected model
  const currentModelQuery = useQuery({
    queryKey: ["models", "current"],
    queryFn: async () => {
      const result = await localLlmCommands.getCurrentModel();
      debugLogFor("DEBUG_MODEL", "ModelDebug", "current model from backend", { model: result });
      return result;
    },
    staleTime: 30 * 1000,
  });

  // Transform for legacy compatibility (clean approach)
  const localModelOptions = useMemo((): ModelOption[] => {
    return models.map(model => ({
      id: `local-${model.id}`,
      name: model.name,
      provider: ModelProvider.LOCAL,
      type: ModelType.LOCAL,
      isAvailable: true,
      isDownloaded: model.isDownloaded,
      isDownloading: model.isDownloading,
      // If cloud model is selected, no local model should show as selected
      isSelected: !hasCloudSelection && currentModelQuery.data === model.id,
      description: model.description,
      size: model.size,
      customIcon: model.icon,
    }));
  }, [models, currentModelQuery.data, hasCloudSelection]);

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
  const queryClient = useQueryClient();
  const { selectCloudModel, clearCloudSelection } = useCloudModelSelection();

  const selectLocalModel = useCallback(async (modelId: SupportedModel) => {
    try {
      // Clear any cloud model selection when selecting local model
      await clearCloudSelection();

      const previousModel = await localLlmCommands.getCurrentModel().catch(() => null);
      await localLlmCommands.setCurrentModel(modelId);

      const isServerRunning = await localLlmCommands.isServerRunning().catch(() => false);
      if (isServerRunning && previousModel !== modelId) {
        debugLogFor("DEBUG_MODEL", "ModelDebug", "restarting local LLM server for selected model", {
          previousModel,
          modelId,
        });
        await localLlmCommands.restartServer();
      }

      // Invalidate model queries
      queryClient.invalidateQueries({ queryKey: ["models", "current"] });
      queryClient.invalidateQueries({ queryKey: ["cloud-model", "current"] });
      queryClient.invalidateQueries({ queryKey: ["models"] });
    } catch (error) {
      console.error("❌ Failed to select local model:", error);
      throw error;
    }
  }, [queryClient, clearCloudSelection]);

  const selectModel = useCallback(async (model: ModelOption) => {
    if (model.type === ModelType.LOCAL) {
      const modelId = model.id.replace("local-", "") as SupportedModel;
      await selectLocalModel(modelId);
    } else if (model.type === ModelType.CLOUD && !model.isAvailable) {
      throw new Error("cloud_api_key_missing");
    } else if (model.type === ModelType.CLOUD && isOpenAIModel(model.id)) {
      // Select cloud model first - no need to clear local model
      // The cloud model selection takes precedence in the AI provider logic
      await selectCloudModel(model.id);

      // Force invalidate local model queries
      queryClient.invalidateQueries({ queryKey: ["models", "current"] });
    } else if (model.type === ModelType.CLOUD && isGroqModel(model.id)) {
      // Select cloud model first - no need to clear local model
      // The cloud model selection takes precedence in the AI provider logic
      await selectCloudModel(model.id);

      // Force invalidate local model queries
      queryClient.invalidateQueries({ queryKey: ["models", "current"] });
    } else if (model.type === ModelType.CLOUD && isOpenRouterModel(model.id)) {
      await selectCloudModel(model.id);

      queryClient.invalidateQueries({ queryKey: ["models", "current"] });
    }
  }, [selectLocalModel, selectCloudModel, queryClient]);

  return {
    selectModel,
    selectLocalModel,
  };
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

  // Currently selected model - prioritize cloud models when selected
  const selectedModel = useMemo(() => {
    // First check if there's a selected cloud model
    const selectedCloudModel = allModels.find(model => model.type === ModelType.CLOUD && model.isSelected);
    if (selectedCloudModel?.isAvailable) {
      return selectedCloudModel;
    }

    // Otherwise, use selected local model
    const selectedLocalModel = allModels.find(model => model.type === ModelType.LOCAL && model.isSelected);
    if (selectedLocalModel?.isDownloaded) {
      return selectedLocalModel;
    }

    // Fallback to first downloaded local model
    return allModels.find(model => model.type === ModelType.LOCAL && model.isDownloaded) || null;
  }, [allModels]);

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
