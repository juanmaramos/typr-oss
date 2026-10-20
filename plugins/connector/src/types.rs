#[derive(Debug, serde::Deserialize, serde::Serialize, specta::Type)]
pub struct Connection {
    pub api_base: String,
    pub api_key: Option<String>,
}

#[derive(Debug, Default, Clone, serde::Deserialize, serde::Serialize, specta::Type)]
pub struct AiTaskDefaults {
    pub project_brief_model_id: Option<String>,
    pub meeting_summary_model_id: Option<String>,
}

#[derive(Debug, serde::Deserialize, serde::Serialize, specta::Type)]
#[serde(tag = "type", content = "connection")]
pub enum ConnectionLLM {
    CloudProvider(Connection),
    TyprLocal(Connection),
    Custom(Connection),
}

#[derive(Debug, serde::Deserialize, serde::Serialize, specta::Type)]
#[serde(tag = "type", content = "connection")]
pub enum ConnectionSTT {
    CloudProvider(Connection),
    TyprLocal(Connection),
}

impl From<ConnectionLLM> for Connection {
    fn from(value: ConnectionLLM) -> Self {
        match value {
            ConnectionLLM::CloudProvider(conn) => conn,
            ConnectionLLM::TyprLocal(conn) => conn,
            ConnectionLLM::Custom(conn) => conn,
        }
    }
}

impl AsRef<Connection> for ConnectionLLM {
    fn as_ref(&self) -> &Connection {
        match self {
            ConnectionLLM::CloudProvider(conn) => conn,
            ConnectionLLM::TyprLocal(conn) => conn,
            ConnectionLLM::Custom(conn) => conn,
        }
    }
}

impl From<ConnectionSTT> for Connection {
    fn from(value: ConnectionSTT) -> Self {
        match value {
            ConnectionSTT::CloudProvider(conn) => conn,
            ConnectionSTT::TyprLocal(conn) => conn,
        }
    }
}

impl AsRef<Connection> for ConnectionSTT {
    fn as_ref(&self) -> &Connection {
        match self {
            ConnectionSTT::CloudProvider(conn) => conn,
            ConnectionSTT::TyprLocal(conn) => conn,
        }
    }
}

/// A session-start snapshot: provider, model and credentials are captured together.
/// Connection setup must consume this value rather than rereading preferences.
pub enum SttSelection {
    Local(tauri_plugin_local_stt::SupportedModel),
    AssemblyAi { api_key: Option<String> },
}

impl SttSelection {
    pub fn model_id(&self) -> String {
        match self {
            Self::Local(model) => model.to_string(),
            Self::AssemblyAi { .. } => "assemblyai-universal".to_string(),
        }
    }
}

/// The model actually serving a connection, independent of saved preferences.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ResolvedSttModel {
    Local(tauri_plugin_local_stt::SupportedModel),
    AssemblyAi,
}

impl ResolvedSttModel {
    pub fn model_id(&self) -> String {
        match self {
            Self::Local(model) => model.to_string(),
            Self::AssemblyAi => "assemblyai-universal".into(),
        }
    }

    pub fn is_streaming(&self) -> bool {
        matches!(self, Self::Local(model) if model.is_streaming())
    }
}

pub struct ResolvedSttConnection {
    pub connection: ConnectionSTT,
    pub model: ResolvedSttModel,
}

impl From<ResolvedSttConnection> for Connection {
    fn from(value: ResolvedSttConnection) -> Self {
        value.connection.into()
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SessionModelOverride {
    pub session_id: String,
    pub model: tauri_plugin_local_stt::SupportedModel,
}

// Runtime-only state: saving any preference cannot serialize recovery overrides.
pub type SessionModelOverrideState = tokio::sync::Mutex<Option<SessionModelOverride>>;
