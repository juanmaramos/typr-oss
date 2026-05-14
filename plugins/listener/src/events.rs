#[macro_export]
macro_rules! common_event_derives {
    ($item:item) => {
        #[derive(serde::Serialize, Clone, specta::Type, tauri_specta::Event)]
        $item
    };
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, specta::Type)]
#[serde(rename_all = "snake_case")]
pub enum PipelineStatusPhase {
    Inactive,
    Starting,
    Active,
    Reconnecting,
    Paused,
    Failed,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, specta::Type)]
pub struct PipelineStatus {
    pub phase: PipelineStatusPhase,
    pub session_id: Option<String>,
    pub started_at: Option<String>,
    pub last_audio_at: Option<String>,
    pub last_words_at: Option<String>,
    pub mic_enabled: bool,
    pub speaker_enabled: bool,
    pub reason: Option<String>,
    pub reconnect_attempt: Option<u32>,
    pub reconnect_max_attempts: Option<u32>,
}

impl PipelineStatus {
    pub fn inactive() -> Self {
        Self {
            phase: PipelineStatusPhase::Inactive,
            session_id: None,
            started_at: None,
            last_audio_at: None,
            last_words_at: None,
            mic_enabled: true,
            speaker_enabled: true,
            reason: None,
            reconnect_attempt: None,
            reconnect_max_attempts: None,
        }
    }
}

#[derive(serde::Serialize, Clone, specta::Type, tauri_specta::Event)]
pub struct PipelineStatusChanged {
    pub status: PipelineStatus,
}

common_event_derives! {
    #[serde(tag = "type")]
    pub enum SessionEvent {
        #[serde(rename = "inactive")]
        Inactive {},
        #[serde(rename = "running_active")]
        RunningActive {},
        #[serde(rename = "running_paused")]
        RunningPaused {},
        #[serde(rename = "words")]
        Words { words: Vec<typr_listener_interface::Word>},
        /// Preview event for soft flush - transient words that may change.
        /// Frontend should store these separately and merge for display.
        /// These words are NOT saved to DB.
        #[serde(rename = "preview")]
        Preview {
            channel: String,
            words: Vec<typr_listener_interface::Word>,
        },
        #[serde(rename = "audioAmplitude")]
        AudioAmplitude { mic: u16, speaker: u16 },
        #[serde(rename = "micMuted")]
        MicMuted { value: bool },
        #[serde(rename = "speakerMuted")]
        SpeakerMuted { value: bool },
        #[serde(rename = "deviceChanged")]
        DeviceChanged {},
        #[serde(rename = "transcriptProcessing")]
        TranscriptProcessing { session_id: String, status: String, message: String },
        #[serde(rename = "transcriptUpdated")]
        TranscriptUpdated { session_id: String, status: String, message: String },
        #[serde(rename = "transcriptError")]
        TranscriptError { session_id: String, status: String, message: String },
        #[serde(rename = "cloudTranscriptionFailed")]
        CloudTranscriptionFailed { reason: String, failed_model: String, message: String },
        #[serde(rename = "cloudTranscriptionRecovery")]
        CloudTranscriptionRecovery {
            phase: String,
            reason: String,
            attempt: u32,
            max_attempts: u32,
        },
        #[serde(rename = "autoStopWarning")]
        AutoStopWarning { reason: String, remaining_ms: u64 },
    }
}

impl From<(&[f32], &[f32])> for SessionEvent {
    fn from((mic_chunk, speaker_chunk): (&[f32], &[f32])) -> Self {
        let mic = (mic_chunk
            .iter()
            .map(|&x| x.abs())
            .max_by(|a, b| a.partial_cmp(b).unwrap())
            .unwrap_or(0.0)
            * 100.0) as u16;

        let speaker = (speaker_chunk
            .iter()
            .map(|&x| x.abs())
            .max_by(|a, b| a.partial_cmp(b).unwrap())
            .unwrap_or(0.0)
            * 100.0) as u16;

        Self::AudioAmplitude { mic, speaker }
    }
}

impl From<(&Vec<f32>, &Vec<f32>)> for SessionEvent {
    fn from((mic_chunk, speaker_chunk): (&Vec<f32>, &Vec<f32>)) -> Self {
        Self::from((mic_chunk.as_slice(), speaker_chunk.as_slice()))
    }
}
