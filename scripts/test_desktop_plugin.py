"""Package contract tests; runtime retrieval uses crates/mcp-server/tests/stdio.py."""
import json
import hashlib
from pathlib import Path
import tempfile
from unittest.mock import patch
import unittest
import zipfile

from package_desktop_plugin import package, ROOT, TARGETS
from verify_desktop_plugin import verify


class DesktopPluginTests(unittest.TestCase):
    def test_archives_contain_only_the_plugin_and_launch_the_bundled_binary(self):
        with tempfile.TemporaryDirectory() as directory:
            binary = Path(directory) / 'trusted-build'
            binary.write_bytes(b'synthetic executable for packaging tests')
            for target in TARGETS:
                with self.subTest(target=target):
                    output = Path(directory) / target
                    # Simulate Windows' legacy locale: omitting encoding corrupts UTF-8.
                    read_text = Path.read_text
                    def locale_read_text(path, encoding=None, errors=None):
                        return read_text(path, encoding=encoding or 'cp1252', errors=errors)
                    with patch.object(Path, 'read_text', locale_read_text):
                        archive = package(binary, target, output)
                    with zipfile.ZipFile(archive) as bundle:
                        executable = 'typr-mcp.exe' if target.endswith('windows-msvc') else 'typr-mcp'
                        self.assertEqual(set(bundle.namelist()), {
                            'plugin.json', 'mcp.json', '.codex-plugin/plugin.json', '.mcp.json',
                            'LICENSE', 'NOTICE', 'assets/icon.png', 'bin/' + executable,
                        })
                        manifest = json.loads(bundle.read('plugin.json'))
                        legacy = json.loads(bundle.read('.codex-plugin/plugin.json'))
                        self.assertEqual(legacy['name'], manifest['name'])
                        self.assertEqual(legacy['version'], manifest['version'])
                        extension = manifest['extensions']['com.openai']
                        self.assertEqual(legacy['interface'], extension['interface'])
                        self.assertEqual(legacy['review'], extension['review'])
                        self.assertEqual(legacy['publication'], extension['publication'])
                        for kind, count in [('positive', 5), ('negative', 3)]:
                            cases = extension['review']['test_cases'][kind]
                            self.assertEqual(len(cases), count)
                            for case in cases:
                                self.assertTrue(all(case.get(key) for key in
                                    ('description', 'prompt', 'tools_triggered', 'expected_behavior')))
                        interface = extension['interface']
                        self.assertLessEqual(len(interface['displayName']), 30)
                        self.assertLessEqual(len(interface['shortDescription']), 30)
                        self.assertLessEqual(len(interface['longDescription']), 4000)
                        for field in ('privacyPolicyURL', 'termsOfServiceURL'):
                            policy = interface[field].split('/blob/main/', 1)[1]
                            self.assertTrue((ROOT / policy).is_file())
                        self.assertIn('Typr’s', legacy['interface']['longDescription'])
                        self.assertTrue(manifest['extensions']['com.openai']['requires_local_executor'])
                        for config in ('mcp.json', '.mcp.json'):
                            server = json.loads(bundle.read(config))['mcpServers']['typr']
                            self.assertEqual(server['command'], './bin/' + executable)
                            self.assertEqual(server['cwd'], './')
                        self.assertEqual(bundle.read('bin/' + executable), binary.read_bytes())
                        self.assertEqual(bundle.getinfo('bin/' + executable).external_attr >> 16 & 0o777, 0o755)
                        self.assertEqual(bundle.read('LICENSE'), (ROOT / 'LICENSE').read_bytes())
                        self.assertEqual(bundle.read('assets/icon.png'), (ROOT / 'apps/desktop/src-tauri/icons/stable/icon.png').read_bytes())
                    catalog = json.loads((output / '.agents/plugins/marketplace.json').read_text(encoding='utf-8'))
                    self.assertTrue((output / catalog['plugins'][0]['source']['path'] / 'plugin.json').is_file())
                    with self.assertRaises(FileExistsError):
                        package(binary, target, output)

    def test_rejects_missing_binary_and_unsupported_target_without_writing_output(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / 'output'
            with self.assertRaises(FileNotFoundError):
                package(Path(directory) / 'missing', TARGETS[0], output)
            with self.assertRaises(ValueError):
                package(__file__, 'unknown-target', output)
            self.assertFalse(output.exists())

    def test_notarization_requires_accepted_status_and_the_submitted_bytes(self):
        with tempfile.TemporaryDirectory() as directory:
            archive = Path(directory) / 'plugin.zip'
            archive.write_bytes(b'submitted ZIP')
            digest = hashlib.sha256(archive.read_bytes()).hexdigest()
            accepted = {'status': 'Accepted', 'id': 'synthetic-submission'}
            receipt = verify(archive, accepted, digest)
            self.assertEqual(receipt['sha256'], digest)
            self.assertEqual(receipt['submission_id'], 'synthetic-submission')
            for status in ('Invalid', 'Rejected', 'In Progress', None):
                with self.subTest(status=status), self.assertRaises(ValueError):
                    verify(archive, {'status': status, 'id': 'synthetic-submission'}, digest)
            with self.assertRaises(ValueError):
                verify(archive, {'status': 'Accepted'}, digest)
            archive.write_bytes(b'repacked after submission')
            with self.assertRaisesRegex(ValueError, 'ZIP changed'):
                verify(archive, accepted, digest)


if __name__ == '__main__':
    unittest.main()
