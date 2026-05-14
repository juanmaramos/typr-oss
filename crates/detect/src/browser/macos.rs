use tokio::time::{interval, Duration};

use super::MEETING_REGEXES;
use crate::BackgroundTask;

#[derive(Debug)]
pub enum SupportedBrowsers {
    Safari,
    Chrome,
    Firefox,
}

// defaults read /Applications/Safari.app/Contents/Info.plist CFBundleIdentifier
impl SupportedBrowsers {
    pub fn bundle_id(&self) -> &str {
        match self {
            SupportedBrowsers::Safari => "com.apple.Safari",
            SupportedBrowsers::Chrome => "com.google.Chrome",
            SupportedBrowsers::Firefox => "org.mozilla.firefox",
        }
    }

    pub fn from_bundle_id(bundle_id: &str) -> Option<Self> {
        match bundle_id {
            id if id == Self::Safari.bundle_id() => Some(Self::Safari),
            id if id == Self::Chrome.bundle_id() => Some(Self::Chrome),
            id if id == Self::Firefox.bundle_id() => Some(Self::Firefox),
            _ => None,
        }
    }

    pub fn extract_url(&self) -> Option<String> {
        match self {
            SupportedBrowsers::Safari => {
                let script =
                    "tell application \"Safari\" to get URL of current tab of front window";
                run_applescript(script)
            }
            SupportedBrowsers::Chrome => {
                let script =
                    "tell application \"Google Chrome\" to get URL of active tab of front window";
                run_applescript(script)
            }
            SupportedBrowsers::Firefox => {
                let script = r#"
                tell application "Firefox"
                    set currentURL to ""
                    try
                        set currentURL to URL of active tab of front window
                    end try
                    return currentURL
                end tell
                "#;
                run_applescript(script)
            }
        }
    }
}

#[derive(Default)]
pub struct Detector {
    background: BackgroundTask,
    detected_urls: std::collections::HashSet<String>,
}

impl crate::Observer for Detector {
    fn start(&mut self, f: crate::DetectCallback) {
        let mut detected_urls = self.detected_urls.clone();

        self.background.start(|running, mut rx| async move {
            let mut interval_timer = interval(Duration::from_secs(5));

            loop {
                tokio::select! {
                    _ = &mut rx => {
                        break;
                    }
                    _ = interval_timer.tick() => {
                        if !running.load(std::sync::atomic::Ordering::SeqCst) {
                            break;
                        }

                        let ws = objc2_app_kit::NSWorkspace::sharedWorkspace();
                        let apps = ws.runningApplications();
                        for app in apps.iter() {
                            if let Some(current_bundle_id) = app.bundleIdentifier() {
                                let bundle_id_str = current_bundle_id.to_string();
                                let Some(browser) = SupportedBrowsers::from_bundle_id(&bundle_id_str) else {
                                    continue;
                                };

                                let Some(url) = browser.extract_url() else {
                                    continue;
                                };

                                if !MEETING_REGEXES.iter().any(|re| re.is_match(&url)) {
                                    continue;
                                }

                                let Ok(mut parsed_url) = url::Url::parse(&url) else {
                                    continue;
                                };
                                parsed_url.set_query(None);
                                let normalized_url = parsed_url.to_string();

                                if !detected_urls.contains(&normalized_url) {
                                    detected_urls.insert(normalized_url.clone());
                                    f(normalized_url);
                                }
                            }
                        }
                    }
                }
            }
        });
    }

    fn stop(&mut self) {
        self.background.stop();
        self.detected_urls.clear();
    }
}

fn run_applescript(script: &str) -> Option<String> {
    let output = std::process::Command::new("osascript")
        .args(["-e", script])
        .output()
        .ok()?;

    if output.status.success() {
        let url = String::from_utf8_lossy(&output.stdout).trim().to_string();

        if !url.is_empty() {
            return Some(url);
        }
    }

    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_detect() {
        let browsers = vec![
            SupportedBrowsers::Safari,
            SupportedBrowsers::Chrome,
            SupportedBrowsers::Firefox,
        ];

        for browser in browsers {
            let url = browser.extract_url();
            println!("Browser: {:?}, URL: {:?}", browser, url);
        }
    }
}
