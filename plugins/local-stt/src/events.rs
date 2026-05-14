use serde::{Deserialize, Serialize};
use specta::Type;
use tauri_specta::Event;

#[derive(Clone, Debug, Serialize, Deserialize, Type)]
pub struct ModelStateEvent {
    pub model_id: String,
    pub state: ModelState,
    pub timestamp: u64,
}

#[derive(Clone, Debug, Serialize, Deserialize, Type)]
pub enum ModelState {
    NotDownloaded,
    Downloading { progress: u8 },
    Downloaded,
    Error { message: String },
}

impl ModelState {
    pub fn is_downloading(&self) -> bool {
        matches!(self, ModelState::Downloading { .. })
    }

    pub fn is_downloaded(&self) -> bool {
        matches!(self, ModelState::Downloaded)
    }

    pub fn progress(&self) -> u8 {
        match self {
            ModelState::Downloading { progress } => *progress,
            ModelState::Downloaded => 100,
            _ => 0,
        }
    }

    pub fn error_message(&self) -> Option<&str> {
        match self {
            ModelState::Error { message } => Some(message),
            _ => None,
        }
    }
}

// Add the missing RecordedProcessingEvent
#[derive(Clone, Debug, Serialize, Deserialize, Type, Event)]
pub enum RecordedProcessingEvent {
    Progress {
        current: usize,
        total: usize,
        word: typr_listener_interface::Word,
    },
}

// Make ModelStateEvent an Event for Tauri
impl Event for ModelStateEvent {
    const NAME: &'static str = "stt-model-state-changed";
}
