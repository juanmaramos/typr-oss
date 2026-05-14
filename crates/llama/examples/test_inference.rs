/// Standalone inference tester — no Tauri, no app, just the model.
///
/// Usage:
///   cargo run -p llama --example test_inference -- /path/to/model.gguf "your prompt"
///
/// Example:
///   cargo run -p llama --example test_inference -- \
///     ~/Library/Application\ Support/com.typr.dev/models/gemma-4-E4B-it-Q4_K_M.gguf \
///     "say hi in 3 words"
use futures_util::StreamExt;
use llama::{LlamaChatMessage, LlamaRequest};

fn main() {
    // Simple tracing to stdout so we see the 🔍 PREFILL logs
    tracing_subscriber::fmt()
        .with_max_level(tracing::Level::INFO)
        .with_target(false)
        .with_thread_names(true)
        .init();

    let args: Vec<String> = std::env::args().collect();
    let model_path = args
        .get(1)
        .expect("Usage: test_inference <model_path> [prompt]");
    let prompt = args
        .get(2)
        .cloned()
        .unwrap_or_else(|| "say hi in 3 words".to_string());

    println!("\n=== Loading model: {model_path} ===\n");

    let llama = match llama::Llama::new(model_path) {
        Ok(m) => m,
        Err(e) => {
            eprintln!("❌ Failed to load model: {:?}", e);
            std::process::exit(1);
        }
    };

    println!(
        "\n=== Model loaded: {:?} (is_gemma4={}) ===",
        llama.name, llama.is_gemma4
    );
    println!("=== Prompt: {:?} ===\n", prompt);

    // Build pre_formatted_prompt for Gemma 4 (bypasses minijinja)
    let pre_formatted_prompt = if llama.is_gemma4 {
        Some(llama::format_gemma4_prompt(&[("user", prompt.as_str())]))
    } else {
        None
    };

    let messages = vec![LlamaChatMessage::new("user".to_string(), prompt.clone()).unwrap()];
    let request = LlamaRequest {
        messages,
        grammar: None,
        max_output_tokens: None,
        pre_formatted_prompt,
    };

    let stream = match llama.generate_stream(request) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("❌ Failed to start generation: {:?}", e);
            std::process::exit(1);
        }
    };

    println!("=== Response ===\n");

    let rt = tokio::runtime::Runtime::new().unwrap();
    rt.block_on(async {
        tokio::pin!(stream);
        while let Some(chunk) = stream.next().await {
            use std::io::Write;
            print!("{chunk}");
            std::io::stdout().flush().unwrap();
        }
        println!("\n\n=== Done ===");
    });
}
