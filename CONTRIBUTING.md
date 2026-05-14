# Contributing

Thanks for contributing to Typr OSS.

## Ground Rules

- Keep changes surgical and behavior-preserving unless the issue explicitly asks for behavior changes.
- Do not add maintainer-owned API keys, signing material, private URLs, commercial billing services, or hosted proxy dependencies.
- Prefer local-first and BYOK implementations.
- Keep user data local unless the user explicitly configures a third-party provider.
- Do not commit generated model files, `.env` files, credentials, build artifacts, or local database files.

## Development Setup

```bash
cp .env.example .env
pnpm install
pnpm -F @typr/desktop tauri:dev
```

macOS dependencies:

```bash
brew install cmake libomp
xcode-select --install
```

## Checks

Run the most relevant checks before opening a PR:

```bash
pnpm -F @typr/desktop typecheck
cargo check
```

If you change user-facing desktop strings, update Lingui catalogs:

```bash
pnpm -F @typr/desktop lingui:extract
pnpm -F @typr/desktop lingui:compile
```

If you change Tauri plugin commands, regenerate TypeScript bindings and permissions through the plugin build/export flow.

## Issues

When reporting bugs, include:

- OS and architecture.
- App version or commit hash.
- Whether you are using local models, BYOK cloud models, or both.
- Logs or screenshots when they are safe to share.

Never include API keys, meeting transcripts, customer data, or private URLs in public issues.
