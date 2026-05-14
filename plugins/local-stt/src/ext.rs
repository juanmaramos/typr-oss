use std::{future::Future, path::PathBuf};

use tauri::{ipc::Channel, Emitter, Manager, Runtime};
use tauri_plugin_shell::ShellExt;
use tauri_plugin_store2::StorePluginExt;

use typr_file::{download_file_with_callback, DownloadProgress};
use typr_listener_interface::Word;

use crate::events::{ModelState, ModelStateEvent, RecordedProcessingEvent};

pub trait LocalSttPluginExt<R: Runtime> {
    fn local_stt_store(&self) -> tauri_plugin_store2::ScopedStore<R, crate::StoreKey>;
    fn models_dir(&self) -> PathBuf;
    fn list_ggml_backends(&self) -> Vec<typr_whisper_local::GgmlBackend>;
    fn api_base(&self) -> impl Future<Output = Option<String>>;

    fn start_external_server(&self) -> impl Future<Output = Result<String, crate::Error>>;
    fn stop_external_server(&self) -> impl Future<Output = Result<(), crate::Error>>;

    fn is_server_running(&self) -> impl Future<Output = bool>;
    fn start_server(&self) -> impl Future<Output = Result<String, crate::Error>>;
    fn stop_server(&self) -> impl Future<Output = Result<(), crate::Error>>;

    fn get_current_model(&self) -> Result<crate::SupportedModel, crate::Error>;
    fn set_current_model(&self, model: crate::SupportedModel) -> Result<(), crate::Error>;

    fn process_recorded(
        &self,
        model_path: impl AsRef<std::path::Path>,
        audio_path: impl AsRef<std::path::Path>,
        progress_fn: impl FnMut(RecordedProcessingEvent) + Send + 'static,
    ) -> Result<Vec<Word>, crate::Error>;

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
        state: ModelState,
    ) -> impl Future<Output = Result<(), crate::Error>>
    where
        Self: Emitter<R>;
}

impl<R: Runtime, T: Manager<R> + Emitter<R>> LocalSttPluginExt<R> for T {
    fn local_stt_store(&self) -> tauri_plugin_store2::ScopedStore<R, crate::StoreKey> {
        self.scoped_store(crate::PLUGIN_NAME).unwrap()
    }

    fn models_dir(&self) -> PathBuf {
        self.path().app_data_dir().unwrap().join("stt")
    }

    fn list_ggml_backends(&self) -> Vec<typr_whisper_local::GgmlBackend> {
        typr_whisper_local::list_ggml_backends()
    }

    #[tracing::instrument(skip_all)]
    async fn api_base(&self) -> Option<String> {
        let state = self.state::<crate::SharedState>();
        let s = state.lock().await;

        s.api_base.clone()
    }

    #[tracing::instrument(skip_all)]
    async fn is_model_downloaded(
        &self,
        model: &crate::SupportedModel,
    ) -> Result<bool, crate::Error> {
        let model_path = self.models_dir().join(model.file_name());

        if !model_path.exists() {
            return Ok(false);
        }

        // Size sanity check: allow 90-110% of expected size
        // Handles CDN variations while catching truncated downloads
        let actual_size = typr_file::file_size(&model_path)?;
        let expected_size = model.model_size();
        let min_size = expected_size * 9 / 10;
        let max_size = expected_size * 11 / 10;

        if actual_size < min_size || actual_size > max_size {
            return Ok(false);
        }

        Ok(true)
    }

    #[tracing::instrument(skip_all)]
    async fn start_external_server(&self) -> Result<String, crate::Error> {
        let port = 8008;
        let cmd = self
            .shell()
            .sidecar("pro-stt-server")?
            .arg(format!("--port {}", port));

        let (_rx, _child) = cmd.spawn()?;
        Ok(format!("http://localhost:{}", port))
    }

    #[tracing::instrument(skip_all)]
    async fn stop_external_server(&self) -> Result<(), crate::Error> {
        Ok(())
    }

