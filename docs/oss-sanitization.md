# OSS Sanitization Notes

This repository is intended to be a clean public source tree derived from the commercial Typr codebase.

## Removed From OSS

- Commercial app surfaces and hosted web apps.
- Stripe, Keygen, billing, license activation, and entitlement gates.
- Typr-hosted LLM/STT proxy services.
- Private S3 model mirrors.
- Maintainer signing keys, updater secrets, Fly.io secrets, and release automation secrets.
- Generated artifacts and local editor/agent configuration that should not be part of public source.

## Kept In OSS

- Desktop product code.
- Local database and local-first app workflows.
- Local model downloads through public model repositories.
- Bundled native runtime assets required by local audio processing, documented in [bundled-assets.md](bundled-assets.md).
- Direct BYOK provider support.
- GPLv3 license and upstream attribution.

## Namespace Cleanup

Package, crate, import, and internal type namespaces have been moved from the historical `hypr` prefix to `typr`.
OSS bundle identifiers and local data directories use the `com.typr.oss*` namespace.
