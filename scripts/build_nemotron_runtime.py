#!/usr/bin/env python3
"""Prepare the private native STT resources; Python is build tooling only.

Builds pinned upstream sources instead of invoking an installed ASR executable.
The Apple Silicon release bundles this runtime; model weights download during setup.
"""

import argparse
import json
import os
from pathlib import Path
import platform
import shutil
import subprocess

SDK_REPOSITORY = "https://github.com/NVIDIA/NeMo-Speech.cpp.git"
SDK_REVISION = "6a3ca369370782acee0dd155e34394ba60b920c4"
SENTENCEPIECE_REVISION = "31646a467d2051eb904e0b45de3a73e91fe1c1e3"
ROOT = Path(__file__).resolve().parents[1]


def run(*args, cwd=None):
    subprocess.run([str(arg) for arg in args], cwd=cwd, check=True)


def require_clean_source(directory):
    if ROOT.resolve().is_relative_to(directory.resolve()):
        raise RuntimeError(
            f"Native source cannot contain the app checkout: {directory}"
        )
    top_level = subprocess.check_output(
        ["git", "rev-parse", "--show-toplevel"], cwd=directory, text=True
    ).strip()
    if Path(top_level).resolve() != directory.resolve():
        raise RuntimeError(f"Native source must be its own Git checkout: {directory}")
    dirty = subprocess.check_output(
        ["git", "status", "--porcelain", "--untracked-files=no"],
        cwd=directory,
        text=True,
    ).strip()
    if dirty:
        raise RuntimeError(f"Refusing modified native source tree: {directory}")


