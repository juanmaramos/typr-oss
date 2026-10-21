import { cloudModelAvailability } from "@/lib/model-availability";
import { useLingui } from "@lingui/react/macro";
import { type QueryClient, useQuery } from "@tanstack/react-query";
import { isTauri } from "@tauri-apps/api/core";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { useMemo } from "react";
import { z } from "zod";

import { commands as connectorCommands } from "@typr/plugin-connector";

import { ModelOption, ModelProvider, ModelType } from "../types/models";
import { useCloudModelSelection } from "./useCloudModelSelection";

export type CloudProviderId = "openai" | "groq" | "openrouter";

export type CloudApiKeys = Record<CloudProviderId, string>;

type ProviderCatalogConfig = {
  provider: ModelProvider;
  label: string;
  prefix: string;
  modelsUrl: string;
  icon: string;
};

const providerModelSchema = z.object({
  id: z.string().min(1),
  name: z.string().optional(),
  description: z.string().optional(),
  owned_by: z.string().optional(),
  created: z.number().finite().optional(),
  active: z.boolean().optional(),
  architecture: z.object({
    modality: z.string().optional(),
    input_modalities: z.array(z.string()).optional(),
    output_modalities: z.array(z.string()).optional(),
  }).optional(),
});
type ProviderApiModel = z.infer<typeof providerModelSchema>;
const providerCatalogSchema = z.object({ data: z.array(providerModelSchema) });
export const CLOUD_CATALOG_STALE_MS = 10 * 60 * 1000;

const PROVIDER_CONFIG: Record<CloudProviderId, ProviderCatalogConfig> = {
  openai: {
    provider: ModelProvider.OPENAI,
    label: "OpenAI",
    prefix: "openai-",
    modelsUrl: "https://api.openai.com/v1/models",
    icon: "ri-openai-fill",
  },
  groq: {
    provider: ModelProvider.GROQ,
    label: "Groq",
    prefix: "groq-",
    modelsUrl: "https://api.groq.com/openai/v1/models",
    icon: "ri-flashlight-fill",
  },
  openrouter: {
    provider: ModelProvider.OPENROUTER,
    label: "OpenRouter",
    prefix: "openrouter-",
    modelsUrl: "https://openrouter.ai/api/v1/models?sort=top-weekly&output_modalities=text",
    icon: "ri-openrouter-fill",
  },
};

const MODEL_ID_EXCLUSIONS = [
  ":batch",
  "audio",
  "clip",
  "dall-e",
  "embedding",
  "guard",
  "image",
  "moderation",
  "omni-moderation",
  "prompt-guard",
  "realtime",
  "rerank",
  "safeguard",
  "speech",
  "transcribe",
  "tts",
  "video",
  "whisper",
];

