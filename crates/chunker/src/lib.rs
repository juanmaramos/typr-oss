use std::{
    pin::Pin,
    task::{Context, Poll},
    time::{Duration, Instant},
};

use futures_util::Stream;
use kalosm_sound::AsyncSource;

use silero_rs::{VadConfig, VadSession, VadTransition};

mod error;
use error::*;

pub struct ChunkStream<S: AsyncSource> {
    source: S,
    chunk_samples: usize,
    buffer: Vec<f32>,
}

impl<S: AsyncSource> ChunkStream<S> {
    fn new(source: S, chunk_duration: Duration) -> Self {
        let sample_rate = source.sample_rate();
        let chunk_samples = (chunk_duration.as_secs_f64() * sample_rate as f64) as usize;

        Self {
            source,
            chunk_samples,
            buffer: Vec::with_capacity(chunk_samples),
        }
    }
}

impl<S: AsyncSource + Unpin> Stream for ChunkStream<S> {
    type Item = Vec<f32>;

    fn poll_next(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        let this = self.get_mut();
        let stream = this.source.as_stream();
        let mut stream = std::pin::pin!(stream);

        while this.buffer.len() < this.chunk_samples {
            match stream.as_mut().poll_next(cx) {
                Poll::Pending => {
                    return Poll::Pending;
                }
                Poll::Ready(Some(sample)) => {
                    this.buffer.push(sample);
                }
                Poll::Ready(None) => {
                    if this.buffer.is_empty() {
                        return Poll::Ready(None);
                    } else {
                        let chunk = std::mem::take(&mut this.buffer);
                        return Poll::Ready(Some(chunk));
                    }
                }
            }
        }

        let mut chunk = Vec::with_capacity(this.chunk_samples);
        chunk.extend(this.buffer.drain(..this.chunk_samples));
        Poll::Ready(Some(chunk))
    }
}

pub trait VadExt: AsyncSource + Sized {
    fn vad_chunks(self, redemption_time: Duration) -> VadChunkStream<Self>
    where
        Self: Unpin,
    {
        let config = VadConfig {
            redemption_time,
            pre_speech_pad: redemption_time,
            post_speech_pad: Duration::from_millis(0),
            min_speech_time: Duration::from_millis(50),
            ..Default::default()
        };

        VadChunkStream::new(self, config).unwrap()
    }

    /// Creates a VAD chunk stream with periodic soft flushes during continuous speech.
    ///
    /// - `redemption_time`: How long silence must last before VAD triggers SpeechEnd
    /// - `max_speech_duration`: Maximum time before emitting a soft flush (preview)
    ///
    /// Soft flushes emit `is_partial: true` chunks every `max_speech_duration` during speech.
    /// Final flushes emit `is_partial: false` chunks on VAD SpeechEnd.
    fn vad_chunks_with_max_duration(
        self,
        redemption_time: Duration,
        max_speech_duration: Duration,
    ) -> VadChunkStreamWithSoftFlush<Self>
    where
        Self: Unpin,
    {
        let config = VadConfig {
            redemption_time,
            pre_speech_pad: redemption_time,
            post_speech_pad: Duration::from_millis(0),
            min_speech_time: Duration::from_millis(50),
            ..Default::default()
        };

        VadChunkStreamWithSoftFlush::new(self, config, max_speech_duration).unwrap()
    }
}

impl<T: AsyncSource> VadExt for T {}

pub struct VadChunkStream<S: AsyncSource> {
    chunk_stream: ChunkStream<S>,
    vad_session: VadSession,
    pending_chunks: Vec<AudioChunk>,
}

impl<S: AsyncSource> VadChunkStream<S> {
    fn new(source: S, mut config: VadConfig) -> Result<Self, Error> {
        config.sample_rate = source.sample_rate() as usize;

        // https://github.com/emotechlab/silero-rs/blob/26a6460/src/lib.rs#L775
        let chunk_duration = Duration::from_millis(30);

        Ok(Self {
            chunk_stream: ChunkStream::new(source, chunk_duration),
            vad_session: VadSession::new(config).map_err(|_| Error::VadSessionCreationFailed)?,
            pending_chunks: Vec::new(),
        })
    }
}

#[derive(Debug, Clone)]
pub struct AudioChunk {
    pub samples: Vec<f32>,
    /// true = soft flush (preview, may change), false = final (VAD SpeechEnd)
    pub is_partial: bool,
}

impl<S: AsyncSource + Unpin> Stream for VadChunkStream<S> {
    type Item = Result<AudioChunk, Error>;

