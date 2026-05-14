use serde::{ser::Serializer, Serialize};

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error(transparent)]
    OrtError(#[from] typr_onnx::ort::Error),

    #[error(transparent)]
    FftError(#[from] realfft::FftError),

    #[error(transparent)]
    ShapeError(#[from] typr_onnx::ndarray::ShapeError),

    #[error("Missing output tensor: {0}")]
    MissingOutput(String),
}

impl Serialize for Error {
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(self.to_string().as_ref())
    }
}
