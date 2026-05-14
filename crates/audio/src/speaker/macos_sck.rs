use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::task::{Poll, Waker};

use anyhow::{Context, Result};
use futures_util::Stream;
use ringbuf::{
    traits::{Consumer, Producer, Split},
    HeapCons, HeapProd, HeapRb,
};
use screencapturekit::prelude::*;
use screencapturekit::stream::configuration::audio::{AudioChannelCount, AudioSampleRate};

const SCK_SAMPLE_RATE: u32 = 48000;

// CoreGraphics permission APIs (available since macOS 10.15)
extern "C" {
    fn CGPreflightScreenCaptureAccess() -> bool;
    fn CGRequestScreenCaptureAccess() -> bool;
}

struct WakerState {
    waker: Option<Waker>,
    has_data: bool,
}

struct AudioHandler {
    producer: Arc<Mutex<HeapProd<f32>>>,
    waker_state: Arc<Mutex<WakerState>>,
    callback_count: AtomicU64,
    first_buffer_received: Arc<std::sync::atomic::AtomicBool>,
}

impl SCStreamOutputTrait for AudioHandler {
    fn did_output_sample_buffer(&self, sample: CMSampleBuffer, output_type: SCStreamOutputType) {
        if !matches!(output_type, SCStreamOutputType::Audio) {
            return;
        }

        self.first_buffer_received.store(true, Ordering::Release);

        // Extract audio buffer list from the sample buffer
        let audio_buffers = match sample.audio_buffer_list() {
            Some(buffers) => buffers,
            None => {
                tracing::warn!("[SPEAKER_CAPTURE] SCK: no audio buffer list in sample");
                return;
            }
        };

        let mut total_pushed = 0usize;
        let mut total_samples = 0usize;

        for buffer in audio_buffers.iter() {
            let raw_data = buffer.data();
            if raw_data.is_empty() {
                continue;
            }

            // SCK is configured for f32 PCM at our requested sample rate.
            // Interpret the raw bytes as f32 samples.
            let byte_len = raw_data.len();
            if byte_len % std::mem::size_of::<f32>() != 0 {
                tracing::warn!(
                    "[SPEAKER_CAPTURE] SCK: buffer byte length {} not aligned to f32",
                    byte_len
                );
                continue;
            }

            let sample_count = byte_len / std::mem::size_of::<f32>();
            // SAFETY: The data pointer from SCK audio buffer is valid for the
            // reported byte length and aligned (Core Audio guarantees alignment).
            let f32_samples: &[f32] = unsafe {
                std::slice::from_raw_parts(raw_data.as_ptr() as *const f32, sample_count)
            };

            let channels = buffer.number_channels as usize;

            let mut producer = self.producer.lock().unwrap();

            if channels <= 1 {
                // Already mono — push directly
                let pushed = producer.push_slice(f32_samples);
                total_pushed += pushed;
                total_samples += sample_count;
            } else {
                // Multi-channel: downmix to mono by averaging channels
                let frames = sample_count / channels;
                for frame in 0..frames {
                    let mut sum = 0.0f32;
                    for ch in 0..channels {
                        let idx = frame * channels + ch;
                        if idx < f32_samples.len() {
                            sum += f32_samples[idx];
                        }
                    }
                    let mono = sum / channels as f32;
                    if producer.try_push(mono).is_ok() {
                        total_pushed += 1;
                    }
                }
                total_samples += frames;
            }
        }

        // Periodic RMS logging
        let count = self.callback_count.fetch_add(1, Ordering::Relaxed);
        if count == 100 || count % 1000 == 0 {
            // Compute RMS over last pushed samples (approximate via producer state)
            tracing::info!(
                "[SPEAKER_CAPTURE] SCK count={} pushed={} total_samples={}",
                count,
                total_pushed,
                total_samples
            );
        }

        if total_pushed > 0 {
            let mut waker_state = self.waker_state.lock().unwrap();
            if !waker_state.has_data {
                waker_state.has_data = true;
                if let Some(waker) = waker_state.waker.take() {
                    drop(waker_state);
                    waker.wake();
                }
            }
        }
    }
}

pub struct SckSpeakerInput {
    // SCK always captures at SCK_SAMPLE_RATE (48 kHz); the override is accepted
    // for API parity with CoreAudioSpeakerInput but not applied.
    _sample_rate_override: Option<u32>,
}

