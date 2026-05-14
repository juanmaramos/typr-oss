use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::OnceLock;
use std::task::Poll;

use anyhow::Result;
use futures_util::Stream;

#[path = "macos_coreaudio.rs"]
mod coreaudio;

// ScreenCaptureKit only available on Apple Silicon
// Intel Macs always use CoreAudio due to cross-compilation issues
#[cfg(target_arch = "aarch64")]
#[path = "macos_sck.rs"]
mod sck;

// ---------------------------------------------------------------------------
// Global pause state — used by the CoreAudio provider to suppress log noise
// ---------------------------------------------------------------------------
static GLOBAL_PAUSE_STATE: OnceLock<AtomicBool> = OnceLock::new();

fn is_globally_paused() -> bool {
    GLOBAL_PAUSE_STATE
        .get_or_init(|| AtomicBool::new(false))
        .load(Ordering::Relaxed)
}

pub fn set_global_pause_state(paused: bool) {
    GLOBAL_PAUSE_STATE
        .get_or_init(|| AtomicBool::new(false))
        .store(paused, Ordering::Relaxed);
}

// ---------------------------------------------------------------------------
// Provider override via environment variable
// TYPR_SPEAKER_PROVIDER=auto|sck|coreaudio
// ---------------------------------------------------------------------------
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ProviderPreference {
    Auto,
    Sck,
    CoreAudio,
}

fn provider_preference() -> ProviderPreference {
    match std::env::var("TYPR_SPEAKER_PROVIDER")
        .unwrap_or_default()
        .to_lowercase()
        .as_str()
    {
        "sck" | "screencapturekit" => ProviderPreference::Sck,
        "coreaudio" | "core_audio" | "ca" => ProviderPreference::CoreAudio,
        _ => ProviderPreference::Auto,
    }
}

// ---------------------------------------------------------------------------
// Public types — wrapping the selected provider
// ---------------------------------------------------------------------------
pub struct SpeakerInput {
    inner: SpeakerInputInner,
}

enum SpeakerInputInner {
    #[cfg(target_arch = "aarch64")]
    Sck(sck::SckSpeakerInput),
    CoreAudio(coreaudio::CoreAudioSpeakerInput),
}

pub struct SpeakerStream {
    inner: SpeakerStreamInner,
}

enum SpeakerStreamInner {
    #[cfg(target_arch = "aarch64")]
    Sck(sck::SckSpeakerStream),
    CoreAudio(coreaudio::CoreAudioSpeakerStream),
}

impl SpeakerInput {
    pub fn new(sample_rate_override: Option<u32>) -> Result<Self> {
        let pref = provider_preference();
        tracing::info!(
            preference = ?pref,
            "[SPEAKER_PROVIDER] Initializing speaker input"
        );

        // On Intel Macs (x86_64), SCK is not available due to cross-compilation issues
        // Always use CoreAudio fallback
        #[cfg(not(target_arch = "aarch64"))]
        {
            if matches!(pref, ProviderPreference::Sck) {
                tracing::warn!(
                    "[SPEAKER_PROVIDER] ScreenCaptureKit requested but not available on Intel Macs. \
                     Using CoreAudio process tap instead."
                );
            }
            let input = coreaudio::CoreAudioSpeakerInput::new(sample_rate_override)?;
            tracing::info!("[SPEAKER_PROVIDER] Selected: CoreAudio process tap (Intel Mac)");
            return Ok(Self {
                inner: SpeakerInputInner::CoreAudio(input),
            });
        }

        // On Apple Silicon (aarch64), try SCK first with CoreAudio fallback
        #[cfg(target_arch = "aarch64")]
        match pref {
            ProviderPreference::Sck => {
                // Forced SCK — fail loudly if unavailable
                let input = sck::SckSpeakerInput::new(sample_rate_override)?;
                tracing::info!("[SPEAKER_PROVIDER] Selected: ScreenCaptureKit (forced)");
                Ok(Self {
                    inner: SpeakerInputInner::Sck(input),
                })
            }
            ProviderPreference::CoreAudio => {
                // Forced CoreAudio — fail loudly if unavailable
                let input = coreaudio::CoreAudioSpeakerInput::new(sample_rate_override)?;
                tracing::info!("[SPEAKER_PROVIDER] Selected: CoreAudio process tap (forced)");
                Ok(Self {
                    inner: SpeakerInputInner::CoreAudio(input),
                })
            }
            ProviderPreference::Auto => {
                // Try SCK first, fall back to CoreAudio
                match sck::SckSpeakerInput::new(sample_rate_override) {
                    Ok(input) => {
                        tracing::info!("[SPEAKER_PROVIDER] Selected: ScreenCaptureKit");
                        Ok(Self {
                            inner: SpeakerInputInner::Sck(input),
                        })
                    }
                    Err(sck_err) => {
                        tracing::warn!(
                            error = %sck_err,
                            "[SPEAKER_PROVIDER] SCK unavailable, falling back to CoreAudio process tap. \
                             Others' voice transcription may not work with Bluetooth audio devices. \
                             Grant Screen/System Audio Recording permission to fix this."
                        );
                        let input = coreaudio::CoreAudioSpeakerInput::new(sample_rate_override)?;
                        tracing::info!(
                            "[SPEAKER_PROVIDER] Selected: CoreAudio process tap (fallback)"
                        );
                        Ok(Self {
                            inner: SpeakerInputInner::CoreAudio(input),
                        })
                    }
                }
            }
        }
    }

