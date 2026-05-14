use std::time::{Duration, Instant};

use statig::prelude::*;

use tauri::Manager;
use tauri_specta::Event;

use futures_util::StreamExt;
use tokio::task::JoinSet;

use typr_audio::AsyncSource;

use crate::{
    PipelineStatus, PipelineStatusChanged, PipelineStatusPhase, SessionEvent, SttProvider,
};

const SAMPLE_RATE: u32 = 16000;

const AUDIO_AMPLITUDE_THROTTLE: Duration = Duration::from_millis(100);
const TRANSCRIPTION_STATUS_WINDOW_SYNC_INTERVAL: Duration = Duration::from_millis(750);

const WAV_SPEC: hound::WavSpec = hound::WavSpec {
    channels: 1,
    sample_rate: SAMPLE_RATE,
    bits_per_sample: 32,
    sample_format: hound::SampleFormat::Float,
};

fn is_cloud_stt_model(model: &str) -> bool {
    SttProvider::from_model(Some(model)).is_cloud()
}

fn emit_cloud_failure_event<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    model: Option<&str>,
    reason: &str,
    message: &str,
) {
    let failed_model = model.unwrap_or("unknown").to_string();
    if !is_cloud_stt_model(&failed_model) {
        return;
    }

    if let Err(err) = (SessionEvent::CloudTranscriptionFailed {
        reason: reason.to_string(),
        failed_model,
        message: message.to_string(),
    })
    .emit(app)
    {
        tracing::warn!(
            "[CLOUD_FAIL_EVENT] Failed to emit cloud failure event: {:?}",
            err
        );
    }
}

const STREAM_RECONNECT_DELAYS_SECS: [u64; 3] = [1, 5, 15];

async fn update_reconnect_pipeline_status(
    app: &tauri::AppHandle,
    session_id: &str,
    phase: PipelineStatusPhase,
    reason: &str,
    attempt: u32,
    max_attempts: u32,
) {
    let Some(state) = app.try_state::<crate::SharedState>() else {
        return;
    };

    let guard = state.lock().await;
    if guard.fsm.session_id.as_deref() != Some(session_id) {
        return;
    }

    guard
        .fsm
        .set_pipeline_phase(
            phase,
            Some(reason.to_string()),
            Some(attempt),
            Some(max_attempts),
        )
        .await;
}

fn schedule_stream_reconnect(
    app: tauri::AppHandle,
    session_id: String,
    model: Option<String>,
    reason: &'static str,
) {
    tokio::spawn(async move {
        for (attempt_index, delay_secs) in STREAM_RECONNECT_DELAYS_SECS.iter().enumerate() {
            let attempt = (attempt_index + 1) as u32;
            let max_attempts = STREAM_RECONNECT_DELAYS_SECS.len() as u32;

            tracing::info!(
                "[RECONNECT_COORD] Scheduling attempt {}/{} in {}s (reason={})",
                attempt,
                max_attempts,
                delay_secs,
                reason
            );
            update_reconnect_pipeline_status(
                &app,
                &session_id,
                PipelineStatusPhase::Reconnecting,
                reason,
                attempt,
                max_attempts,
            )
            .await;
            let _ = SessionEvent::CloudTranscriptionRecovery {
                phase: "scheduled".to_string(),
                reason: reason.to_string(),
                attempt,
                max_attempts,
            }
            .emit(&app);
            tokio::time::sleep(Duration::from_secs(*delay_secs)).await;

            let Some(state) = app.try_state::<crate::SharedState>() else {
                tracing::warn!(
                    "[RECONNECT_COORD] App state unavailable on attempt {}/{}",
                    attempt,
                    max_attempts
                );
                continue;
            };

            let mut guard = state.lock().await;
            let current_state = guard.fsm.state().clone();
            let current_session_id = guard.fsm.session_id.clone();

            if current_session_id.as_deref() != Some(session_id.as_str()) {
                tracing::info!(
                    "[RECONNECT_COORD] Session changed from {:?} to {:?}; aborting reconnect",
                    session_id,
                    current_session_id
                );
                return;
            }

            if !matches!(current_state, State::RunningActive {}) {
                tracing::info!(
                    "[RECONNECT_COORD] Session no longer active ({:?}); aborting reconnect",
                    current_state
                );
                return;
            }

            tracing::info!(
                "[RECONNECT_COORD] Attempt {}/{} starting (reason={})",
                attempt,
                max_attempts,
                reason
            );
            guard
                .fsm
                .set_pipeline_phase(
                    PipelineStatusPhase::Reconnecting,
                    Some(reason.to_string()),
                    Some(attempt),
                    Some(max_attempts),
                )
                .await;
            let _ = SessionEvent::CloudTranscriptionRecovery {
                phase: "started".to_string(),
                reason: reason.to_string(),
                attempt,
                max_attempts,
            }
            .emit(&app);

            guard.fsm.handle(&StateEvent::ReconnectStream).await;

            let reconnect_succeeded = matches!(
                guard.fsm.pipeline_status().await.phase,
                PipelineStatusPhase::Active
            ) && guard.fsm.session_id.as_deref()
                == Some(session_id.as_str());

            if reconnect_succeeded {
                tracing::info!(
                    "[RECONNECT_COORD] Attempt {}/{} succeeded",
                    attempt,
                    max_attempts
                );
                let _ = SessionEvent::CloudTranscriptionRecovery {
                    phase: "succeeded".to_string(),
                    reason: reason.to_string(),
                    attempt,
                    max_attempts,
                }
                .emit(&app);
                return;
            }

            tracing::warn!(
                "[RECONNECT_COORD] Attempt {}/{} did not restore active tasks",
                attempt,
                max_attempts
            );
        }

        tracing::error!(
            "[RECONNECT_COORD] Exhausted {} reconnect attempts for session {}",
            STREAM_RECONNECT_DELAYS_SECS.len(),
            session_id
        );
        update_reconnect_pipeline_status(
            &app,
            &session_id,
            PipelineStatusPhase::Failed,
            reason,
            STREAM_RECONNECT_DELAYS_SECS.len() as u32,
            STREAM_RECONNECT_DELAYS_SECS.len() as u32,
        )
        .await;
        emit_cloud_failure_event(
            &app,
            model.as_deref(),
            "reconnect_exhausted",
            "Transcription stream disconnected and could not be restored",
        );
        let _ = SessionEvent::CloudTranscriptionRecovery {
            phase: "exhausted".to_string(),
            reason: reason.to_string(),
            attempt: STREAM_RECONNECT_DELAYS_SECS.len() as u32,
            max_attempts: STREAM_RECONNECT_DELAYS_SECS.len() as u32,
        }
        .emit(&app);
    });
}

async fn evaluate_session_watchdog<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    watchdog: &mut crate::policy::SessionWatchdog,
    policy: crate::policy::SessionLifecyclePolicy,
    session_started_at: Instant,
    last_transcript_activity_at: Instant,
    is_running_active: bool,
    stream_count: u64,
    now: Instant,
) -> bool {
    let session_elapsed = now.duration_since(session_started_at);
    let silence_elapsed = now.duration_since(last_transcript_activity_at);

    let Some(action) =
        watchdog.evaluate(&policy, session_elapsed, silence_elapsed, is_running_active)
    else {
        return false;
    };

    match action {
        crate::policy::WatchdogAction::Warning { reason, remaining } => {
            let remaining_ms = u64::try_from(remaining.as_millis()).unwrap_or(u64::MAX);
            tracing::warn!(
                "[AUTO_STOP_WARNING] reason={} remaining_ms={} session_elapsed_ms={} silence_elapsed_ms={}",
                reason.as_str(),
                remaining_ms,
                session_elapsed.as_millis(),
                silence_elapsed.as_millis()
            );
            let _ = SessionEvent::AutoStopWarning {
                reason: reason.as_str().to_string(),
                remaining_ms,
            }
            .emit(app);
            false
        }
        crate::policy::WatchdogAction::Stop { reason } => {
            tracing::warn!(
                "[AUTO_STOP_TRIGGERED] reason={} session_elapsed_ms={} silence_elapsed_ms={} chunks={}",
                reason.as_str(),
                session_elapsed.as_millis(),
                silence_elapsed.as_millis(),
                stream_count
            );
            if let Some(state) = app.try_state::<crate::SharedState>() {
                let mut guard = state.lock().await;
                guard.fsm.handle(&StateEvent::Stop).await;
            }
            true
        }
    }
}

// Audio quality metrics functions for debugging AirPods/Bluetooth issues
fn calculate_rms(samples: &[f32]) -> f32 {
    if samples.is_empty() {
        return 0.0;
    }
    let sum_squares: f32 = samples.iter().map(|&x| x * x).sum();
    (sum_squares / samples.len() as f32).sqrt()
}

// Check if AEC should be disabled based on device UID comparison
// AEC should be disabled only when input and output are different physical devices
pub fn should_disable_aec() -> bool {
    #[cfg(target_os = "macos")]
    {
        use cidre::core_audio as ca;

        // Cache result for 5 seconds to avoid repeated Core Audio calls and log spam
        static CACHE: std::sync::OnceLock<std::sync::Mutex<(std::time::Instant, bool)>> =
            std::sync::OnceLock::new();

        let cache = CACHE.get_or_init(|| std::sync::Mutex::new((std::time::Instant::now(), false)));
        let mut guard = cache.lock().unwrap();

        if guard.0.elapsed() < std::time::Duration::from_secs(5) {
            return guard.1;
        }

        let disable_aec = match (
            ca::System::default_output_device(),
            ca::System::default_input_device(),
        ) {
            (Ok(output_device), Ok(input_device)) => {
                let output_uid = output_device
                    .uid()
                    .map(|uid| uid.to_string())
                    .unwrap_or_default();
                let input_uid = input_device
                    .uid()
                    .map(|uid| uid.to_string())
                    .unwrap_or_default();

                let output_name = output_device
                    .name()
                    .map(|n| n.to_string())
                    .unwrap_or_else(|_| "Unknown".to_string());
                let input_name = input_device
                    .name()
                    .map(|n| n.to_string())
                    .unwrap_or_else(|_| "Unknown".to_string());

                // Check if devices are truly different physical devices
                // Same device patterns:
                // 1. Identical UIDs (built-in speakers + built-in mic)
                // 2. Mac built-in devices (BuiltInSpeakerDevice + BuiltInMicrophoneDevice)
                // 3. Same base identifier (Studio Display, other external displays/docks)
                // 4. Same MAC with :input/:output suffix (AirPods, USB headsets)
                let different_devices = if output_uid == input_uid {
                    // Identical UIDs = definitely same device
                    false
                } else if output_uid.is_empty() || input_uid.is_empty() {
                    // Can't determine, assume different for safety
                    true
                } else if (output_uid.contains("BuiltIn") && input_uid.contains("BuiltIn"))
                    || (output_uid.contains("Built-in") && input_uid.contains("Built-in"))
                {
                    // Mac built-in speakers + mic = same device (enable AEC)
                    false
                } else {
                    // Use CoreAudio API to detect headphones (reliable, OS-provided property)
                    // Headphones have no acoustic coupling even if same physical device
                    let is_headphone_output = output_device
                        .streams()
                        .ok()
                        .map(|streams| {
                            streams.iter().any(|stream| {
                                stream
                                    .terminal_type()
                                    .ok()
                                    .map(|tt| tt.0 == 1751412840) // 'hphn' = kAudioStreamTerminalTypeHeadphones
                                    .unwrap_or(false)
                            })
                        })
                        .unwrap_or(false);

                    if is_headphone_output {
                        // Headphones/earbuds: No acoustic coupling (sealed audio path)
                        // Examples: AirPods, wired headphones, Bluetooth headsets, earbuds
                        // → Disable AEC (no echo to cancel)
                        true
                    } else {
                        // Check if same physical device based on base UID for non-headphone devices
                        let output_base = output_uid.split(':').next().unwrap_or("");
                        let input_base = input_uid.split(':').next().unwrap_or("");

                        if output_base == input_base && !output_base.is_empty() {
                            // Same base identifier = same physical device with acoustic coupling
                            // Examples: Studio Display, USB speakers, Thunderbolt docks
                            // → Enable AEC (acoustic coupling possible)
                            false
                        } else {
                            // Different base identifiers = truly different physical devices
                            true
                        }
                    }
                };

                static LAST_AEC_LOGGED: std::sync::OnceLock<
                    std::sync::Mutex<Option<(String, String, bool)>>,
                > = std::sync::OnceLock::new();
                let should_log = {
                    let last_logged = LAST_AEC_LOGGED.get_or_init(|| std::sync::Mutex::new(None));
                    let mut guard = last_logged.lock().unwrap();
                    let next = (output_uid.clone(), input_uid.clone(), different_devices);
                    if guard.as_ref() == Some(&next) {
                        false
                    } else {
                        *guard = Some(next);
                        true
                    }
                };

                if should_log {
                    tracing::info!(
                        "[AEC_DEVICE_CHECK] output='{}' input='{}' same_device={} aec={}",
                        output_name,
                        input_name,
                        !different_devices,
                        if different_devices {
                            "disabled"
                        } else {
                            "enabled"
                        }
                    );
                }

                different_devices
            }
            (Err(e), _) => {
                tracing::warn!(
                "[AEC_DEVICE_CHECK] Failed to get output device: {:?} - enabling AEC for safety",
                e
            );
                false // Default to AEC enabled for safety
            }
            (_, Err(e)) => {
                tracing::warn!(
                    "[AEC_DEVICE_CHECK] Failed to get input device: {:?} - enabling AEC for safety",
                    e
                );
                false // Default to AEC enabled for safety
            }
        };

        guard.0 = std::time::Instant::now();
        guard.1 = disable_aec;
        disable_aec
    }

    #[cfg(not(target_os = "macos"))]
    {
        // Windows: Always enable AEC since device detection logic is macOS-specific
        // Windows WASAPI has its own AEC handling
        true
    }
}

