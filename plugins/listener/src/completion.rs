use std::time::Duration;

use tokio::task::JoinHandle;

/// A failed generation stays incomplete until the next explicit recording start.
#[derive(Default)]
pub(crate) struct RecordingCompletion {
    failed: bool,
}

impl RecordingCompletion {
    pub fn record_drain(&mut self, drained: bool) -> bool {
        self.failed |= !drained;
        !self.failed
    }
}

/// Only a normally drained stream with successful final writes may queue a summary.
pub(crate) async fn drain_transcript(mut task: JoinHandle<bool>, deadline: Duration) -> bool {
    match tokio::time::timeout(deadline, &mut task).await {
        Ok(Ok(drained)) => drained,
        Ok(Err(error)) => {
            tracing::error!(%error, "transcript drain task failed");
            false
        }
        Err(_) => {
            task.abort();
            let _ = task.await;
            tracing::error!("transcript drain timed out; summary remains unqueued");
            false
        }
    }
}

/// Stop accepted streaming ingress before closing its final senders, then await
/// provider EOF and the transcript monitor's persisted-write outcome.
pub(crate) async fn drain_streaming_transcript(
    stop: Option<tokio::sync::watch::Sender<bool>>,
    stopped: Option<tokio::sync::oneshot::Receiver<()>>,
    input_closed: Option<std::sync::Arc<std::sync::atomic::AtomicBool>>,
    senders: (
        Option<flume::Sender<Vec<f32>>>,
        Option<flume::Sender<Vec<f32>>>,
    ),
    task: Option<JoinHandle<bool>>,
    deadline: Duration,
) -> bool {
    if let Some(stop) = stop {
        let _ = stop.send(true);
    }
    if let Some(stopped) = stopped {
        if !matches!(tokio::time::timeout(deadline, stopped).await, Ok(Ok(()))) {
            if let Some(task) = task {
                task.abort();
                let _ = task.await;
            }
            tracing::warn!("streaming_audio_ingress_stop_failed");
            return false;
        }
    }
    if let Some(input_closed) = input_closed {
        input_closed.store(true, std::sync::atomic::Ordering::SeqCst);
    }
    drop(senders);
    match task {
        Some(task) => drain_transcript(task, deadline).await,
        None => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    };
    use tokio::sync::oneshot;

    #[test]
    fn recovery_cannot_erase_a_failed_generation_before_terminal_stop() {
        let mut recording = RecordingCompletion::default();
        assert!(!recording.record_drain(false), "old generation failed");
        assert!(!recording.record_drain(true), "rebuilt generation drained");
        assert!(
            !recording.record_drain(true),
            "terminal Stop stays incomplete"
        );

        let mut next_explicit_start = RecordingCompletion::default();
        assert!(next_explicit_start.record_drain(true));
    }

    #[tokio::test]
    async fn completion_waits_for_final_output_and_persisted_write() {
        let (final_output_tx, final_output_rx) = oneshot::channel();
        let (write_finished_tx, write_finished_rx) = oneshot::channel();
        let persisted = Arc::new(AtomicBool::new(false));
        let persisted_by_task = persisted.clone();
        let monitor = tokio::spawn(async move {
            final_output_rx.await.unwrap();
            write_finished_rx.await.unwrap();
            persisted_by_task.store(true, Ordering::SeqCst);
            true
        });
        let mut completion = tokio::spawn(drain_transcript(monitor, Duration::from_secs(1)));

        assert!(
            tokio::time::timeout(Duration::from_millis(10), &mut completion)
                .await
                .is_err()
        );
        final_output_tx.send(()).unwrap();
        assert!(
            tokio::time::timeout(Duration::from_millis(10), &mut completion)
                .await
                .is_err()
        );
        assert!(!persisted.load(Ordering::SeqCst));
        write_finished_tx.send(()).unwrap();
        assert!(completion.await.unwrap());
        assert!(persisted.load(Ordering::SeqCst));
    }

    #[tokio::test]
    async fn timeout_cancels_monitor_and_never_claims_completion() {
        let (write_tx, write_rx) = oneshot::channel::<()>();
        let monitor = tokio::spawn(async move {
            let _ = write_rx.await;
            true
        });

        assert!(!drain_transcript(monitor, Duration::from_millis(10)).await);
        assert!(write_tx.send(()).is_err(), "timed-out task must be drained");
    }

    #[tokio::test]
    async fn failed_write_or_failed_monitor_never_claims_completion() {
        assert!(!drain_transcript(tokio::spawn(async { false }), Duration::from_secs(1)).await);
        let panicked = tokio::spawn(async { panic!("simulated transcript persistence failure") });
        assert!(!drain_transcript(panicked, Duration::from_secs(1)).await);
    }

    #[tokio::test]
    async fn streaming_stop_drains_ingress_then_provider_final_then_persisted_write() {
        let (stop, mut stop_rx) = tokio::sync::watch::channel(false);
        let (stopped_tx, stopped) = oneshot::channel();
        let (allow_ingress_tx, allow_ingress) = oneshot::channel();
        let (final_tx, final_rx) = oneshot::channel();
        let (write_tx, write_rx) = oneshot::channel();
        let (mic, mic_rx) = flume::bounded(2);
        let (speaker, speaker_rx) = flume::bounded(2);
        let producer_mic = mic.clone();
        let producer_speaker = speaker.clone();
        let producer = tokio::spawn(async move {
            stop_rx.changed().await.unwrap();
            allow_ingress.await.unwrap();
            producer_mic.send_async(vec![1.0]).await.unwrap();
            producer_speaker.send_async(vec![2.0]).await.unwrap();
            drop((producer_mic, producer_speaker));
            stopped_tx.send(()).unwrap();
        });
        let closed = Arc::new(AtomicBool::new(false));
        let monitor_closed = closed.clone();
        let persisted = Arc::new(AtomicBool::new(false));
        let monitor_persisted = persisted.clone();
        let monitor = tokio::spawn(async move {
            assert_eq!(mic_rx.recv_async().await.unwrap(), vec![1.0]);
            assert_eq!(speaker_rx.recv_async().await.unwrap(), vec![2.0]);
            assert!(mic_rx.recv_async().await.is_err());
            assert!(speaker_rx.recv_async().await.is_err());
            assert!(monitor_closed.load(Ordering::SeqCst));
            final_rx.await.unwrap();
            write_rx.await.unwrap();
            monitor_persisted.store(true, Ordering::SeqCst);
            true
        });
        let mut completion = tokio::spawn(drain_streaming_transcript(
            Some(stop),
            Some(stopped),
            Some(closed.clone()),
            (Some(mic), Some(speaker)),
            Some(monitor),
            Duration::from_secs(1),
        ));
        assert!(
            tokio::time::timeout(Duration::from_millis(10), &mut completion)
                .await
                .is_err()
        );
        assert!(
            !closed.load(Ordering::SeqCst),
            "ingress must finish before input closes"
        );
        allow_ingress_tx.send(()).unwrap();
        producer.await.unwrap();
        assert!(
            tokio::time::timeout(Duration::from_millis(10), &mut completion)
                .await
                .is_err()
        );
        final_tx.send(()).unwrap();
        assert!(
            tokio::time::timeout(Duration::from_millis(10), &mut completion)
                .await
                .is_err()
        );
        assert!(!persisted.load(Ordering::SeqCst));
        write_tx.send(()).unwrap();
        assert!(completion.await.unwrap());
        assert!(persisted.load(Ordering::SeqCst));
        assert!(
            !drain_streaming_transcript(
                None,
                None,
                None,
                (None, None),
                None,
                Duration::from_secs(1)
            )
            .await,
            "consumed resources cannot complete twice"
        );
    }

    #[tokio::test]
    async fn streaming_ingress_failure_or_timeout_cancels_final_monitor() {
        for fail_ingress in [true, false] {
            let (stopped_tx, stopped) = oneshot::channel();
            let (final_tx, final_rx) = oneshot::channel::<()>();
            let monitor = tokio::spawn(async move {
                final_rx.await.unwrap();
                true
            });
            if fail_ingress {
                drop(stopped_tx);
            } else {
                // Retain the sender past the timeout without completing ingress.
                tokio::spawn(async move {
                    tokio::time::sleep(Duration::from_millis(100)).await;
                    drop(stopped_tx);
                });
            }
            assert!(
                !drain_streaming_transcript(
                    None,
                    Some(stopped),
                    None,
                    (None, None),
                    Some(monitor),
                    Duration::from_millis(10)
                )
                .await
            );
            assert!(final_tx.send(()).is_err());
        }
    }

    #[tokio::test]
    async fn streaming_provider_or_persistence_failure_never_completes_summary() {
        let (stopped_tx, stopped) = oneshot::channel();
        stopped_tx.send(()).unwrap();
        assert!(
            !drain_streaming_transcript(
                None,
                Some(stopped),
                None,
                (None, None),
                Some(tokio::spawn(async { false })),
                Duration::from_secs(1)
            )
            .await
        );
    }
}
