// https://github.com/tazz4843/whisper-rs/blob/master/examples/audio_transcription.rs

use lazy_static::lazy_static;
use regex::Regex;

#[cfg(feature = "actual")]
use once_cell::sync::OnceCell;

#[cfg(feature = "actual")]
use whisper_rs::{
    FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters, WhisperState,
    WhisperTokenId,
};

use typr_whisper::Language;

lazy_static! {
    static ref TRAILING_DOTS: Regex = Regex::new(r"\.{2,}$").unwrap();
}

#[derive(Debug, Default)]
pub struct Segment {
    pub text: String,
    pub language: Option<String>,
    pub start: f32,
    pub end: f32,
    pub confidence: f32,
    pub meta: Option<serde_json::Value>,
}

#[derive(Default)]
pub struct WhisperBuilder {
    model_path: Option<String>,
    languages: Option<Vec<Language>>,
    static_prompt: Option<String>,
    dynamic_prompt: Option<String>,
}

impl WhisperBuilder {
    pub fn model_path(mut self, model_path: impl Into<String>) -> Self {
        self.model_path = Some(model_path.into());
        self
    }

    pub fn languages(mut self, languages: Vec<Language>) -> Self {
        self.languages = Some(languages);
        self
    }

    pub fn static_prompt(mut self, static_prompt: impl Into<String>) -> Self {
        self.static_prompt = Some(static_prompt.into());
        self
    }

    pub fn dynamic_prompt(mut self, dynamic_prompt: impl Into<String>) -> Self {
        self.dynamic_prompt = Some(dynamic_prompt.into());
        self
    }

    #[cfg(feature = "actual")]
    pub fn build(self) -> Result<Whisper, crate::Error> {
        unsafe { Self::suppress_log() };

        let context_param = {
            let mut p = WhisperContextParameters::default();
            p.gpu_device = 0;
            p.use_gpu = true;
            p.flash_attn = false; // crash on macos
            p.dtw_parameters.mode = whisper_rs::DtwMode::None;
            p
        };

        let model_path = self.model_path.unwrap();

        if !std::path::Path::new(&model_path).exists() {
            return Err(crate::Error::ModelNotFound);
        }

        let ctx = WhisperContext::new_with_params(&model_path, context_param)?;
        let state = ctx.create_state()?;
        let token_beg = ctx.token_beg();

        let languages = self.languages.unwrap_or_default();
        let static_prompt = self.static_prompt.unwrap_or_default();
        let dynamic_prompt = self.dynamic_prompt.unwrap_or_default();
        tracing::info!(
            "[WHISPER_BUILD] languages={:?} languages_count={} static_prompt_enabled={} dynamic_prompt_enabled={}",
            languages,
            languages.len(),
            !static_prompt.trim().is_empty(),
            !dynamic_prompt.trim().is_empty()
        );

        Ok(Whisper {
            id: uuid::Uuid::new_v4().to_string(),
            index: 0,
            languages,
            static_prompt,
            dynamic_prompt,
            state,
            token_beg,
            session_language: OnceCell::new(),
        })
    }

    #[cfg(feature = "actual")]
    unsafe fn suppress_log() {
        unsafe extern "C" fn noop_callback(
            _level: whisper_rs::whisper_rs_sys::ggml_log_level,
            _text: *const ::std::os::raw::c_char,
            _user_data: *mut ::std::os::raw::c_void,
        ) {
        }
        unsafe { whisper_rs::set_log_callback(Some(noop_callback), std::ptr::null_mut()) };
    }

    #[cfg(not(feature = "actual"))]
    pub fn build(self) -> Result<(), crate::Error> {
        // Return error when whisper_rs is not compiled
        Err(crate::Error::NotSupported(
            "whisper-rs not compiled".to_string(),
        ))
    }
}

#[cfg(feature = "actual")]
pub struct Whisper {
    #[allow(dead_code)]
    id: String,
    #[allow(dead_code)]
    index: usize,
    languages: Vec<Language>,
    static_prompt: String,
    dynamic_prompt: String,
    state: WhisperState,
    token_beg: WhisperTokenId,
    session_language: OnceCell<String>,
}

