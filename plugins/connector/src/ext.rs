use std::future::Future;

use crate::{Connection, ConnectionLLM, ConnectionSTT, StoreKey};
use tauri_plugin_store2::StorePluginExt;

fn non_empty(value: Option<String>) -> Option<String> {
    value.and_then(|v| {
        let trimmed = v.trim().to_string();
        (!trimmed.is_empty()).then_some(trimmed)
    })
}

fn selected_auto_cloud_connection<R: tauri::Runtime>(
    store: &tauri_plugin_store2::ScopedStore<R, crate::StoreKey>,
) -> Result<Option<ConnectionLLM>, crate::Error> {
    if let Some(api_key) = non_empty(store.get::<String>(StoreKey::OpenrouterApiKey)?) {
        return Ok(Some(ConnectionLLM::CloudProvider(Connection {
            api_base: "https://openrouter.ai/api/v1".to_string(),
            api_key: Some(api_key),
        })));
    }

    if let Some(api_key) = non_empty(store.get::<String>(StoreKey::OpenaiApiKey)?) {
        return Ok(Some(ConnectionLLM::CloudProvider(Connection {
            api_base: "https://api.openai.com/v1".to_string(),
            api_key: Some(api_key),
        })));
    }

    if let Some(api_key) = non_empty(store.get::<String>(StoreKey::GroqApiKey)?) {
        return Ok(Some(ConnectionLLM::CloudProvider(Connection {
            api_base: "https://api.groq.com/openai/v1".to_string(),
            api_key: Some(api_key),
        })));
    }

    Ok(None)
}

pub trait ConnectorPluginExt<R: tauri::Runtime> {
    fn connector_store(&self) -> tauri_plugin_store2::ScopedStore<R, crate::StoreKey>;

    fn list_custom_llm_models(&self) -> impl Future<Output = Result<Vec<String>, crate::Error>>;

    fn get_custom_llm_model(&self) -> Result<Option<String>, crate::Error>;
    fn set_custom_llm_model(&self, model: String) -> Result<(), crate::Error>;

    fn set_custom_llm_enabled(&self, enabled: bool) -> Result<(), crate::Error>;
    fn get_custom_llm_enabled(&self) -> Result<bool, crate::Error>;

    fn get_local_llm_connection(&self)
        -> impl Future<Output = Result<ConnectionLLM, crate::Error>>;

    fn get_custom_llm_connection(&self) -> Result<Option<Connection>, crate::Error>;
    fn set_custom_llm_connection(&self, connection: Connection) -> Result<(), crate::Error>;

    fn get_llm_connection(&self) -> impl Future<Output = Result<ConnectionLLM, crate::Error>>;
    fn get_stt_connection(&self) -> impl Future<Output = Result<ConnectionSTT, crate::Error>>;

    fn get_admin_connection(&self) -> Result<Option<Connection>, crate::Error>;
    fn set_admin_connection(&self, connection: Connection) -> Result<(), crate::Error>;
}

impl<R: tauri::Runtime, T: tauri::Manager<R> + tauri::Emitter<R>> ConnectorPluginExt<R> for T {
    fn connector_store(&self) -> tauri_plugin_store2::ScopedStore<R, crate::StoreKey> {
        self.scoped_store(crate::PLUGIN_NAME).unwrap()
    }

    async fn list_custom_llm_models(&self) -> Result<Vec<String>, crate::Error> {
        let conn = self.get_custom_llm_connection()?;

        match conn {
            Some(c) => {
                let llm_conn = ConnectionLLM::Custom(Connection {
                    api_base: c.api_base,
                    api_key: c.api_key,
                });

                llm_conn.models().await
            }
            _ => Ok(vec![]),
        }
    }

    fn get_custom_llm_model(&self) -> Result<Option<String>, crate::Error> {
        Ok(self.connector_store().get(StoreKey::CustomModel)?.flatten())
    }

