use crate::{Config, ConfigAI, ConfigGeneral, ConfigNotification};

use super::{GetSessionFilter, Human, Session, UserDatabase};

#[cfg(debug_assertions)]
use super::{Calendar, Organization, Platform};

pub async fn ensure_user_and_config(
    db: &UserDatabase,
    user_id: impl Into<String>,
) -> Result<(), crate::Error> {
    let user_id = user_id.into();

    // Check if user already exists - if so, don't overwrite their data
    let existing_user = db.get_human(&user_id).await?;

    if existing_user.is_none() {
        // Create user record first (required for foreign key constraint)
        let user = Human {
            id: user_id.clone(),
            is_user: true,
            full_name: Some("User".to_string()),
            ..Human::default()
        };
        db.upsert_human(user).await?;
    }

    // Only create config if it doesn't exist (don't overwrite existing user settings)
    if db.get_config(&user_id).await?.is_none() {
        db.set_config(Config {
            id: uuid::Uuid::new_v4().to_string(),
            user_id: user_id.clone(),
            general: ConfigGeneral {
                jargons: vec!["Typr".to_string()],
                ..Default::default()
            },
            notification: ConfigNotification::default(),
            ai: ConfigAI::default(),
        })
        .await?;
    }

    Ok(())
}

pub async fn create_welcome_note_once(
    db: &UserDatabase,
    user_id: impl Into<String>,
) -> Result<(), crate::Error> {
    let user_id = user_id.into();
    let thank_you_session_id = db.thank_you_session_id();

    if db
        .get_session(GetSessionFilter::Id(thank_you_session_id.clone()))
        .await?
        .is_some()
    {
        return Ok(());
    }

    let user_language = match db.get_config(&user_id).await {
        Ok(Some(config)) => config.general.display_language.to_string(),
        _ => "en".to_string(),
    };

    let (title, content) = match user_language.as_str() {
        "es" => (
            "¡Bienvenido a Typr!".to_string(),
            r#"# ¡Bienvenido a Typr!

Typr es tu bloc de notas privado con IA que transcribe reuniones, mejora tus notas y te permite conversar con tu contenido — todo completamente offline. Nada sale de tu dispositivo, asegurando que tus pensamientos y conversaciones permanezcan privados.

Mira este video de 30 segundos para ver cómo funciona:

<onboarding-video></onboarding-video>

# ¿Cómo funciona Typr?

- 📝 **Notas privadas** - Tus pensamientos y notas personales permanecen completamente privados
- 🎤 **Transcripción en vivo** - Crea una nota nueva para capturar audio en tiempo real, completamente offline
- 🤖 **Resumen IA** - Alterna entre tus notas privadas y resúmenes generados por IA
- 💬 **Chatea con reuniones** - Haz preguntas sobre cualquier transcripción

# ¿Listo para empezar?

¡Crea una nota para tu próxima reunión y experimenta Typr en acción!"#,
        ),
        _ => (
            "Welcome to Typr".to_string(),
            r#"# Welcome to Typr!

Typr is your private AI-powered notepad that transcribes meetings, enhances your notes, and lets you chat with your content — all completely offline. Nothing leaves your device, ensuring your thoughts and conversations stay yours.

Watch this 30-second video to see how Typr's live transcription and AI enhancement work together:

<onboarding-video></onboarding-video>

# How Typr works?

- 📝 **Private notes** - Your personal thoughts and notes stay completely private
- 🎤 **Live transcription** - Create a new note to capture audio in real-time, completely offline
- 🤖 **AI Summary** - Toggle between your raw notes and AI-organized summaries
- 💬 **Chat with meetings** - Ask questions about any transcribed conversation

# Ready to start?

Create a note for your next meeting and experience Typr in action!"#,
        ),
    };

    let welcome_session = Session {
        id: thank_you_session_id,
        title,
        raw_memo_html: typr_buffer::opinionated_md_to_html(content).unwrap(),
        source_type: Some("system_welcome".to_string()),
        ..new_default_session(&user_id)
    };

    let _ = db.upsert_session(welcome_session).await?;
    Ok(())
}

pub async fn onboarding(db: &UserDatabase, user_id: impl Into<String>) -> Result<(), crate::Error> {
    let user_id = user_id.into();
    ensure_user_and_config(db, user_id.clone()).await?;
    create_welcome_note_once(db, user_id).await
}

