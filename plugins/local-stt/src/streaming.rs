//! Nemotron's private GGML runtime stays in a supervised native worker process.
//! This module owns the application lifecycle and translates typed worker results
//! to the same local STT websocket used by Whisper.
use std::{
    collections::{HashMap, HashSet},
    path::PathBuf,
    process::Stdio,
    time::Duration,
};

use axum::extract::ws::{Message, WebSocket};
use futures_util::{SinkExt, StreamExt};
use tauri::Manager;
use tokio::{
    io::{AsyncRead, AsyncReadExt, AsyncWriteExt},
    process::{Child, ChildStdin},
    sync::mpsc,
};
use typr_listener_interface::{ListenInputChunk, ListenOutputChunk, TranscriptUpdate, Word};
use typr_nemotron_runtime::protocol::{
    Channel, Request, Response, MAX_FRAME_BYTES, PROTOCOL_VERSION,
};

const RESPONSE_TIMEOUT: Duration = Duration::from_secs(60);
// The listener grants 120s for the entire local connection. Leave room for
// integrity checking and a safe Whisper startup after a native timeout.
const START_TIMEOUT: Duration = Duration::from_secs(60);
const MAX_TURN_SAMPLES: u64 = 30 * 16_000;

#[derive(Clone)]
pub(crate) struct WorkerPaths {
    pub worker: PathBuf,
    pub sdk_library: PathBuf,
}

impl WorkerPaths {
    pub fn resolve<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Result<Self, crate::Error> {
        if !cfg!(feature = "nemotron") {
            return Err(crate::Error::NotSupported(
                "Nemotron prototype is not enabled in this build".into(),
            ));
        }
        // Fixed app-owned locations. Never search PATH or execute user-selected files.
        let resource = app.path().resource_dir()?.join("stt/nemotron");
        let worker = resource.join(if cfg!(windows) {
            "typr-nemotron-worker.exe"
        } else {
            "typr-nemotron-worker"
        });
        let sdk_library = resource.join("lib").join(if cfg!(target_os = "macos") {
            "libnemo_speech_asr_c.dylib"
        } else if cfg!(windows) {
            "nemo_speech_asr_c.dll"
        } else {
            "libnemo_speech_asr_c.so"
        });
        if !worker.is_file() || !sdk_library.is_file() {
            return Err(crate::Error::NotSupported(
                "Bundled Nemotron worker or SDK is unavailable".into(),
            ));
        }
        Ok(Self {
            worker,
            sdk_library,
        })
    }
}

pub(crate) struct WorkerClient {
    child: Child,
    stdin: ChildStdin,
    responses: mpsc::Receiver<Result<Response, String>>,
    reader: tokio::task::JoinHandle<()>,
}

impl Drop for WorkerClient {
    fn drop(&mut self) {
        self.reader.abort();
        let _ = self.child.start_kill();
    }
}

async fn read_response(reader: &mut (impl AsyncRead + Unpin)) -> Result<Response, String> {
    let len = reader.read_u32().await.map_err(|error| error.to_string())? as usize;
    if len == 0 || len > MAX_FRAME_BYTES {
        return Err("Invalid worker response length".into());
    }
    let mut bytes = vec![0; len];
    reader
        .read_exact(&mut bytes)
        .await
        .map_err(|error| error.to_string())?;
    serde_json::from_slice(&bytes).map_err(|error| error.to_string())
}

