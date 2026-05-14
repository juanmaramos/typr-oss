use std::path::PathBuf;

/// Simplified Whisper model configuration holder
///
/// NOTE: Full model caching is not implemented due to Whisper::transcribe() requiring &mut self.
/// The TranscriptionTask consumes the Whisper instance and we can't get it back without
/// modifying the whisper-local crate's streaming architecture.
///
/// Current approach:
/// - Use spawn_blocking to prevent tokio runtime blocking
/// - Rely on OS-level file caching for subsequent loads
/// - Future: Modify whisper-local to support shared/cached contexts
#[derive(Clone)]
pub struct WhisperModelManager {
    pub model_path: PathBuf,
}

impl WhisperModelManager {
    pub fn new(model_path: impl Into<PathBuf>, _languages: Vec<typr_whisper::Language>) -> Self {
        Self {
            model_path: model_path.into(),
        }
    }
}
