use std::sync::{Arc, OnceLock};

use llama_cpp_2::{
    context::params::LlamaContextParams,
    llama_backend::LlamaBackend,
    llama_batch::LlamaBatch,
    model::{params::LlamaModelParams, AddBos, LlamaChatTemplate, LlamaModel},
    sampling::LlamaSampler,
    send_logs_to_tracing, LogOptions,
};
use tokio_stream::wrappers::UnboundedReceiverStream;
use tokio_util::sync::CancellationToken;

use typr_gguf::GgufExt;

mod error;
mod types;

pub use error::*;
pub use types::*;

const DEFAULT_MAX_INPUT_TOKENS: u32 = 1024 * 16;
const DEFAULT_MAX_OUTPUT_TOKENS: u32 = 1024 * 2;
const MAX_OUTPUT_TOKENS: u32 = 1024 * 32;

static LLAMA_BACKEND: OnceLock<Arc<LlamaBackend>> = OnceLock::new();

#[derive(Debug, PartialEq, Eq)]
pub enum ModelName {
    TyprLLM,
    Other(Option<String>),
}

pub struct Llama {
    pub name: ModelName,
    /// True when the loaded model is Gemma 4; prompt is built in Rust instead of via minijinja.
    pub is_gemma4: bool,
    task_sender: tokio::sync::mpsc::UnboundedSender<Task>,
}

pub enum Task {
    Generate {
        request: LlamaRequest,
        response_sender: tokio::sync::mpsc::UnboundedSender<String>,
        callback: Box<dyn FnMut(f64) + Send + 'static>,
        cancellation_token: CancellationToken,
    },
}

/// Build a Gemma 4 formatted prompt string from (role, content) pairs.
/// Gemma 4 uses `<|turn>`/`<turn|>` control tokens.
/// The role `"assistant"` is automatically mapped to `"model"`.
pub fn format_gemma4_prompt(messages: &[(&str, &str)]) -> String {
    let mut prompt = String::new();
    for (role, content) in messages {
        let role = if *role == "assistant" { "model" } else { role };
        prompt.push_str("<|turn>");
        prompt.push_str(role);
        prompt.push('\n');
        prompt.push_str(content.trim());
        prompt.push_str("<turn|>\n");
    }
    prompt.push_str("<|turn>model\n");
    prompt
}

impl Llama {
    fn max_output_tokens(request: &LlamaRequest) -> u32 {
        request
            .max_output_tokens
            .unwrap_or(DEFAULT_MAX_OUTPUT_TOKENS)
            .clamp(1, MAX_OUTPUT_TOKENS)
    }

    fn get_backend() -> Arc<LlamaBackend> {
        LLAMA_BACKEND
            .get_or_init(|| {
                let backend = LlamaBackend::init().unwrap();
                Arc::new(backend)
            })
            .clone()
    }

    fn load_model(model_path: impl AsRef<std::path::Path>) -> Result<LlamaModel, crate::Error> {
        let backend = Self::get_backend();

        let full_gpu_layers: u32 = std::num::NonZeroU32::MAX.into();
        let cpu_only_layers: u32 = 0;

        let gpu_params = LlamaModelParams::default().with_n_gpu_layers(full_gpu_layers);

        match LlamaModel::load_from_file(&backend, &model_path, &gpu_params) {
            Ok(model) => Ok(model),
            Err(_) => {
                let params = LlamaModelParams::default().with_n_gpu_layers(cpu_only_layers);
                LlamaModel::load_from_file(&backend, model_path, &params).map_err(Into::into)
            }
        }
    }

    fn get_sampler(model: &LlamaModel, grammar: Option<&str>) -> LlamaSampler {
        let mut samplers = Vec::new();

        if let Some(grammar) = grammar {
            if let Ok(grammar_sampler) = LlamaSampler::grammar(model, grammar, "root") {
                samplers.push(grammar_sampler);
            }
        }

        {
            // Gemma 4 recommended params: temperature=1.0, top_p=0.95, top_k=64
            samplers.push(LlamaSampler::top_k(64));
            samplers.push(LlamaSampler::top_p(0.95, 1));
            samplers.push(LlamaSampler::temp(1.0));
            samplers.push(LlamaSampler::dist(1234)); // terminal: required to select a token
        }

        LlamaSampler::chain_simple(samplers)
    }

