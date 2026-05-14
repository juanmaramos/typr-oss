use tauri_plugin_store2::ScopedStoreKey;

#[derive(serde::Deserialize, specta::Type, PartialEq, Eq, Hash, strum::Display)]
pub enum StoreKey {
    CustomEnabled,
    CustomApiBase,
    CustomApiKey,
    CustomModel,
    AdminApiBase,
    AdminApiKey,
    OpenaiApiKey,
    GroqApiKey,
    OpenrouterApiKey,
    GeminiApiKey,
    AssemblyaiApiKey,
    ProviderSource,
    OthersApiKey,
    OthersApiBase,
    OthersModel,
    OpenaiModel,
    GeminiModel,
    OpenrouterModel,
    SttModel,
    SttModelSession, // Transient: active model override for current session only (not saved to disk)
    CloudModel,      // Selected cloud model (OpenAI, etc.)
    AiTaskDefaults,
}

impl ScopedStoreKey for StoreKey {}
