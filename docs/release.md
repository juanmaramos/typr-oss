# Release Process

Official Typr OSS releases are published from GitHub Releases. Maintainer builds are signed with a Developer ID certificate, notarized by Apple, and include Tauri updater artifacts.

Community forks do not receive maintainer signing credentials. Fork maintainers must use their own signing identity or distribute unsigned builds.

## Required Repository Secrets

Run `scripts/prepare_oss_release_secrets.sh --help` to generate local copy/paste values for these secrets. The script can base64-encode local Apple files, detect the installed signing identity, generate a CI keychain password, and generate a Tauri updater key outside the repo.

- `APPLE_CERTIFICATE`: base64-encoded Developer ID Application `.p12`.
- `APPLE_CERTIFICATE_PASSWORD`: password for the `.p12`.
- `KEYCHAIN_PASSWORD`: temporary CI keychain password.
- `APPLE_API_KEY_P8_B64`: base64-encoded App Store Connect API key `.p8`.
- `APPLE_API_KEY_ID`: App Store Connect API key id.
- `APPLE_API_ISSUER`: App Store Connect issuer id.
- `APPLE_SIGNING_IDENTITY`: Developer ID Application identity name.
- `TAURI_SIGNING_PRIVATE_KEY`: private updater signing key.
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: private updater signing key password, if configured.

Do not commit certificates, API keys, updater private keys, or notarization credentials.

## Local Smoke Build

Before publishing, build the stable OSS app identity locally without updater artifacts:

```bash
./scripts/build_mcp_sidecar.sh aarch64-apple-darwin
pnpm -F @typr/desktop tauri build --target aarch64-apple-darwin --config ./src-tauri/tauri.conf.stable.json --config '{"bundle":{"createUpdaterArtifacts":false},"plugins":{"updater":{"active":false}}}' --bundles app --no-sign
```

Then inspect the generated app metadata:

```bash
/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' 'apps/desktop/src-tauri/target/aarch64-apple-darwin/release/bundle/macos/Typr OSS.app/Contents/Info.plist'
/usr/libexec/PlistBuddy -c 'Print :CFBundleURLTypes' 'apps/desktop/src-tauri/target/aarch64-apple-darwin/release/bundle/macos/Typr OSS.app/Contents/Info.plist'
```

## Release Steps

1. Confirm `apps/desktop/src-tauri/tauri.conf.json` has the intended version and add `docs/releases/<version>.md` with a concise list of user-visible changes. This file supplies both the GitHub release body and the in-app updater notes. Release policy CI rejects missing or empty change lists; publication verifies both copies match.
2. Confirm the updater public key in `tauri.conf.json` matches `TAURI_SIGNING_PRIVATE_KEY`.
3. Run `gitleaks detect --source . --redact --no-banner` locally, or confirm the `Secret Scan` workflow is green.
4. Run the `Validate Release Secrets` workflow manually and fix any reported secret or credential issues.
5. Publish the release with one of these equivalent paths:
   - Push a tag matching the app version, for example `v0.1.12`.
   - Run `OSS Release` manually with `publish=true`.
6. Let the `OSS Release` workflow finish all platform builds, signature checks, and updater validation. Assets stay in a draft until all checks pass; the final job publishes the complete release and `latest.json`. A published tag cannot be overwritten by rerunning the workflow.
7. Download the release asset on a clean macOS machine and verify Gatekeeper opens it without warning.
8. Update the Homebrew tap after the release assets exist:

   ```bash
   scripts/render_homebrew_cask.sh <version> <aarch64-dmg-sha256> <x64-dmg-sha256> > Casks/typr-oss.rb
   ```

   Commit that file to `juanmaramos/homebrew-typr`, then run `brew audit --cask --strict typr-oss` and a local install smoke test.

Manual `workflow_dispatch` runs default to a draft prerelease tag named `oss-test-v<version>-<run>` so the signing and notarization path can be tested without changing the public latest release. Set `publish=true` only when you want the run to publish the official `v<version>` release.

## Apple Silicon transcription runtime

Apple Silicon releases build the pinned Nemotron SDK and private worker with a macOS 14.2 deployment target and portable CPU instructions. Every dylib and the worker receive the same Developer ID team signature and hardened runtime as the app before notarization. The release verifies the final bundle's architecture, deployment target, dependencies, signatures, and real English/Spanish transcription through the bundled worker.

Nemotron is the first-run recommendation only when its runtime is included and available. Saved connector and legacy model choices take precedence. Setup downloads the selected streaming model and its advertised Whisper recovery model; fallback completion never changes the selection. Intel macOS builds retain Whisper, and Windows retains cloud setup. Model weights download separately and are not included in the app bundle.

The publish job requires macOS Apple Silicon, macOS Intel, and Windows updater payloads, checks their manifest URLs and detached signatures, and verifies each payload against the existing updater public key. Do not rotate that key when bumping a version.
