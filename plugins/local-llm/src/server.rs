use std::net::{Ipv4Addr, SocketAddr};
use std::pin::Pin;
use std::sync::{Arc, Mutex};

use async_openai::types::{
    ChatChoice, ChatChoiceStream, ChatCompletionResponseMessage, ChatCompletionStreamResponseDelta,
    CreateChatCompletionRequest, CreateChatCompletionResponse, CreateChatCompletionStreamResponse,
    Role,
};
use axum::{
    extract::State as AxumState,
    http::StatusCode,
    response::{sse, IntoResponse, Json, Response},
    routing::{get, post},
    Router,
};

use futures_util::StreamExt;
use reqwest_streams::error::StreamBodyError;
use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;
use tower_http::cors::{self, CorsLayer};

use crate::ModelManager;
use typr_ai_retry::{AIProvider, RetryableAIClient};

#[derive(Clone)]
pub struct ServerHandle {
    pub addr: SocketAddr,
    pub shutdown: tokio::sync::watch::Sender<()>,
}

impl ServerHandle {
    pub fn shutdown(self) -> Result<(), tokio::sync::watch::error::SendError<()>> {
        self.shutdown.send(())
    }
}

#[derive(Clone)]
pub struct ServerState {
    pub model_manager: ModelManager,
    pub cancellation_tokens: Arc<Mutex<Vec<CancellationToken>>>,
}

impl ServerState {
    pub fn new(model_manager: ModelManager) -> Self {
        Self {
            model_manager,
            cancellation_tokens: Arc::new(Mutex::new(Vec::new())),
        }
    }

    pub fn cancel_all(&self) {
        if let Ok(tokens) = self.cancellation_tokens.lock() {
            for token in tokens.iter() {
                token.cancel();
            }
        }
    }

    fn register_token(&self, token: CancellationToken) {
        if let Ok(mut tokens) = self.cancellation_tokens.lock() {
            tokens.retain(|t| !t.is_cancelled());
            tokens.push(token);
        }
    }
}

pub async fn run_server(state: ServerState) -> Result<ServerHandle, crate::Error> {
    let app = Router::new()
        .route("/health", get(health))
        .route("/cancel", get(cancel))
        .route("/chat/completions", post(chat_completions))
        .with_state(state)
        .layer(
            CorsLayer::new()
                .allow_origin(cors::Any)
                .allow_methods(cors::Any)
                .allow_headers(cors::Any),
        );

    let listener =
        tokio::net::TcpListener::bind(SocketAddr::from((Ipv4Addr::LOCALHOST, 0))).await?;

    let server_addr = listener.local_addr()?;

    let (shutdown_tx, mut shutdown_rx) = tokio::sync::watch::channel(());

    let server_handle = ServerHandle {
        addr: server_addr,
        shutdown: shutdown_tx,
    };

    tokio::spawn(async move {
        axum::serve(listener, app)
            .with_graceful_shutdown(async move {
                shutdown_rx.changed().await.ok();
            })
            .await
            .unwrap();
    });

    tracing::info!("local_llm_server_started {}", server_addr);
    Ok(server_handle)
}

async fn health(AxumState(state): AxumState<ServerState>) -> impl IntoResponse {
    match state.model_manager.get_model().await {
        Ok(_) => (StatusCode::OK, "OK".to_string()),
        Err(e) => (StatusCode::SERVICE_UNAVAILABLE, e.to_string()),
    }
}

// Tauri SSE client disconnects don't propagate to Axum, so we can't use a drop guard.
async fn cancel(AxumState(state): AxumState<ServerState>) -> impl IntoResponse {
    tracing::info!("canceling_all");
    state.cancel_all();
    StatusCode::OK
}

