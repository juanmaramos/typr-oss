use std::{
    io::Write,
    process::{Child, Command, Stdio},
    time::{Duration, Instant},
};
use typr_nemotron_runtime::protocol::{
    read_frame, write_frame, Channel, Request, Response, MAX_FRAME_BYTES,
};

fn worker() -> Command {
    let mut command = Command::new(env!("CARGO_BIN_EXE_typr-nemotron-worker"));
    command.args(["--sdk-library", "/unavailable-sdk"]);
    command
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    command
}

fn wait_bounded(child: &mut Child) {
    let deadline = Instant::now() + Duration::from_secs(5);
    loop {
        if child.try_wait().unwrap().is_some() {
            return;
        }
        if Instant::now() >= deadline {
            let _ = child.kill();
            let _ = child.wait();
            panic!("worker did not reject input within five seconds");
        }
        std::thread::sleep(Duration::from_millis(10));
    }
}

#[test]
fn malformed_input_fails_as_framed_error_without_native_loading() {
    let mut child = worker().spawn().unwrap();
    write_frame(
        child.stdin.as_mut().unwrap(),
        &Request::Finish {
            channel: Channel::Mixed,
        },
    )
    .unwrap();
    drop(child.stdin.take());
    wait_bounded(&mut child);
    let output = child.wait_with_output().unwrap();
    assert!(!output.status.success());
    let response: Response = read_frame(&mut output.stdout.as_slice()).unwrap().unwrap();
    assert!(matches!(response, Response::Error { message } if message.contains("first frame")));
}

#[test]
fn oversized_frame_rejected_without_waiting_for_payload() {
    let mut child = worker().spawn().unwrap();
    child
        .stdin
        .as_mut()
        .unwrap()
        .write_all(&((MAX_FRAME_BYTES + 1) as u32).to_be_bytes())
        .unwrap();
    // Keep stdin open: an over-limit header must be rejected immediately.
    wait_bounded(&mut child);
    let response: Response = read_frame(child.stdout.as_mut().unwrap()).unwrap().unwrap();
    assert!(matches!(response, Response::Error { message } if message.contains("frame length")));
    assert!(!child.wait().unwrap().success());
}

#[test]
fn idle_worker_can_be_cancelled_and_reaped() {
    let mut child = worker().spawn().unwrap();
    let start = Instant::now();
    child.kill().unwrap();
    assert!(!child.wait().unwrap().success());
    assert!(start.elapsed() < Duration::from_secs(5));
}