struct AudioSaver;

impl AudioSaver {
    async fn save_to_wav(
        rx: flume::Receiver<Vec<f32>>,
        session_id: &str,
        app_dir: &std::path::Path,
        filename: &str,
        append: bool,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let dir = app_dir.join(session_id);
        std::fs::create_dir_all(&dir)?;
        let path = dir.join(filename);

        let mut wav = if append && path.exists() {
            hound::WavWriter::append(path)?
        } else {
            hound::WavWriter::create(path, WAV_SPEC)?
        };

        while let Ok(chunk) = rx.recv_async().await {
            for sample in chunk {
                wav.write_sample(sample)?;
            }
        }

        wav.finalize()?;
        Ok(())
    }
}

// Size of the backup buffer for failed chunks
const BACKUP_BUFFER_SIZE: usize = 5;

struct AudioChannels {
    mic_tx: flume::Sender<Vec<f32>>,
    mic_rx: flume::Receiver<Vec<f32>>,
    speaker_tx: flume::Sender<Vec<f32>>,
    speaker_rx: flume::Receiver<Vec<f32>>,
    save_mixed_tx: flume::Sender<Vec<f32>>,
    save_mixed_rx: flume::Receiver<Vec<f32>>,
    save_mic_raw_tx: Option<flume::Sender<Vec<f32>>>,
    save_mic_raw_rx: Option<flume::Receiver<Vec<f32>>>,
    save_speaker_raw_tx: Option<flume::Sender<Vec<f32>>>,
    save_speaker_raw_rx: Option<flume::Receiver<Vec<f32>>>,
    process_mic_tx: flume::Sender<Vec<f32>>,
    process_mic_rx: flume::Receiver<Vec<f32>>,
    process_speaker_tx: flume::Sender<Vec<f32>>,
    process_speaker_rx: flume::Receiver<Vec<f32>>,
    // Backup buffer for chunks that fail to send
    backup_buffer: std::sync::Arc<std::sync::Mutex<std::collections::VecDeque<Vec<f32>>>>,
}

impl AudioChannels {
    fn new() -> Self {
        const CHUNK_BUFFER_SIZE: usize = 64;

        let (mic_tx, mic_rx) = flume::bounded::<Vec<f32>>(CHUNK_BUFFER_SIZE);
        let (speaker_tx, speaker_rx) = flume::bounded::<Vec<f32>>(CHUNK_BUFFER_SIZE);
        let (save_mixed_tx, save_mixed_rx) = flume::bounded::<Vec<f32>>(CHUNK_BUFFER_SIZE);
        let (process_mic_tx, process_mic_rx) = flume::bounded::<Vec<f32>>(CHUNK_BUFFER_SIZE);
        let (process_speaker_tx, process_speaker_rx) =
            flume::bounded::<Vec<f32>>(CHUNK_BUFFER_SIZE);

        let (save_mic_raw_tx, save_mic_raw_rx) = if cfg!(debug_assertions) {
            let (tx, rx) = flume::bounded::<Vec<f32>>(CHUNK_BUFFER_SIZE);
            (Some(tx), Some(rx))
        } else {
            (None, None)
        };

        // Always save speaker audio for async diarization (needed for AssemblyAI)
        // Small memory overhead (~2MB for 2min recording) but enables speaker labels
        let (save_speaker_raw_tx, save_speaker_raw_rx) = {
            let (tx, rx) = flume::bounded::<Vec<f32>>(CHUNK_BUFFER_SIZE);
            (Some(tx), Some(rx))
        };

        Self {
            mic_tx,
            mic_rx,
            speaker_tx,
            speaker_rx,
            save_mixed_tx,
            save_mixed_rx,
            save_mic_raw_tx,
            save_mic_raw_rx,
            save_speaker_raw_tx,
            save_speaker_raw_rx,
            process_mic_tx,
            process_mic_rx,
            process_speaker_tx,
            process_speaker_rx,
            backup_buffer: std::sync::Arc::new(std::sync::Mutex::new(
                std::collections::VecDeque::with_capacity(BACKUP_BUFFER_SIZE),
            )),
        }
    }

    async fn process_mic_stream(
        mut mic_stream: impl futures_util::Stream<Item = Vec<f32>> + Unpin,
        mic_muted_rx: tokio::sync::watch::Receiver<bool>,
        mic_tx: flume::Sender<Vec<f32>>,
    ) {
        let mut is_muted = *mic_muted_rx.borrow();
        let watch_rx = mic_muted_rx.clone();

        while let Some(actual) = mic_stream.next().await {
            if watch_rx.has_changed().unwrap_or(false) {
                is_muted = *watch_rx.borrow();
            }

            let maybe_muted = if is_muted {
                vec![0.0; actual.len()]
            } else {
                actual
            };

            if let Err(e) = mic_tx.send_async(maybe_muted).await {
                tracing::error!("mic_tx_send_error: {:?}", e);
                break;
            }
        }
    }

    async fn process_speaker_stream(
        mut speaker_stream: impl futures_util::Stream<Item = Vec<f32>> + Unpin,
        speaker_muted_rx: tokio::sync::watch::Receiver<bool>,
        speaker_tx: flume::Sender<Vec<f32>>,
    ) {
        let mut is_muted = *speaker_muted_rx.borrow();
        let watch_rx = speaker_muted_rx.clone();

        while let Some(actual) = speaker_stream.next().await {
            if watch_rx.has_changed().unwrap_or(false) {
                is_muted = *watch_rx.borrow();
            }

            let maybe_muted = if is_muted {
                vec![0.0; actual.len()]
            } else {
                actual
            };

            if let Err(e) = speaker_tx.send_async(maybe_muted).await {
                tracing::error!("speaker_tx_send_error: {:?}", e);
                break;
            }
        }
    }
}

pub struct Session {
    app: tauri::AppHandle,
    session_id: Option<String>,
    mic_device_name: Option<String>,
    mic_selection_mode: MicSelectionMode,
    mic_muted_tx: Option<tokio::sync::watch::Sender<bool>>,
    mic_muted_rx: Option<tokio::sync::watch::Receiver<bool>>,
    speaker_muted_tx: Option<tokio::sync::watch::Sender<bool>>,
    speaker_muted_rx: Option<tokio::sync::watch::Receiver<bool>>,
    silence_stream_tx: Option<std::sync::mpsc::Sender<()>>,
    session_state_tx: Option<tokio::sync::watch::Sender<State>>,
    tasks: Option<JoinSet<()>>,
    device_monitor_handle: Option<typr_audio::DeviceMonitorHandle>,
    process_mic_tx: Option<flume::Sender<Vec<f32>>>,
    process_speaker_tx: Option<flume::Sender<Vec<f32>>>,
    is_local_stt: bool, // Track if using local STT for silence injection
    lifecycle_policy: crate::policy::SessionLifecyclePolicy,
    pipeline_status: std::sync::Arc<tokio::sync::Mutex<PipelineStatus>>,
    stream_connected_rx: Option<tokio::sync::watch::Receiver<bool>>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MicSelectionMode {
    Auto,
    Manual,
}

impl Session {
    pub fn new(app: tauri::AppHandle) -> Self {
        let mic_device_name = typr_audio::AudioInput::get_default_mic_device_name();

        Self {
            app,
            session_id: None,
            mic_device_name: Some(mic_device_name),
            mic_selection_mode: MicSelectionMode::Auto,
            mic_muted_tx: None,
            mic_muted_rx: None,
            speaker_muted_tx: None,
            speaker_muted_rx: None,
            silence_stream_tx: None,
            tasks: None,
            session_state_tx: None,
            device_monitor_handle: None,
            process_mic_tx: None,
            process_speaker_tx: None,
            is_local_stt: false,
            lifecycle_policy: crate::policy::SessionLifecyclePolicy::default(),
            pipeline_status: std::sync::Arc::new(tokio::sync::Mutex::new(
                PipelineStatus::inactive(),
            )),
            stream_connected_rx: None,
        }
    }

    pub async fn pipeline_status(&self) -> PipelineStatus {
        self.pipeline_status.lock().await.clone()
    }

    async fn emit_pipeline_status(&self) {
        let status = self.pipeline_status().await;
        Self::log_pipeline_status("emit", &status);
        Self::sync_transcription_status_window(&self.app, &status, true);

        if let Err(err) = (PipelineStatusChanged { status }).emit(&self.app) {
            tracing::warn!("[PIPELINE_STATUS] Failed to emit status: {:?}", err);
        }
    }

    fn log_pipeline_status(scope: &str, status: &PipelineStatus) {
        tracing::info!(
            "[PIPELINE_STATUS] {} phase={:?} session_id={:?} reason={:?} reconnect={:?}/{:?} mic_enabled={} speaker_enabled={}",
            scope,
            status.phase,
            status.session_id,
            status.reason,
            status.reconnect_attempt,
            status.reconnect_max_attempts,
            status.mic_enabled,
            status.speaker_enabled
        );
    }

    fn sync_transcription_status_window(
        app: &tauri::AppHandle,
        status: &PipelineStatus,
        log_result: bool,
    ) {
        use tauri_plugin_flags::{FlagsPluginExt, StoreKey as FlagsStoreKey};
        use tauri_plugin_windows::{TyprWindow, WindowsPluginExt};

        let flag_enabled = app
            .is_enabled(FlagsStoreKey::TranscriptionStatusNotch)
            .unwrap_or_else(|err| {
                tracing::debug!(
                    "[TRANSCRIPTION_STATUS_WINDOW] flag lookup unavailable: {:?}",
                    err
                );
                false
            });

        let main_window_on_screen = Self::main_window_on_screen(app);
        let should_show = flag_enabled
            && !matches!(status.phase, PipelineStatusPhase::Inactive)
            && !main_window_on_screen;
        let current_visible = app
            .window_is_visible(TyprWindow::TranscriptionStatus)
            .unwrap_or(false);

        if current_visible == should_show {
            if log_result {
                tracing::info!(
                    "[TRANSCRIPTION_STATUS_WINDOW] sync phase={:?} flag_enabled={} main_window_on_screen={} visible={} unchanged=true",
                    status.phase,
                    flag_enabled,
                    main_window_on_screen,
                    current_visible
                );
            }
            return;
        }

        let sync_result = if should_show {
            app.window_show(TyprWindow::TranscriptionStatus).map(|_| ())
        } else {
            app.window_hide(TyprWindow::TranscriptionStatus)
        };

        match sync_result {
            Ok(()) => {
                if log_result {
                    tracing::info!(
                        "[TRANSCRIPTION_STATUS_WINDOW] sync phase={:?} flag_enabled={} main_window_on_screen={} visible={} unchanged=false",
                        status.phase,
                        flag_enabled,
                        main_window_on_screen,
                        should_show
                    );
                }
            }
            Err(err) => tracing::warn!(
                "[TRANSCRIPTION_STATUS_WINDOW] failed to sync visibility: {:?}",
                err
            ),
        }
    }

    fn main_window_on_screen(app: &tauri::AppHandle) -> bool {
        use tauri_plugin_windows::{TyprWindow, WindowsPluginExt};

        app.window_is_on_screen(TyprWindow::Main).unwrap_or(false)
    }

