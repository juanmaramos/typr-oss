use std::{future::Future, path::PathBuf};

use tauri::{ipc::Channel, Emitter, Manager, Runtime};
use tauri_plugin_store2::StorePluginExt;

use crate::events::{LlmModelState, LlmModelStateEvent};
use typr_file::{download_file_with_callback, DownloadProgress};

pub trait LocalLlmPluginExt<R: Runtime> {
    fn local_llm_store(&self) -> tauri_plugin_store2::ScopedStore<R, crate::StoreKey>;

    fn models_dir(&self) -> PathBuf;
    fn api_base(&self) -> impl Future<Output = Option<String>>;

    fn is_server_running(&self) -> impl Future<Output = bool>;
    fn start_server(&self) -> impl Future<Output = Result<String, crate::Error>>;
    fn stop_server(&self) -> impl Future<Output = Result<(), crate::Error>>;

    fn list_downloaded_model(
        &self,
    ) -> impl Future<Output = Result<Vec<crate::SupportedModel>, crate::Error>>;
    fn get_current_model(&self) -> Result<crate::SupportedModel, crate::Error>;
    fn set_current_model(&self, model: crate::SupportedModel) -> Result<(), crate::Error>;

    fn download_model(
        &self,
        model: crate::SupportedModel,
        channel: Option<Channel<i8>>,
    ) -> impl Future<Output = Result<(), crate::Error>>;
    fn is_model_downloading(&self, model: &crate::SupportedModel) -> impl Future<Output = bool>;
    fn is_model_downloaded(
        &self,
        model: &crate::SupportedModel,
    ) -> impl Future<Output = Result<bool, crate::Error>>;

    fn emit_model_state(
        &self,
        model_id: String,
        state: LlmModelState,
    ) -> impl Future<Output = Result<(), crate::Error>>;
}

impl<R: Runtime, T: Manager<R> + Emitter<R>> LocalLlmPluginExt<R> for T {
    fn local_llm_store(&self) -> tauri_plugin_store2::ScopedStore<R, crate::StoreKey> {
        self.scoped_store(crate::PLUGIN_NAME).unwrap()
    }

    fn models_dir(&self) -> PathBuf {
        self.path().app_data_dir().unwrap().join("models")
    }

    #[tracing::instrument(skip_all)]
    async fn api_base(&self) -> Option<String> {
        let state = self.state::<crate::SharedState>();
        let s = state.lock().await;
        s.api_base.clone()
    }

    #[tracing::instrument(skip_all)]
    async fn is_model_downloading(&self, model: &crate::SupportedModel) -> bool {
        // If the model is already downloaded, it is not downloading.
        if let Ok(true) = self.is_model_downloaded(model).await {
            return false;
        }

        let state = self.state::<crate::SharedState>();
        let mut guard = state.lock().await;
        guard.download_task.retain(|_, task| !task.is_finished());
        guard.download_task.contains_key(model)
    }

    #[tracing::instrument(skip_all)]
    async fn is_model_downloaded(
        &self,
        model: &crate::SupportedModel,
    ) -> Result<bool, crate::Error> {
        let path = self.models_dir().join(model.file_name());

        if !path.exists() {
            return Ok(false);
        }

        // Size sanity check: allow 90-110% of expected size
        // Handles CDN variations while catching truncated downloads
        let actual_size = typr_file::file_size(path)?;
        let expected_size = model.model_size();
        let min_size = expected_size * 9 / 10;
        let max_size = expected_size * 11 / 10;

        if actual_size < min_size || actual_size > max_size {
            return Ok(false);
        }

        Ok(true)
    }

    #[tracing::instrument(skip_all)]
    async fn is_server_running(&self) -> bool {
        let state = self.state::<crate::SharedState>();
        let s = state.lock().await;
        s.server.is_some()
    }

