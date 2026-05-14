import { useLingui } from "@lingui/react/macro";
import { useQuery } from "@tanstack/react-query";
import { isTauri } from "@tauri-apps/api/core";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { useMemo } from "react";

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

type ProviderApiModel = {
  id?: string;
  name?: string;
  description?: string;
  owned_by?: string;
  context_length?: number;
  architecture?: {
    modality?: string;
    input_modalities?: string[];
    output_modalities?: string[];
  };
};

type RecommendedModel = {
  id: string;
  slug: string;
  vendor: string;
  icon: string;
};

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
    modelsUrl: "https://openrouter.ai/api/v1/models",
    icon: "ri-openrouter-fill",
  },
};

const RECOMMENDED_MODELS: Record<CloudProviderId, RecommendedModel[]> = {
  openai: [
    {
      id: "gpt-5.5",
      slug: "gpt-5.5",
      vendor: "OpenAI",
      icon: "ri-openai-fill",
    },
    {
      id: "gpt-5.4-mini",
      slug: "gpt-5.4-mini",
      vendor: "OpenAI",
      icon: "ri-openai-fill",
    },
    {
      id: "gpt-5.4-nano",
      slug: "gpt-5.4-nano",
      vendor: "OpenAI",
      icon: "ri-openai-fill",
    },
  ],
  groq: [
    {
      id: "openai/gpt-oss-20b",
      slug: "gpt-oss-20b",
      vendor: "OpenAI",
      icon: "ri-openai-fill",
    },
    {
      id: "openai/gpt-oss-120b",
      slug: "gpt-oss-120b",
      vendor: "OpenAI",
      icon: "ri-openai-fill",
    },
    {
      id: "llama-3.3-70b-versatile",
      slug: "llama-3.3-70b",
      vendor: "Meta",
      icon: "ri-meta-fill",
    },
    {
      id: "llama-3.1-8b-instant",
      slug: "llama-3.1-8b",
      vendor: "Meta",
      icon: "ri-meta-fill",
    },
  ],
  openrouter: [
    {
      id: "openai/gpt-5.4-mini",
      slug: "gpt-5.4-mini",
      vendor: "OpenAI",
      icon: "ri-openai-fill",
    },
    {
      id: "openai/gpt-5.5",
      slug: "gpt-5.5",
      vendor: "OpenAI",
      icon: "ri-openai-fill",
    },
    {
      id: "anthropic/claude-haiku-4.5",
      slug: "claude-haiku-4.5",
      vendor: "Anthropic",
      icon: "ri-anthropic-fill",
    },
    {
      id: "anthropic/claude-sonnet-4.6",
      slug: "claude-sonnet-4.6",
      vendor: "Anthropic",
      icon: "ri-anthropic-fill",
    },
    {
      id: "google/gemini-3.1-pro-preview",
      slug: "gemini-3.1-pro",
      vendor: "Google",
      icon: "ri-google-fill",
    },
    {
      id: "google/gemini-3.1-flash-lite",
      slug: "gemini-3.1-flash-lite",
      vendor: "Google",
      icon: "ri-google-fill",
    },
    {
      id: "qwen/qwen3.6-flash",
      slug: "qwen3.6-flash",
      vendor: "Qwen",
      icon: "ri-sparkling-fill",
    },
    {
      id: "deepseek/deepseek-v4-flash",
      slug: "deepseek-v4-flash",
      vendor: "DeepSeek",
      icon: "ri-sparkling-fill",
    },
  ],
};

