# Typr local MCP server

`typr-mcp` exposes eight retrieval tools over local stdio. It reads the existing
Typr SQLite database with a read-only connection; it does not migrate, create,
modify, or upload notes. The selected AI client can send retrieved content to its
provider. Enable this connection only in clients you trust.

## Connect AI tools

In Typr, open **Settings → Integrations → Connect AI tools**:

- **Claude Desktop:** Connect updates the existing Claude configuration using the
  bundled sidecar and Typr's active database path. Restart Claude Desktop, enable
  **Typr Local**, then complete the retrieval check below. A **Configured** label
  means the configuration exists, not that Claude has loaded it. Alternatively,
  copy the generated Claude JSON and merge its entry into `mcpServers` in Claude's
  configuration; preserve your other servers.
- **Codex / ChatGPT desktop:** Copy the generated TOML into the Codex host's
  `~/.codex/config.toml` (or `$CODEX_HOME/config.toml`). Preserve existing settings
  and replace an existing `typr_local` table instead of duplicating it. Restart
  the client and check that the tools are enabled. These local clients share MCP
  configuration, as described in [OpenAI's MCP documentation](https://developers.openai.com/codex/mcp).
- **ChatGPT web:** Local stdio configuration does not connect the web client.
  Web access needs a separately packaged remote MCP plugin, authentication, and
  an approved secure route to the local service. Typr does not supply this path.
  Do not expose the notes database or an unauthenticated server publicly.

**Check local server** launches the bundled executable, completes MCP
initialization and tool discovery, and reads one session locally. It returns
only pass/fail to the UI, never note content. This proves the local server can
read the active database. It cannot confirm that another application loaded its
configuration, enabled tools, or retrieved a note.

### Complete a retrieval check in each client

1. Ask the client to use Typr's `list_sessions` tool with limit 5.
2. Ask it to use `search_sessions` with a phrase from a known note.
3. Ask it to call `get_session` using the returned ID and quote one known detail.
4. If the note has a transcript, ask for `get_transcript` with that ID.

If the tools do not appear, check the absolute executable and database paths,
restart the client fully, and enable the server/tools in that client. In Codex
CLI, `codex mcp list` shows configuration and `/mcp` shows active MCP servers.
A server appearing in the configuration alone is not retrieval evidence.

## Manual configuration

Build from the repository root:

```sh
cargo build -p typr-mcp-server --bin typr-mcp
# target/debug/typr-mcp (typr-mcp.exe on Windows)
```

Use absolute paths. Do not use `~` inside a JSON or TOML path. The app-generated
configuration is preferred because it includes custom/development database paths.

Claude Desktop JSON (`~/Library/Application Support/Claude/claude_desktop_config.json`
on macOS; `%APPDATA%\Claude\claude_desktop_config.json` on Windows):

```json
{
  "mcpServers": {
    "Typr Local": {
      "command": "/absolute/path/to/typr-mcp",
      "env": { "TYPR_DB_PATH": "/absolute/path/to/db.sqlite" }
    }
  }
}
```

Codex / ChatGPT desktop TOML:

```toml
[mcp_servers.typr_local]
command = "/absolute/path/to/typr-mcp"

[mcp_servers.typr_local.env]
TYPR_DB_PATH = "/absolute/path/to/db.sqlite"
```

Without `TYPR_DB_PATH`, the server uses the production app data directory:

| Platform | Database |
| --- | --- |
| macOS | `~/Library/Application Support/com.typr.oss/db.sqlite` |
| Windows | `%LOCALAPPDATA%\com.typr.oss\db.sqlite` |
| Linux | `$XDG_DATA_HOME/com.typr.oss/db.sqlite` (default `~/.local/share/com.typr.oss/db.sqlite`) |

Open Typr first to create/migrate its database. An absent database or incompatible
schema fails at initialization. In development, build the sidecar next to the
Tauri executable; packaged apps already include it. App moves/updates that change
the executable location require regenerating the configuration.

## Tools

| Tool | Purpose |
| --- | --- |
| `list_sessions` | Recent sessions, capped at 250 |
| `search_sessions` | Search titles, notes, summaries, participants; optional tag/project filters |
| `get_session` | Notes and summaries by session ID |
| `get_transcript` | Stored transcript by session ID |
| `list_tags` | Available tag names and IDs |
| `list_projects` | Available project names and IDs |
| `list_sessions_by_tags` | Sessions matching tag names or IDs |
| `list_sessions_by_project` | Sessions matching project names or IDs |

`search_sessions` does not search transcript text. Retrieve the transcript after
finding the session. Logs go to stderr; stdout is reserved for MCP protocol
messages (except the explicit `--check` diagnostic mode).

## Verification

```sh
cargo test -p typr-mcp-server
cargo build -p typr-mcp-server --bin typr-mcp
./crates/mcp-server/test-mcp.sh
# Optional: also verify the installed Codex app-server client, without inference:
./crates/mcp-server/test-mcp.sh /absolute/path/to/typr-mcp --codex
```

The Python 3 fixture test creates a temporary database from Typr's real migration
files. It performs the full initialize/initialized handshake, discovers the exact
eight tools, searches and retrieves synthetic notes/transcripts, covers Unicode
and parameterized search, runs `--check`, verifies unchanged database bytes, and
checks that a missing database is never created. It does not use private notes
or call an external model. This is server/transport evidence; client UI retrieval
must also be confirmed before claiming a particular installed client works.

To diagnose your own local connection without displaying note content:

```sh
TYPR_DB_PATH=/absolute/path/to/db.sqlite /absolute/path/to/typr-mcp --check
```
