use crate::{AppExt, StoreKey};
use serde::{Deserialize, Serialize};
use std::{io::Read, path::PathBuf};
use tauri::Manager;

#[tauri::command]
#[specta::specta]
pub async fn sentry_dsn<R: tauri::Runtime>(app: tauri::AppHandle<R>) -> Result<String, String> {
    let dsn = app.sentry_dsn();
    tracing::info!("native_sentry_dsn_requested configured={}", !dsn.is_empty());

    Ok(dsn)
}

#[tauri::command]
#[specta::specta]
pub async fn test_sentry_error() -> Result<(), String> {
    tracing::error!("🧪 Test Sentry error - checking error reporting");
    tauri_plugin_sentry::sentry::capture_message(
        "Test error from desktop app",
        tauri_plugin_sentry::sentry::Level::Error,
    );
    Err("This is a test error to verify Sentry integration".to_string())
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct ProjectFileTextExtraction {
    pub text_content: Option<String>,
    pub char_count: i64,
    pub source_units: i64,
    pub extraction_kind: String,
    pub unsupported_reason: Option<String>,
}

#[tauri::command]
#[specta::specta]
pub async fn extract_project_file_text(
    storage_path: String,
    name: String,
    mime_type: Option<String>,
) -> Result<ProjectFileTextExtraction, String> {
    let extension = std::path::Path::new(&name)
        .extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| extension.to_lowercase())
        .unwrap_or_default();

    tracing::info!(
        file_name = %name,
        extension = %extension,
        mime_type = ?mime_type,
        "[project-files] extraction:start",
    );

    let result = match extension.as_str() {
        "pdf" => extract_pdf_text(&storage_path),
        "docx" => extract_docx_text(&storage_path),
        "doc" => Ok(ProjectFileTextExtraction::unsupported(
            "Legacy .doc extraction is not available yet. Save the document as DOCX and add it again.",
            "doc",
        )),
        _ if is_text_like_project_file(&name, mime_type.as_deref()) => extract_plain_text(&storage_path),
        _ => Ok(ProjectFileTextExtraction::unsupported(
            "This file is saved to the project, but text extraction is not available for this file type yet.",
            "unsupported",
        )),
    };

    match &result {
        Ok(extraction) => tracing::info!(
            file_name = %name,
            kind = %extraction.extraction_kind,
            chars = extraction.char_count,
            source_units = extraction.source_units,
            unsupported = extraction.unsupported_reason.is_some(),
            "[project-files] extraction:complete",
        ),
        Err(error) => tracing::warn!(
            file_name = %name,
            error = %error,
            "[project-files] extraction:failed",
        ),
    }

    result
}

impl ProjectFileTextExtraction {
    fn indexed(text: String, source_units: i64, extraction_kind: &str) -> Self {
        let normalized = normalize_extracted_text(&text);
        let char_count = normalized.chars().count() as i64;

        if char_count == 0 {
            return Self::unsupported("No readable text found.", extraction_kind);
        }

        Self {
            text_content: Some(normalized),
            char_count,
            source_units,
            extraction_kind: extraction_kind.to_string(),
            unsupported_reason: None,
        }
    }

    fn unsupported(reason: impl Into<String>, extraction_kind: &str) -> Self {
        Self {
            text_content: None,
            char_count: 0,
            source_units: 0,
            extraction_kind: extraction_kind.to_string(),
            unsupported_reason: Some(reason.into()),
        }
    }
}

fn extract_plain_text(storage_path: &str) -> Result<ProjectFileTextExtraction, String> {
    let text = std::fs::read_to_string(storage_path)
        .map_err(|error| format!("Failed to read text file: {}", error))?;

    Ok(ProjectFileTextExtraction::indexed(text, 1, "text"))
}