    #[tracing::instrument(skip_all)]
    async fn is_server_running(&self) -> bool {
        let state = self.state::<crate::SharedState>();
        let s = state.lock().await;

        s.server.is_some()
    }

    #[tracing::instrument(skip_all)]
    async fn start_server(&self) -> Result<String, crate::Error> {
        let cache_dir = self.models_dir();
        let model = self.get_current_model()?;

        tracing::info!("[STT_SERVER_START] Using model: {:?}", model);

        if !self.is_model_downloaded(&model).await? {
            return Err(crate::Error::ModelNotDownloaded);
        }

        let state = self.state::<crate::SharedState>();
        let mut s = state.lock().await;
        if let (Some(api_base), Some(_server)) = (&s.api_base, &s.server) {
            return Ok(api_base.clone());
        }

        let server_state = crate::ServerStateBuilder::default()
            .model_cache_dir(cache_dir)
            .model_type(model)
            .build();

        let server = crate::run_server(server_state).await?;
        tokio::time::sleep(std::time::Duration::from_millis(100)).await;

        let api_base = format!("http://{}", &server.addr);

        s.api_base = Some(api_base.clone());
        s.server = Some(server);

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
    async fn download_model(
        &self,
        model: crate::SupportedModel,
        channel: Option<Channel<i8>>,
    ) -> Result<(), crate::Error> {
        let model_id = model.to_string();

        if self.is_model_downloaded(&model).await? {
            let _ = self
                .emit_model_state(model_id, ModelState::Downloaded)
                .await;
            return Ok(());
        }

        let m = model.clone();
        let model_path = self.models_dir().join(m.file_name());
        let app_handle = self.app_handle().clone();
        let emit_model_id = model_id.clone();

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
                        let event = ModelStateEvent {
                            model_id: emit_model_id.clone(),
                            state: ModelState::Downloading { progress: 0 },
                            timestamp: std::time::SystemTime::now()
                                .duration_since(std::time::UNIX_EPOCH)
                                .unwrap()
                                .as_millis() as u64,
                        };
                        let _ = app_handle.emit("stt-model-state-changed", &event);
                    }
                    DownloadProgress::Progress(downloaded, total_size) => {
                        let percent = (downloaded as f64 / total_size as f64) * 100.0;
                        if let Some(channel) = channel.as_ref() {
                            let _ = channel.send(percent as i8);
                        }
                        let event = ModelStateEvent {
                            model_id: emit_model_id.clone(),
                            state: ModelState::Downloading {
                                progress: percent as u8,
                            },
                            timestamp: std::time::SystemTime::now()
                                .duration_since(std::time::UNIX_EPOCH)
                                .unwrap()
                                .as_millis() as u64,
                        };
                        let _ = app_handle.emit("stt-model-state-changed", &event);
                    }
                    DownloadProgress::Finished => {
                        if let Some(channel) = channel.as_ref() {
                            let _ = channel.send(100);
                        }
                        let event = ModelStateEvent {
                            model_id: emit_model_id.clone(),
                            state: ModelState::Downloaded,
                            timestamp: std::time::SystemTime::now()
                                .duration_since(std::time::UNIX_EPOCH)
                                .unwrap()
                                .as_millis() as u64,
                        };
                        let _ = app_handle.emit("stt-model-state-changed", &event);
                    }
                };

