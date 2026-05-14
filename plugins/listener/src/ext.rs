use std::future::Future;

use futures_util::StreamExt;

#[cfg(target_os = "macos")]
use {
    objc2::{class, msg_send, runtime::Bool},
    objc2_foundation::NSString,
};

pub trait ListenerPluginExt<R: tauri::Runtime> {
    fn list_microphone_devices(&self) -> impl Future<Output = Result<Vec<String>, crate::Error>>;
    fn get_current_microphone_device(
        &self,
    ) -> impl Future<Output = Result<Option<String>, crate::Error>>;
    fn get_microphone_selection_mode(&self) -> impl Future<Output = Result<String, crate::Error>>;
    fn set_microphone_device(
        &self,
        device_name: impl Into<String>,
    ) -> impl Future<Output = Result<(), crate::Error>>;
    fn set_microphone_auto(&self) -> impl Future<Output = Result<(), crate::Error>>;

    fn check_microphone_access(&self) -> impl Future<Output = Result<bool, crate::Error>>;
    fn check_system_audio_access(&self) -> impl Future<Output = Result<bool, crate::Error>>;
    fn request_microphone_access(&self) -> impl Future<Output = Result<(), crate::Error>>;
    fn request_system_audio_access(&self) -> impl Future<Output = Result<(), crate::Error>>;
    fn open_microphone_access_settings(&self) -> impl Future<Output = Result<(), crate::Error>>;
    fn open_system_audio_access_settings(&self) -> impl Future<Output = Result<(), crate::Error>>;

    fn get_mic_muted(&self) -> impl Future<Output = bool>;
    fn get_speaker_muted(&self) -> impl Future<Output = bool>;
    fn set_mic_muted(&self, muted: bool) -> impl Future<Output = ()>;
    fn set_speaker_muted(&self, muted: bool) -> impl Future<Output = ()>;

    fn get_state(&self) -> impl Future<Output = crate::fsm::State>;
    fn stop_session(&self) -> impl Future<Output = ()>;
    fn start_session(&self, id: impl Into<String>) -> impl Future<Output = ()>;
    fn pause_session(&self) -> impl Future<Output = ()>;
    fn resume_session(&self) -> impl Future<Output = ()>;
    fn get_pipeline_status(&self) -> impl Future<Output = crate::PipelineStatus>;
}

impl<R: tauri::Runtime, T: tauri::Manager<R>> ListenerPluginExt<R> for T {
    #[tracing::instrument(skip_all)]
    async fn list_microphone_devices(&self) -> Result<Vec<String>, crate::Error> {
        Ok(typr_audio::AudioInput::list_mic_devices())
    }

    #[tracing::instrument(skip_all)]
    async fn get_current_microphone_device(&self) -> Result<Option<String>, crate::Error> {
        let state = self.state::<crate::SharedState>();
        let mut s = state.lock().await;

        if s.fsm.is_mic_selection_auto() {
            let default_device = typr_audio::AudioInput::get_default_mic_device_name();
            s.fsm
                .handle(&crate::fsm::StateEvent::MicChange(Some(
                    default_device.clone(),
                )))
                .await;
            return Ok(Some(default_device));
        }

        Ok(s.fsm.get_current_mic_device())
    }

    #[tracing::instrument(skip_all)]
    async fn get_microphone_selection_mode(&self) -> Result<String, crate::Error> {
        let state = self.state::<crate::SharedState>();
        let s = state.lock().await;
        let mode = match s.fsm.get_mic_selection_mode() {
            crate::fsm::MicSelectionMode::Auto => "auto",
            crate::fsm::MicSelectionMode::Manual => "manual",
        };
        Ok(mode.to_string())
    }

    #[tracing::instrument(skip_all)]
    async fn set_microphone_device(
        &self,
        device_name: impl Into<String>,
    ) -> Result<(), crate::Error> {
        let state = self.state::<crate::SharedState>();

        {
            let mut guard = state.lock().await;
            guard
                .fsm
                .handle(&crate::fsm::StateEvent::MicSelectionModeChanged(
                    crate::fsm::MicSelectionMode::Manual,
                ))
                .await;
            let event = crate::fsm::StateEvent::MicChange(Some(device_name.into()));
            guard.fsm.handle(&event).await;
        }

        Ok(())
    }