const MODEL_ID_EXCLUSIONS = [
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
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
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
  if (!id) {
    return false;
  }

  if (MODEL_ID_EXCLUSIONS.some((pattern) => id.includes(pattern))) {
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

async function providerFetch(url: string, apiKey?: string): Promise<Response> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  if (isTauri()) {
    return tauriFetch(url, { method: "GET", headers });
  }

  return fetch(url, { method: "GET", headers });
}

async function fetchProviderModels(provider: CloudProviderId, apiKey: string): Promise<ProviderApiModel[]> {
  const normalizedKey = normalizeApiKey(apiKey);
  if (!normalizedKey && provider !== "openrouter") {
    return [];
  }

  const response = await providerFetch(PROVIDER_CONFIG[provider].modelsUrl, normalizedKey);
  if (!response.ok) {
    throw new Error(`models_${provider}_${response.status}`);
  }

  const payload = await response.json() as { data?: ProviderApiModel[] };
  return (payload.data ?? []).filter((model) => isTextModel(provider, model));
}

export async function getCloudApiKeys(): Promise<CloudApiKeys> {
  const [openai, groq, openrouter] = await Promise.all([
    connectorCommands.getOpenaiApiKey().catch(() => ""),
    connectorCommands.getGroqApiKey().catch(() => ""),
    connectorCommands.getOpenrouterApiKey().catch(() => ""),
  ]);

  return {
    openai: normalizeApiKey(openai),
    groq: normalizeApiKey(groq),
    openrouter: normalizeApiKey(openrouter),
  };
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
    isRecommended?: boolean;
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
    isRecommended: options.isRecommended,
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
  const { t } = useLingui();
  const { selectedCloudModelId } = useCloudModelSelection();
  const cloudApiKeysQuery = useCloudApiKeys();
  const apiKey = cloudApiKeysQuery.data?.[provider] ?? "";
  const hasApiKey = hasText(apiKey);

  const getRecommendedName = (slug: string): string => {
    switch (slug) {
      case "gpt-5.5":
        return t`GPT-5.5`;
      case "gpt-5.4-nano":
        return t`GPT-5.4 Nano`;
      case "gpt-oss-20b":
        return t`GPT-OSS 20B`;
      case "gpt-oss-120b":
        return t`GPT-OSS 120B`;
      case "gpt-5.4-mini":
        return t`GPT-5.4 Mini`;
      case "llama-3.3-70b":
        return t`Llama 3.3 70B`;
      case "llama-3.1-8b":
        return t`Llama 3.1 8B`;
      case "claude-haiku-4.5":
        return t`Haiku 4.5`;
      case "claude-sonnet-4.6":
        return t`Sonnet 4.6`;
      case "gemini-3.1-pro":
        return t`Gemini 3.1 Pro`;
      case "gemini-3.1-flash-lite":
        return t`Gemini 3.1 Flash Lite`;
      case "qwen3.6-flash":
        return t`Qwen3.6 Flash`;
      case "deepseek-v4-flash":
        return t`DeepSeek V4 Flash`;
      default:
        return slug;
    }
  };

  const getRecommendedDescription = (slug: string): string => {
    switch (slug) {
      case "gpt-5.5":
        return t`Best quality for complex work`;
      case "gpt-5.4-nano":
        return t`Fastest, lowest-cost OpenAI option`;
      case "gpt-oss-20b":
        return t`Fastest Groq text model for everyday tasks`;
      case "gpt-oss-120b":
        return t`Stronger open-weight reasoning on Groq`;
      case "gpt-5.4-mini":
        return t`Best default balance of speed and quality`;
      case "llama-3.3-70b":
        return t`Reliable general-purpose Groq model`;
      case "llama-3.1-8b":
        return t`Lowest-latency Groq option`;
      case "claude-haiku-4.5":
        return t`Fastest responses, great for quick tasks`;
      case "claude-sonnet-4.6":
        return t`Balanced speed and quality`;
      case "gemini-3.1-pro":
        return t`Long context, strong at analysis`;
      case "gemini-3.1-flash-lite":
        return t`Fast long-context model through OpenRouter`;
      case "qwen3.6-flash":
        return t`Fast, low-cost model through OpenRouter`;
      case "deepseek-v4-flash":
        return t`Efficient reasoning model through OpenRouter`;
      default:
        return "";
    }
  };

  const providerModelsQuery = useQuery({
    queryKey: ["cloud-provider-models", provider, hasApiKey],
    queryFn: () => fetchProviderModels(provider, apiKey),
    enabled: hasApiKey || provider === "openrouter",
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });

  const models = useMemo((): ModelOption[] => {
    const recommended = RECOMMENDED_MODELS[provider].map((model) => createModelOption(provider, model.id, {
      name: getRecommendedName(model.slug),
      description: getRecommendedDescription(model.slug),
      vendor: model.vendor,
      icon: model.icon,
      hasApiKey,
      selectedCloudModelId,
      isRecommended: true,
      source: "recommended",
    }));

    const byId = new Map(recommended.map((model) => [model.providerModelId, model]));

    for (const liveModel of providerModelsQuery.data ?? []) {
      if (!liveModel.id || byId.has(liveModel.id)) {
        continue;
      }

      const vendor = vendorFromModelId(provider, liveModel.id, liveModel.owned_by);
      byId.set(liveModel.id, createModelOption(provider, liveModel.id, {
        name: liveModel.name || titleCaseModelId(liveModel.id),
        description: liveModel.description,
        vendor,
        icon: iconForVendor(provider, vendor),
        hasApiKey,
        selectedCloudModelId,
        source: "provider",
      }));
    }

    const selectedProvider = getCloudProviderIdFromModelId(selectedCloudModelId);
    const selectedProviderModelId = selectedCloudModelId?.replace(PROVIDER_CONFIG[provider].prefix, "");
    if (
      selectedProvider === provider
      && selectedProviderModelId
      && !byId.has(selectedProviderModelId)
    ) {
      const vendor = vendorFromModelId(provider, selectedProviderModelId);
      byId.set(selectedProviderModelId, createModelOption(provider, selectedProviderModelId, {
        name: titleCaseModelId(selectedProviderModelId),
        vendor,
        icon: iconForVendor(provider, vendor),
        hasApiKey,
        selectedCloudModelId,
        source: "manual",
      }));
    }

    return Array.from(byId.values()).sort((a, b) => {
      if (a.isSelected && !b.isSelected) {
        return -1;
      }
      if (!a.isSelected && b.isSelected) {
        return 1;
      }
      if (a.isRecommended && !b.isRecommended) {
        return -1;
      }
      if (!a.isRecommended && b.isRecommended) {
        return 1;
      }
      const vendorComparison = (a.vendor ?? "").localeCompare(b.vendor ?? "");
      if (vendorComparison !== 0) {
        return vendorComparison;
      }

      return a.name.localeCompare(b.name);
    });
  }, [hasApiKey, provider, providerModelsQuery.data, selectedCloudModelId, t]);

  return {
    models,
    hasApiKey,
    apiKey,
    isLoading: cloudApiKeysQuery.isLoading || providerModelsQuery.isLoading,
    error: providerModelsQuery.error,
    refetch: providerModelsQuery.refetch,
  };
}
