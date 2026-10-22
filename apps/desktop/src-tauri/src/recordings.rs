use std::{fs, io, path::Path};

#[derive(Default)]
pub(crate) struct CleanupReport {
    pub removed: usize,
    pub failed: usize,
}

/// Remove obsolete raw recordings and, when retention is off, combined recordings.
/// Repeating this on launch also retries files that were locked or inaccessible.
pub(crate) fn cleanup_recordings(
    app_data: &Path,
    save_recordings: bool,
) -> io::Result<CleanupReport> {
    let entries = match fs::read_dir(app_data) {
        Ok(entries) => entries,
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            return Ok(CleanupReport::default());
        }
        Err(error) => return Err(error),
    };
    let mut report = CleanupReport::default();
    for entry in entries {
        let entry = entry?;
        // Only real, immediate session directories; never traverse symlinks or
        // recurse into uploads, models, attachments, or other application data.
        if !entry.file_type()?.is_dir()
            || uuid::Uuid::parse_str(&entry.file_name().to_string_lossy()).is_err()
        {
            continue;
        }
        for filename in ["audio_mic.wav", "audio_speaker.wav", "audio.wav"] {
            if filename == "audio.wav" && save_recordings {
                continue;
            }
            let path = entry.path().join(filename);
            match fs::symlink_metadata(&path) {
                Ok(metadata) if metadata.is_file() => match fs::remove_file(&path) {
                    Ok(()) => report.removed += 1,
                    Err(_) => report.failed += 1,
                },
                Ok(_) => {}
                Err(error) if error.kind() == io::ErrorKind::NotFound => {}
                Err(_) => report.failed += 1,
            }
        }
    }
    Ok(report)
}

#[cfg(test)]
mod tests {
    use super::*;

    struct Fixture(std::path::PathBuf);

    impl Fixture {
        fn new() -> Self {
            let path =
                std::env::temp_dir().join(format!("typr-recordings-{}", uuid::Uuid::new_v4()));
            fs::create_dir(&path).unwrap();
            Self(path)
        }

        fn file(&self, relative: &str) -> std::path::PathBuf {
            let path = self.0.join(relative);
            fs::create_dir_all(path.parent().unwrap()).unwrap();
            fs::write(&path, b"preserve unless a generated recording").unwrap();
            path
        }
    }

    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    const SESSION: &str = "df1d8c52-6d9d-4471-aff1-5dbd35899cbe";

    #[test]
    fn removes_only_generated_recordings_and_is_repeatable() {
        let fixture = Fixture::new();
        let recordings = ["audio.wav", "audio_mic.wav", "audio_speaker.wav"]
            .map(|name| fixture.file(&format!("{SESSION}/{name}")));
        let preserved = [
            fixture.file("db.sqlite"),
            fixture.file("store.json"),
            fixture.file("uploads/audio.wav"),
            fixture.file("stt/audio_speaker.wav"),
            fixture.file(&format!("{SESSION}/transcript.json")),
            fixture.file(&format!("{SESSION}/uploaded.wav")),
            fixture.file(&format!("{SESSION}/attachments/audio.wav")),
        ];

        let report = cleanup_recordings(&fixture.0, false).unwrap();

        assert_eq!(report.removed, 3);
        assert_eq!(report.failed, 0);
        assert!(recordings.iter().all(|path| !path.exists()));
        assert!(preserved.iter().all(|path| path.exists()));
        assert!(fixture.0.join(SESSION).is_dir());
        assert_eq!(cleanup_recordings(&fixture.0, false).unwrap().removed, 0);
    }

    #[test]
    fn preserves_explicitly_retained_combined_audio_but_removes_raw_audio() {
        let fixture = Fixture::new();
        let combined = fixture.file(&format!("{SESSION}/audio.wav"));
        let raw = fixture.file(&format!("{SESSION}/audio_speaker.wav"));
        fixture.file(&format!("{SESSION}/audio_mic.wav"));

        let report = cleanup_recordings(&fixture.0, true).unwrap();

        assert_eq!(report.removed, 2);
        assert_eq!(report.failed, 0);
        assert!(combined.exists());
        assert!(!raw.exists());
        // Turning retention off on a later launch also removes combined audio.
        assert_eq!(cleanup_recordings(&fixture.0, false).unwrap().removed, 1);
    }

    #[test]
    fn missing_data_directory_is_harmless() {
        let fixture = Fixture::new();
        let report = cleanup_recordings(&fixture.0.join("missing"), false).unwrap();
        assert_eq!(report.removed, 0);
        assert_eq!(report.failed, 0);
    }

    #[test]
    fn does_not_delete_directories_named_like_recordings() {
        let fixture = Fixture::new();
        let nested = fixture.file(&format!("{SESSION}/audio.wav/attachment"));
        let report = cleanup_recordings(&fixture.0, false).unwrap();
        assert_eq!(report.removed, 0);
        assert!(nested.exists());
    }

    #[cfg(unix)]
    #[test]
    fn never_follows_session_or_recording_symlinks() {
        use std::os::unix::fs::symlink;

        let fixture = Fixture::new();
        let outside = Fixture::new();
        let outside_audio = outside.file("audio.wav");
        symlink(&outside.0, fixture.0.join(SESSION)).unwrap();
        assert_eq!(cleanup_recordings(&fixture.0, false).unwrap().removed, 0);
        assert!(outside_audio.exists());

        fs::remove_file(fixture.0.join(SESSION)).unwrap();
        fs::create_dir(fixture.0.join(SESSION)).unwrap();
        symlink(&outside_audio, fixture.0.join(SESSION).join("audio.wav")).unwrap();
        assert_eq!(cleanup_recordings(&fixture.0, false).unwrap().removed, 0);
        assert!(outside_audio.exists());
    }
}
