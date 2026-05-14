// https://docs.rs/minijinja/latest/minijinja/filters/trait.Filter.html

use codes_iso_639::part_1::LanguageCode;
use typr_listener_interface::{SpeakerIdentity, Word};
use itertools::Itertools;
use std::str::FromStr;

pub fn language(value: String) -> String {
    let lang_str = value.to_lowercase();
    let lang_code = LanguageCode::from_str(&lang_str).unwrap();

    // Clean up language name: "Spanish ; Castilian" -> "Spanish"
    // Take only the primary name before semicolon for cleaner prompts
    lang_code
        .language_name()
        .split(';')
        .next()
        .unwrap_or(lang_code.language_name())
        .trim()
        .to_string()
}

pub fn timeline(words: String) -> String {
    let words: Vec<Word> = serde_json::from_str(&words).unwrap();

    words
        .iter()
        .chunk_by(|word| word.speaker.clone())
        .into_iter()
        .map(|(speaker, group)| {
            let speaker_label = match speaker {
                Some(SpeakerIdentity::Unassigned { index }) => {
                    if index == 0 {
                        "YOU".to_string()
                    } else {
                        "THEM".to_string()
                    }
                }
                Some(SpeakerIdentity::Assigned { .. }) => "THEM".to_string(),
                None => "THEM".to_string(),
            };

            format!(
                "{}:\n{}",
                speaker_label,
                group.map(|word| word.text.as_str()).join(" ")
            )
        })
        .join("\n\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_language() {
        assert_eq!(language("en".to_string()), "English");
        assert_eq!(language("ko".to_string()), "Korean");
        assert_eq!(language("es".to_string()), "Spanish"); // Should be "Spanish" not "Spanish ; Castilian"
        assert_eq!(language("zh".to_string()), "Chinese"); // Should be "Chinese" not "Chinese ; Mandarin"
    }

    #[test]
    fn test_timeline() {
        insta::assert_snapshot!(timeline(typr_data::english_3::WORDS_JSON.to_string()), @r###"
        YOU:
        project update

        THEM:
        ship the local model

        YOU:
        document the setup steps
        "###);
    }
}
