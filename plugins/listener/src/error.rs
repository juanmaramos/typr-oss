use serde::{ser::Serializer, Serialize};

pub type Result<T> = std::result::Result<T, Error>;

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error(transparent)]
    IoError(#[from] std::io::Error),
    #[error(transparent)]
    CpalDevicesError(#[from] typr_audio::cpal::DevicesError),
    #[error(transparent)]
    ListenClientError(#[from] typr_ws::Error),
    #[error(transparent)]
    DatabaseError(#[from] tauri_plugin_db::Error),
    #[error(transparent)]
    ConnectorError(#[from] tauri_plugin_connector::Error),
    #[error("no session")]
    NoneSession,
    #[error("start session failed")]
    StartSessionFailed,
    #[error("stop session failed")]
    StopSessionFailed,
    #[error("pause session failed")]
    PauseSessionFailed,
    #[error("resume session failed")]
    ResumeSessionFailed,
    #[error("device initialization failed: {0}")]
    DeviceInitialization(String),
    #[error("custom error: {0}")]
    Custom(String),
}

impl Serialize for Error {
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(self.to_string().as_ref())
    }
}