    async fn set_pipeline_phase(
        &self,
        phase: PipelineStatusPhase,
        reason: Option<String>,
        reconnect_attempt: Option<u32>,
        reconnect_max_attempts: Option<u32>,
    ) {
        {
            let mut status = self.pipeline_status.lock().await;
            status.phase = phase;
            status.session_id = self.session_id.clone();
            status.reason = reason;
            status.reconnect_attempt = reconnect_attempt;
            status.reconnect_max_attempts = reconnect_max_attempts;

            if matches!(status.phase, PipelineStatusPhase::Starting) && status.started_at.is_none()
            {
                status.started_at = Some(chrono::Utc::now().to_rfc3339());
            }

            if matches!(status.phase, PipelineStatusPhase::Inactive) {
                *status = PipelineStatus::inactive();
            }
        }

        self.emit_pipeline_status().await;
    }

    async fn update_pipeline_inputs(&self) {
        {
            let mut status = self.pipeline_status.lock().await;
            status.mic_enabled = !self.is_mic_muted();
            status.speaker_enabled = !self.is_speaker_muted();
        }
        self.emit_pipeline_status().await;
    }

    async fn mark_pipeline_audio(status: &std::sync::Arc<tokio::sync::Mutex<PipelineStatus>>) {
        let mut status = status.lock().await;
        if !matches!(status.phase, PipelineStatusPhase::Inactive) {
            status.last_audio_at = Some(chrono::Utc::now().to_rfc3339());
        }
    }

    async fn mark_pipeline_words(status: &std::sync::Arc<tokio::sync::Mutex<PipelineStatus>>) {
        let mut status = status.lock().await;
        if !matches!(status.phase, PipelineStatusPhase::Inactive) {
            status.last_words_at = Some(chrono::Utc::now().to_rfc3339());
        }
    }

    async fn mark_pipeline_active(
        app: &tauri::AppHandle,
        status: &std::sync::Arc<tokio::sync::Mutex<PipelineStatus>>,
    ) {
        let next = {
            let mut status = status.lock().await;
            if matches!(
                status.phase,
                PipelineStatusPhase::Starting | PipelineStatusPhase::Reconnecting
            ) {
                status.phase = PipelineStatusPhase::Active;
                status.reason = None;
                status.reconnect_attempt = None;
                status.reconnect_max_attempts = None;
                Some(status.clone())
            } else {
                None
            }
        };

        if let Some(status) = next {
            Self::log_pipeline_status("active", &status);
            Self::sync_transcription_status_window(app, &status, true);

            if let Err(err) = (PipelineStatusChanged { status }).emit(app) {
                tracing::warn!("[PIPELINE_STATUS] Failed to emit active status: {:?}", err);
            }
        }
    }

    async fn mark_pipeline_failed(
        app: &tauri::AppHandle,
        status: &std::sync::Arc<tokio::sync::Mutex<PipelineStatus>>,
        reason: impl Into<String>,
    ) {
        let status = {
            let mut status = status.lock().await;
            status.phase = PipelineStatusPhase::Failed;
            status.reason = Some(reason.into());
            status.reconnect_attempt = None;
            status.reconnect_max_attempts = None;
            status.clone()
        };

        Self::log_pipeline_status("failed", &status);
        Self::sync_transcription_status_window(app, &status, true);

        if let Err(err) = (PipelineStatusChanged { status }).emit(app) {
            tracing::warn!("[PIPELINE_STATUS] Failed to emit failed status: {:?}", err);
        }
    }

    async fn wait_for_stream_connection(&mut self, timeout: Duration) -> bool {
        let Some(rx) = &mut self.stream_connected_rx else {
            return false;
        };

        if *rx.borrow() {
            return true;
        }

        tokio::time::timeout(timeout, async {
            loop {
                if rx.changed().await.is_err() {
                    return false;
                }

                if *rx.borrow() {
                    return true;
                }
            }
        })
        .await
        .unwrap_or(false)
    }

    fn load_session_lifecycle_policy(
        &self,
    ) -> Result<crate::policy::SessionLifecyclePolicy, crate::Error> {
        use tauri_plugin_config::{ConfigPluginExt, StoreKey};

        let store = self.app.config_store();
        let mut should_save = false;

        let mut read_or_default = |key: StoreKey,
                                   key_name: &str,
                                   default_value: u32|
         -> Result<Option<u32>, crate::Error> {
            match store
                .get::<u32>(key)
                .map_err(|e| crate::Error::Custom(format!("Failed to read {}: {}", key_name, e)))?
            {
                Some(value) => Ok(Some(value)),
                None => {
                    should_save = true;
                    Ok(Some(default_value))
                }
            }
        };

        let inactivity_stop_after_ms = read_or_default(
            StoreKey::SessionInactivityStopAfterMs,
            "SessionInactivityStopAfterMs",
            crate::policy::DEFAULT_INACTIVITY_STOP_AFTER_MS,
        )?;

        let inactivity_warning_before_ms = read_or_default(
            StoreKey::SessionInactivityWarningBeforeMs,
            "SessionInactivityWarningBeforeMs",
            crate::policy::DEFAULT_INACTIVITY_WARNING_BEFORE_MS,
        )?;

        let max_session_duration_ms = read_or_default(
            StoreKey::SessionMaxDurationMs,
            "SessionMaxDurationMs",
            crate::policy::DEFAULT_MAX_SESSION_DURATION_MS,
        )?;

        let max_session_warning_before_ms = read_or_default(
            StoreKey::SessionMaxDurationWarningBeforeMs,
            "SessionMaxDurationWarningBeforeMs",
            crate::policy::DEFAULT_MAX_SESSION_WARNING_BEFORE_MS,
        )?;

        if should_save {
            let persist = |key: StoreKey, key_name: &str, value: u32| -> Result<(), crate::Error> {
                store
                    .set(key, value)
                    .map_err(|e| crate::Error::Custom(format!("Failed to set {}: {}", key_name, e)))
            };

            persist(
                StoreKey::SessionInactivityStopAfterMs,
                "SessionInactivityStopAfterMs",
                inactivity_stop_after_ms.unwrap_or(crate::policy::DEFAULT_INACTIVITY_STOP_AFTER_MS),
            )?;

            persist(
                StoreKey::SessionInactivityWarningBeforeMs,
                "SessionInactivityWarningBeforeMs",
                inactivity_warning_before_ms
                    .unwrap_or(crate::policy::DEFAULT_INACTIVITY_WARNING_BEFORE_MS),
            )?;

            persist(
                StoreKey::SessionMaxDurationMs,
                "SessionMaxDurationMs",
                max_session_duration_ms.unwrap_or(crate::policy::DEFAULT_MAX_SESSION_DURATION_MS),
            )?;

            persist(
                StoreKey::SessionMaxDurationWarningBeforeMs,
                "SessionMaxDurationWarningBeforeMs",
                max_session_warning_before_ms
                    .unwrap_or(crate::policy::DEFAULT_MAX_SESSION_WARNING_BEFORE_MS),
            )?;

            store
                .save()
                .map_err(|e| crate::Error::Custom(format!("Failed to save config store: {}", e)))?;
        }

        Ok(crate::policy::SessionLifecyclePolicy::from_config_values(
            inactivity_stop_after_ms,
            inactivity_warning_before_ms,
            max_session_duration_ms,
            max_session_warning_before_ms,
        ))
    }

    fn current_cloud_stt_model(&self) -> Option<String> {
        use tauri_plugin_connector::{ConnectorPluginExt, StoreKey};

        self.app
            .connector_store()
            .get::<String>(StoreKey::SttModel)
            .ok()
            .flatten()
            .filter(|model| is_cloud_stt_model(model))
    }

    // Wait for Bluetooth devices to stabilize by querying device rates directly.
    // IMPORTANT: Do NOT create speaker taps/aggregate devices here — creating and destroying
    // them rapidly during Bluetooth profile switching (A2DP→HFP) can leave CoreAudio in a
    // state where subsequent taps receive zero-filled buffers.
    async fn wait_for_bluetooth_stabilization(max_attempts: u32) -> Result<(), crate::Error> {
        for attempt in 1..=max_attempts {
            let mic_rate = {
                let mut input = typr_audio::AudioInput::from_mic(None);
                input.stream().sample_rate()
            };

            // Query speaker device rate directly via CoreAudio API — no tap or aggregate device
            #[cfg(target_os = "macos")]
            let speaker_rate = {
                use cidre::core_audio as ca;
                ca::System::default_output_device()
                    .ok()
                    .and_then(|d| d.actual_sample_rate().ok())
                    .map(|r| r as u32)
                    .unwrap_or(0)
            };
            #[cfg(not(target_os = "macos"))]
            let speaker_rate = {
                typr_audio::AudioInput::from_speaker(None)
                    .stream()
                    .sample_rate()
            };

            // Check if rates are reasonable (not 0 or unrealistic values)
            if mic_rate >= 8000 && speaker_rate >= 8000 {
                tracing::info!(
                    "[DEVICE_STABILIZATION] Attempt {}: mic={}Hz speaker={}Hz - devices stabilized",
                    attempt,
                    mic_rate,
                    speaker_rate
                );
                return Ok(());
            }

            tracing::warn!(
                "[DEVICE_STABILIZATION] Attempt {}: mic={}Hz speaker={}Hz - waiting for stabilization...",
                attempt, mic_rate, speaker_rate
            );

            tokio::time::sleep(Duration::from_millis(25)).await;
        }

        tracing::error!(
            "[DEVICE_STABILIZATION] Failed to stabilize after {} attempts",
            max_attempts
        );
        Err(crate::Error::DeviceInitialization(
            "Device stabilization timeout".into(),
        ))
    }