impl WorkerClient {
    pub async fn start(paths: &WorkerPaths, model_path: PathBuf) -> Result<Self, crate::Error> {
        let mut child = tokio::process::Command::new(&paths.worker)
            .arg("--sdk-library")
            .arg(&paths.sdk_library)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .kill_on_drop(true)
            .spawn()?;
        let stdin = child
            .stdin
            .take()
            .ok_or_else(|| crate::Error::Streaming("Missing worker input".into()))?;
        let mut stdout = child
            .stdout
            .take()
            .ok_or_else(|| crate::Error::Streaming("Missing worker output".into()))?;
        let (tx, responses) = mpsc::channel(8);
        let reader = tokio::spawn(async move {
            loop {
                let response = read_response(&mut stdout).await;
                let failed = response.is_err();
                if tx.send(response).await.is_err() || failed {
                    break;
                }
            }
        });
        let mut client = Self {
            child,
            stdin,
            responses,
            reader,
        };
        client
            .send(&Request::Start {
                protocol_version: PROTOCOL_VERSION,
                gpu: if cfg!(target_os = "macos") { 0 } else { -1 },
                model_path: model_path.to_string_lossy().into(),
                language: "auto".into(),
                channels: vec![Channel::Mic, Channel::Speaker],
            })
            .await?;
        match client.receive(START_TIMEOUT).await? {
            Response::Ready { protocol_version } if protocol_version == PROTOCOL_VERSION => {
                Ok(client)
            }
            Response::Error { message } => Err(crate::Error::Streaming(message)),
            _ => Err(crate::Error::Streaming(
                "Worker did not complete its startup handshake".into(),
            )),
        }
    }
    async fn send(&mut self, request: &Request) -> Result<(), crate::Error> {
        let bytes =
            serde_json::to_vec(request).map_err(|e| crate::Error::Streaming(e.to_string()))?;
        if bytes.is_empty() || bytes.len() > MAX_FRAME_BYTES {
            return Err(crate::Error::Streaming(
                "Worker request exceeds frame limit".into(),
            ));
        }
        tokio::time::timeout(RESPONSE_TIMEOUT, async {
            self.stdin.write_u32(bytes.len() as u32).await?;
            self.stdin.write_all(&bytes).await?;
            self.stdin.flush().await
        })
        .await
        .map_err(|_| crate::Error::Streaming("Worker input timed out".into()))??;
        Ok(())
    }
    async fn receive(&mut self, timeout: Duration) -> Result<Response, crate::Error> {
        tokio::time::timeout(timeout, self.responses.recv())
            .await
            .map_err(|_| crate::Error::Streaming("Worker response timed out".into()))?
            .ok_or_else(|| crate::Error::Streaming("Worker closed its output".into()))?
            .map_err(crate::Error::Streaming)
    }
}

#[derive(Default)]
struct ResultTracker {
    committed: HashMap<Channel, (u64, Vec<typr_nemotron_runtime::protocol::Word>)>,
}
impl ResultTracker {
    fn convert(
        &mut self,
        response: Response,
        mixed: bool,
    ) -> Result<Option<ListenOutputChunk>, crate::Error> {
        match response {
            Response::Result {
                channel,
                is_final,
                text: _,
                words,
                audio_processed_ms,
            } => {
                let channel_name = if mixed {
                    "mixed"
                } else {
                    channel_name(channel)
                };
                if is_final {
                    // An empty final still clears its channel's previous hypothesis.
                    // Duplicate delivery is identified by the full immutable final,
                    // rather than its audio watermark (multiple finals may share it).
                    if !words.is_empty() {
                        let key = (audio_processed_ms, words.clone());
                        if self.committed.get(&channel) == Some(&key) {
                            return Ok(None);
                        }
                        self.committed.insert(channel, key);
                    }
                }
                let speaker = if mixed {
                    None
                } else {
                    Some(typr_listener_interface::SpeakerIdentity::Unassigned {
                        index: if channel == Channel::Mic { 0 } else { 1 },
                    })
                };
                Ok(Some(ListenOutputChunk {
                    meta: None,
                    update: Some(if is_final {
                        TranscriptUpdate::Final {
                            channel: channel_name.into(),
                        }
                    } else {
                        TranscriptUpdate::Preview {
                            channel: channel_name.into(),
                        }
                    }),
                    words: words
                        .into_iter()
                        .map(|word| Word {
                            text: word.text,
                            start_ms: word.start_ms,
                            end_ms: word.end_ms,
                            confidence: word.confidence,
                            speaker: speaker.clone(),
                        })
                        .collect(),
                }))
            }
            Response::Error { message } => Err(crate::Error::Streaming(message)),
            _ => Ok(None),
        }
    }
}
fn channel_name(channel: Channel) -> &'static str {
    match channel {
        Channel::Mixed => "mixed",
        Channel::Mic => "mic",
        Channel::Speaker => "speaker",
    }
}

