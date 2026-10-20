pub static SUPPORTED_MODELS: &[SupportedModel] = &[
    SupportedModel::QuantizedTiny,
    SupportedModel::QuantizedTinyEn,
    SupportedModel::QuantizedBase,
    SupportedModel::QuantizedBaseEn,
    SupportedModel::QuantizedSmall,
    SupportedModel::QuantizedSmallEn,
    SupportedModel::QuantizedLargeTurbo,
    SupportedModel::DistilLargeV35En,
    SupportedModel::Nemotron3p5Streaming,
];

#[derive(Debug, Eq, Hash, PartialEq, Clone, serde::Serialize, serde::Deserialize, specta::Type)]
pub enum SupportedModel {
    QuantizedTiny,
    QuantizedTinyEn,
    QuantizedBase,
    QuantizedBaseEn,
    QuantizedSmall,
    QuantizedSmallEn,
    QuantizedLargeTurbo,
    DistilLargeV35En,
    Nemotron3p5Streaming,
}

impl SupportedModel {
    pub fn file_name(&self) -> &str {
        match self {
            SupportedModel::QuantizedTiny => "ggml-tiny-q8_0.bin",
            SupportedModel::QuantizedTinyEn => "ggml-tiny.en-q8_0.bin",
            SupportedModel::QuantizedBase => "ggml-base-q8_0.bin",
            SupportedModel::QuantizedBaseEn => "ggml-base.en-q8_0.bin",
            SupportedModel::QuantizedSmall => "ggml-small-q8_0.bin",
            SupportedModel::QuantizedSmallEn => "ggml-small.en-q8_0.bin",
            SupportedModel::QuantizedLargeTurbo => "ggml-large-v3-turbo-q5_0.bin",
            SupportedModel::DistilLargeV35En => "ggml-distil-large-v3.5-en-f16.bin",
            SupportedModel::Nemotron3p5Streaming => "nemotron-3.5-asr-streaming-0.6b.q8_0.gguf",
        }
    }

    pub fn model_url(&self) -> &str {
        match self {
            SupportedModel::QuantizedTiny => {
                "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny-q8_0.bin"
            }
            SupportedModel::QuantizedTinyEn => {
                "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en-q8_0.bin"
            }
            SupportedModel::QuantizedBase => {
                "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base-q8_0.bin"
            }
            SupportedModel::QuantizedBaseEn => {
                "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en-q8_0.bin"
            }
            SupportedModel::QuantizedSmall => {
                "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small-q8_0.bin"
            }
            SupportedModel::QuantizedSmallEn => {
                "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.en-q8_0.bin"
            }
            SupportedModel::QuantizedLargeTurbo => {
                "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q5_0.bin"
            }
            SupportedModel::DistilLargeV35En => {
                "https://huggingface.co/distil-whisper/distil-large-v3.5-ggml/resolve/main/ggml-model.bin"
            }
            SupportedModel::Nemotron3p5Streaming => "https://huggingface.co/nvidia/nemotron-3.5-asr-streaming-0.6b/resolve/1c8deaecc64b91f034d73e08dd8b64625eb3395d/nemotron-3.5-asr-streaming-0.6b.q8_0.gguf",
        }
    }

    pub fn model_size(&self) -> u64 {
        match self {
            SupportedModel::QuantizedTiny => 43537433,
            SupportedModel::QuantizedTinyEn => 43550795,
            SupportedModel::QuantizedBase => 81768585,
            SupportedModel::QuantizedBaseEn => 81781811,
            SupportedModel::QuantizedSmall => 264464607,
            SupportedModel::QuantizedSmallEn => 264477561,
            SupportedModel::QuantizedLargeTurbo => 574000000, // 574 MB Q5_0
            SupportedModel::Nemotron3p5Streaming => 741548352,
            SupportedModel::DistilLargeV35En => 1500000000, // 1.5GB F16
        }
    }
}

impl std::fmt::Display for SupportedModel {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let name = match self {
            SupportedModel::QuantizedTiny => "QuantizedTiny",
            SupportedModel::QuantizedTinyEn => "QuantizedTinyEn",
            SupportedModel::QuantizedBase => "QuantizedBase",
            SupportedModel::QuantizedBaseEn => "QuantizedBaseEn",
            SupportedModel::QuantizedSmall => "QuantizedSmall",
            SupportedModel::QuantizedSmallEn => "QuantizedSmallEn",
            SupportedModel::QuantizedLargeTurbo => "QuantizedLargeTurbo",
            SupportedModel::DistilLargeV35En => "DistilLargeV35En",
            SupportedModel::Nemotron3p5Streaming => "Nemotron3p5Streaming",
        };
        write!(f, "{}", name)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize, specta::Type)]
pub enum SttBackend {
    Whisper,
    NemotronStreaming,
}

#[derive(Debug, Clone, serde::Serialize, specta::Type)]
pub struct ModelCapabilities {
    pub model: SupportedModel,
    pub backend: SttBackend,
    pub size_bytes: u64,
    pub realtime: bool,
    pub recorded: bool,
    pub available: bool,
    pub supported_languages: Option<Vec<String>>,
    pub supported_locales: Option<Vec<String>>,
}

impl SupportedModel {
    pub fn backend(&self) -> SttBackend {
        match self {
            Self::Nemotron3p5Streaming => SttBackend::NemotronStreaming,
            _ => SttBackend::Whisper,
        }
    }
    pub fn is_streaming(&self) -> bool {
        self.backend() == SttBackend::NemotronStreaming
    }
    /// Session-option acceptance for pre-capture recovery. Whisper retains its
    /// existing decoder language handling; the streaming backend must select a
    /// prompt that the pinned model can transcribe without fine-tuning.
    pub fn supports_languages(&self, languages: &[typr_language::Language]) -> bool {
        self.backend() == SttBackend::Whisper || self.streaming_locale(languages).is_ok()
    }
    pub fn streaming_locale(
        &self,
        languages: &[typr_language::Language],
    ) -> Result<&'static str, String> {
        let codes: Vec<_> = languages
            .iter()
            .map(|language| language.iso639().code())
            .collect();
        typr_nemotron_runtime::languages::locale_for_languages(&codes)
    }
    pub fn supported_languages(&self) -> Option<Vec<String>> {
        match self {
            Self::Nemotron3p5Streaming => Some(
                typr_nemotron_runtime::languages::SUPPORTED_LANGUAGES
                    .iter()
                    .map(|language| language.code.into())
                    .collect(),
            ),
            Self::QuantizedTinyEn
            | Self::QuantizedBaseEn
            | Self::QuantizedSmallEn
            | Self::DistilLargeV35En => Some(vec!["en".into()]),
            _ => None,
        }
    }
    pub fn supported_locales(&self) -> Option<Vec<String>> {
        self.is_streaming().then(|| {
            typr_nemotron_runtime::languages::supported_locales()
                .map(String::from)
                .collect()
        })
    }
    pub fn sha256(&self) -> Option<&'static str> {
        match self {
            Self::Nemotron3p5Streaming => {
                Some("a5c435f294eea8f88ce68dd27b8c3bfea7f777cb2fbba04fcd30eaa555f429ae")
            }
            _ => None,
        }
    }
}

/// Startup recovery must preserve multilingual transcription. English-only
/// models remain selectable explicitly, but cannot recover a multilingual model.
pub const STREAMING_WHISPER_FALLBACKS: &[SupportedModel] = &[
    SupportedModel::QuantizedLargeTurbo,
    SupportedModel::QuantizedSmall,
    SupportedModel::QuantizedBase,
    SupportedModel::QuantizedTiny,
];
