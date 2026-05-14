import { useMemo } from "react";

import { commands as connectorCommands } from "@typr/plugin-connector";
import { AUTO_CLOUD_MODEL_ID } from "@typr/utils";
import { useQuery } from "@tanstack/react-query";

import {
  getCloudProviderIdFromModelId,
  hasAnyCloudApiKey,
  hasCloudApiKey,
  useCloudApiKeys,
} from "./cloud-model-catalog";
import { useCloudModelSelection } from "./useCloudModelSelection";
import { useModelRegistry } from "./useModelRegistry";

function hasText(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Single source of truth for AI model availability across UI surfaces.
 *
 * A model is considered usable if any of these are true:
 * - a local LLM model is downloaded
 * - a cloud model is selected and the matching provider API key exists
 * - Auto mode can resolve to at least one configured provider API key
 * - custom endpoint mode is enabled and has connection + model configured
 */
export function useAIAvailability() {
  const { downloadedModels, downloadingModels, isLoading: localModelsLoading } = useModelRegistry();
  const { hasCloudSelection, isLoading: cloudSelectionLoading, selectedCloudModelId } = useCloudModelSelection();
  const cloudApiKeysQuery = useCloudApiKeys();

  const customEnabledQuery = useQuery({
    queryKey: ["custom-llm-enabled"],
    queryFn: () => connectorCommands.getCustomLlmEnabled(),
    staleTime: 30 * 1000,
  });

  const customConnectionQuery = useQuery({
    queryKey: ["custom-llm-connection"],
    queryFn: () => connectorCommands.getCustomLlmConnection(),
    staleTime: 30 * 1000,
  });

  const customModelQuery = useQuery({
    queryKey: ["custom-llm-model"],
    queryFn: () => connectorCommands.getCustomLlmModel(),
    staleTime: 30 * 1000,
  });

  const hasLocalModel = downloadedModels.length > 0;
  const isLocalModelDownloading = downloadingModels.length > 0;
  const isPro = true;

  const hasCustomEndpoint = useMemo(() => {
    const customEnabled = customEnabledQuery.data === true;
    const hasCustomApiBase = hasText(customConnectionQuery.data?.api_base);
    const hasCustomModel = hasText(customModelQuery.data);

    return customEnabled && hasCustomApiBase && hasCustomModel;
  }, [customConnectionQuery.data?.api_base, customEnabledQuery.data, customModelQuery.data]);

  const selectedProvider = getCloudProviderIdFromModelId(selectedCloudModelId);
  const hasSelectedProviderKey = selectedProvider
    ? hasCloudApiKey(cloudApiKeysQuery.data, selectedProvider)
    : false;
  const hasAutoCloudModel = selectedCloudModelId === AUTO_CLOUD_MODEL_ID
    && hasAnyCloudApiKey(cloudApiKeysQuery.data);
  const hasCloudModel = (hasCloudSelection && hasSelectedProviderKey) || hasAutoCloudModel;

  const isCheckingAvailability = localModelsLoading
    || cloudSelectionLoading
    || cloudApiKeysQuery.isLoading
    || customEnabledQuery.isLoading
    || customConnectionQuery.isLoading
    || customModelQuery.isLoading;

  const hasUsableModel = hasLocalModel || hasCloudModel || hasCustomEndpoint;

  return {
    hasLocalModel,
    isLocalModelDownloading,
    hasCloudModel,
    hasCustomEndpoint,
    isPro,
    hasUsableModel,
    isCheckingAvailability,
  };
}
