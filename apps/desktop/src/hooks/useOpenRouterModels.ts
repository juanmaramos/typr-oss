import { DEFAULT_AUTO_CLOUD_MODEL_ID } from "@typr/utils";

import { useCloudProviderModels } from "./cloud-model-catalog";

export const OPENROUTER_DEFAULT_MODEL_ID = DEFAULT_AUTO_CLOUD_MODEL_ID;

export function useOpenRouterModels() {
  return useCloudProviderModels("openrouter");
}

export function getOpenRouterModelId(fullId: string): string {
  return fullId.replace("openrouter-", "");
}

export function isOpenRouterModel(modelId: string): boolean {
  return modelId.startsWith("openrouter-");
}
