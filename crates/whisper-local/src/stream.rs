use std::{
    marker::PhantomData,
    pin::Pin,
    sync::atomic::{AtomicU64, Ordering},
    task::{Context, Poll},
};

use dasp::sample::FromSample;
use futures_util::{Stream, StreamExt};
use rodio::Source;

use super::Segment;
#[cfg(feature = "actual")]
use super::Whisper;

/// Global counter for generating unique flush IDs
/// This ensures all segments from a single audio chunk share the same flush_id
static FLUSH_ID_COUNTER: AtomicU64 = AtomicU64::new(0);

#[cfg(feature = "actual")]
pub struct TranscriptionTask<S, T> {
    stream: S,
    whisper: Whisper,
    current_segment_task: Option<Pin<Box<dyn Stream<Item = Segment> + Send>>>,
    _phantom: PhantomData<T>,
}

pub trait AudioChunk: Send + 'static {
    fn samples(&self) -> &[f32];
    fn meta(&self) -> Option<serde_json::Value>;
}

#[derive(Default)]
pub struct SimpleAudioChunk {
    pub samples: Vec<f32>,
    pub meta: Option<serde_json::Value>,
}

impl AudioChunk for SimpleAudioChunk {
    fn samples(&self) -> &[f32] {
        &self.samples
    }

    fn meta(&self) -> Option<serde_json::Value> {
        self.meta.clone()
    }
}

pub struct AudioChunkStream<S>(pub S);

pub struct RodioSourceMarker;
pub struct MetadataAudioChunkMarker;

#[cfg(feature = "actual")]
pub trait TranscribeRodioSourceStreamExt<S>: Sized {
    fn transcribe(self, whisper: Whisper) -> TranscriptionTask<S, RodioSourceMarker>;
}

#[cfg(feature = "actual")]
impl<S> TranscribeRodioSourceStreamExt<S> for S
where
    S: Stream + Unpin + Send + 'static,
    <S as Stream>::Item: Source + Send + 'static,
    <<S as Stream>::Item as Iterator>::Item: rodio::Sample,
    f32: FromSample<<<S as Stream>::Item as Iterator>::Item>,
{
    fn transcribe(self, whisper: Whisper) -> TranscriptionTask<S, RodioSourceMarker> {
        TranscriptionTask {
            stream: self,
            whisper,
            current_segment_task: None,
            _phantom: PhantomData,
        }
    }
}

#[cfg(feature = "actual")]
pub trait TranscribeMetadataAudioStreamExt<S>: Sized {
    fn transcribe(self, whisper: Whisper) -> TranscriptionTask<S, MetadataAudioChunkMarker>;
}

#[cfg(feature = "actual")]
impl<S, C> TranscribeMetadataAudioStreamExt<S> for AudioChunkStream<S>
where
    S: Stream<Item = C> + Unpin + Send + 'static,
    C: AudioChunk,
{
    fn transcribe(self, whisper: Whisper) -> TranscriptionTask<S, MetadataAudioChunkMarker> {
        TranscriptionTask {
            stream: self.0,
            whisper,
            current_segment_task: None,
            _phantom: PhantomData,
        }
    }
}

#[cfg(feature = "actual")]
impl<S> Stream for TranscriptionTask<S, RodioSourceMarker>
where
    S: Stream + Unpin + Send + 'static,
    <S as Stream>::Item: Source + Send + 'static,
    <<S as Stream>::Item as Iterator>::Item: rodio::Sample,
    f32: FromSample<<<S as Stream>::Item as Iterator>::Item>,
{
    type Item = Segment;

    fn poll_next(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        let this = self.get_mut();

        loop {
            if let Some(task) = &mut this.current_segment_task {
                match task.as_mut().poll_next(cx) {
                    Poll::Ready(Some(segment)) => {
                        return Poll::Ready(Some(segment));
                    }
                    Poll::Ready(None) => {
                        this.current_segment_task = None;
                    }
                    Poll::Pending => return Poll::Pending,
                }
            }

            match this.stream.poll_next_unpin(cx) {
                Poll::Ready(Some(source)) => {
                    let samples: Vec<f32> = source.convert_samples().collect();
                    match process_transcription(
                        &mut this.whisper,
                        &samples,
                        &mut this.current_segment_task,
                        None,
                    ) {
                        Poll::Ready(result) => return Poll::Ready(result),
                        Poll::Pending => continue,
                    }
                }
                Poll::Ready(None) => return Poll::Ready(None),
                Poll::Pending => return Poll::Pending,
            }
        }
    }
}

