pub static SUPPORTED_MODELS: &[SupportedModel] = &[
    SupportedModel::Gemma4E4b, // Default model (downloads first)
    SupportedModel::Qwen3_4bThinkingQ4Km,
    SupportedModel::Phi4MiniQ4Km,
    SupportedModel::Llama3p2_3bQ4,
];

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, specta::Type)]
pub struct ModelInfo {
    pub id: SupportedModel,
    pub name: String,
    pub provider: String,
    pub size: String,
    pub description: String,
    pub icon: String,
    pub show_in_selector: bool,
}

#[derive(Debug, Eq, Hash, PartialEq, Clone, serde::Serialize, serde::Deserialize, specta::Type)]
pub enum SupportedModel {
    Llama3p2_3bQ4,
    Phi4MiniQ4Km,
    Gemma3_4b, // Kept for migration only — not shown in UI
    Gemma4E4b,
    Qwen3_4bThinkingQ4Km,
}

impl std::fmt::Display for SupportedModel {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SupportedModel::Llama3p2_3bQ4 => write!(f, "Llama3p2_3bQ4"),
            SupportedModel::Phi4MiniQ4Km => write!(f, "Phi4MiniQ4Km"),
            SupportedModel::Gemma3_4b => write!(f, "Gemma3_4b"),
            SupportedModel::Gemma4E4b => write!(f, "Gemma4E4b"),
            SupportedModel::Qwen3_4bThinkingQ4Km => write!(f, "Qwen3_4bThinkingQ4Km"),
        }
    }
}

impl SupportedModel {
    pub fn file_name(&self) -> &str {
        match self {
            SupportedModel::Llama3p2_3bQ4 => "llama-32-3b.gguf",
            SupportedModel::Phi4MiniQ4Km => "Phi-4-mini-instruct-Q4_K_M.gguf",
            SupportedModel::Gemma3_4b => "gemma-3-4b-it-Q4_K_M.gguf",
            SupportedModel::Gemma4E4b => "gemma-4-E4B-it-Q4_K_M.gguf",
            SupportedModel::Qwen3_4bThinkingQ4Km => "Qwen3-4B-Thinking-2507-Q4_K_M.gguf",
        }
    }

    pub fn model_url(&self) -> &str {
        match self {
            SupportedModel::Llama3p2_3bQ4 => {
                "https://huggingface.co/hugging-quants/Llama-3.2-3B-Instruct-Q4_K_M-GGUF/resolve/main/llama-3.2-3b-instruct-q4_k_m.gguf"
            }
            SupportedModel::Phi4MiniQ4Km => {
                "https://huggingface.co/unsloth/Phi-4-mini-instruct-GGUF/resolve/main/Phi-4-mini-instruct-Q4_K_M.gguf"
            }
            SupportedModel::Gemma3_4b => {
                "https://huggingface.co/unsloth/gemma-3-4b-it-GGUF/resolve/main/gemma-3-4b-it-Q4_K_M.gguf"
            }
            SupportedModel::Gemma4E4b => {
                "https://huggingface.co/unsloth/gemma-4-E4B-it-GGUF/resolve/main/gemma-4-E4B-it-Q4_K_M.gguf"
            }
            SupportedModel::Qwen3_4bThinkingQ4Km => {
                "https://huggingface.co/unsloth/Qwen3-4B-Thinking-2507-GGUF/resolve/main/Qwen3-4B-Thinking-2507-Q4_K_M.gguf"
            }
        }
    }

    pub fn model_size(&self) -> u64 {
        match self {
            SupportedModel::Llama3p2_3bQ4 => 2019377440,
            SupportedModel::Phi4MiniQ4Km => 2674688000, // ~2.49 GB
            SupportedModel::Gemma3_4b => 2489894016,
            SupportedModel::Gemma4E4b => 4977169088, // ~4.98 GB
            SupportedModel::Qwen3_4bThinkingQ4Km => 2497281152,
        }
    }