pub(crate) async fn serve(
    socket: WebSocket,
    mut worker: WorkerClient,
    guard: crate::manager::ConnectionGuard,
    params: typr_listener_interface::ListenParams,
) {
    let mixed = matches!(
        params.audio_mode,
        typr_listener_interface::AudioMode::Single
    );
    let (mut sender, mut receiver) = socket.split();
    let mut tracker = ResultTracker::default();
    let mut turn_samples: HashMap<Channel, u64> = HashMap::new();
    let mut finishing = false;
    let mut finish_deadline = tokio::time::Instant::now() + RESPONSE_TIMEOUT;
    let mut finished = HashSet::new();
    let result: Result<(), crate::Error> = async {
        let language = streaming_language(&params.languages)?;
        worker.send(&Request::Configure { language: language.into() }).await?;
        match worker.receive(RESPONSE_TIMEOUT).await? {
            Response::Configured => {},
            Response::Error { message } => return Err(crate::Error::Streaming(message)),
            _ => return Err(crate::Error::Streaming("Worker did not acknowledge the session language".into())),
        }
        loop {
            tokio::select! {
                biased;
                _ = guard.cancelled() => break,
                _ = tokio::time::sleep_until(finish_deadline), if finishing => {
                    return Err(crate::Error::Streaming("Worker finish timed out".into()));
                }
                response = worker.responses.recv() => {
                    let response = response.ok_or_else(|| crate::Error::Streaming("Worker closed its output".into()))?.map_err(crate::Error::Streaming)?;
                    if let Response::Finished { channel } = &response { finished.insert(*channel); }
                    if let Some(chunk) = tracker.convert(response, mixed)? {
                        if let Some(TranscriptUpdate::Final { channel }) = &chunk.update {
                            let native = if channel == "speaker" { Channel::Speaker } else { Channel::Mic };
                            turn_samples.insert(native, 0);
                        }
                        sender.send(Message::Text(serde_json::to_string(&chunk).unwrap().into())).await.map_err(|e| crate::Error::Streaming(e.to_string()))?;
                    }
                    if finishing && finished.contains(&Channel::Mic) && finished.contains(&Channel::Speaker) { break; }
                }
                message = receiver.next(), if !finishing => {
                    let text = match message {
                        Some(Ok(Message::Text(text))) => text,
                        Some(Ok(Message::Ping(_) | Message::Pong(_))) => continue,
                        _ => break,
                    };
                    let input: ListenInputChunk = serde_json::from_str(&text).map_err(|e| crate::Error::Streaming(e.to_string()))?;
                    let frames = match input {
                        ListenInputChunk::Audio { data } => vec![(Channel::Mic, data)],
                        ListenInputChunk::DualAudio { mic, speaker } => vec![(Channel::Mic, mic), (Channel::Speaker, speaker)],
                        ListenInputChunk::End => {
                            worker.send(&Request::Finish { channel: Channel::Mic }).await?;
                            worker.send(&Request::Finish { channel: Channel::Speaker }).await?;
                            finishing = true;
                            finish_deadline = tokio::time::Instant::now() + RESPONSE_TIMEOUT;
                            continue;
                        }
                    };
                    for (channel, bytes) in frames {
                        if bytes.len() % 2 != 0 || bytes.len() > 32_000 { return Err(crate::Error::Streaming("Invalid 16 kHz PCM audio frame".into())); }
                        let samples: Vec<f32> = bytes.chunks_exact(2).map(|sample| i16::from_le_bytes([sample[0], sample[1]]) as f32 / 32768.0).collect();
                        if samples.is_empty() { continue; }
                        let count = turn_samples.entry(channel).or_default();
                        *count += samples.len() as u64;
                        worker.send(&Request::Audio { channel, samples }).await?;
                        if *count >= MAX_TURN_SAMPLES {
                            worker.send(&Request::Endpoint { channel }).await?;
                            *count = 0;
                        }
                    }
                }
            }
        }
        Ok(())
    }.await;
    if let Err(error) = result {
        tracing::warn!("nemotron_stream_failed: {}", error);
        let chunk = ListenOutputChunk {
            meta: None,
            words: vec![],
            update: Some(TranscriptUpdate::Failed {
                code: "local_stream_failed".into(),
            }),
        };
        let _ = sender
            .send(Message::Text(serde_json::to_string(&chunk).unwrap().into()))
            .await;
    }
    let _ = sender.close().await;
}

