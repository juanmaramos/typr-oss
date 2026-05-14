use std::{
    collections::{HashMap, HashSet},
    time::Instant,
};

use tokio::time::{interval, Duration};

use crate::{BackgroundTask, DetectCallback};

#[derive(Default)]
pub struct Detector {
    background: BackgroundTask,
}

impl crate::Observer for Detector {
    fn start(&mut self, f: DetectCallback) {
        self.background.start(|running, mut rx| async move {
            let mut ticker = interval(Duration::from_secs(3));
            let mut system = sysinfo::System::new_all();
            let mut known_meeting_apps: HashSet<String> = HashSet::new();
            let mut last_emit_at: HashMap<String, Instant> = HashMap::new();
            let emit_interval = Duration::from_secs(30);

            tracing::info!("🚀 Windows app detection started");

            loop {
                tokio::select! {
                    _ = &mut rx => {
                        break;
                    }
                    _ = ticker.tick() => {
                        if !running.load(std::sync::atomic::Ordering::SeqCst) {
                            break;
                        }

                        system.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
                        let mut currently_detected: HashSet<String> = HashSet::new();

                        let now = Instant::now();

                        for process in system.processes().values() {
                            let name = process.name().to_string_lossy();
                            if super::is_meeting_app_identifier(&name) {
                                let normalized = super::normalize_identifier(&name);
                                currently_detected.insert(normalized.clone());

                                if known_meeting_apps.insert(normalized.clone()) {
                                    tracing::info!("✅ Meeting app detected on Windows: {}", normalized);
                                }

                                let should_emit = last_emit_at
                                    .get(&normalized)
                                    .is_none_or(|last| now.duration_since(*last) >= emit_interval);
                                if should_emit {
                                    f(normalized.clone());
                                    last_emit_at.insert(normalized, now);
                                }
                            }
                        }

                        known_meeting_apps.retain(|app| currently_detected.contains(app));
                        last_emit_at.retain(|app, _| currently_detected.contains(app));
                    }
                }
            }

            tracing::info!("🛑 Windows app detection stopped");
        });
    }

    fn stop(&mut self) {
        self.background.stop();
    }
}
