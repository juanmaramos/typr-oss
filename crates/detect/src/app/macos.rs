use cidre::{blocks, ns, ns::workspace::notification as wsn, objc::Obj};
use tokio::time::{sleep, Duration};

use super::is_meeting_app_identifier;
use crate::BackgroundTask;

pub struct Detector {
    background: BackgroundTask,
}

impl Default for Detector {
    fn default() -> Self {
        Self {
            background: BackgroundTask::default(),
        }
    }
}

impl crate::Observer for Detector {
    fn start(&mut self, f: crate::DetectCallback) {
        tracing::info!("🚀 Starting app detection for meeting apps");

        // Check if any meeting apps are already running
        let running_apps = cidre::ns::Workspace::shared().running_apps();
        for app in running_apps.iter() {
            if let Some(bundle_id) = app.bundle_id() {
                let bundle_str = bundle_id.to_string();
                if is_meeting_app_identifier(&bundle_str) {
                    tracing::info!("✅ Found already running meeting app: {}", bundle_str);
                    f(bundle_str.clone());
                }
            }
        }

        self.background.start(|running, mut rx| async move {
            let notification_running = running.clone();
            let block = move |n: &ns::Notification| {
                if !notification_running.load(std::sync::atomic::Ordering::SeqCst) {
                    return;
                }

                let user_info = n.user_info().unwrap();

                if let Some(app) = user_info.get(wsn::app_key()) {
                    if let Some(app) = app.try_cast(ns::RunningApp::cls()) {
                        let bundle_id = app.bundle_id().unwrap().to_string();
                        tracing::info!("🔍 App launched: {}", bundle_id); // Changed to INFO to always see

                        let detected = is_meeting_app_identifier(&bundle_id);
                        if detected {
                            tracing::info!("✅ Meeting app detected: {}", bundle_id);
                            f(bundle_id);
                        } else {
                            tracing::debug!("❌ Not a meeting app: {}", bundle_id);
                        }
                    }
                } else {
                    tracing::debug!("🤔 App launch notification has no app info");
                }
            };

            let mut block = blocks::SyncBlock::new1(block);
            let notifications = [wsn::did_launch_app()];

            let mut observers = Vec::new();
            let mut nc = ns::Workspace::shared().notification_center();

            for name in notifications {
                let observer = nc.add_observer_block(name, None, None, &mut block);
                observers.push(observer);
            }

            loop {
                tokio::select! {
                    _ = &mut rx => {
                        break;
                    }
                    _ = sleep(Duration::from_millis(500)) => {
                        if !running.load(std::sync::atomic::Ordering::SeqCst) {
                            break;
                        }
                    }
                }
            }

            let mut nc = ns::Workspace::shared().notification_center();
            for observer in observers {
                nc.remove_observer(&observer);
            }
        });
    }

    fn stop(&mut self) {
        self.background.stop();
    }
}
