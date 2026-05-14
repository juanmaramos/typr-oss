use std::{
    collections::{HashMap, HashSet},
    ffi::OsString,
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
            let mut ticker = interval(Duration::from_secs(5));
            let mut system = sysinfo::System::new_all();
            let mut last_emit_at: HashMap<String, Instant> = HashMap::new();
            let emit_interval = Duration::from_secs(30);

            tracing::info!("🚀 Windows browser meeting detection started");

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
                        let now = Instant::now();
                        let mut currently_detected: HashSet<String> = HashSet::new();

                        for process in system.processes().values() {
                            let process_name = process.name().to_string_lossy();
                            if !is_supported_browser_process(&process_name) {
                                continue;
                            }

                            if let Some(url) = extract_meeting_url(process.cmd()) {
                                currently_detected.insert(url.clone());

                                let should_emit = last_emit_at
                                    .get(&url)
                                    .is_none_or(|last| now.duration_since(*last) >= emit_interval);
                                if should_emit {
                                    tracing::info!("✅ Browser meeting URL detected on Windows: {}", url);
                                    f(url.clone());
                                    last_emit_at.insert(url, now);
                                }
                            }
                        }

                        last_emit_at.retain(|url, _| currently_detected.contains(url));
                    }
                }
            }

            tracing::info!("🛑 Windows browser meeting detection stopped");
        });
    }

    fn stop(&mut self) {
        self.background.stop();
    }
}

fn is_supported_browser_process(name: &str) -> bool {
    let normalized = name
        .trim()
        .to_ascii_lowercase()
        .trim_end_matches(".exe")
        .to_string();

    matches!(
        normalized.as_str(),
        "chrome" | "msedge" | "firefox" | "brave" | "opera"
    )
}

fn extract_meeting_url(cmd: &[OsString]) -> Option<String> {
    for arg in cmd {
        let candidate = arg.to_string_lossy();
        if let Some(url) = super::MEETING_REGEXES
            .iter()
            .find_map(|re| re.find(&candidate))
        {
            let mut normalized = url::Url::parse(url.as_str()).ok()?;
            normalized.set_query(None);
            return Some(normalized.to_string());
        }
    }

    None
}
