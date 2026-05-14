use typr_db_user::{Session, Space, Tag};

/// Format a list of sessions as markdown
pub fn sessions_to_markdown(sessions: Vec<Session>) -> String {
    if sessions.is_empty() {
        return "No sessions found.".to_string();
    }

    let mut result = format!("# Found {} session(s)\n\n", sessions.len());

    for session in sessions {
        result.push_str(&format!("## {}\n\n", &session.title));

        result.push_str(&format!("- **ID**: `{}`\n", session.id));
        result.push_str(&format!("- **Created**: {}\n", session.created_at));

        // Brief summary if available
        if let Some(memo) = &session.enhanced_memo_html {
            // Simple HTML strip for brief display (take first 150 chars)
            let brief = strip_html_simple(memo);
            let truncated = if brief.len() > 150 {
                format!("{}...", &brief[..150])
            } else {
                brief
            };
            result.push_str(&format!("- **Summary**: {}\n", truncated));
        }

        result.push_str("\n---\n\n");
    }

    result
}

/// Format a single session with full details
pub fn session_detail_to_markdown(session: Session) -> String {
    let mut result = String::new();

    result.push_str(&format!("# {}\n\n", &session.title));

    result.push_str(&format!("**Created**: {}\n\n", session.created_at));

    if let Some(space_id) = &session.space_id {
        result.push_str(&format!("**Project ID**: `{}`\n\n", space_id));
    }

    // Enhanced memo (summary) - strip HTML for markdown
    if let Some(memo_html) = &session.enhanced_memo_html {
        result.push_str("## Summary\n\n");
        result.push_str(&strip_html_simple(memo_html));
        result.push_str("\n\n");
    }

    if let Some(memo_html) = &session.auto_enhanced_memo_html {
        result.push_str("## Auto Summary\n\n");
        result.push_str(&strip_html_simple(memo_html));
        result.push_str("\n\n");
    }

    if !session.raw_memo_html.trim().is_empty() {
        result.push_str("## Notes\n\n");
        result.push_str(&strip_html_simple(&session.raw_memo_html));
        result.push_str("\n\n");
    }

    // Metadata
    if let Some(event_id) = &session.calendar_event_id {
        result.push_str(&format!("**Calendar Event**: {}\n\n", event_id));
    }

    result
}

/// Format tags as markdown
pub fn tags_to_markdown(tags: Vec<Tag>) -> String {
    if tags.is_empty() {
        return "No tags found.".to_string();
    }

    let mut result = format!("# Found {} tag(s)\n\n", tags.len());
    for tag in tags {
        result.push_str(&format!("- **{}** — ID: `{}`\n", tag.name, tag.id));
    }
    result
}

/// Format projects/spaces as markdown
pub fn projects_to_markdown(projects: Vec<Space>) -> String {
    if projects.is_empty() {
        return "No projects found.".to_string();
    }

    let mut result = format!("# Found {} project(s)\n\n", projects.len());
    for project in projects {
        result.push_str(&format!("## {}\n\n", project.name));
        result.push_str(&format!("- **ID**: `{}`\n", project.id));
        if let Some(description) = project.description {
            if !description.trim().is_empty() {
                result.push_str(&format!("- **Description**: {}\n", description.trim()));
            }
        }
        result.push_str(&format!("- **Updated**: {}\n\n", project.updated_at));
    }
    result
}

/// Format transcript as markdown dialogue
pub fn transcript_to_markdown(session: Session) -> String {
    let mut result = String::new();

    result.push_str(&format!("# {} - Transcript\n\n", &session.title));

    result.push_str(&format!("**Date**: {}\n\n", session.created_at));

    if session.words.is_empty() {
        result.push_str("*No transcript available*\n");
        return result;
    }

    result.push_str("## Dialogue\n\n");

    // Group consecutive words by speaker for better readability
    let mut current_speaker: Option<String> = None;
    let mut current_text = String::new();

    for word in &session.words {
        // Extract speaker name from SpeakerIdentity
        let speaker = match &word.speaker {
            Some(typr_listener_interface::SpeakerIdentity::Assigned { .. }) => "Them".to_string(),
            Some(typr_listener_interface::SpeakerIdentity::Unassigned { index }) => {
                if *index == 0 {
                    "You".to_string()
                } else {
                    "Them".to_string()
                }
            }
            None => "Them".to_string(),
        };

        if current_speaker.as_ref() != Some(&speaker) {
            // Flush previous speaker's text
            if !current_text.is_empty() {
                result.push_str(&format!(
                    "**{}**: {}\n\n",
                    current_speaker.as_deref().unwrap_or("Unknown"),
                    current_text.trim()
                ));
                current_text.clear();
            }
            current_speaker = Some(speaker);
        }

        current_text.push_str(&word.text);
        current_text.push(' ');
    }

    // Flush last speaker's text
    if !current_text.is_empty() {
        result.push_str(&format!(
            "**{}**: {}\n\n",
            current_speaker.as_deref().unwrap_or("Unknown"),
            current_text.trim()
        ));
    }

    result
}

/// Simple HTML tag stripper (basic implementation)
fn strip_html_simple(html: &str) -> String {
    let mut result = String::new();
    let mut in_tag = false;

    for ch in html.chars() {
        match ch {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ if !in_tag => result.push(ch),
            _ => {}
        }
    }

    result.trim().to_string()
}