    fn poll_next(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        let this = self.get_mut();

        if let Some(chunk) = this.pending_chunks.pop() {
            return Poll::Ready(Some(Ok(chunk)));
        }

        let mut processed_count = 0;
        loop {
            match Pin::new(&mut this.chunk_stream).poll_next(cx) {
                Poll::Ready(Some(samples)) => {
                    processed_count += 1;

                    // Log every 1000 chunks to show VAD is alive
                    if processed_count % 1000 == 0 {
                        tracing::debug!(
                            "[VAD_PROCESSING] Processed {} audio chunks",
                            processed_count
                        );
                    }

                    match this.vad_session.process(&samples) {
                        Ok(transitions) => {
                            for transition in transitions {
                                if let VadTransition::SpeechEnd { samples, .. } = transition {
                                    tracing::info!("[VAD_CHUNK] SpeechEnd detected after {} chunks, samples={} duration_ms={:.1}", processed_count, samples.len(), samples.len() as f32 / 16.0);
                                    this.pending_chunks.push(AudioChunk {
                                        samples,
                                        is_partial: false,
                                    });
                                }
                            }

                            if let Some(chunk) = this.pending_chunks.pop() {
                                return Poll::Ready(Some(Ok(chunk)));
                            }
                        }
                        Err(e) => {
                            tracing::error!(
                                "[VAD_ERROR] Processing failed after {} chunks: {}",
                                processed_count,
                                e
                            );
                            let error = Error::VadProcessingFailed(e.to_string());
                            return Poll::Ready(Some(Err(error)));
                        }
                    }
                }
                Poll::Ready(None) => {
                    tracing::warn!(
                        "[VAD_STREAM_END] Audio chunk stream ended after {} chunks",
                        processed_count
                    );
                    return Poll::Ready(None);
                }
                Poll::Pending => return Poll::Pending,
            }
        }
    }
}

/// VAD chunk stream with periodic soft flushes for real-time preview during continuous speech.
///
/// This stream emits two types of chunks:
/// - Soft flush (`is_partial: true`): Emitted every `max_speech_duration` during speech.
///   These are previews that may change - the buffer is NOT cleared.
/// - Final flush (`is_partial: false`): Emitted on VAD SpeechEnd (natural pause).
///   These are committed - the buffer IS cleared.
/// - Force commit: If buffer exceeds `FORCE_COMMIT_DURATION` (10s), emit as final to prevent bloat.
pub struct VadChunkStreamWithSoftFlush<S: AsyncSource> {
    chunk_stream: ChunkStream<S>,
    vad_session: VadSession,
    pending_chunks: Vec<AudioChunk>,
    /// Maximum duration before emitting a soft flush
    max_speech_duration: Duration,
    /// When speech started (for soft flush timing)
    speech_start_time: Option<Instant>,
    /// Accumulated samples during current speech segment (for soft flush)
    accumulated_samples: Vec<f32>,
    /// Whether we're currently in a speech segment
    in_speech: bool,
    /// Sample rate for duration calculations
    sample_rate: u32,
}

/// Force commit threshold: If buffer exceeds this duration, force a final flush.
/// This prevents buffer bloat during continuous speech (e.g., speaker channel).
/// 30s gives VAD more time to detect natural pauses while still preventing runaway buffers.
/// Note: Whisper works better with longer context, so prefer VAD SpeechEnd over force-commit.
const FORCE_COMMIT_DURATION: Duration = Duration::from_secs(30);

impl<S: AsyncSource> VadChunkStreamWithSoftFlush<S> {
    fn new(source: S, mut config: VadConfig, max_speech_duration: Duration) -> Result<Self, Error> {
        let sample_rate = source.sample_rate();
        config.sample_rate = sample_rate as usize;

        // https://github.com/emotechlab/silero-rs/blob/26a6460/src/lib.rs#L775
        let chunk_duration = Duration::from_millis(30);

        Ok(Self {
            chunk_stream: ChunkStream::new(source, chunk_duration),
            vad_session: VadSession::new(config).map_err(|_| Error::VadSessionCreationFailed)?,
            pending_chunks: Vec::new(),
            max_speech_duration,
            speech_start_time: None,
            accumulated_samples: Vec::new(),
            in_speech: false,
            sample_rate,
        })
    }
}

impl<S: AsyncSource + Unpin> Stream for VadChunkStreamWithSoftFlush<S> {
    type Item = Result<AudioChunk, Error>;