    #[tracing::instrument(skip_all)]
    async fn setup_resources(&mut self, id: impl Into<String>) -> Result<(), crate::Error> {
        use tauri_plugin_db::DatabasePluginExt;

        let session_id = id.into();
        let onboarding_session_id = self.app.db_onboarding_session_id().await?;

        self.session_id = Some(session_id.clone());

        if let Some(handle) = self.device_monitor_handle.take() {
            tracing::info!("[DEVICE_MONITOR] Restarting device monitor");
            handle.stop();
        }

        let (record, languages, jargons, redemption_time_ms, lifecycle_policy) = {
            // Read from config store (instant, no sync delays)
            let general_config = tauri_plugin_config::commands::get_general_config(
                self.app.clone(),
            )
            .map_err(|e| crate::Error::Custom(format!("Failed to get general config: {}", e)))?;

            let ai_config = tauri_plugin_config::commands::get_ai_config(self.app.clone())
                .map_err(|e| crate::Error::Custom(format!("Failed to get AI config: {}", e)))?;

            let languages = general_config.spoken_languages;
            tracing::info!(
                "[LANGUAGE_DEBUG] Config from store, spoken_languages={:?}",
                languages
            );

            let jargons = general_config.jargons;
            let record = general_config.save_recordings.unwrap_or(false);
            let redemption_time_ms = ai_config.redemption_time_ms.unwrap_or(500); // Conservative value - the upstream implementation used 400ms but streams partial results
            let lifecycle_policy = self.load_session_lifecycle_policy()?;

            (
                record,
                languages,
                jargons,
                redemption_time_ms,
                lifecycle_policy,
            )
        };
        self.lifecycle_policy = lifecycle_policy;

        let session = self
            .app
            .db_get_session(&session_id)
            .await?
            .ok_or(crate::Error::NoneSession)?;

        let (mic_muted_tx, mic_muted_rx_main) = tokio::sync::watch::channel(false);
        let (speaker_muted_tx, speaker_muted_rx_main) = tokio::sync::watch::channel(false);
        let (session_state_tx, session_state_rx) =
            tokio::sync::watch::channel(State::RunningActive {});

        // Clone session_state_rx for the stream monitoring task before it gets moved
        let session_state_rx_for_stream_monitor = session_state_rx.clone();

        self.mic_muted_tx = Some(mic_muted_tx);
        self.mic_muted_rx = Some(mic_muted_rx_main.clone());
        self.speaker_muted_tx = Some(speaker_muted_tx);
        self.speaker_muted_rx = Some(speaker_muted_rx_main.clone());
        self.session_state_tx = Some(session_state_tx);

        // Start device monitor to detect audio device changes
        let (device_event_tx, device_event_rx) = std::sync::mpsc::channel();
        let device_monitor_handle = typr_audio::DeviceMonitor::spawn(device_event_tx);
        self.device_monitor_handle = Some(device_monitor_handle);

        // Spawn task to handle device change events
        let app_clone = self.app.clone();
        tokio::task::spawn_blocking(move || {
            while let Ok(event) = device_event_rx.recv() {
                match event {
                    typr_audio::DeviceEvent::DefaultInputChanged => {
                        tracing::info!("[DEVICE_MONITOR] Default input device changed");
                        let app_for_switch = app_clone.clone();
                        tauri::async_runtime::spawn(async move {
                            if let Some(state) = app_for_switch.try_state::<crate::SharedState>() {
                                let mut guard = state.lock().await;
                                let is_auto_mode = guard.fsm.is_mic_selection_auto();

                                if is_auto_mode {
                                    let new_default_device_name =
                                        typr_audio::AudioInput::get_default_mic_device_name();
                                    let current_device_name = guard.fsm.get_current_mic_device();

                                    if current_device_name.as_deref()
                                        != Some(new_default_device_name.as_str())
                                    {
                                        tracing::info!(
                                            "[DEVICE_MONITOR] Auto-switching mic to new default: {}",
                                            new_default_device_name
                                        );

                                        guard
                                            .fsm
                                            .handle(&StateEvent::MicChange(Some(
                                                new_default_device_name,
                                            )))
                                            .await;
                                    }
                                }
                            }

                            // Emit event to frontend to refresh device list and selected device
                            let _ = crate::SessionEvent::DeviceChanged {}.emit(&app_for_switch);
                        });
                    }
                    typr_audio::DeviceEvent::DefaultOutputChanged { .. } => {
                        tracing::debug!("[DEVICE_MONITOR] Default output device changed");
                        // We could also emit for output changes if needed
                    }
                }
            }
        });

        tracing::warn!(
            "[VAD_CONFIG] Using redemption_time_ms={} (onboarding={})",
            redemption_time_ms,
            session_id == onboarding_session_id
        );

        tracing::info!(
            "🖥️ [SYSTEM_INFO] OS={} ARCH={}",
            std::env::consts::OS,
            std::env::consts::ARCH
        );

        // ============================================================================
        // PHASE 1: NETWORK SETUP - Connect to transcription service FIRST
        // This validates the service is available BEFORE locking audio devices
        // Prevents audio lock during slow/failed network operations
        // ============================================================================
        tracing::info!("🔌 [PHASE 1] Connecting to transcription service...");

        // Determine which provider we're using (need this for connection setup)
        let selected_model: Option<String> = {
            use tauri_plugin_connector::ConnectorPluginExt;
            self.app
                .connector_store()
                .get::<String>(tauri_plugin_connector::StoreKey::SttModel)
                .ok()
                .flatten()
        };

        let provider = SttProvider::from_model(selected_model.as_deref());
        let is_local = provider.is_local();

        tracing::info!(
            "🎙️ [STT_PROVIDER] Selected: {:?} | provider={} | local={} | OS={}",
            selected_model,
            provider.label(),
            is_local,
            std::env::consts::OS
        );

        // Store provider type for conditional silence injection
        self.is_local_stt = is_local;

        // Determine target sample rate based on provider.
        // AssemblyAI and local models use 16kHz streams.
        let target_sample_rate = 16000;

        tracing::info!(
            "[RATE_SELECTION] Target rate: {}Hz (provider: {})",
            target_sample_rate,
            provider.label()
        );

        // Connect to transcription service with timeout
        // This is the network-dependent operation that can be slow
        tracing::info!(
            "⏳ [CONNECTION] Attempting to connect to transcription service (10s timeout)..."
        );
        let connection_timeout = Duration::from_secs(10);
        let (listen_client, listen_provider) = match tokio::time::timeout(
            connection_timeout,
            setup_listen_client(
                &self.app,
                languages.clone(),
                jargons.clone(),
                session_id == onboarding_session_id,
                redemption_time_ms,
            ),
        )
        .await
        {
            Err(_) => {
                tracing::error!(
                    "🔌 [PHASE 1] Connection timeout after {:?}",
                    connection_timeout
                );
                emit_cloud_failure_event(
                    &self.app,
                    selected_model.as_deref(),
                    "connection_timeout",
                    "Transcription service connection timeout",
                );
                return Err(crate::Error::Custom(
                    "Transcription service connection timeout".to_string(),
                ));
            }
            Ok(Err(err)) => {
                tracing::error!(
                    "🔌 [PHASE 1] Failed to initialize transcription client: {:?}",
                    err
                );
                emit_cloud_failure_event(
                    &self.app,
                    selected_model.as_deref(),
                    "connection_setup_failed",
                    &err.to_string(),
                );
                return Err(err);
            }
            Ok(Ok(client)) => client,
        };

        tracing::info!("🔌 [PHASE 1] Service connection established");

        // ============================================================================
        // PHASE 2: AUDIO INITIALIZATION - Lock devices only after successful connection
        // Audio devices are only locked for the minimum time needed
        // ============================================================================
        tracing::info!("🎤 [PHASE 2] Initializing audio devices...");

        // Wait for Bluetooth devices to stabilize before locking
        Self::wait_for_bluetooth_stabilization(30).await?;

        if self.is_mic_selection_auto() {
            self.mic_device_name = Some(typr_audio::AudioInput::get_default_mic_device_name());
        }

        // Create mic stream first — this may trigger Bluetooth profile switch (A2DP→HFP)
        let mic_sample_stream = {
            let mut input = typr_audio::AudioInput::from_mic(self.mic_device_name.clone());
            let resolved_device_name = input.device_name();
            if self.mic_device_name.as_deref() != Some(resolved_device_name.as_str()) {
                tracing::info!(
                    "[MIC_DEVICE] Requested {:?}, resolved to {}",
                    self.mic_device_name,
                    resolved_device_name
                );
            }
            self.mic_device_name = Some(resolved_device_name);
            input.stream()
        };
        let mic_original_rate = mic_sample_stream.sample_rate();

        // Let Bluetooth profile switch settle before creating speaker tap.
        // Opening the mic on AirPods triggers A2DP→HFP transition which changes the output
        // device sample rate. Creating the speaker tap during this transition can result in
        // the process tap receiving zero-filled buffers.
        tokio::time::sleep(Duration::from_millis(500)).await;

        // Read the settled device rate BEFORE creating the speaker tap
        let speaker_original_rate = {
            #[cfg(target_os = "macos")]
            {
                use cidre::core_audio as ca;
                ca::System::default_output_device()
                    .ok()
                    .and_then(|device| device.actual_sample_rate().ok())
                    .map(|rate| rate as u32)
                    .unwrap_or(48000)
            }
            #[cfg(not(target_os = "macos"))]
            {
                // Windows: create stream to read rate (no process tap involved)
                typr_audio::AudioInput::from_speaker(None)
                    .stream()
                    .sample_rate()
            }
        };

        tracing::info!(
            "[RATE_FROM_DEVICE] Reading rates: mic={}Hz (from stream), speaker={}Hz (from device)",
            mic_original_rate,
            speaker_original_rate
        );

        // Create speaker tap exactly ONCE with the correct sample rate override.
        // No create-drop-recreate — the previous approach of creating a tap without override,
        // dropping it, then recreating with override could leave CoreAudio in a bad state,
        // especially with Bluetooth devices mid-profile-switch.
        let speaker_sample_stream =
            typr_audio::AudioInput::from_speaker(Some(speaker_original_rate)).stream();

        tracing::info!(
            "[SPEAKER_TAP_CREATED] Single speaker tap created with rate override: {}Hz (stream reports: {}Hz)",
            speaker_original_rate,
            speaker_sample_stream.sample_rate()
        );

        tracing::info!("🎤 [PHASE 2] Audio devices initialized");

        // ============================================================================
        // PHASE 3: AUDIO PIPELINE - Start processing now that both are ready
        // ============================================================================
        tracing::info!("🚀 [PHASE 3] Starting audio pipeline...");

        // Log sample rate information for debugging
        tracing::info!(
            "[AUDIO_PIPELINE_INIT] Sample rates - Mic: {}Hz → {}Hz, Speaker: {}Hz → {}Hz",
            mic_original_rate,
            target_sample_rate,
            speaker_original_rate,
            target_sample_rate
        );

        // Now resample with correct source rates
        // Speaker stream was recreated with sample_rate_override, so it reports the correct rate
        let mic_stream = mic_sample_stream
            .resample(target_sample_rate)
            .chunks(typr_aec::BLOCK_SIZE);

        let speaker_stream = speaker_sample_stream
            .resample(target_sample_rate)
            .chunks(typr_aec::BLOCK_SIZE);

        let channels = AudioChannels::new();

        // Store for silence injection
        self.process_mic_tx = Some(channels.process_mic_tx.clone());
        self.process_speaker_tx = Some(channels.process_speaker_tx.clone());

        {
            let silence_stream_tx = typr_audio::AudioOutput::silence();
            self.silence_stream_tx = Some(silence_stream_tx);
        }

        let mut tasks = JoinSet::new();

        tasks.spawn({
            let app = self.app.clone();
            let pipeline_status = self.pipeline_status.clone();

            async move {
                let mut interval = tokio::time::interval(TRANSCRIPTION_STATUS_WINDOW_SYNC_INTERVAL);

                loop {
                    interval.tick().await;

                    let status = pipeline_status.lock().await.clone();
                    Self::sync_transcription_status_window(&app, &status, false);

                    if matches!(status.phase, PipelineStatusPhase::Inactive) {
                        break;
                    }
                }
            }
        });

        tasks.spawn(AudioChannels::process_mic_stream(
            mic_stream,
            mic_muted_rx_main.clone(),
            channels.mic_tx.clone(),
        ));

        tasks.spawn(AudioChannels::process_speaker_stream(
            speaker_stream,
            speaker_muted_rx_main.clone(),
            channels.speaker_tx.clone(),
        ));

        let app_dir = self.app.path().app_data_dir().unwrap();

        tasks.spawn({
            let app = self.app.clone();
            let pipeline_status = self.pipeline_status.clone();
            let mic_rx = channels.mic_rx.clone();
            let speaker_rx = channels.speaker_rx.clone();
            let save_mixed_tx = channels.save_mixed_tx.clone();
            let save_mic_raw_tx = channels.save_mic_raw_tx.clone();
            let save_speaker_raw_tx = channels.save_speaker_raw_tx.clone();
            let process_mic_tx = channels.process_mic_tx.clone();
            let process_speaker_tx = channels.process_speaker_tx.clone();
            async move {
                let mut aec = typr_aec::AEC::new().unwrap();
                let mut last_broadcast = Instant::now();

                // TODO: AGC might be needed.
                const PRE_MIC_GAIN: f32 = 1.0;
                const PRE_SPEAKER_GAIN: f32 = 0.8;
                const POST_MIC_GAIN: f32 = 1.0;
                const POST_SPEAKER_GAIN: f32 = 1.0;

                // Use independent channel processing to handle variable Bluetooth buffer sizes
                let mut last_speaker_chunk = vec![0.0; typr_aec::BLOCK_SIZE];
                loop {
                    // Non-blocking: process whichever channel has data ready
                    let (mic_chunk_raw, speaker_chunk): (Vec<f32>, Vec<f32>) = tokio::select! {
                        mic_result = mic_rx.recv_async() => {
                            match mic_result {
                                Ok(mic) => {
                                    // Try to get speaker data without blocking
                                    let speaker = speaker_rx.try_recv().unwrap_or_else(|_| last_speaker_chunk.clone());
                                    last_speaker_chunk = speaker.clone();

                                    let processed_mic: Vec<f32> = mic.iter().map(|x| *x * PRE_MIC_GAIN).collect();
                                    let processed_speaker: Vec<f32> = speaker.iter().map(|x| *x * PRE_SPEAKER_GAIN).collect();

                                    static AUDIO_DEBUG_COUNTER: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
                                    let debug_count = AUDIO_DEBUG_COUNTER.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
                                    if debug_count % 100 == 0 {
                                        let mic_rms_pre_aec = calculate_rms(&processed_mic);
                                        let speaker_rms_pre_aec = calculate_rms(&processed_speaker);
                                        tracing::trace!(
                                            "[AUDIO_PIPELINE_1] Pre-AEC: mic_rms={:.4} spk_rms={:.4} (samples: mic={}, spk={})",
                                            mic_rms_pre_aec,
                                            speaker_rms_pre_aec,
                                            processed_mic.len(),
                                            processed_speaker.len()
                                        );
                                    }

                                    (processed_mic, processed_speaker)
                                },
                                Err(_) => break,
                            }
                        },
                        speaker_result = speaker_rx.recv_async() => {
                            match speaker_result {
                                Ok(speaker) => {
                                    last_speaker_chunk = speaker.clone();
                                    // Wait for next mic chunk
                                    continue;
                                },
                                Err(_) => break,
                            }
                        }
                    };

                    // Check if AEC should be disabled (same logic for all providers)
                    // Headphones: Disable AEC (no acoustic coupling)
                    // Built-in speakers: Enable AEC (prevents echo/feedback in dual streams)
                    let disable_aec = should_disable_aec();

                    let mic_chunk = if disable_aec {
                        // Skip AEC for headphones - no acoustic coupling
                        static BYPASS_DEBUG_COUNTER: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
                        let bypass_debug_count = BYPASS_DEBUG_COUNTER.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
                        if bypass_debug_count % 100 == 0 {
                            let mic_rms = calculate_rms(&mic_chunk_raw);
                            let speaker_rms = calculate_rms(&speaker_chunk);
                            tracing::trace!(
                                "[AUDIO_PIPELINE_2] Post-AEC: mic_rms={:.4} spk_rms={:.4} (AEC bypassed - different devices)",
                                mic_rms,
                                speaker_rms
                            );
                        }
                        mic_chunk_raw.clone()
                    } else {
                        // Built-in speakers: Use AEC + VAD hybrid approach
                        // VAD (Voice Activity Detection): Mute mic when speaker is actively playing
                        // This prevents acoustic echo that AEC alone can't fully remove
                        let speaker_rms = calculate_rms(&speaker_chunk);
                        const SPEAKER_ACTIVE_THRESHOLD: f32 = 0.015; // Tune based on testing

                        if speaker_rms > SPEAKER_ACTIVE_THRESHOLD {
                            // Speaker is actively playing - mute mic to prevent echo
                            static VAD_DEBUG_COUNTER: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
                            let vad_debug_count = VAD_DEBUG_COUNTER.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
                            if vad_debug_count % 100 == 0 {
                                let mic_rms = calculate_rms(&mic_chunk_raw);
                                tracing::trace!(
                                    "[AUDIO_PIPELINE_2] Post-VAD: mic_rms={:.4} spk_rms={:.4} (mic muted - speaker active)",
                                    mic_rms,
                                    speaker_rms
                                );
                            }
                            vec![0.0; mic_chunk_raw.len()]
                        } else {
                            // Speaker quiet - use AEC for residual echo removal
                            let maybe_mic_chunk = aec.process_streaming(&mic_chunk_raw, &speaker_chunk);
                            match maybe_mic_chunk {
                                Ok(mic_chunk) => {
                                    static AEC_DEBUG_COUNTER: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
                                    let aec_debug_count = AEC_DEBUG_COUNTER.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
                                    if aec_debug_count % 100 == 0 {
                                        let mic_rms_post = calculate_rms(&mic_chunk);
                                        tracing::trace!(
                                            "[AUDIO_PIPELINE_2] Post-AEC: mic_rms={:.4} spk_rms={:.4} (AEC active - speaker quiet)",
                                            mic_rms_post,
                                            speaker_rms
                                        );
                                    }
                                    mic_chunk
                                },
                                Err(e) => {
                                    tracing::error!("aec_error: {:?}", e);
                                    mic_chunk_raw.clone()
                                }
                            }
                        }
                    };

                    // Track pause state to reset AEC on resume
                    static WAS_PAUSED: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

                    // Stop processing audio completely during pause for privacy
                    // WebSocket stays alive via keep-alive messages (every 3 seconds)
                    if matches!(*session_state_rx.borrow(), State::RunningPaused {}) {
                        WAS_PAUSED.store(true, std::sync::atomic::Ordering::Relaxed);
                        tokio::time::sleep(tokio::time::Duration::from_millis(50)).await;
                        continue;
                    }

                    // Check if we just resumed from pause - reset AEC to clear adaptive filter state
                    if WAS_PAUSED.swap(false, std::sync::atomic::Ordering::Relaxed) {
                        // Just resumed - reset AEC to prevent over-suppression of user voice
                        // AEC learns echo patterns during playback, which can incorrectly suppress
                        // legitimate speech after resume if not cleared
                        aec = typr_aec::AEC::new().unwrap();
                        tracing::info!("[AEC_RESET] AEC reset after resume to clear adaptive filter state");
                    }

                    let processed_mic: Vec<f32> =
                        mic_chunk.iter().map(|x| x * POST_MIC_GAIN).collect();
                    let processed_speaker: Vec<f32> = speaker_chunk
                        .iter()
                        .map(|x| x * POST_SPEAKER_GAIN)
                        .collect();

                    // Log audio levels after final processing.
                    static FINAL_DEBUG_COUNTER: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
                    let final_debug_count = FINAL_DEBUG_COUNTER.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
                    if final_debug_count % 100 == 0 {
                        let final_mic_rms = calculate_rms(&processed_mic);
                        let final_speaker_rms = calculate_rms(&processed_speaker);
                        tracing::trace!(
                            "[AUDIO_PIPELINE_3] final_processed: mic_rms={:.4} spk_rms={:.4}",
                            final_mic_rms,
                            final_speaker_rms
                        );
                    }

                    let now = Instant::now();
                    if now.duration_since(last_broadcast) >= AUDIO_AMPLITUDE_THROTTLE {
                        let mic_rms = calculate_rms(&mic_chunk);
                        let speaker_rms = calculate_rms(&speaker_chunk);
                        if mic_rms > 0.001 || speaker_rms > 0.001 {
                            Self::mark_pipeline_audio(&pipeline_status).await;
                        }

                        if let Err(e) = SessionEvent::from((&mic_chunk, &speaker_chunk)).emit(&app)
                        {
                            tracing::error!("broadcast_error: {:?}", e);
                        }
                        last_broadcast = now;
                    }

                    if let Some(ref tx) = save_mic_raw_tx {
                        let _ = tx.send_async(mic_chunk_raw.clone()).await;
                    }
                    if let Some(ref tx) = save_speaker_raw_tx {
                        let _ = tx.send_async(speaker_chunk.clone()).await;
                    }

                    if let Err(e) = process_mic_tx.send_async(processed_mic).await {
                        tracing::error!("❌ process_mic_tx_send_error: {:?} - Receiver dropped or channel closed", e);
                        tracing::error!("💡 Likely cause: Transcription service connection failed or was terminated");
                        return;
                    }
                    if let Err(e) = process_speaker_tx.send_async(processed_speaker).await {
                        tracing::error!("❌ process_speaker_tx_send_error: {:?} - Receiver dropped or channel closed", e);
                        return;
                    }

                    if record {
                        let mixed: Vec<f32> = mic_chunk
                            .iter()
                            .zip(speaker_chunk.iter())
                            .map(|(mic, speaker)| {
                                (mic * POST_MIC_GAIN + speaker * POST_SPEAKER_GAIN).clamp(-1.0, 1.0)
                            })
                            .collect();
                        if save_mixed_tx.send_async(mixed.clone()).await.is_err() {
                            tracing::error!("save_mixed_tx_send_error");

                            // Store in backup buffer
                            let mut buffer = channels.backup_buffer.lock().unwrap();
                            if buffer.len() >= BACKUP_BUFFER_SIZE {
                                buffer.pop_front(); // Remove oldest if buffer is full
                            }
                            buffer.push_back(mixed);

                            // Note: In a more complete implementation, we would update the
                            // redemption_time_ms setting here to prevent future errors.
                            // But for now we'll just log it.
                            tracing::info!(
                                "Consider increasing redemption_time_ms to improve stability"
                            );
                        }
                    }
                }
            }
        });

        if record {
            tasks.spawn({
                let app_dir = app_dir.clone();
                let session_id = session_id.clone();
                let save_mixed_rx = channels.save_mixed_rx.clone();

                async move {
                    if let Err(e) = AudioSaver::save_to_wav(
                        save_mixed_rx,
                        &session_id,
                        &app_dir,
                        "audio.wav",
                        true,
                    )
                    .await
                    {
                        tracing::error!("failed_to_save_mixed_audio: {:?}", e);
                    }
                }
            });
        }

        if let Some(save_mic_raw_rx) = channels.save_mic_raw_rx.clone() {
            tasks.spawn({
                let session_id = session_id.clone();
                let app_dir = app_dir.clone();

                async move {
                    if let Err(e) = AudioSaver::save_to_wav(
                        save_mic_raw_rx,
                        &session_id,
                        &app_dir,
                        "audio_mic.wav",
                        false,
                    )
                    .await
                    {
                        tracing::error!("failed_to_save_raw_mic_audio: {:?}", e);
                    }
                }
            });
        }

        // Save speaker audio for async diarization (built-in speakers mode)
        if let Some(save_speaker_raw_rx) = channels.save_speaker_raw_rx.clone() {
            tasks.spawn({
                let session_id = session_id.clone();
                let app_dir = app_dir.clone();

                async move {
                    if let Err(e) = AudioSaver::save_to_wav(
                        save_speaker_raw_rx,
                        &session_id,
                        &app_dir,
                        "audio_speaker.wav",
                        false,
                    )
                    .await
                    {
                        tracing::error!("[AUDIO_SAVE] failed_to_save_raw_speaker_audio: {:?}", e);
                    }
                }
            });
        }

        let is_cloud_provider = listen_provider.is_cloud();

        let mic_audio_stream = if is_cloud_provider {
            // Rechunk to 50ms (800 samples) for cloud providers
            const CLOUD_CHUNK_SIZE: usize = 800; // 50ms at 16kHz
            let mut buffer = Vec::new();
            Box::pin(channels.process_mic_rx.into_stream().flat_map(move |samples| {
                let rms = calculate_rms(&samples);
                let peak = samples.iter().fold(0.0_f32, |a, &b| a.max(b.abs()));
                if rms > 0.8 || peak > 0.95 {
                    tracing::warn!("[AUDIO_QUALITY_MIC] Clipping detected: rms={:.4} peak={:.4} - reduce mic gain", rms, peak);
                }
                buffer.extend(samples);
                let mut chunks = Vec::new();
                while buffer.len() >= CLOUD_CHUNK_SIZE {
                    let chunk: Vec<f32> = buffer.drain(..CLOUD_CHUNK_SIZE).collect();
                    chunks.push(typr_audio_utils::f32_to_i16_bytes(chunk));
                }
                futures_util::stream::iter(chunks)
            })) as std::pin::Pin<Box<dyn futures_util::Stream<Item = bytes::Bytes> + Send>>
        } else {
            // Local models: keep 512-sample chunks (32ms)
            Box::pin(channels.process_mic_rx.into_stream().map(|samples| {
                let rms = calculate_rms(&samples);
                let peak = samples.iter().fold(0.0_f32, |a, &b| a.max(b.abs()));
                if rms > 0.8 || peak > 0.95 {
                    tracing::warn!("[AUDIO_QUALITY_MIC] Clipping detected: rms={:.4} peak={:.4} - reduce mic gain", rms, peak);
                }
                typr_audio_utils::f32_to_i16_bytes(samples)
            })) as std::pin::Pin<Box<dyn futures_util::Stream<Item = bytes::Bytes> + Send>>
        };

        let speaker_audio_stream = if is_cloud_provider {
            const CLOUD_CHUNK_SIZE: usize = 800; // 50ms at 16kHz
            let mut buffer = Vec::new();
            Box::pin(channels.process_speaker_rx.into_stream().flat_map(move |samples| {
                let rms = calculate_rms(&samples);
                let peak = samples.iter().fold(0.0_f32, |a, &b| a.max(b.abs()));
                if rms > 0.8 || peak > 0.95 {
                    tracing::warn!("[AUDIO_QUALITY_SPEAKER] Clipping detected: rms={:.4} peak={:.4} - reduce system volume", rms, peak);
                }
                buffer.extend(samples);
                let mut chunks = Vec::new();
                while buffer.len() >= CLOUD_CHUNK_SIZE {
                    let chunk: Vec<f32> = buffer.drain(..CLOUD_CHUNK_SIZE).collect();
                    chunks.push(typr_audio_utils::f32_to_i16_bytes(chunk));
                }
                futures_util::stream::iter(chunks)
            })) as std::pin::Pin<Box<dyn futures_util::Stream<Item = bytes::Bytes> + Send>>
        } else {
            Box::pin(channels.process_speaker_rx.into_stream().map(|samples| {
                let rms = calculate_rms(&samples);
                let peak = samples.iter().fold(0.0_f32, |a, &b| a.max(b.abs()));
                if rms > 0.8 || peak > 0.95 {
                    tracing::warn!("[AUDIO_QUALITY_SPEAKER] Clipping detected: rms={:.4} peak={:.4} - reduce system volume", rms, peak);
                }
                typr_audio_utils::f32_to_i16_bytes(samples)
            })) as std::pin::Pin<Box<dyn futures_util::Stream<Item = bytes::Bytes> + Send>>
        };

        let (stream_connected_tx, stream_connected_rx) = tokio::sync::watch::channel(false);
        self.stream_connected_rx = Some(stream_connected_rx);

        // Spawn WebSocket connection in background immediately
        // This allows audio processing tasks to start consuming audio right away
        // The mic indicator will turn orange as soon as audio starts flowing
        tracing::info!(
            "🔌 [CONNECTION] Initiating WebSocket connection to transcription service..."
        );
        let listen_stream_task = tokio::spawn(async move {
            let result = listen_client
                .from_realtime_audio(mic_audio_stream, speaker_audio_stream)
                .await;

            if result.is_ok() {
                tracing::info!("✅ [CONNECTION] WebSocket connection established successfully");
            } else {
                tracing::error!("❌ [CONNECTION] WebSocket connection failed");
            }

            result
        });

        // Log that pipeline is starting (WebSocket connecting in background)
        tracing::info!("🚀 [PHASE 3] Audio pipeline starting (connecting to service...)");

        let selected_model_for_stream_error = selected_model.clone();

        tasks.spawn({
            let app = self.app.clone();
            let policy = self.lifecycle_policy;
            let selected_model_for_stream_error = selected_model_for_stream_error.clone();
            let pipeline_status = self.pipeline_status.clone();

            async move {
                // Wait for WebSocket connection to complete
                tracing::info!("🔌 [PHASE 3] Waiting for WebSocket connection to transcription service...");
                let listen_stream = match listen_stream_task.await {
                    Ok(Ok(stream)) => {
                        tracing::info!("✅ [PHASE 3] Audio pipeline started successfully - WebSocket connected");
                        let _ = stream_connected_tx.send(true);
                        Self::mark_pipeline_active(&app, &pipeline_status).await;
                        stream
                    }
                    Ok(Err(e)) => {
                        tracing::error!("❌ [PHASE 3] Failed to establish listen stream: {:?}", e);
                        tracing::error!("💡 Check: 1) API keys configured 2) Network connectivity 3) Firewall not blocking");
                        Self::mark_pipeline_failed(&app, &pipeline_status, "websocket_connect_failed").await;
                        emit_cloud_failure_event(
                            &app,
                            selected_model_for_stream_error.as_deref(),
                            "websocket_connect_failed",
                            &e.to_string(),
                        );
                        return;
                    }
                    Err(e) => {
                        tracing::error!("❌ [PHASE 3] Task join error (task panicked or was cancelled): {:?}", e);
                        Self::mark_pipeline_failed(&app, &pipeline_status, "websocket_task_join_failed").await;
                        emit_cloud_failure_event(
                            &app,
                            selected_model_for_stream_error.as_deref(),
                            "websocket_task_join_failed",
                            &e.to_string(),
                        );
                        return;
                    }
                };

                futures_util::pin_mut!(listen_stream);
                let mut last_transcript_activity_at = std::time::Instant::now();
                let session_started_at = std::time::Instant::now();
                let mut last_heartbeat = std::time::Instant::now();
                let mut stream_count: u64 = 0;
                let mut watchdog = crate::policy::SessionWatchdog::default();
                let mut auto_stop_triggered = false;
                let mut watchdog_tick = tokio::time::interval(Duration::from_secs(1));
                watchdog_tick.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);

                tracing::info!("[STREAM_START] Listen stream started, waiting for audio chunks");

                loop {
                    tokio::select! {
                        maybe_result = listen_stream.next() => {
                            let Some(result) = maybe_result else {
                                break;
                            };

                            stream_count += 1;
                            let meta = result.meta.clone();
                            let now = std::time::Instant::now();
                            let silence_duration_ms = now.duration_since(last_transcript_activity_at).as_millis();
                            let is_running_active = matches!(
                                *session_state_rx_for_stream_monitor.borrow(),
                                State::RunningActive {}
                            );

                            if evaluate_session_watchdog(
                                &app,
                                &mut watchdog,
                                policy,
                                session_started_at,
                                last_transcript_activity_at,
                                is_running_active,
                                stream_count,
                                now,
                            )
                            .await
                            {
                                auto_stop_triggered = true;
                                break;
                            }

                            // Monitor for unusually long silence periods that might indicate device issues
                            if silence_duration_ms > 60_000 && stream_count % 10 == 0 {
                                tracing::trace!(
                                    "[DEVICE_MONITOR] Long silence detected: {}ms, stream_count={}",
                                    silence_duration_ms,
                                    stream_count
                                );
                            }

                            if !result.words.is_empty() {
                                tracing::debug!(
                                    "[STT_FLUSH] words={} silence_ms={} text={:?} total_chunks={}",
                                    result.words.len(),
                                    silence_duration_ms,
                                    result.words.first().map(|w| &w.text),
                                    stream_count
                                );
                            } else {
                                tracing::debug!(
                                    "[STT_EMPTY] chunk={} silence_ms={}",
                                    stream_count,
                                    silence_duration_ms
                                );
                            }

                            // AssemblyAI turn-based deduplication
                            // Parse metadata to check for turn_order (only present for AssemblyAI)
                            let words_to_emit = if let Some(meta_json) = meta {
                                if let (Some(turn_order), Some(end_of_turn)) = (
                                    meta_json["turn_order"].as_u64(),
                                    meta_json["end_of_turn"].as_bool(),
                                ) {
                                    // AssemblyAI streaming with turn tracking
                                    // Get channel ID from metadata (reliable even when words are empty)
                                    let channel_id = meta_json["channel_id"]
                                        .as_str()
                                        .unwrap_or("unknown");

                                    let aai_session_index =
                                        meta_json["aai_session_index"].as_u64().unwrap_or(0);
                                    let turn_key = format!(
                                        "{}:{}:{}",
                                        session.id, channel_id, aai_session_index
                                    ); // Per-channel, per-provider-session turn tracking
                                    let mut turn_state = ASSEMBLYAI_TURN_STATE.lock().await;

                                    let progress = turn_state.entry(turn_key).or_default();
                                    let previous_turn = progress.turn_order;
                                    let (new_words, merge_meta) =
                                        merge_assemblyai_turn_words(progress, turn_order as u32, result.words);

                                    if merge_meta.is_new_turn {
                                        tracing::debug!(
                                            "[AAI_TURN] NEW turn_order={} (was {}) - APPENDING {} words",
                                            turn_order,
                                            previous_turn,
                                            new_words.len()
                                        );
                                    } else if merge_meta.is_old_turn {
                                        tracing::warn!(
                                            "[AAI_TURN] OLD turn_order={} < current {} - IGNORING",
                                            turn_order,
                                            previous_turn
                                        );
                                    } else {
                                        if merge_meta.had_divergence {
                                            tracing::warn!(
                                                "[AAI_TURN] turn_order={} channel={} diverged at index {} (prev_words={}, curr_words={})",
                                                turn_order,
                                                channel_id,
                                                merge_meta.prefix_len,
                                                merge_meta.previous_len,
                                                merge_meta.current_len
                                            );
                                        }

                                        if !new_words.is_empty() {
                                            tracing::debug!(
                                                "[AAI_TURN] SAME turn_order={} end_of_turn={} - {} incremental words (prefix={})",
                                                turn_order,
                                                end_of_turn,
                                                new_words.len(),
                                                merge_meta.prefix_len
                                            );
                                        }
                                    }

                                    new_words
                                } else {
                                    // No turn metadata - standard append
                                    result.words
                                }
                            } else {
                                // No metadata - standard append
                                result.words
                            };

                            if words_to_emit.is_empty() {
                                continue; // Skip this update
                            }

                            // Track inactivity from incremental transcript activity only.
                            last_transcript_activity_at = now;

                            // Update session with deduplicated words
                            match update_session(&app, &session.id, words_to_emit).await {
                                Ok(updated_words) => {
                                    Self::mark_pipeline_words(&pipeline_status).await;
                                    if let Err(e) = (SessionEvent::Words {
                                        words: updated_words,
                                    })
                                    .emit(&app)
                                    {
                                        tracing::error!("[SESSION_EVENT_EMIT_FAILED] {:?}", e);
                                    }
                                }
                                Err(e) => {
                                    tracing::error!("[SESSION_UPDATE_FAILED] {:?} - continuing stream", e);
                                }
                            }
                        }
                        _ = watchdog_tick.tick() => {
                            let now = std::time::Instant::now();
                            let silence_duration_ms = now.duration_since(last_transcript_activity_at).as_millis();
                            let is_running_active = matches!(
                                *session_state_rx_for_stream_monitor.borrow(),
                                State::RunningActive {}
                            );

                            if evaluate_session_watchdog(
                                &app,
                                &mut watchdog,
                                policy,
                                session_started_at,
                                last_transcript_activity_at,
                                is_running_active,
                                stream_count,
                                now,
                            )
                            .await
                            {
                                auto_stop_triggered = true;
                                break;
                            }

                            // Heartbeat every 30 seconds to show stream is alive, even during silence.
                            if now.duration_since(last_heartbeat) >= Duration::from_secs(30) {
                                tracing::debug!(
                                    "[STREAM_HEARTBEAT] count={} last_words_ago={}ms",
                                    stream_count,
                                    silence_duration_ms
                                );
                                last_heartbeat = now;
                            }
                        }
                    }
                }

                tracing::info!(
                    "[STREAM_END] {} chunks, last_words={}ms ago - checking for device change recovery",
                    stream_count,
                    std::time::Instant::now()
                        .duration_since(last_transcript_activity_at)
                        .as_millis()
                );

                if auto_stop_triggered {
                    tracing::info!(
                        "[STREAM_END] Auto-stop already handled lifecycle transition; skipping reconnection logic"
                    );
                    return;
                }

                // Handle reconnection based on stream stability.
                // The recovery path aborts and drains the session JoinSet, so reconnect must be
                // coordinated outside the current stream-monitor task to avoid self-cancellation.
                if matches!(*session_state_rx_for_stream_monitor.borrow(), State::RunningActive {}) {
                    let session_id_for_reconnect = session.id.clone();
                    let model_for_reconnect = selected_model_for_stream_error.clone();

                    if stream_count > 50 {
                        tracing::info!(
                            "[STREAM_END] Stable stream ended while active - scheduling reconnect coordinator"
                        );
                        schedule_stream_reconnect(
                            app.clone(),
                            session_id_for_reconnect,
                            model_for_reconnect,
                            "stream_disconnected",
                        );
                    } else {
                        tracing::warn!(
                            "[STREAM_END] Early connection failure (stream_count={}) - scheduling reconnect coordinator",
                            stream_count
                        );
                        schedule_stream_reconnect(
                            app.clone(),
                            session_id_for_reconnect,
                            model_for_reconnect,
                            "stream_disconnected",
                        );
                    }
                }
            }
        });

