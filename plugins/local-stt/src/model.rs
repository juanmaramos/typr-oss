pub static SUPPORTED_MODELS: &[SupportedModel] = &[
    SupportedModel::QuantizedTiny,
    SupportedModel::QuantizedTinyEn,
    SupportedModel::QuantizedBase,
    SupportedModel::QuantizedBaseEn,
    SupportedModel::QuantizedSmall,
    SupportedModel::QuantizedSmallEn,
    SupportedModel::QuantizedLargeTurbo,
    SupportedModel::DistilLargeV35En,
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
            SupportedModel::DistilLargeV35En => 1500000000,   // 1.5GB F16
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
        };
        write!(f, "{}", name)
    }
}
