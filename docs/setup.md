# Setup

## Prerequisites

- Rust stable toolchain.
- Node.js and `pnpm`.
- Xcode command line tools on macOS.
- `cmake`.
- `libomp` for local LLM support.

macOS:

```bash
brew install cmake libomp
xcode-select --install
```

## Environment

Create a local environment file:

```bash
cp .env.example .env
```

The OSS app does not require maintainer API keys. Optional environment values are for local development only:

- `VITE_TYPR_API_BASE_URL`: optional local API base for generated client experiments.
- `VITE_SENTRY_DSN`: optional frontend crash/error reporting DSN.
- `VITE_SENTRY_RELEASE`: optional Sentry release name used for source maps.
- `POSTHOG_PROJECT_API_KEY`: optional PostHog project capture key for usage analytics.
- `SENTRY_DSN`: optional Rust-side crash/error reporting DSN.

Never commit real `.env` files.

Official OSS release builds can enable opt-out telemetry through GitHub repository secrets:

- `POSTHOG_PROJECT_API_KEY`: PostHog project capture key (`phc_...`) for explicit usage events. Do not use a PostHog personal API key.
- `VITE_SENTRY_DSN`: public Sentry DSN for frontend crash/error reporting.
- `SENTRY_DSN`: public Sentry DSN for native Rust crash/error reporting. It can use the same project as `VITE_SENTRY_DSN`.
- `SENTRY_AUTH_TOKEN`: Sentry CI token for source map upload.
- `SENTRY_ORG`: Sentry organization slug.
- `SENTRY_PROJECT`: Sentry project slug.

PostHog session replay, autocapture, pageview capture, and pageleave capture are not used in the OSS app. Native Sentry release-health session tracking is also disabled; native Sentry is used for crash/error reports only and respects the stored telemetry opt-out before sending events.

## Install And Run

```bash
pnpm install
pnpm -F @typr/desktop tauri:dev
```

## AI Provider Keys

Open Settings > AI and add provider keys locally:

- OpenAI API key for OpenAI models.
- Groq API key for Groq models.
- OpenRouter API key for OpenRouter models.
- AssemblyAI API key for AssemblyAI transcription.

The app calls provider APIs directly with the user's key. There is no Typr-hosted proxy in the OSS build.

## Local Models

User-selectable local STT and LLM models are downloaded on demand from public model repositories. Downloaded model binaries are ignored by git and should not be committed.

See [models.md](models.md).

Bundled native runtime assets are documented in [bundled-assets.md](bundled-assets.md).

## Sharing

Export features are local app features. PDF and email export do not require Typr-hosted services.

## Obsidian

Obsidian export uses the local Obsidian integration configured on the user's machine.

## Signing And Distribution

Local builds are unsigned unless you configure your own signing identity.

Official maintainer OSS releases may be signed and notarized in GitHub Actions using repository secrets. Forks do not receive maintainer signing secrets.

See [release.md](release.md) for maintainer release requirements.