fn streaming_language(languages: &[typr_language::Language]) -> Result<&'static str, crate::Error> {
    crate::SupportedModel::Nemotron3p5Streaming
        .streaming_locale(languages)
        .map_err(crate::Error::NotSupported)
}

#[cfg(test)]
mod tests {
    use super::*;
    use typr_nemotron_runtime::protocol::Word as RuntimeWord;

    fn result(channel: Channel, final_result: bool, text: &str, start: u64) -> Response {
        Response::Result {
            channel,
            is_final: final_result,
            text: text.into(),
            words: vec![RuntimeWord {
                text: text.into(),
                start_ms: Some(start),
                end_ms: Some(start + 100),
                confidence: Some(0.9),
            }],
            audio_processed_ms: 1000,
        }
    }

    #[test]
    fn interim_revisions_and_final_commits_are_separate_per_channel() {
        let mut tracker = ResultTracker::default();
        let preview = tracker
            .convert(result(Channel::Mic, false, "hello", 10), false)
            .unwrap()
            .unwrap();
        assert!(matches!(
            preview.update,
            Some(TranscriptUpdate::Preview { .. })
        ));
        let revision = tracker
            .convert(result(Channel::Mic, false, "hola", 10), false)
            .unwrap()
            .unwrap();
        assert_eq!(revision.words[0].text, "hola");
        let committed = tracker
            .convert(result(Channel::Mic, true, "hola", 10), false)
            .unwrap()
            .unwrap();
        assert!(matches!(
            committed.update,
            Some(TranscriptUpdate::Final { .. })
        ));
        assert!(tracker
            .convert(result(Channel::Mic, true, "hola", 10), false)
            .unwrap()
            .is_none());
        // A second utterance can share the processed-audio watermark; its word
        // timestamps still identify a distinct final. Another source is independent.
        assert!(tracker
            .convert(result(Channel::Mic, true, "hola", 110), false)
            .unwrap()
            .is_some());
        let speaker = tracker
            .convert(result(Channel::Speaker, true, "hello", 10), false)
            .unwrap()
            .unwrap();
        assert_eq!(
            speaker.words[0].speaker,
            Some(typr_listener_interface::SpeakerIdentity::Unassigned { index: 1 })
        );
    }

    #[test]
    fn empty_final_clears_preview_and_errors_are_never_transcript_words() {
        let mut tracker = ResultTracker::default();
        let clear = Response::Result {
            channel: Channel::Mic,
            is_final: true,
            text: String::new(),
            words: vec![],
            audio_processed_ms: 0,
        };
        assert!(
            matches!(tracker.convert(clear, true).unwrap().unwrap().update, Some(TranscriptUpdate::Final { channel }) if channel == "mixed")
        );
        assert!(tracker
            .convert(
                Response::Error {
                    message: "native failure".into()
                },
                false
            )
            .is_err());
    }

    #[tokio::test]
    async fn async_reader_uses_the_workers_bounded_big_endian_protocol() {
        let mut frame = Vec::new();
        typr_nemotron_runtime::protocol::write_frame(
            &mut frame,
            &Response::Ready {
                protocol_version: PROTOCOL_VERSION,
            },
        )
        .unwrap();
        assert_eq!(
            read_response(&mut frame.as_slice()).await.unwrap(),
            Response::Ready {
                protocol_version: PROTOCOL_VERSION
            }
        );
        for frame in [
            vec![0],
            vec![0; 4],
            ((MAX_FRAME_BYTES + 1) as u32).to_be_bytes().to_vec(),
            vec![0, 0, 0, 3, b'{'],
        ] {
            assert!(read_response(&mut frame.as_slice()).await.is_err());
        }
    }