async fn chat_completions(
    AxumState(state): AxumState<ServerState>,
    Json(request): Json<CreateChatCompletionRequest>,
) -> Result<Response, (StatusCode, String)> {
    let response = if request.model == "mock-onboarding" {
        let provider = MockProvider::default();
        tracing::debug!("🤖 AI: Using mock provider for onboarding");
        provider.chat_completions(request, &state).await
    } else {
        let provider = LocalProvider::new(state.model_manager.clone());
        tracing::debug!("🤖 AI: Using local LLM provider");

        // Only use retry logic for non-streaming requests
        if request.stream.unwrap_or(false) {
            // For streaming, use the original logic
            provider.chat_completions(request, &state).await
        } else {
            // For non-streaming, use retry logic
            let retry_client = RetryableAIClient::for_immediate_refusals(provider);

            match retry_client
                .chat_completion_with_retry(request.clone())
                .await
            {
                Ok(response) => {
                    tracing::debug!("🔄 AI: Retry mechanism succeeded");
                    Ok(ChatCompletionResponse::NonStream(response))
                }
                Err(retry_error) => {
                    tracing::error!("🔄 AI: Retry mechanism exhausted: {:?}", retry_error);
                    // Fall back to original method as last resort
                    let fallback_provider = LocalProvider::new(state.model_manager.clone());
                    fallback_provider.chat_completions(request, &state).await
                }
            }
        }
    };

    response
        .map(|r| r.into_response())
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}

/// Build a Gemma 4 formatted prompt string from OpenAI messages.
/// Gemma 4 uses <|turn>/<turn|> control tokens (not <start_of_turn>/<end_of_turn>).
/// We build this in Rust to avoid minijinja's limitations with `|` in Jinja string literals.
fn build_gemma4_prompt(messages: &[async_openai::types::ChatCompletionRequestMessage]) -> String {
    use async_openai::types::ChatCompletionRequestMessage as Msg;

    let mut prompt = String::new();

    for msg in messages {
        let (role, content) = match msg {
            Msg::System(s) => {
                let text = match &s.content {
                    async_openai::types::ChatCompletionRequestSystemMessageContent::Text(t) => {
                        t.as_str()
                    }
                    _ => "",
                };
                ("system", text.to_string())
            }
            Msg::User(u) => {
                let text = match &u.content {
                    async_openai::types::ChatCompletionRequestUserMessageContent::Text(t) => {
                        t.as_str()
                    }
                    _ => "",
                };
                ("user", text.to_string())
            }
            Msg::Assistant(a) => {
                let text = match &a.content {
                    Some(
                        async_openai::types::ChatCompletionRequestAssistantMessageContent::Text(t),
                    ) => t.as_str(),
                    _ => "",
                };
                ("model", text.to_string())
            }
            _ => continue,
        };

        prompt.push_str("<|turn>");
        prompt.push_str(role);
        prompt.push('\n');
        prompt.push_str(content.trim());
        prompt.push_str("<turn|>\n");
    }

    // Generation prompt — tell the model it's the model's turn to respond
    prompt.push_str("<|turn>model\n");
    prompt
}

struct LocalProvider {
    model_manager: ModelManager,
}

impl LocalProvider {
    fn new(model_manager: ModelManager) -> Self {
        Self { model_manager }
    }

    async fn chat_completions(
        &self,
        request: CreateChatCompletionRequest,
        state: &ServerState,
    ) -> Result<ChatCompletionResponse, crate::Error> {
        let start_time = std::time::Instant::now();
        let model = self.model_manager.get_model().await?;
        let message_count = request.messages.len();
        let prompt_chars: usize = request
            .messages
            .iter()
            .map(|msg| match msg {
                async_openai::types::ChatCompletionRequestMessage::System(sys_msg) => {
                    match &sys_msg.content {
                        async_openai::types::ChatCompletionRequestSystemMessageContent::Text(
                            text,
                        ) => text.len(),
                        _ => 0,
                    }
                }
                async_openai::types::ChatCompletionRequestMessage::User(user_msg) => {
                    match &user_msg.content {
                        async_openai::types::ChatCompletionRequestUserMessageContent::Text(
                            text,
                        ) => text.len(),
                        _ => 0,
                    }
                }
                async_openai::types::ChatCompletionRequestMessage::Assistant(asst_msg) => {
                    match &asst_msg.content {
                        Some(
                            async_openai::types::ChatCompletionRequestAssistantMessageContent::Text(
                                text,
                            ),
                        ) => text.len(),
                        _ => 0,
                    }
                }
                _ => 0,
            })
            .sum();

        tracing::info!(
            "[AI_REQUEST] model={:?} stream={} messages={} prompt_chars={}",
            model.name,
            request.stream.unwrap_or(false),
            message_count,
            prompt_chars,
        );

        // Process response
        let response = build_chat_completion_response(&request, || {
            let (stream, token) = Self::build_stream(&model, &request)?;
            state.register_token(token.clone());
            Ok(stream)
        })
        .await;

        // Log response analytics after completion
        if let Ok(ref resp) = response {
            let response_time = start_time.elapsed().as_millis();
            let response_type = match resp {
                ChatCompletionResponse::NonStream(_) => "non_stream",
                ChatCompletionResponse::Stream(_) => "stream",
            };
            tracing::info!(
                "[AI_RESPONSE] response_type={} setup_ms={}",
                response_type,
                response_time,
            );
        }

        response
    }

