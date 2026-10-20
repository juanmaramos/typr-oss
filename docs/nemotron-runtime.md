# Nemotron streaming prototype

## Architecture fit

The prototype uses NVIDIA's supported **ASR C ABI**, not its command-line
output, Python, a cloud service, or private C++ engine classes. It accepts the
same 16 kHz mono float32 audio Typr already sends to its local transcription
service. One recognizer shares model weights between independent microphone
and speaker streams. Each stream remains single-threaded.

The SDK's native cache-aware decoder emits revisable utterance hypotheses and
committed endpoint results. Its timestamps use the stream's global audio
position. Decoder endpointing finalizes an utterance without destroying the
encoder cache. Explicit finish flushes the final tail; injecting silence is not
a substitute for finish. An optional explicit endpoint limits long turns while
keeping the stream alive.

A separate **Typr-owned worker process** is deliberate. Typr's Whisper and llama
bindings and NeMo-Speech.cpp each carry different ggml revisions. Upstream's C
wrapper hides its implementation ABI, but its dependency libraries still have
common ggml symbols and library names. Loading all versions into the desktop
process would leave platform-specific loader collisions. A process boundary
isolates those dependencies and gives Typr bounded cancellation even while the
SDK is inside a synchronous decode. The SDK exposes no inference abort callback.
This boundary uses Tauri's existing native-sidecar packaging model.

## Pinned native contract

- Runtime: NVIDIA/NeMo-Speech.cpp **v0.2.0**, commit
  `6a3ca369370782acee0dd155e34394ba60b920c4`.
- Public header: `include/nemo_speech/asr.h`, ABI version 1.
- Runtime version is checked before model creation; other versions are rejected.
- The worker opens only an explicitly supplied absolute SDK library path.
- The C config structs are size-prefixed. The Rust definitions mirror this
  pinned header. All owned result strings are copied before native destruction.
  `Rc` keeps the recognizer and library alive until the last stream closes and
  prevents accidental cross-thread stream access.
- Backend is explicit: GPU index 0 for the macOS Metal prototype; -1 selects
  CPU for baseline tests. Missing GPU support fails before audio so the central
  controller can select Whisper. The prototype never reuses Whisper's ggml.
- Model: `nvidia/nemotron-3.5-asr-streaming-0.6b`, revision
  `1c8deaecc64b91f034d73e08dd8b64625eb3395d`, artifact
  `nemotron-3.5-asr-streaming-0.6b.q8_0.gguf`, 741,548,352 bytes,
  SHA-256 `a5c435f294eea8f88ce68dd27b8c3bfea7f777cb2fbba04fcd30eaa555f429ae`.
- SDK source: Apache-2.0; model weights: NVIDIA Open Model License
  (OpenMDW 1.1). These are different licenses. Preserve the SDK's installed
  license notices and the model's license when distributing artifacts.

The SDK's installed `lib`/`bin` layout and relative runtime search paths must be
preserved. Source builds additionally need CMake, a C++17 toolchain, and
SentencePiece; end users should receive packaged native artifacts instead of
requiring those build tools. No model conversion runs on the user's machine.

## IPC and lifecycle

The worker executable is `typr-nemotron-worker --sdk-library ABSOLUTE_PATH`.
Stdin/stdout carry four-byte big-endian lengths followed by typed JSON frames;
they are never interpreted as shell commands or human-readable CLI output.
The initial request and readiness response must agree on protocol version 1.
Control requests and PCM share one ordered input stream. Frames are limited to
1 MiB before allocating their payload. Audio frames contain 1–16,000 finite
normalized float32 samples. The only valid channel sets are `mixed`, or the
independent pair `mic` and `speaker`.

`start` creates all streams and returns `ready`. An optional pre-audio
`configure` selects the recording language by replacing empty streams on the
same loaded recognizer; it returns `configured` and is rejected after audio begins. `audio` advances one channel;
`endpoint` forces an utterance commit; `finish` flushes that channel and returns
its final result followed by `finished`. After all channels finish the process
exits. Invalid requests return a typed error and terminate the session. EOF
before finish is an interrupted session, never a successful flush.

The pinned C ABI exposes text-only interim hypotheses. The worker converts
these into transient display words with absent timestamps/confidence; final
words retain the model's real timestamps. It never invents aligned durable words.

`result.is_final=false` replaces that channel's transient preview. It must not
be saved as durable words. A final clears the channel's preview and appends its
committed words once. Empty finals still clear previews. The parent owns startup,
input, and shutdown deadlines, kills and reaps failed workers, and selects the
existing Whisper fallback centrally. Fallback must neither overwrite the user's
default nor replay already committed audio. A native crash cannot unwind through
the desktop process.

## Verification

`cargo test -p typr-nemotron-runtime` exercises framing, malformed/oversized
input, PCM bounds, channel separation, and cancellation/reaping of the real
worker process. Tests do not download models or require the native SDK.

The ignored tests in `tests/native_audio.rs` use the actual SDK and model:

```sh
TYPR_NEMOTRON_SDK_LIBRARY=/absolute/path/libnemo_speech_asr_c.dylib \
TYPR_NEMOTRON_MODEL=/absolute/path/model.gguf \
TYPR_NEMOTRON_GPU=0 \
TYPR_NEMOTRON_AUDIO_EN=/absolute/path/english-16k-mono.wav \
TYPR_NEMOTRON_AUDIO_ES=/absolute/path/spanish-16k-mono.wav \
cargo test -p typr-nemotron-runtime --test native_audio -- --ignored --nocapture
```

