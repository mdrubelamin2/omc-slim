#!/usr/bin/env python3
"""Tests for dupefind. Run: python3 -m unittest -v test_dupefind"""

import io
import json
import os
import stat
import tempfile
import unittest
from contextlib import redirect_stdout, redirect_stderr

import dupefind
from dupefind import Skipped, find_duplicates, main


class Tree(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = self.tmp.name
        self.addCleanup(self.tmp.cleanup)

    def write(self, rel, data=b"x"):
        path = os.path.join(self.root, rel)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "wb") as fh:
            fh.write(data)
        return path

    def groups(self, **kw):
        return find_duplicates([self.root], **kw)


class TestMatching(Tree):
    def test_identical_files_group_together(self):
        a = self.write("a.txt", b"hello")
        b = self.write("sub/b.txt", b"hello")
        self.assertEqual(self.groups(), [(5, sorted([a, b]))])

    def test_same_size_different_content_is_not_a_duplicate(self):
        self.write("a", b"aaaa")
        self.write("b", b"bbbb")
        self.assertEqual(self.groups(), [])

    def test_different_size_never_compared(self):
        self.write("a", b"aa")
        self.write("b", b"aaa")
        self.assertEqual(self.groups(), [])

    def test_three_way_duplicate_forms_one_group(self):
        paths = [self.write(n, b"same") for n in ("a", "b", "c/d")]
        self.assertEqual(self.groups(), [(4, sorted(paths))])

    def test_two_independent_groups(self):
        big = [self.write(n, b"1234567") for n in ("p", "q")]
        small = [self.write(n, b"12") for n in ("r", "s")]
        self.assertEqual(self.groups(),
                         [(7, sorted(big)), (2, sorted(small))])

    def test_large_files_differing_only_past_the_head_chunk(self):
        head = b"z" * (dupefind.HEAD_BYTES + 10)
        a = self.write("a", head + b"tail-A")
        b = self.write("b", head + b"tail-B")
        c = self.write("c", head + b"tail-A")
        self.assertEqual(self.groups(), [(len(head) + 6, sorted([a, c]))])
        self.assertNotIn(b, self.groups()[0][1])

    def test_large_files_differing_within_the_head_chunk(self):
        tail = b"z" * (dupefind.HEAD_BYTES * 2)
        self.write("a", b"A" + tail)
        self.write("b", b"B" + tail)
        self.assertEqual(self.groups(), [])

    def test_multi_chunk_file_is_hashed_in_full(self):
        body = os.urandom(dupefind.CHUNK * 2 + 17)
        a, b = self.write("a", body), self.write("b", body)
        self.assertEqual(self.groups(), [(len(body), sorted([a, b]))])


class TestSelection(Tree):
    def test_empty_files_ignored_by_default(self):
        self.write("a", b"")
        self.write("b", b"")
        self.assertEqual(self.groups(), [])

    def test_empty_files_reported_when_min_size_zero(self):
        a, b = self.write("a", b""), self.write("b", b"")
        self.assertEqual(self.groups(min_size=0), [(0, sorted([a, b]))])

    def test_min_size_filters_small_duplicates(self):
        self.write("a", b"tiny")
        self.write("b", b"tiny")
        self.assertEqual(self.groups(min_size=5), [])

    def test_hidden_files_skipped_by_default(self):
        self.write(".a", b"dup")
        self.write("b", b"dup")
        self.assertEqual(self.groups(), [])

    def test_hidden_files_included_with_flag(self):
        a, b = self.write(".a", b"dup"), self.write("b", b"dup")
        self.assertEqual(self.groups(include_hidden=True), [(3, sorted([a, b]))])

    def test_hidden_directory_pruned(self):
        self.write(".git/a", b"dup")
        self.write("b", b"dup")
        self.assertEqual(self.groups(), [])

    def test_exclude_glob_on_filename(self):
        self.write("a.log", b"dup")
        self.write("b", b"dup")
        self.assertEqual(self.groups(exclude=["*.log"]), [])

    def test_exclude_glob_prunes_directory(self):
        self.write("node_modules/a", b"dup")
        self.write("b", b"dup")
        self.assertEqual(self.groups(exclude=["node_modules"]), [])

    def test_explicit_file_arguments_are_scanned(self):
        a = self.write("a", b"dup")
        b = self.write("b", b"dup")
        self.assertEqual(find_duplicates([a, b]), [(3, sorted([a, b]))])

    def test_overlapping_roots_do_not_self_duplicate(self):
        self.write("sub/a", b"dup")
        self.assertEqual(find_duplicates([self.root, os.path.join(self.root, "sub")]), [])


class TestLinks(Tree):
    def test_hardlinks_are_not_duplicates(self):
        a = self.write("a", b"dup")
        os.link(a, os.path.join(self.root, "b"))
        self.assertEqual(self.groups(), [])

    def test_hardlink_still_matches_a_separate_identical_file(self):
        a = self.write("a", b"dup")
        b = os.path.join(self.root, "b")
        os.link(a, b)
        c = self.write("c", b"dup")
        found = self.groups()
        self.assertEqual(len(found), 1)
        size, paths = found[0]
        self.assertEqual(size, 3)
        self.assertIn(c, paths)
        self.assertEqual(len(paths), 2)  # only one of the two hardlinked names

    def test_symlinks_ignored_by_default(self):
        a = self.write("a", b"dup")
        os.symlink(a, os.path.join(self.root, "link"))
        self.assertEqual(self.groups(), [])

    def test_symlink_to_the_same_inode_is_not_a_duplicate_when_followed(self):
        a = self.write("a", b"dup")
        os.symlink(a, os.path.join(self.root, "link"))
        self.assertEqual(self.groups(follow_symlinks=True), [])

    def test_broken_symlink_is_skipped_silently(self):
        os.symlink(os.path.join(self.root, "nope"), os.path.join(self.root, "link"))
        self.write("a", b"dup")
        self.write("b", b"dup")
        skipped = Skipped()
        found = find_duplicates([self.root], follow_symlinks=True, skipped=skipped)
        self.assertEqual(len(found), 1)
        self.assertEqual(len(skipped), 1)

    def test_fifos_are_never_opened(self):
        # Two zero-length fifos would group by size and then block forever on
        # read() if they were mistaken for regular files.
        os.mkfifo(os.path.join(self.root, "p1"))
        os.mkfifo(os.path.join(self.root, "p2"))
        self.assertEqual(self.groups(min_size=0), [])
        self.assertEqual(self.groups(min_size=0, follow_symlinks=True), [])


