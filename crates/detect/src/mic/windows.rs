use std::time::Instant;

use tokio::time::{interval, Duration};
use winreg::{enums::HKEY_CURRENT_USER, RegKey};

use crate::{BackgroundTask, DetectCallback};

const MIC_CAPABILITY_KEY: &str =
    "Software\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\microphone";

#[derive(Default)]
pub struct Detector {
    background: BackgroundTask,
}

impl crate::Observer for Detector {
    fn start(&mut self, f: DetectCallback) {
        self.background.start(|running, mut rx| async move {
            let mut ticker = interval(Duration::from_secs(2));
            let mut last_emit_at: Option<Instant> = None;
            let emit_interval = Duration::from_secs(5);

            tracing::info!("🚀 Windows microphone activity detection started");

            loop {
                tokio::select! {
                    _ = &mut rx => {
                        break;
                    }
                    _ = ticker.tick() => {
                        if !running.load(std::sync::atomic::Ordering::SeqCst) {
                            break;
                        }

                        let mic_in_use = is_microphone_in_use().unwrap_or(false);
                        if mic_in_use {
                            let now = Instant::now();
                            let should_emit = last_emit_at
                                .is_none_or(|last| now.duration_since(last) >= emit_interval);
                            if should_emit {
                                f("microphone_in_use".to_string());
                                last_emit_at = Some(now);
                            }
                        } else {
                            last_emit_at = None;
                        }
                    }
                }
            }

            tracing::info!("🛑 Windows microphone activity detection stopped");
        });
    }

    fn stop(&mut self) {
        self.background.stop();
    }
}

fn is_microphone_in_use() -> Result<bool, std::io::Error> {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let root = hkcu.open_subkey(MIC_CAPABILITY_KEY)?;
    Ok(key_or_descendant_is_active(&root, 0))
}

fn key_or_descendant_is_active(key: &RegKey, depth: usize) -> bool {
    if depth > 4 {
        return false;
    }

    let start = key.get_value::<u64, _>("LastUsedTimeStart").unwrap_or(0);
    let stop = key.get_value::<u64, _>("LastUsedTimeStop").unwrap_or(0);
    if start > 0 && stop == 0 {
        return true;
    }

    for subkey_name in key.enum_keys().flatten() {
        if let Ok(subkey) = key.open_subkey(subkey_name) {
            if key_or_descendant_is_active(&subkey, depth + 1) {
                return true;
            }
        }
    }

    false
}
