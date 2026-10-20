use std::sync::{
    atomic::{AtomicU64, Ordering},
    Arc,
};
use typr_listener_interface::{ListenOutputChunk, TranscriptUpdate};

pub(crate) struct CompletionSignal(pub Option<tokio::sync::oneshot::Sender<()>>);
impl Drop for CompletionSignal {
    fn drop(&mut self) {
        if let Some(tx) = self.0.take() {
            let _ = tx.send(());
        }
    }
}

/// Canonical position is submitted 16 kHz PCM, excluding pauses and device gaps.
/// Independent counters avoid assuming microphone and system frames are equal.
#[derive(Clone)]
pub(crate) struct AudioTimeline(Arc<[AtomicU64; 2]>);
impl AudioTimeline {
    pub fn new(initial_samples: u64) -> Self {
        Self(Arc::new([
            AtomicU64::new(initial_samples),
            AtomicU64::new(initial_samples),
        ]))
    }
    pub fn submitted(&self, channel: usize, bytes: usize) {
        self.0[channel].fetch_add((bytes / 2) as u64, Ordering::AcqRel);
    }
    pub fn origin_ms(&self) -> [u64; 2] {
        self.0
            .each_ref()
            .map(|samples| samples.load(Ordering::Acquire) / 16)
    }
}

pub(crate) fn offset_streaming_chunk(chunk: &mut ListenOutputChunk, origin_ms: [u64; 2]) {
    let channel = match &chunk.update {
        Some(TranscriptUpdate::Preview { channel } | TranscriptUpdate::Final { channel }) => {
            channel
        }
        _ => return,
    };
    let offset = origin_ms[usize::from(channel == "speaker")];
    for word in &mut chunk.words {
        word.start_ms = word.start_ms.map(|ms| ms.saturating_add(offset));
        word.end_ms = word.end_ms.map(|ms| ms.saturating_add(offset));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use typr_listener_interface::Word;
    #[test]
    fn rebuilt_stream_timestamps_follow_submitted_audio_and_exclude_pauses() {
        let timeline = AudioTimeline::new(16_000);
        let first_origin = timeline.origin_ms();
        timeline.submitted(0, 32_000);
        timeline.submitted(1, 64_000);
        // A pause submits no samples and introduces no synthetic timestamp gap.
        let second_origin = timeline.origin_ms();
        assert_eq!(first_origin, [1000, 1000]);
        assert_eq!(second_origin, [2000, 3000]);
        for (channel, expected) in [("mic", 2100), ("speaker", 3100)] {
            let mut chunk = ListenOutputChunk {
                update: Some(TranscriptUpdate::Final {
                    channel: channel.into(),
                }),
                words: vec![Word {
                    text: "hola".into(),
                    start_ms: Some(100),
                    end_ms: Some(200),
                    ..Default::default()
                }],
                ..Default::default()
            };
            offset_streaming_chunk(&mut chunk, second_origin);
            assert_eq!(chunk.words[0].start_ms, Some(expected));
            assert_eq!(chunk.words[0].end_ms, Some(expected + 100));
        }
    }
}
