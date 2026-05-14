use serde::{Deserialize, Serialize};
use typr_listener_interface::{SpeakerIdentity, Word};

const POLL_INTERVAL_MS: u64 = 2000;
const MAX_POLL_ATTEMPTS: u32 = 300; // 10 minutes max

#[derive(Debug, Serialize)]
struct TranscriptRequest {
    audio_url: String,
    speech_models: Vec<String>,
    speaker_labels: bool,
    language_detection: bool,
}

#[derive(Debug, Deserialize)]
struct TranscriptSubmitResponse {
    id: String,
}

#[derive(Debug, Deserialize)]
struct TranscriptStatusResponse {
    status: String,
    error: Option<String>,
    words: Option<Vec<AaiWord>>,
}

#[derive(Debug, Deserialize)]
struct AaiWord {
    text: String,
    start: u64,
    end: u64,
    confidence: Option<f64>,
    speaker: Option<String>,
}

pub async fn transcribe_with_provider(
    api_base: &str,
    api_key: &str,
    audio_path: &str,
) -> Result<Vec<Word>, crate::Error> {
    transcribe_with_assemblyai(api_base, api_key, audio_path).await
}

async fn transcribe_with_assemblyai(
    api_base: &str,
    api_key: &str,
    audio_path: &str,
) -> Result<Vec<Word>, crate::Error> {
    let client = reqwest::Client::new();

    let file_bytes = tokio::fs::read(audio_path)
        .await
        .map_err(|e| crate::Error::UnknownError(format!("Failed to read audio file: {e}")))?;

    let upload_url_str = format!("{}/v2/upload", api_base.trim_end_matches('/'));
    let upload_resp = client
        .post(&upload_url_str)
        .header("Authorization", api_key)
        .header("Content-Type", "application/octet-stream")
        .body(file_bytes)
        .send()
        .await?;

    if !upload_resp.status().is_success() {
        let status = upload_resp.status();
        let body = upload_resp.text().await.unwrap_or_default();
        return Err(crate::Error::UnknownError(format!(
            "Upload failed ({status}): {body}"
        )));
    }

    let upload_json: serde_json::Value = upload_resp.json().await?;

    let uploaded_audio_url = upload_json["upload_url"]
        .as_str()
        .ok_or_else(|| crate::Error::UnknownError("Missing upload_url in response".to_string()))?
        .to_string();

    let transcript_url = format!("{}/v2/transcript", api_base.trim_end_matches('/'));
    let request_body = TranscriptRequest {
        audio_url: uploaded_audio_url,
        speech_models: vec!["universal-3-pro".to_string(), "universal-2".to_string()],
        speaker_labels: true,
        language_detection: true,
    };

    let submit_resp = client
        .post(&transcript_url)
        .header("Authorization", api_key)
        .json(&request_body)
        .send()
        .await?;

    if !submit_resp.status().is_success() {
        let status = submit_resp.status();
        let body = submit_resp.text().await.unwrap_or_default();
        return Err(crate::Error::UnknownError(format!(
            "Transcript submit failed ({status}): {body}"
        )));
    }

    let submit_json: TranscriptSubmitResponse = submit_resp.json().await?;
    let transcript_id = submit_json.id;

    let status_url = format!(
        "{}/v2/transcript/{transcript_id}",
        api_base.trim_end_matches('/')
    );

    for _ in 0..MAX_POLL_ATTEMPTS {
        tokio::time::sleep(tokio::time::Duration::from_millis(POLL_INTERVAL_MS)).await;

        let poll_resp = client
            .get(&status_url)
            .header("Authorization", api_key)
            .send()
            .await?;

        if !poll_resp.status().is_success() {
            let status = poll_resp.status();
            let body = poll_resp.text().await.unwrap_or_default();
            return Err(crate::Error::UnknownError(format!(
                "Poll failed ({status}): {body}"
            )));
        }

        let status_json: TranscriptStatusResponse = poll_resp.json().await?;

        match status_json.status.as_str() {
            "completed" => {
                let words = status_json.words.unwrap_or_default();
                return Ok(map_words(words));
            }
            "error" => {
                let msg = status_json
                    .error
                    .unwrap_or_else(|| "Unknown error".to_string());
                return Err(crate::Error::UnknownError(format!(
                    "Transcription failed: {msg}"
                )));
            }
            _ => {
                // queued or processing — keep polling
            }
        }
    }

    Err(crate::Error::UnknownError(
        "Transcription timed out after 10 minutes".to_string(),
    ))
}

fn map_words(aai_words: Vec<AaiWord>) -> Vec<Word> {
    aai_words
        .into_iter()
        .map(|w| Word {
            text: w.text,
            start_ms: Some(w.start),
            end_ms: Some(w.end),
            confidence: w.confidence.map(|c| c as f32),
            speaker: w.speaker.as_deref().map(speaker_label_to_identity),
        })
        .collect()
}

/// Maps AssemblyAI speaker labels ("A", "B", ...) to SpeakerIdentity::Unassigned { index }
fn speaker_label_to_identity(label: &str) -> SpeakerIdentity {
    let index = label.chars().next().map(|c| c as u8 - b'A').unwrap_or(0);
    SpeakerIdentity::Unassigned { index }
}
