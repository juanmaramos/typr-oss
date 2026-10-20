use std::{
    collections::HashMap,
    io::{Read, Write},
    path::Path,
};

use crate::{
    native::{Recognition, Recognizer},
    protocol::{
        read_frame, validate_channels, write_frame, Channel, Request, Response, Word,
        PROTOCOL_VERSION,
    },
};

fn emit(
    writer: &mut impl Write,
    channel: Channel,
    results: Vec<Recognition>,
) -> Result<(), String> {
    for mut result in results {
        // The v0.2.0 public C ABI returns raw interim text without word
        // alignment. Represent it only as transient display words; never
        // manufacture timestamps or use this path for committed results.
        if !result.is_final && result.words.is_empty() {
            result.words = result
                .text
                .split_whitespace()
                .map(|text| Word {
                    text: text.to_string(),
                    start_ms: None,
                    end_ms: None,
                    confidence: None,
                })
                .collect();
        }
        write_frame(
            writer,
            &Response::Result {
                channel,
                is_final: result.is_final,
                text: result.text,
                words: result.words,
                audio_processed_ms: result.audio_processed_ms,
            },
        )
        .map_err(|error| format!("worker output failed: {error}"))?;
    }
    Ok(())
}

/// Each worker owns one recognizer and one stream per source. SDK work stays on
/// this thread. The parent cancels by killing/reaping this isolated process;
/// the SDK has no interrupt callback for an in-flight decode.
pub fn run(reader: &mut impl Read, writer: &mut impl Write, library: &Path) -> Result<(), String> {
    let result = run_session(reader, writer, library);
    if let Err(message) = &result {
        let _ = write_frame(
            writer,
            &Response::Error {
                message: message.clone(),
            },
        );
    }
    result
}

fn run_session(
    reader: &mut impl Read,
    writer: &mut impl Write,
    library: &Path,
) -> Result<(), String> {
    let request: Request = read_frame(reader)
        .map_err(|error| error.to_string())?
        .ok_or("missing start frame")?;
    let Request::Start {
        protocol_version,
        gpu,
        model_path,
        language,
        channels,
    } = request
    else {
        return Err("first frame must start a session".into());
    };
    if protocol_version != PROTOCOL_VERSION {
        return Err("unsupported worker protocol version".into());
    }
    if !matches!(gpu, -1 | 0) {
        return Err("prototype GPU must be -1 (CPU) or 0 (first GPU)".into());
    }
    validate_channels(&channels)?;
    let recognizer = Recognizer::open_with_gpu(library, Path::new(&model_path), &language, gpu)?;
    let mut streams = HashMap::new();
    for channel in channels {
        streams.insert(channel, recognizer.stream()?);
    }
    write_frame(
        writer,
        &Response::Ready {
            protocol_version: PROTOCOL_VERSION,
        },
    )
    .map_err(|error| error.to_string())?;
    let mut audio_started = false;
    loop {
        let request: Request = read_frame(reader)
            .map_err(|error| error.to_string())?
            .ok_or("audio stream ended before all channels finished")?;
        match request {
            Request::Start { .. } => return Err("session already started".into()),
            Request::Configure { language } => {
                if audio_started {
                    return Err("language cannot change after audio starts".into());
                }
                let mut configured = HashMap::new();
                for channel in streams.keys() {
                    configured.insert(*channel, recognizer.stream_with_language(&language)?);
                }
                streams = configured;
                write_frame(writer, &Response::Configured).map_err(|error| error.to_string())?;
            }
            Request::Audio { channel, samples } => {
                audio_started = true;
                let stream = streams
                    .get_mut(&channel)
                    .ok_or("unknown or finished audio channel")?;
                emit(writer, channel, stream.push(&samples)?)?;
            }
            Request::Endpoint { channel } => {
                let stream = streams
                    .get_mut(&channel)
                    .ok_or("unknown or finished audio channel")?;
                emit(writer, channel, stream.endpoint()?)?;
            }
            Request::Finish { channel } => {
                let mut stream = streams
                    .remove(&channel)
                    .ok_or("unknown or finished audio channel")?;
                emit(writer, channel, stream.finish()?)?;
                write_frame(writer, &Response::Finished { channel })
                    .map_err(|error| error.to_string())?;
                if streams.is_empty() {
                    return Ok(());
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    #[test]
    fn text_only_previews_get_display_words_but_finals_are_never_invented() {
        let mut output = Vec::new();
        for is_final in [false, true] {
            emit(
                &mut output,
                Channel::Mic,
                vec![Recognition {
                    is_final,
                    text: "Hola mundo".into(),
                    words: vec![],
                    audio_processed_ms: 1000,
                }],
            )
            .unwrap();
        }
        let mut output = Cursor::new(output);
        let preview: Response = read_frame(&mut output).unwrap().unwrap();
        assert!(
            matches!(preview, Response::Result { words, is_final: false, .. } if words.len() == 2 && words.iter().all(|word| word.start_ms.is_none() && word.end_ms.is_none() && word.confidence.is_none()))
        );
        let final_result: Response = read_frame(&mut output).unwrap().unwrap();
        assert!(
            matches!(final_result, Response::Result { words, is_final: true, .. } if words.is_empty())
        );
    }

    #[test]
    fn invalid_first_request_is_a_typed_error_without_loading_native_code() {
        let mut input = Vec::new();
        write_frame(
            &mut input,
            &Request::Finish {
                channel: Channel::Mixed,
            },
        )
        .unwrap();
        let mut output = Vec::new();
        assert!(run(
            &mut Cursor::new(input),
            &mut output,
            Path::new("/unavailable-sdk")
        )
        .is_err());
        let error: Response = read_frame(&mut Cursor::new(output)).unwrap().unwrap();
        assert!(matches!(error, Response::Error { message } if message.contains("first frame")));
    }

    #[test]
    fn rejects_duplicate_channels_before_loading_a_model() {
        let mut input = Vec::new();
        write_frame(
            &mut input,
            &Request::Start {
                protocol_version: PROTOCOL_VERSION,
                gpu: -1,
                model_path: "/unavailable-model".into(),
                language: "auto".into(),
                channels: vec![Channel::Mic, Channel::Mic],
            },
        )
        .unwrap();
        let mut output = Vec::new();
        let error = run(
            &mut Cursor::new(input),
            &mut output,
            Path::new("/unavailable-sdk"),
        )
        .unwrap_err();
        assert!(error.contains("independent microphone"));
    }
}