    #[tracing::instrument(skip_all)]
    async fn download_model(
        &self,
        model: crate::SupportedModel,
        channel: Option<Channel<i8>>,
    ) -> Result<(), crate::Error> {
        let model_id = model.to_string();

        if self.is_model_downloaded(&model).await? {
            let _ = self
                .emit_model_state(model_id, LlmModelState::Downloaded)
                .await;
            return Ok(());
        }

        let m = model.clone();
        let path = self.models_dir().join(m.file_name());
        let app_handle = self.app_handle().clone();
        let task_model_id = model_id.clone();

        {
            let state = self.state::<crate::SharedState>();
            let mut s = state.lock().await;
            s.download_task.retain(|_, task| !task.is_finished());
            if s.download_task.contains_key(&model) {
                return Ok(());
            }

            let task = tokio::spawn(async move {
                let callback = |progress: DownloadProgress| match progress {
                    DownloadProgress::Started => {
                        if let Some(channel) = channel.as_ref() {
                            let _ = channel.send(0);
                        }
                        let _ = app_handle.emit(
                            "llm-model-state-changed",
                            &LlmModelStateEvent {
                                model_id: task_model_id.clone(),
                                state: LlmModelState::Downloading { progress: 0 },
                                timestamp: std::time::SystemTime::now()
                                    .duration_since(std::time::UNIX_EPOCH)
                                    .unwrap()
                                    .as_millis() as u64,
                            },
                        );
                    }
                    DownloadProgress::Progress(downloaded, total_size) => {
                        let percent = (downloaded as f64 / total_size as f64) * 100.0;
                        if let Some(channel) = channel.as_ref() {
                            let _ = channel.send(percent as i8);
                        }
                        let _ = app_handle.emit(
                            "llm-model-state-changed",
                            &LlmModelStateEvent {
                                model_id: task_model_id.clone(),
                                state: LlmModelState::Downloading {
                                    progress: percent as u8,
                                },
                                timestamp: std::time::SystemTime::now()
                                    .duration_since(std::time::UNIX_EPOCH)
                                    .unwrap()
                                    .as_millis() as u64,
                            },
                        );
                    }
                    DownloadProgress::Finished => {
                        if let Some(channel) = channel.as_ref() {
                            let _ = channel.send(100);
                        }
                        let _ = app_handle.emit(
                            "llm-model-state-changed",
                            &LlmModelStateEvent {
                                model_id: task_model_id.clone(),
                                state: LlmModelState::Downloaded,
                                timestamp: std::time::SystemTime::now()
                                    .duration_since(std::time::UNIX_EPOCH)
                                    .unwrap()
                                    .as_millis() as u64,
                            },
                        );
                    }
                };

                if let Err(e) = download_file_with_callback(m.model_url(), path, callback).await {
                    tracing::error!("model_download_error: {}", e);
                    if let Some(channel) = channel.as_ref() {
                        let _ = channel.send(-1);
                    }
                    let _ = app_handle.emit(
                        "llm-model-state-changed",
                        &LlmModelStateEvent {
                            model_id: task_model_id.clone(),
                            state: LlmModelState::Error {
                                message: e.to_string(),
                            },
                            timestamp: std::time::SystemTime::now()
                                .duration_since(std::time::UNIX_EPOCH)
                                .unwrap()
                                .as_millis() as u64,
                        },
                    );
                } else if m == crate::SupportedModel::Gemma4E4b {
                    let gemma3_path = app_handle
                        .models_dir()
                        .join(crate::SupportedModel::Gemma3_4b.file_name());
                    if gemma3_path.exists() {
                        if let Err(e) = std::fs::remove_file(&gemma3_path) {
                            tracing::warn!("gemma3_cleanup_failed: {}", e);
                        } else {
                            tracing::info!("Removed legacy Gemma 3 after Gemma 4 download");
                        }
                    }
                }
            });

            s.download_task.insert(model.clone(), task);
        }

        let _ = self
            .emit_model_state(model_id, LlmModelState::Downloading { progress: 0 })
            .await;

        Ok(())
    }

