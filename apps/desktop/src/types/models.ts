import { Connection } from "@typr/plugin-connector";
import { SupportedModel } from "@typr/plugin-local-llm";

/**
 * Unified model interface that represents all model types in the app
 */
export interface ModelOption {
  id: string;
  name: string;
  provider: ModelProvider;
  type: ModelType;
  isAvailable: boolean;
  isDownloaded?: boolean;
  isDownloading?: boolean;
  isSelected?: boolean;
  description?: string;
  size?: string;
  customIcon?: string; // Custom Remix icon class (e.g., "ri-meta-fill")
  vendor?: string; // Vendor name for grouping/sorting (e.g., "Anthropic", "Google", "OpenAI")
  isCloud?: boolean; // Cloud model flag
  isRecommended?: boolean; // Recommended model shown before the full provider catalog
  providerModelId?: string; // Raw provider model ID without app prefix
  source?: "recommended" | "provider" | "manual";
}

/**
 * Provider types with their respective icons (Remix Icons)
 */
export enum ModelProvider {
  LOCAL = "local",
  TYPR_CLOUD = "typr-cloud",
  OPENAI = "openai",
  GEMINI = "gemini",
  GROQ = "groq",
  CUSTOM = "custom",
  OPENROUTER = "openrouter",
}

/**
 * Model source types
 */
export enum ModelType {
  LOCAL = "local",
  CLOUD = "cloud",
  CUSTOM_ENDPOINT = "custom-endpoint",
}

/**
 * Provider configuration for icons and display
 * Using Lucide React icons for consistency with the rest of the app
 */
export const PROVIDER_CONFIG: Record<ModelProvider, {
  name: string;
  icon: keyof typeof import("lucide-react"); // Lucide React icon name
  color?: string;
}> = {
  [ModelProvider.LOCAL]: {
    name: "Local",
    icon: "HardDrive",
  },
  [ModelProvider.TYPR_CLOUD]: {
    name: "Typr Cloud",
    icon: "Cloud",
  },
  [ModelProvider.OPENAI]: {
    name: "OpenAI",
    icon: "Bot",
  },
  [ModelProvider.GEMINI]: {
    name: "Gemini",
    icon: "Sparkles",
  },
  [ModelProvider.GROQ]: {
    name: "Groq",
    icon: "Zap",
  },
  [ModelProvider.CUSTOM]: {
    name: "Custom",
    icon: "Settings",
  },
  [ModelProvider.OPENROUTER]: {
    name: "OpenRouter",
    icon: "Route",
  },
};

/**
 * Local model configuration - maps to existing LLMModel from settings
 */
export interface LocalModelConfig {
  key: SupportedModel;
  name: string;
  description: string;
  available: boolean;
  downloaded: boolean;
  size: string;
}

/**
 * Custom endpoint configuration - maps to existing custom endpoint data
 */
export interface CustomEndpointConfig {
  id: string;
  provider: ModelProvider;
  name: string;
  model: string;
  connection: Connection;
  enabled: boolean;
}

/**
 * Model selection context - tracks current active model across the app
 */
export interface ModelSelectionState {
  currentModel: ModelOption | null;
  isLoading: boolean;
  error?: string;
}
