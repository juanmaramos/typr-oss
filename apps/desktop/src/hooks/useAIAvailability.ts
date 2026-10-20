import { useQuery } from "@tanstack/react-query";
import { commands as connectorCommands } from "@typr/plugin-connector";
import { AUTO_CLOUD_MODEL_ID } from "@typr/utils";

import { cloudModelAvailability, localModelAvailability, modelAvailability } from "@/lib/model-availability";
import {
  cloudChatModelQueryOptions,
  customEndpointEnabledQueryOptions,
  localChatModelQueryOptions,
} from "@/lib/model-selection";
import {
  getCloudProviderIdFromModelId,
  hasAnyCloudApiKey,
  hasCloudApiKey,
  useCloudApiKeys,
} from "./cloud-model-catalog";
import { useModelLifecycle } from "./useModelState";
import { usePlatform } from "./usePlatform";

/** Mirrors connector routing: selected cloud, Auto's configured cloud, custom endpoint, selected local. */
export function useAIAvailability() {
  const lifecycle = useModelLifecycle("llm");
  const platform = usePlatform();
  const localSelection = useQuery(localChatModelQueryOptions());
  const cloudSelection = useQuery(cloudChatModelQueryOptions());
  const keys = useCloudApiKeys();
  const customEnabled = useQuery(customEndpointEnabledQueryOptions());
  const customConnection = useQuery({
    queryKey: ["custom-llm-connection"],
    queryFn: () => connectorCommands.getCustomLlmConnection(),
    staleTime: 30_000,
  });
  const customModel = useQuery({
    queryKey: ["custom-llm-model"],
    queryFn: () => connectorCommands.getCustomLlmModel(),
    staleTime: 30_000,
  });
  const selectedCloud = cloudSelection.data ?? "";
  const provider = getCloudProviderIdFromModelId(selectedCloud);
  const hasCloudModel = selectedCloud === AUTO_CLOUD_MODEL_ID
    ? hasAnyCloudApiKey(keys.data)
    : !!provider && hasCloudApiKey(keys.data, provider);
  const hasCustomEndpoint = customEnabled.data === true && !!customConnection.data?.api_base.trim()
    && !!customModel.data?.trim();
  const availability = (() => {
    if (cloudSelection.isError) {
      return modelAvailability("error", "selection-read-failed");
    }
    if (cloudSelection.isPending) {
      return modelAvailability("checking");
    }
    if (selectedCloud && selectedCloud !== AUTO_CLOUD_MODEL_ID) {
      return provider ? cloudModelAvailability(keys, hasCloudModel) : modelAvailability("unavailable", "unknown-model");
    }
    if (selectedCloud === AUTO_CLOUD_MODEL_ID) {
      const cloud = cloudModelAvailability(keys, hasCloudModel);
      if (cloud.status !== "needs-api-key") {
        return cloud;
      }
    }
    if (customEnabled.isError) {
      return modelAvailability("error", "configuration-read-failed");
    }
    if (customEnabled.isPending) {
      return modelAvailability("checking");
    }
    if (customEnabled.data) {
      if (customConnection.isError || customModel.isError) {
        return modelAvailability("error", "configuration-read-failed");
      }
      if (customConnection.isPending || customModel.isPending) {
        return modelAvailability("checking");
      }
      return modelAvailability(
        hasCustomEndpoint ? "ready" : "unavailable",
        hasCustomEndpoint ? "custom-endpoint" : "endpoint-configuration-required",
      );
    }
    if (platform.isError) {
      return modelAvailability("error", "platform-read-failed");
    }
    if (platform.isLoading) {
      return modelAvailability("checking");
    }
    if (!platform.supportsLocalModels) {
      return modelAvailability("needs-api-key");
    }
    if (localSelection.isError) {
      return modelAvailability("error", "selection-read-failed");
    }
    if (localSelection.isPending) {
      return modelAvailability("checking");
    }
    return localModelAvailability(lifecycle, lifecycle.getModel(localSelection.data));
  })();
  const retry = () =>
    Promise.all([
      platform.refetch(),
      lifecycle.refetch(),
      localSelection.refetch(),
      cloudSelection.refetch(),
      keys.refetch(),
      customEnabled.refetch(),
      customConnection.refetch(),
      customModel.refetch(),
    ]);
  return {
    availability,
    retry,
  };
}