pub struct SckSpeakerStream {
    consumer: HeapCons<f32>,
    waker_state: Arc<Mutex<WakerState>>,
    // Keep the stream alive; capture stops when this drops
    _stream: SCStream,
}

impl SckSpeakerInput {
    /// Create a new SCK speaker input. This validates that ScreenCaptureKit
    /// is available and permissions are granted by querying shareable content.
    pub fn new(sample_rate_override: Option<u32>) -> Result<Self> {
        // Check Screen Recording permission using CoreGraphics APIs.
        // CGPreflightScreenCaptureAccess() checks without prompting.
        // CGRequestScreenCaptureAccess() triggers the system permission dialog if needed.
        let has_permission = unsafe { CGPreflightScreenCaptureAccess() };
        if !has_permission {
            tracing::info!(
                "[SPEAKER_PROVIDER] Screen Recording permission not yet granted, requesting..."
            );
            let granted = unsafe { CGRequestScreenCaptureAccess() };
            if !granted {
                anyhow::bail!(
                    "Screen Recording permission denied. \
                     Grant permission in System Settings → Privacy & Security → Screen Recording."
                );
            }
        }

        // Verify SCK is functional by querying shareable content
        let _content = SCShareableContent::get()
            .map_err(|e| anyhow::anyhow!("SCK unavailable: {}", e))
            .context("ScreenCaptureKit content query failed")?;

        tracing::info!("[SPEAKER_PROVIDER] SCK permission check passed");

        Ok(Self {
            _sample_rate_override: sample_rate_override,
        })
    }

    /// Start capture and return the stream. The caller should verify that
    /// audio buffers are actually arriving (first_buffer_received flag).
    pub fn stream(self) -> Result<(SckSpeakerStream, Arc<std::sync::atomic::AtomicBool>)> {
        let content = SCShareableContent::get()
            .map_err(|e| anyhow::anyhow!("SCK content query failed: {}", e))?;

        let display = content
            .displays()
            .into_iter()
            .next()
            .ok_or_else(|| anyhow::anyhow!("SCK: no displays found"))?;

        // Content filter on first display — required by SCK even for audio-only
        let filter = SCContentFilter::create()
            .with_display(&display)
            .with_excluding_windows(&[])
            .build();

        // Audio-only configuration: minimum video resolution since we don't need it
        let config = SCStreamConfiguration::new()
            .with_width(2)
            .with_height(2)
            .with_captures_audio(true)
            .with_sample_rate(AudioSampleRate::Rate48000)
            .with_channel_count(AudioChannelCount::Mono);

        let rb = HeapRb::<f32>::new(1024 * 16);
        let (producer, consumer) = rb.split();

        let waker_state = Arc::new(Mutex::new(WakerState {
            waker: None,
            has_data: false,
        }));

        let first_buffer_received = Arc::new(std::sync::atomic::AtomicBool::new(false));

        let handler = AudioHandler {
            producer: Arc::new(Mutex::new(producer)),
            waker_state: waker_state.clone(),
            callback_count: AtomicU64::new(0),
            first_buffer_received: first_buffer_received.clone(),
        };

        let mut stream = SCStream::new(&filter, &config);
        stream.add_output_handler(handler, SCStreamOutputType::Audio);

        stream
            .start_capture()
            .map_err(|e| anyhow::anyhow!("SCK start_capture failed: {}", e))?;

        tracing::info!("[SPEAKER_PROVIDER] SCK capture started successfully");

        Ok((
            SckSpeakerStream {
                consumer,
                waker_state,
                _stream: stream,
            },
            first_buffer_received,
        ))
    }
}

impl SckSpeakerStream {
    pub fn sample_rate(&self) -> u32 {
        SCK_SAMPLE_RATE
    }
}

impl Stream for SckSpeakerStream {
    type Item = f32;

    fn poll_next(
        mut self: std::pin::Pin<&mut Self>,
        cx: &mut std::task::Context<'_>,
    ) -> Poll<Option<Self::Item>> {
        if let Some(sample) = self.consumer.try_pop() {
            return Poll::Ready(Some(sample));
        }

        {
            let mut state = self.waker_state.lock().unwrap();
            state.has_data = false;
            state.waker = Some(cx.waker().clone());
            drop(state);
        }

        match self.consumer.try_pop() {
            Some(sample) => Poll::Ready(Some(sample)),
            None => Poll::Pending,
        }
    }
}
