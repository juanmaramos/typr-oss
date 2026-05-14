#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "macos")]
type PlatformDetector = macos::Detector;

#[cfg(target_os = "windows")]
mod windows;
#[cfg(target_os = "windows")]
type PlatformDetector = windows::Detector;

#[derive(Default)]
pub struct BrowserDetector {
    inner: PlatformDetector,
}

impl crate::Observer for BrowserDetector {
    fn start(&mut self, f: crate::DetectCallback) {
        self.inner.start(f);
    }
    fn stop(&mut self) {
        self.inner.stop();
    }
}

lazy_static::lazy_static! {
    pub static ref MEETING_REGEXES: Vec<regex::Regex> = vec![
        regex::Regex::new(r"https://meet\.google\.com/[a-z0-9]{3,4}-[a-z0-9]{3,4}-[a-z0-9]{3,4}").unwrap(),
        regex::Regex::new(r"https://[a-z0-9.-]+\.zoom\.us/j/\d+(\?pwd=[a-zA-Z0-9.]+)?").unwrap(),
        regex::Regex::new(r"https://teams\.microsoft\.com/l/meetup-join/[a-zA-Z0-9%._/\-?=&]+").unwrap(),
        regex::Regex::new(r"https://[a-z0-9.-]+\.webex\.com/(meet|join)/[a-zA-Z0-9._\-]+").unwrap(),
        regex::Regex::new(r"https://app\.cal\.com/video/[a-zA-Z0-9]+").unwrap(),
    ];
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_url_regex() {
        let test_cases = [
            ("https://meet.google.com/landing", false),
            ("https://meet.google.com/tjw-fcje-ewx", true),
            (
                "https://example.zoom.us/j/12345678901?pwd=ExamplePasscode.1",
                true,
            ),
            ("https://zoom.us/not-a-meeting", false),
            (
                "https://teams.microsoft.com/l/meetup-join/19%3ameeting_ZjQx/example?context=%7b%7d",
                true,
            ),
            ("https://teams.microsoft.com/l/chat/0/0", false),
            ("https://acme.webex.com/meet/jane.doe", true),
            ("https://acme.webex.com/schedule", false),
            ("https://app.cal.com/video/d713v9w1d2krBptPtwUAnJ", true),
            ("https://app.cal.com/booking/12345", false),
        ];

        for (url, expected_match) in test_cases {
            let matches = MEETING_REGEXES.iter().any(|re| re.is_match(url));
            assert_eq!(
                matches,
                expected_match,
                "URL '{}' should {} match the regex",
                url,
                if expected_match { "" } else { "not " }
            );
        }
    }
}