Fixtures must be PCM16, mono, 16 kHz. These tests stream 320 ms chunks, require
interim output before finish and timestamped committed words, and check that a
finished stream rejects more audio. Printed transcripts are explicit test
evidence, not production application logs. Short demo fixtures establish a
functional prototype; they do not establish general meeting accuracy or default
model suitability.

## Upstream references

- [Native SDK contract](https://github.com/NVIDIA/NeMo-Speech.cpp/blob/v0.2.0/docs/sdk.md)
- [Pinned C header](https://github.com/NVIDIA/NeMo-Speech.cpp/blob/v0.2.0/include/nemo_speech/asr.h)
- [SDK build configuration](https://github.com/NVIDIA/NeMo-Speech.cpp/blob/v0.2.0/src/asr/CMakeLists.txt)
- [Native runner endpoint behavior](https://github.com/NVIDIA/NeMo-Speech.cpp/blob/v0.2.0/src/asr/runner.cpp)
- [Official pinned model index](https://github.com/NVIDIA/NeMo-Speech.cpp/blob/v0.2.0/models/index.json)
- [Multilingual model and license](https://huggingface.co/nvidia/nemotron-3.5-asr-streaming-0.6b)

## Recorded prototype results

On the development Apple Silicon machine, the pinned Q8_0 model and Metal
backend transcribed Typr's existing demo recordings through the real C ABI:

| Fixture | Audio duration | Decode wall time | First interim audio position | Committed words |
| --- | --- | --- | --- | --- |
| English (`en-US`) | 23.966 s | 1.808 s | 1,280 ms fed | 70 |
| Spanish (`es-ES`) | 30.466 s | 2.157 s | 1,280 ms fed | 72 |

These are faster-than-real-time replay measurements, not paced microphone
latency measurements. Warm-run first-interim decode wall times were 218 ms
for English and 196 ms for Spanish; the initial cold run took 940 ms for English.
The first preview was available after feeding 1.28 seconds of audio, so these
figures must not be presented as 160 ms end-to-end microphone latency. Actual dual-channel
worker IPC also passed with English microphone and Spanish speaker audio,
prewarmed language reconfiguration, transient previews, per-channel final
commits, tail flush, and process exit. CPU execution was substantially slower
than real time on this machine; the macOS prototype selects Metal explicitly.

Compared with the existing demo reference text, outputs differ on the proper
name `Typr` (`Typer`/`Type Yr`) and Spanish `50` (`cinco`). The reference text is
not a verified benchmark transcript. This is a functional streaming prototype
with Whisper fallback, not evidence to replace Whisper's default.

## Try the opt-in macOS prototype

The normal app build keeps this prototype disabled. On Apple Silicon, from the
repository root:

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm prepare
python3 scripts/build_nemotron_runtime.py
# Existing desktop prerequisite, if the MCP sidecar has not been prepared:
bash scripts/build_mcp_sidecar.sh aarch64-apple-darwin
pnpm -F @typr/desktop tauri dev --features nemotron,macos-default --config src-tauri/tauri.nemotron.conf.json
```

The helper builds the pinned SDK and its private SentencePiece dependency,
builds Typr's worker, copies the runtime and license notices into ignored
`target/nemotron/runtime`, and stages development resources beside the Cargo
executable. It rejects modified tracked upstream source and mismatched submodule
revisions. Python, Git, CMake and compilers are build tools; the running app
requires none of them. No model or SDK download occurs automatically at app
startup. Download the opt-in model in Settings, keep a multilingual Whisper
model downloaded for fallback, then select Nemotron through the existing Use or
Defaults controls. The model download verifies the pinned SHA-256 before success.

The resource overlay packages the private SDK under `stt/nemotron`. Normal
releases do not use this overlay. Developer worker/libraries receive ad-hoc
signatures; production distribution signing and notarization have not been
validated. Windows packaging and Linux real-time performance are not validated;
the build helper supports macOS and a CPU-only Linux development build.

Startup resolves the effective backend centrally. Missing resources, unsupported
prototype languages, invalid model integrity, or native initialization failures
select an already downloaded multilingual Whisper model before capture starts.
The saved default remains unchanged and the recording emits a fallback event.
Without a usable Whisper model, capture does not start. A failure after capture
begins is explicit: committed words remain, previews clear, and the user must
stop and select Whisper before continuing. The prototype does not replay audio
after already committed finals, promise a saved recording, or silently enable
audio saving. Saved-recording recovery depends on the existing recording/privacy
settings and is outside this live failover path.

Full paced local WebSocket tests also passed with the actual SDK and model:
English produced 69 previews and 70 committed words over 23.97 seconds of audio;
Spanish produced 77 previews and 72 committed words over 30.47 seconds. First
preview wall times were 999 ms and 1,002 ms respectively, with clean final drain
and EOF. These replay tests exercise the local transport and worker, not physical
microphone/system capture or a general accuracy benchmark. The actual local
`ListenClient` transport has a separate regression covering no cloud KeepAlive,
ordered End and delayed final delivery.
