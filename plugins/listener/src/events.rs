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
    pub(crate) fn fail_for_session(&mut self, session_id: &str, reason: String) -> bool {
        if self.session_id.as_deref() != Some(session_id)
            || !matches!(
                self.phase,
                PipelineStatusPhase::Starting
                    | PipelineStatusPhase::Active
                    | PipelineStatusPhase::Reconnecting
                    | PipelineStatusPhase::Paused
            )
        {
            return false;
        }
        self.phase = PipelineStatusPhase::Failed;
        self.reason = Some(reason);
        self.reconnect_attempt = None;
        self.reconnect_max_attempts = None;
        true
    }

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
            session_id: String,
            channel: String,
            words: Vec<typr_listener_interface::Word>,
        },
        #[serde(rename = "modelFallback")]
        ModelFallback { session_id: String, requested_model: String, effective_model: String },
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

#[cfg(test)]
mod tests {
    use super::*;

    fn live_status(phase: PipelineStatusPhase) -> PipelineStatus {
        PipelineStatus {
            phase,
            session_id: Some("recording".to_string()),
            ..PipelineStatus::inactive()
        }
    }

    #[tokio::test]
    async fn delayed_connection_failure_after_stop_keeps_inactive_status() {
        let status = std::sync::Arc::new(tokio::sync::Mutex::new(live_status(
            PipelineStatusPhase::Starting,
        )));
        let (failure_tx, failure_rx) = tokio::sync::oneshot::channel();
        let delayed_status = status.clone();
        let delayed_failure = tokio::spawn(async move {
            failure_rx.await.unwrap();
            delayed_status
                .lock()
                .await
                .fail_for_session("recording", "websocket_connect_failed".to_string())
        });

        *status.lock().await = PipelineStatus::inactive();
        failure_tx.send(()).unwrap();
        assert!(!delayed_failure.await.unwrap());
        assert_eq!(*status.lock().await, PipelineStatus::inactive());
    }

    #[test]
    fn current_live_session_failure_changes_status_to_failed() {
        for phase in [
            PipelineStatusPhase::Starting,
            PipelineStatusPhase::Active,
            PipelineStatusPhase::Reconnecting,
            PipelineStatusPhase::Paused,
        ] {
            let mut status = live_status(phase);
            assert!(status.fail_for_session("recording", "connection_failed".to_string()));
            assert_eq!(status.phase, PipelineStatusPhase::Failed);
            assert_eq!(status.reason.as_deref(), Some("connection_failed"));
        }
    }

    #[test]
    fn another_sessions_failure_does_not_change_current_status() {
        let mut status = live_status(PipelineStatusPhase::Active);
        let expected = status.clone();
        assert!(!status.fail_for_session("old-recording", "connection_failed".to_string()));
        assert_eq!(status, expected);
    }
}
