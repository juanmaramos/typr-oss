use std::{
    net::{Ipv4Addr, SocketAddr},
    path::PathBuf,
    time::Duration,
};

use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        State as AxumState,
    },
    http::StatusCode,
    response::IntoResponse,
    routing::get,
    Router,
};
use axum_extra::extract::Query;

use futures_util::{SinkExt, StreamExt};
use tower_http::cors::{self, CorsLayer};

use typr_chunker::VadExt;
use typr_listener_interface::{ListenOutputChunk, ListenParams, Word};

use crate::manager::{ConnectionGuard, ConnectionManager};

#[derive(Default)]
pub struct ServerStateBuilder {
    pub model_type: Option<crate::SupportedModel>,
    pub model_cache_dir: Option<PathBuf>,
}

impl ServerStateBuilder {
    pub fn model_cache_dir(mut self, model_cache_dir: PathBuf) -> Self {
        self.model_cache_dir = Some(model_cache_dir);
        self
    }

    pub fn model_type(mut self, model_type: crate::SupportedModel) -> Self {
        self.model_type = Some(model_type);
        self
    }

    pub fn build(self) -> ServerState {
        let model_path = self
            .model_cache_dir
            .unwrap()
            .join(self.model_type.unwrap().file_name());

        // Initialize manager with empty languages - actual languages come from connection params
        let whisper_manager = crate::WhisperModelManager::new(model_path, vec![]);

        ServerState {
            whisper_manager,
            connection_manager: ConnectionManager::default(),
        }
    }
}

#[derive(Clone)]
pub struct ServerState {
    whisper_manager: crate::WhisperModelManager,
    connection_manager: ConnectionManager,
}

#[derive(Clone)]
pub struct ServerHandle {
    pub addr: SocketAddr,
    pub shutdown: tokio::sync::watch::Sender<()>,
}

pub async fn run_server(state: ServerState) -> Result<ServerHandle, crate::Error> {
    let router = Router::new()
        .route("/health", get(health))
        .route("/api/desktop/listen/realtime", get(listen))
        .layer(
            CorsLayer::new()
                .allow_origin(cors::Any)
                .allow_methods(cors::Any)
                .allow_headers(cors::Any),
        )
        .with_state(state);

    let listener =
        tokio::net::TcpListener::bind(SocketAddr::from((Ipv4Addr::LOCALHOST, 0))).await?;

    let server_addr = listener.local_addr()?;

    let (shutdown_tx, mut shutdown_rx) = tokio::sync::watch::channel(());

    let server_handle = ServerHandle {
        addr: server_addr,
        shutdown: shutdown_tx,
    };

    tokio::spawn(async move {
        axum::serve(listener, router)
            .with_graceful_shutdown(async move {
                shutdown_rx.changed().await.ok();
            })
            .await
            .unwrap();
    });

    tracing::info!("local_stt_server_started {}", server_addr);
    Ok(server_handle)
}

async fn health() -> impl IntoResponse {
    "ok"
}

async fn listen(
    Query(params): Query<ListenParams>,
    ws: WebSocketUpgrade,
    AxumState(state): AxumState<ServerState>,
) -> Result<impl IntoResponse, StatusCode> {
    let guard = state.connection_manager.acquire_connection();

    Ok(ws.on_upgrade(move |socket| async move {
        let _ = websocket_with_model(socket, params, state, guard).await;
    }))
}

