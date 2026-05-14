use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, specta::Type, schemars::JsonSchema)]
pub struct ConfigGeneral {
    pub autostart: bool,
    #[specta(type = String)]
    #[schemars(with = "String", regex(pattern = "^[a-zA-Z]{2}$"))]
    pub display_language: typr_language::Language,
    #[specta(type = Vec<String>)]
    #[serde(default)]
    pub spoken_languages: Vec<typr_language::Language>,
    #[serde(default)]
    pub jargons: Vec<String>,
    pub telemetry_consent: bool,
    pub save_recordings: Option<bool>,
    pub selected_template_id: Option<String>,
    #[specta(type = String)]
    #[schemars(with = "String", regex(pattern = "^[a-zA-Z]{2}$"))]
    #[serde(default)]
    pub summary_language: typr_language::Language,
    #[serde(default)]
    pub show_consent_notification: bool,
    #[serde(default = "default_show_upcoming_in_sidebar")]
    pub show_upcoming_in_sidebar: bool,
}

pub(crate) fn default_show_upcoming_in_sidebar() -> bool {
    !cfg!(target_os = "windows")
}

impl Default for ConfigGeneral {
    fn default() -> Self {
        Self {
            autostart: false,
            display_language: typr_language::ISO639::En.into(),
            spoken_languages: vec![],
            jargons: vec![],
            telemetry_consent: true,
            save_recordings: None,
            selected_template_id: None,
            summary_language: typr_language::ISO639::En.into(),
            show_consent_notification: true,
            show_upcoming_in_sidebar: default_show_upcoming_in_sidebar(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, specta::Type, schemars::JsonSchema)]
pub struct ConfigNotification {
    pub before: bool,
    pub auto: bool,
    #[serde(rename = "ignoredPlatforms")]
    pub ignored_platforms: Option<Vec<String>>,
}

impl Default for ConfigNotification {
    fn default() -> Self {
        Self {
            before: true,
            auto: true,
            ignored_platforms: None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, specta::Type, schemars::JsonSchema)]
pub struct ConfigAI {
    pub api_base: Option<String>,
    pub api_key: Option<String>,
    pub ai_specificity: Option<u8>,
    pub redemption_time_ms: Option<u32>,
}

impl Default for ConfigAI {
    fn default() -> Self {
        Self {
            api_base: None,
            api_key: None,
            ai_specificity: Some(3),
            redemption_time_ms: Some(600),
        }
    }
}