#[cfg(debug_assertions)]
pub async fn seed(db: &UserDatabase, user_id: impl Into<String>) -> Result<(), crate::Error> {
    let user_id = user_id.into();
    let now = chrono::Utc::now();

    // Simple organization setup
    let org = Organization {
        id: uuid::Uuid::new_v4().to_string(),
        name: "Acme Corp".to_string(),
        description: Some("Software company".to_string()),
    };

    let alex = Human {
        id: uuid::Uuid::new_v4().to_string(),
        full_name: Some("Alex Smith".to_string()),
        email: Some("alex@acme.com".to_string()),
        organization_id: Some(org.id.clone()),
        is_user: false,
        ..Human::default()
    };

    // Simple calendar
    let calendar = Calendar {
        id: uuid::Uuid::new_v4().to_string(),
        user_id: user_id.clone(),
        tracking_id: "work-calendar".to_string(),
        name: "Work".to_string(),
        platform: Platform::Apple,
        selected: true,
        source: None,
    };

    // Seed one past session with synthetic transcript data
    let sessions = vec![
        Session {
            title: "Project Standup Notes".to_string(),
            created_at: now - chrono::Duration::days(2),
            visited_at: now - chrono::Duration::days(2),
            calendar_event_id: None,
            raw_memo_html: typr_buffer::opinionated_md_to_html(
                "### Meeting Notes\n- Discussed sprint goals\n- Reviewed blockers\n- Planned next iteration",
            ).unwrap(),
            enhanced_memo_html: Some(
                typr_buffer::opinionated_md_to_html(
                    "### Enhanced Summary\n- **Sprint Goals**: Complete user authentication\n- **Blockers**: API rate limiting issue\n- **Next Steps**: Implement caching solution",
                ).unwrap(),
            ),
            // Add some synthetic transcript words
            words: serde_json::from_str::<Vec<typr_listener_interface::Word>>(
                &typr_data::english_4::WORDS_JSON,
            ).unwrap(),
            ..new_default_session(&user_id)
        },
    ];

    // Insert data in proper order (foreign key constraints)
    // 1. Organizations first
    db.upsert_organization(org).await?;

    // 2. Humans second (user must exist before sessions can reference it).
    // The real user row is created by ensure_user_and_config and may already
    // contain onboarding/profile edits, so debug seed data must not overwrite it.
    if db.get_human(user_id.clone()).await?.is_none() {
        db.upsert_human(Human {
            id: user_id.clone(),
            is_user: true,
            full_name: Some("Demo User".to_string()),
            ..Human::default()
        })
        .await?;
    }
    db.upsert_human(alex.clone()).await?;

    // 3. Calendars
    db.upsert_calendar(calendar).await?;

    // 4. Sessions last (after user_id exists in humans table)
    for session in sessions {
        let s = db.upsert_session(session).await?;
        // Add Alex as participant to first session
        if s.title == "Project Standup Notes" {
            db.session_add_participant(&s.id, &alex.id).await?;
        }
    }

    Ok(())
}

fn new_default_session(user_id: impl Into<String>) -> Session {
    let now = chrono::Utc::now();

    Session {
        id: uuid::Uuid::new_v4().to_string(),
        user_id: user_id.into(),
        title: "".to_string(),
        created_at: now,
        visited_at: now,
        calendar_event_id: None,
        raw_memo_html: "".to_string(),
        enhanced_memo_html: None,
        auto_enhanced_memo_html: None,
        conversations: vec![],
        words: vec![],
        record_start: None,
        record_end: None,
        pre_meeting_memo_html: None,
        source_type: Some("manual".to_string()),
        source_metadata: None,
        space_id: None,
        needs_enhance: false,
    }
}

#[cfg(test)]
mod tests {
    use crate::{tests::setup_db, GetSessionFilter};

    #[tokio::test]
    async fn create_welcome_note_once_does_not_overwrite_existing_note() {
        let db = setup_db().await;
        let user_id = uuid::Uuid::new_v4().to_string();

        super::ensure_user_and_config(&db, user_id.clone())
            .await
            .unwrap();
        super::create_welcome_note_once(&db, user_id.clone())
            .await
            .unwrap();

        let welcome_id = db.thank_you_session_id();
        let mut welcome = db
            .get_session(GetSessionFilter::Id(welcome_id.clone()))
            .await
            .unwrap()
            .expect("welcome note should exist");

        assert_eq!(welcome.source_type.as_deref(), Some("system_welcome"));

        welcome.title = "User edited title".to_string();
        welcome.raw_memo_html = "<p>User edited body</p>".to_string();
        db.upsert_session(welcome).await.unwrap();

        super::create_welcome_note_once(&db, user_id).await.unwrap();

        let welcome = db
            .get_session(GetSessionFilter::Id(welcome_id))
            .await
            .unwrap()
            .expect("welcome note should still exist");

        assert_eq!(welcome.title, "User edited title");
        assert_eq!(welcome.raw_memo_html, "<p>User edited body</p>");
    }
}