    #[tracing::instrument(skip_all)]
    async fn set_microphone_auto(&self) -> Result<(), crate::Error> {
        let state = self.state::<crate::SharedState>();

        {
            let mut guard = state.lock().await;
            guard
                .fsm
                .handle(&crate::fsm::StateEvent::MicSelectionModeChanged(
                    crate::fsm::MicSelectionMode::Auto,
                ))
                .await;
            let default_device_name = typr_audio::AudioInput::get_default_mic_device_name();
            let event = crate::fsm::StateEvent::MicChange(Some(default_device_name));
            guard.fsm.handle(&event).await;
        }

        Ok(())
    }

    #[tracing::instrument(skip_all)]
    async fn check_microphone_access(&self) -> Result<bool, crate::Error> {
        #[cfg(target_os = "macos")]
        // https://github.com/ayangweb/tauri-plugin-macos-permissions/blob/c025ab4/src/commands.rs#L157
        {
            unsafe {
                let av_media_type = NSString::from_str("soun");
                let status: i32 = msg_send![
                    class!(AVCaptureDevice),
                    authorizationStatusForMediaType: &*av_media_type
                ];

                Ok(status == 3)
            }
        }

        #[cfg(not(target_os = "macos"))]
        {
            let mut mic_sample_stream = typr_audio::AudioInput::from_mic(None).stream();
            let sample = mic_sample_stream.next().await;
            Ok(sample.is_some())
        }
    }

    #[tracing::instrument(skip_all)]
    async fn check_system_audio_access(&self) -> Result<bool, crate::Error> {
        Ok(typr_tcc::audio_capture_permission_granted())
    }

    #[tracing::instrument(skip_all)]
    async fn request_microphone_access(&self) -> Result<(), crate::Error> {
        #[cfg(target_os = "macos")]
        {
            /*
            {
                use tauri_plugin_shell::ShellExt;

                let bundle_id = self.config().identifier.clone();
                self.app_handle()
                    .shell()
                    .command("tccutil")
                    .args(["reset", "Microphone", &bundle_id])
                    .spawn()
                    .ok();
            }
            */

            // https://github.com/ayangweb/tauri-plugin-macos-permissions/blob/c025ab4/src/commands.rs#L184
            unsafe {
                let av_media_type = NSString::from_str("soun");
                type CompletionBlock = Option<extern "C" fn(Bool)>;
                let completion_block: CompletionBlock = None;
                let _: () = msg_send![
                    class!(AVCaptureDevice),
                    requestAccessForMediaType: &*av_media_type,
                    completionHandler: completion_block
                ];
            }
        }

        #[cfg(not(target_os = "macos"))]
        {
            let mut mic_sample_stream = typr_audio::AudioInput::from_mic(None).stream();
            mic_sample_stream.next().await;
        }

        Ok(())
    }

    #[tracing::instrument(skip_all)]
    async fn request_system_audio_access(&self) -> Result<(), crate::Error> {
        {
            use tauri_plugin_shell::ShellExt;

            let bundle_id = self.config().identifier.clone();
            self.app_handle()
                .shell()
                .command("tccutil")
                .args(["reset", "AudioCapture", &bundle_id])
                .spawn()
                .ok();
        }

        let stop = typr_audio::AudioOutput::silence();

        let mut speaker_sample_stream = typr_audio::AudioInput::from_speaker(None).stream();
        speaker_sample_stream.next().await;

        let _ = stop.send(());
        Ok(())
    }

    #[tracing::instrument(skip_all)]
    async fn open_microphone_access_settings(&self) -> Result<(), crate::Error> {
        std::process::Command::new("open")
            .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone")
            .spawn()?
            .wait()?;
        Ok(())
    }

    #[tracing::instrument(skip_all)]
    async fn open_system_audio_access_settings(&self) -> Result<(), crate::Error> {
        std::process::Command::new("open")
            .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_AudioCapture")
            .spawn()?
            .wait()?;
        Ok(())
    }

