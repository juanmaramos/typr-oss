# Security Policy

## Reporting A Vulnerability

Please do not open a public issue for security vulnerabilities.

Email the maintainers or use GitHub private vulnerability reporting once it is enabled for this repository. Include:

- A clear description of the issue.
- Reproduction steps or a minimal proof of concept.
- Impact and affected versions or commits.
- Any logs with secrets and personal data removed.

## Secrets And Credentials

Typr OSS must not contain maintainer-owned API keys, provider tokens, signing certificates, notarization credentials, Stripe or Keygen secrets, private S3 URLs, or hosted proxy credentials.

Cloud AI and transcription features are BYOK. User-provided keys are stored locally by the desktop app and should never be committed to this repository.

## Supported Builds

Official maintainer releases may be signed and notarized. Community forks and local builds must use their own signing identities or distribute unsigned builds.