    fn process_prefill<'a>(
        model: &'a LlamaModel,
        backend: &'_ LlamaBackend,
        tpl: Option<&LlamaChatTemplate>,
        request: &LlamaRequest,
        mut callback: Box<dyn FnMut(f64) + Send + 'static>,
        _cancellation_token: CancellationToken,
    ) -> Result<(llama_cpp_2::context::LlamaContext<'a>, LlamaBatch<'a>, i32), crate::Error> {
        let prompt = if let Some(pre) = &request.pre_formatted_prompt {
            // Gemma 4 (and future models): prompt already formatted in Rust, bypass minijinja.
            tracing::info!("🔍 PREFILL: using pre_formatted_prompt");
            pre.clone()
        } else {
            let tpl = tpl.expect("tpl must be provided when pre_formatted_prompt is None");
            tracing::info!("🔍 PREFILL: template={:?}", tpl.to_str().unwrap_or("?"));
            model
                .apply_chat_template(tpl, &request.messages, true)
                .map_err(|e| {
                    tracing::error!("❌ PREFILL: apply_chat_template failed: {:?}", e);
                    e
                })
                .unwrap()
        };

        tracing::info!(
            "🔍 PREFILL: prompt_start={:?}",
            &prompt[..prompt.len().min(200)]
        );

        let mut tokens_list = model.str_to_token(&prompt, AddBos::Always).unwrap();
        tokens_list.truncate(DEFAULT_MAX_INPUT_TOKENS as usize);
        let input_tokens_len = tokens_list.len() as u32;
        let max_output_tokens = Self::max_output_tokens(request);

        let mut ctx = model
            .new_context(
                backend,
                LlamaContextParams::default()
                    .with_n_ctx(std::num::NonZeroU32::new(
                        input_tokens_len + max_output_tokens,
                    ))
                    .with_n_batch(input_tokens_len)
                    .with_embeddings(false)
                    .with_swa_full(false)
                    .with_flash_attention_policy(1),
            )
            .unwrap();

        let batch_size = tokens_list.len().max(512);
        let mut batch = LlamaBatch::new(batch_size, 1);

        let last_index = (tokens_list.len() - 1) as i32;
        for (i, token) in (0_i32..).zip(tokens_list.into_iter()) {
            let is_last = i == last_index;
            batch.add(token, i, &[0], is_last).unwrap();
        }

        ctx.decode(&mut batch).unwrap();
        tracing::info!(
            "🔍 PREFILL: decode ok, input_tokens={}, last_index={}",
            input_tokens_len,
            last_index
        );
        callback(1.0);

        Ok((ctx, batch, last_index))
    }

    fn process_generation<'a>(
        model: &LlamaModel,
        mut ctx: llama_cpp_2::context::LlamaContext<'a>,
        mut batch: LlamaBatch<'a>,
        last_index: i32,
        request: &LlamaRequest,
        response_sender: tokio::sync::mpsc::UnboundedSender<String>,
        cancellation_token: CancellationToken,
    ) {
        let mut n_cur = batch.n_tokens();
        let mut decoder = encoding_rs::UTF_8.new_decoder();
        let mut sampler = Self::get_sampler(model, request.grammar.as_deref());
        let mut token_count = 0;
        let max_output_tokens = Self::max_output_tokens(request);

        tracing::info!(
            "🔍 GENERATION: start n_cur={}, last_index={}, max={}",
            n_cur,
            last_index,
            last_index + max_output_tokens as i32
        );

        while n_cur <= last_index + max_output_tokens as i32 {
            if cancellation_token.is_cancelled() {
                break;
            }

            let token = sampler.sample(&ctx, batch.n_tokens() - 1);

            if model.is_eog_token(token) {
                tracing::info!(
                    "🔍 GENERATION: eog at n_cur={}, token_id={}, tokens_generated={}",
                    n_cur,
                    token.0,
                    token_count
                );
                break;
            }

            let output_string = model
                .token_to_piece(token, &mut decoder, false, None)
                .unwrap_or_default();

            if response_sender.send(output_string).is_err() {
                tracing::info!("🔍 GENERATION: receiver dropped at n_cur={}", n_cur);
                break;
            }

            token_count += 1;

            batch.clear();
            batch.add(token, n_cur, &[0], true).unwrap();

            n_cur += 1;
            ctx.decode(&mut batch).unwrap();
        }

        tracing::info!("🔍 GENERATION: done, tokens_generated={}", token_count);
        drop(response_sender);
    }

    fn setup_log() {
        send_logs_to_tracing(LogOptions::default().with_logs_enabled(false));
    }

    pub fn new(model_path: impl AsRef<std::path::Path>) -> Result<Self, crate::Error> {
        Self::setup_log();

        // DEBUG: Log the actual file path being loaded
        tracing::debug!(
            "🔧 SYSTEM: Loading model from path: {:?}",
            model_path.as_ref()
        );

        let fmt = model_path.gguf_chat_format()?.unwrap();
        let is_gemma4 = matches!(&fmt, typr_gguf::ChatTemplate::Gemma4Native);
        let tpl = if is_gemma4 {
            None
        } else {
            Some(LlamaChatTemplate::new(fmt.as_ref()).unwrap())
        };

        let backend = Self::get_backend();
        let model = Self::load_model(&model_path)?;
        let name = match model.meta_val_str("general.name") {
            Ok(name) if name == "typr-llm" => ModelName::TyprLLM,
            Ok(name) => ModelName::Other(Some(name.to_string())),
            Err(_) => ModelName::Other(None),
        };

        let (task_sender, mut task_receiver) = tokio::sync::mpsc::unbounded_channel::<Task>();

        std::thread::spawn({
            move || {
                while let Some(task) = task_receiver.blocking_recv() {
                    match task {
                        Task::Generate {
                            request,
                            response_sender,
                            callback,
                            cancellation_token,
                        } => {
                            match Self::process_prefill(
                                &model,
                                &backend,
                                tpl.as_ref(),
                                &request,
                                callback,
                                cancellation_token.clone(),
                            ) {
                                Ok((ctx, batch, last_index)) => {
                                    Self::process_generation(
                                        &model,
                                        ctx,
                                        batch,
                                        last_index,
                                        &request,
                                        response_sender,
                                        cancellation_token,
                                    );
                                }
                                Err(e) => {
                                    tracing::error!("Prefill failed: {:?}", e);
                                    drop(response_sender);
                                }
                            }
                        }
                    }
                }
            }
        });

        Ok(Self {
            name,
            is_gemma4,
            task_sender,
        })
    }

    pub fn generate_stream(
        &self,
        request: LlamaRequest,
    ) -> Result<impl futures_util::Stream<Item = String>, crate::Error> {
        let callback = Box::new(|_| {});
        let (stream, _cancellation_token) =
            self.generate_stream_with_callback(request, callback)?;
        Ok(stream)
    }

    pub fn generate_stream_with_callback(
        &self,
        request: LlamaRequest,
        callback: Box<dyn FnMut(f64) + Send + 'static>,
    ) -> Result<(impl futures_util::Stream<Item = String>, CancellationToken), crate::Error> {
        let (response_sender, response_receiver) = tokio::sync::mpsc::unbounded_channel::<String>();
        let cancellation_token = CancellationToken::new();

        let task = Task::Generate {
            request,
            response_sender,
            callback,
            cancellation_token: cancellation_token.clone(),
        };

        self.task_sender.send(task)?;
        let stream = UnboundedReceiverStream::new(response_receiver);

        Ok((stream, cancellation_token))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use futures_util::{pin_mut, StreamExt};

    async fn run(model: &Llama, request: LlamaRequest) -> String {
        let (stream, _cancellation_token) = model
            .generate_stream_with_callback(
                request,
                Box::new(|progress| println!("progress: {}", progress)),
            )
            .unwrap();
        pin_mut!(stream);

        let mut acc = String::new();

        while let Some(token) = stream.next().await {
            acc += &token;
        }

        acc
    }

    fn get_model() -> Llama {
        let model_path = dirs::data_dir()
            .unwrap()
            .join("com.typr.oss.dev")
            .join("ttt/typr-llm.gguf");

        Llama::new(model_path).unwrap()
    }

    #[test]
    fn test_tag() {
        assert!(typr_template::ENHANCE_USER_TPL.contains("<participants>"));
        assert!(typr_template::ENHANCE_USER_TPL.contains("<raw_note>"));
        assert!(typr_template::ENHANCE_USER_TPL.contains("<transcript>"));
    }

    fn get_request() -> LlamaRequest {
        LlamaRequest {
            grammar: Some(typr_gbnf::Grammar::Enhance { sections: None }.build()),
            max_output_tokens: None,
            messages: vec![
                LlamaChatMessage::new(
                    "system".into(),
                    "Summarize the text the user gives you.".into(),
                )
                .unwrap(),
                LlamaChatMessage::new("user".into(), typr_data::english_3::WORDS_JSON.repeat(1))
                    .unwrap(),
            ],
            pre_formatted_prompt: None,
        }
    }

    // cargo test test_english_3 -p llama -- --nocapture --ignored
    #[ignore]
    #[tokio::test]
    async fn test_english_3() {
        let llama = get_model();
        let request = get_request();

        run(&llama, request).await;
    }

    // cargo test test_cancel_generation -p llama -- --nocapture --ignored
    #[ignore]
    #[tokio::test]
    async fn test_cancel_generation() {
        let llama = get_model();
        let request = get_request();

        let (stream, cancellation_token) = llama
            .generate_stream_with_callback(
                request,
                Box::new(|progress| println!("progress: {}", progress)),
            )
            .unwrap();
        pin_mut!(stream);

        let mut acc = String::new();

        while let Some(token) = stream.next().await {
            acc += &token;

            if acc.len() > 3 {
                let token_clone = cancellation_token.clone();
                std::thread::spawn(move || {
                    token_clone.cancel();
                });
            }
        }
        assert!(acc.len() < 10);
    }

    // cargo test test_cancel_prefill -p llama -- --nocapture --ignored
    #[ignore]
    #[tokio::test]
    async fn test_cancel_prefill() {
        use std::sync::{Arc, Mutex};

        let llama = get_model();
        let request = get_request();

        let last_progress = Arc::new(Mutex::new(0.0));
        let last_progress_clone = last_progress.clone();

        let (_stream, cancellation_token) = llama
            .generate_stream_with_callback(
                request,
                Box::new(move |progress| {
                    println!("progress: {}", progress);
                    *last_progress_clone.lock().unwrap() = progress;
                }),
            )
            .unwrap();

        let token_clone = cancellation_token.clone();
        let handle = tokio::spawn(async move {
            tokio::time::sleep(tokio::time::Duration::from_millis(3000)).await;
            token_clone.cancel();
        });

        handle.await.unwrap();
        assert!(*last_progress.lock().unwrap() < 0.5);
    }
}
