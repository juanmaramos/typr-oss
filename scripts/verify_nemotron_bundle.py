#!/usr/bin/env python3
"""Sign and verify the private Apple Silicon runtime before publishing an update."""

import argparse
import array
import hashlib
import os
from pathlib import Path
import re
import subprocess
import tempfile
import urllib.request
import wave

ROOT = Path(__file__).resolve().parents[1]
# Immutable QA fixture: the same weights/checksum as SupportedModel::Nemotron3p5Streaming.
MODEL_URL = "https://huggingface.co/nvidia/nemotron-3.5-asr-streaming-0.6b/resolve/1c8deaecc64b91f034d73e08dd8b64625eb3395d/nemotron-3.5-asr-streaming-0.6b.q8_0.gguf"
MODEL_SHA256 = "a5c435f294eea8f88ce68dd27b8c3bfea7f777cb2fbba04fcd30eaa555f429ae"


def output(*args):
    return subprocess.check_output(
        [str(arg) for arg in args], stderr=subprocess.STDOUT, text=True
    )


def run(*args, **kwargs):
    subprocess.run([str(arg) for arg in args], check=True, **kwargs)


def native_files(runtime):
    worker = runtime / "typr-nemotron-worker"
    sdk = runtime / "lib/libnemo_speech_asr_c.dylib"
    if not worker.is_file() or not sdk.is_file():
        raise ValueError("Missing bundled Nemotron worker or SDK")
    return sorted(
        path for path in (runtime / "lib").glob("*.dylib") if not path.is_symlink()
    ) + [worker]


def validate_macho(path, runtime):
    if output("lipo", "-archs", path).strip() != "arm64":
        raise ValueError(f"Expected an Apple Silicon binary: {path}")
    loads = output("otool", "-l", path)
    # Read only deployment commands, not dylib compatibility/current versions.
    minimums = re.findall(
        r"cmd LC_(?:BUILD_VERSION|VERSION_MIN_MACOSX)\b(.*?)(?=\nLoad command|\Z)",
        loads,
        re.S,
    )
    if not minimums:
        raise ValueError(f"Missing macOS deployment target: {path}")
    for command in minimums:
        match = re.search(r"\b(?:minos|version) (\d+)\.(\d+)", command)
        if not match or tuple(map(int, match.groups())) > (14, 2):
            raise ValueError(f"Binary requires a newer macOS than 14.2: {path}")
    for line in output("otool", "-L", path).splitlines()[1:]:
        dependency = line.strip().split(" (", 1)[0]
        if dependency.startswith(("/usr/lib/", "/System/Library/")):
            continue
        if dependency.startswith("@rpath/"):
            resolved = runtime / "lib" / dependency.removeprefix("@rpath/")
        elif dependency.startswith("@loader_path/"):
            resolved = path.parent / dependency.removeprefix("@loader_path/")
        else:
            raise ValueError(f"Non-portable runtime dependency: {dependency}")
        if (
            not resolved.resolve().is_relative_to(runtime.resolve())
            or not resolved.is_file()
        ):
            raise ValueError(f"Missing private runtime dependency: {dependency}")
    for rpath in re.findall(r"cmd LC_RPATH\b.*?\n\s*path (.*?) \(offset", loads, re.S):
        if not rpath.startswith(("@loader_path", "@executable_path")):
            raise ValueError(f"Non-portable runtime search path: {rpath}")


def team(path):
    details = output("codesign", "-dv", "--verbose=4", path)
    match = re.search(r"^TeamIdentifier=(\S+)$", details, re.M)
    hardened = re.search(
        r"^CodeDirectory .*flags=0x[0-9a-fA-F]+\([^)]*\bruntime\b", details, re.M
    )
    if not match or not hardened:
        raise ValueError(f"Missing distribution signature or hardened runtime: {path}")
    if "Timestamp=" not in details:
        raise ValueError(f"Missing secure signing timestamp: {path}")
    return match[1]


def sign(runtime):
    identity = os.environ["APPLE_SIGNING_IDENTITY"]
    for path in native_files(runtime):
        validate_macho(path, runtime)
        run(
            "codesign",
            "--force",
            "--options",
            "runtime",
            "--timestamp",
            "--sign",
            identity,
            path,
        )
        run("codesign", "--verify", "--strict", path)
        team(path)


def prepare_audio(source, destination):
    with wave.open(str(source), "rb") as audio:
        if (audio.getnchannels(), audio.getsampwidth(), audio.getframerate()) != (
            2,
            2,
            48000,
        ):
            raise ValueError("Unexpected bilingual QA fixture format")
        samples = array.array("h", audio.readframes(audio.getnframes()))
    # QA fixtures only: average channels and decimate to the worker's PCM16/16k input.
    mono = array.array(
        "h", (sum(samples[i : i + 6]) // 6 for i in range(0, len(samples) - 5, 6))
    )
    with wave.open(str(destination), "wb") as audio:
        audio.setparams((1, 2, 16000, 0, "NONE", "not compressed"))
        audio.writeframes(mono.tobytes())


def verify(app, gpu):
    runtime = app / "Contents/Resources/stt/nemotron"
    app_team = team(app)
    for path in native_files(runtime):
        validate_macho(path, runtime)
        run("codesign", "--verify", "--strict", path)
        if team(path) != app_team:
            raise ValueError(f"Runtime and app must use the same signing team: {path}")
    cache = ROOT / "target/nemotron/qa"
    cache.mkdir(parents=True, exist_ok=True)
    model = cache / "nemotron.gguf"
    if not model.exists():
        with urllib.request.urlopen(MODEL_URL, timeout=120) as response, model.open(
            "wb"
        ) as destination:
            import shutil

            shutil.copyfileobj(response, destination)
    digest = hashlib.sha256()
    with model.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    if digest.hexdigest() != MODEL_SHA256:
        model.unlink()
        raise ValueError("Nemotron QA model checksum mismatch")
    with tempfile.TemporaryDirectory() as directory:
        env = dict(
            os.environ,
            TYPR_NEMOTRON_WORKER=str((runtime / "typr-nemotron-worker").resolve()),
            TYPR_NEMOTRON_SDK_LIBRARY=str(
                (runtime / "lib/libnemo_speech_asr_c.dylib").resolve()
            ),
            TYPR_NEMOTRON_MODEL=str(model),
            TYPR_NEMOTRON_GPU=str(gpu),
        )
        for language in ("en", "es"):
            audio = Path(directory) / f"{language}.wav"
            prepare_audio(
                ROOT / f"crates/db-user/assets/demo-audio-{language}.wav", audio
            )
            env[f"TYPR_NEMOTRON_AUDIO_{language.upper()}"] = str(audio)
        run(
            "cargo",
            "test",
            "--locked",
            "-p",
            "typr-nemotron-runtime",
            "--test",
            "native_worker",
            "--",
            "--ignored",
            "--nocapture",
            cwd=ROOT,
            env=env,
        )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("sign", "verify"))
    parser.add_argument("path", type=Path)
    parser.add_argument(
        "--gpu",
        type=int,
        default=-1,
        help="CPU on CI baseline; use 0 to validate local Metal",
    )
    args = parser.parse_args()
    if args.action == "sign":
        sign(args.path.resolve())
    else:
        verify(args.path.resolve(), args.gpu)


if __name__ == "__main__":
    main()
