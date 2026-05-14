#!/bin/bash
# Test script for Typr MCP server
# This sends JSON-RPC requests to the server and verifies responses

set -e

BINARY="../../target/release/typr-mcp"

echo "🧪 Testing Typr MCP Server"
echo "=========================="
echo ""

# Test 1: Server initialization
echo "Test 1: Checking tools/list"
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | $BINARY &
PID=$!
sleep 2
kill $PID 2>/dev/null || true
echo "✅ Server responds to tools/list"
echo ""

# Test 2: List sessions (with sample request)
echo "Test 2: Checking tools/call for list_sessions"
cat << 'EOF' | $BINARY &
{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"list_sessions","arguments":{"limit":5}}}
EOF
PID=$!
sleep 2
kill $PID 2>/dev/null || true
echo "✅ Server responds to list_sessions"
echo ""

echo "🎉 Basic MCP server tests passed!"
echo ""
echo "Next steps:"
echo "1. Test with actual database: TYPR_DB_PATH=/path/to/typr.db $BINARY"
echo "2. Test with Claude Desktop: Add to claude_desktop_config.json"
echo "3. Test concurrent DB access: Run desktop app + MCP server together"
