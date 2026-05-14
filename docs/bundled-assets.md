# Bundled Assets

Typr OSS downloads user-selectable STT and LLM models from public Hugging Face repositories at runtime. A small set of runtime and test assets is bundled because local audio processing crates compile or exercise them directly.

## Required Bundled Assets

| Asset | Purpose | Source | License |
| --- | --- | --- | --- |
| `apps/desktop/src-tauri/dlls/onnxruntime.dll` | Windows ONNX Runtime library used by local ONNX-backed audio components. | Microsoft ONNX Runtime v1.22.0 | MIT |
| `crates/aec/data/*.onnx` | Acoustic echo cancellation models used by the `aec` crate. | `breizhn/DTLN-aec` | MIT |
| `crates/denoise/data/*.onnx` | DTLN denoise model files. | `breizhn/DTLN` | MIT |
| `crates/pyannote-local/src/data/segmentation.onnx` | Local speaker segmentation. | `pyannote/segmentation` / `onnx-community/pyannote-segmentation-3.0` | MIT |
| `crates/pyannote-local/src/data/embedding.onnx` | Local speaker embedding. | `Wespeaker/wespeaker-voxceleb-campplus` | Apache-2.0 |
| `crates/aec/data/*.wav` | Acoustic echo cancellation test and benchmark fixtures. | Local test fixtures and upstream AEC sample material. | See source fixture provenance before reuse outside tests. |
| `crates/pyannote-local/src/data/*.mp3` | Local speaker embedding test fixtures. | Local test fixtures. | Test-only fixtures; replace if provenance becomes unclear. |

Source and model-card links are listed in `NOTICE`. Replace any fixture that contains private, personal, or unclear-provenance audio.