        self.tasks = Some(tasks);

        Ok(())
    }

    async fn inject_silence_for_flush(&mut self) {
        if !self.is_local_stt {
            tracing::info!("[FLUSH] Sending paced cloud silence to force final transcription turn");

            const CLOUD_FLUSH_CHUNK_SAMPLES: usize = 800;
            const CLOUD_FLUSH_CHUNKS: usize = 56;
            const CLOUD_FLUSH_CHUNK_MS: u64 = 50;
            const CLOUD_FLUSH_SEND_TIMEOUT_MS: u64 = 50;

            let silence = vec![0.0f32; CLOUD_FLUSH_CHUNK_SAMPLES];

            for _ in 0..CLOUD_FLUSH_CHUNKS {
                if let Some(mic_tx) = &self.process_mic_tx {
                    let _ = tokio::time::timeout(
                        Duration::from_millis(CLOUD_FLUSH_SEND_TIMEOUT_MS),
                        mic_tx.send_async(silence.clone()),
                    )
                    .await;
                }

                if let Some(speaker_tx) = &self.process_speaker_tx {
                    let _ = tokio::time::timeout(
                        Duration::from_millis(CLOUD_FLUSH_SEND_TIMEOUT_MS),
                        speaker_tx.send_async(silence.clone()),
                    )
                    .await;
                }

                tokio::time::sleep(Duration::from_millis(CLOUD_FLUSH_CHUNK_MS)).await;
            }

            tokio::time::sleep(Duration::from_millis(700)).await;
            tracing::info!("[FLUSH] Cloud silence flush complete");
            return;
        }

        tracing::info!("[FLUSH] Injecting silence to force VAD SpeechEnd (local STT only)");

        let silence = vec![0.0f32; 512];

        if let Some(mic_tx) = &self.process_mic_tx {
            for _ in 0..32 {
                let _ = mic_tx.try_send(silence.clone());
            }
        }

        if let Some(speaker_tx) = &self.process_speaker_tx {
            for _ in 0..32 {
                let _ = speaker_tx.try_send(silence.clone());
            }
        }

        tokio::time::sleep(std::time::Duration::from_secs(3)).await;
        tracing::info!("[FLUSH] Silence injection complete");
    }

