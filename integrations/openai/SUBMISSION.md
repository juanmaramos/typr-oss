# Typr Local directory submission preparation

This is a desktop-only, bundled Rust stdio MCP plugin. No remote endpoint,
OAuth application, reviewer login, or API key is required by the plugin.
The reviewer needs a supported desktop host and synthetic local Typr data.
Do not upload personal databases or supply personal client credentials.

## Package candidates

Run the existing **Desktop plugin** workflow on the reviewed branch with
`sign_macos=true`. This uses the repository's Apple signing and notarization
credentials only on an explicit manual macOS run. PR builds use no Apple
secrets. It creates temporary GitHub Actions artifacts, not tags or releases.

- Apple Silicon: `typr-desktop-plugin-aarch64-apple-darwin-signed-notarized`.
- Intel Mac: `typr-desktop-plugin-x86_64-apple-darwin-signed-notarized`.
- Windows x64: `typr-desktop-plugin-x86_64-pc-windows-msvc-unsigned`.
  No Windows signing certificate is configured. This is a test artifact,
  not a signed submission candidate.

Each macOS artifact contains the unchanged notarized inner ZIP, a local
marketplace catalog, and `notarization.json` with Apple's accepted submission
ID and the ZIP's SHA-256. Download before Actions' 14-day artifact expiration.
Verify the hash against the receipt. Extract the inner ZIP to `typr-local/`
beside `.agents/`, preserving executable modes, then run:

```sh
codesign --verify --strict --verbose=4 -R=notarized --check-notarization /absolute/path/typr-local/bin/typr-mcp
python3 crates/mcp-server/tests/stdio.py /absolute/path/typr-local/bin/typr-mcp \
  --plugin /absolute/path/marketplace
```

Signing uses Developer ID Application, hardened runtime, and a secure
timestamp. Notarization must report `Accepted`; exit status alone is not
enough. Signing occurs outside Cargo's cache. The workflow verifies signature,
notarization ticket, and fixture retrieval before uploading a signed
artifact. It never repacks a ZIP after notarization. ZIPs and standalone Mach-O
executables cannot carry a stapled ticket; Gatekeeper may need internet to
retrieve the notarization ticket. Apple recommends `codesign --check-notarization`
for other code, including this standalone executable; `spctl --type execute`
is intended for app assessment and can reject this file shape. These command
checks do not replace a fresh-machine, quarantined download and desktop install
test before publication. Do not disable Gatekeeper or remove
quarantine to make a failing package pass.

## Test before submitting

Directory approval is not required for
[local marketplace installation](https://developers.openai.com/plugins/build/plugins#install-a-local-plugin-manually).
See the [installation steps](README.md#install-for-local-testing). In the desktop
app, restart after registration, find **Typr Local** under **Typr desktop** in
Plugins, then enable or mention it in a local chat. This is the same bundled
server shipped in the ZIP. It does not enable ChatGPT web.

Use the automated fixture first. It installs the actual ZIP in an isolated
host and checks all eight tools, Unicode, missing records, parameterized
search, and unchanged database bytes. This verifies the tools and installation,
not model choices for the prompts in `plugin.json`.

For the directory walkthrough, use a separate OS user profile without personal
Typr data. Generate the same synthetic database with:

```sh
python3 crates/mcp-server/tests/stdio.py /absolute/path/typr-local/bin/typr-mcp \
  --export-fixture /absolute/path/to/new-review-db.sqlite
```

The destination must not exist. In that clean profile only, place this database
at the standard production path described in the [MCP README](../../crates/mcp-server/README.md).
Do not replace an existing Typr database. Install the plugin and run the five
positive and three negative prompts in `plugin.json` in local chats. Record
actual tool choices and answers. The fixture includes `fixture-session`, the
decision `Fixture decision: ship safely`, transcript `Synthetic transcript
retrieval`, tag `Strategy`, and project `Fixture Launch`.

Capture a video showing installation, enabled plugin, positive retrieval with
session citations, and the negative cases. Confirm that the database remains
unchanged. Host the recording at a reviewer-accessible URL, then add it as
`extensions.com.openai.review.demo_recording_url` in the canonical manifest and
rebuild/re-sign/re-notarize the final ZIP. Do not insert a placeholder URL.
The current automated fixture does not claim these model-driven prompts or
the signed desktop UI walkthrough have been executed.

## Submission gates

Checked against the official docs on October 23, 2026:

1. Obtain explicit OpenAI confirmation of local-MCP partner eligibility and
   organization allowlisting. A verified identity alone is insufficient.
2. Confirm the publisher has submission access and a verified identity. The
   portal's verified identity determines the displayed publisher name.
3. After this PR merges, check the manifest's privacy and terms URLs are
   publicly accessible, accurate, and accepted for the submitting publisher.
   These new `main` URLs are not live before merge. Existing website policies
   are not a substitute for the plugin-specific disclosures.
4. Complete the recorded desktop prompt cases and add the real demo URL.
5. Confirm with OpenAI how the directory should accept separate architecture
   ZIPs for the same plugin. Each current ZIP targets one architecture; do not
   upload an Intel executable for Apple Silicon or claim universal support.
6. After allowlisting, use **Create plugin → Skills only → Upload ZIP**, the
   documented route for approved bundled local MCP. Inspect automated metadata
   and tool findings, resolve required issues, and verify imported review cases
   and release notes. Keep credentials in secure portal fields if needed.
7. Obtain authorization before uploading, submitting policy attestations, or
   publishing. This preparation does not perform any of those actions.

Listing text, HTTPS policy URLs, five positive cases, three negative cases,
`commerce: false`, and release notes are maintained in `plugin.json`; the
packager also copies them into the older client compatibility manifest. There
is no claim of directory approval. Signed macOS artifacts are ready for local
testing after the workflow succeeds; public submission remains gated by the
items above.

Sources: [desktop-only submissions](https://developers.openai.com/plugins/deploy/desktop-only),
[submission fields and review](https://developers.openai.com/plugins/deploy/submission),
[plugin guidelines](https://developers.openai.com/plugins/plugin-guidelines),
[Apple notarization](https://developer.apple.com/documentation/security/customizing-the-notarization-workflow),
[Apple DTS testing guidance](https://developer.apple.com/forums/thread/130379).
