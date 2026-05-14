// Note: These strings need to be translated where they are used since this is a constants file
import type { SupportedModel as SupportedSttModel } from "@typr/plugin-local-stt";

export const LANGUAGE_OPTIONS = [
  {
    key: "balanced" as const,
    iconClass: "ri-wifi-off-line",
    label: "Multilingual",
    description: "High accuracy across 50+ languages",
    accuracy: 3, // Large Turbo - high accuracy
    speed: 2, // Large Turbo - moderate speed
    modelKey: "QuantizedLargeTurbo", // AUTO-DOWNLOADED MODEL
    size: "574 MB", // Large Turbo Q5_0 size
    hasInfo: false,
    isLocal: true,
  },
  {
    key: "english" as const,
    iconClass: "ri-english-input",
    label: "English",
    description: "Best accuracy for English-only content",
    accuracy: 3, // Distil Large - highest accuracy
    speed: 3, // Distil model - optimized for speed
    modelKey: "DistilLargeV35En", // HIGH-QUALITY ENGLISH MODEL
    size: "1.5 GB", // Distil Large model size
    hasInfo: false,
    isLocal: true,
    hidden: true, // Hidden from UI - English-only model
  },
  // Hidden from UI - alternate multilingual model
  // {
  //   key: "multilingual" as const,
  //   iconClass: "ri-global-line",
  //   label: "Multilingual high accuracy",
  //   description: "Best for international meetings",
  //   accuracy: 3, // Large Turbo intelligence rating
  //   speed: 2, // Large Turbo speed rating (fast but not fastest)
  //   modelKey: "QuantizedLargeTurbo", // High-accuracy multilingual model
  //   size: "874 MB", // Large Turbo model size
  //   hasInfo: true,
  //   isLocal: true,
  // },
  // AssemblyAI U3 Pro: Multilingual real-time transcription (6 languages with code-switching)
  {
    key: "assemblyai-universal" as const,
    iconClass: "ri-flashlight-fill",
    label: "Multilingual",
    description: "Works with any language automatically",
    accuracy: 3, // High accuracy
    speed: 3, // Fast (real-time streaming)
    modelKey: "AssemblyAIUniversal",
    size: "0 MB", // Cloud-based
    hasInfo: false,
    isCloud: true,
    isLocal: false,
  },
] as const;

/** Icons for the cloud vs local *category*, used in info rows and badges. */
export const MODEL_CATEGORY_ICONS = {
  cloud: "ri-flashlight-fill",
  local: "ri-cloud-off-line",
} as const;

export type LocalLanguageOption = "balanced" | "english";
export type CloudLanguageOption = "assemblyai-universal";
export type LanguageOption = LocalLanguageOption | CloudLanguageOption;

export const DEFAULT_LOCAL_STT_LANGUAGE: LocalLanguageOption = "balanced";
const defaultLocalSttOption = LANGUAGE_OPTIONS.find((option) => option.key === DEFAULT_LOCAL_STT_LANGUAGE);

if (!defaultLocalSttOption || !("modelKey" in defaultLocalSttOption)) {
  throw new Error(`Default local STT language is not backed by a local model: ${DEFAULT_LOCAL_STT_LANGUAGE}`);
}

export const DEFAULT_LOCAL_STT_MODEL = defaultLocalSttOption.modelKey as SupportedSttModel;

export const SETTINGS_LOCAL_STT_MODEL_KEYS = [
  "QuantizedBase",
  "QuantizedBaseEn",
  "QuantizedSmall",
  "QuantizedSmallEn",
  "QuantizedLargeTurbo",
  "DistilLargeV35En",
] as const satisfies readonly SupportedSttModel[];

/**
 * Detailed metadata for every backend SupportedModel enum variant.
 * Single source of truth for name, description, icon, ratings, and HuggingFace links.
 */
