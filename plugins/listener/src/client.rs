use std::collections::{HashMap, HashSet};
use std::pin::Pin;
use std::time::{Duration, Instant};

use futures_util::{Stream, StreamExt};
use tokio::sync::mpsc;

use typr_audio::AsyncSource;
use typr_audio_utils::AudioFormatExt;
use typr_ws::client::{ClientRequestBuilder, Message, WebSocketClient, WebSocketIO};

use crate::{ListenInputChunk, ListenOutputChunk, SttProvider};

// Typr's transcript editor appends durable words as they become immutable.
// Universal Streaming exposes that contract with per-word `word_is_final`.
// U3 Pro partials are provisional turn segments and need a replace-by-turn UI.
const ASSEMBLYAI_STREAMING_MODEL: &str = "universal-streaming-multilingual";
const ASSEMBLYAI_SAMPLE_RATE: u64 = 16_000;
const ASSEMBLYAI_BYTES_PER_SAMPLE: u64 = 2;
const ASSEMBLYAI_MIN_TURN_SILENCE_MS: &str = "160";
const ASSEMBLYAI_MAX_TURN_SILENCE_MS: &str = "800";
const ASSEMBLYAI_END_OF_TURN_CONFIDENCE_THRESHOLD: &str = "0.4";
const ASSEMBLYAI_ROLLOVER_AFTER: Duration = Duration::from_secs(2 * 60 * 60 + 45 * 60);
const ASSEMBLYAI_ROLLOVER_OVERLAP: Duration = Duration::from_secs(15);
const ASSEMBLYAI_ROLLOVER_RETRY_AFTER: Duration = Duration::from_secs(30);
const MAX_KEYTERMS_PROMPT_TERMS: usize = 100;
const MAX_KEYTERM_CHARS: usize = 50;

fn sanitized_keyterms(keyterms: &[String]) -> Vec<String> {
    let mut seen = std::collections::HashSet::new();
    let mut out = Vec::new();

    for term in keyterms {
        let normalized = term.replace(',', " ");
        let normalized = normalized.trim();
        if normalized.is_empty() {
            continue;
        }

        let normalized = normalized
            .split_whitespace()
            .collect::<Vec<_>>()
            .join(" ")
            .chars()
            .take(MAX_KEYTERM_CHARS)
            .collect::<String>();
        let dedupe_key = normalized.to_lowercase();

        if seen.insert(dedupe_key) {
            out.push(normalized);
            if out.len() == MAX_KEYTERMS_PROMPT_TERMS {
                break;
            }
        }
    }

    out
}

fn assemblyai_supports_keyterms(speech_model: &str) -> bool {
    matches!(
        speech_model,
        "u3-rt-pro" | "universal-streaming-multilingual" | "universal-streaming-english"
    )
}

