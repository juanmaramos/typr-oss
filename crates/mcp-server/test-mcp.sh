#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
python3 "$ROOT/crates/mcp-server/tests/stdio.py" "${1:-$ROOT/target/debug/typr-mcp}" "${@:2}"