#[cfg_attr(not(any(test, feature = "actual")), allow(dead_code))]
fn build_initial_prompt(static_prompt: &str, dynamic_prompt: &str) -> String {
    [static_prompt.trim(), dynamic_prompt.trim()]
        .into_iter()
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("\n")
}

#[cfg(feature = "actual")]
impl Whisper {
    pub fn builder() -> WhisperBuilder {
        WhisperBuilder::default()
    }

    pub fn transcribe(&mut self, audio: &[f32]) -> Result<Vec<Segment>, crate::Error> {
        #[cfg(debug_assertions)]
        self.debug(audio);

        tracing::debug!(
            "[WHISPER_TRANSCRIBE] Starting transcription of {:.2}s audio ({} samples)",
            audio.len() as f32 / 16000.0,
            audio.len()
        );

        let input_audio_length_sec = audio.len() as f32 / 16000.0;
        if input_audio_length_sec < 0.1 {
            tracing::warn!(input_audio_length_sec = ?input_audio_length_sec, "transcribe_skipped");
            return Ok(vec![]);
        }

        let token_beg = self.token_beg;
        let language = self.get_language(audio)?;

        let params = {
            let mut p = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });

            let initial_prompt = build_initial_prompt(&self.static_prompt, &self.dynamic_prompt);

            tracing::info!(input_audio_length_sec = ?input_audio_length_sec, "transcribe_started");

            p.set_translate(false);
            p.set_detect_language(false);
            p.set_language(language.as_deref());

            p.set_initial_prompt(&initial_prompt);

            unsafe {
                Self::suppress_beg(&mut p, &token_beg);
            }

            p.set_no_timestamps(true);
            p.set_token_timestamps(false);
            p.set_split_on_word(true);

            p.set_temperature(0.0);
            p.set_temperature_inc(0.2);

            p.set_single_segment(true);
            p.set_suppress_blank(true);
            p.set_suppress_nst(true);

