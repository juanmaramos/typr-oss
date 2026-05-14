# Models And Providers

Typr OSS supports local models and direct BYOK cloud providers.

Platform support:

- macOS supports local STT, local LLMs, and BYOK cloud providers.
- Windows builds are cloud-first. Local models are currently hidden because performance and runtime compatibility vary across Windows devices. BYOK cloud chat and AssemblyAI transcription remain supported.

## Local STT

Local speech-to-text models are downloaded on demand from public Hugging Face repositories. The OSS app does not use private S3 mirrors for model files.

| App model id | Hugging Face source |
| --- | --- |
| `QuantizedTiny` | `ggerganov/whisper.cpp` / `ggml-tiny-q8_0.bin` |
| `QuantizedTinyEn` | `ggerganov/whisper.cpp` / `ggml-tiny.en-q8_0.bin` |
| `QuantizedBase` | `ggerganov/whisper.cpp` / `ggml-base-q8_0.bin` |
| `QuantizedBaseEn` | `ggerganov/whisper.cpp` / `ggml-base.en-q8_0.bin` |
| `QuantizedSmall` | `ggerganov/whisper.cpp` / `ggml-small-q8_0.bin` |
| `QuantizedSmallEn` | `ggerganov/whisper.cpp` / `ggml-small.en-q8_0.bin` |
| `QuantizedLargeTurbo` | `ggerganov/whisper.cpp` / `ggml-large-v3-turbo-q5_0.bin` |
| `DistilLargeV35En` | `distil-whisper/distil-large-v3.5-ggml` / `ggml-model.bin` |

Local STT model files are not committed to the repository.

## Local LLM

Local LLM models are downloaded on demand from public Hugging Face GGUF repositories. The active OSS model list is:

| App model id | Hugging Face source | UI status |
| --- | --- | --- |
| `Gemma4E4b` | `unsloth/gemma-4-E4B-it-GGUF` / `gemma-4-E4B-it-Q4_K_M.gguf` | Default, shown |
| `Qwen3_4bThinkingQ4Km` | `unsloth/Qwen3-4B-Thinking-2507-GGUF` / `Qwen3-4B-Thinking-2507-Q4_K_M.gguf` | Shown, reasoning model |
| `Phi4MiniQ4Km` | `unsloth/Phi-4-mini-instruct-GGUF` / `Phi-4-mini-instruct-Q4_K_M.gguf` | Shown |
| `Llama3p2_3bQ4` | `hugging-quants/Llama-3.2-3B-Instruct-Q4_K_M-GGUF` / `llama-3.2-3b-instruct-q4_k_m.gguf` | Supported, hidden in selector |
| `Gemma3_4b` | `unsloth/gemma-3-4b-it-GGUF` / `gemma-3-4b-it-Q4_K_M.gguf` | Legacy migration only |

Local LLM model files are not committed to the repository.

## Cloud LLM BYOK

The OSS app calls cloud LLM providers directly:

- OpenAI: `https://api.openai.com/v1`
- Groq: `https://api.groq.com/openai/v1`
- OpenRouter: `https://openrouter.ai/api/v1`

Users configure their own keys in Settings > AI. Requests are billed by the provider to the user's account.

## Cloud STT BYOK

The OSS app calls cloud transcription providers directly:

- AssemblyAI: `https://api.assemblyai.com`
  - Live transcription uses AssemblyAI Universal-Streaming Multilingual (`universal-streaming-multilingual`) with the user's own API key.
  - Long live recordings roll over AssemblyAI streaming sessions before the 3-hour provider cap while preserving a continuous transcript.

Users configure their own keys in Settings > AI. Requests are billed by the provider to the user's account.

### Live Transcription Model Contract

Typr's live transcript UI is an append-only editor path. It should commit only words that the provider says are final enough to persist, because committed transcript text feeds notes, search, and chat context.

AssemblyAI Universal Streaming fits this contract because it emits cumulative turns with per-word `word_is_final` state. Typr appends only newly finalized words for the active turn and ignores the current non-final tail word until it becomes immutable.

AssemblyAI Universal-3 Pro Streaming has a different rendering contract. Its partials are non-final cumulative segments, and the final end-of-turn transcript can differ after the model uses the full turn context. Supporting it well would require a separate provisional turn layer keyed by provider session, audio source, and `turn_order`; the UI would render that provisional segment in place, replace it on each partial, and reconcile it with the final turn. It should not be treated as a one-line model string swap.

References:

- AssemblyAI Universal Streaming: https://www.assemblyai.com/docs/streaming/universal-streaming
- AssemblyAI Universal-3 Pro partials: https://www.assemblyai.com/docs/streaming/universal-3-pro/turn-detection-and-partials

## Uploaded Audio And YouTube

Uploaded audio and YouTube imports use the currently selected STT path:

- Local STT when a local model is selected and available.
- BYOK cloud STT when a cloud transcription model is selected and the user has configured the matching provider key.

The OSS app does not upload audio to Typr-owned transcription proxies.