    fn build_stream(
        model: &typr_llama::Llama,
        request: &CreateChatCompletionRequest,
    ) -> Result<
        (
            Pin<Box<dyn futures_util::Stream<Item = StreamEvent> + Send>>,
            CancellationToken,
        ),
        crate::Error,
    > {
        let messages = request
            .messages
            .iter()
            .map(typr_llama::FromOpenAI::from_openai)
            .collect();

        let maybe_grammar = request
            .metadata
            .as_ref()
            .and_then(|v| v.get("grammar"))
            .and_then(|v| serde_json::from_value::<typr_gbnf::Grammar>(v.clone()).ok());

        // TODO: this is temporary hack to disable grammar for typr-llm
        let grammar = match maybe_grammar {
            None => None,
            Some(g) => {
                if model.name == typr_llama::ModelName::TyprLLM {
                    match &g {
                        typr_gbnf::Grammar::Enhance { sections: None } => None,
                        _ => Some(g.build()),
                    }
                } else {
                    Some(g.build())
                }
            }
        };

        #[allow(deprecated)]
        let max_output_tokens = request.max_completion_tokens.or(request.max_tokens);

        let request = typr_llama::LlamaRequest {
            messages,
            grammar,
            max_output_tokens,
            pre_formatted_prompt: if model.is_gemma4 {
                Some(build_gemma4_prompt(&request.messages))
            } else {
                None
            },
        };

        let (progress_sender, mut progress_receiver) = mpsc::unbounded_channel::<f64>();

        let (content_stream, cancellation_token) = model.generate_stream_with_callback(
            request,
            Box::new(move |v| {
                let _ = progress_sender.send(v);
            }),
        )?;

        let mixed_stream = async_stream::stream! {
            tokio::pin!(content_stream);

            loop {
                tokio::select! {
                    content_result = content_stream.next() => {
                        match content_result {
                            Some(content) => yield StreamEvent::Content(content),
                            None => break,
                        }
                    },
                    progress_result = progress_receiver.recv() => {
                        match progress_result {
                            Some(_) => yield StreamEvent::Progress,
                            None => {}
                        }
                    }
                }
            }
        };

        Ok((Box::pin(mixed_stream), cancellation_token))
    }
}

#[derive(Default)]
struct MockProvider {}

impl MockProvider {
    async fn chat_completions(
        &self,
        request: CreateChatCompletionRequest,
        state: &ServerState,
    ) -> Result<ChatCompletionResponse, crate::Error> {
        let content = crate::ONBOARDING_ENHANCED_MD;
        build_chat_completion_response(&request, || {
            let (stream, token) = Self::build_stream(&content);
            state.register_token(token.clone());
            Ok(stream)
        })
        .await
    }

    fn build_stream(
        content: impl AsRef<str>,
    ) -> (
        Pin<Box<dyn futures_util::Stream<Item = StreamEvent> + Send>>,
        CancellationToken,
    ) {
        use futures_util::stream::{self, StreamExt};
        use std::time::Duration;

        let chunk_size = 30;

        let chunks = content
            .as_ref()
            .chars()
            .collect::<Vec<_>>()
            .chunks(chunk_size)
            .map(|c| c.iter().collect::<String>())
            .collect::<Vec<_>>();

        let stream = Box::pin(stream::iter(chunks).then(|chunk| async move {
            tokio::time::sleep(Duration::from_millis(200)).await;
            StreamEvent::Content(chunk)
        }));

        let cancellation_token = CancellationToken::new();
        (stream, cancellation_token)
    }
}

#[derive(Debug, Clone)]
enum StreamEvent {
    Content(String),
    Progress,
}