            p.set_print_special(false);
            p.set_print_progress(false);
            p.set_print_realtime(false);
            p.set_print_timestamps(false);
            p
        };

        self.state.full(params, &audio[..])?;
        let num_segments = self.state.full_n_segments();

        let mut segments = Vec::new();
        for i in 0..num_segments {
            let segment = match self.state.get_segment(i) {
                Some(seg) => seg,
                None => continue,
            };

            let (start, end) = (
                (segment.start_timestamp() as f64) / 100.0,
                (segment.end_timestamp() as f64) / 100.0,
            );

            let text = {
                let segment_text = segment.to_str_lossy()?;
                TRAILING_DOTS.replace(&segment_text, "").to_string()
            };

            segments.push(Segment {
                text,
                language: language.clone(),
                start: start as f32,
                end: end as f32,
                // https://github.com/ggml-org/whisper.cpp/pull/971/files#diff-2d3599a9fad195f2c3c60bd06691bc1815325b3560b5feda41a91fa71194e805R310-R327
                // We previously implemented it based on above, but after updating to v1.7.6, the API has changed, and we're still unable to figure it out. We're not using it anyway.
                confidence: 1.0,
                meta: None,
            });
        }

        let segments = Self::filter_segments(segments);

        let full_text = segments
            .iter()
            .map(|s| s.text.as_str())
            .collect::<Vec<&str>>()
            .join(" ");

        if !full_text.is_empty() {
            tracing::info!(text_length = full_text.len(), "transcribe_completed");
            self.dynamic_prompt = full_text;
        }

        Ok(segments)
    }

    fn get_language(&mut self, audio: &[f32]) -> Result<Option<String>, crate::Error> {
        tracing::info!(
            "[GET_LANGUAGE] Called with languages.len()={}, languages={:?}",
            self.languages.len(),
            self.languages
        );

        // Empty = Full auto-detect (recommended default)
        if self.languages.is_empty() {
            tracing::info!("[GET_LANGUAGE] Empty languages - full auto-detect mode (detects all 100+ languages)");
            return Ok(None);
        }

        // Already detected in this session? Return cached (for consistency)
        if let Some(lang) = self.session_language.get() {
            tracing::info!("[GET_LANGUAGE] Using cached session language: {}", lang);
            return Ok(Some(lang.clone()));
        }

        // Need at least 4 seconds for reliable detection
        let audio_duration = audio.len() as f32 / 16000.0;
        if audio_duration < 4.0 {
            tracing::debug!(
                "[GET_LANGUAGE] Waiting for more audio before language detection: {:.2}s / 4.0s",
                audio_duration
            );
            // Use first language temporarily (will detect properly on next chunk)
            return Ok(Some(self.languages[0].to_string()));
        }

        // Perform language detection
        self.state.pcm_to_mel(audio, 1)?;
        let (_lang_id, lang_probs) = self.state.lang_detect(0, 1)?;

        // Single language = HINT mode (prefer it, but fall back if confidence is low)
        if self.languages.len() == 1 {
            let preferred_lang = &self.languages[0];
            let preferred_lang_id = preferred_lang.whisper_index();
            let preferred_confidence = if preferred_lang_id < lang_probs.len() {
                lang_probs[preferred_lang_id]
            } else {
                0.0
            };

            // Confidence threshold for HINT mode
            const MIN_CONFIDENCE: f32 = 0.3;

            if preferred_confidence > MIN_CONFIDENCE {
                tracing::info!(
                    "[GET_LANGUAGE] Using preferred language: {} (confidence={:.4}, threshold={:.2})",
                    preferred_lang, preferred_confidence, MIN_CONFIDENCE
                );
                self.session_language.set(preferred_lang.to_string()).ok();
                return Ok(Some(preferred_lang.to_string()));
            }

            // Low confidence - fall back to full auto-detect (safety mechanism)
            tracing::warn!(
                "[GET_LANGUAGE] Low confidence ({:.4} < {:.2}) for preferred language {}, falling back to full auto-detect",
                preferred_confidence, MIN_CONFIDENCE, preferred_lang
            );
            return Ok(None); // Let Whisper auto-detect among all languages
        }

        // Multiple languages = Constrained detection with fallback
        let mut best_lang = None;
        let mut best_prob = f32::NEG_INFINITY;

        for lang in &self.languages {
            let lang_id = lang.whisper_index();
            if lang_id < lang_probs.len() && lang_probs[lang_id] > best_prob {
                best_prob = lang_probs[lang_id];
                best_lang = Some(lang.as_ref().to_string());
            }
        }

        // Confidence threshold for multi-language mode
        const MIN_CONFIDENCE_MULTI: f32 = 0.3;

        if best_prob > MIN_CONFIDENCE_MULTI {
            let detected = best_lang.unwrap_or_else(|| self.languages[0].to_string());
            self.session_language.set(detected.clone()).ok();
            tracing::info!(
                "[GET_LANGUAGE] Detected among specified languages: {} (confidence={:.4}, threshold={:.2})",
                detected, best_prob, MIN_CONFIDENCE_MULTI
            );
            return Ok(Some(detected));
        }

        // Low confidence - fall back to full auto-detect
        tracing::warn!(
            "[GET_LANGUAGE] Low confidence ({:.4} < {:.2}) among specified languages {:?}, falling back to full auto-detect",
            best_prob, MIN_CONFIDENCE_MULTI, self.languages
        );
        Ok(None)
    }

    fn filter_segments(segments: Vec<Segment>) -> Vec<Segment> {
        segments
            .into_iter()
            .filter(|s| {
                let t = s.text.trim().to_lowercase();

                if s.confidence < 0.005
                    || t == "you"
                    || t == "thank you"
                    || t == "you."
                    || t == "thank you."
                    || t == "🎵"
                {
                    false
                } else {
                    true
                }
            })
            .collect()
    }

    unsafe fn suppress_beg(params: &mut FullParams, token_beg: &WhisperTokenId) {
        unsafe extern "C" fn logits_filter_callback(
            _ctx: *mut whisper_rs::whisper_rs_sys::whisper_context,
            _state: *mut whisper_rs::whisper_rs_sys::whisper_state,
            _tokens: *const whisper_rs::whisper_rs_sys::whisper_token_data,
            _n_tokens: std::os::raw::c_int,
            logits: *mut f32,
            user_data: *mut std::os::raw::c_void,
        ) {
            if logits.is_null() || user_data.is_null() {
                return;
            }

            let token_beg_id = *(user_data as *const WhisperTokenId);
            *logits.offset(token_beg_id as isize) = f32::NEG_INFINITY;
        }

        params.set_filter_logits_callback(Some(logits_filter_callback));
        params.set_filter_logits_callback_user_data(
            token_beg as *const WhisperTokenId as *mut std::ffi::c_void,
        );
    }

    fn debug(&mut self, audio: &[f32]) {
        if let Ok(v) = std::env::var("TYPR_WHISPER_DEBUG") {
            if v == "1" {
                let mut writer = hound::WavWriter::create(
                    format!("./whisper_{}_{}.wav", self.id, self.index),
                    hound::WavSpec {
                        channels: 1,
                        sample_rate: 16000,
                        bits_per_sample: 32,
                        sample_format: hound::SampleFormat::Float,
                    },
                )
                .unwrap();
                self.index += 1;

                for sample in audio {
                    writer.write_sample(*sample).unwrap();
                }
                writer.finalize().unwrap();
            }
        }
    }
}

