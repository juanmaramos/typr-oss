"""Distribution checks run on Linux too; Mach-O output is supplied at the tool boundary."""

import tempfile
from pathlib import Path
import unittest
from unittest.mock import patch
import verify_nemotron_bundle as bundle


class DistributionTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.runtime = Path(self.directory.name)
        (self.runtime / "lib").mkdir()
        self.binary = self.runtime / "lib/test.dylib"
        self.binary.touch()
        self.arch = "arm64\n"
        self.loads = "Load command 0\n cmd LC_BUILD_VERSION\n minos 14.2\n sdk 27.0\nLoad command 1\n cmd LC_RPATH\n path @loader_path (offset 12)\n"
        self.dependencies = "test.dylib:\n /usr/lib/libSystem.B.dylib (version 1)\n"
        self.signature = "TeamIdentifier=TEAM123\nCodeDirectory flags=0x10000(runtime)\nTimestamp=Oct 20, 2026\n"
        self.mock = patch.object(bundle, "output", side_effect=self.output)
        self.mock.start()
        self.addCleanup(self.mock.stop)

    def output(self, *args):
        return {
            "lipo": self.arch,
            "otool": self.loads if args[1] == "-l" else self.dependencies,
            "codesign": self.signature,
        }[args[0]]

    def test_portable_binary_accepts_new_build_sdk_with_supported_minimum(self):
        bundle.validate_macho(self.binary, self.runtime)
        self.assertEqual(bundle.team(self.binary), "TEAM123")

    def test_wrong_arch_or_newer_minimum_cannot_ship(self):
        for arch, minimum in [("x86_64", "14.2"), ("arm64", "27.0")]:
            with self.subTest(arch=arch, minimum=minimum):
                self.arch = arch
                self.loads = f"cmd LC_BUILD_VERSION\n minos {minimum}\n"
                with self.assertRaises(ValueError):
                    bundle.validate_macho(self.binary, self.runtime)

    def test_only_bundled_or_system_dependencies_can_ship(self):
        for dependency in (
            "/opt/homebrew/lib/libfoo.dylib",
            "@rpath/missing.dylib",
            "@loader_path/../../outside.dylib",
        ):
            with self.subTest(dependency=dependency):
                self.dependencies = f"binary:\n {dependency} (version 1)\n"
                with self.assertRaises(ValueError):
                    bundle.validate_macho(self.binary, self.runtime)

    def test_ad_hoc_untimestamped_or_non_hardened_signatures_cannot_ship(self):
        for signature in (
            "TeamIdentifier=not set\n",
            "Executable=/app/Contents/Resources/stt/nemotron/runtime/worker\nTeamIdentifier=TEAM123\nCodeDirectory flags=0x0(none)\nTimestamp=today\n",
            "TeamIdentifier=TEAM123\nflags=runtime\n",
        ):
            with self.subTest(signature=signature):
                self.signature = signature
                with self.assertRaises(ValueError):
                    bundle.team(self.binary)

    def test_build_uses_portable_cpu_and_supported_deployment_target(self):
        source = (bundle.ROOT / "scripts/build_nemotron_runtime.py").read_text()
        self.assertIn('"-DGGML_NATIVE=OFF"', source)
        self.assertIn('"-DCMAKE_OSX_DEPLOYMENT_TARGET=14.2"', source)
        self.assertEqual(source.count("*platform_options,"), 2)


if __name__ == "__main__":
    unittest.main()
