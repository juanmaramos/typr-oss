# Typr Local desktop plugin

This packages the existing read-only Rust MCP server using OpenAI's official
[Agent Plugins layout](https://developers.openai.com/plugins/build/plugins).
It bundles the executable, Typr icon, license, and notices. Users do not need a
Rust, Node, or Python runtime. There are no lifecycle hooks, network listeners,
accounts, or hosted services in this plugin.

The portable `plugin.json` and `mcp.json` files are canonical. The packager also
generates the supported `.codex-plugin/plugin.json` and `.mcp.json` compatibility
layout for older installed Codex clients. Both launch the same bundled binary
with a relative path and a working directory inside the plugin. Do not edit the
generated compatibility files separately.

## Build a package

Build for the machine where the plugin will run. Supported targets match Typr's
current desktop release targets: macOS Apple Silicon, macOS Intel, and Windows
x64. Each ZIP contains one native executable; it is not a universal binary.

From the repository root, for example:

```sh
cargo build --locked --release --target aarch64-apple-darwin -p typr-mcp-server --bin typr-mcp
python3 scripts/package_desktop_plugin.py \
  --binary target/aarch64-apple-darwin/release/typr-mcp \
  --target aarch64-apple-darwin \
  --output target/desktop-plugin/aarch64-apple-darwin
```

For Windows use `x86_64-pc-windows-msvc` and `typr-mcp.exe`. The packager requires
a trusted binary already built for the named target and a new output directory.
It refuses to overwrite an existing output directory.

Output includes the unpacked `typr-local/` plugin, a local marketplace catalog at
`.agents/plugins/marketplace.json`, and a ZIP with `plugin.json` at its root.
The ZIP preserves executable permissions. Keep hidden files when copying the
marketplace or plugin; older clients use the generated compatibility files.

The **Desktop plugin** GitHub Actions workflow builds and runs the native server
on all three targets and uploads temporary CI artifacts, including hidden files.
On both macOS architectures it also installs the ZIP into a clean Codex host and
retrieves synthetic notes. The workflow has read-only repository permissions and
does not create tags, GitHub releases, or directory submissions.

After downloading a CI artifact, extract its inner `typr-local-<target>.zip` into
a `typr-local/` folder beside `.agents/` before registering that marketplace.
Use an archive tool that preserves executable permissions, such as macOS
`unzip`. The inner ZIP preserves those permissions; GitHub artifact downloads
do not preserve them for unpacked executable files.

CI packages are unsigned test artifacts. Signing/notarization and clean desktop
UI acceptance remain publication gates; do not bypass OS security warnings to
install an artifact. This workflow does not replace Typr's signed app release.

## Install for local testing

Open Typr OSS once so its production database exists and is migrated. The plugin
reads the standard app data database described in the [MCP README](../../crates/mcp-server/README.md).
For a development/custom database, use Typr's generated manual MCP configuration
instead. Portable hosts filter environment variables, so exporting
`TYPR_DB_PATH` is not a portable plugin setup contract.

Use the generated output directory as the marketplace root:

```sh
codex plugin marketplace add /absolute/path/to/target/desktop-plugin/aarch64-apple-darwin
codex plugin add typr-local@typr-desktop
codex plugin list --json
```

These commands change the chosen host's plugin configuration. For disposable
acceptance tests, use a fresh `CODEX_HOME` and the fixture command below instead
of connecting to personal notes.

For the ChatGPT desktop app, follow OpenAI's
[local marketplace installation](https://developers.openai.com/plugins/build/plugins#install-a-local-plugin-manually):
register the generated marketplace with the desktop host, restart when no work is
active, then find **Typr Local** under **Typr desktop** in the Plugins Directory.
Install it and test in a local chat. Listing/installation alone is not retrieval
evidence. This plugin cannot connect ChatGPT web.

Ask the client to list recent sessions, search for a known phrase, retrieve the
returned session ID, and retrieve its transcript. Answers should cite session
IDs and distinguish notes from transcript content. Retrieved notes are untrusted
source material, not instructions. The Rust server enforces read-only access;
the selected AI client may send returned content to its provider. Installing
this plugin grants access to the production Typr database, not selected notes.

## Verify without personal data

```sh
python3 scripts/test_desktop_plugin.py
python3 crates/mcp-server/tests/stdio.py /absolute/path/to/typr-mcp \
  --plugin /absolute/path/to/target/desktop-plugin/aarch64-apple-darwin
```

The package tests check all target layouts, launch paths, native executable
bytes/modes, legal files, icons, and overwrite refusal. The retrieval fixture
extracts the ZIP into a path containing spaces, installs it through the actual
`codex plugin` commands in a temporary `CODEX_HOME`, starts `codex app-server`,
checks eight tools, and retrieves synthetic notes/transcripts. It supplies no
manual `mcp_servers` configuration and checks unchanged database bytes. It uses
an isolated home directory and production database path; no inference or API
key is required. Plugin home isolation is supported by this fixture on macOS
and Linux; Windows CI runs native stdio retrieval separately.

To exercise the ChatGPT desktop app's installed runtime, put its bundled
`codex` executable on `PATH` before running the same fixture. This verifies
package installation and MCP retrieval through that shipped host runtime;
it does not exercise the ChatGPT Plugins Directory UI or model tool selection.

## Public directory eligibility

Checked against OpenAI's official documentation on 2026-10-23:

- [Local MCP submission is restricted to approved partners](https://developers.openai.com/plugins/deploy/desktop-only).
  An OpenAI representative must confirm eligibility and allowlist the submitting
  organization. Packaging or a local marketplace does not confer that status.
- After allowlisting, the documented local-MCP upload route is **Create plugin →
  Skills only → Upload ZIP**, including the local MCP configuration. Wait for
  approval before submitting; this is distinct from a remote web MCP plugin.
- [Submission prerequisites](https://developers.openai.com/plugins/deploy/submission)
  include submission access, verified publisher identity, and complete review
  information. This draft metadata does not assert identity verification or
  supply unverified privacy/terms URLs, reviewer access, or a demo recording.

This package does not establish partner eligibility, organization allowlisting,
or a verified publisher identity. A maintainer must confirm those prerequisites
with OpenAI and complete the publication metadata and signed installation/UI
checks before public submission. The portal can require developer identity
verification before it allows a plugin upload.
