import { formatModelSize } from "@/lib/model-metadata";
import { i18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import type { ModelCapabilities, SupportedModel as SupportedSttModel } from "@typr/plugin-local-stt";

export type SttProvider = "NVIDIA" | "OpenAI" | "Distil-Whisper" | "AssemblyAI";
export type SttModelMetadata = {
  name: string;
  provider: SttProvider;
  description: string;

  size: string;

  languageSupport: "multilingual" | "english-only";
  huggingface?: string;
};

const whisper = (name: string, size: string, englishOnly: boolean, file: string): SttModelMetadata => ({
  get name() {
    return englishOnly ? i18n._(msg`${name} (English)`) : name;
  },
  provider: "OpenAI",
  get description() {
    return englishOnly
      ? i18n._(msg`Text appears after you pause. English only.`)
      : i18n._(msg`Text appears after you pause. Works offline in many languages.`);
  },

  size,

  languageSupport: englishOnly ? "english-only" : "multilingual",
  huggingface: `https://huggingface.co/ggerganov/whisper.cpp/blob/main/${file}`,
});

export const sttModelMetadata: Record<SupportedSttModel | "AssemblyAIUniversal", SttModelMetadata> = {
  Nemotron3p5Streaming: {
    name: "Nemotron 3.5",
    provider: "NVIDIA",
    get description() {
      return i18n._(msg`Live text as you speak. Works offline.`);
    },

    size: "741 MB",

    languageSupport: "multilingual",
    huggingface: "https://huggingface.co/nvidia/nemotron-3.5-asr-streaming-0.6b",
  },
  QuantizedTiny: whisper("Whisper Tiny", "44 MB", false, "ggml-tiny-q8_0.bin"),
  QuantizedTinyEn: whisper("Whisper Tiny", "44 MB", true, "ggml-tiny.en-q8_0.bin"),
  QuantizedBase: whisper("Whisper Base", "82 MB", false, "ggml-base-q8_0.bin"),
  QuantizedBaseEn: whisper("Whisper Base", "82 MB", true, "ggml-base.en-q8_0.bin"),
  QuantizedSmall: whisper("Whisper Small", "264 MB", false, "ggml-small-q8_0.bin"),
  QuantizedSmallEn: whisper("Whisper Small", "264 MB", true, "ggml-small.en-q8_0.bin"),
  QuantizedLargeTurbo: whisper("Whisper Large v3 Turbo", "574 MB", false, "ggml-large-v3-turbo-q5_0.bin"),
  DistilLargeV35En: {
    get name() {
      return i18n._(msg`Distil-Whisper Large v3.5 (English)`);
    },
    provider: "Distil-Whisper",
    get description() {
      return i18n._(msg`Text appears after you pause. English only.`);
    },

    size: "1.5 GB",

    languageSupport: "english-only",
    huggingface: "https://huggingface.co/distil-whisper/distil-large-v3.5-ggml/blob/main/ggml-model.bin",
  },
  AssemblyAIUniversal: {
    name: "Universal Streaming Multilingual",
    provider: "AssemblyAI",
    get description() {
      const count = ASSEMBLYAI_STT_LANGUAGES.length;
      return i18n._(msg`Live text in ${count} languages. Requires an API key.`);
    },

    size: "0 MB",

    languageSupport: "multilingual",
  },
};

export const SETTINGS_LOCAL_STT_MODEL_KEYS = [
  "Nemotron3p5Streaming",
  "QuantizedTiny",
  "QuantizedTinyEn",
  "QuantizedBase",
  "QuantizedBaseEn",
  "QuantizedSmall",
  "QuantizedSmallEn",
  "QuantizedLargeTurbo",
  "DistilLargeV35En",
] as const satisfies readonly SupportedSttModel[];
export type LanguageOption = SupportedSttModel | "balanced" | "english" | "nemotron-streaming" | "assemblyai-universal";
export type LocalLanguageOption = Exclude<LanguageOption, "assemblyai-universal">;
export type CloudLanguageOption = "assemblyai-universal";
export const DEFAULT_LOCAL_STT_LANGUAGE = "balanced" as const;
export const DEFAULT_LOCAL_STT_MODEL: SupportedSttModel = "QuantizedLargeTurbo";
export const ASSEMBLYAI_STT_LANGUAGES = ["en", "es", "fr", "de", "it", "pt"] as const;

const aliases = {
  balanced: "QuantizedLargeTurbo",
  english: "DistilLargeV35En",
  "nemotron-streaming": "Nemotron3p5Streaming",
  "assemblyai-universal": "AssemblyAIUniversal",
} as const;
export function getSttModelMetadata(model: string | null | undefined): SttModelMetadata | undefined {
  const canonical = model ? aliases[model as keyof typeof aliases] ?? model : "";
  return sttModelMetadata[canonical as keyof typeof sttModelMetadata];
}
export function getSttModelSize(model: string, capabilities?: readonly ModelCapabilities[]): string {
  const canonical = aliases[model as keyof typeof aliases] ?? model;
  const nativeModel = capabilities?.find(capability => capability.model === canonical);
  return nativeModel ? formatModelSize(nativeModel.size_bytes) : getSttModelMetadata(model)?.size ?? "";
}
export function getSttModelDescription(model: string, capabilities?: readonly ModelCapabilities[]) {
  const metadata = getSttModelMetadata(model);
  const languages = getSttSupportedLanguages(model, capabilities);
  if (metadata?.provider === "NVIDIA" && languages?.length) {
    const count = languages.length;
    return i18n._(msg`Live text as you speak. ${count} languages. Works offline.`);
  }
  return metadata?.description ?? i18n._(msg`Choose a transcription model.`);
}
export function getSttSupportedLanguages(
  model: string,
  capabilities?: readonly ModelCapabilities[],
): readonly string[] | null {
  const metadata = getSttModelMetadata(model);
  if (metadata?.provider === "AssemblyAI") {
    return ASSEMBLYAI_STT_LANGUAGES;
  }
  if (metadata?.languageSupport === "english-only") {
    return ["en"];
  }
  const canonical = LANGUAGE_OPTIONS.find(option => option.key === model || option.modelKey === model)?.modelKey;
  return capabilities?.find(capability => capability.model === canonical)?.supported_languages ?? null;
}
export function getSttModelLabel(model: string | null | undefined) {
  return getSttModelMetadata(model)?.name ?? i18n._(msg`Transcription model`);
}

function option(key: LanguageOption, modelKey: SupportedSttModel | "AssemblyAIUniversal") {
  const metadata = sttModelMetadata[modelKey];
  return {
    key,
    modelKey,
    get label() {
      return metadata.name;
    },
    get description() {
      return metadata.description;
    },

    size: metadata.size,
    isLocal: modelKey !== "AssemblyAIUniversal",
    isCloud: modelKey === "AssemblyAIUniversal",
  };
}
export const LANGUAGE_OPTIONS = [
  ...SETTINGS_LOCAL_STT_MODEL_KEYS.map(model =>
    option(
      model === "QuantizedLargeTurbo"
        ? "balanced"
        : model === "DistilLargeV35En"
        ? "english"
        : model === "Nemotron3p5Streaming"
        ? "nemotron-streaming"
        : model,
      model,
    )
  ),
  option("assemblyai-universal", "AssemblyAIUniversal"),
];
export const MODEL_CATEGORY_ICONS = { cloud: "ri-flashlight-fill", local: "ri-cloud-off-line" } as const;

export function getAvailableLanguageOptions(supportsLocal: boolean, availableModels?: readonly SupportedSttModel[]) {
  return LANGUAGE_OPTIONS.filter(option =>
    !option.isLocal
    || supportsLocal && (option.modelKey !== "Nemotron3p5Streaming" || availableModels?.includes(option.modelKey))
  );
}