fn extract_pdf_text(storage_path: &str) -> Result<ProjectFileTextExtraction, String> {
    let pages = pdf_extract::extract_text_by_pages(storage_path)
        .map_err(|error| format!("Failed to extract PDF text: {}", error))?;

    if pages.is_empty() {
        return Ok(ProjectFileTextExtraction::unsupported(
            "No readable PDF text found. Scanned/image-only PDFs need OCR, which is not available yet.",
            "pdf",
        ));
    }

    let text = pages
        .iter()
        .enumerate()
        .filter_map(|(index, page)| {
            let normalized_page = normalize_extracted_text(page);
            if normalized_page.is_empty() {
                return None;
            }

            Some(format!("Page {}:\n{}", index + 1, normalized_page))
        })
        .collect::<Vec<_>>()
        .join("\n\n");

    if text.trim().is_empty() {
        return Ok(ProjectFileTextExtraction::unsupported(
            "No readable PDF text found. Scanned/image-only PDFs need OCR, which is not available yet.",
            "pdf",
        ));
    }

    Ok(ProjectFileTextExtraction::indexed(
        text,
        pages.len() as i64,
        "pdf",
    ))
}

fn extract_docx_text(storage_path: &str) -> Result<ProjectFileTextExtraction, String> {
    let file = std::fs::File::open(storage_path)
        .map_err(|error| format!("Failed to open DOCX file: {}", error))?;
    let mut archive = zip::ZipArchive::new(file)
        .map_err(|error| format!("Failed to read DOCX container: {}", error))?;
    let mut document = archive
        .by_name("word/document.xml")
        .map_err(|error| format!("DOCX document body is missing: {}", error))?;
    let mut xml = String::new();
    document
        .read_to_string(&mut xml)
        .map_err(|error| format!("Failed to read DOCX document body: {}", error))?;

    let paragraphs = extract_docx_paragraphs_from_xml(&xml)?;
    let text = paragraphs
        .iter()
        .enumerate()
        .map(|(index, paragraph)| format!("Paragraph {}:\n{}", index + 1, paragraph))
        .collect::<Vec<_>>()
        .join("\n\n");

    if text.trim().is_empty() {
        return Ok(ProjectFileTextExtraction::unsupported(
            "No readable DOCX text found.",
            "docx",
        ));
    }

    Ok(ProjectFileTextExtraction::indexed(
        text,
        paragraphs.len() as i64,
        "docx",
    ))
}

fn extract_docx_paragraphs_from_xml(xml: &str) -> Result<Vec<String>, String> {
    use quick_xml::events::Event;
    use quick_xml::Reader;

    let mut reader = Reader::from_str(xml);
    reader.config_mut().trim_text(false);

    let mut paragraphs = Vec::new();
    let mut current = String::new();
    let mut in_paragraph = false;
    let mut in_text = false;
    let mut buf = Vec::new();

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(event)) => match event.name().as_ref() {
                b"w:p" => {
                    in_paragraph = true;
                    current.clear();
                }
                b"w:t" => {
                    in_text = true;
                }
                b"w:tab" if in_paragraph => current.push('\t'),
                b"w:br" | b"w:cr" if in_paragraph => current.push('\n'),
                _ => {}
            },
            Ok(Event::Empty(event)) => match event.name().as_ref() {
                b"w:tab" if in_paragraph => current.push('\t'),
                b"w:br" | b"w:cr" if in_paragraph => current.push('\n'),
                _ => {}
            },
            Ok(Event::Text(event)) if in_paragraph && in_text => {
                let text = event
                    .unescape()
                    .map_err(|error| format!("DOCX text decode error: {}", error))?;
                current.push_str(text.as_ref());
            }
            Ok(Event::End(event)) => match event.name().as_ref() {
                b"w:t" => {
                    in_text = false;
                }
                b"w:p" => {
                    in_paragraph = false;
                    let paragraph = normalize_extracted_text(&current);
                    if !paragraph.is_empty() {
                        paragraphs.push(paragraph);
                    }
                    current.clear();
                }
                _ => {}
            },
            Ok(Event::Eof) => break,
            Err(error) => return Err(format!("DOCX XML parse error: {}", error)),
            _ => {}
        }

        buf.clear();
    }

    Ok(paragraphs)
}

