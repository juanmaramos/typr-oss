//! Real, opt-in IPC integration through the packaged worker binary.
use std::{
    collections::HashMap,
    path::PathBuf,
    process::{Child, Command, Stdio},
    sync::mpsc,
    time::Duration,
};
use typr_nemotron_runtime::protocol::{
    read_frame, write_frame, Channel, Request, Response, PROTOCOL_VERSION,
};

struct ReapChild(Child);
impl Drop for ReapChild {
    fn drop(&mut self) {
        let _ = self.0.kill();
        let _ = self.0.wait();
    }
}

fn samples(variable: &str) -> Vec<f32> {
    let mut wav = hound::WavReader::open(PathBuf::from(
        std::env::var_os(variable).expect("set PCM16 mono fixture"),
    ))
    .unwrap();
    assert_eq!(wav.spec().sample_rate, 16_000);
    assert_eq!(wav.spec().channels, 1);
    wav.samples::<i16>()
        .map(|sample| sample.unwrap() as f32 / 32768.0)
        .collect()
}

#[test]
#[ignore = "requires pinned SDK/model and real English/Spanish fixture paths"]
fn bilingual_dual_channel_worker_streams_and_finishes_over_framed_ipc() {
    let sdk = std::env::var_os("TYPR_NEMOTRON_SDK_LIBRARY").expect("set SDK library path");
    let model = std::env::var("TYPR_NEMOTRON_MODEL").expect("set verified model path");
    let gpu = std::env::var("TYPR_NEMOTRON_GPU")
        .unwrap_or_else(|_| "0".into())
        .parse()
        .unwrap();
    let mut child = ReapChild(
        Command::new(env!("CARGO_BIN_EXE_typr-nemotron-worker"))
            .arg("--sdk-library")
            .arg(sdk)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .unwrap(),
    );
    let mut input = child.0.stdin.take().unwrap();
    let mut output = child.0.stdout.take().unwrap();
    let (sender, receiver) = mpsc::channel();
    let reader = std::thread::spawn(move || loop {
        match read_frame::<Response>(&mut output) {
            Ok(Some(response)) => {
                if sender.send(Ok(response)).is_err() {
                    break;
                }
            }
            Ok(None) => break,
            Err(error) => {
                let _ = sender.send(Err(error));
                break;
            }
        }
    });
    let response = || {
        receiver
            .recv_timeout(Duration::from_secs(30))
            .expect("worker response deadline")
            .unwrap()
    };
    write_frame(
        &mut input,
        &Request::Start {
            protocol_version: PROTOCOL_VERSION,
            gpu,
            model_path: model,
            language: "en-US".into(),
            channels: vec![Channel::Mic, Channel::Speaker],
        },
    )
    .unwrap();
    assert_eq!(
        response(),
        Response::Ready {
            protocol_version: PROTOCOL_VERSION
        }
    );
    // The prewarmed model remains loaded; the real recording language is
    // applied before any samples. Auto permits independent English and Spanish.
    write_frame(
        &mut input,
        &Request::Configure {
            language: "auto".into(),
        },
    )
    .unwrap();
    assert_eq!(response(), Response::Configured);
    let mic = samples("TYPR_NEMOTRON_AUDIO_EN");
    let speaker = samples("TYPR_NEMOTRON_AUDIO_ES");
    for offset in (0..mic.len().max(speaker.len())).step_by(5120) {
        if offset == 5120 * 32 {
            write_frame(
                &mut input,
                &Request::Endpoint {
                    channel: Channel::Mic,
                },
            )
            .unwrap();
        }
        for (channel, samples) in [(Channel::Mic, &mic), (Channel::Speaker, &speaker)] {
            if offset < samples.len() {
                write_frame(
                    &mut input,
                    &Request::Audio {
                        channel,
                        samples: samples[offset..(offset + 5120).min(samples.len())].to_vec(),
                    },
                )
                .unwrap();
            }
        }
    }
    for channel in [Channel::Mic, Channel::Speaker] {
        write_frame(&mut input, &Request::Finish { channel }).unwrap();
    }
    drop(input);
    let mut final_text: HashMap<Channel, String> = HashMap::new();
    let mut previews: HashMap<Channel, usize> = HashMap::new();
    let mut finished = Vec::new();
    while finished.len() < 2 {
        match response() {
            Response::Result {
                channel,
                is_final,
                text,
                words,
                ..
            } => {
                if is_final {
                    final_text
                        .entry(channel)
                        .or_default()
                        .push_str(&format!(" {text}"));
                } else if !text.is_empty() {
                    assert!(!words.is_empty(), "previews require displayable words");
                    *previews.entry(channel).or_default() += 1;
                }
            }
            Response::Finished { channel } => {
                assert!(!finished.contains(&channel));
                finished.push(channel);
            }
            other => panic!("unexpected worker response: {other:?}"),
        }
    }
    assert!(previews[&Channel::Mic] > 0 && previews[&Channel::Speaker] > 0);
    assert!(final_text[&Channel::Mic].to_lowercase().contains("welcome"));
    assert!(final_text[&Channel::Speaker]
        .to_lowercase()
        .contains("bienvenida"));
    assert!(child.0.wait().unwrap().success());
    reader.join().unwrap();
}
