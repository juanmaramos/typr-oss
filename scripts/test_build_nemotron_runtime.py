"""Exercise native source checkout safety with real offline Git repositories."""

from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

import build_nemotron_runtime as build


def git(directory, *args):
    return subprocess.check_output(
        ["git", *args], cwd=directory, text=True, stderr=subprocess.PIPE
    ).strip()


class CheckoutTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name).resolve()
        self.upstream = self.repository("upstream")
        self.pin = git(self.upstream, "rev-parse", "HEAD")
        self.app = self.repository("app")
        git(self.app, "remote", "add", "origin", str(self.app))
        (self.app / ".git/info/exclude").write_text("target/\nbuild/\n")
        self.root_patch = patch.object(build, "ROOT", self.app)
        self.root_patch.start()
        self.addCleanup(self.root_patch.stop)
        self.app_head = git(self.app, "rev-parse", "HEAD")
        self.source = self.app / "build/nemotron/source"
        self.source.parent.mkdir(parents=True)

    def repository(self, name):
        directory = self.root / name
        directory.mkdir()
        git(directory, "init", "--quiet")
        (directory / "source.txt").write_text(name)
        git(directory, "add", ".")
        git(
            directory,
            "-c",
            "user.name=Test",
            "-c",
            "user.email=test@example.invalid",
            "commit",
            "--quiet",
            "-m",
            "fixture",
        )
        return directory

    def checkout(self):
        build.checkout(self.upstream.as_uri(), self.pin, self.source)

    def test_clone_and_reuse_fetch_the_pin_from_the_requested_repository(self):
        self.checkout()
        # A reused checkout's origin must not control the fetch source.
        git(self.source, "remote", "set-url", "origin", self.app.as_uri())
        self.checkout()
        self.assertEqual(git(self.source, "rev-parse", "HEAD"), self.pin)
        self.assertEqual((self.source / "source.txt").read_text(), "upstream")
        self.assertEqual(git(self.app, "rev-parse", "HEAD"), self.app_head)

    def test_modified_source_is_preserved_and_rejected(self):
        self.checkout()
        (self.source / "source.txt").write_text("local changes")
        with self.assertRaisesRegex(RuntimeError, "modified native source"):
            self.checkout()
        self.assertEqual((self.source / "source.txt").read_text(), "local changes")

    def test_restored_directory_cannot_inherit_the_app_repository(self):
        self.source.mkdir()
        marker = self.source / "keep.txt"
        marker.write_text("preserve cached or user files")
        with self.assertRaisesRegex(RuntimeError, "its own Git checkout"):
            self.checkout()
        self.assertEqual(marker.read_text(), "preserve cached or user files")
        self.assertEqual(git(self.app, "rev-parse", "HEAD"), self.app_head)
        self.assertEqual(git(self.app, "remote", "get-url", "origin"), str(self.app))
        self.assertFalse((self.app / ".git/FETCH_HEAD").exists())

    def test_app_checkout_cannot_be_replaced_with_native_sources(self):
        for source in (self.app, self.root):
            with self.subTest(source=source):
                with self.assertRaisesRegex(
                    RuntimeError, "cannot contain the app checkout"
                ):
                    build.checkout(self.upstream.as_uri(), self.pin, source)
                self.assertEqual(git(self.app, "rev-parse", "HEAD"), self.app_head)
                self.assertEqual((self.app / "source.txt").read_text(), "app")
                self.assertFalse((self.app / ".git/FETCH_HEAD").exists())

    def test_default_build_does_not_reuse_the_restored_rust_target_tree(self):
        cached = self.app / "target/nemotron/source"
        cached.mkdir(parents=True)
        with (
            patch.object(build, "ROOT", self.app),
            patch.object(sys, "argv", ["build_nemotron_runtime.py"]),
            patch.object(
                build, "checkout", side_effect=RuntimeError("stop before build")
            ) as checkout,
            self.assertRaisesRegex(RuntimeError, "stop before build"),
        ):
            build.main()
        source = checkout.call_args.args[2]
        self.assertFalse(source.is_relative_to(self.app / "target"))
        self.assertTrue(source.is_relative_to(self.app))
        self.assertEqual(git(self.app, "rev-parse", "HEAD"), self.app_head)
        self.assertTrue(cached.is_dir())


if __name__ == "__main__":
    unittest.main()
