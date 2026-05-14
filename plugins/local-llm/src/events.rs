use serde::{Deserialize, Serialize};
use specta::Type;
use tauri_specta::Event;

#[derive(Clone, Debug, Serialize, Deserialize, Type)]
pub struct LlmModelStateEvent {
    pub model_id: String,
    pub state: LlmModelState,
    pub timestamp: u64,
}

#[derive(Clone, Debug, Serialize, Deserialize, Type)]
pub enum LlmModelState {
    NotDownloaded,
    Downloading { progress: u8 },
    Downloaded,
    Loading,
    Ready,
    Error { message: String },
}

impl LlmModelState {
    pub fn is_downloading(&self) -> bool {
        matches!(self, LlmModelState::Downloading { .. })
    }

    pub fn is_downloaded(&self) -> bool {
        matches!(self, LlmModelState::Downloaded)
    }

    pub fn is_ready(&self) -> bool {
        matches!(self, LlmModelState::Ready)
    }

    pub fn progress(&self) -> u8 {
        match self {
            LlmModelState::Downloading { progress } => *progress,
            LlmModelState::Downloaded | LlmModelState::Ready => 100,
            _ => 0,
        }
    }

    pub fn error_message(&self) -> Option<&str> {
        match self {
            LlmModelState::Error { message } => Some(message),
            _ => None,
        }
    }
}

// Make LlmModelStateEvent an Event for Tauri
impl Event for LlmModelStateEvent {
    const NAME: &'static str = "llm-model-state-changed";
}
