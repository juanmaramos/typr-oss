use serde::{ser::Serializer, Serialize};

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[cfg(feature = "actual")]
    #[error(transparent)]
    LocalWhisperError(#[from] whisper_rs::WhisperError),

    #[error("Model file not found")]
    ModelNotFound,

    #[error("Feature not supported: {0}")]
    NotSupported(String),
}

impl Serialize for Error {
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(self.to_string().as_ref())
    }
}
