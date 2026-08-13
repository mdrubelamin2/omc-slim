#!/usr/bin/env python3
"""Find duplicate files in a directory tree."""

from __future__ import annotations

import argparse
import fnmatch
import hashlib
import json
import os
import stat
import sys
from collections import defaultdict

READ_CHUNK = 1 << 20  # 1 MiB
QUICK_BYTES = 1 << 14  # 16 KiB sampled from the head before full hashing


def human(size: int) -> str:
    value = float(size)
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if value < 1024 or unit == "TB":
            return f"{value:.0f} {unit}" if unit == "B" else f"{value:.1f} {unit}"
        value /= 1024
    return f"{value:.1f} TB"


def walk(roots, follow_symlinks=False, include_hidden=False, excludes=()):
    """Yield (path, size) for regular files under roots, skipping duplicates of
    the same inode reached through different paths."""
    seen_dirs = set()
    for root in roots:
        for dirpath, dirnames, filenames in os.walk(root, followlinks=follow_symlinks):
            if follow_symlinks:
                # Guard against symlink loops revisiting the same directory.
                try:
                    key = os.stat(dirpath).st_ino, os.stat(dirpath).st_dev
                except OSError:
                    continue
                if key in seen_dirs:
                    dirnames[:] = []
                    continue
                seen_dirs.add(key)

            dirnames[:] = [
                d
                for d in dirnames
                if (include_hidden or not d.startswith("."))
                and not any(fnmatch.fnmatch(d, pat) for pat in excludes)
            ]

            for name in filenames:
                if not include_hidden and name.startswith("."):
                    continue
                if any(fnmatch.fnmatch(name, pat) for pat in excludes):
                    continue
                path = os.path.join(dirpath, name)
                if not follow_symlinks and os.path.islink(path):
                    continue
                try:
                    st = os.stat(path)
                except OSError as exc:
                    print(f"dupefind: {path}: {exc.strerror}", file=sys.stderr)
                    continue
                if not stat.S_ISREG(st.st_mode):
                    continue
                yield path, st


def group_by_size(entries, min_size):
    groups = defaultdict(list)
    for path, st in entries:
        if st.st_size < min_size:
            continue
        groups[st.st_size].append((path, st))
    return {size: items for size, items in groups.items() if len(items) > 1}


def digest(path: str, limit: int | None = None) -> str:
    h = hashlib.blake2b(digest_size=16)
    remaining = limit
    with open(path, "rb") as fh:
        while remaining is None or remaining > 0:
            want = READ_CHUNK if remaining is None else min(READ_CHUNK, remaining)
            chunk = fh.read(want)
            if not chunk:
                break
            h.update(chunk)
            if remaining is not None:
                remaining -= len(chunk)
    return h.hexdigest()


def refine(groups, limit, on_error):
    """Split each group of candidates by hash (partial if limit is set)."""
    out = []
    for items in groups:
        by_hash = defaultdict(list)
        for path, st in items:
            try:
                by_hash[digest(path, limit)].append((path, st))
            except OSError as exc:
                on_error(f"dupefind: {path}: {exc.strerror}")
        out.extend(group for group in by_hash.values() if len(group) > 1)
    return out


def find_duplicates(roots, *, min_size=1, follow_symlinks=False, include_hidden=False,
                    excludes=(), quiet=False):
    """Return [(size, [path, ...]), ...] sorted by descending size."""

    def warn(msg):
        if not quiet:
            print(msg, file=sys.stderr)

    entries = walk(roots, follow_symlinks, include_hidden, excludes)
    size_groups = group_by_size(entries, min_size)

    # Drop hardlinks/identical inodes within a group: they are the same bytes on
    # disk, not a wasteful copy.
    candidates = []
    for size, items in size_groups.items():
        by_inode = {}
        for path, st in items:
            by_inode.setdefault((st.st_dev, st.st_ino), (path, st))
        deduped = list(by_inode.values())
        if len(deduped) > 1:
            candidates.append(deduped)

    # Cheap pass first: only files matching on a 16 KiB head get fully hashed.
    candidates = refine(candidates, QUICK_BYTES, warn)
    groups = refine(candidates, None, warn)

    result = [(g[0][1].st_size, sorted(path for path, _ in g)) for g in groups]
    result.sort(key=lambda item: (-item[0], item[1][0]))
    return result


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(
        prog="dupefind", description="Find duplicate files in a directory tree."
    )
    ap.add_argument("paths", nargs="*", default=["."], help="directories to scan (default: .)")
    ap.add_argument("-m", "--min-size", type=int, default=1, metavar="BYTES",
                    help="ignore files smaller than this (default: 1, i.e. skip empty files)")
    ap.add_argument("-x", "--exclude", action="append", default=[], metavar="GLOB",
                    help="skip files/dirs matching this glob (repeatable)")
    ap.add_argument("-a", "--all", action="store_true", help="include hidden files and directories")
    ap.add_argument("-L", "--follow-symlinks", action="store_true", help="follow symlinked directories")
    ap.add_argument("--json", action="store_true", help="emit JSON instead of text")
    ap.add_argument("-q", "--quiet", action="store_true", help="suppress unreadable-file warnings")
    args = ap.parse_args(argv)

    roots = args.paths or ["."]
    for root in roots:
        if not os.path.isdir(root):
            print(f"dupefind: {root}: not a directory", file=sys.stderr)
            return 2

    groups = find_duplicates(
        roots,
        min_size=args.min_size,
        follow_symlinks=args.follow_symlinks,
        include_hidden=args.all,
        excludes=args.exclude,
        quiet=args.quiet,
    )

    wasted = sum(size * (len(paths) - 1) for size, paths in groups)

    if args.json:
        json.dump(
            {
                "groups": [
                    {"size": size, "count": len(paths), "files": paths} for size, paths in groups
                ],
                "wasted_bytes": wasted,
            },
            sys.stdout,
            indent=2,
        )
        sys.stdout.write("\n")
    elif not groups:
        print("No duplicates found.")
    else:
        for size, group in groups:
            print(f"{len(group)} files, {human(size)} each ({human(size * (len(group) - 1))} wasted):")
            for path in group:
                print(f"  {path}")
            print()
        print(f"{len(groups)} duplicate group(s), {human(wasted)} reclaimable.")

    return 1 if groups else 0


if __name__ == "__main__":
    sys.exit(main())
