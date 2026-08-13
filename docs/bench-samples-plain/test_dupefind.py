#!/usr/bin/env python3
"""Tests for dupefind. Run: python3 -m unittest test_dupefind -v"""

import io
import json
import os
import tempfile
import unittest
from contextlib import redirect_stdout

import dupefind


class Tree(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = self.tmp.name
        self.addCleanup(self.tmp.cleanup)

    def write(self, relpath, data, size=None):
        path = os.path.join(self.root, relpath)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        if isinstance(data, str):
            data = data.encode()
        if size:
            data = (data * (size // len(data) + 1))[:size]
        with open(path, "wb") as fh:
            fh.write(data)
        return path

    def find(self, **kw):
        return dupefind.find_duplicates([self.root], quiet=True, **kw)

    def paths(self, groups):
        return [sorted(os.path.relpath(p, self.root) for p in g) for _, g in groups]


class TestFindDuplicates(Tree):
    def test_finds_identical_files_across_directories(self):
        self.write("a.txt", "hello world")
        self.write("sub/b.txt", "hello world")
        self.write("sub/deep/c.txt", "hello world")
        self.assertEqual(self.paths(self.find()), [["a.txt", "sub/b.txt", "sub/deep/c.txt"]])

    def test_ignores_unique_files(self):
        self.write("a.txt", "one")
        self.write("b.txt", "two")
        self.assertEqual(self.find(), [])

    def test_same_size_different_content_is_not_duplicate(self):
        self.write("a.txt", "aaaa")
        self.write("b.txt", "bbbb")
        self.assertEqual(self.find(), [])

    def test_differs_only_past_the_quick_hash_window(self):
        head = b"x" * dupefind.QUICK_BYTES
        self.write("a.bin", head + b"A" * 100)
        self.write("b.bin", head + b"B" * 100)
        self.write("c.bin", head + b"A" * 100)
        self.assertEqual(self.paths(self.find()), [["a.bin", "c.bin"]])

    def test_multiple_groups_sorted_by_descending_size(self):
        self.write("big1.bin", b"z", size=5000)
        self.write("big2.bin", b"z", size=5000)
        self.write("small1.txt", "hi there")
        self.write("small2.txt", "hi there")
        sizes = [size for size, _ in self.find()]
        self.assertEqual(sizes, [5000, 8])

    def test_empty_files_skipped_by_default(self):
        self.write("a.txt", "")
        self.write("b.txt", "")
        self.assertEqual(self.find(), [])
        self.assertEqual(len(self.find(min_size=0)), 1)

    def test_min_size_filter(self):
        self.write("a.bin", b"q", size=100)
        self.write("b.bin", b"q", size=100)
        self.assertEqual(self.find(min_size=101), [])
        self.assertEqual(len(self.find(min_size=100)), 1)

    def test_hidden_files_skipped_by_default(self):
        self.write(".secret", "same")
        self.write("visible", "same")
        self.write(".git/obj", "same")
        self.assertEqual(self.find(), [])
        self.assertEqual(
            self.paths(self.find(include_hidden=True)), [[".git/obj", ".secret", "visible"]]
        )

    def test_exclude_glob_filters_files_and_dirs(self):
        self.write("keep/a.txt", "dup")
        self.write("node_modules/b.txt", "dup")
        self.assertEqual(self.find(excludes=["node_modules"]), [])

        self.write("keep/c.log", "logdup")
        self.write("keep/d.log", "logdup")
        self.assertEqual(self.find(excludes=["*.log", "node_modules"]), [])

    def test_hardlinks_are_not_reported_as_duplicates(self):
        original = self.write("a.txt", "linked content")
        os.link(original, os.path.join(self.root, "b.txt"))
        self.assertEqual(self.find(), [])

        self.write("c.txt", "linked content")
        # The hardlink pair collapses to one entry, which still matches c.txt.
        self.assertEqual(len(self.find()[0][1]), 2)

    def test_symlinks_are_ignored(self):
        original = self.write("a.txt", "content here")
        os.symlink(original, os.path.join(self.root, "link.txt"))
        self.assertEqual(self.find(), [])

    def test_unreadable_file_is_skipped_not_fatal(self):
        self.write("a.txt", "dup content")
        bad = self.write("b.txt", "dup content")
        self.write("c.txt", "dup content")
        os.chmod(bad, 0o000)
        self.addCleanup(os.chmod, bad, 0o644)
        if os.geteuid() == 0:
            self.skipTest("root bypasses permission bits")
        self.assertEqual(self.paths(self.find()), [["a.txt", "c.txt"]])


class TestCLI(Tree):
    def run_cli(self, *args):
        buf = io.StringIO()
        with redirect_stdout(buf):
            code = dupefind.main([self.root, "-q", *args])
        return code, buf.getvalue()

    def test_exit_code_and_text_report(self):
        self.write("a.txt", "duplicated")
        self.write("b.txt", "duplicated")
        code, out = self.run_cli()
        self.assertEqual(code, 1)
        self.assertIn("a.txt", out)
        self.assertIn("2 files", out)
        self.assertIn("1 duplicate group(s)", out)

    def test_exit_zero_when_clean(self):
        self.write("a.txt", "one")
        code, out = self.run_cli()
        self.assertEqual(code, 0)
        self.assertIn("No duplicates found.", out)

    def test_json_output(self):
        self.write("a.bin", b"k", size=1000)
        self.write("b.bin", b"k", size=1000)
        code, out = self.run_cli("--json")
        payload = json.loads(out)
        self.assertEqual(code, 1)
        self.assertEqual(payload["wasted_bytes"], 1000)
        self.assertEqual(payload["groups"][0]["count"], 2)
        self.assertEqual(payload["groups"][0]["size"], 1000)

    def test_missing_directory_exits_two(self):
        buf = io.StringIO()
        with redirect_stdout(buf):
            self.assertEqual(dupefind.main([os.path.join(self.root, "nope")]), 2)


class TestHuman(unittest.TestCase):
    def test_units(self):
        self.assertEqual(dupefind.human(512), "512 B")
        self.assertEqual(dupefind.human(1536), "1.5 KB")
        self.assertEqual(dupefind.human(5 * 1024**3), "5.0 GB")


if __name__ == "__main__":
    unittest.main()
