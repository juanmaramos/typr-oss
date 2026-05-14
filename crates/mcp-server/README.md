# Typr MCP Server

Model Context Protocol server that exposes Typr meeting transcripts to AI assistants like Claude Desktop and ChatGPT.

## Features

- **8 MCP Tools:**
  - `list_sessions` - List recent meeting sessions
  - `get_session` - Get full session details with summary
  - `get_transcript` - Get raw transcript with speaker attribution
  - `search_sessions` - Search sessions by keyword, tag, or project
  - `list_tags` - List available note tags
  - `list_projects` - List available projects/spaces
  - `list_sessions_by_tags` - Retrieve notes by tag name or ID
  - `list_sessions_by_project` - Retrieve notes by project name or ID

- **Zero Auth Required:** Runs as local process reading local SQLite database
- **Works With:**
  - Claude Desktop (stdio MCP)
  - Cursor / Windsurf (stdio MCP)
  - ChatGPT Desktop (if it supports MCP)
  - Any MCP-compatible client

## Quick Start

### 1. Build the Server

```bash
cargo build --release
# Binary at: ../../target/release/typr-mcp
```

### 2. Test Locally

```bash
# Run test script
./test-mcp.sh

# Or test manually with your database
TYPR_DB_PATH=~/Library/Application\ Support/typr/typr.db \
  ../../target/release/typr-mcp

# Then send JSON-RPC via stdin:
{"jsonrpc":"2.0","id":1,"method":"tools/list"}
```

### 3. Configure Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "typr": {
      "command": "/absolute/path/to/typr-mcp"
    }
  }
}
```

Restart Claude Desktop. You'll see a hammer icon showing the typr server is connected.

### 4. Try It Out

In Claude Desktop:
- "What meetings did I have this week?"
- "Summarize my standup from yesterday"
- "Search my meetings for discussions about the new feature"
- "Show notes tagged hiring"
- "Find notes in the Workforce project about onboarding"

## Architecture

```
Claude Desktop
    ↓ (spawns subprocess)
typr-mcp (this binary)
    ↓ (reads via libsql)
~/Library/Application Support/typr/typr.db
```

- **Protocol:** JSON-RPC 2.0 over stdio
- **Transport:** stdin/stdout
- **Database:** Read-only access to local SQLite via libsql
- **Concurrent Access:** Safe (libsql WAL mode supports multiple readers)

## Environment Variables

- `TYPR_DB_PATH` - Override database location (default: platform-specific)
  - macOS: `~/Library/Application Support/typr/typr.db`
  - Windows: `%APPDATA%\typr\typr.db`
  - Linux: `~/.local/share/typr/typr.db`

## Logging

All logs go to stderr (never stdout, which would break JSON-RPC).

To see logs:
```bash
TYPR_DB_PATH=... ../../target/release/typr-mcp 2>mcp-server.log
```

## Development

### Project Structure

```
src/
├── main.rs        # Entry point, MCP server setup
├── tools.rs       # 4 MCP tool implementations
├── formatters.rs  # Markdown formatters for output
└── db.rs          # Database access helpers
```

### Key Dependencies

- `rmcp` - Official Rust MCP SDK
- `typr-db-user` - Typr database access layer (workspace)
- `tokio` - Async runtime

### Adding New Tools

1. Add function to `impl TyprMcp` in `tools.rs`
2. Annotate with `#[tool(description = "...")]`
3. Define request type struct with `schemars::JsonSchema`
4. Add formatter function if needed in `formatters.rs`

## Troubleshooting

**Server doesn't show up in Claude Desktop:**
- Check config file syntax (`claude_desktop_config.json`)
- Use absolute path, not relative
- Restart Claude Desktop completely (Cmd+Q on Mac)
- Check logs: `~/Library/Logs/Claude/mcp-server-typr.log`

**"Database not found" error:**
- Verify database exists: `ls ~/Library/Application\ Support/typr/typr.db`
- Or set `TYPR_DB_PATH` explicitly in config

**No sessions returned:**
- Confirm you have recorded meetings in the desktop app
- Check database with: `sqlite3 ~/Library/Application\ Support/typr/typr.db "SELECT COUNT(*) FROM sessions;"`

## Testing Concurrent DB Access

1. Start desktop app (it reads/writes to DB)
2. In another terminal: `TYPR_DB_PATH=... ../../target/release/typr-mcp`
3. Send requests via stdin
4. Both should work without conflicts (lib sql WAL mode)

## Next Steps

- [ ] Bundle as Tauri sidecar binary
- [ ] Add one-click "Enable Claude Integration" button in desktop app
- [ ] Test with ChatGPT Desktop (when MCP support is stable)
- [ ] Add MCP Resources for browsable session list
- [ ] Enhance search with FTS (full-text search)
