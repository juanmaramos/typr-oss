# Pyannote Local Model Data

The bundled ONNX files are used by the optional `pyannote-local` crate for local speaker segmentation and speaker embeddings.

- `segmentation.onnx`: pyannote segmentation model / ONNX conversion.
  - https://huggingface.co/pyannote/segmentation
  - https://huggingface.co/onnx-community/pyannote-segmentation-3.0
  - License: MIT
- `embedding.onnx`: WeSpeaker VoxCeleb CAM++ speaker embedding model.
  - https://huggingface.co/Wespeaker/wespeaker-voxceleb-campplus
  - License: Apache-2.0

The bundled MP3 files are test fixtures for local speaker embedding tests.
