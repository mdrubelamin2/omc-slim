#!/usr/bin/env bash
# Rebuild the held-out grading fixture for the duplicate-finder benchmark.
#
# docs/BENCHMARK.md describes this fixture in prose ("Grading fixture" in the
# Method section) but the tree itself was never committed — every arm was
# graded against a directory that only ever existed on the grader's machine.
# That makes the benchmark unreproducible: nobody else can regrade an arm, or
# add a fourth, against the same fixture. This script rebuilds it byte-for-byte
# so it can be committed and reused instead of re-typed from memory each time.
#
# Two trees plus a manifest:
#   tree/     - the 13 scored entries: three duplicate groups, two empty
#               files, two unique files, a symlink and a hardlink. Per-case
#               comments below explain why each one is awkward on purpose.
#   hostile/  - four things that must not crash or hang a tool, but carry no
#               duplicate grading of their own: a FIFO, a broken symlink, a
#               symlink loop, and a mode-000 directory (built last — see that
#               section for why).
#   manifest.json - the answer key a separate grader reads. Its shape is a
#               contract with that grader, not a preference of this script.
#
#   ./scripts/bench/make-fixture.sh /tmp/omc-bench-fixture
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "usage: $(basename "$0") <output-directory>" >&2
  exit 1
fi

OUT="$1"

# Refuse to merge into an existing tree — a stale file left over from a
# previous run (or a hand edit) would silently survive into "regenerated"
# output, which defeats the point of regenerating it.
if [ -e "$OUT" ]; then
  echo "refusing to run: '$OUT' already exists — delete it first, this script does not merge into an existing tree" >&2
  exit 1
fi

TREE="$OUT/tree"
HOSTILE="$OUT/hostile"

# --- tree/: the 13 scored entries, across 4 directories ---------------------
# Paths are relative to $OUT throughout, since that's also what manifest.json
# records and what every filesystem command below builds on.
TEXT3_A="tree/a/x.txt"
TEXT3_B="tree/b/y.txt"
TEXT3_C="tree/c/z.txt"
BIN_A="tree/a/binary1.bin"
BIN_C="tree/c/binary2.bin"
BIG_A="tree/a/big1.bin"
BIG_D="tree/d/big2.bin"
EMPTY_B="tree/b/empty1.txt"
EMPTY_C="tree/c/empty2.txt"
UNIQUE_B="tree/b/unique1.txt"
UNIQUE_D="tree/d/unique2.txt"
SYMLINK_C="tree/c/symlink-to-x.txt"
HARDLINK_D="tree/d/unique1-hardlink.txt"

mkdir -p "$TREE/a" "$TREE/b" "$TREE/c" "$TREE/d"

# 3-way duplicate, not a pair: a tool that only ever compares two files at a
# time (the common shortcut) reports "a matches b" and "a matches c" as two
# separate pairs instead of recognizing one group of three. Three different
# directories so a per-directory scan can't stumble into the right answer by
# accident either.
TEXT3_LINE="identical content, three directories: the 3-way duplicate group."
printf '%s\n' "$TEXT3_LINE" > "$OUT/$TEXT3_A"
printf '%s\n' "$TEXT3_LINE" > "$OUT/$TEXT3_B"
printf '%s\n' "$TEXT3_LINE" > "$OUT/$TEXT3_C"

# Binary pair: the one intentionally non-deterministic ingredient in this
# fixture. /dev/urandom is read exactly once and copied to both paths — read
# it twice and the "pair" would almost certainly not match, since each read
# returns different bytes. The leading 0xFF is not part of the random draw; it
# guarantees the content is invalid UTF-8 outright, rather than relying on
# random bytes alone happening to be invalid, which is likely but not certain.
bin_tmp="$(mktemp)"
{ printf '\xff'; head -c 255 /dev/urandom; } > "$bin_tmp"
cp "$bin_tmp" "$OUT/$BIN_A"
cp "$bin_tmp" "$OUT/$BIN_C"
rm -f "$bin_tmp"

# Two empty files, in different directories. Content-identical (both zero
# bytes) but deliberately NOT one of the three scored groups below — tools
# disagree on whether two empty files count as duplicates, and the original
# benchmark scored exactly three groups. Recorded in the manifest's separate
# "empty" list instead.
touch "$OUT/$EMPTY_B" "$OUT/$EMPTY_C"

# 200 KB is large enough to exercise a different code path than the small text
# files above — a tool that hashes incrementally behaves the same either way,
# but one that reads whole files into memory, or short-circuits after the
# first few KB, can get this one wrong even when the small cases pass.
#
# Not `yes | head -c`: head closes the pipe once it has enough bytes, yes gets
# SIGPIPE, and under `pipefail` that kills the whole script even though
# nothing actually went wrong. /dev/zero has no writer process to signal.
head -c 204800 /dev/zero > "$OUT/$BIG_A"
cp "$OUT/$BIG_A" "$OUT/$BIG_D"

# Two unique files with distinct content — not duplicates of anything, so a
# tool that over-matches (hashing only the first N bytes, or a weak/short hash
# with collisions) shows up as a false positive here.
printf '%s\n' "unique file one: distinct content, exists to catch false positives." > "$OUT/$UNIQUE_B"
printf '%s\n' "unique file two: distinct content, exists to catch false positives." > "$OUT/$UNIQUE_D"