export const sttModelMetadata: Record<string, {
  name: string;
  description: string;
  iconClass: string;
  intelligence: number;
  speed: number;
  size: string;
  inputType: string[];
  outputType: string[];
  languageSupport: "multilingual" | "english-only";
  huggingface?: string;
}> = {
  "QuantizedTiny": {
    name: "Tiny",
    description: "Fastest, lowest accuracy. Good for offline, low-resource use.",
    iconClass: "ri-wifi-off-line",
    intelligence: 1,
    speed: 3,
    size: "44 MB",
    inputType: ["audio"],
    outputType: ["text"],
    languageSupport: "multilingual",
    huggingface: "https://huggingface.co/ggerganov/whisper.cpp/blob/main/ggml-tiny-q8_0.bin",
  },
  "QuantizedTinyEn": {
    name: "Tiny - English",
    description: "Fastest, English-only. Optimized for speed on English audio.",
    iconClass: "ri-wifi-off-line",
    intelligence: 1,
    speed: 3,
    size: "44 MB",
    inputType: ["audio"],
    outputType: ["text"],
    languageSupport: "english-only",
    huggingface: "https://huggingface.co/ggerganov/whisper.cpp/blob/main/ggml-tiny.en-q8_0.bin",
  },
  "QuantizedBase": {
    name: "Base",
    description: "Good balance of speed and accuracy for multilingual use.",
    iconClass: "ri-wifi-off-line",
    intelligence: 2,
    speed: 2,
    size: "82 MB",
    inputType: ["audio"],
    outputType: ["text"],
    languageSupport: "multilingual",
    huggingface: "https://huggingface.co/ggerganov/whisper.cpp/blob/main/ggml-base-q8_0.bin",
  },
  "QuantizedBaseEn": {
    name: "Base - English",
    description: "Balanced speed and accuracy, optimized for English audio.",
    iconClass: "ri-wifi-off-line",
    intelligence: 2,
    speed: 2,
    size: "82 MB",
    inputType: ["audio"],
    outputType: ["text"],
    languageSupport: "english-only",
    huggingface: "https://huggingface.co/ggerganov/whisper.cpp/blob/main/ggml-base.en-q8_0.bin",
  },
  "QuantizedSmall": {
    name: "Small",
    description: "Higher accuracy, moderate speed for multilingual transcription.",
    iconClass: "ri-wifi-off-line",
    intelligence: 2,
    speed: 2,
    size: "264 MB",
    inputType: ["audio"],
    outputType: ["text"],
    languageSupport: "multilingual",
    huggingface: "https://huggingface.co/ggerganov/whisper.cpp/blob/main/ggml-small-q8_0.bin",
  },
  "QuantizedSmallEn": {
    name: "Small - English",
    description: "Higher accuracy, moderate speed, optimized for English audio.",
    iconClass: "ri-wifi-off-line",
    intelligence: 3,
    speed: 2,
    size: "264 MB",
    inputType: ["audio"],
    outputType: ["text"],
    languageSupport: "english-only",
    huggingface: "https://huggingface.co/ggerganov/whisper.cpp/blob/main/ggml-small.en-q8_0.bin",
  },
  "QuantizedLargeTurbo": {
    name: "Large",
    description: "Best accuracy across 50+ languages. Recommended for most users.",
    iconClass: "ri-wifi-off-line",
    intelligence: 3,
    speed: 2,
    size: "574 MB",
    inputType: ["audio"],
    outputType: ["text"],
    languageSupport: "multilingual",
    huggingface: "https://huggingface.co/ggerganov/whisper.cpp/blob/main/ggml-large-v3-turbo-q5_0.bin",
  },
  "DistilLargeV35En": {
    name: "Distil v3.5 - English",
    description: "Highest quality English transcription. Optimized for meetings and conversations.",
    iconClass: "ri-english-input",
    intelligence: 3,
    speed: 3,
    size: "1.5 GB",
    inputType: ["audio"],
    outputType: ["text"],
    languageSupport: "english-only",
    huggingface: "https://huggingface.co/distil-whisper/distil-large-v3.5-ggml/blob/main/ggml-model.bin",
  },
};

// WER Performance data from existing werPerformanceData
export const WER_PERFORMANCE_TIERS = {
  excellent: {
    range: "2.8-5.0% error",
    languages: [
      "Spanish",
      "Italian",
      "Korean",
      "Portuguese",
      "English",
      "Polish",
      "Catalan",
      "Japanese",
      "German",
      "Russian",
    ],
  },
  good: {
    range: "5.2-7.8% error",
    languages: [
      "Dutch",
      "French",
      "Indonesian",
      "Ukrainian",
      "Turkish",
      "Malay",
      "Swedish",
      "Mandarin",
      "Finnish",
      "Norwegian",
    ],
  },
  moderate: {
    range: "8.2-10.9% error",
    languages: [
      "Romanian",
      "Thai",
      "Vietnamese",
      "Slovak",
      "Arabic",
      "Czech",
      "Croatian",
      "Greek",
    ],
  },
  weak: {
    range: "11.6-14.8% error",
    languages: [
      "Serbian",
      "Danish",
      "Bulgarian",
      "Hungarian",
      "Filipino",
      "Bosnian",
      "Galician",
      "Macedonian",
    ],
  },
  poor: {
    range: "17.0-19.7% error",
    languages: [
      "Hindi",
      "Estonian",
      "Slovenian",
      "Tamil",
      "Latvian",
      "Azerbaijani",
    ],
  },
} as const;

export const SUPPORTED_LANGUAGES_COUNT = Object.values(WER_PERFORMANCE_TIERS)
  .reduce((total, tier) => total + tier.languages.length, 0);

// Export filtered options based on platform
export function getAvailableLanguageOptions(supportsLocal: boolean) {
  return LANGUAGE_OPTIONS.filter(option => {
    // Hide local models on Windows
    if (!supportsLocal && option.isLocal) {
      return false;
    }
    // Hide explicitly marked hidden options
    if ("hidden" in option && option.hidden) {
      return false;
    }
    return true;
  });
}