fn is_text_like_project_file(name: &str, mime_type: Option<&str>) -> bool {
    let normalized_name = name.to_lowercase();
    mime_type
        .map(|mime_type| mime_type.starts_with("text/"))
        .unwrap_or(false)
        || [
            ".md",
            ".markdown",
            ".txt",
            ".csv",
            ".tsv",
            ".json",
            ".jsonl",
            ".xml",
            ".html",
            ".htm",
            ".yaml",
            ".yml",
            ".log",
        ]
        .iter()
        .any(|extension| normalized_name.ends_with(extension))
}

fn normalize_extracted_text(text: &str) -> String {
    text.replace('\u{00a0}', " ")
        .lines()
        .map(|line| line.split_whitespace().collect::<Vec<_>>().join(" "))
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>()
        .join("\n")
        .trim()
        .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_extracted_text_without_flattening_lines() {
        let text = "  First\u{00a0} line  \n\n Second\t\tline ";
        assert_eq!(normalize_extracted_text(text), "First line\nSecond line");
    }

    #[test]
    fn extracts_docx_paragraphs_from_word_xml() {
        let xml = r#"
            <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
              <w:body>
                <w:p><w:r><w:t>Hello</w:t></w:r><w:r><w:tab/><w:t>world</w:t></w:r></w:p>
                <w:p><w:r><w:t>Next</w:t><w:br/><w:t>line</w:t></w:r></w:p>
              </w:body>
            </w:document>
        "#;

        assert_eq!(
            extract_docx_paragraphs_from_xml(xml).unwrap(),
            vec!["Hello world".to_string(), "Next\nline".to_string()]
        );
    }
}