async fn websocket_with_model(
    socket: WebSocket,
    params: ListenParams,
    state: ServerState,
    guard: ConnectionGuard,
) -> Result<(), Box<dyn std::error::Error>> {
    #[cfg(any(
        feature = "coreml",
        feature = "metal",
        feature = "cuda",
        feature = "hipblas",
        feature = "openblas",
        feature = "vulkan",
        feature = "openmp"
    ))]
    {
        let model_path = state.whisper_manager.model_path.clone();
        let static_prompt = params.static_prompt.clone();
        let dynamic_prompt = params.dynamic_prompt.clone();
        let static_prompt_enabled = !static_prompt.trim().is_empty();
        let dynamic_prompt_enabled = !dynamic_prompt.trim().is_empty();
        let languages: Vec<typr_whisper::Language> = params
            .languages
            .iter()
            .filter_map(|lang| lang.clone().try_into().ok())
            .collect();
        let languages_count = languages.len();

        tracing::info!(
            "[LOCAL_STT_CONFIG] audio_mode={:?} languages_count={} static_prompt_enabled={} dynamic_prompt_enabled={} redemption_time_ms={}",
            params.audio_mode,
            languages_count,
            static_prompt_enabled,
            dynamic_prompt_enabled,
            params.redemption_time_ms
        );

        // Load model using spawn_blocking to avoid blocking tokio runtime.
        // TODO: Implement proper caching once whisper-local supports shared access.
        let model = tokio::task::spawn_blocking(move || {
            typr_whisper_local::Whisper::builder()
                .model_path(model_path.to_str().unwrap())
                .languages(languages)
                .static_prompt(static_prompt)
                .dynamic_prompt(dynamic_prompt)
                .build()
        })
        .await
        .map_err(|e| format!("Task join error: {}", e))?
        .map_err(|e| {
            tracing::error!("Failed to build Whisper model: {}", e);
            e
        })?;

        let (ws_sender, ws_receiver) = socket.split();

        match params.audio_mode {
            typr_listener_interface::AudioMode::Single => {
                websocket_single_channel(
                    ws_sender,
                    ws_receiver,
                    model,
                    guard,
                    Duration::from_millis(params.redemption_time_ms),
                )
                .await;
            }
            typr_listener_interface::AudioMode::Dual => {
                websocket_dual_channel(
                    ws_sender,
                    ws_receiver,
                    model,
                    guard,
                    Duration::from_millis(params.redemption_time_ms),
                )
                .await;
            }
        }

        Ok(())
    }

    #[cfg(not(any(
        feature = "coreml",
        feature = "metal",
        feature = "cuda",
        feature = "hipblas",
        feature = "openblas",
        feature = "vulkan",
        feature = "openmp"
    )))]
    {
        let _ = (socket, params, state, guard);
        Err(Box::new(crate::Error::NotSupported(
            "No whisper backend compiled. Enable a feature like 'coreml' or 'metal'.".to_string(),
        )))
    }
}

#[cfg(any(
    feature = "coreml",
    feature = "metal",
    feature = "cuda",
    feature = "hipblas",
    feature = "openblas",
    feature = "vulkan",
    feature = "openmp"
))]
async fn websocket_single_channel(
    ws_sender: futures_util::stream::SplitSink<WebSocket, Message>,
    ws_receiver: futures_util::stream::SplitStream<WebSocket>,
    model: typr_whisper_local::Whisper,
    guard: ConnectionGuard,
    redemption_time: Duration,
) {
    tracing::info!(
        "[TRANSCRIPTION_PIPELINE] Starting single channel pipeline with redemption_time={:?}",
        redemption_time
    );

    let audio_source = typr_ws_utils::WebSocketAudioSource::new(ws_receiver, 16 * 1000);
    // Local Whisper only emits committed VAD/force-commit chunks. Soft preview remains disabled.
    let vad_chunks =
        audio_source.vad_chunks_with_max_duration(redemption_time, Duration::from_secs(999));

    let chunked = typr_whisper_local::AudioChunkStream(process_vad_stream(vad_chunks, "mixed"));

    let stream = typr_whisper_local::TranscribeMetadataAudioStreamExt::transcribe(chunked, model);

    process_transcription_stream(ws_sender, stream, guard).await;
}

