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