    #[tracing::instrument(skip_all)]
    async fn teardown_resources(&mut self, flush_transcript: bool) {
        // Inject silence before teardown to flush VAD
        if flush_transcript && (self.process_mic_tx.is_some() || self.process_speaker_tx.is_some())
        {
            self.inject_silence_for_flush().await;
        }

        self.process_mic_tx = None;
        self.process_speaker_tx = None;
        self.stream_connected_rx = None;

        if let Some(session_id) = &self.session_id {
            tracing::info!("Session {} teardown complete", session_id);
        }

        self.session_id = None;

        if let Some(tx) = self.silence_stream_tx.take() {
            let _ = tx.send(());
        }

        if let Some(handle) = self.device_monitor_handle.take() {
            tracing::info!("[DEVICE_MONITOR] Stopping device monitor");
            handle.stop();
        }

        if let Some(mut tasks) = self.tasks.take() {
            tracing::info!("[TEARDOWN] Aborting {} background tasks", tasks.len());
            tasks.abort_all();
            while tasks.join_next().await.is_some() {}
        }
    }

    pub fn is_mic_muted(&self) -> bool {
        match &self.mic_muted_rx {
            Some(rx) => *rx.borrow(),
            None => false,
        }
    }

    pub fn is_speaker_muted(&self) -> bool {
        match &self.speaker_muted_rx {
            Some(rx) => *rx.borrow(),
            None => false,
        }
    }