#[cfg(any(
    feature = "coreml",
    feature = "metal",
    feature = "cuda",
    feature = "hipblas",
    feature = "openblas",
    feature = "vulkan",
    feature = "openmp"
))]
async fn websocket_dual_channel(
    ws_sender: futures_util::stream::SplitSink<WebSocket, Message>,
    ws_receiver: futures_util::stream::SplitStream<WebSocket>,
    model: typr_whisper_local::Whisper,
    guard: ConnectionGuard,
    redemption_time: Duration,
) {
    tracing::info!(
        "[TRANSCRIPTION_PIPELINE] Starting DUAL channel pipeline with redemption_time={:?}",
        redemption_time
    );

    let (mic_source, speaker_source) =
        typr_ws_utils::split_dual_audio_sources(ws_receiver, 16 * 1000);

    let mic_chunked = {
        // Local Whisper only emits committed VAD/force-commit chunks. Soft preview remains disabled.
        let mic_vad_chunks =
            mic_source.vad_chunks_with_max_duration(redemption_time, Duration::from_secs(999));
        typr_whisper_local::AudioChunkStream(process_vad_stream(mic_vad_chunks, "mic"))
    };

    let speaker_chunked = {
        // Local Whisper only emits committed VAD/force-commit chunks. Soft preview remains disabled.
        let speaker_vad_chunks =
            speaker_source.vad_chunks_with_max_duration(redemption_time, Duration::from_secs(999));
        typr_whisper_local::AudioChunkStream(process_vad_stream(speaker_vad_chunks, "speaker"))
    };

    let merged_stream = typr_whisper_local::AudioChunkStream(futures_util::stream::select(
        mic_chunked.0,
        speaker_chunked.0,
    ));

    let stream =
        typr_whisper_local::TranscribeMetadataAudioStreamExt::transcribe(merged_stream, model);

    process_transcription_stream(ws_sender, stream, guard).await;
}

async fn process_transcription_stream(
    mut ws_sender: futures_util::stream::SplitSink<WebSocket, Message>,
    mut stream: impl futures_util::Stream<Item = typr_whisper_local::Segment> + Unpin,
    guard: ConnectionGuard,
) {
    loop {
        tokio::select! {
            _ = guard.cancelled() => {
                tracing::info!("websocket_cancelled_by_new_connection");
                break;
            }
            chunk_opt = stream.next() => {
                let Some(chunk) = chunk_opt else { break };

                let meta = chunk.meta.clone();
                let text = chunk.text.clone();
                let start = chunk.start as u64;
                let duration = (chunk.end - chunk.start) as u64;
                let confidence = chunk.confidence;

                let source = meta.and_then(|meta|
                    meta.get("source")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string())
                );
                let speaker = match source {
                    Some(s) if s == "mic" => Some(typr_listener_interface::SpeakerIdentity::Unassigned { index: 0 }),
                    Some(s) if s == "speaker" => Some(typr_listener_interface::SpeakerIdentity::Unassigned { index: 1 }),
                    _ => None,
                };

                let data = ListenOutputChunk {
                    meta: None,
                    words: text
                        .split_whitespace()
                        .filter(|w| !w.is_empty())
                        .map(|w| Word {
                            text: w.trim().to_string(),
                            speaker: speaker.clone(),
                            start_ms: Some(start),
                            end_ms: Some(start + duration),
                            confidence: Some(confidence),
                        })
                        .collect(),
                };

                let msg = Message::Text(serde_json::to_string(&data).unwrap().into());
                if let Err(e) = ws_sender.send(msg).await {
                    tracing::warn!("websocket_send_error: {}", e);
                    break;
                }
            }
        }
    }

    let _ = ws_sender.close().await;
}

fn process_vad_stream<S, E>(
    stream: S,
    source_name: &str,
) -> impl futures_util::Stream<Item = typr_whisper_local::SimpleAudioChunk>
where
    S: futures_util::Stream<Item = Result<typr_chunker::AudioChunk, E>>,
    E: std::fmt::Display,
{
    let source_name = source_name.to_string();

    stream.filter_map(move |chunk_result| {
        futures_util::future::ready(match chunk_result {
            Ok(chunk) => Some(typr_whisper_local::SimpleAudioChunk {
                samples: chunk.samples,
                meta: Some(serde_json::json!({
                    "source": source_name
                })),
            }),
            Err(e) => {
                tracing::warn!("vad_error_skipping_chunk: {}", e);
                None // Skip error, continue stream
            }
        })
    })
}
