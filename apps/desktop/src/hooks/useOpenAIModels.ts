import { useCloudProviderModels } from "./cloud-model-catalog";

export function useOpenAIModels() {
  return useCloudProviderModels("openai");
}

export function getOpenAIModelId(fullId: string): string {
  return fullId.replace("openai-", "");
}

export function isOpenAIModel(modelId: string): boolean {
  return modelId.startsWith("openai-");
}