    fn set_custom_llm_model(&self, model: String) -> Result<(), crate::Error> {
        self.connector_store().set(StoreKey::CustomModel, model)?;
        Ok(())
    }

    fn set_custom_llm_enabled(&self, enabled: bool) -> Result<(), crate::Error> {
        self.connector_store()
            .set(StoreKey::CustomEnabled, enabled)?;
        Ok(())
    }

    fn get_custom_llm_enabled(&self) -> Result<bool, crate::Error> {
        Ok(self
            .connector_store()
            .get(StoreKey::CustomEnabled)?
            .unwrap_or(false))
    }

    fn set_custom_llm_connection(&self, connection: Connection) -> Result<(), crate::Error> {
        self.connector_store()
            .set(StoreKey::CustomApiBase, connection.api_base)?;
        self.connector_store()
            .set(StoreKey::CustomApiKey, connection.api_key)?;

        Ok(())
    }

    fn get_custom_llm_connection(&self) -> Result<Option<Connection>, crate::Error> {
        let api_base = self.connector_store().get(StoreKey::CustomApiBase)?;
        let api_key = self.connector_store().get(StoreKey::CustomApiKey)?;

        match (api_base, api_key) {
            (Some(api_base), Some(api_key)) => Ok(Some(Connection { api_base, api_key })),
            _ => Ok(None),
        }
    }

    async fn get_local_llm_connection(&self) -> Result<ConnectionLLM, crate::Error> {
        use tauri_plugin_local_llm::{LocalLlmPluginExt, SharedState};

        let api_base = if self.is_server_running().await {
            let state = self.state::<SharedState>();
            let guard = state.lock().await;
            let base = guard.api_base.clone().unwrap_or_default();
            tracing::debug!("Using existing LLM server at {}", base);
            base
        } else {
            tracing::info!("Starting local LLM server");
            let base = self.start_server().await?;
            tracing::info!("Local LLM server started at {}", base);
            base
        };

        let conn = ConnectionLLM::TyprLocal(Connection {
            api_base,
            api_key: None,
        });
        Ok(conn)
    }

    async fn get_llm_connection(&self) -> Result<ConnectionLLM, crate::Error> {
        let store = self.connector_store();

        let cloud_model = store
            .get::<String>(StoreKey::CloudModel)?
            .unwrap_or_default();
        if !cloud_model.is_empty() {
            if cloud_model == "auto" {
                if let Some(connection) = selected_auto_cloud_connection(&store)? {
                    return Ok(connection);
                }
            } else if cloud_model.starts_with("openai-") {
                let api_key =
                    non_empty(store.get::<String>(StoreKey::OpenaiApiKey)?).ok_or_else(|| {
                        crate::Error::UnknownError("missing OpenAI API key".to_string())
                    })?;

                return Ok(ConnectionLLM::CloudProvider(Connection {
                    api_base: "https://api.openai.com/v1".to_string(),
                    api_key: Some(api_key),
                }));
            } else if cloud_model.starts_with("groq-") {
                let api_key =
                    non_empty(store.get::<String>(StoreKey::GroqApiKey)?).ok_or_else(|| {
                        crate::Error::UnknownError("missing Groq API key".to_string())
                    })?;

                return Ok(ConnectionLLM::CloudProvider(Connection {
                    api_base: "https://api.groq.com/openai/v1".to_string(),
                    api_key: Some(api_key),
                }));
            } else if cloud_model.starts_with("openrouter-") {
                let api_key = non_empty(store.get::<String>(StoreKey::OpenrouterApiKey)?)
                    .ok_or_else(|| {
                        crate::Error::UnknownError("missing OpenRouter API key".to_string())
                    })?;

                return Ok(ConnectionLLM::CloudProvider(Connection {
                    api_base: "https://openrouter.ai/api/v1".to_string(),
                    api_key: Some(api_key),
                }));
            } else {
                return Err(crate::Error::UnknownError(format!(
                    "unsupported cloud model: {}",
                    cloud_model
                )));
            }
        }

        let custom_enabled = self.get_custom_llm_enabled()?;

        if custom_enabled {
            let api_base = store
                .get::<Option<String>>(StoreKey::CustomApiBase)?
                .flatten()
                .unwrap_or_default();
            let api_key = store
                .get::<Option<String>>(StoreKey::CustomApiKey)?
                .flatten();

            let conn = ConnectionLLM::Custom(Connection { api_base, api_key });
            Ok(conn)
        } else {
            let conn = self.get_local_llm_connection().await?;
            Ok(conn)
        }
    }

