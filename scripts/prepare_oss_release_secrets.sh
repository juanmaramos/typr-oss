#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TAURI_CONF="$ROOT_DIR/apps/desktop/src-tauri/tauri.conf.json"

P12_PATH=""
P8_PATH=""
APPLE_API_KEY_ID_VALUE=""
APPLE_API_ISSUER_VALUE=""
APPLE_SIGNING_IDENTITY_VALUE=""
UPDATER_KEY_PATH=""
GENERATE_UPDATER_KEY_PATH=""
UPDATER_KEY_PASSWORD_VALUE=""
NO_UPDATER_KEY_PASSWORD=0

usage() {
  cat <<'EOF'
Prepare GitHub Actions secrets for the Typr OSS release workflow.

This script prints secret names and values to paste into:
GitHub repo -> Settings -> Secrets and variables -> Actions -> New repository secret.

Usage:
  scripts/prepare_oss_release_secrets.sh [options]

Apple inputs:
  --p12 PATH                 Developer ID Application .p12 exported from Keychain.
  --p8 PATH                  App Store Connect API key .p8 file.
  --apple-key-id ID          App Store Connect API key id.
  --apple-issuer-id ID       App Store Connect issuer id.
  --signing-identity TEXT    Developer ID Application identity. Auto-detected if omitted.

Tauri updater inputs:
  --updater-key PATH              Existing Tauri updater private key file.
  --generate-updater-key PATH     Generate a new updater private key at PATH.
  --updater-key-password VALUE    Password for a generated updater key. If omitted,
                                  a random password is generated.
  --no-updater-key-password       Generate updater key without a password.

Examples:
  scripts/prepare_oss_release_secrets.sh
  scripts/prepare_oss_release_secrets.sh --p12 ~/Desktop/DeveloperIDApplication.p12
  scripts/prepare_oss_release_secrets.sh --p8 ~/Downloads/AuthKey_ABC123DEFG.p8 --apple-key-id ABC123DEFG --apple-issuer-id <issuer>
  scripts/prepare_oss_release_secrets.sh --generate-updater-key ~/.config/typr-oss/tauri-updater.key

Notes:
  - Do not generate or store updater private keys inside this repository.
  - If a new updater key is generated, commit the printed public key into tauri.conf.json.
  - GITHUB_TOKEN is provided by GitHub Actions; do not create it manually.
EOF
}

die() {
  printf 'error: %s\n' "$1" >&2
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "missing required command: $1"
}