fn authorization_header_value(provider: SttProvider, key: String) -> String {
    if provider.is_assemblyai() {
        key
    } else {
        format!("Bearer {}", key)
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct AssemblyAiAcceptanceRange {
    from_ms: u64,
    until_ms: Option<u64>,
}

impl AssemblyAiAcceptanceRange {
    fn pending() -> Self {
        Self {
            from_ms: u64::MAX,
            until_ms: None,
        }
    }

    fn from(from_ms: u64) -> Self {
        Self {
            from_ms,
            until_ms: None,
        }
    }
}

struct AssemblyAiSessionHandle {
    index: u64,
    tx: Option<mpsc::UnboundedSender<bytes::Bytes>>,
    started_at: Instant,
    connected_at: Option<Instant>,
}

impl AssemblyAiSessionHandle {
    fn send(&self, chunk: bytes::Bytes) -> bool {
        self.tx
            .as_ref()
            .map(|tx| tx.send(chunk).is_ok())
            .unwrap_or(false)
    }

    fn close(&mut self) {
        self.tx.take();
    }
}

enum AssemblyAiSessionEvent {
    Connected {
        index: u64,
    },
    Chunk {
        index: u64,
        chunk: ListenOutputChunk,
    },
    Failed {
        index: u64,
        error: typr_ws::Error,
    },
    Closed {
        index: u64,
    },
}

fn assemblyai_chunk_duration_ms(chunk: &bytes::Bytes) -> u64 {
    let samples = (chunk.len() as u64) / ASSEMBLYAI_BYTES_PER_SAMPLE;
    (samples * 1000) / ASSEMBLYAI_SAMPLE_RATE
}

fn offset_assemblyai_chunk_timestamps(
    chunk: &mut ListenOutputChunk,
    session_index: u64,
    session_started_audio_ms: u64,
) {
    for word in &mut chunk.words {
        word.start_ms = word
            .start_ms
            .map(|start_ms| start_ms + session_started_audio_ms);
        word.end_ms = word.end_ms.map(|end_ms| end_ms + session_started_audio_ms);
    }

    let meta = chunk.meta.get_or_insert_with(|| serde_json::json!({}));
    if let Some(obj) = meta.as_object_mut() {
        obj.insert(
            "aai_session_index".to_string(),
            serde_json::Value::from(session_index),
        );
        obj.insert(
            "aai_session_started_audio_ms".to_string(),
            serde_json::Value::from(session_started_audio_ms),
        );
    }
}

fn filter_assemblyai_chunk_by_acceptance(
    mut chunk: ListenOutputChunk,
    range: AssemblyAiAcceptanceRange,
) -> Option<ListenOutputChunk> {
    if range.from_ms == u64::MAX {
        return None;
    }

    chunk.words.retain(|word| {
        let timestamp = word.start_ms.or(word.end_ms);
        match timestamp {
            Some(ms) => {
                ms >= range.from_ms && range.until_ms.map(|until| ms < until).unwrap_or(true)
            }
            None => range.from_ms == 0 && range.until_ms.is_none(),
        }
    });

    (!chunk.words.is_empty()).then_some(chunk)
}

fn should_start_assemblyai_rollover(
    active: &AssemblyAiSessionHandle,
    has_next: bool,
    retry_after: Option<Instant>,
    now: Instant,
) -> bool {
    !has_next
        && now.duration_since(active.started_at) >= ASSEMBLYAI_ROLLOVER_AFTER
        && retry_after.map(|retry_at| now >= retry_at).unwrap_or(true)
}

fn cutover_to_next_assemblyai_session(
    active: &mut AssemblyAiSessionHandle,
    next: &mut Option<AssemblyAiSessionHandle>,
    acceptance: &mut HashMap<u64, AssemblyAiAcceptanceRange>,
    cutover_audio_ms: u64,
    channel_name: &str,
    reason: &str,
) {
    let Some(new_active) = next.take() else {
        return;
    };

    let mut old_active = std::mem::replace(active, new_active);
    old_active.close();

    acceptance
        .entry(old_active.index)
        .and_modify(|range| range.until_ms = Some(cutover_audio_ms))
        .or_insert(AssemblyAiAcceptanceRange {
            from_ms: 0,
            until_ms: Some(cutover_audio_ms),
        });
    acceptance.insert(
        active.index,
        AssemblyAiAcceptanceRange::from(cutover_audio_ms),
    );

    tracing::info!(
        "[AAI_{}] Rollover cutover old_session={} new_session={} cutover_audio_ms={} reason={}",
        channel_name,
        old_active.index,
        active.index,
        cutover_audio_ms,
        reason
    );
}

#[derive(Default)]
pub struct ListenClientBuilder {
    api_base: Option<String>,
    api_key: Option<String>,
    params: Option<typr_listener_interface::ListenParams>,
}

impl ListenClientBuilder {
    pub fn api_base(mut self, api_base: impl Into<String>) -> Self {
        self.api_base = Some(api_base.into());
        self
    }

    pub fn api_key(mut self, api_key: impl Into<String>) -> Self {
        self.api_key = Some(api_key.into());
        self
    }

    pub fn params(mut self, params: typr_listener_interface::ListenParams) -> Self {
        self.params = Some(params);
        self
    }

    fn build_uri(&self, audio_mode: typr_listener_interface::AudioMode) -> String {
        let params = typr_listener_interface::ListenParams {
            audio_mode,
            ..self.params.clone().unwrap_or_default()
        };

        let provider = SttProvider::from_model(params.model.as_deref());

        if provider.is_assemblyai() {
            let mut url = url::Url::parse("wss://streaming.assemblyai.com/v3/ws").unwrap();

            // AssemblyAI expects 16kHz audio, so cloud streams are resampled before sending.

            let mut query_pairs = url.query_pairs_mut();
            query_pairs
                .append_pair("sample_rate", "16000")
                .append_pair("speech_model", ASSEMBLYAI_STREAMING_MODEL)
                .append_pair(
                    "end_of_turn_confidence_threshold",
                    ASSEMBLYAI_END_OF_TURN_CONFIDENCE_THRESHOLD,
                )
                .append_pair("min_turn_silence", ASSEMBLYAI_MIN_TURN_SILENCE_MS)
                .append_pair("max_turn_silence", ASSEMBLYAI_MAX_TURN_SILENCE_MS);

            let keyterms = sanitized_keyterms(&params.keyterms_prompt);
            let keyterms_available_count = keyterms.len();
            let keyterms_forwarded_count =
                if assemblyai_supports_keyterms(ASSEMBLYAI_STREAMING_MODEL) {
                    keyterms_available_count
                } else {
                    0
                };
            if keyterms_forwarded_count > 0 {
                let keyterms_prompt =
                    serde_json::to_string(&keyterms[..keyterms_forwarded_count]).unwrap();
                query_pairs.append_pair("keyterms_prompt", &keyterms_prompt);
            }

            drop(query_pairs);

            tracing::info!(
                "[AAI_CONFIG] model={} selected_model={:?} audio_mode={:?} sample_rate=16000 end_of_turn_confidence_threshold={} min_turn_silence_ms={} max_turn_silence_ms={} keyterms_available_count={} keyterms_forwarded_count={}",
                ASSEMBLYAI_STREAMING_MODEL,
                params.model,
                params.audio_mode,
                ASSEMBLYAI_END_OF_TURN_CONFIDENCE_THRESHOLD,
                ASSEMBLYAI_MIN_TURN_SILENCE_MS,
                ASSEMBLYAI_MAX_TURN_SILENCE_MS,
                keyterms_available_count,
                keyterms_forwarded_count
            );
            url.to_string()
        } else {
            // Local server connection
            let mut url: url::Url = self.api_base.as_ref().unwrap().parse().unwrap();
            url.set_path("/api/desktop/listen/realtime");

            {
                let mut query_pairs = url.query_pairs_mut();

                for lang in &params.languages {
                    query_pairs.append_pair("languages", lang.iso639().code());
                }
                query_pairs
                    .append_pair("audio_mode", params.audio_mode.as_ref())
                    .append_pair("static_prompt", &params.static_prompt)
                    .append_pair("dynamic_prompt", &params.dynamic_prompt)
                    .append_pair("redemption_time_ms", &params.redemption_time_ms.to_string());

                if let Some(model) = &params.model {
                    query_pairs.append_pair("model", model);
                }
                if let Some(user_id) = &params.user_id {
                    query_pairs.append_pair("user_id", user_id);
                }
            }

            let host = url.host_str().unwrap();

            if host.contains("127.0.0.1") || host.contains("localhost") {
                url.set_scheme("ws").unwrap();
            } else {
                url.set_scheme("wss").unwrap();
            }

            url.to_string()
        }
    }

    pub fn build_single(self) -> ListenClient {
        let provider = SttProvider::from_model(
            self.params
                .as_ref()
                .and_then(|p| p.model.as_ref())
                .map(String::as_str),
        );
        let uri = self
            .build_uri(typr_listener_interface::AudioMode::Single)
            .parse()
            .unwrap();

        let request = match self.api_key {
            Some(key) => ClientRequestBuilder::new(uri)
                .with_header("Authorization", authorization_header_value(provider, key)),
            None => ClientRequestBuilder::new(uri),
        };

        ListenClient { request }
    }

    pub fn build_dual(self) -> ListenClientDual {
        let uri_string = self.build_uri(typr_listener_interface::AudioMode::Dual);

        let provider = SttProvider::from_model(
            self.params
                .as_ref()
                .and_then(|p| p.model.as_ref())
                .map(String::as_str),
        );

        let uri = uri_string.parse().unwrap();

        let request = match self.api_key {
            Some(key) => ClientRequestBuilder::new(uri)
                .with_header("Authorization", authorization_header_value(provider, key)),
            _ => ClientRequestBuilder::new(uri),
        };

        ListenClientDual { request, provider }
    }
}

#[derive(Clone)]
pub struct ListenClient {
    request: ClientRequestBuilder,
}

impl WebSocketIO for ListenClient {
    type Data = bytes::Bytes;
    type Input = ListenInputChunk;
    type Output = ListenOutputChunk;

    fn to_input(data: Self::Data) -> Self::Input {
        ListenInputChunk::Audio {
            data: data.to_vec(),
        }
    }

    fn to_message(input: Self::Input) -> Message {
        Message::Text(serde_json::to_string(&input).unwrap().into())
    }

    fn from_message(msg: Message) -> Option<Self::Output> {
        match msg {
            Message::Text(text) => serde_json::from_str::<Self::Output>(&text).ok(),
            _ => None,
        }
    }
}

#[derive(Clone)]
pub struct ListenClientDual {
    request: ClientRequestBuilder,
    provider: SttProvider,
}

impl WebSocketIO for ListenClientDual {
    type Data = (bytes::Bytes, bytes::Bytes);
    type Input = ListenInputChunk;
    type Output = ListenOutputChunk;

    fn to_input(data: Self::Data) -> Self::Input {
        ListenInputChunk::DualAudio {
            mic: data.0.to_vec(),
            speaker: data.1.to_vec(),
        }
    }

    fn to_message(input: Self::Input) -> Message {
        Message::Text(serde_json::to_string(&input).unwrap().into())
    }

    fn from_message(msg: Message) -> Option<Self::Output> {
        match msg {
            Message::Text(text) => serde_json::from_str::<Self::Output>(&text).ok(),
            _ => None,
        }
    }
}

// AssemblyAI single-channel client for dual stream architecture
// Each instance handles one audio source (mic OR speaker)
#[derive(Clone)]
pub struct ListenClientAssemblyAISingleChannel {
    request: ClientRequestBuilder,
    channel_name: String, // "mic" or "speaker"
    speaker_identity: typr_listener_interface::SpeakerIdentity, // "You" or "Speaker 1"
}

// WebSocketIO implementation for single-channel streaming
impl WebSocketIO for ListenClientAssemblyAISingleChannel {
    type Data = bytes::Bytes;
    type Input = bytes::Bytes;
    type Output = ListenOutputChunk;

    fn to_input(data: Self::Data) -> Self::Input {
        data // Pass through - already single channel
    }

    fn to_message(input: Self::Input) -> Message {
        Message::Binary(input)
    }

    fn keepalive_message() -> Option<Message> {
        None
    }

    fn shutdown_message() -> Option<Message> {
        Some(Message::Text(r#"{"type":"Terminate"}"#.into()))
    }

    fn from_message(msg: Message) -> Option<Self::Output> {
        match msg {
            Message::Text(text) => {
                // Parse AssemblyAI JSON format
                #[derive(serde::Deserialize)]
                struct AssemblyAIResponse {
                    turn_order: u32, // Which turn this belongs to
                    end_of_turn: Option<bool>,
                    transcript: Option<String>,
                    words: Option<Vec<AssemblyAIWord>>,
                }

                #[derive(serde::Deserialize)]
                struct AssemblyAIWord {
                    text: String,
                    start: Option<u64>,
                    end: Option<u64>,
                    confidence: Option<f64>,
                    word_is_final: Option<bool>,
                }

                let value = match serde_json::from_str::<serde_json::Value>(&text) {
                    Ok(value) => value,
                    Err(error) => {
                        tracing::warn!("[AAI_CHANNEL] Invalid JSON text message: {:?}", error);
                        return None;
                    }
                };

                let msg_type = value
                    .get("type")
                    .and_then(serde_json::Value::as_str)
                    .unwrap_or("unknown");

                // Skip non-Turn messages (Begin, Termination, etc.)
                if msg_type != "Turn" {
                    if msg_type == "Error" {
                        tracing::warn!("[AAI_CHANNEL] Error message from AssemblyAI: {}", value);
                    } else {
                        tracing::debug!("[AAI_CHANNEL] Ignoring AssemblyAI {} message", msg_type);
                    }
                    return None;
                }

                let response: AssemblyAIResponse = serde_json::from_value(value).ok()?;

                // Universal Streaming marks immutable words inside non-final turns.
                // Commit only those finalized words so live transcript text advances
                // during speech without displaying revisable partial tails.
                let turn_order = response.turn_order;
                let is_final = response.end_of_turn.unwrap_or(false);

                // Prefer structured word payload when available.
                // Fallback to transcript tokenization only if the backend omits words.
                let words: Vec<typr_listener_interface::Word> =
                    if let Some(word_list) = response.words {
                        word_list
                            .into_iter()
                            .filter(|word| word.word_is_final.unwrap_or(true))
                            .map(|word| typr_listener_interface::Word {
                                text: word.text,
                                speaker: None, // Will be set by the channel-specific client
                                confidence: word.confidence.map(|c| c as f32),
                                start_ms: word.start,
                                end_ms: word.end,
                            })
                            .collect()
                    } else {
                        response
                            .transcript
                            .unwrap_or_default()
                            .split_whitespace()
                            .map(|w| typr_listener_interface::Word {
                                text: w.to_string(),
                                speaker: None, // Will be set by the channel-specific client
                                confidence: None,
                                start_ms: None,
                                end_ms: None,
                            })
                            .collect()
                    };

                if !words.is_empty() {
                    tracing::debug!(
                        "[AAI_CHANNEL] turn_order={} words={} end_of_turn={} (real-time)",
                        turn_order,
                        words.len(),
                        is_final
                    );
                } else {
                    return None;
                }

                // Pack turn_order into metadata
                let meta = Some(serde_json::json!({
                    "turn_order": turn_order,
                    "end_of_turn": is_final,
                }));

                Some(ListenOutputChunk { words, meta })
            }
            _ => None,
        }
    }
}

impl ListenClientAssemblyAISingleChannel {
    pub fn new(
        request: ClientRequestBuilder,
        channel_name: impl Into<String>,
        speaker_identity: typr_listener_interface::SpeakerIdentity,
    ) -> Self {
        Self {
            request,
            channel_name: channel_name.into(),
            speaker_identity,
        }
    }

    fn spawn_session(
        &self,
        session_index: u64,
        session_started_audio_ms: u64,
        events_tx: mpsc::UnboundedSender<AssemblyAiSessionEvent>,
    ) -> AssemblyAiSessionHandle {
        let (audio_tx, mut audio_rx) = mpsc::unbounded_channel::<bytes::Bytes>();
        let request = self.request.clone();
        let channel_name = self.channel_name.clone();
        let started_at = Instant::now();

        tokio::spawn(async move {
            let audio_stream: Pin<Box<dyn Stream<Item = bytes::Bytes> + Send>> =
                Box::pin(async_stream::stream! {
                    while let Some(chunk) = audio_rx.recv().await {
                        yield chunk;
                    }
                });

            let ws = WebSocketClient::new(request);
            match ws
                .from_audio::<ListenClientAssemblyAISingleChannel>(audio_stream)
                .await
            {
                Ok(stream) => {
                    let _ = events_tx.send(AssemblyAiSessionEvent::Connected {
                        index: session_index,
                    });
                    futures_util::pin_mut!(stream);

                    while let Some(mut chunk) = stream.next().await {
                        offset_assemblyai_chunk_timestamps(
                            &mut chunk,
                            session_index,
                            session_started_audio_ms,
                        );

                        if events_tx
                            .send(AssemblyAiSessionEvent::Chunk {
                                index: session_index,
                                chunk,
                            })
                            .is_err()
                        {
                            break;
                        }
                    }
                }
                Err(error) => {
                    let _ = events_tx.send(AssemblyAiSessionEvent::Failed {
                        index: session_index,
                        error,
                    });
                }
            }

            tracing::info!("[AAI_{}] Session {} closed", channel_name, session_index);
            let _ = events_tx.send(AssemblyAiSessionEvent::Closed {
                index: session_index,
            });
        });

        AssemblyAiSessionHandle {
            index: session_index,
            tx: Some(audio_tx),
            started_at,
            connected_at: None,
        }
    }

    pub async fn from_realtime_audio(
        &self,
        audio_stream: impl Stream<Item = bytes::Bytes> + Send + Unpin + 'static,
    ) -> Result<Pin<Box<dyn Stream<Item = ListenOutputChunk> + Send>>, typr_ws::Error> {
        let speaker_id = self.speaker_identity.clone();
        let channel_name = self.channel_name.clone();
        let channel_id = match &speaker_id {
            typr_listener_interface::SpeakerIdentity::Assigned { id, .. } => id.clone(),
            _ => "unknown".to_string(),
        };
        let (events_tx, mut events_rx) = mpsc::unbounded_channel::<AssemblyAiSessionEvent>();
        let mut active = self.spawn_session(0, 0, events_tx.clone());

        loop {
            match events_rx.recv().await {
                Some(AssemblyAiSessionEvent::Connected { index }) if index == active.index => {
                    active.connected_at = Some(Instant::now());
                    break;
                }
                Some(AssemblyAiSessionEvent::Failed { index, error }) if index == active.index => {
                    return Err(error);
                }
                Some(AssemblyAiSessionEvent::Closed { index }) if index == active.index => {
                    return Err(typr_ws::Error::Unknown);
                }
                Some(_) => continue,
                None => return Err(typr_ws::Error::Unknown),
            }
        }

        let client = self.clone();
        let stream = async_stream::stream! {
            let mut audio_stream = audio_stream;
            let mut active = active;
            let mut next: Option<AssemblyAiSessionHandle> = None;
            let mut next_session_index = 1_u64;
            let mut input_closed = false;
            let mut meeting_audio_ms = 0_u64;
            let mut retry_after: Option<Instant> = None;
            let mut open_sessions = HashSet::from([active.index]);
            let mut acceptance = HashMap::from([(
                active.index,
                AssemblyAiAcceptanceRange::from(0),
            )]);
            let mut rollover_tick = tokio::time::interval(Duration::from_secs(1));
            rollover_tick.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);

            tracing::info!(
                "[AAI_{}] Session {} active; rollover_after_s={} overlap_s={}",
                channel_name,
                active.index,
                ASSEMBLYAI_ROLLOVER_AFTER.as_secs(),
                ASSEMBLYAI_ROLLOVER_OVERLAP.as_secs()
            );

            loop {
                if input_closed && open_sessions.is_empty() {
                    break;
                }

                tokio::select! {
                    maybe_chunk = audio_stream.next(), if !input_closed => {
                        let Some(chunk) = maybe_chunk else {
                            input_closed = true;
                            active.close();
                            if let Some(next) = next.as_mut() {
                                next.close();
                            }
                            continue;
                        };

                        let now = Instant::now();
                        if should_start_assemblyai_rollover(
                            &active,
                            next.is_some(),
                            retry_after,
                            now,
                        ) {
                            let handle = client.spawn_session(
                                next_session_index,
                                meeting_audio_ms,
                                events_tx.clone(),
                            );
                            tracing::info!(
                                "[AAI_{}] Starting rollover session {} at audio_ms={}",
                                channel_name,
                                handle.index,
                                meeting_audio_ms
                            );
                            acceptance.insert(handle.index, AssemblyAiAcceptanceRange::pending());
                            open_sessions.insert(handle.index);
                            next = Some(handle);
                            next_session_index += 1;
                            retry_after = None;
                        }

                        let chunk_duration_ms = assemblyai_chunk_duration_ms(&chunk);
                        if !active.send(chunk.clone()) {
                            tracing::warn!(
                                "[AAI_{}] Active session {} no longer accepts audio",
                                channel_name,
                                active.index
                            );
                        }
                        if let Some(next) = next.as_ref() {
                            let _ = next.send(chunk.clone());
                        }
                        meeting_audio_ms = meeting_audio_ms.saturating_add(chunk_duration_ms);
                    }
                    maybe_event = events_rx.recv() => {
                        let Some(event) = maybe_event else {
                            break;
                        };

                        match event {
                            AssemblyAiSessionEvent::Connected { index } => {
                                let now = Instant::now();
                                if index == active.index {
                                    active.connected_at = Some(now);
                                } else if let Some(next_handle) = next.as_mut().filter(|handle| handle.index == index) {
                                    next_handle.connected_at = Some(now);
                                    tracing::info!(
                                        "[AAI_{}] Rollover session {} connected",
                                        channel_name,
                                        index
                                    );
                                }
                            }
                            AssemblyAiSessionEvent::Chunk { index, mut chunk } => {
                                if let Some(next_handle) = next.as_ref().filter(|handle| handle.index == index) {
                                    let reason = if next_handle.connected_at.is_some() {
                                        "first_turn"
                                    } else {
                                        "first_turn_before_connected_event"
                                    };
                                    cutover_to_next_assemblyai_session(
                                        &mut active,
                                        &mut next,
                                        &mut acceptance,
                                        meeting_audio_ms,
                                        &channel_name,
                                        reason,
                                    );
                                }

                                for word in &mut chunk.words {
                                    word.speaker = Some(speaker_id.clone());
                                }

                                let meta = chunk.meta.get_or_insert_with(|| serde_json::json!({}));
                                if let Some(obj) = meta.as_object_mut() {
                                    obj.insert(
                                        "channel_id".to_string(),
                                        serde_json::Value::String(channel_id.clone()),
                                    );
                                    obj.insert(
                                        "source_channel".to_string(),
                                        serde_json::Value::String(channel_name.to_lowercase()),
                                    );
                                }

                                let Some(range) = acceptance.get(&index).copied() else {
                                    continue;
                                };
                                let Some(chunk) = filter_assemblyai_chunk_by_acceptance(chunk, range) else {
                                    continue;
                                };

                                tracing::info!(
                                    "[AAI_{}] Emitting {} words from session {}",
                                    channel_name,
                                    chunk.words.len(),
                                    index
                                );
                                yield chunk;
                            }
                            AssemblyAiSessionEvent::Failed { index, error } => {
                                if next.as_ref().map(|handle| handle.index) == Some(index) {
                                    tracing::warn!(
                                        "[AAI_{}] Rollover session {} failed; keeping active session {}: {:?}",
                                        channel_name,
                                        index,
                                        active.index,
                                        error
                                    );
                                    if let Some(mut next_handle) = next.take() {
                                        next_handle.close();
                                    }
                                    acceptance.remove(&index);
                                    retry_after = Some(Instant::now() + ASSEMBLYAI_ROLLOVER_RETRY_AFTER);
                                } else if index == active.index {
                                    tracing::error!(
                                        "[AAI_{}] Active session {} failed: {:?}",
                                        channel_name,
                                        index,
                                        error
                                    );
                                    if next.is_some() {
                                        cutover_to_next_assemblyai_session(
                                            &mut active,
                                            &mut next,
                                            &mut acceptance,
                                            meeting_audio_ms,
                                            &channel_name,
                                            "active_failed",
                                        );
                                    } else {
                                        input_closed = true;
                                    }
                                }
                            }
                            AssemblyAiSessionEvent::Closed { index } => {
                                open_sessions.remove(&index);
                                if next.as_ref().map(|handle| handle.index) == Some(index) {
                                    next = None;
                                    acceptance.remove(&index);
                                    retry_after = Some(Instant::now() + ASSEMBLYAI_ROLLOVER_RETRY_AFTER);
                                }
                                if index == active.index && !input_closed {
                                    tracing::warn!(
                                        "[AAI_{}] Active session {} closed while input is still open",
                                        channel_name,
                                        index
                                    );
                                    if next.is_none() {
                                        input_closed = true;
                                    }
                                }
                            }
                        }
                    }
                    _ = rollover_tick.tick(), if !input_closed => {
                        let now = Instant::now();
                        if should_start_assemblyai_rollover(
                            &active,
                            next.is_some(),
                            retry_after,
                            now,
                        ) {
                            let handle = client.spawn_session(
                                next_session_index,
                                meeting_audio_ms,
                                events_tx.clone(),
                            );
                            tracing::info!(
                                "[AAI_{}] Starting rollover session {} at audio_ms={}",
                                channel_name,
                                handle.index,
                                meeting_audio_ms
                            );
                            acceptance.insert(handle.index, AssemblyAiAcceptanceRange::pending());
                            open_sessions.insert(handle.index);
                            next = Some(handle);
                            next_session_index += 1;
                            retry_after = None;
                        }

                        if let Some(next_handle) = next.as_ref() {
                            if let Some(connected_at) = next_handle.connected_at {
                                if now.duration_since(connected_at) >= ASSEMBLYAI_ROLLOVER_OVERLAP {
                                    cutover_to_next_assemblyai_session(
                                        &mut active,
                                        &mut next,
                                        &mut acceptance,
                                        meeting_audio_ms,
                                        &channel_name,
                                        "overlap_elapsed",
                                    );
                                }
                            }
                        }
                    }
                }
            }
        };

        Ok(Box::pin(stream))
    }
}

impl ListenClient {
    pub fn builder() -> ListenClientBuilder {
        ListenClientBuilder::default()
    }

    pub async fn from_realtime_audio(
        &self,
        audio_stream: impl AsyncSource + Send + Unpin + 'static,
    ) -> Result<impl Stream<Item = ListenOutputChunk>, typr_ws::Error> {
        let input_stream = audio_stream.to_i16_le_chunks(16 * 1000, 1024);
        let ws = WebSocketClient::new(self.request.clone());
        ws.from_audio::<Self>(input_stream).await
    }
}

impl ListenClientDual {
    pub async fn from_realtime_audio(
        &self,
        mic_stream: impl Stream<Item = bytes::Bytes> + Send + Unpin + 'static,
        speaker_stream: impl Stream<Item = bytes::Bytes> + Send + Unpin + 'static,
    ) -> Result<std::pin::Pin<Box<dyn Stream<Item = ListenOutputChunk> + Send>>, typr_ws::Error>
    {
        let dual_stream = mic_stream.zip(speaker_stream);

        if self.provider.is_assemblyai() {
            tracing::info!("[AAI] Using AssemblyAI with dual stream architecture (2 WebSockets)");

            // Create separate clients for mic and speaker
            let mic_client = ListenClientAssemblyAISingleChannel::new(
                self.request.clone(),
                "MIC",
                typr_listener_interface::SpeakerIdentity::Assigned {
                    id: "you".to_string(),
                    label: "You".to_string(),
                },
            );

            let speaker_client = ListenClientAssemblyAISingleChannel::new(
                self.request.clone(),
                "SPEAKER",
                typr_listener_interface::SpeakerIdentity::Assigned {
                    id: "speaker_1".to_string(),
                    label: "Speaker 1".to_string(),
                },
            );

            // Split the zipped stream into separate mic and speaker streams.
            // Bounded channels preserve realtime pacing if a cloud socket is still connecting.
            let (mic_tx, mic_rx) = tokio::sync::mpsc::channel(20);
            let (speaker_tx, speaker_rx) = tokio::sync::mpsc::channel(20);

            // Spawn task to split incoming audio
            tokio::spawn(async move {
                let mut dual_stream = dual_stream;
                while let Some((mic_chunk, speaker_chunk)) = dual_stream.next().await {
                    if mic_tx.send(mic_chunk).await.is_err() {
                        break;
                    }
                    if speaker_tx.send(speaker_chunk).await.is_err() {
                        break;
                    }
                }
            });

            // Convert receivers to streams using async_stream
            let mut mic_rx = mic_rx;
            let mut speaker_rx = speaker_rx;

            let mic_stream: Pin<Box<dyn Stream<Item = bytes::Bytes> + Send>> =
                Box::pin(async_stream::stream! {
                    while let Some(chunk) = mic_rx.recv().await {
                        yield chunk;
                    }
                });
            let speaker_stream: Pin<Box<dyn Stream<Item = bytes::Bytes> + Send>> =
                Box::pin(async_stream::stream! {
                    while let Some(chunk) = speaker_rx.recv().await {
                        yield chunk;
                    }
                });

            let (output_tx, mut output_rx) = tokio::sync::mpsc::unbounded_channel();

            for (label, client, stream) in [
                ("MIC", mic_client, mic_stream),
                ("SPEAKER", speaker_client, speaker_stream),
            ] {
                let output_tx = output_tx.clone();

                tokio::spawn(async move {
                    match client.from_realtime_audio(stream).await {
                        Ok(transcript_stream) => {
                            futures_util::pin_mut!(transcript_stream);
                            while let Some(chunk) = transcript_stream.next().await {
                                if output_tx.send(chunk).is_err() {
                                    break;
                                }
                            }
                        }
                        Err(error) => {
                            tracing::warn!(
                                "[AAI_{}] Channel stream failed during startup: {:?}",
                                label,
                                error
                            );
                        }
                    }
                });
            }

            drop(output_tx);

            let merged = async_stream::stream! {
                while let Some(chunk) = output_rx.recv().await {
                    yield chunk;
                }
            };

            Ok(Box::pin(merged))
        } else {
            // Original simple local STT path (restored to working state)
            let ws = WebSocketClient::new(self.request.clone());
            let stream = ws.from_audio::<Self>(dual_stream).await?;
            Ok(Box::pin(stream))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use futures_util::StreamExt;

    #[test]
    fn assemblyai_url_includes_json_array_keyterms_when_present() {
        let url = ListenClient::builder()
            .api_base("http://127.0.0.1:1234")
            .params(typr_listener_interface::ListenParams {
                model: Some("assemblyai-universal".to_string()),
                keyterms_prompt: vec![
                    " Typr ".to_string(),
                    "typr".to_string(),
                    "ACME   Labs".to_string(),
                    "".to_string(),
                ],
                ..Default::default()
            })
            .build_uri(typr_listener_interface::AudioMode::Dual);

        let url = url::Url::parse(&url).unwrap();
        let keyterms = url
            .query_pairs()
            .filter_map(|(key, value)| (key == "keyterms_prompt").then(|| value.into_owned()))
            .collect::<Vec<_>>();

        assert_eq!(keyterms, vec![r#"["Typr","ACME Labs"]"#]);
    }

    #[test]
    fn assemblyai_url_uses_universal_streaming_live_parameters() {
        let url = ListenClient::builder()
            .api_base("http://127.0.0.1:1234")
            .params(typr_listener_interface::ListenParams {
                model: Some("assemblyai-universal".to_string()),
                ..Default::default()
            })
            .build_uri(typr_listener_interface::AudioMode::Dual);

        let url = url::Url::parse(&url).unwrap();
        let params = url.query_pairs().collect::<HashMap<_, _>>();

        assert_eq!(
            params.get("speech_model").map(|value| value.as_ref()),
            Some("universal-streaming-multilingual")
        );
        assert_eq!(
            params
                .get("end_of_turn_confidence_threshold")
                .map(|value| value.as_ref()),
            Some(ASSEMBLYAI_END_OF_TURN_CONFIDENCE_THRESHOLD)
        );
        assert_eq!(
            params.get("min_turn_silence").map(|value| value.as_ref()),
            Some(ASSEMBLYAI_MIN_TURN_SILENCE_MS)
        );
        assert_eq!(
            params.get("max_turn_silence").map(|value| value.as_ref()),
            Some(ASSEMBLYAI_MAX_TURN_SILENCE_MS)
        );
        assert!(!params.contains_key("include_partial_turns"));
        assert!(!params.contains_key("continuous_partials"));
        assert!(!params.contains_key("encoding"));
        assert!(!params.contains_key("language"));
        assert!(!params.contains_key("format_turns"));
    }

    #[test]
    fn assemblyai_url_omits_empty_keyterms() {
        let url = ListenClient::builder()
            .api_base("http://127.0.0.1:1234")
            .params(typr_listener_interface::ListenParams {
                model: Some("assemblyai-universal".to_string()),
                keyterms_prompt: vec![" ".to_string()],
                ..Default::default()
            })
            .build_uri(typr_listener_interface::AudioMode::Dual);

        let url = url::Url::parse(&url).unwrap();
        assert!(!url.query_pairs().any(|(key, _)| key == "keyterms_prompt"));
    }

    #[test]
    fn assemblyai_partial_turn_emits_only_finalized_words() {
        let output =
            <ListenClientAssemblyAISingleChannel as WebSocketIO>::from_message(Message::Text(
                serde_json::json!({
                    "type": "Turn",
                    "turn_order": 0,
                    "end_of_turn": false,
                    "transcript": "Hello there—",
                    "words": [
                        {
                            "text": "Hello",
                            "start": 100,
                            "end": 300,
                            "confidence": 0.9,
                            "word_is_final": true
                        },
                        {
                            "text": "there—",
                            "start": 320,
                            "end": 600,
                            "confidence": 0.8,
                            "word_is_final": false
                        }
                    ]
                })
                .to_string()
                .into(),
            ));

        let output = output.unwrap();
        assert_eq!(output.words.len(), 1);
        assert_eq!(output.words[0].text, "Hello");
        assert_eq!(output.meta.as_ref().unwrap()["end_of_turn"], false);
    }

    #[test]
    fn keyterms_sanitization_preserves_acronyms_and_normalizes_commas() {
        assert_eq!(
            sanitized_keyterms(&[
                "Granola.ai".to_string(),
                "U.S.A.".to_string(),
                "ACME, Inc.".to_string(),
                "acme inc.".to_string(),
            ]),
            vec!["Granola.ai", "U.S.A.", "ACME Inc."]
        );
    }

    #[test]
    fn keyterms_sanitization_caps_provider_limit() {
        let input = (0..(MAX_KEYTERMS_PROMPT_TERMS + 1))
            .map(|i| format!("Term {}", i))
            .collect::<Vec<_>>();

        assert_eq!(sanitized_keyterms(&input).len(), MAX_KEYTERMS_PROMPT_TERMS);
    }

    #[test]
    fn keyterms_sanitization_caps_term_length() {
        let long_term = "a".repeat(MAX_KEYTERM_CHARS + 1);

        assert_eq!(
            sanitized_keyterms(&[long_term])[0].chars().count(),
            MAX_KEYTERM_CHARS
        );
    }

    #[test]
    fn assemblyai_rollover_offsets_session_relative_word_timestamps() {
        let mut chunk = ListenOutputChunk {
            meta: Some(serde_json::json!({ "turn_order": 0, "end_of_turn": true })),
            words: vec![typr_listener_interface::Word {
                text: "hello".to_string(),
                speaker: None,
                confidence: Some(0.9),
                start_ms: Some(100),
                end_ms: Some(240),
            }],
        };

        offset_assemblyai_chunk_timestamps(&mut chunk, 2, 10_000);

        assert_eq!(chunk.words[0].start_ms, Some(10_100));
        assert_eq!(chunk.words[0].end_ms, Some(10_240));
        assert_eq!(chunk.meta.as_ref().unwrap()["aai_session_index"], 2);
        assert_eq!(
            chunk.meta.as_ref().unwrap()["aai_session_started_audio_ms"],
            10_000
        );
    }

    #[test]
    fn assemblyai_rollover_filters_overlap_by_meeting_timestamp() {
        let chunk = ListenOutputChunk {
            meta: Some(serde_json::json!({ "turn_order": 0, "end_of_turn": true })),
            words: vec![
                typr_listener_interface::Word {
                    text: "old".to_string(),
                    speaker: None,
                    confidence: None,
                    start_ms: Some(9_950),
                    end_ms: Some(10_010),
                },
                typr_listener_interface::Word {
                    text: "new".to_string(),
                    speaker: None,
                    confidence: None,
                    start_ms: Some(10_050),
                    end_ms: Some(10_120),
                },
            ],
        };

        let filtered =
            filter_assemblyai_chunk_by_acceptance(chunk, AssemblyAiAcceptanceRange::from(10_000))
                .unwrap();

        assert_eq!(filtered.words.len(), 1);
        assert_eq!(filtered.words[0].text, "new");
    }

    #[tokio::test]
    #[ignore]
    async fn test_listen_client() {
        let audio = rodio::Decoder::new(std::io::BufReader::new(
            std::fs::File::open(typr_data::english_1::AUDIO_PATH).unwrap(),
        ))
        .unwrap();

        let client = ListenClient::builder()
            .api_base("http://127.0.0.1:1234")
            .api_key("".to_string())
            .params(typr_listener_interface::ListenParams {
                languages: vec![typr_language::ISO639::En.into()],
                ..Default::default()
            })
            .build_single();

        let stream = client.from_realtime_audio(audio).await.unwrap();
        futures_util::pin_mut!(stream);

        while let Some(result) = stream.next().await {
            println!("{:?}", result);
        }
    }
}