function hasText(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeApiKey(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

function titleCaseModelId(modelId: string): string {
  const leaf = modelId.split("/").pop() ?? modelId;

  return leaf
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .replace(/^Gpt (\d+(?:\.\d+)?)/, "GPT-$1")
    .replace(/^O(\d)/, "o$1");
}

function vendorFromModelId(provider: CloudProviderId, modelId: string, ownedBy?: string): string {
  if (provider === "openai") {
    return "OpenAI";
  }
  if (provider === "groq") {
    return ownedBy ? titleCaseModelId(ownedBy) : "Groq";
  }

  const vendor = modelId.split("/")[0];
  return vendor ? titleCaseModelId(vendor) : "OpenRouter";
}

function iconForVendor(provider: CloudProviderId, vendor: string): string {
  const normalized = vendor.toLowerCase();
  if (normalized.includes("openai")) {
    return "ri-openai-fill";
  }
  if (normalized.includes("anthropic")) {
    return "ri-anthropic-fill";
  }
  if (normalized.includes("google")) {
    return "ri-google-fill";
  }
  if (normalized.includes("meta")) {
    return "ri-meta-fill";
  }
  if (provider === "groq") {
    return "ri-flashlight-fill";
  }
  if (provider === "openrouter") {
    return "ri-openrouter-fill";
  }

  return PROVIDER_CONFIG[provider].icon;
}

function isTextModel(provider: CloudProviderId, model: ProviderApiModel): boolean {
  const id = model.id?.toLowerCase() ?? "";
  if (!id || model.active === false) {
    return false;
  }

  if (MODEL_ID_EXCLUSIONS.some((pattern) => id.includes(pattern))) {
    return false;
  }

  // /models omits endpoint support. These direct-OpenAI families require Responses
  // or legacy Completions; OpenRouter can expose its own chat-compatible routes.
  if (
    provider === "openai" && (
      /-instruct(?:-|$)/.test(id)
      || /^(?:gpt-5(?:\.\d+)?-pro|o[13]-pro)(?:-|$)/.test(id)
      || ["babbage", "davinci", "deep-research", "computer-use", "codex", "sora"].some(part => id.includes(part))
    )
  ) {
    return false;
  }

  if (provider === "openrouter") {
    const outputModalities = model.architecture?.output_modalities?.map((modality) => modality.toLowerCase()) ?? [];
    if (outputModalities.length > 0) {
      return outputModalities.length === 1 && outputModalities[0] === "text";
    }

    const outputModality = model.architecture?.modality?.toLowerCase().split("->")[1];
    if (outputModality && outputModality.split("+").some((modality) => modality !== "text")) {
      return false;
    }
  }

  return true;
}

async function providerFetch(url: string, apiKey: string, signal: AbortSignal): Promise<Response> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  if (isTauri()) {
    return tauriFetch(url, { method: "GET", headers, signal });
  }

  return fetch(url, { method: "GET", headers, signal });
}

async function fetchProviderModels(
  provider: CloudProviderId,
  apiKey: string,
  signal: AbortSignal,
): Promise<ProviderApiModel[]> {
  const normalizedKey = normalizeApiKey(apiKey);
  if (!normalizedKey && provider !== "openrouter") {
    return [];
  }

  const response = await providerFetch(PROVIDER_CONFIG[provider].modelsUrl, normalizedKey, signal);
  if (!response.ok) {
    throw new Error(`models_${provider}_${response.status}`);
  }

  const payload = providerCatalogSchema.parse(await response.json());
  const models = payload.data.filter(model => isTextModel(provider, model));
  // OpenRouter supplies weekly usage ordering. Direct providers expose creation dates.
  return provider === "openrouter" ? models : models.sort((a, b) => (b.created ?? 0) - (a.created ?? 0));
}

// Separate account-specific catalogues without putting API keys into query identifiers.
async function catalogScope(apiKey: string) {
  if (!apiKey) {
    return "public";
  }
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(apiKey));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

export async function getCloudApiKeys(): Promise<CloudApiKeys & { catalogScopes: Record<CloudProviderId, string> }> {
  const [openai, groq, openrouter] = await Promise.all([
    connectorCommands.getOpenaiApiKey(),
    connectorCommands.getGroqApiKey(),
    connectorCommands.getOpenrouterApiKey(),
  ]);

  const keys = {
    openai: normalizeApiKey(openai),
    groq: normalizeApiKey(groq),
    openrouter: normalizeApiKey(openrouter),
  };
  const [openaiScope, groqScope, openrouterScope] = await Promise.all([
    catalogScope(keys.openai),
    catalogScope(keys.groq),
    catalogScope(keys.openrouter),
  ]);
  return { ...keys, catalogScopes: { openai: openaiScope, groq: groqScope, openrouter: openrouterScope } };
}

export function hasCloudApiKey(keys: CloudApiKeys | undefined, provider: CloudProviderId): boolean {
  return hasText(keys?.[provider]);
}

export function hasAnyCloudApiKey(keys: CloudApiKeys | undefined): boolean {
  return hasCloudApiKey(keys, "openai")
    || hasCloudApiKey(keys, "groq")
    || hasCloudApiKey(keys, "openrouter");
}

export function getCloudProviderIdFromModelId(modelId: string | null | undefined): CloudProviderId | null {
  if (!modelId) {
    return null;
  }
  if (modelId.startsWith(PROVIDER_CONFIG.openai.prefix)) {
    return "openai";
  }
  if (modelId.startsWith(PROVIDER_CONFIG.groq.prefix)) {
    return "groq";
  }
  if (modelId.startsWith(PROVIDER_CONFIG.openrouter.prefix)) {
    return "openrouter";
  }

  return null;
}

export function getCloudProviderLabel(provider: CloudProviderId): string {
  return PROVIDER_CONFIG[provider].label;
}

export function getCloudProviderIcon(provider: CloudProviderId): string {
  return PROVIDER_CONFIG[provider].icon;
}

function getFullCloudModelId(provider: CloudProviderId, providerModelId: string): string {
  return `${PROVIDER_CONFIG[provider].prefix}${providerModelId.trim()}`;
}

function createModelOption(
  provider: CloudProviderId,
  modelId: string,
  options: {
    name: string;
    description?: string;
    vendor: string;
    icon: string;
    hasApiKey: boolean;
    selectedCloudModelId?: string;
    source: ModelOption["source"];
  },
): ModelOption {
  const config = PROVIDER_CONFIG[provider];
  const fullId = getFullCloudModelId(provider, modelId);

  return {
    id: fullId,
    providerModelId: modelId,
    name: options.name,
    provider: config.provider,
    type: ModelType.CLOUD,
    isAvailable: options.hasApiKey,
    isDownloaded: options.hasApiKey,
    isDownloading: false,
    isSelected: options.selectedCloudModelId === fullId,
    description: options.hasApiKey ? options.description : undefined,
    size: "0 MB",
    customIcon: options.icon,
    vendor: options.vendor,
    isCloud: true,
    source: options.source,
  };
}

export function useCloudApiKeys() {
  return useQuery({
    queryKey: ["cloud-api-keys"],
    queryFn: getCloudApiKeys,
    staleTime: 30 * 1000,
  });
}

export function useCloudProviderModels(provider: CloudProviderId) {
  const { selectedCloudModelId } = useCloudModelSelection();
  const cloudApiKeysQuery = useCloudApiKeys();
  const apiKey = cloudApiKeysQuery.data?.[provider] ?? "";
  const hasApiKey = hasText(apiKey);

  const providerModelsQuery = useQuery({
    queryKey: ["cloud-provider-models", provider, cloudApiKeysQuery.data?.catalogScopes[provider]],
    queryFn: ({ signal }) => fetchProviderModels(provider, apiKey, signal),
    enabled: cloudApiKeysQuery.isSuccess && (hasApiKey || provider === "openrouter"),
    staleTime: CLOUD_CATALOG_STALE_MS,
    gcTime: 24 * 60 * 60 * 1000,
    refetchInterval: CLOUD_CATALOG_STALE_MS,
    refetchOnReconnect: "always",
    retry: 1,
  });

  const models = useMemo((): ModelOption[] => {
    const byId = new Map<string, ModelOption>();

    for (const liveModel of providerModelsQuery.data ?? []) {
      if (!liveModel.id || byId.has(liveModel.id)) {
        continue;
      }

      const vendor = vendorFromModelId(provider, liveModel.id, liveModel.owned_by);
      byId.set(
        liveModel.id,
        createModelOption(provider, liveModel.id, {
          name: liveModel.name || titleCaseModelId(liveModel.id),
          description: liveModel.description,
          vendor,
          icon: iconForVendor(provider, vendor),
          hasApiKey,
          selectedCloudModelId,
          source: "provider",
        }),
      );
    }

    const selectedProvider = getCloudProviderIdFromModelId(selectedCloudModelId);
    const selectedProviderModelId = selectedCloudModelId?.replace(PROVIDER_CONFIG[provider].prefix, "");
    if (
      selectedProvider === provider
      && selectedProviderModelId
      && !byId.has(selectedProviderModelId)
    ) {
      const vendor = vendorFromModelId(provider, selectedProviderModelId);
      byId.set(
        selectedProviderModelId,
        createModelOption(provider, selectedProviderModelId, {
          name: titleCaseModelId(selectedProviderModelId),
          vendor,
          icon: iconForVendor(provider, vendor),
          hasApiKey,
          selectedCloudModelId,
          source: "manual",
        }),
      );
    }

    return Array.from(byId.values()).map(model => ({
      ...model,
      availability: cloudModelAvailability(cloudApiKeysQuery, hasApiKey),
    })).sort((a, b) => {
      if (a.isSelected && !b.isSelected) {
        return -1;
      }
      if (!a.isSelected && b.isSelected) {
        return 1;
      }
      return 0;
    });
  }, [
    hasApiKey,
    provider,
    providerModelsQuery.data,
    selectedCloudModelId,
    cloudApiKeysQuery.isPending,
    cloudApiKeysQuery.isError,
  ]);

  return {
    models,
    hasApiKey,
    apiKey,
    isLoading: cloudApiKeysQuery.isLoading || providerModelsQuery.isLoading,
    error: cloudApiKeysQuery.error ?? providerModelsQuery.error,
    refetch: providerModelsQuery.refetch,
    catalog: providerModelsQuery,
  };
}

export function refreshCloudCatalogs(queryClient: QueryClient) {
  return queryClient.refetchQueries({
    queryKey: ["cloud-provider-models"],
    type: "active",
    predicate: query => query.isStaleByTime(CLOUD_CATALOG_STALE_MS),
  });
}

export function useCloudCatalogLabel() {
  const { t } = useLingui();
  return (provider: CloudProviderId) =>
    provider === "openrouter" ? t`Popular this week on OpenRouter` : t`Newest available`;
}

/** Both pickers preserve provider order and pin the saved choice outside the five-model preview. */
export function getCloudProviderSection(
  models: ModelOption[],
  provider: CloudProviderId,
  expanded: boolean,
  search = "",
) {
  const providerModels = models.filter(model => getCloudProviderIdFromModelId(model.id) === provider);
  const selectedModel = providerModels.find(model => model.isSelected);
  const others = providerModels.filter(model => !model.isSelected);
  const query = search.trim().toLowerCase();
  const matches = expanded
    ? others.filter(model =>
      [model.name, model.vendor, model.providerModelId, model.description].filter(Boolean).join(" ").toLowerCase()
        .includes(query)
    )
    : others.slice(0, 5);
  return {
    provider,
    expanded,
    selectedModel,
    models: selectedModel ? [selectedModel, ...matches] : matches,
    totalCount: providerModels.length,
    hiddenCount: Math.max(others.length - 5, 0),
  };
}
