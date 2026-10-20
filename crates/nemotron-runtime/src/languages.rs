//! Out-of-box transcription languages for the pinned Nemotron 3.5 model.
//! The model also contains adaptation-only and unused tokenizer prompt slots;
//! their presence is not evidence that transcription works without fine-tuning.
//! Source: the model card at revision 1c8deaecc64b91f034d73e08dd8b64625eb3395d.

pub struct SupportedLanguage {
    /// ISO 639-1 code used by Typr's existing spoken-language preferences.
    pub code: &'static str,
    /// The first locale is used when a preference contains only the ISO code.
    pub locales: &'static [&'static str],
}

pub const SUPPORTED_LANGUAGES: &[SupportedLanguage] = &[
    SupportedLanguage {
        code: "en",
        locales: &["en-US", "en-GB"],
    },
    SupportedLanguage {
        code: "es",
        locales: &["es-ES", "es-US"],
    },
    SupportedLanguage {
        code: "fr",
        locales: &["fr-FR", "fr-CA"],
    },
    SupportedLanguage {
        code: "it",
        locales: &["it-IT"],
    },
    SupportedLanguage {
        code: "pt",
        locales: &["pt-BR", "pt-PT"],
    },
    SupportedLanguage {
        code: "nl",
        locales: &["nl-NL"],
    },
    SupportedLanguage {
        code: "de",
        locales: &["de-DE"],
    },
    SupportedLanguage {
        code: "tr",
        locales: &["tr-TR"],
    },
    SupportedLanguage {
        code: "ru",
        locales: &["ru-RU"],
    },
    SupportedLanguage {
        code: "ar",
        locales: &["ar-AR"],
    },
    SupportedLanguage {
        code: "hi",
        locales: &["hi-IN"],
    },
    SupportedLanguage {
        code: "ja",
        locales: &["ja-JP"],
    },
    SupportedLanguage {
        code: "ko",
        locales: &["ko-KR"],
    },
    SupportedLanguage {
        code: "vi",
        locales: &["vi-VN"],
    },
    SupportedLanguage {
        code: "uk",
        locales: &["uk-UA"],
    },
    SupportedLanguage {
        code: "pl",
        locales: &["pl-PL"],
    },
    SupportedLanguage {
        code: "sv",
        locales: &["sv-SE"],
    },
    SupportedLanguage {
        code: "cs",
        locales: &["cs-CZ"],
    },
    // Existing app preferences use generic Norwegian. Select the model's
    // out-of-box Bokmål prompt, never the adaptation-only Nynorsk prompt.
    SupportedLanguage {
        code: "no",
        locales: &["nb-NO"],
    },
    SupportedLanguage {
        code: "da",
        locales: &["da-DK"],
    },
    SupportedLanguage {
        code: "bg",
        locales: &["bg-BG"],
    },
    SupportedLanguage {
        code: "fi",
        locales: &["fi-FI"],
    },
    SupportedLanguage {
        code: "hr",
        locales: &["hr-HR"],
    },
    SupportedLanguage {
        code: "sk",
        locales: &["sk-SK"],
    },
    SupportedLanguage {
        code: "zh",
        locales: &["zh-CN"],
    },
    SupportedLanguage {
        code: "hu",
        locales: &["hu-HU"],
    },
    SupportedLanguage {
        code: "ro",
        locales: &["ro-RO"],
    },
    SupportedLanguage {
        code: "et",
        locales: &["et-EE"],
    },
];

pub fn supported_locales() -> impl Iterator<Item = &'static str> {
    SUPPORTED_LANGUAGES
        .iter()
        .flat_map(|language| language.locales.iter().copied())
}

pub fn validate_locale(locale: &str) -> Result<(), String> {
    if locale == "auto" || supported_locales().any(|supported| supported == locale) {
        Ok(())
    } else {
        Err("language locale is not supported for out-of-box Nemotron transcription".into())
    }
}

pub fn locale_for_code(code: &str) -> Option<&'static str> {
    let code = if code == "nb" { "no" } else { code };
    SUPPORTED_LANGUAGES
        .iter()
        .find(|language| language.code == code)
        .map(|language| language.locales[0])
}

/// One configured language selects its exact prompt. With several supported
/// languages the native model detects the language of each utterance itself.
pub fn locale_for_languages(codes: &[&str]) -> Result<&'static str, String> {
    let locales: Vec<_> = codes
        .iter()
        .map(|code| {
            locale_for_code(code)
                .ok_or_else(|| "selected language requires another transcription model".to_string())
        })
        .collect::<Result<_, _>>()?;
    match locales.first() {
        Some(first) if locales.iter().all(|locale| locale == first) => Ok(first),
        _ => Ok("auto"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    #[test]
    fn registry_has_28_languages_and_32_unique_out_of_box_locales() {
        assert_eq!(SUPPORTED_LANGUAGES.len(), 28);
        assert_eq!(
            SUPPORTED_LANGUAGES
                .iter()
                .map(|language| language.code)
                .collect::<HashSet<_>>()
                .len(),
            28
        );
        let locales: HashSet<_> = supported_locales().collect();
        assert_eq!(locales.len(), 32);
        for language in SUPPORTED_LANGUAGES {
            assert_eq!(
                locale_for_languages(&[language.code]).unwrap(),
                language.locales[0]
            );
            for locale in language.locales {
                assert!(validate_locale(locale).is_ok());
            }
        }
        assert!(validate_locale("auto").is_ok());
    }

    #[test]
    fn adaptation_only_languages_and_unknown_prompt_aliases_are_rejected() {
        for locale in [
            "el-GR", "lt-LT", "lv-LV", "mt-MT", "sl-SI", "he-IL", "th-TH", "nn-NO", "zh-TW",
            "id-ID", "no-NO", "en",
        ] {
            assert!(validate_locale(locale).is_err(), "{locale}");
        }
        for code in ["el", "lt", "lv", "mt", "sl", "he", "th", "nn", "id", "xx"] {
            assert!(locale_for_languages(&[code]).is_err(), "{code}");
        }
        assert_eq!(locale_for_languages(&["no"]).unwrap(), "nb-NO");
        assert_eq!(locale_for_languages(&["nb"]).unwrap(), "nb-NO");
        assert_eq!(locale_for_languages(&[]).unwrap(), "auto");
        assert_eq!(locale_for_languages(&["de", "ja"]).unwrap(), "auto");
        assert!(locale_for_languages(&["de", "ja", "el"]).is_err());
    }
}
