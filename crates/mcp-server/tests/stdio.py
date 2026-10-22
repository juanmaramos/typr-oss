#!/usr/bin/env python3
"""Real stdio MCP regression test. Creates only a temporary synthetic database."""
import json
import os
from pathlib import Path
import queue
import threading
import sqlite3
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[3]
BINARY = Path(sys.argv[1] if len(sys.argv) > 1 else ROOT / 'target/debug/typr-mcp').resolve()


def read_response(process, request_id):
    if not hasattr(process, '_mcp_lines'):
        process._mcp_lines = queue.Queue()
        def read_lines():
            for line in iter(process.stdout.readline, b''):
                process._mcp_lines.put(line)
            process._mcp_lines.put(b'')
        threading.Thread(target=read_lines, daemon=True).start()
    while True:
        try:
            line = process._mcp_lines.get(timeout=10)
        except queue.Empty:
            raise AssertionError('MCP response timed out')
        assert line, 'MCP closed before responding'
        response = json.loads(line)
        if response.get('id') == request_id:
            assert 'error' not in response, response
            return response['result']


def send(process, method, params=None, request_id=None):
    message = {'jsonrpc': '2.0', 'method': method}
    if params is not None:
        message['params'] = params
    if request_id is not None:
        message['id'] = request_id
    process.stdin.write(json.dumps(message).encode() + b'\n')
    process.stdin.flush()
    return read_response(process, request_id) if request_id is not None else None


def call(process, name, arguments, request_id):
    result = send(process, 'tools/call', {'name': name, 'arguments': arguments}, request_id)
    assert not result.get('isError'), result
    return '\n'.join(c.get('text', '') for c in result['content'])