    async fn get_stt_connection(&self) -> Result<ConnectionSTT, crate::Error> {
        let store = self.connector_store();

        // Check session override first (set by fallback logic, not persisted to disk).
        // Falls back to the user's persisted preference if no session override is active.
        let session_model = store
            .get::<String>(StoreKey::SttModelSession)?
            .unwrap_or_default();
        let stt_model = if !session_model.is_empty() {
            session_model
        } else {
            store.get::<String>(StoreKey::SttModel)?.unwrap_or_default()
        };

        let stt_model = stt_model.to_lowercase();
        if stt_model.contains("assemblyai") {
            let api_key =
                non_empty(store.get::<String>(StoreKey::AssemblyaiApiKey)?).ok_or_else(|| {
                    crate::Error::UnknownError("missing AssemblyAI API key".to_string())
                })?;

            return Ok(ConnectionSTT::CloudProvider(Connection {
                api_base: "https://api.assemblyai.com".to_string(),
                api_key: Some(api_key),
            }));
        }

        {
            use tauri_plugin_local_stt::{LocalSttPluginExt, SharedState};

            let api_base = if self.is_server_running().await {
                let state = self.state::<SharedState>();
                let guard = state.lock().await;
                guard.api_base.clone().unwrap()
            } else {
                self.start_server().await?
            };

            let conn = ConnectionSTT::TyprLocal(Connection {
                api_base,
                api_key: None,
            });
            Ok(conn)
        }
    }
    fn get_admin_connection(&self) -> Result<Option<Connection>, crate::Error> {
        let api_base = self.connector_store().get(StoreKey::AdminApiBase)?;
        let api_key = self.connector_store().get(StoreKey::AdminApiKey)?;

        match (api_base, api_key) {
            (Some(api_base), Some(api_key)) => Ok(Some(Connection { api_base, api_key })),
            _ => Ok(None),
        }
    }

    fn set_admin_connection(&self, connection: Connection) -> Result<(), crate::Error> {
        self.connector_store()
            .set(StoreKey::AdminApiBase, connection.api_base)?;
        self.connector_store()
            .set(StoreKey::AdminApiKey, connection.api_key)?;

        Ok(())
    }
}

trait OpenaiCompatible {
    fn models(&self) -> impl Future<Output = Result<Vec<String>, crate::Error>>;
}

impl OpenaiCompatible for ConnectionLLM {
    async fn models(&self) -> Result<Vec<String>, crate::Error> {
        let conn = self.as_ref();
        let api_base = &conn.api_base;
        let api_key = &conn.api_key;

        let url = {
            let mut u = url::Url::parse(api_base)?;
            u.set_path("/v1/models");
            u
        };

        let mut req = reqwest::Client::new().get(url);
        if let Some(api_key) = api_key {
            req = req.bearer_auth(api_key);
        }

        let res: serde_json::Value = req.send().await?.json().await?;
        let data = res["data"].as_array();
        let models = match data {
            None => return Err(crate::Error::UnknownError(format!("no_models: {:?}", res))),
            Some(models) => models
                .iter()
                .filter_map(|v| v["id"].as_str().map(String::from))
                .filter(|id| {
                    ![
                        "audio",
                        "video",
                        "image",
                        "tts",
                        "dall-e",
                        "moderation",
                        "transcribe",
                        "embedding",
                    ]
                    .iter()
                    .any(|&excluded| id.contains(excluded))
                })
                .collect(),
        };

        Ok(models)
    }
}