    #[tracing::instrument(skip_all)]
    async fn list_downloaded_model(&self) -> Result<Vec<crate::SupportedModel>, crate::Error> {
        let models_dir = self.models_dir();

        if !models_dir.exists() {
            return Ok(vec![]);
        }

        let mut models = Vec::new();

        for entry in models_dir.read_dir()? {
            let entry = match entry {
                Ok(e) => e,
                Err(_) => {
                    continue;
                }
            };

            let file_name = entry.file_name();
            let file_name_str = file_name.to_string_lossy();

            if let Some(model) = crate::model::SUPPORTED_MODELS
                .iter()
                .find(|model| model.file_name() == file_name_str)
            {
                if entry.path().is_file() {
                    models.push(model.clone());
                }
            }
        }

        Ok(models)
    }

    #[tracing::instrument(skip_all)]
    async fn start_server(&self) -> Result<String, crate::Error> {
        let current_model = self.get_current_model()?;
        let model_id = current_model.to_string();

        if !self.is_model_downloaded(&current_model).await? {
            return Err(crate::Error::ModelNotDownloaded);
        }

        let state = self.state::<crate::SharedState>();
        let mut s = state.lock().await;
        if let (Some(api_base), Some(_server)) = (&s.api_base, &s.server) {
            let _ = self.emit_model_state(model_id, LlmModelState::Ready).await;
            return Ok(api_base.clone());
        }

        let _ = self
            .emit_model_state(model_id.clone(), LlmModelState::Loading)
            .await;

        let model_path = self.models_dir().join(current_model.file_name());
        let model_manager = crate::ModelManager::new(model_path);

        let server_state = crate::ServerState::new(model_manager);
        let server = crate::server::run_server(server_state).await?;
        tokio::time::sleep(std::time::Duration::from_millis(100)).await;

        let api_base = format!("http://{}", &server.addr);

        s.api_base = Some(api_base.clone());
        s.server = Some(server);
        drop(s);

        // Emit ready state
        let _ = self.emit_model_state(model_id, LlmModelState::Ready).await;

        Ok(api_base)
    }

    #[tracing::instrument(skip_all)]
    async fn stop_server(&self) -> Result<(), crate::Error> {
        let state = self.state::<crate::SharedState>();
        let mut s = state.lock().await;

        if let Some(server) = s.server.take() {
            let _ = server.shutdown.send(());
        }
        Ok(())
    }

    #[tracing::instrument(skip_all)]
    fn get_current_model(&self) -> Result<crate::SupportedModel, crate::Error> {
        let store = self.local_llm_store();
        let model = store.get(crate::StoreKey::Model)?;

        match model {
            Some(crate::SupportedModel::Gemma3_4b) => {
                // Migrate: Gemma 3 → Gemma 4 E4B (strictly better, same parameter class)
                store.set(crate::StoreKey::Model, crate::SupportedModel::Gemma4E4b)?;
                Ok(crate::SupportedModel::Gemma4E4b)
            }
            Some(existing_model) => Ok(existing_model),
            None => {
                // Default to Gemma 4 for all users
                Ok(crate::SupportedModel::Gemma4E4b)
            }
        }
    }

    #[tracing::instrument(skip_all)]
    fn set_current_model(&self, model: crate::SupportedModel) -> Result<(), crate::Error> {
        let store = self.local_llm_store();
        store.set(crate::StoreKey::Model, model)?;
        Ok(())
    }

    #[tracing::instrument(skip_all)]
    async fn emit_model_state(
        &self,
        model_id: String,
        state: LlmModelState,
    ) -> Result<(), crate::Error> {
        let event = LlmModelStateEvent {
            model_id: model_id.clone(),
            state,
            timestamp: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_millis() as u64,
        };

        // Emit to all frontend listeners
        self.emit("llm-model-state-changed", &event)
            .map_err(|e| crate::Error::TauriError(e))?;

        tracing::info!("Emitted LLM model state: {} -> {:?}", model_id, event.state);
        Ok(())
    }
}
