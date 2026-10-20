//! Explicit opt-in real model tests. No downloads or model stubs.
use std::{path::PathBuf, time::Instant};
use typr_nemotron_runtime::native::Recognizer;

fn evaluate(language: &str, audio_variable: &str) {
    let library =
        PathBuf::from(std::env::var_os("TYPR_NEMOTRON_SDK_LIBRARY").expect("set SDK library path"));
    let model =
        PathBuf::from(std::env::var_os("TYPR_NEMOTRON_MODEL").expect("set verified GGUF path"));
    let audio =
        PathBuf::from(std::env::var_os(audio_variable).expect("set 16kHz mono PCM16 WAV path"));
    let mut wav = hound::WavReader::open(audio).unwrap();
    assert_eq!(wav.spec().sample_rate, 16_000);
    assert_eq!(wav.spec().channels, 1);
    assert_eq!(wav.spec().bits_per_sample, 16);
    let samples: Vec<f32> = wav
        .samples::<i16>()
        .map(|sample| sample.unwrap() as f32 / 32768.0)
        .collect();
    let gpu = std::env::var("TYPR_NEMOTRON_GPU")
        .unwrap_or_else(|_| "-1".into())
        .parse()
        .unwrap();
    let recognizer = Recognizer::open_with_gpu(&library, &model, language, gpu).unwrap();
    let mut stream = recognizer.stream().unwrap();
    let start = Instant::now();
    let mut partial_at = None;
    let mut final_words = Vec::new();
    let mut final_count = 0;
    let mut max_position = 0;
    for (index, chunk) in samples.chunks(5120).enumerate() {
        for result in stream.push(chunk).unwrap() {
            max_position = max_position.max(result.audio_processed_ms);
            if !result.is_final && !result.text.trim().is_empty() && partial_at.is_none() {
                partial_at = Some(((index * 5120 + chunk.len()) * 1000 / 16000, start.elapsed()));
            }
            if result.is_final {
                final_count += 1;
                final_words.extend(result.words);
            }
        }
    }
    assert!(
        final_count > 0,
        "must commit endpoint results before end of recording"
    );
    for result in stream.finish().unwrap() {
        assert!(result.is_final);
        final_count += 1;
        max_position = max_position.max(result.audio_processed_ms);
        final_words.extend(result.words);
    }
    assert!(
        partial_at.is_some(),
        "must produce interim text before finish"
    );
    assert!(
        !final_words.is_empty(),
        "must produce timestamped committed words"
    );
    assert!(final_words.iter().all(
        |word| matches!((word.start_ms, word.end_ms), (Some(start), Some(end)) if end >= start)
    ));
    assert!(
        final_words
            .windows(2)
            .all(|pair| pair[0].start_ms <= pair[1].start_ms),
        "endpoint commits must preserve global word timestamps"
    );
    assert!(final_words
        .iter()
        .all(|word| word.end_ms.unwrap() <= samples.len() as u64 * 1000 / 16000 + 2000));
    assert!(max_position <= samples.len() as u64 * 1000 / 16000 + 2000);
    assert!(stream.push(&[0.0]).is_err());
    assert!(stream.finish().is_err());
    // Transcript output is deliberate evaluation evidence, never an app log.
    println!("language={language} audio_ms={} decode_ms={} first_partial={partial_at:?} final_count={final_count} words={} text={}", samples.len() * 1000 / 16000, start.elapsed().as_millis(), final_words.len(), final_words.iter().map(|word| word.text.as_str()).collect::<Vec<_>>().join(" "));
}

#[test]
#[ignore = "requires pinned SDK/model and licensed English fixture path"]
fn english_real_native_streaming() {
    evaluate("en-US", "TYPR_NEMOTRON_AUDIO_EN");
}

#[test]
#[ignore = "requires pinned SDK/model and licensed Spanish fixture path"]
fn spanish_real_native_streaming() {
    evaluate("es-ES", "TYPR_NEMOTRON_AUDIO_ES");
}