    #[test]
    fn language_policy_uses_the_shared_out_of_box_registry() {
        use typr_language::{Language, ISO639};
        let en = Language::from(ISO639::En);
        let es = Language::from(ISO639::Es);
        assert_eq!(streaming_language(&[en.clone()]).unwrap(), "en-US");
        assert_eq!(streaming_language(&[es.clone()]).unwrap(), "es-ES");
        assert_eq!(streaming_language(&[en, es]).unwrap(), "auto");
        assert_eq!(
            streaming_language(&[Language::from(ISO639::Fr)]).unwrap(),
            "fr-FR"
        );
        assert_eq!(
            streaming_language(&[Language::from(ISO639::No)]).unwrap(),
            "nb-NO"
        );
        assert!(streaming_language(&[Language::from(ISO639::El)]).is_err());
        assert_eq!(
            crate::SupportedModel::QuantizedBaseEn.supported_languages(),
            Some(vec!["en".into()])
        );
        assert!(crate::SupportedModel::QuantizedLargeTurbo
            .supported_languages()
            .is_none());
        assert!(crate::SupportedModel::QuantizedLargeTurbo
            .supported_locales()
            .is_none());
        let model = crate::SupportedModel::Nemotron3p5Streaming;
        assert_eq!(model.supported_languages().unwrap().len(), 28);
        assert_eq!(model.supported_locales().unwrap().len(), 32);
        for code in model.supported_languages().unwrap() {
            let language: Language =
                serde_json::from_value(serde_json::Value::String(code)).unwrap();
            assert!(model.supports_languages(&[language.clone()]));
            assert!(streaming_language(&[language]).is_ok());
        }
        assert!(crate::STREAMING_WHISPER_FALLBACKS
            .iter()
            .all(|model| model.backend() == crate::SttBackend::Whisper
                && !model.file_name().contains(".en")));
    }