    pub fn stream(self) -> SpeakerStream {
        match self.inner {
            #[cfg(target_arch = "aarch64")]
            SpeakerInputInner::Sck(input) => {
                match input.stream() {
                    Ok((stream, first_buffer_flag)) => {
                        // Wait briefly for the first audio buffer to confirm capture is working
                        let deadline =
                            std::time::Instant::now() + std::time::Duration::from_secs(3);
                        while std::time::Instant::now() < deadline {
                            if first_buffer_flag.load(Ordering::Acquire) {
                                tracing::info!(
                                    "[SPEAKER_PROVIDER] SCK capture confirmed: first audio buffer received"
                                );
                                return SpeakerStream {
                                    inner: SpeakerStreamInner::Sck(stream),
                                };
                            }
                            std::thread::sleep(std::time::Duration::from_millis(50));
                        }

                        // Timed out but capture started — still use SCK, just warn
                        tracing::warn!(
                            "[SPEAKER_PROVIDER] SCK capture started but no audio buffer received within 3s. \
                             Continuing with SCK — audio may arrive later."
                        );
                        SpeakerStream {
                            inner: SpeakerStreamInner::Sck(stream),
                        }
                    }
                    Err(e) => {
                        tracing::error!(
                            error = %e,
                            "[SPEAKER_PROVIDER] SCK start_capture failed, falling back to CoreAudio. \
                             Others' voice unavailable: Screen/System Audio permission required."
                        );
                        // Fall back to CoreAudio
                        let ca_input = coreaudio::CoreAudioSpeakerInput::new(None)
                            .expect("CoreAudio fallback must succeed");
                        let ca_stream = ca_input.stream();
                        SpeakerStream {
                            inner: SpeakerStreamInner::CoreAudio(ca_stream),
                        }
                    }
                }
            }
            SpeakerInputInner::CoreAudio(input) => SpeakerStream {
                inner: SpeakerStreamInner::CoreAudio(input.stream()),
            },
        }
    }
}

impl SpeakerStream {
    pub fn sample_rate(&self) -> u32 {
        match &self.inner {
            #[cfg(target_arch = "aarch64")]
            SpeakerStreamInner::Sck(s) => s.sample_rate(),
            SpeakerStreamInner::CoreAudio(s) => s.sample_rate(),
        }
    }
}

impl Stream for SpeakerStream {
    type Item = f32;

    fn poll_next(
        mut self: std::pin::Pin<&mut Self>,
        cx: &mut std::task::Context<'_>,
    ) -> Poll<Option<Self::Item>> {
        match &mut self.inner {
            #[cfg(target_arch = "aarch64")]
            SpeakerStreamInner::Sck(s) => std::pin::Pin::new(s).poll_next(cx),
            SpeakerStreamInner::CoreAudio(s) => std::pin::Pin::new(s).poll_next(cx),
        }
    }
}