def checkout(repository, revision, directory):
    if directory.exists():
        require_clean_source(directory)
    else:
        run(
            "git", "clone", "--filter=blob:none", "--no-checkout", repository, directory
        )
    run("git", "fetch", "--depth=1", repository, revision, cwd=directory)
    run("git", "checkout", "--detach", revision, cwd=directory)
    actual = subprocess.check_output(
        ["git", "rev-parse", "HEAD"], cwd=directory, text=True
    ).strip()
    if actual != revision:
        raise RuntimeError("Native source revision does not match the pinned revision")
    require_clean_source(directory)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--source", type=Path, help="Existing SDK checkout at the pinned revision"
    )
    # Rust cache cleanup removes files from non-Cargo trees inside target/.
    parser.add_argument("--work-dir", type=Path, default=ROOT / "build/nemotron")
    args = parser.parse_args()
    if platform.system() not in ("Darwin", "Linux"):
        parser.error(
            "This prototype build helper supports native macOS/Linux builds only"
        )
    platform_options = (
        ["-DCMAKE_OSX_DEPLOYMENT_TARGET=14.2"] if platform.system() == "Darwin" else []
    )
    work = args.work_dir.resolve()
    work.mkdir(parents=True, exist_ok=True)
    source = args.source.resolve() if args.source else work / "source"
    checkout(SDK_REPOSITORY, SDK_REVISION, source)
    run("git", "submodule", "update", "--init", "--recursive", "--depth=1", cwd=source)
    require_clean_source(source)
    submodules = subprocess.check_output(
        ["git", "submodule", "status", "--recursive"], cwd=source, text=True
    )
    if any(line and line[0] != " " for line in submodules.splitlines()):
        raise RuntimeError("Native submodules do not match the pinned source tree")

    # A private static dependency prevents runtime dependencies on Homebrew/apt.
    sp_source = work / "sentencepiece-source"
    checkout(
        "https://github.com/google/sentencepiece.git", SENTENCEPIECE_REVISION, sp_source
    )
    sp_build = work / "sentencepiece-build"
    run(
        "cmake",
        "-S",
        sp_source,
        "-B",
        sp_build,
        "-DCMAKE_BUILD_TYPE=Release",
        *platform_options,
        "-DSPM_BUILD_TEST=OFF",
        "-DSPM_ENABLE_SHARED=OFF",
        "-DSPM_ENABLE_TCMALLOC=OFF",
    )
    run(
        "cmake",
        "--build",
        sp_build,
        "--target",
        "sentencepiece-static",
        "--parallel",
        "4",
    )
    dependency = work / "dependencies/sentencepiece"
    (dependency / "lib").mkdir(parents=True, exist_ok=True)
    (dependency / "include").mkdir(exist_ok=True)
    shutil.copy2(sp_build / "src/libsentencepiece.a", dependency / "lib")
    shutil.copy2(sp_source / "src/sentencepiece_processor.h", dependency / "include")
    licenses = dependency / "share/licenses/nemo-speech/third_party/sentencepiece"
    licenses.mkdir(parents=True, exist_ok=True)
    for source_name, target_name in [
        ("LICENSE", "LICENSE"),
        ("third_party/absl/LICENSE", "absl-LICENSE"),
        ("third_party/darts_clone/LICENSE", "darts-clone-LICENSE"),
        ("third_party/protobuf-lite/LICENSE", "protobuf-lite-LICENSE"),
    ]:
        shutil.copy2(sp_source / source_name, licenses / target_name)

    native_build = work / "native-build"
    sdk = work / "sdk"
    run(
        "cmake",
        "-S",
        source,
        "-B",
        native_build,
        "-DCMAKE_BUILD_TYPE=Release",
        *platform_options,
        f"-DNEMO_SPEECH_DEPENDENCY_PREFIX={dependency.parent}",
        "-DNEMO_SPEECH_BUILD_ASR=ON",
        "-DNEMO_SPEECH_BUILD_DIAR=OFF",
        "-DNEMO_SPEECH_BUILD_TTS=OFF",
        "-DNEMO_SPEECH_BUILD_NMT=OFF",
        "-DNEMO_SPEECH_BUILD_CLI=OFF",
        "-DNEMO_SPEECH_BUILD_MIC_CAPTURE=OFF",
        "-DNEMO_SPEECH_BUILD_HTTP=OFF",
        "-DNEMO_SPEECH_BUILD_GRPC=OFF",
        "-DNEMO_SPEECH_BUILD_TESTS=OFF",
        "-DBUILD_TESTING=OFF",
        "-DNEMO_SPEECH_BUILD_EXAMPLES=OFF",
        "-DGGML_OPENMP=OFF",
        "-DGGML_NATIVE=OFF",
        f"-DGGML_METAL={'ON' if platform.system() == 'Darwin' else 'OFF'}",
    )
    run(
        "cmake",
        "--build",
        native_build,
        "--target",
        "nemo_speech_asr_c",
        "--parallel",
        "4",
    )
    run("cmake", "--install", native_build, "--prefix", sdk)
    run(
        "cargo",
        "build",
        "--release",
        "--locked",
        "-p",
        "typr-nemotron-runtime",
        "--bin",
        "typr-nemotron-worker",
        cwd=ROOT,
    )
    cargo_target = Path(os.environ.get("CARGO_TARGET_DIR", ROOT / "target")).resolve()
    runtime = ROOT / "target/nemotron/runtime"
    runtime.mkdir(parents=True, exist_ok=True)
    if (runtime / "lib").exists():
        shutil.rmtree(runtime / "lib")
    shutil.copytree(sdk / "lib", runtime / "lib", symlinks=True)
    shutil.copytree(sdk / "share/licenses", runtime / "licenses", dirs_exist_ok=True)
    shutil.copy2(cargo_target / "release/typr-nemotron-worker", runtime)
    (runtime / "runtime.json").write_text(
        json.dumps(
            {
                "sdk_version": "0.2.0",
                "sdk_revision": SDK_REVISION,
                "sentencepiece_revision": SENTENCEPIECE_REVISION,
                "worker_protocol": 1,
                "platform": platform.system(),
                "machine": platform.machine(),
            },
            indent=2,
        )
        + "\n"
    )
    if platform.system() == "Darwin":
        # Developer signatures only. Distribution still needs the normal signing identity.
        for library in sorted((runtime / "lib").glob("*.dylib")):
            if not library.is_symlink():
                run("codesign", "--force", "--sign", "-", "--timestamp=none", library)
        run(
            "codesign",
            "--force",
            "--sign",
            "-",
            "--timestamp=none",
            runtime / "typr-nemotron-worker",
        )
    # Tauri dev resolves resource_dir beside the executable; bundles use the overlay map.
    for profile in ("debug", "release"):
        destination = cargo_target / profile / "stt/nemotron"
        if destination.exists():
            shutil.rmtree(destination)
        shutil.copytree(runtime, destination, symlinks=True)
    print(f"Prepared private runtime: {runtime}")
    print(
        "Use apps/desktop/src-tauri/tauri.nemotron.conf.json and Cargo feature nemotron."
    )


if __name__ == "__main__":
    main()
