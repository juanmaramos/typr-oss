import { useCloudProviderModels } from "./cloud-model-catalog";

export function useGroqModels() {
  return useCloudProviderModels("groq");
}

export function getGroqModelId(fullId: string): string {
  return fullId.replace("groq-", "");
}

export function isGroqModel(modelId: string): boolean {
  return modelId.startsWith("groq-");
}