#[cfg(feature = "actual")]
impl<S, C> Stream for TranscriptionTask<S, MetadataAudioChunkMarker>
where
    S: Stream<Item = C> + Unpin + Send + 'static,
    C: AudioChunk,
{
    type Item = Segment;

    fn poll_next(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        let this = self.get_mut();

        loop {
            if let Some(task) = &mut this.current_segment_task {
                match task.as_mut().poll_next(cx) {
                    Poll::Ready(Some(segment)) => {
                        return Poll::Ready(Some(segment));
                    }
                    Poll::Ready(None) => {
                        this.current_segment_task = None;
                    }
                    Poll::Pending => return Poll::Pending,
                }
            }

            match this.stream.poll_next_unpin(cx) {
                Poll::Ready(Some(chunk)) => {
                    let meta = chunk.meta();
                    let samples = chunk.samples();

                    match process_transcription(
                        &mut this.whisper,
                        samples,
                        &mut this.current_segment_task,
                        meta,
                    ) {
                        Poll::Ready(result) => return Poll::Ready(result),
                        Poll::Pending => continue,
                    }
                }
                Poll::Ready(None) => return Poll::Ready(None),
                Poll::Pending => return Poll::Pending,
            }
        }
    }
}

#[cfg(feature = "actual")]
fn process_transcription<'a>(
    whisper: &'a mut Whisper,
    samples: &'a [f32],
    current_segment_task: &'a mut Option<Pin<Box<dyn Stream<Item = Segment> + Send>>>,
    meta: Option<serde_json::Value>,
) -> Poll<Option<Segment>> {
    if !samples.is_empty() {
        tracing::debug!("[WHISPER_PROCESS] Processing {} samples", samples.len());
        match whisper.transcribe(samples) {
            Err(e) => {
                tracing::error!("❌ [WHISPER_PROCESS] Transcription error: {:?}", e);
                tracing::error!(
                    "💡 This may indicate DirectML/ONNX initialization failure on Windows"
                );
                // Return Ready(None) to terminate the stream on error
                // rather than Pending which could cause infinite polling
                Poll::Ready(None)
            }
            Ok(mut segments) => {
                // Generate a unique flush_id for all segments from this audio chunk
                // This allows the backend to accumulate all segments from the same flush
                let flush_id = FLUSH_ID_COUNTER.fetch_add(1, Ordering::SeqCst);
                let total_segments = segments.len();

                for (idx, segment) in segments.iter_mut().enumerate() {
                    // Merge flush_id and segment info into existing metadata
                    let mut enriched_meta = meta.clone().unwrap_or(serde_json::json!({}));
                    if let Some(obj) = enriched_meta.as_object_mut() {
                        obj.insert("flush_id".to_string(), serde_json::json!(flush_id));
                        obj.insert("segment_index".to_string(), serde_json::json!(idx));
                        obj.insert(
                            "total_segments".to_string(),
                            serde_json::json!(total_segments),
                        );
                        obj.insert(
                            "is_last_segment".to_string(),
                            serde_json::json!(idx == total_segments - 1),
                        );
                    }
                    segment.meta = Some(enriched_meta);
                }

                *current_segment_task = Some(Box::pin(futures_util::stream::iter(segments)));
                Poll::Pending
            }
        }
    } else {
        Poll::Pending
    }
}
