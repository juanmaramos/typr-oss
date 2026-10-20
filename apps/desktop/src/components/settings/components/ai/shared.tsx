import { Trans, useLingui } from "@lingui/react/macro";
import { UseMutationResult, UseQueryResult } from "@tanstack/react-query";
import { Connection } from "@typr/plugin-connector";
import { cn } from "@typr/ui/lib/utils";
import { UseFormReturn } from "react-hook-form";

export const RatingDisplay = (
  { label, rating, maxRating = 3, icon: Icon }: {
    label: string;
    rating: number;
    maxRating?: number;
    icon: React.ElementType;
  },
) => (
  <div className="flex flex-col items-center px-2">
    <span className="text-ui-tiny text-muted-foreground uppercase font-medium tracking-wider mb-1.5">{label}</span>
    <div className="flex space-x-1">
      {[...Array(maxRating)].map((_, i) => (
        <Icon
          key={i}
          className={cn(
            "w-3.5 h-3.5",
            i < rating ? "text-foreground fill-current" : "text-muted-foreground/50",
          )}
          strokeWidth={i < rating ? 0 : 1.5}
        />
      ))}
    </div>
  </div>
);

export const LanguageDisplay = ({ support }: { support: "multilingual" | "english-only" }) => {
  const { t } = useLingui();
  return (
    <div className="flex flex-col items-center px-2">
      <span className="text-ui-tiny text-muted-foreground uppercase font-medium tracking-wider mb-1.5">
        <Trans>Language</Trans>
      </span>
      <div className="text-xs font-medium">
        {support === "multilingual" ? t`Multilingual` : t`English Only`}
      </div>
    </div>
  );
};

export interface LLMModel {
  key: string;
  name: string;
  description: string;
  available: boolean;
  downloaded: boolean;
  size: string;
  isCloud?: boolean;
  showInSettings?: boolean; // Optional: Hide from settings UI (defaults to true)
}

export interface STTModel {
  key: string;
  name: string;
  size: string;
  downloaded: boolean;
  fileName: string;
  isCloud?: boolean;
  hidden?: boolean; // Optional: Hide from UI but keep functional in backend
}

export type ConfigureEndpointConfig = {
  provider: "others" | "openai" | "gemini" | "openrouter";
  api_base: string;
  api_key?: string;
  model: string;
};

export type OpenAIFormValues = {
  api_key: string;
  model: string;
};

export type GeminiFormValues = {
  api_key: string;
  model: string;
};

export type OpenRouterFormValues = {
  api_key: string;
  model: string;
};

export type CustomFormValues = {
  api_base: string;
  api_key?: string;
  model: string;
};

export interface SharedSTTProps {
  sttModels: STTModel[];
  handleModelDownload: (modelKey: string) => Promise<void>;
  handleShowFileLocation: (modelType: "stt" | "llm") => Promise<void>;
  supportsLocalModels: boolean;
}

export interface SharedLLMProps {
  // Functions
  handleModelDownload: (modelKey: string) => Promise<void>;
  handleShowFileLocation: (modelType: "stt" | "llm") => Promise<void>;

  // Platform
  supportsLocalModels: boolean;
}

export interface SharedCustomEndpointProps extends SharedLLMProps {
  customLLMEnabled: UseQueryResult<boolean>;
  setCustomLLMEnabledMutation: UseMutationResult<null, Error, boolean, unknown>;
  // Custom Endpoint Configuration
  configureCustomEndpoint: (config: ConfigureEndpointConfig) => void;

  // Accordion State
  openAccordion: "others" | "openai" | "gemini" | "openrouter" | null;
  setOpenAccordion: (accordion: "others" | "openai" | "gemini" | "openrouter" | null) => void;

  // Queries
  customLLMConnection: UseQueryResult<Connection | null>;
  getCustomLLMModel: UseQueryResult<string | null>;
  availableLLMModels: UseQueryResult<string[]>;

  // Form instances for each provider
  openaiForm: UseFormReturn<OpenAIFormValues>;
  geminiForm: UseFormReturn<GeminiFormValues>;
  openrouterForm: UseFormReturn<OpenRouterFormValues>;
  customForm: UseFormReturn<CustomFormValues>;

  // Helper functions
  isLocalEndpoint: () => boolean;
}