with tempfile.TemporaryDirectory(prefix='typr-mcp-fixture-') as directory:
    database = Path(directory) / 'db.sqlite'
    conn = sqlite3.connect(database)
    migrations = (ROOT / 'crates/db-user/src/lib.rs').read_text().split('const MIGRATIONS:', 1)[1].split('];', 1)[0]
    import re
    for name in re.findall(r'include_str!\("\./([^"]+)"\)', migrations):
        conn.executescript((ROOT / 'crates/db-user/src' / name).read_text())
    conn.execute("INSERT INTO spaces(id, name) VALUES ('fixture-project', 'Fixture Launch')")
    conn.execute("INSERT INTO tags(id, name) VALUES ('fixture-tag', 'Strategy')")
    summary = '<p>a' + '🎉á' * 120 + ' synthetic roadmap summary</p>'
    words = json.dumps([{'text': 'Synthetic transcript retrieval', 'speaker': {'type': 'unassigned', 'value': {'index': 0}}, 'confidence': None, 'start_ms': 0, 'end_ms': 1000}])
    conn.execute('INSERT INTO sessions(id,user_id,title,raw_memo_html,enhanced_memo_html,conversations,words,space_id) VALUES (?,?,?,?,?,?,?,?)',
                 ('fixture-session', 'fixture-user', 'Synthetic roadmap meeting', '<p>Fixture decision: ship safely</p>', summary, '[]', words, 'fixture-project'))
    conn.execute("INSERT INTO tags_sessions VALUES ('fixture-tag', 'fixture-session')")
    conn.commit()
    before = database.read_bytes()
    env = {**os.environ, 'TYPR_DB_PATH': str(database)}
    process = subprocess.Popen([str(BINARY)], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, env=env)
    try:
        initialized = send(process, 'initialize', {'protocolVersion': '2025-03-26', 'capabilities': {}, 'clientInfo': {'name': 'typr-fixture', 'version': '1'}}, 1)
        assert initialized['capabilities']['tools'] is not None
        send(process, 'notifications/initialized')
        tools = send(process, 'tools/list', {}, 2)['tools']
        expected = {'list_sessions', 'search_sessions', 'get_session', 'get_transcript', 'list_tags', 'list_projects', 'list_sessions_by_tags', 'list_sessions_by_project'}
        assert {tool['name'] for tool in tools} == expected
        for index, (tool, arguments, marker) in enumerate([
            ('list_sessions', {'limit': 1}, 'fixture-session'),
            ('search_sessions', {'query': 'ship safely'}, 'fixture-session'),
            ('search_sessions', {'query': "' OR 1=1 --"}, 'No sessions found'),
            ('get_session', {'id': 'fixture-session'}, 'Fixture decision: ship safely'),
            ('get_transcript', {'id': 'fixture-session'}, 'Synthetic transcript retrieval'),
            ('list_tags', {}, 'Strategy'),
            ('list_projects', {}, 'Fixture Launch'),
            ('list_sessions_by_tags', {'tag_names': ['strategy']}, 'fixture-session'),
            ('list_sessions_by_project', {'project_names': ['Launch']}, 'fixture-session'),
            ('get_session', {'id': 'missing'}, 'not found'),
        ], 3):
            text = call(process, tool, arguments, index)
            assert marker in text, (tool, text)
    finally:
        process.terminate()
        process.communicate(timeout=5)
    checked = subprocess.run([str(BINARY), '--check'], env=env, capture_output=True, timeout=15)
    assert checked.returncode == 0, checked.stderr.decode()
    assert b'database read passed' in checked.stdout
    assert database.read_bytes() == before, 'MCP modified fixture database'
    if "--codex" in sys.argv[2:]:
        # Exercise installed Codex's own MCP client using an isolated synthetic configuration.
        codex_home = Path(directory) / 'codex-home'
        codex_home.mkdir()
        (codex_home / 'config.toml').write_text('[mcp_servers.typr_local]\ncommand = ' + json.dumps(str(BINARY)) + '\n[mcp_servers.typr_local.env]\nTYPR_DB_PATH = ' + json.dumps(str(database)) + '\n')
        codex = subprocess.Popen(['codex', 'app-server'], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                                 env={**os.environ, 'CODEX_HOME': str(codex_home)})
        try:
            send(codex, 'initialize', {'clientInfo': {'name': 'typr_fixture_verification', 'version': '1'}, 'capabilities': {'experimentalApi': True}}, 100)
            send(codex, 'initialized')
            thread = send(codex, 'thread/start', {'cwd': directory, 'approvalPolicy': 'never', 'sandbox': 'read-only'}, 101)
            thread_id = thread['thread']['id']
            status = send(codex, 'mcpServerStatus/list', {'threadId': thread_id}, 102)
            assert any(server['name'] == 'typr_local' and len(server.get('tools', {})) == 8 for server in status['data']), status
            for request_id, tool, arguments, marker in [
                (103, 'list_sessions', {'limit': 1}, 'fixture-session'),
                (104, 'search_sessions', {'query': 'ship safely'}, 'fixture-session'),
                (105, 'get_session', {'id': 'fixture-session'}, 'Fixture decision: ship safely'),
                (106, 'get_transcript', {'id': 'fixture-session'}, 'Synthetic transcript retrieval'),
            ]:
                result = send(codex, 'mcpServer/tool/call', {'threadId': thread_id, 'server': 'typr_local', 'tool': tool, 'arguments': arguments}, request_id)
                assert marker in json.dumps(result), (tool, result)
            print('PASS: installed Codex app-server discovered all 8 tools and retrieved synthetic notes/transcript; no inference or user-config writes')
        finally:
            codex.terminate()
            codex.communicate(timeout=5)

    conn.close()
    missing = Path(directory) / 'missing.sqlite'
    failed = subprocess.run([str(BINARY)], env={**env, 'TYPR_DB_PATH': str(missing)}, capture_output=True, timeout=5)
    assert failed.returncode != 0 and not missing.exists(), 'Missing DB was created'
    print('PASS: initialize, tools/list, all eight retrieval tools, Unicode, parameterized search, --check, unchanged database, missing database refusal')