# Symlink points at a member of the 3-way group. The trap: a tool that
# resolves symlinks before hashing "discovers" a 4th duplicate that isn't a
# real file — same bytes, reachable by a second path. Correct behaviour is to
# report it as a symlink, not fold it into the text3 group's count.
ln -s "../${TEXT3_A#tree/}" "$OUT/$SYMLINK_C"

# Hardlink shares an inode with one of the unique files, not with a duplicate
# group — attaching it to a group member would blur two separate traps into
# one path (is the 4th entry a genuine duplicate, or a hardlink of one?). Kept
# on a unique file, the hardlink trap is testable on its own: neither a real
# duplicate (it's one file, one set of bytes, two names) nor a false unique.
#
# WARNING to anyone writing a grader against this fixture: the hardlink's twin
# is deliberately also in the manifest's "unique" list. A grader that flags any
# unique path appearing in a duplicate group will therefore score a CORRECT
# tool — one that discloses the hardlink — as a false positive. Exclude a
# unique path's own hardlink partner. scripts/bench/grade.sh hit exactly this
# and had to be fixed; the overlap is intentional, so guard for it.
ln "$OUT/$UNIQUE_B" "$OUT/$HARDLINK_D"

# --- self-check ---------------------------------------------------------
# 11 regular files + 1 symlink + 1 hardlink = 13 entries (docs/BENCHMARK.md,
# "Grading fixture"). A plain `find "$TREE" -mindepth 1` also counts the 4
# container directories (a/b/c/d), so directories are excluded here to check
# the number the fixture is actually specified by.
entry_count="$(find "$TREE" -mindepth 1 ! -type d | wc -l | tr -d ' ')"
if [ "$entry_count" -ne 13 ]; then
  echo "internal error: expected 13 entries in $TREE, found $entry_count" >&2
  exit 1
fi

# --- manifest.json: the answer key a separate grader reads ------------------
# Shape is fixed by the grader's contract: three scored groups (text3, binary,
# big), plus empty/unique/symlink/hardlink recorded separately because none of
# those four are graded as duplicate groups. All paths relative to $OUT, built
# with python's json module so the output is guaranteed valid rather than
# hand-assembled and hoped-for.
python3 - "$OUT" "$TEXT3_A" "$TEXT3_B" "$TEXT3_C" "$BIN_A" "$BIN_C" "$BIG_A" "$BIG_D" \
  "$EMPTY_B" "$EMPTY_C" "$UNIQUE_B" "$UNIQUE_D" "$SYMLINK_C" "$HARDLINK_D" <<'PY'
import json, sys

(out, text3_a, text3_b, text3_c, bin_a, bin_c, big_a, big_d,
 empty_b, empty_c, unique_b, unique_d,
 symlink_path, hardlink_path) = sys.argv[1:]

manifest = {
    "groups": [
        {"id": "text3",  "paths": [text3_a, text3_b, text3_c]},
        {"id": "binary", "paths": [bin_a, bin_c]},
        {"id": "big",    "paths": [big_a, big_d]},
    ],
    "empty":  [empty_b, empty_c],
    "unique": [unique_b, unique_d],
    # The symlink targets text3_a and the hardlink shares unique_b's inode —
    # both already appear above; reused here rather than passed a second
    # time, so the relationship is visible in the source instead of resting
    # on two positional args a reader has to trust line up.
    "symlink":  {"path": symlink_path, "target": text3_a},
    "hardlink": {"path": hardlink_path, "twin": unique_b},
}

with open(f"{out}/manifest.json", "w") as f:
    json.dump(manifest, f, indent=2)
    f.write("\n")
PY

# --- hostile/: robustness only, no duplicate grading -------------------------
mkdir -p "$HOSTILE"

# FIFO: never returns EOF to a reader that isn't matched by a writer. A tool
# that opens every path with a plain read() hangs here instead of erroring.
mkfifo "$HOSTILE/fifo"

# Broken symlink: the target never exists. lstat() before stat() survives;
# following it blindly (open, read, hash) fails with ENOENT.
ln -s "does-not-exist" "$HOSTILE/broken-symlink"

# Symlink loop: points at itself. Resolving it fully — realpath(), or any walk
# that doesn't cap depth or track visited inodes — cycles forever.
ln -s "loop" "$HOSTILE/loop"

# chmod 000 directory, created last. Everything above has to exist first:
# once this mode is applied, nothing can be listed or written inside it, so it
# has to be the final filesystem mutation this script makes — otherwise a
# later step failing here would leave a locked directory behind that the
# caller has to chmod through before they could even retry or delete the tree.
mkdir "$HOSTILE/locked"
chmod 000 "$HOSTILE/locked"
echo "warning: chmod 755 '$HOSTILE/locked' before deleting $OUT — rm -rf cannot descend into a mode-000 directory" >&2

echo "fixture written to $OUT (tree/: 13 entries across 4 dirs; hostile/: FIFO + broken symlink + loop + locked dir; manifest.json)"
