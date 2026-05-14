import { DEFAULT_LOCAL_STT_MODEL } from "@/components/transcript/constants/languageData";
import type { SupportedModel as SupportedLlmModel } from "@typr/plugin-local-llm";
import type { SupportedModel as SupportedSttModel } from "@typr/plugin-local-stt";

export type OnboardingModelSetupStatus = "pending" | "downloading" | "complete" | "failed";

export const DEFAULT_ONBOARDING_STT_MODEL: SupportedSttModel = DEFAULT_LOCAL_STT_MODEL;
export const DEFAULT_ONBOARDING_LLM_MODEL: SupportedLlmModel = "Gemma4E4b";
const SUPPORTED_ONBOARDING_STT_MODELS: readonly SupportedSttModel[] = [
  "QuantizedTiny",
  "QuantizedTinyEn",
  "QuantizedBase",
  "QuantizedBaseEn",
  "QuantizedSmall",
  "QuantizedSmallEn",
  "QuantizedLargeTurbo",
  "DistilLargeV35En",
];
const SUPPORTED_ONBOARDING_LLM_MODELS: readonly SupportedLlmModel[] = [
  "Llama3p2_3bQ4",
  "Phi4MiniQ4Km",
  "Gemma3_4b",
  "Gemma4E4b",
  "Qwen3_4bThinkingQ4Km",
];

export type OnboardingModelSetupState = {
  status: OnboardingModelSetupStatus;
  stt_model: SupportedSttModel;
  llm_model: SupportedLlmModel;
  last_error: string | null;
};

export function createOnboardingModelSetup(
  status: OnboardingModelSetupStatus,
  lastError: string | null = null,
  models: {
    sttModel?: SupportedSttModel;
    llmModel?: SupportedLlmModel;
  } = {},
): OnboardingModelSetupState {
  return {
    status,
    stt_model: models.sttModel ?? DEFAULT_ONBOARDING_STT_MODEL,
    llm_model: models.llmModel ?? DEFAULT_ONBOARDING_LLM_MODEL,
    last_error: lastError,
  };
}

export function restoreOnboardingModelSetup(
  setup: { stt_model?: string | null; llm_model?: string | null } | null | undefined,
) {
  const sttModel = SUPPORTED_ONBOARDING_STT_MODELS.includes(setup?.stt_model as SupportedSttModel)
    ? setup!.stt_model as SupportedSttModel
    : DEFAULT_ONBOARDING_STT_MODEL;
  const llmModel = SUPPORTED_ONBOARDING_LLM_MODELS.includes(setup?.llm_model as SupportedLlmModel)
    ? setup!.llm_model as SupportedLlmModel
    : DEFAULT_ONBOARDING_LLM_MODEL;

  return { sttModel, llmModel };
}