#[tauri::command]
#[specta::specta]
pub async fn setup_db_for_cloud<R: tauri::Runtime>(app: tauri::AppHandle<R>) -> Result<(), String> {
    app.setup_db_for_cloud().await.map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub fn is_onboarding_needed<R: tauri::Runtime>(app: tauri::AppHandle<R>) -> Result<bool, String> {
    let store = app.desktop_store()?;
    store
        .get(StoreKey::OnboardingNeeded)
        .map_err(|e| e.to_string())
        .map(|v| v.unwrap_or(true))
}

#[tauri::command]
#[specta::specta]
pub fn set_onboarding_needed<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    v: bool,
) -> Result<(), String> {
    let store = app.desktop_store()?;
    store
        .set(StoreKey::OnboardingNeeded, v)
        .map_err(|e| e.to_string())?;

    // Explicitly save to ensure it persists before any app restart
    store.save().map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub fn get_onboarding_step<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<Option<String>, String> {
    let store = app.desktop_store()?;
    store
        .get(StoreKey::OnboardingStep)
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub fn set_onboarding_step<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    step: String,
) -> Result<(), String> {
    let store = app.desktop_store()?;
    store
        .set(StoreKey::OnboardingStep, step)
        .map_err(|e| e.to_string())?;

    // Explicitly save to ensure it persists before any app restart
    store.save().map_err(|e| e.to_string())
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct OnboardingModelSetup {
    pub status: String,
    pub stt_model: String,
    pub llm_model: String,
    pub last_error: Option<String>,
}

#[tauri::command]
#[specta::specta]
pub fn get_onboarding_model_setup<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<Option<OnboardingModelSetup>, String> {
    let store = app.desktop_store()?;
    store
        .get(StoreKey::OnboardingModelSetup)
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub fn set_onboarding_model_setup<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    setup: OnboardingModelSetup,
) -> Result<(), String> {
    let store = app.desktop_store()?;
    store
        .set(StoreKey::OnboardingModelSetup, setup)
        .map_err(|e| e.to_string())?;

    store.save().map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn ensure_welcome_note<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<bool, String> {
    let store = app.desktop_store()?;
    let dismissed = store
        .get(StoreKey::WelcomeNoteDismissed)
        .map_err(|e| e.to_string())?
        .unwrap_or(false);

    if dismissed {
        return Ok(false);
    }

    {
        let state = app.state::<tauri_plugin_db::ManagedState>();
        let guard = state.lock().await;

        let db = guard
            .db
            .as_ref()
            .ok_or_else(|| "Database not initialized".to_string())?;

        let user_id = guard
            .user_id
            .as_ref()
            .ok_or_else(|| "User not initialized".to_string())?;

        typr_db_user::init::create_welcome_note_once(db, user_id)
            .await
            .map_err(|e| e.to_string())?;
    }

    store
        .set(StoreKey::WelcomeNoteCreated, true)
        .map_err(|e| e.to_string())?;
    store.save().map_err(|e| e.to_string())?;

    Ok(true)
}

#[tauri::command]
#[specta::specta]
pub fn dismiss_welcome_note<R: tauri::Runtime>(app: tauri::AppHandle<R>) -> Result<(), String> {
    let store = app.desktop_store()?;
    store
        .set(StoreKey::WelcomeNoteDismissed, true)
        .map_err(|e| e.to_string())?;
    store
        .set(StoreKey::WelcomeNoteCreated, true)
        .map_err(|e| e.to_string())?;
    store.save().map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn set_autostart<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    autostart: bool,
) -> Result<(), String> {
    let autostart_manager = {
        use tauri_plugin_autostart::ManagerExt;
        app.autolaunch()
    };

    if autostart {
        autostart_manager.enable().map_err(|e| e.to_string())
    } else {
        autostart_manager.disable().map_err(|e| e.to_string())
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct YouTubeTranscriptSegment {
    pub text: String,
    pub start_ms: Option<u64>,
    pub end_ms: Option<u64>,
    pub speaker: Option<i32>,
    pub confidence: Option<f32>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct YouTubeVideoInfo {
    pub title: Option<String>,
    pub duration: Option<u64>,
    pub transcript: Vec<YouTubeTranscriptSegment>,
}

/// Extract video ID from YouTube URL
fn extract_video_id(url: &str) -> Result<String, String> {
    // Handle various YouTube URL formats
    if let Some(captures) = regex::Regex::new(
        r"(?:youtube\.com/watch\?v=|youtu\.be/|youtube\.com/embed/)([a-zA-Z0-9_-]{11})",
    )
    .map_err(|e| format!("Regex error: {}", e))?
    .captures(url)
    {
        if let Some(video_id) = captures.get(1) {
            return Ok(video_id.as_str().to_string());
        }
    }

    Err("Invalid YouTube URL format".to_string())
}

/// Parse YouTube transcript XML
fn parse_transcript_xml(xml_content: &str) -> Result<Vec<YouTubeTranscriptSegment>, String> {
    use quick_xml::events::Event;
    use quick_xml::Reader;

    let mut reader = Reader::from_str(xml_content);
    reader.config_mut().trim_text(true);

    let mut segments = Vec::new();
    let mut buf = Vec::new();

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(ref e)) | Ok(Event::Empty(ref e)) => {
                if e.name().as_ref() == b"text" || e.name().as_ref() == b"p" {
                    let mut start_ms = None;
                    let mut dur_ms = None;
                    let mut text = String::new();

                    // Parse attributes
                    for attr in e.attributes() {
                        let attr = attr.map_err(|e| format!("XML attribute error: {}", e))?;
                        match attr.key.as_ref() {
                            b"start" => {
                                if let Ok(start_str) = std::str::from_utf8(&attr.value) {
                                    if let Ok(start_f) = start_str.parse::<f64>() {
                                        start_ms = Some((start_f * 1000.0) as u64);
                                    }
                                }
                            }
                            b"dur" => {
                                if let Ok(dur_str) = std::str::from_utf8(&attr.value) {
                                    if let Ok(dur_f) = dur_str.parse::<f64>() {
                                        dur_ms = Some((dur_f * 1000.0) as u64);
                                    }
                                }
                            }
                            _ => {}
                        }
                    }

                    // Read text content
                    if let Ok(Event::Text(e)) = reader.read_event_into(&mut buf) {
                        text = e
                            .unescape()
                            .map_err(|e| format!("XML unescape error: {}", e))?
                            .to_string();
                    }

                    let end_ms = if let (Some(start), Some(dur)) = (start_ms, dur_ms) {
                        Some(start + dur)
                    } else {
                        None
                    };

                    segments.push(YouTubeTranscriptSegment {
                        text: html_escape::decode_html_entities(&text).to_string(),
                        start_ms,
                        end_ms,
                        speaker: None,
                        confidence: Some(1.0), // YouTube transcripts are generally high confidence
                    });
                }
            }
            Ok(Event::Eof) => break,
            Err(e) => return Err(format!("XML parsing error: {}", e)),
            _ => {}
        }

        buf.clear();
    }

    Ok(segments)
}

/// Get Claude Desktop config file path for the current platform
fn get_claude_config_path() -> Result<PathBuf, String> {
    #[cfg(target_os = "macos")]
    {
        let home = std::env::var("HOME").map_err(|_| "HOME env var not set".to_string())?;
        Ok(PathBuf::from(home)
            .join("Library/Application Support/Claude/claude_desktop_config.json"))
    }

    #[cfg(target_os = "windows")]
    {
        let appdata =
            std::env::var("APPDATA").map_err(|_| "APPDATA env var not set".to_string())?;
        Ok(PathBuf::from(appdata).join("Claude/claude_desktop_config.json"))
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        Err("Unsupported platform for Claude Desktop integration".to_string())
    }
}

#[tauri::command]
#[specta::specta]
pub async fn setup_claude_mcp<R: tauri::Runtime>(
    _app: tauri::AppHandle<R>,
) -> Result<String, String> {
    tracing::info!("Setting up Claude Desktop MCP integration");

    // Sidecar binaries (externalBin) are placed alongside the main executable
    // in Contents/MacOS/ on macOS. Tauri strips the target triple suffix when bundling.
    let exe_dir = std::env::current_exe()
        .map_err(|e| format!("Failed to get executable path: {}", e))?
        .parent()
        .ok_or_else(|| "Failed to get executable directory".to_string())?
        .to_path_buf();

    #[cfg(target_os = "windows")]
    let mcp_binary = exe_dir.join("typr-mcp.exe");

    #[cfg(not(target_os = "windows"))]
    let mcp_binary = exe_dir.join("typr-mcp");

    if !mcp_binary.exists() {
        return Err(format!("MCP binary not found at: {}", mcp_binary.display()));
    }

    // Get Claude Desktop config path
    let config_path = get_claude_config_path()?;

    // Create parent directory if it doesn't exist
    if let Some(parent) = config_path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create config directory: {}", e))?;
    }

    // Read existing config or create new one
    let mut config: serde_json::Value = if config_path.exists() {
        let content = std::fs::read_to_string(&config_path)
            .map_err(|e| format!("Failed to read config file: {}", e))?;
        serde_json::from_str(&content).map_err(|e| format!("Failed to parse config JSON: {}", e))?
    } else {
        serde_json::json!({})
    };

    // Ensure mcpServers object exists
    if !config.is_object() {
        config = serde_json::json!({});
    }

    let config_obj = config.as_object_mut().unwrap();
    if !config_obj.contains_key("mcpServers") {
        config_obj.insert("mcpServers".to_string(), serde_json::json!({}));
    }

    // Add typr server configuration
    let mcp_servers = config_obj
        .get_mut("mcpServers")
        .and_then(|v| v.as_object_mut())
        .ok_or("mcpServers is not an object")?;

    mcp_servers.insert(
        "Typr".to_string(),
        serde_json::json!({
            "command": mcp_binary.to_str().ok_or("Invalid MCP binary path")?,
        }),
    );

    // Write config back
    let json_str = serde_json::to_string_pretty(&config)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;

    std::fs::write(&config_path, json_str)
        .map_err(|e| format!("Failed to write config file: {}", e))?;

    tracing::info!(
        "Successfully configured Claude Desktop MCP at: {}",
        config_path.display()
    );

    Ok(format!(
        "Claude Desktop configured successfully. Restart Claude Desktop to activate."
    ))
}

#[tauri::command]
#[specta::specta]
pub async fn check_claude_mcp_status() -> Result<bool, String> {
    let config_path = get_claude_config_path()?;

    if !config_path.exists() {
        return Ok(false);
    }

    let content = std::fs::read_to_string(&config_path)
        .map_err(|e| format!("Failed to read config file: {}", e))?;

    let config: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse config JSON: {}", e))?;

    // Check if a Typr server is configured (support legacy "Typr" and canonical "typr").
    let has_typr = config
        .get("mcpServers")
        .and_then(|v| v.as_object())
        .map(|obj| obj.keys().any(|key| key.eq_ignore_ascii_case("typr")))
        .unwrap_or(false);

    Ok(has_typr)
}

#[tauri::command]
#[specta::specta]
pub async fn remove_claude_mcp() -> Result<String, String> {
    let config_path = get_claude_config_path()?;

    if !config_path.exists() {
        return Ok(
            "Claude Desktop config not found. Typr MCP is already disconnected.".to_string(),
        );
    }

    let content = std::fs::read_to_string(&config_path)
        .map_err(|e| format!("Failed to read config file: {}", e))?;

    let mut config: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse config JSON: {}", e))?;

    let Some(config_obj) = config.as_object_mut() else {
        return Err("Claude config root is not a JSON object".to_string());
    };

    let mut removed_count = 0usize;
    if let Some(mcp_servers) = config_obj
        .get_mut("mcpServers")
        .and_then(|v| v.as_object_mut())
    {
        let keys_to_remove: Vec<String> = mcp_servers
            .keys()
            .filter(|key| key.eq_ignore_ascii_case("typr"))
            .cloned()
            .collect();

        removed_count = keys_to_remove.len();
        for key in keys_to_remove {
            mcp_servers.remove(&key);
        }

        if mcp_servers.is_empty() {
            config_obj.remove("mcpServers");
        }
    }

    if removed_count == 0 {
        return Ok("Typr MCP is already disconnected in Claude Desktop.".to_string());
    }

    let json_str = serde_json::to_string_pretty(&config)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;

    std::fs::write(&config_path, json_str)
        .map_err(|e| format!("Failed to write config file: {}", e))?;

    tracing::info!(
        "Removed {} Typr MCP server entry(ies) from Claude config at: {}",
        removed_count,
        config_path.display()
    );

    Ok("Typr MCP disconnected successfully. Restart Claude Desktop to apply changes.".to_string())
}

#[tauri::command]
pub async fn extract_youtube_transcript(url: String) -> Result<YouTubeVideoInfo, String> {
    tracing::info!("[youtube] Starting import for URL: {}", url);

    // Extract video ID
    let video_id = extract_video_id(&url)?;
    tracing::info!("[youtube] Extracted video ID: {}", video_id);

    let client = reqwest::Client::builder()
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {}", e))?;

    // Use the InnerTube API with Android client context to get caption tracks.
    // YouTube's web client now requires PO tokens for caption URLs (exp=xpe),
    // but the Android client is not affected and returns usable URLs.
    let innertube_url = "https://www.youtube.com/youtubei/v1/player?prettyPrint=false";
    let innertube_body = serde_json::json!({
        "context": {
            "client": {
                "clientName": "ANDROID",
                "clientVersion": "20.10.38"
            }
        },
        "videoId": video_id
    });

    tracing::info!("[youtube] Fetching player data via InnerTube API (Android client)");
    let player_response = client
        .post(innertube_url)
        .header("Content-Type", "application/json")
        .header(
            "User-Agent",
            "com.google.android.youtube/20.10.38 (Linux; U; Android 14)",
        )
        .json(&innertube_body)
        .send()
        .await
        .map_err(|e| format!("Failed to fetch InnerTube player data: {}", e))?;

    let player_status = player_response.status();
    tracing::info!("[youtube] InnerTube response status: {}", player_status);

    if !player_status.is_success() {
        return Err(format!("InnerTube API returned status {}", player_status));
    }

    let player_data: serde_json::Value = player_response
        .json()
        .await
        .map_err(|e| format!("Failed to parse InnerTube response: {}", e))?;

    // Extract video title and duration
    let title = player_data
        .get("videoDetails")
        .and_then(|v| v.get("title"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    let duration = player_data
        .get("videoDetails")
        .and_then(|v| v.get("lengthSeconds"))
        .and_then(|v| v.as_str())
        .and_then(|s| s.parse::<u64>().ok())
        .map(|s| s * 1000); // Convert to milliseconds

    tracing::info!(
        "[youtube] Video title: {:?}, duration_ms: {:?}",
        title,
        duration
    );

    // Extract caption tracks
    let caption_tracks = player_data
        .get("captions")
        .and_then(|c| c.get("playerCaptionsTracklistRenderer"))
        .and_then(|p| p.get("captionTracks"))
        .and_then(|t| t.as_array())
        .ok_or_else(|| {
            let captions_dbg = player_data.get("captions");
            tracing::error!(
                "[youtube] No captionTracks found. captions subtree: {:?}",
                captions_dbg
            );
            "No captions found for this video".to_string()
        })?;

    tracing::info!("[youtube] Found {} caption track(s)", caption_tracks.len());
    for (i, track) in caption_tracks.iter().enumerate() {
        let lang = track
            .get("languageCode")
            .and_then(|v| v.as_str())
            .unwrap_or("?");
        let kind = track
            .get("kind")
            .and_then(|v| v.as_str())
            .unwrap_or("manual");
        tracing::info!("[youtube] Track {}: lang={}, kind={}", i, lang, kind);
    }

    // Find English captions
    let caption_url = caption_tracks
        .iter()
        .find(|track| {
            track
                .get("languageCode")
                .and_then(|v| v.as_str())
                .map(|lang| lang.starts_with("en"))
                .unwrap_or(false)
        })
        .and_then(|track| track.get("baseUrl"))
        .and_then(|v| v.as_str())
        .ok_or_else(|| {
            tracing::error!(
                "[youtube] No English caption track found among {} tracks",
                caption_tracks.len()
            );
            "No English captions available".to_string()
        })?;

    // Strip fmt=srv3 to get the classic XML format (<text start="..." dur="...">)
    let caption_url_clean = caption_url.replace("&fmt=srv3", "");

    tracing::info!(
        "[youtube] Fetching transcript XML from caption URL (first 120 chars): {:?}",
        &caption_url_clean.chars().take(120).collect::<String>()
    );

    // Fetch transcript XML
    let transcript_response = client
        .get(&caption_url_clean)
        .header(
            "User-Agent",
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        )
        .header("Accept-Language", "en-US")
        .send()
        .await
        .map_err(|e| format!("Failed to fetch transcript: {}", e))?;

    let xml_status = transcript_response.status();
    tracing::info!("[youtube] Transcript XML response status: {}", xml_status);

    let transcript_xml = transcript_response
        .text()
        .await
        .map_err(|e| format!("Failed to read transcript: {}", e))?;

    tracing::info!(
        "[youtube] Transcript XML length: {} chars, first 200: {:?}",
        transcript_xml.len(),
        &transcript_xml.chars().take(200).collect::<String>()
    );

    // Parse transcript
    let transcript = parse_transcript_xml(&transcript_xml)?;
    tracing::info!("[youtube] Parsed {} transcript segments", transcript.len());

    if transcript.is_empty() {
        tracing::error!("[youtube] Transcript parsed but returned 0 segments");
        return Err("No transcript segments found".to_string());
    }

    tracing::info!(
        "[youtube] Import successful: {} segments for '{:?}'",
        transcript.len(),
        title
    );

    Ok(YouTubeVideoInfo {
        title,
        duration,
        transcript,
    })
}
