use std::io::{self, Read, Write};

use serde::{de::DeserializeOwned, Deserialize, Serialize};

pub const PROTOCOL_VERSION: u32 = 1;
pub const MAX_FRAME_BYTES: usize = 1024 * 1024;
pub const MAX_AUDIO_SAMPLES: usize = 16_000;
pub const SAMPLE_RATE: i32 = 16_000;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Channel {
    Mixed,
    Mic,
    Speaker,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case", deny_unknown_fields)]
pub enum Request {
    Start {
        protocol_version: u32,
        gpu: i32,
        model_path: String,
        language: String,
        channels: Vec<Channel>,
    },
    Configure {
        language: String,
    },
    Audio {
        channel: Channel,
        samples: Vec<f32>,
    },
    Endpoint {
        channel: Channel,
    },
    Finish {
        channel: Channel,
    },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Word {
    pub text: String,
    pub start_ms: Option<u64>,
    pub end_ms: Option<u64>,
    pub confidence: Option<f32>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case", deny_unknown_fields)]
pub enum Response {
    Ready {
        protocol_version: u32,
    },
    Configured,
    Result {
        channel: Channel,
        is_final: bool,
        text: String,
        words: Vec<Word>,
        audio_processed_ms: u64,
    },
    Finished {
        channel: Channel,
    },
    Error {
        message: String,
    },
}

/// Four-byte big-endian length followed by UTF-8 JSON. EOF is valid only before
/// a new frame; truncated prefixes and bodies are errors.
pub fn read_frame<T: DeserializeOwned>(reader: &mut impl Read) -> io::Result<Option<T>> {
    let mut length = [0_u8; 4];
    loop {
        match reader.read(&mut length[..1]) {
            Ok(0) => return Ok(None),
            Ok(_) => break,
            Err(error) if error.kind() == io::ErrorKind::Interrupted => continue,
            Err(error) => return Err(error),
        }
    }
    reader.read_exact(&mut length[1..])?;
    let length = u32::from_be_bytes(length) as usize;
    if length == 0 || length > MAX_FRAME_BYTES {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "invalid IPC frame length",
        ));
    }
    let mut bytes = vec![0; length];
    reader.read_exact(&mut bytes)?;
    serde_json::from_slice(&bytes)
        .map(Some)
        .map_err(|error| io::Error::new(io::ErrorKind::InvalidData, error))
}

pub fn write_frame<T: Serialize>(writer: &mut impl Write, value: &T) -> io::Result<()> {
    let bytes = serde_json::to_vec(value)
        .map_err(|error| io::Error::new(io::ErrorKind::InvalidData, error))?;
    if bytes.is_empty() || bytes.len() > MAX_FRAME_BYTES {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "invalid IPC frame length",
        ));
    }
    writer.write_all(&(bytes.len() as u32).to_be_bytes())?;
    writer.write_all(&bytes)?;
    writer.flush()
}

pub fn validate_channels(channels: &[Channel]) -> Result<(), String> {
    match channels {
        [Channel::Mixed] | [Channel::Mic, Channel::Speaker] => Ok(()),
        _ => Err("expected mixed audio or independent microphone and speaker channels".into()),
    }
}

pub fn validate_audio(samples: &[f32]) -> Result<(), String> {
    if samples.is_empty() || samples.len() > MAX_AUDIO_SAMPLES {
        return Err("audio frame must contain 1 to 16000 samples".into());
    }
    if samples
        .iter()
        .any(|sample| !sample.is_finite() || sample.abs() > 1.0)
    {
        return Err("audio samples must be finite normalized PCM".into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    #[test]
    fn framed_messages_round_trip_and_end_cleanly() {
        let mut bytes = Vec::new();
        write_frame(
            &mut bytes,
            &Response::Ready {
                protocol_version: PROTOCOL_VERSION,
            },
        )
        .unwrap();
        write_frame(
            &mut bytes,
            &Response::Finished {
                channel: Channel::Mic,
            },
        )
        .unwrap();
        let mut cursor = Cursor::new(bytes);
        assert_eq!(
            read_frame::<Response>(&mut cursor).unwrap(),
            Some(Response::Ready {
                protocol_version: PROTOCOL_VERSION
            })
        );
        assert_eq!(
            read_frame::<Response>(&mut cursor).unwrap(),
            Some(Response::Finished {
                channel: Channel::Mic
            })
        );
        assert_eq!(read_frame::<Response>(&mut cursor).unwrap(), None);
    }

    #[test]
    fn rejects_unbounded_and_truncated_frames() {
        for bytes in [
            vec![0],
            vec![0, 0, 0, 4, b'{'],
            vec![0; 4],
            ((MAX_FRAME_BYTES + 1) as u32).to_be_bytes().to_vec(),
        ] {
            assert!(read_frame::<Request>(&mut Cursor::new(bytes)).is_err());
        }
    }

    #[test]
    fn pcm_bounds_and_channel_identity_are_explicit() {
        assert!(validate_audio(&[0.0, -1.0, 1.0]).is_ok());
        for samples in [
            vec![],
            vec![f32::NAN],
            vec![f32::INFINITY],
            vec![1.01],
            vec![0.0; MAX_AUDIO_SAMPLES + 1],
        ] {
            assert!(validate_audio(&samples).is_err());
        }
        assert!(validate_channels(&[Channel::Mixed]).is_ok());
        assert!(validate_channels(&[Channel::Mic, Channel::Speaker]).is_ok());
        assert!(validate_channels(&[Channel::Mic, Channel::Mic]).is_err());
        assert!(validate_channels(&[Channel::Speaker]).is_err());
    }
}