    pub fn get_available_mic_devices() -> Vec<String> {
        typr_audio::AudioInput::list_mic_devices()
    }

    pub fn get_current_mic_device(&self) -> Option<String> {
        self.mic_device_name.clone()
    }

    pub fn is_mic_selection_auto(&self) -> bool {
        self.mic_selection_mode == MicSelectionMode::Auto
    }

    pub fn get_mic_selection_mode(&self) -> MicSelectionMode {
        self.mic_selection_mode
    }

    /// Graceful recovery from audio device changes without full session restart
    async fn recover_from_device_change(&mut self, session_id: &str) -> Result<(), crate::Error> {
        self.recover_from_device_change_with_retry(session_id, 0)
            .await
    }

    async fn recover_active_stream(&mut self, reason: &str) -> bool {
        let Some(session_id) = self.session_id.clone() else {
            tracing::warn!(
                "[STREAM_RECOVERY] Skipping recovery (reason={}) - no active session",
                reason
            );
            return false;
        };

        tracing::info!(
            "[STREAM_RECOVERY] Starting recovery (reason={}) session_id={}",
            reason,
            session_id
        );

        if let Err(e) = self.recover_from_device_change(&session_id).await {
            tracing::error!(
                "[STREAM_RECOVERY] Graceful recovery failed (reason={}): {:?}. Falling back to full restart",
                reason,
                e
            );

            self.teardown_resources(false).await;

            if let Err(setup_err) = self.setup_resources(&session_id).await {
                tracing::error!(
                    "[STREAM_RECOVERY] Full restart failed (reason={}): {:?}",
                    reason,
                    setup_err
                );
                let model = self.current_cloud_stt_model();
                emit_cloud_failure_event(
                    &self.app,
                    model.as_deref(),
                    "stream_recovery_failed",
                    &format!(
                        "Failed to recover transcription stream after disconnect: {}",
                        setup_err
                    ),
                );
                self.set_pipeline_phase(
                    PipelineStatusPhase::Failed,
                    Some("stream_recovery_failed".to_string()),
                    None,
                    None,
                )
                .await;
                return false;
            }
        }

        true
    }

    /// Internal recovery with retry logic
    fn recover_from_device_change_with_retry<'a>(
        &'a mut self,
        session_id: &'a str,
        retry_count: u32,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<(), crate::Error>> + Send + 'a>>
    {
        Box::pin(async move {
            const MAX_RETRIES: u32 = 1;

            tracing::info!(
                "[DEVICE_RECOVERY] Starting graceful recovery for session: {} (attempt {}/{})",
                session_id,
                retry_count + 1,
                MAX_RETRIES + 1
            );

            // Step 1: Only abort audio processing tasks, keep session metadata
            if let Some(mut tasks) = self.tasks.take() {
                tracing::info!("[DEVICE_RECOVERY] Stopping audio tasks...");
                tasks.abort_all();
                while let Some(_) = tasks.join_next().await {}
            }

            // Step 1.5: Clear AssemblyAI turn state to allow new WebSocket connection to start fresh
            // The new connection will start at turn_order=0, so we need to reset our tracking
            {
                let mut turn_state = ASSEMBLYAI_TURN_STATE.lock().await;
                turn_state.clear();
                tracing::info!("[DEVICE_RECOVERY] Cleared AssemblyAI turn state");
            }

            // Step 2: Re-setup audio streams with new device (keeps session alive)
            tracing::info!("[DEVICE_RECOVERY] Re-initializing audio with new device...");
            self.setup_resources(session_id).await?;

            // Step 3: Verify stream health after reconnection. Active tasks alone are not
            // enough; the listen task must report that the new stream connected.
            tracing::info!("[DEVICE_RECOVERY] Waiting for stream connection verification...");
            let tasks_alive = self.tasks.as_ref().is_some_and(|tasks| !tasks.is_empty());
            let stream_connected = self
                .wait_for_stream_connection(Duration::from_secs(8))
                .await;
            let recovery_successful = tasks_alive && stream_connected;

            if !recovery_successful {
                tracing::error!(
                    "[DEVICE_RECOVERY] Health check failed: tasks_alive={} stream_connected={}",
                    tasks_alive,
                    stream_connected
                );

                if retry_count < MAX_RETRIES {
                    tracing::warn!(
                        "[DEVICE_RECOVERY] Retrying recovery (attempt {}/{})",
                        retry_count + 2,
                        MAX_RETRIES + 1
                    );
                    return self
                        .recover_from_device_change_with_retry(session_id, retry_count + 1)
                        .await;
                } else {
                    return Err(crate::Error::DeviceInitialization(
                    "Device recovery failed after retries: WebSocket connection could not be established".to_string(),
                ));
                }
            }

            tracing::info!(
                "[DEVICE_RECOVERY] Recovery completed successfully (attempt {}/{})",
                retry_count + 1,
                MAX_RETRIES + 1
            );
            Ok(())
        })
    }
}

async fn setup_listen_client<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    languages: Vec<typr_language::Language>,
    jargons: Vec<String>,
    is_onboarding: bool,
    redemption_time_ms: u32,
) -> Result<(crate::client::ListenClientDual, SttProvider), crate::Error> {
    let conn = {
        use tauri_plugin_connector::{Connection, ConnectorPluginExt};
        let conn: Connection = app.get_stt_connection().await?.into();
        conn
    };
    let api_base = conn.api_base;

    // Get selected STT model from connector store
    let selected_model: Option<String> = {
        use tauri_plugin_connector::ConnectorPluginExt;
        let result = app
            .connector_store()
            .get::<String>(tauri_plugin_connector::StoreKey::SttModel)
            .ok()
            .flatten();
        tracing::warn!(
            "[STT_MODEL_RETRIEVAL] Retrieved model from store: {:?}",
            result
        );
        result
    };

    let provider = SttProvider::from_model(selected_model.as_deref());

    let api_key = if provider.is_cloud() {
        conn.api_key.unwrap_or_default()
    } else {
        String::new()
    };

    let user_id = {
        use tauri_plugin_db::DatabasePluginExt;
        app.db_user_id().await.ok().flatten()
    };

    // Include custom vocabulary in static prompt to improve transcription accuracy
    let static_prompt = if jargons.is_empty() {
        "".to_string()
    } else {
        format!("The following terms may appear: {}", jargons.join(", "))
    };
    let jargon_count = jargons.len();

    tracing::info!(
        "[STT_SESSION_CONFIG] provider={} model={:?} languages_count={} jargon_count={} static_prompt_enabled={} redemption_time_ms={}",
        provider.label(),
        selected_model,
        languages.len(),
        jargon_count,
        !static_prompt.trim().is_empty(),
        redemption_time_ms
    );

    // Speaker attribution strategy:
    // - All models use DUAL mode for speaker separation
    // - AEC/VAD in audio pipeline prevents echo duplication for built-in speakers
    // - Now that Studio Display is properly detected as "same device", AEC will work correctly
    let aec_status = if should_disable_aec() {
        "AEC disabled (headphones/external)"
    } else {
        "AEC enabled (built-in speakers)"
    };

    tracing::info!(
        "[SPEAKER_ATTRIBUTION] provider={} ({})",
        provider.label(),
        aec_status
    );

    Ok((
        crate::client::ListenClient::builder()
            .api_base(api_base)
            .api_key(api_key)
            .params(typr_listener_interface::ListenParams {
                languages,
                static_prompt,
                keyterms_prompt: jargons,
                redemption_time_ms: if is_onboarding {
                    70
                } else if provider.is_cloud() {
                    200 // Low latency for cloud streaming
                } else {
                    (redemption_time_ms as u64).max(400) // Stable for local models
                },
                model: selected_model,
                user_id,
                ..Default::default()
            })
            .build_dual(),
        provider,
    ))
}

#[derive(Debug, Default, Clone)]
struct AssemblyAITurnProgress {
    turn_order: u32,
    word_keys: Vec<String>,
    old_turn_streak: u8,
}

#[derive(Debug, Default, Clone, Copy)]
struct AssemblyAITurnMergeMeta {
    is_new_turn: bool,
    is_old_turn: bool,
    prefix_len: usize,
    previous_len: usize,
    current_len: usize,
    had_divergence: bool,
}

fn word_dedupe_key(word: &typr_listener_interface::Word) -> String {
    let text = word.text.trim();
    match (word.start_ms, word.end_ms) {
        (Some(start), Some(end)) => format!("{}:{}:{}", start, end, text),
        _ => text.to_string(),
    }
}

fn common_prefix_len(left: &[String], right: &[String]) -> usize {
    left.iter()
        .zip(right.iter())
        .take_while(|(a, b)| a == b)
        .count()
}

fn merge_assemblyai_turn_words(
    progress: &mut AssemblyAITurnProgress,
    turn_order: u32,
    words: Vec<typr_listener_interface::Word>,
) -> (Vec<typr_listener_interface::Word>, AssemblyAITurnMergeMeta) {
    const OLD_TURN_RESET_STREAK_THRESHOLD: u8 = 3;

    if turn_order > progress.turn_order {
        progress.turn_order = turn_order;
        progress.word_keys = words.iter().map(word_dedupe_key).collect();
        progress.old_turn_streak = 0;
        return (
            words,
            AssemblyAITurnMergeMeta {
                is_new_turn: true,
                current_len: progress.word_keys.len(),
                ..Default::default()
            },
        );
    }

    if turn_order < progress.turn_order {
        progress.old_turn_streak = progress.old_turn_streak.saturating_add(1);

        // If we see repeated "old turn" chunks, treat it as a provider turn-order reset.
        // This prevents a permanent drop state where all future chunks get ignored.
        if progress.old_turn_streak >= OLD_TURN_RESET_STREAK_THRESHOLD {
            progress.turn_order = turn_order;
            progress.word_keys = words.iter().map(word_dedupe_key).collect();
            progress.old_turn_streak = 0;
            return (
                words,
                AssemblyAITurnMergeMeta {
                    is_new_turn: true,
                    current_len: progress.word_keys.len(),
                    ..Default::default()
                },
            );
        }

        return (
            vec![],
            AssemblyAITurnMergeMeta {
                is_old_turn: true,
                previous_len: progress.word_keys.len(),
                ..Default::default()
            },
        );
    }

    let current_word_keys: Vec<String> = words.iter().map(word_dedupe_key).collect();
    progress.old_turn_streak = 0;
    let prefix_len = common_prefix_len(&progress.word_keys, &current_word_keys);
    let previous_len = progress.word_keys.len();
    let current_len = current_word_keys.len();
    let had_divergence = prefix_len < previous_len;
    let new_words: Vec<_> = words.into_iter().skip(prefix_len).collect();

    progress.word_keys = current_word_keys;

    (
        new_words,
        AssemblyAITurnMergeMeta {
            prefix_len,
            previous_len,
            current_len,
            had_divergence,
            ..Default::default()
        },
    )
}

#[cfg(test)]
mod tests {
    use super::{merge_assemblyai_turn_words, AssemblyAITurnProgress};

    fn word(text: &str, start: u64, end: u64) -> typr_listener_interface::Word {
        typr_listener_interface::Word {
            text: text.to_string(),
            start_ms: Some(start),
            end_ms: Some(end),
            ..Default::default()
        }
    }