class TestErrors(Tree):
    @unittest.skipIf(os.geteuid() == 0, "root bypasses permission bits")
    def test_unreadable_file_is_recorded_not_fatal(self):
        a = self.write("a", b"dup")
        b = self.write("b", b"dup")
        c = self.write("c", b"dup")
        os.chmod(b, 0)
        self.addCleanup(os.chmod, b, stat.S_IRUSR | stat.S_IWUSR)

        skipped = Skipped()
        found = find_duplicates([self.root], skipped=skipped)
        self.assertEqual(found, [(3, sorted([a, c]))])
        self.assertEqual([p for p, _ in skipped.entries], [b])

    @unittest.skipIf(os.geteuid() == 0, "root bypasses permission bits")
    def test_unreadable_directory_is_recorded_not_fatal(self):
        self.write("locked/a", b"dup")
        self.write("b", b"dup")
        self.write("c", b"dup")
        locked = os.path.join(self.root, "locked")
        os.chmod(locked, 0)
        self.addCleanup(os.chmod, locked, 0o700)

        skipped = Skipped()
        found = find_duplicates([self.root], skipped=skipped)
        self.assertEqual(len(found), 1)
        self.assertEqual(len(skipped), 1)


class TestCLI(Tree):
    def run_cli(self, *argv):
        out, err = io.StringIO(), io.StringIO()
        with redirect_stdout(out), redirect_stderr(err):
            code = main(list(argv))
        return code, out.getvalue(), err.getvalue()

    def test_exit_code_one_when_duplicates_found(self):
        self.write("a", b"dup")
        self.write("b", b"dup")
        code, out, _ = self.run_cli(self.root)
        self.assertEqual(code, 1)
        self.assertIn("2 files, 3 B each:", out)
        self.assertIn("1 duplicate group(s)", out)

    def test_exit_code_zero_when_clean(self):
        self.write("a", b"one")
        code, out, _ = self.run_cli(self.root)
        self.assertEqual(code, 0)
        self.assertIn("No duplicates found.", out)

    def test_quiet_prints_bare_paths_only(self):
        a = self.write("a", b"dup")
        b = self.write("b", b"dup")
        _, out, _ = self.run_cli(self.root, "--quiet")
        self.assertEqual(sorted(out.split()), sorted([a, b]))

    def test_json_output_shape_and_wasted_bytes(self):
        a = self.write("a", b"dup")
        b = self.write("b", b"dup")
        c = self.write("c", b"dup")
        _, out, _ = self.run_cli(self.root, "--json")
        data = json.loads(out)
        self.assertEqual(data["groups"],
                         [{"size": 3, "count": 3, "paths": sorted([a, b, c])}])
        self.assertEqual(data["wasted_bytes"], 6)  # 3 copies, 2 redundant
        self.assertEqual(data["skipped"], [])

    def test_json_is_valid_when_nothing_is_found(self):
        _, out, _ = self.run_cli(self.root, "--json")
        self.assertEqual(json.loads(out),
                         {"groups": [], "wasted_bytes": 0, "skipped": []})

    def test_flags_reach_the_scanner(self):
        self.write(".a", b"dup")
        self.write("b", b"dup")
        self.assertEqual(self.run_cli(self.root)[0], 0)
        self.assertEqual(self.run_cli(self.root, "--hidden")[0], 1)
        self.assertEqual(self.run_cli(self.root, "-a", "-x", ".a")[0], 0)
        self.assertEqual(self.run_cli(self.root, "-a", "-m", "9")[0], 0)

    def test_missing_path_errors_out(self):
        with self.assertRaises(SystemExit) as cm:
            self.run_cli(os.path.join(self.root, "nope"))
        self.assertEqual(cm.exception.code, 2)

    def test_defaults_to_current_directory(self):
        self.write("a", b"dup")
        self.write("b", b"dup")
        cwd = os.getcwd()
        os.chdir(self.root)
        self.addCleanup(os.chdir, cwd)
        self.assertEqual(self.run_cli()[0], 1)

    def test_skipped_files_are_reported_on_stderr(self):
        os.symlink(os.path.join(self.root, "nope"), os.path.join(self.root, "link"))
        _, _, err = self.run_cli(self.root, "-L")
        self.assertIn("dupefind: skipped", err)


class TestHuman(unittest.TestCase):
    def test_units(self):
        self.assertEqual(dupefind.human(0), "0 B")
        self.assertEqual(dupefind.human(999), "999 B")
        self.assertEqual(dupefind.human(1024), "1.0 KB")
        self.assertEqual(dupefind.human(1536), "1.5 KB")
        self.assertEqual(dupefind.human(1024 ** 3), "1.0 GB")
        self.assertEqual(dupefind.human(1024 ** 5), "1024.0 TB")


if __name__ == "__main__":
    unittest.main()
