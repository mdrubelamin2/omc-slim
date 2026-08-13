#!/usr/bin/env python3
"""Find duplicate files in a directory tree.

Files are compared by content using a three-stage funnel: size, then a hash of
the leading chunk, then a full-content hash. Each stage only reads files that
survived the previous one, so most non-duplicates are rejected after a stat().
"""

from __future__ import annotations

import argparse
import fnmatch
import hashlib
import json
import os
import stat
import sys
from collections import defaultdict

CHUNK = 65536
HEAD_BYTES = 4096


class Skipped:
    """Collects paths that could not be read, with the reason why."""

    def __init__(self) -> None:
        self.entries: list[tuple[str, str]] = []

    def add(self, path: str, exc: OSError) -> None:
        self.entries.append((path, exc.strerror or str(exc)))

    def __len__(self) -> int:
        return len(self.entries)


def _hash_file(path: str, limit: int | None = None) -> str:
    h = hashlib.blake2b(digest_size=16)
    read = 0
    with open(path, "rb", buffering=0) as fh:
        while limit is None or read < limit:
            want = CHUNK if limit is None else min(CHUNK, limit - read)
            block = fh.read(want)
            if not block:
                break
            read += len(block)
            h.update(block)
    return h.hexdigest()


def _excluded(name: str, patterns: list[str]) -> bool:
    return any(fnmatch.fnmatch(name, p) for p in patterns)


def walk_files(roots, *, exclude, include_hidden, follow_symlinks, skipped):
    """Yield (path, stat_result) for every regular file under the roots.

    Hardlinks and paths reached twice (overlapping roots, symlinked dirs) are
    yielded once: the same inode is not a duplicate of itself.
    """
    seen: set[tuple[int, int]] = set()
    for root in roots:
        if os.path.isfile(root):
            entries = [(root, os.path.basename(root))]
            walk = []
        else:
            entries = []
            walk = os.walk(root, followlinks=follow_symlinks,
                           onerror=lambda e: skipped.add(getattr(e, "filename", root), e))

        for dirpath, dirnames, filenames in walk:
            dirnames[:] = [
                d for d in dirnames
                if not _excluded(d, exclude) and (include_hidden or not d.startswith("."))
            ]
            entries.extend((os.path.join(dirpath, f), f) for f in filenames)

        for path, name in entries:
            if _excluded(name, exclude) or (not include_hidden and name.startswith(".")):
                continue
            try:
                st = os.stat(path) if follow_symlinks else os.lstat(path)
                # lstat keeps symlinks out; stat resolves them and drops
                # anything that is not a regular file (fifos, sockets, devices).
                if not stat.S_ISREG(st.st_mode):
                    continue
            except OSError as exc:
                skipped.add(path, exc)
                continue
            key = (st.st_dev, st.st_ino)
            if key in seen:
                continue
            seen.add(key)
            yield path, st


def _refine(groups, hasher, skipped):
    """Split each group of candidate paths by the given hash function."""
    out = []
    for paths in groups:
        buckets: dict[str, list[str]] = defaultdict(list)
        for path in paths:
            try:
                buckets[hasher(path)].append(path)
            except OSError as exc:
                skipped.add(path, exc)
        out.extend(g for g in buckets.values() if len(g) > 1)
    return out


def find_duplicates(roots, *, min_size=1, exclude=(), include_hidden=False,
                    follow_symlinks=False, skipped=None):
    """Return [(size, [path, ...]), ...] for each set of identical files."""
    skipped = skipped if skipped is not None else Skipped()
    exclude = list(exclude)

    by_size: dict[int, list[str]] = defaultdict(list)
    for path, st in walk_files(roots, exclude=exclude, include_hidden=include_hidden,
                               follow_symlinks=follow_symlinks, skipped=skipped):
        if st.st_size >= min_size:
            by_size[st.st_size].append(path)

    results = []
    for size, paths in by_size.items():
        if len(paths) < 2:
            continue
        # Files smaller than the head chunk are fully covered by it already.
        groups = [paths]
        if size > HEAD_BYTES:
            groups = _refine(groups, lambda p: _hash_file(p, HEAD_BYTES), skipped)
        groups = _refine(groups, _hash_file, skipped)
        results.extend((size, sorted(g)) for g in groups)

    results.sort(key=lambda r: (-r[0], r[1]))
    return results


def human(n: float) -> str:
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if n < 1024 or unit == "TB":
            return f"{n:.0f} {unit}" if unit == "B" else f"{n:.1f} {unit}"
        n /= 1024


def main(argv=None) -> int:
    p = argparse.ArgumentParser(
        prog="dupefind", description="Find duplicate files in a directory tree.")
    p.add_argument("paths", nargs="*", default=["."],
                   help="directories or files to scan (default: current directory)")
    p.add_argument("-m", "--min-size", type=int, default=1, metavar="BYTES",
                   help="ignore files smaller than this (default: 1, i.e. skip empty files)")
    p.add_argument("-x", "--exclude", action="append", default=[], metavar="GLOB",
                   help="skip files and directories matching this glob (repeatable)")
    p.add_argument("-a", "--hidden", action="store_true",
                   help="include dotfiles and dot-directories")
    p.add_argument("-L", "--follow-symlinks", action="store_true",
                   help="follow symlinks instead of ignoring them")
    p.add_argument("--json", action="store_true", help="emit JSON instead of text")
    p.add_argument("-q", "--quiet", action="store_true",
                   help="list duplicate paths only, no headers or summary")
    args = p.parse_args(argv)

    roots = args.paths or ["."]
    for root in roots:
        if not os.path.exists(root):
            p.error(f"path does not exist: {root}")

    skipped = Skipped()
    groups = find_duplicates(roots, min_size=args.min_size, exclude=args.exclude,
                             include_hidden=args.hidden,
                             follow_symlinks=args.follow_symlinks, skipped=skipped)
    wasted = sum(size * (len(paths) - 1) for size, paths in groups)

    if args.json:
        json.dump({
            "groups": [{"size": s, "count": len(ps), "paths": ps} for s, ps in groups],
            "wasted_bytes": wasted,
            "skipped": [{"path": path, "error": err} for path, err in skipped.entries],
        }, sys.stdout, indent=2)
        sys.stdout.write("\n")
    else:
        for size, paths in groups:
            if not args.quiet:
                print(f"{len(paths)} files, {human(size)} each:")
            for path in paths:
                print(path if args.quiet else f"  {path}")
            if not args.quiet:
                print()
        if not args.quiet:
            if groups:
                print(f"{len(groups)} duplicate group(s), {human(wasted)} wasted.")
            else:
                print("No duplicates found.")

    for path, err in skipped.entries:
        print(f"dupefind: skipped {path}: {err}", file=sys.stderr)

    return 1 if groups else 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except BrokenPipeError:
        os.dup2(os.open(os.devnull, os.O_WRONLY), sys.stdout.fileno())
        sys.exit(1)
    except KeyboardInterrupt:
        sys.exit(130)