    #[test]
    fn merge_same_turn_cumulative_emits_only_incremental_words() {
        let mut progress = AssemblyAITurnProgress::default();

        let first = vec![word("hello", 0, 100)];
        let (first_out, first_meta) = merge_assemblyai_turn_words(&mut progress, 0, first);
        assert_eq!(first_out.len(), 1);
        assert!(!first_meta.is_old_turn);

        let second = vec![word("hello", 0, 100), word("world", 100, 220)];
        let (second_out, second_meta) = merge_assemblyai_turn_words(&mut progress, 0, second);
        assert_eq!(second_out.len(), 1);
        assert_eq!(second_out[0].text, "world");
        assert_eq!(second_meta.prefix_len, 1);
        assert!(!second_meta.had_divergence);

        let third = vec![word("hello", 0, 100), word("world", 100, 220)];
        let (third_out, third_meta) = merge_assemblyai_turn_words(&mut progress, 0, third);
        assert!(third_out.is_empty());
        assert_eq!(third_meta.prefix_len, 2);
    }

    #[test]
    fn merge_same_turn_divergence_advances_without_duplication() {
        let mut progress = AssemblyAITurnProgress::default();

        let initial = vec![word("we", 0, 80), word("need", 80, 160)];
        let (initial_out, _) = merge_assemblyai_turn_words(&mut progress, 0, initial);
        assert_eq!(initial_out.len(), 2);

        let rewritten = vec![
            word("we", 0, 80),
            word("really", 80, 190),
            word("need", 190, 270),
        ];
        let (rewritten_out, rewritten_meta) =
            merge_assemblyai_turn_words(&mut progress, 0, rewritten);
        assert_eq!(
            rewritten_out
                .iter()
                .map(|w| w.text.as_str())
                .collect::<Vec<_>>(),
            vec!["really", "need"]
        );
        assert!(rewritten_meta.had_divergence);
        assert_eq!(rewritten_meta.prefix_len, 1);

        let extended = vec![
            word("we", 0, 80),
            word("really", 80, 190),
            word("need", 190, 270),
            word("tests", 270, 360),
        ];
        let (extended_out, extended_meta) = merge_assemblyai_turn_words(&mut progress, 0, extended);
        assert_eq!(extended_out.len(), 1);
        assert_eq!(extended_out[0].text, "tests");
        assert_eq!(extended_meta.prefix_len, 3);
    }

    #[test]
    fn merge_old_turn_streak_resets_and_recovers_stream() {
        let mut progress = AssemblyAITurnProgress::default();

        let baseline = vec![word("status", 0, 90)];
        let (_, _) = merge_assemblyai_turn_words(&mut progress, 10, baseline);
        assert_eq!(progress.turn_order, 10);

        let reset_words = vec![word("new", 0, 70), word("turn", 70, 140)];

        // First two old-turn chunks are ignored as possible stragglers.
        let (first_old, first_meta) =
            merge_assemblyai_turn_words(&mut progress, 0, reset_words.clone());
        assert!(first_old.is_empty());
        assert!(first_meta.is_old_turn);

        let (second_old, second_meta) =
            merge_assemblyai_turn_words(&mut progress, 0, reset_words.clone());
        assert!(second_old.is_empty());
        assert!(second_meta.is_old_turn);

        // Third repeated old-turn chunk is treated as stream reset and emitted.
        let (recovered, recovered_meta) =
            merge_assemblyai_turn_words(&mut progress, 0, reset_words);
        assert_eq!(recovered.len(), 2);
        assert!(recovered_meta.is_new_turn);
        assert_eq!(progress.turn_order, 0);
    }
}

/// Turn tracking for AssemblyAI streaming - tracks (session_id, channel, provider session) -> turn progress.
/// This prevents cumulative duplication and is resilient to non-linear incremental updates.
static ASSEMBLYAI_TURN_STATE: once_cell::sync::Lazy<
    std::sync::Arc<tokio::sync::Mutex<std::collections::HashMap<String, AssemblyAITurnProgress>>>,
> = once_cell::sync::Lazy::new(|| {
    std::sync::Arc::new(tokio::sync::Mutex::new(std::collections::HashMap::new()))
});

async fn update_session<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    session_id: impl Into<String>,
    words: Vec<typr_listener_interface::Word>,
) -> Result<Vec<typr_listener_interface::Word>, crate::Error> {
    use tauri_plugin_db::DatabasePluginExt;

    let session_id = session_id.into();

    // TODO: not ideal. We might want to only do "update" everywhere instead of upserts.
    // We do this because it is highly likely that the session fetched in the listener is stale (session can be updated on the React side).
    let mut session = app
        .db_get_session(&session_id)
        .await?
        .ok_or(crate::Error::NoneSession)?;

    // Standard behavior: append new words to session
    session.words.extend(words);
    app.db_upsert_session(session.clone()).await.unwrap();

    Ok(session.words)
}

pub enum StateEvent {
    Start(String),
    Stop,
    Pause,
    Resume,
    ReconnectStream,
    MicMuted(bool),
    SpeakerMuted(bool),
    MicSelectionModeChanged(MicSelectionMode),
    MicChange(Option<String>),
}

#[state_machine(
    initial = "State::inactive()",
    on_transition = "Self::on_transition",
    state(derive(Debug, Clone, PartialEq))
)]
impl Session {
    #[superstate]
    async fn common(&mut self, event: &StateEvent) -> Response<State> {
        match event {
            StateEvent::MicMuted(muted) => {
                if let Some(tx) = &self.mic_muted_tx {
                    let _ = tx.send(*muted);
                    let _ = SessionEvent::MicMuted { value: *muted }.emit(&self.app);
                }
                self.update_pipeline_inputs().await;
                Handled
            }
            StateEvent::SpeakerMuted(muted) => {
                if let Some(tx) = &self.speaker_muted_tx {
                    let _ = tx.send(*muted);
                    let _ = SessionEvent::SpeakerMuted { value: *muted }.emit(&self.app);
                }
                self.update_pipeline_inputs().await;
                Handled
            }
            StateEvent::MicSelectionModeChanged(mode) => {
                self.mic_selection_mode = *mode;
                Handled
            }
            StateEvent::ReconnectStream => {
                let status = self.pipeline_status().await;
                if status.reconnect_attempt.is_none() {
                    self.set_pipeline_phase(
                        PipelineStatusPhase::Reconnecting,
                        Some("stream_disconnected".to_string()),
                        None,
                        None,
                    )
                    .await;
                }
                self.recover_active_stream("stream_disconnected").await;
                Handled
            }
            StateEvent::MicChange(device_name) => {
                let old_device = self.mic_device_name.clone();

                if old_device == *device_name {
                    return Handled;
                }

                self.mic_device_name = device_name.clone();

                if self.session_id.is_some() && self.tasks.is_some() {
                    tracing::info!(
                        "[DEVICE_CHANGE] Audio device changed: {:?} → {:?}",
                        old_device,
                        device_name
                    );
                    self.set_pipeline_phase(
                        PipelineStatusPhase::Reconnecting,
                        Some("device_change".to_string()),
                        None,
                        None,
                    )
                    .await;
                    self.recover_active_stream("device_change").await;
                }

                Handled
            }
            _ => Super,
        }
    }

    #[state(superstate = "common", entry_action = "enter_running_active")]
    async fn running_active(&mut self, event: &StateEvent) -> Response<State> {
        match event {
            StateEvent::Start(incoming_session_id) => match &self.session_id {
                Some(current_id) if current_id != incoming_session_id => {
                    Transition(State::inactive())
                }
                _ => Handled,
            },
            StateEvent::Stop => Transition(State::inactive()),
            StateEvent::Pause => {
                // Inject silence before pause to flush VAD buffer
                self.inject_silence_for_flush().await;
                self.set_pipeline_phase(PipelineStatusPhase::Paused, None, None, None)
                    .await;
                Transition(State::running_paused())
            }
            StateEvent::Resume => Handled,
            _ => Super,
        }
    }

    #[state(superstate = "common")]
    async fn running_paused(&mut self, event: &StateEvent) -> Response<State> {
        match event {
            StateEvent::Start(incoming_session_id) => match &self.session_id {
                Some(current_id) if current_id != incoming_session_id => {
                    Transition(State::inactive())
                }
                _ => Handled,
            },
            StateEvent::Stop => Transition(State::inactive()),
            StateEvent::Pause => Handled,
            StateEvent::Resume => {
                self.set_pipeline_phase(PipelineStatusPhase::Active, None, None, None)
                    .await;
                Transition(State::running_active())
            }
            _ => Super,
        }
    }

    #[state(
        superstate = "common",
        entry_action = "enter_inactive",
        exit_action = "exit_inactive"
    )]
    async fn inactive(&mut self, event: &StateEvent) -> Response<State> {
        match event {
            StateEvent::Start(id) => {
                self.session_id = Some(id.clone());
                self.set_pipeline_phase(PipelineStatusPhase::Starting, None, None, None)
                    .await;

                match self.setup_resources(id).await {
                    Ok(_) => Transition(State::running_active()),
                    Err(e) => {
                        tracing::error!("error: {:?}", e);
                        self.set_pipeline_phase(
                            PipelineStatusPhase::Failed,
                            Some("start_failed".to_string()),
                            None,
                            None,
                        )
                        .await;
                        Transition(State::inactive())
                    }
                }
            }
            StateEvent::Stop => Handled,
            StateEvent::Pause => Handled,
            StateEvent::Resume => Handled,
            _ => Super,
        }
    }

    #[action]
    async fn enter_inactive(&mut self) {
        self.set_pipeline_phase(PipelineStatusPhase::Inactive, None, None, None)
            .await;

        {
            use tauri_plugin_tray::TrayPluginExt;
            let _ = self.app.set_start_disabled(false);
        }

        {
            use tauri_plugin_windows::{TyprWindow, WindowsPluginExt};
            let _ = self.app.window_hide(TyprWindow::Control);
            let _ = self.app.window_hide(TyprWindow::TranscriptionStatus);
        }

        // Trigger async diarization BEFORE teardown to ensure file save task completes
        if let Some(session_id) = &self.session_id {
            use tauri_plugin_db::DatabasePluginExt;

            if let Ok(Some(mut session)) = self.app.db_get_session(session_id).await {
                session.record_end = Some(chrono::Utc::now());
                let _ = self.app.db_upsert_session(session).await;
            }

            tracing::info!("[SESSION_END] Using dual stream mode - no async diarization needed");
        }

        // Teardown immediately - no async diarization with dual stream mode
        self.teardown_resources(true).await;
    }

    #[action]
    async fn exit_inactive(&mut self) {
        use tauri_plugin_tray::TrayPluginExt;
        let _ = self.app.set_start_disabled(true);
    }

    #[action]
    async fn enter_running_active(&mut self) {
        // {
        //     use tauri_plugin_windows::{TyprWindow, WindowsPluginExt};
        //     let _ = self.app.window_show(TyprWindow::Control);
        // }

        if let Some(session_id) = &self.session_id {
            use tauri_plugin_db::DatabasePluginExt;

            if let Ok(Some(mut session)) = self.app.db_get_session(session_id).await {
                if session.record_start.is_none() {
                    session.record_start = Some(chrono::Utc::now());
                }
                let _ = self.app.db_upsert_session(session).await;
            }
        }
    }

    fn on_transition(&mut self, source: &State, target: &State) {
        #[cfg(debug_assertions)]
        tracing::info!("transitioned from `{:?}` to `{:?}`", source, target);

        // Update global audio pause state to suppress logs during expected pause behavior
        match target {
            State::RunningActive {} => {
                typr_audio::set_global_pause_state(false);
                SessionEvent::RunningActive {}.emit(&self.app).unwrap();
            }
            State::RunningPaused {} => {
                typr_audio::set_global_pause_state(true);
                SessionEvent::RunningPaused {}.emit(&self.app).unwrap();
            }
            State::Inactive {} => {
                typr_audio::set_global_pause_state(false);
                SessionEvent::Inactive {}.emit(&self.app).unwrap();
            }
        }

        if let Some(tx) = &self.session_state_tx {
            let _ = tx.send(target.clone());
        }
    }
}

impl serde::Serialize for State {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        match self {
            State::Inactive {} => serializer.serialize_str("inactive"),
            State::RunningActive {} => serializer.serialize_str("running_active"),
            State::RunningPaused {} => serializer.serialize_str("running_paused"),
        }
    }
}

impl specta::Type for State {
    fn inline(
        _type_map: &mut specta::TypeCollection,
        _generics: specta::Generics,
    ) -> specta::DataType {
        specta::datatype::PrimitiveType::String.into()
    }
}
