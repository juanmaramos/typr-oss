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

## Release Steps

1. Confirm `apps/desktop/src-tauri/tauri.conf.json` has the intended version.
2. Confirm the updater public key in `tauri.conf.json` matches `TAURI_SIGNING_PRIVATE_KEY`.
3. Run `gitleaks detect --source . --redact --no-banner` locally, or confirm the `Secret Scan` workflow is green.
4. Run the `Validate Release Secrets` workflow manually and fix any reported secret or credential issues.
5. Publish the release with one of these equivalent paths:
   - Push a tag matching the app version, for example `v0.1.11`.
   - Run `OSS Release` manually with `publish=true`.
6. Let the `OSS Release` workflow publish the GitHub Release assets and `latest.json`.
7. Download the release asset on a clean macOS machine and verify Gatekeeper opens it without warning.
8. Update the Homebrew tap after the release assets exist:

   ```bash
   scripts/render_homebrew_cask.sh <version> <aarch64-dmg-sha256> <x64-dmg-sha256> > Casks/typr.rb
   ```

   Commit that file to `juanmaramos/homebrew-typr`, then run `brew audit --cask --strict typr` and a local install smoke test.

Manual `workflow_dispatch` runs default to a draft prerelease tag named `oss-test-v<version>-<run>` so the signing and notarization path can be tested without changing the public latest release. Set `publish=true` only when you want the run to publish the official `v<version>` release.