                if let Err(e) =
                    download_file_with_callback(m.model_url(), model_path, callback).await
                {
                    tracing::error!("model_download_error: {}", e);
                    if let Some(channel) = channel.as_ref() {
                        let _ = channel.send(-1);
                    }
                    let event = ModelStateEvent {
                        model_id: emit_model_id.clone(),
                        state: ModelState::Error {
                            message: e.to_string(),
                        },
                        timestamp: std::time::SystemTime::now()
                            .duration_since(std::time::UNIX_EPOCH)
                            .unwrap()
                            .as_millis() as u64,
                    };
                    let _ = app_handle.emit("stt-model-state-changed", &event);
                }
            });

            s.download_task.insert(model.clone(), task);
        }

        let _ = self
            .emit_model_state(model_id, ModelState::Downloading { progress: 0 })
            .await;

        Ok(())
    }

    #[tracing::instrument(skip_all)]
    fn process_recorded(
        &self,
        model_path: impl AsRef<std::path::Path>,
        audio_path: impl AsRef<std::path::Path>,
        mut progress_fn: impl FnMut(RecordedProcessingEvent) + Send + 'static,
    ) -> Result<Vec<Word>, crate::Error> {
        use rodio::Source;

        tracing::info!(
            "[PROCESS_RECORDED] Opening audio file: {:?}",
            audio_path.as_ref()
        );

        let decoder = rodio::Decoder::new(std::io::BufReader::new(
            std::fs::File::open(audio_path.as_ref()).unwrap(),
        ))
        .unwrap();

        let original_sample_rate = decoder.sample_rate();
        let channels = decoder.channels() as usize;
        tracing::info!(
            "[PROCESS_RECORDED] Audio sample rate: {}, channels: {}, resampling to 16000",
            original_sample_rate,
            channels
        );

        let resampled_samples = if original_sample_rate != 16000 {
            typr_audio_utils::resample_audio(decoder, 16000).unwrap()
        } else {
            decoder.convert_samples().collect()
        };

        // Mix down to mono if multi-channel (whisper expects mono 16kHz)
        let mono_samples: Vec<f32> = if channels > 1 {
            resampled_samples
                .chunks(channels)
                .map(|frame| frame.iter().sum::<f32>() / channels as f32)
                .collect()
        } else {
            resampled_samples
        };

        let duration_secs = mono_samples.len() as f64 / 16000.0;
        tracing::info!(
            "[PROCESS_RECORDED] Resampled: {} samples ({:.1}s, mono)",
            mono_samples.len(),
            duration_secs
        );

        let samples_i16 = typr_audio_utils::f32_to_i16_samples(&mono_samples);

        #[cfg(any(
            feature = "coreml",
            feature = "metal",
            feature = "cuda",
            feature = "hipblas",
            feature = "openblas",
            feature = "vulkan",
            feature = "openmp"
        ))]
        let mut model = typr_whisper_local::Whisper::builder()
            .model_path(model_path.as_ref().to_str().unwrap())
            .languages(vec![])
            .build()?;

        #[cfg(any(
            feature = "coreml",
            feature = "metal",
            feature = "cuda",
            feature = "hipblas",
            feature = "openblas",
            feature = "vulkan",
            feature = "openmp"
        ))]
        {
            let mut segmenter = typr_pyannote_local::segmentation::Segmenter::new(16000).unwrap();
            let segments = segmenter.process(&samples_i16, 16000).unwrap();
            let num_segments = segments.len();
            tracing::info!(
                "[PROCESS_RECORDED] Pyannote segmentation: {} segments from {:.1}s audio",
                num_segments,
                samples_i16.len() as f64 / 16000.0
            );

            let mut words = Vec::new();

            for (i, segment) in segments.iter().enumerate() {
                tracing::info!(
                    "[PROCESS_RECORDED] Segment {}/{}: start={:.2}s, {} samples",
                    i + 1,
                    num_segments,
                    segment.start,
                    segment.samples.len()
                );
                let audio_f32 = typr_audio_utils::i16_to_f32_samples(&segment.samples);

                let whisper_segments = model.transcribe(&audio_f32).unwrap();
                tracing::info!(
                    "[PROCESS_RECORDED] Segment {} produced {} whisper segments",
                    i + 1,
                    whisper_segments.len()
                );

                for whisper_segment in whisper_segments {
                    let start_sec: f64 = segment.start + (whisper_segment.start as f64);
                    let end_sec: f64 = segment.start + (whisper_segment.end as f64);
                    let start_ms = (start_sec * 1000.0) as u64;
                    let end_ms = (end_sec * 1000.0) as u64;

                    let word = Word {
                        text: whisper_segment.text.clone(),
                        speaker: None,
                        confidence: Some(whisper_segment.confidence),
                        start_ms: Some(start_ms),
                        end_ms: Some(end_ms),
                    };
                    words.push(word.clone());
                    progress_fn(RecordedProcessingEvent::Progress {
                        current: words.len(),
                        total: num_segments,
                        word,
                    });
                }
            }

            tracing::info!(
                "[PROCESS_RECORDED] Done: {} total words from {} segments",
                words.len(),
                num_segments
            );

            Ok(words)
        }

        #[cfg(not(any(
            feature = "coreml",
            feature = "metal",
            feature = "cuda",
            feature = "hipblas",
            feature = "openblas",
            feature = "vulkan",
            feature = "openmp"
        )))]
        Err(crate::Error::NotSupported(
            "No whisper backend compiled".to_string(),
        ))
    }

    #[tracing::instrument(skip_all)]
    async fn is_model_downloading(&self, model: &crate::SupportedModel) -> bool {
        // If model is already downloaded, it's not downloading
        if let Ok(true) = self.is_model_downloaded(model).await {
            return false;
        }

        let state = self.state::<crate::SharedState>();
        let mut guard = state.lock().await;
        guard.download_task.retain(|_, task| !task.is_finished());
        guard.download_task.contains_key(model)
    }

    #[tracing::instrument(skip_all)]
    fn get_current_model(&self) -> Result<crate::SupportedModel, crate::Error> {
        use tauri_plugin_store2::StorePluginExt;

        // Try connector store first (single source of truth)
        if let Ok(connector_store) = self.scoped_store::<String>("connector") {
            if let Ok(Some(model)) =
                connector_store.get::<crate::SupportedModel>("SttModel".to_string())
            {
                tracing::info!(
                    "[STT_MODEL] ✅ Read from connector store: {:?} (enum variant)",
                    model
                );
                return Ok(model);
            } else {
                tracing::trace!(
                    "[STT_MODEL] ⚠️ No model found in connector store, checking local store"
                );
            }
        }

        // Fallback to local store for backward compatibility
        let store = self.local_stt_store();
        let model = store.get(crate::StoreKey::DefaultModel)?;
        Ok(model.unwrap_or(crate::SupportedModel::QuantizedBaseEn))
    }

    #[tracing::instrument(skip_all)]
    fn set_current_model(&self, model: crate::SupportedModel) -> Result<(), crate::Error> {
        use tauri_plugin_store2::StorePluginExt;

        // Write to connector store (single source of truth)
        if let Ok(connector_store) = self.scoped_store::<String>("connector") {
            let model_str = model.to_string();
            connector_store.set("SttModel".to_string(), model_str.clone())?;
            connector_store.save()?;
            tracing::info!(
                "[STT_MODEL] ✅ Wrote to connector store: {:?} -> \"{}\" (enum variant as string)",
                model,
                model_str
            );
        }

        // Also update local store for backward compatibility
        let store = self.local_stt_store();
        let model_str = model.to_string();
        store.set(crate::StoreKey::DefaultModel, model)?;

        // Emit selection change event so frontend updates instantly
        let _ = self.emit(
            "stt-model-selection-changed",
            &serde_json::json!({
                "local_model": model_str,
                "cloud_model": serde_json::Value::Null,
            }),
        );

        Ok(())
    }

    #[tracing::instrument(skip_all)]
    async fn emit_model_state(
        &self,
        model_id: String,
        state: ModelState,
    ) -> Result<(), crate::Error>
    where
        Self: Emitter<R>,
    {
        let event = ModelStateEvent {
            model_id: model_id.clone(),
            state,
            timestamp: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_millis() as u64,
        };

        // Emit to all frontend listeners
        self.emit("stt-model-state-changed", &event)
            .map_err(|e| crate::Error::TauriError(e))?;

        tracing::info!("Emitted STT model state: {} -> {:?}", model_id, event.state);
        Ok(())
    }
}