    #[tracing::instrument(skip_all)]
    async fn get_state(&self) -> crate::fsm::State {
        let state = self.state::<crate::SharedState>();
        let guard = state.lock().await;
        guard.fsm.state().clone()
    }

    #[tracing::instrument(skip_all)]
    async fn get_mic_muted(&self) -> bool {
        let state = self.state::<crate::SharedState>();

        {
            let guard = state.lock().await;
            guard.fsm.is_mic_muted()
        }
    }

    #[tracing::instrument(skip_all)]
    async fn get_speaker_muted(&self) -> bool {
        let state = self.state::<crate::SharedState>();

        {
            let guard = state.lock().await;
            guard.fsm.is_speaker_muted()
        }
    }

    #[tracing::instrument(skip_all)]
    async fn set_mic_muted(&self, muted: bool) {
        let state = self.state::<crate::SharedState>();

        {
            let mut guard = state.lock().await;
            let event = crate::fsm::StateEvent::MicMuted(muted);
            guard.fsm.handle(&event).await;
        }
    }

    #[tracing::instrument(skip_all)]
    async fn set_speaker_muted(&self, muted: bool) {
        let state = self.state::<crate::SharedState>();

        {
            let mut guard = state.lock().await;
            let event = crate::fsm::StateEvent::SpeakerMuted(muted);
            guard.fsm.handle(&event).await;
        }
    }

    #[tracing::instrument(skip_all)]
    async fn start_session(&self, session_id: impl Into<String>) {
        let state = self.state::<crate::SharedState>();
        let session_id = session_id.into();

        // Track session start in PostHog
        {
            use tauri_plugin_analytics::{typr_analytics::AnalyticsPayload, AnalyticsPluginExt};
            use tauri_plugin_auth::{AuthPluginExt, StoreKey as AuthStoreKey};
            use tauri_plugin_connector::{ConnectorPluginExt, StoreKey as ConnectorStoreKey};

            let app = self.app_handle();

            let user_id = app
                .get_from_store(AuthStoreKey::UserId)
                .ok()
                .flatten()
                .unwrap_or_else(|| "UNKNOWN".into());

            let stt_model = app
                .connector_store()
                .get::<String>(ConnectorStoreKey::SttModel)
                .ok()
                .flatten()
                .unwrap_or_else(|| "unknown".into());

            let e = AnalyticsPayload::for_user(user_id)
                .event("session_started")
                .with("session_id", session_id.clone())
                .with("stt_model", stt_model)
                .build();

            let app_clone = app.clone();
            tauri::async_runtime::spawn(async move {
                if let Err(e) = app_clone.event(e).await {
                    tracing::error!("failed_to_send_analytics: {:?}", e);
                }
            });
        }

        {
            let mut guard = state.lock().await;
            let event = crate::fsm::StateEvent::Start(session_id);
            guard.fsm.handle(&event).await;
        }
    }

    #[tracing::instrument(skip_all)]
    async fn stop_session(&self) {
        let state = self.state::<crate::SharedState>();

        {
            let mut guard = state.lock().await;
            let event = crate::fsm::StateEvent::Stop;
            guard.fsm.handle(&event).await;
        }
    }

    #[tracing::instrument(skip_all)]
    async fn pause_session(&self) {
        let state = self.state::<crate::SharedState>();

        {
            let mut guard = state.lock().await;
            let event = crate::fsm::StateEvent::Pause;
            guard.fsm.handle(&event).await;
        }
    }

    #[tracing::instrument(skip_all)]
    async fn resume_session(&self) {
        let state = self.state::<crate::SharedState>();

        {
            let mut guard = state.lock().await;
            let event = crate::fsm::StateEvent::Resume;
            guard.fsm.handle(&event).await;
        }
    }

    #[tracing::instrument(skip_all)]
    async fn get_pipeline_status(&self) -> crate::PipelineStatus {
        let state = self.state::<crate::SharedState>();
        let guard = state.lock().await;
        guard.fsm.pipeline_status().await
    }
}