    fn poll_next(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        let this = self.get_mut();

        // Return any pending chunks first
        if let Some(chunk) = this.pending_chunks.pop() {
            return Poll::Ready(Some(Ok(chunk)));
        }

        let mut processed_count = 0;
        loop {
            match Pin::new(&mut this.chunk_stream).poll_next(cx) {
                Poll::Ready(Some(samples)) => {
                    processed_count += 1;

                    // Log every 1000 chunks to show VAD is alive
                    if processed_count % 1000 == 0 {
                        tracing::debug!(
                            "[VAD_SOFT_FLUSH] Processed {} audio chunks, in_speech={}",
                            processed_count,
                            this.in_speech
                        );
                    }

                    match this.vad_session.process(&samples) {
                        Ok(transitions) => {
                            for transition in transitions {
                                match transition {
                                    VadTransition::SpeechStart { .. } => {
                                        // Speech started - begin tracking
                                        this.in_speech = true;
                                        this.speech_start_time = Some(Instant::now());
                                        this.accumulated_samples.clear();
                                        tracing::info!("[VAD_SOFT_FLUSH] SpeechStart detected");
                                    }
                                    VadTransition::SpeechEnd { samples, .. } => {
                                        // Natural pause - emit final chunk
                                        let duration_ms = samples.len() as f32
                                            / (this.sample_rate as f32 / 1000.0);
                                        tracing::info!(
                                            "[VAD_SOFT_FLUSH] SpeechEnd (FINAL) after {} chunks, samples={} duration_ms={:.1}",
                                            processed_count,
                                            samples.len(),
                                            duration_ms
                                        );

                                        this.pending_chunks.push(AudioChunk {
                                            samples,
                                            is_partial: false, // Final - will be committed
                                        });

                                        // Reset state
                                        this.in_speech = false;
                                        this.speech_start_time = None;
                                        this.accumulated_samples.clear();
                                    }
                                }
                            }

                            // If in speech, accumulate samples and check for flush
                            if this.in_speech {
                                this.accumulated_samples.extend_from_slice(&samples);

                                // Check buffer duration for force-commit
                                let buffer_duration_ms = this.accumulated_samples.len() as f32
                                    / (this.sample_rate as f32 / 1000.0);
                                let buffer_duration =
                                    Duration::from_millis(buffer_duration_ms as u64);

                                // Check if we should emit a flush
                                if let Some(start_time) = this.speech_start_time {
                                    let elapsed = start_time.elapsed();

                                    // FORCE COMMIT: If buffer exceeds 10s, emit as final to prevent bloat
                                    // This is critical for speaker channel which may never get VAD SpeechEnd
                                    if buffer_duration >= FORCE_COMMIT_DURATION
                                        && !this.accumulated_samples.is_empty()
                                    {
                                        tracing::info!(
                                            "[VAD_SOFT_FLUSH] Force commit (FINAL) at {:.1}s buffer, samples={} duration_ms={:.1}",
                                            buffer_duration.as_secs_f32(),
                                            this.accumulated_samples.len(),
                                            buffer_duration_ms
                                        );

                                        // Emit as FINAL (commit) and clear buffer
                                        let samples = std::mem::take(&mut this.accumulated_samples);
                                        this.pending_chunks.push(AudioChunk {
                                            samples,
                                            is_partial: false, // Final - will be committed
                                        });

                                        // Reset timer, keep in_speech (still speaking)
                                        this.speech_start_time = Some(Instant::now());
                                    }
                                    // SOFT FLUSH: If elapsed > max_speech_duration, emit preview
                                    else if elapsed >= this.max_speech_duration
                                        && !this.accumulated_samples.is_empty()
                                    {
                                        tracing::info!(
                                            "[VAD_SOFT_FLUSH] Soft flush (PREVIEW) at {:.1}s, samples={} duration_ms={:.1}",
                                            elapsed.as_secs_f32(),
                                            this.accumulated_samples.len(),
                                            buffer_duration_ms
                                        );

                                        // Emit preview chunk (clone buffer, don't clear)
                                        this.pending_chunks.push(AudioChunk {
                                            samples: this.accumulated_samples.clone(),
                                            is_partial: true, // Preview - may change
                                        });

                                        // Reset timer but keep accumulating
                                        this.speech_start_time = Some(Instant::now());
                                    }
                                }
                            }

                            if let Some(chunk) = this.pending_chunks.pop() {
                                return Poll::Ready(Some(Ok(chunk)));
                            }
                        }
                        Err(e) => {
                            tracing::error!(
                                "[VAD_SOFT_FLUSH_ERROR] Processing failed after {} chunks: {}",
                                processed_count,
                                e
                            );
                            let error = Error::VadProcessingFailed(e.to_string());
                            return Poll::Ready(Some(Err(error)));
                        }
                    }
                }
                Poll::Ready(None) => {
                    // Stream ended - emit any remaining accumulated samples as final
                    if !this.accumulated_samples.is_empty() {
                        let samples = std::mem::take(&mut this.accumulated_samples);
                        tracing::info!(
                            "[VAD_SOFT_FLUSH] Stream ended, emitting remaining {} samples as final",
                            samples.len()
                        );
                        this.pending_chunks.push(AudioChunk {
                            samples,
                            is_partial: false,
                        });

                        if let Some(chunk) = this.pending_chunks.pop() {
                            return Poll::Ready(Some(Ok(chunk)));
                        }
                    }

                    tracing::warn!(
                        "[VAD_SOFT_FLUSH_STREAM_END] Audio chunk stream ended after {} chunks",
                        processed_count
                    );
                    return Poll::Ready(None);
                }
                Poll::Pending => return Poll::Pending,
            }
        }
    }
}