    /// UI display name
    pub fn display_name(&self) -> &str {
        match self {
            SupportedModel::Llama3p2_3bQ4 => "Llama 3.2",
            SupportedModel::Phi4MiniQ4Km => "Phi-4 Mini",
            SupportedModel::Gemma3_4b => "Gemma 3",
            SupportedModel::Gemma4E4b => "Gemma 4",
            SupportedModel::Qwen3_4bThinkingQ4Km => "Qwen 3 Thinking",
        }
    }

    /// Provider/company name
    pub fn provider(&self) -> &str {
        match self {
            SupportedModel::Llama3p2_3bQ4 => "Meta",
            SupportedModel::Phi4MiniQ4Km => "Microsoft",
            SupportedModel::Gemma3_4b => "Google",
            SupportedModel::Gemma4E4b => "Google",
            SupportedModel::Qwen3_4bThinkingQ4Km => "Qwen",
        }
    }

    /// Human readable size
    pub fn size_display(&self) -> &str {
        match self {
            SupportedModel::Llama3p2_3bQ4 => "2.0 GB",
            SupportedModel::Phi4MiniQ4Km => "2.5 GB",
            SupportedModel::Gemma3_4b => "2.5 GB",
            SupportedModel::Gemma4E4b => "5.0 GB",
            SupportedModel::Qwen3_4bThinkingQ4Km => "2.5 GB",
        }
    }

    /// Description for UI
    pub fn description(&self) -> &str {
        match self {
            SupportedModel::Llama3p2_3bQ4 => "Fast and reliable for simple tasks",
            SupportedModel::Phi4MiniQ4Km => "Best for meeting Q&A and chat",
            SupportedModel::Gemma3_4b => "Good for writing and conversation",
            SupportedModel::Gemma4E4b => {
                "Smarter responses for complex questions and long meetings"
            }
            SupportedModel::Qwen3_4bThinkingQ4Km => "Reasoning-focused model for complex questions",
        }
    }

    /// Whether this model should be shown in UI selectors
    pub fn show_in_selector(&self) -> bool {
        // On Windows, hide all local models (cloud-only for V1)
        #[cfg(target_os = "windows")]
        {
            return false;
        }

        // On macOS, show based on model performance
        #[cfg(not(target_os = "windows"))]
        {
            match self {
                SupportedModel::Llama3p2_3bQ4 => false, // Hidden - less performant
                SupportedModel::Phi4MiniQ4Km => true,
                SupportedModel::Gemma3_4b => false, // Legacy — migrated to Gemma4E4b
                SupportedModel::Gemma4E4b => true,
                SupportedModel::Qwen3_4bThinkingQ4Km => true,
            }
        }
    }

    /// Icon identifier for UI
    pub fn icon(&self) -> &str {
        match self {
            SupportedModel::Llama3p2_3bQ4 => "ri-meta-fill",
            SupportedModel::Phi4MiniQ4Km => "ri-windows-fill",
            SupportedModel::Gemma3_4b => "ri-google-fill",
            SupportedModel::Gemma4E4b => "ri-google-fill",
            SupportedModel::Qwen3_4bThinkingQ4Km => "ri-qwen-ai-fill",
        }
    }

    /// Convert to rich model info for frontend
    pub fn to_model_info(&self) -> ModelInfo {
        ModelInfo {
            id: self.clone(),
            name: self.display_name().to_string(),
            provider: self.provider().to_string(),
            size: self.size_display().to_string(),
            description: self.description().to_string(),
            icon: self.icon().to_string(),
            show_in_selector: self.show_in_selector(),
        }
    }
}

#[derive(serde::Serialize, serde::Deserialize, specta::Type)]
pub enum ModelIdentifier {
    #[serde(rename = "local")]
    Local,
    #[serde(rename = "mock-onboarding")]
    MockOnboarding,
}
