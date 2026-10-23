#!/usr/bin/env python3
"""Bundle the existing Rust MCP binary as a desktop-only OpenAI plugin (no release)."""
import argparse
import json
from pathlib import Path
import shutil
import stat
import zipfile

ROOT = Path(__file__).resolve().parents[1]
TARGETS = ('aarch64-apple-darwin', 'x86_64-apple-darwin', 'x86_64-pc-windows-msvc')


def package(binary, target, output):
    if target not in TARGETS:
        raise ValueError(f'Unsupported desktop target: {target}')
    binary = Path(binary).resolve(strict=True)
    output = Path(output).resolve()
    # Refuse an existing destination rather than deleting a caller-selected tree.
    output.mkdir(parents=True, exist_ok=False)
    plugin = output / 'typr-local'
    shutil.copytree(ROOT / 'integrations/openai/typr-local', plugin)
    executable = 'typr-mcp.exe' if target.endswith('windows-msvc') else 'typr-mcp'
    (plugin / 'bin').mkdir()
    shutil.copyfile(binary, plugin / 'bin' / executable)
    (plugin / 'bin' / executable).chmod(0o755)
    mcp = json.loads((plugin / 'mcp.json').read_text(encoding='utf-8'))
    mcp['mcpServers']['typr']['command'] = './bin/' + executable
    (plugin / 'mcp.json').write_text(json.dumps(mcp, indent=2) + '\n', encoding='utf-8')
    # Supported compatibility layout for installed clients predating portable manifests.
    manifest = json.loads((plugin / 'plugin.json').read_text(encoding='utf-8'))
    compatibility = {key: manifest[key] for key in ('name', 'version', 'description', 'author', 'homepage', 'repository', 'license', 'keywords')}
    compatibility.update(manifest['extensions']['com.openai'])
    compatibility['mcpServers'] = './.mcp.json'
    (plugin / '.codex-plugin').mkdir()
    (plugin / '.codex-plugin/plugin.json').write_text(json.dumps(compatibility, indent=2) + '\n', encoding='utf-8')
    legacy_mcp = {'mcpServers': {name: {key: value for key, value in server.items() if key != 'type'}
                               for name, server in mcp['mcpServers'].items()}}
    legacy_mcp['mcpServers']['typr']['env_vars'] = ['TYPR_DB_PATH', 'HOME', 'USERPROFILE', 'LOCALAPPDATA', 'XDG_DATA_HOME']
    (plugin / '.mcp.json').write_text(json.dumps(legacy_mcp, indent=2) + '\n', encoding='utf-8')
    (plugin / 'assets').mkdir()
    shutil.copyfile(ROOT / 'apps/desktop/src-tauri/icons/stable/icon.png', plugin / 'assets/icon.png')
    for name in ('LICENSE', 'NOTICE'):
        shutil.copyfile(ROOT / name, plugin / name)
    marketplace = output / '.agents/plugins'
    marketplace.mkdir(parents=True)
    (marketplace / 'marketplace.json').write_text(json.dumps({
        'name': 'typr-desktop',
        'interface': {'displayName': 'Typr desktop'},
        'plugins': [{
            'name': 'typr-local',
            'source': {'source': 'local', 'path': './typr-local'},
            'policy': {'installation': 'AVAILABLE', 'authentication': 'ON_INSTALL'},
            'category': 'Productivity',
        }],
    }, indent=2) + '\n', encoding='utf-8')
    archive = output / f'typr-local-{target}.zip'
    with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED) as bundle:
        for source in sorted(plugin.rglob('*')):
            if source.is_file():
                info = zipfile.ZipInfo(source.relative_to(plugin).as_posix())
                info.create_system = 3
                mode = 0o755 if source.parent.name == 'bin' else 0o644
                info.external_attr = (stat.S_IFREG | mode) << 16
                info.compress_type = zipfile.ZIP_DEFLATED
                bundle.writestr(info, source.read_bytes())
    return archive


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--binary', type=Path, required=True, help='Trusted, already-built typr-mcp for --target')
    parser.add_argument('--target', choices=TARGETS, required=True)
    parser.add_argument('--output', type=Path, required=True, help='New output directory; must not already exist')
    args = parser.parse_args()
    print(package(args.binary, args.target, args.output))