is_inside_repo() {
  local path="$1"
  local abs_path
  local dir
  local base
  local parent
  local existing_parent

  case "$path" in
    /*) abs_path="$path" ;;
    *) abs_path="$PWD/$path" ;;
  esac

  dir="$(dirname "$abs_path")"
  base="$(basename "$abs_path")"

  if [[ -d "$dir" ]]; then
    abs_path="$(cd "$dir" && pwd -P)/$base"
  else
    parent="$dir"
    while [[ ! -d "$parent" && "$parent" != "/" ]]; do
      parent="$(dirname "$parent")"
    done
    existing_parent="$(cd "$parent" && pwd -P)"
    abs_path="$existing_parent${dir#"$parent"}/$base"
  fi

  [[ "$abs_path" == "$ROOT_DIR"/* ]]
}

ensure_parent_dir() {
  local path="$1"
  local dir
  dir="$(dirname "$path")"
  mkdir -p "$dir"
}

base64_file() {
  local path="$1"
  [[ -f "$path" ]] || die "file not found: $path"
  openssl base64 -A -in "$path"
}

random_secret() {
  openssl rand -base64 32
}

detect_signing_identity() {
  if ! command -v security >/dev/null 2>&1; then
    return 0
  fi

  security find-identity -v -p codesigning 2>/dev/null \
    | awk -F '"' '/Developer ID Application/ { print $2; exit }'
}

current_updater_pubkey() {
  if ! command -v node >/dev/null 2>&1 || [[ ! -f "$TAURI_CONF" ]]; then
    return 0
  fi

  node -e 'const fs=require("fs"); const p=process.argv[1]; const c=JSON.parse(fs.readFileSync(p,"utf8")); console.log(c.plugins?.updater?.pubkey || "");' "$TAURI_CONF"
}

print_secret() {
  local name="$1"
  local value="$2"
  if [[ -n "$value" ]]; then
    printf '%s=%s\n' "$name" "$value"
  else
    printf '# %s=<missing>\n' "$name"
  fi
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --help|-h)
      usage
      exit 0
      ;;
    --p12)
      P12_PATH="${2:-}"
      [[ -n "$P12_PATH" ]] || die "--p12 requires a path"
      shift 2
      ;;
    --p8)
      P8_PATH="${2:-}"
      [[ -n "$P8_PATH" ]] || die "--p8 requires a path"
      shift 2
      ;;
    --apple-key-id)
      APPLE_API_KEY_ID_VALUE="${2:-}"
      [[ -n "$APPLE_API_KEY_ID_VALUE" ]] || die "--apple-key-id requires a value"
      shift 2
      ;;
    --apple-issuer-id)
      APPLE_API_ISSUER_VALUE="${2:-}"
      [[ -n "$APPLE_API_ISSUER_VALUE" ]] || die "--apple-issuer-id requires a value"
      shift 2
      ;;
    --signing-identity)
      APPLE_SIGNING_IDENTITY_VALUE="${2:-}"
      [[ -n "$APPLE_SIGNING_IDENTITY_VALUE" ]] || die "--signing-identity requires a value"
      shift 2
      ;;
    --updater-key)
      UPDATER_KEY_PATH="${2:-}"
      [[ -n "$UPDATER_KEY_PATH" ]] || die "--updater-key requires a path"
      shift 2
      ;;
    --generate-updater-key)
      GENERATE_UPDATER_KEY_PATH="${2:-}"
      [[ -n "$GENERATE_UPDATER_KEY_PATH" ]] || die "--generate-updater-key requires a path"
      shift 2
      ;;
    --updater-key-password)
      UPDATER_KEY_PASSWORD_VALUE="${2:-}"
      [[ -n "$UPDATER_KEY_PASSWORD_VALUE" ]] || die "--updater-key-password requires a value"
      shift 2
      ;;
    --no-updater-key-password)
      NO_UPDATER_KEY_PASSWORD=1
      shift
      ;;
    *)
      die "unknown option: $1"
      ;;
  esac
done

require_cmd openssl

if [[ -n "$UPDATER_KEY_PATH" && -n "$GENERATE_UPDATER_KEY_PATH" ]]; then
  die "use either --updater-key or --generate-updater-key, not both"
fi

if [[ -n "$UPDATER_KEY_PATH" ]] && is_inside_repo "$UPDATER_KEY_PATH"; then
  die "refusing to read updater private key from inside the repository: $UPDATER_KEY_PATH"
fi

TAURI_SIGNING_PRIVATE_KEY_VALUE=""
TAURI_SIGNING_PRIVATE_KEY_PASSWORD_VALUE=""
GENERATED_UPDATER_PUBLIC_KEY=""

if [[ -n "$GENERATE_UPDATER_KEY_PATH" ]]; then
  if is_inside_repo "$GENERATE_UPDATER_KEY_PATH"; then
    die "refusing to generate updater private key inside the repository: $GENERATE_UPDATER_KEY_PATH"
  fi

  require_cmd pnpm

  ensure_parent_dir "$GENERATE_UPDATER_KEY_PATH"
  if [[ -e "$GENERATE_UPDATER_KEY_PATH" || -e "$GENERATE_UPDATER_KEY_PATH.pub" ]]; then
    die "updater key output already exists; choose a new path or remove it first: $GENERATE_UPDATER_KEY_PATH"
  fi

  if [[ "$NO_UPDATER_KEY_PASSWORD" -eq 0 && -z "$UPDATER_KEY_PASSWORD_VALUE" ]]; then
    UPDATER_KEY_PASSWORD_VALUE="$(random_secret)"
  fi

  if [[ -n "$UPDATER_KEY_PASSWORD_VALUE" ]]; then
    pnpm tauri signer generate --ci --write-keys "$GENERATE_UPDATER_KEY_PATH" --password "$UPDATER_KEY_PASSWORD_VALUE" >/dev/null
    TAURI_SIGNING_PRIVATE_KEY_PASSWORD_VALUE="$UPDATER_KEY_PASSWORD_VALUE"
  else
    pnpm tauri signer generate --ci --write-keys "$GENERATE_UPDATER_KEY_PATH" >/dev/null
  fi

  TAURI_SIGNING_PRIVATE_KEY_VALUE="$(tr -d '\n' < "$GENERATE_UPDATER_KEY_PATH")"
  GENERATED_UPDATER_PUBLIC_KEY="$(tr -d '\n' < "$GENERATE_UPDATER_KEY_PATH.pub")"
elif [[ -n "$UPDATER_KEY_PATH" ]]; then
  [[ -f "$UPDATER_KEY_PATH" ]] || die "updater private key file not found: $UPDATER_KEY_PATH"
  TAURI_SIGNING_PRIVATE_KEY_VALUE="$(tr -d '\n' < "$UPDATER_KEY_PATH")"
  TAURI_SIGNING_PRIVATE_KEY_PASSWORD_VALUE="$UPDATER_KEY_PASSWORD_VALUE"
fi

if [[ -z "$APPLE_SIGNING_IDENTITY_VALUE" ]]; then
  APPLE_SIGNING_IDENTITY_VALUE="$(detect_signing_identity || true)"
fi

APPLE_CERTIFICATE_VALUE=""
APPLE_API_KEY_P8_B64_VALUE=""
if [[ -n "$P12_PATH" ]]; then
  APPLE_CERTIFICATE_VALUE="$(base64_file "$P12_PATH")"
fi
if [[ -n "$P8_PATH" ]]; then
  APPLE_API_KEY_P8_B64_VALUE="$(base64_file "$P8_PATH")"
fi

cat <<'EOF'
# GitHub repository secrets for .github/workflows/oss_release.yaml
# Paste each populated KEY=value into GitHub Actions repository secrets.
# Lines starting with "# ...=<missing>" still need Apple portal or local input.

EOF

print_secret "APPLE_CERTIFICATE" "$APPLE_CERTIFICATE_VALUE"
print_secret "APPLE_CERTIFICATE_PASSWORD" ""
print_secret "KEYCHAIN_PASSWORD" "$(random_secret)"
print_secret "APPLE_API_KEY_P8_B64" "$APPLE_API_KEY_P8_B64_VALUE"
print_secret "APPLE_API_KEY_ID" "$APPLE_API_KEY_ID_VALUE"
print_secret "APPLE_API_ISSUER" "$APPLE_API_ISSUER_VALUE"
print_secret "APPLE_SIGNING_IDENTITY" "$APPLE_SIGNING_IDENTITY_VALUE"
print_secret "TAURI_SIGNING_PRIVATE_KEY" "$TAURI_SIGNING_PRIVATE_KEY_VALUE"
print_secret "TAURI_SIGNING_PRIVATE_KEY_PASSWORD" "$TAURI_SIGNING_PRIVATE_KEY_PASSWORD_VALUE"

if [[ -n "$GENERATED_UPDATER_PUBLIC_KEY" ]]; then
  CURRENT_PUBKEY="$(current_updater_pubkey || true)"
  cat <<EOF

# Generated updater public key:
$GENERATED_UPDATER_PUBLIC_KEY

# Commit this public key to:
# $TAURI_CONF
# JSON path: plugins.updater.pubkey
EOF

  if [[ -n "$CURRENT_PUBKEY" && "$CURRENT_PUBKEY" != "$GENERATED_UPDATER_PUBLIC_KEY" ]]; then
    cat <<'EOF'

# Current tauri.conf.json updater pubkey does not match the generated key.
# Update it before publishing updater-enabled releases.
EOF
  fi
fi