async fn build_chat_completion_response(
    request: &CreateChatCompletionRequest,
    response_stream_fn: impl FnOnce() -> Result<
        Pin<Box<dyn futures_util::Stream<Item = StreamEvent> + Send>>,
        crate::Error,
    >,
) -> Result<ChatCompletionResponse, crate::Error> {
    let id = uuid::Uuid::new_v4().to_string();
    let created = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as u32;
    let model_name = request.model.clone();

    #[allow(deprecated)]
    let empty_message = ChatCompletionResponseMessage {
        content: None,
        refusal: None,
        tool_calls: None,
        role: Role::Assistant,
        audio: None,
        function_call: None,
    };

    let empty_choice = ChatChoice {
        message: empty_message.clone(),
        index: 0,
        finish_reason: None,
        logprobs: None,
    };

    let base_response_template = CreateChatCompletionResponse {
        id: id.clone(),
        choices: vec![],
        created,
        model: model_name.clone(),
        service_tier: None,
        system_fingerprint: None,
        object: "chat.completion".to_string(),
        usage: None,
    };

    let base_stream_response_template = CreateChatCompletionStreamResponse {
        id,
        choices: vec![],
        created,
        model: model_name,
        service_tier: None,
        system_fingerprint: None,
        object: "chat.completion.chunk".to_string(),
        usage: None,
    };

    #[allow(deprecated)]
    let empty_stream_response_delta = ChatCompletionStreamResponseDelta {
        content: None,
        function_call: None,
        tool_calls: None,
        role: None,
        refusal: None,
    };

    let is_stream = request.stream.unwrap_or(false);

    if !is_stream {
        let mut stream = response_stream_fn()?;
        let mut completion = String::new();

        while let Some(event) = futures_util::StreamExt::next(&mut stream).await {
            match event {
                StreamEvent::Content(chunk) => completion.push_str(&chunk),
                StreamEvent::Progress => {}
            }
        }

        let res = CreateChatCompletionResponse {
            choices: vec![ChatChoice {
                message: ChatCompletionResponseMessage {
                    content: Some(completion),
                    ..empty_message
                },
                ..empty_choice
            }],
            ..base_response_template
        };

        Ok(ChatCompletionResponse::NonStream(res))
    } else {
        let source_stream = response_stream_fn()?;
        let stream = Box::pin(source_stream.filter_map(move |event| {
            let delta_template = empty_stream_response_delta.clone();
            let response_template = base_stream_response_template.clone();

            async move {
                match event {
                    StreamEvent::Content(chunk) => Some(Ok(CreateChatCompletionStreamResponse {
                        choices: vec![ChatChoiceStream {
                            index: 0,
                            delta: ChatCompletionStreamResponseDelta {
                                content: Some(chunk),
                                ..delta_template
                            },
                            finish_reason: None,
                            logprobs: None,
                        }],
                        ..response_template
                    })),
                    StreamEvent::Progress => None,
                }
            }
        }));

        Ok(ChatCompletionResponse::Stream(stream))
    }
}

pub enum ChatCompletionResponse {
    Stream(
        futures_util::stream::BoxStream<
            'static,
            Result<CreateChatCompletionStreamResponse, StreamBodyError>,
        >,
    ),
    NonStream(CreateChatCompletionResponse),
}

impl IntoResponse for ChatCompletionResponse {
    fn into_response(self) -> Response {
        match self {
            ChatCompletionResponse::Stream(stream) => {
                let event_stream = stream.map(|result| {
                    result.map(|response| {
                        let data = serde_json::to_string(&response).unwrap_or_default();
                        sse::Event::default().data(data)
                    })
                });
                sse::Sse::new(event_stream).into_response()
            }
            ChatCompletionResponse::NonStream(response) => Json(response).into_response(),
        }
    }
}

impl AIProvider for LocalProvider {
    type Error = crate::Error;

    async fn chat_completion(
        &self,
        request: &CreateChatCompletionRequest,
    ) -> Result<CreateChatCompletionResponse, Self::Error> {
        // Call the existing chat_completions method but adapt it for the trait
        let state = ServerState {
            model_manager: self.model_manager.clone(),
            cancellation_tokens: Arc::new(Mutex::new(Vec::new())),
        };

        let result = self.chat_completions(request.clone(), &state).await?;

        match result {
            ChatCompletionResponse::NonStream(response) => Ok(response),
            ChatCompletionResponse::Stream(_) => {
                // For the retry mechanism, we need non-streaming responses
                // So we'll collect the stream into a single response
                Err(crate::Error::CustomError(
                    "Streaming responses not supported for retry mechanism".to_string(),
                ))
            }
        }
    }
}