#[cfg(test)]
mod prompt_tests {
    use super::build_initial_prompt;

    #[test]
    fn initial_prompt_combines_static_and_dynamic_context() {
        assert_eq!(
            build_initial_prompt("The following terms may appear: Typr", "previous text"),
            "The following terms may appear: Typr\nprevious text"
        );
    }

    #[test]
    fn initial_prompt_omits_empty_parts() {
        assert_eq!(build_initial_prompt("  Typr  ", ""), "Typr");
        assert_eq!(
            build_initial_prompt("", "  previous text  "),
            "previous text"
        );
        assert_eq!(build_initial_prompt("", ""), "");
    }
}

#[cfg(all(test, feature = "actual"))]
mod tests {
    use super::*;
    use futures_util::StreamExt;

    #[test]
    fn test_whisper() {
        let mut whisper = Whisper::builder()
            .model_path(concat!(env!("CARGO_MANIFEST_DIR"), "/model.bin"))
            .build()
            .unwrap();

        let audio: Vec<f32> = typr_data::english_1::AUDIO
            .chunks_exact(2)
            .map(|chunk| i16::from_le_bytes([chunk[0], chunk[1]]) as f32 / 32768.0)
            .collect();

        let segments = whisper.transcribe(&audio).unwrap();
        assert!(segments.len() > 0);
    }

    #[tokio::test]
    async fn test_whisper_with_llama() {
        let llama_path = dirs::data_dir()
            .unwrap()
            .join("com.typr.dev")
            .join("typr-llm.gguf");

        let llama = typr_llama::Llama::new(llama_path).unwrap();

        let mut whisper = Whisper::builder()
            .model_path(concat!(env!("CARGO_MANIFEST_DIR"), "/model.bin"))
            .build()
            .unwrap();

        let request = typr_llama::LlamaRequest {
            messages: vec![typr_llama::LlamaChatMessage::new(
                "user".into(),
                "Generate a json array of 1 random objects, about animals".into(),
            )
            .unwrap()],
            ..Default::default()
        };

        let response: String = llama.generate_stream(request).unwrap().collect().await;
        assert!(response.len() > 4);

        let audio: Vec<f32> = typr_data::english_1::AUDIO
            .chunks_exact(2)
            .map(|chunk| i16::from_le_bytes([chunk[0], chunk[1]]) as f32 / 32768.0)
            .take(16000 * 30)
            .collect();

        let segments = whisper.transcribe(&audio).unwrap();
        assert!(segments.len() > 0);
    }
}
