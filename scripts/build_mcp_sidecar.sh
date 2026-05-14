#!/usr/bin/env bash

set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "usage: $0 <target-triple>" >&2
  exit 1
fi

TARGET="$1"
EXE_SUFFIX=""
if [[ "$TARGET" == *windows* ]]; then
  EXE_SUFFIX=".exe"
fi

SOURCE_BIN="target/${TARGET}/release/typr-mcp${EXE_SUFFIX}"
TAURI_SIDECAR_BIN="target/release/typr-mcp-${TARGET}${EXE_SUFFIX}"

echo "Building typr-mcp sidecar for target: ${TARGET}"
cargo build --release --target "${TARGET}" -p typr-mcp-server --bin typr-mcp

if [[ ! -f "${SOURCE_BIN}" ]]; then
  echo "error: expected sidecar binary not found at ${SOURCE_BIN}" >&2
  exit 1
fi

mkdir -p target/release
cp "${SOURCE_BIN}" "${TAURI_SIDECAR_BIN}"

echo "Prepared sidecar binary: ${TAURI_SIDECAR_BIN}"