    #[cfg(unix)]
    fn fake_worker(response: Response) -> (tempfile::TempDir, WorkerPaths) {
        use std::os::unix::fs::PermissionsExt;
        let temp = tempfile::tempdir().unwrap();
        let worker = temp.path().join("worker");
        let mut bytes = Vec::new();
        typr_nemotron_runtime::protocol::write_frame(&mut bytes, &response).unwrap();
        let octal: String = bytes.iter().map(|byte| format!("\\{:03o}", byte)).collect();
        // Only a test fixture uses a shell, never the application worker launcher.
        std::fs::write(
            &worker,
            format!("#!/bin/sh\nprintf '{octal}'\nexec /bin/sleep 60\n"),
        )
        .unwrap();
        std::fs::set_permissions(&worker, std::fs::Permissions::from_mode(0o700)).unwrap();
        let paths = WorkerPaths {
            worker,
            sdk_library: temp.path().join("unused-sdk"),
        };
        (temp, paths)
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn startup_rejects_wrong_protocol_and_drop_cancels_native_work() {
        let (_temp, paths) = fake_worker(Response::Ready {
            protocol_version: PROTOCOL_VERSION + 1,
        });
        assert!(WorkerClient::start(&paths, PathBuf::from("unused-model"))
            .await
            .is_err());
        let (_temp, paths) = fake_worker(Response::Ready {
            protocol_version: PROTOCOL_VERSION,
        });
        let client = WorkerClient::start(&paths, PathBuf::from("unused-model"))
            .await
            .unwrap();
        let pid = client.child.id().unwrap();
        drop(client);
        tokio::time::sleep(Duration::from_millis(100)).await;
        let alive = std::process::Command::new("/bin/kill")
            .args(["-0", &pid.to_string()])
            .stderr(Stdio::null())
            .status()
            .unwrap()
            .success();
        assert!(!alive, "dropping a session must kill its isolated worker");
    }

    /// Runs through the actual local websocket, typed worker IPC and native SDK.
    /// Assets are explicit test inputs; the app itself never reads these variables.
    #[ignore = "requires the pinned SDK, worker and English/Spanish audio fixtures"]
    #[tokio::test]
    async fn real_websocket_streams_english_and_spanish_then_drains_final_results() {
        use tokio_tungstenite::{connect_async, tungstenite::Message as ClientMessage};
        let path = |name: &str| PathBuf::from(std::env::var(name).expect(name));
        let paths = WorkerPaths {
            worker: path("TYPR_NEMOTRON_TEST_WORKER"),
            sdk_library: path("TYPR_NEMOTRON_TEST_SDK"),
        };
        for (language, audio_var) in [
            ("en", "TYPR_NEMOTRON_TEST_EN_AUDIO"),
            ("es", "TYPR_NEMOTRON_TEST_ES_AUDIO"),
        ] {
            let mut state = crate::ServerStateBuilder::default()
                .model_type(crate::SupportedModel::Nemotron3p5Streaming)
                .model_cache_dir(
                    path("TYPR_NEMOTRON_TEST_MODEL")
                        .parent()
                        .unwrap()
                        .to_path_buf(),
                )
                .build();
            state.model_path = path("TYPR_NEMOTRON_TEST_MODEL");
            state.worker_paths = Some(paths.clone());
            let server = crate::run_server(state).await.unwrap();
            let (socket, _) = connect_async(format!("ws://{}/api/desktop/listen/realtime?audio_mode=single&languages={language}&static_prompt=&dynamic_prompt=&redemption_time_ms=1000", server.addr)).await.unwrap();
            let (mut tx, mut rx) = socket.split();
            let mut audio = hound::WavReader::open(path(audio_var)).unwrap();
            assert_eq!(audio.spec().sample_rate, 16000);
            assert_eq!(audio.spec().channels, 1);
            let samples: Vec<i16> = audio.samples::<i16>().map(Result::unwrap).collect();
            let duration = Duration::from_secs_f64(samples.len() as f64 / 16000.0);
            let started = std::time::Instant::now();
            let sending = tokio::spawn(async move {
                let mut pacing = tokio::time::interval(Duration::from_millis(320));
                for frame in samples.chunks(5120) {
                    pacing.tick().await;
                    let data = frame
                        .iter()
                        .flat_map(|sample| sample.to_le_bytes())
                        .collect();
                    tx.send(ClientMessage::Text(
                        serde_json::to_string(&ListenInputChunk::Audio { data })
                            .unwrap()
                            .into(),
                    ))
                    .await
                    .unwrap();
                }
                tx.send(ClientMessage::Text(
                    serde_json::to_string(&ListenInputChunk::End)
                        .unwrap()
                        .into(),
                ))
                .await
                .unwrap();
                // Keep the write half alive until all output is acknowledged.
                tx
            });
            let mut previews = 0;
            let mut finals = Vec::new();
            let mut first_partial = None;
            loop {
                let message = tokio::time::timeout(Duration::from_secs(60), rx.next())
                    .await
                    .unwrap();
                let Some(Ok(ClientMessage::Text(text))) = message else {
                    break;
                };
                let chunk: ListenOutputChunk = serde_json::from_str(&text).unwrap();
                match chunk.update {
                    Some(TranscriptUpdate::Preview { .. }) if !chunk.words.is_empty() => {
                        previews += 1;
                        first_partial.get_or_insert(started.elapsed());
                    }
                    Some(TranscriptUpdate::Final { .. }) => finals.extend(chunk.words),
                    Some(TranscriptUpdate::Failed { code }) => {
                        panic!("native websocket failed: {code}")
                    }
                    _ => {}
                }
            }
            let _sender = sending.await.unwrap();
            assert!(previews > 0);
            assert!(first_partial.unwrap() < duration);
            assert!(!finals.is_empty());
            assert!(finals
                .iter()
                .all(|word| !word.text.is_empty() && word.start_ms.is_some()));
            eprintln!("{language}: {previews} previews, {} committed words, first_partial_ms={}, wall_ms={}, audio_ms={}", finals.len(), first_partial.unwrap().as_millis(), started.elapsed().as_millis(), duration.as_millis());
            let _ = server.shutdown.send(());
        }
    }
}
