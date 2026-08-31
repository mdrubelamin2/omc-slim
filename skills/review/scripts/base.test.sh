#!/usr/bin/env bash
# Prove base.sh resolves the chain its SKILL.md prose describes.
#
# Case 1 is a master-default repository. A chain that tries `origin/HEAD` and
# then the literal `main` dies there with `fatal: ambiguous argument 'main'`, so
# the case fails against that chain and passes against the script. A case that
# cannot fail is a demonstration, not a test.
set -uo pipefail

SCRIPT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/base.sh"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
pass=0
fail=0

check() {
  local name="$1" expect="$2" got="$3"
  if printf '%s' "$got" | grep -qF -- "$expect"; then
    printf 'PASS  %s\n' "$name"; pass=$((pass + 1))
  else
    printf 'FAIL  %s\n        expected to contain: %s\n        got: %s\n' \
      "$name" "$expect" "$(printf '%s' "$got" | head -3)"
    fail=$((fail + 1))
  fi
}

# The other direction, for the cases that are only meaningful if a string is
# ABSENT — a stale-base warning printed unconditionally would satisfy every
# `check` below while telling the reviewer nothing.
refute() {
  local name="$1" absent="$2" got="$3"
  if printf '%s' "$got" | grep -qF -- "$absent"; then
    printf 'FAIL  %s\n        expected NOT to contain: %s\n        got: %s\n' \
      "$name" "$absent" "$(printf '%s' "$got" | head -3)"
    fail=$((fail + 1))
  else
    printf 'PASS  %s\n' "$name"; pass=$((pass + 1))
  fi
}

newrepo() {
  local dir="$TMP/$1" branch="$2"
  mkdir -p "$dir" && git -C "$dir" init -q -b "$branch" .
  git -C "$dir" config user.email t@example.com
  git -C "$dir" config user.name t
  echo one > "$dir/a.txt"
  git -C "$dir" add -A && git -C "$dir" commit -qm init
  printf '%s' "$dir"
}

d=$(newrepo master-default master); echo two >> "$d/a.txt"
check "master-default repo with no remote resolves" "base: master" "$(bash "$SCRIPT" "$d" 2>&1)"
check "master-default repo counts the change"       "changed lines: 1" "$(bash "$SCRIPT" "$d" 2>&1)"

d=$(newrepo main-default main)
check "clean tree reports nothing to review" "changed lines: 0" "$(bash "$SCRIPT" "$d" 2>&1)"

d=$(newrepo uncommitted main); echo two >> "$d/a.txt"
check "uncommitted work is in the diff" "changed lines: 1" "$(bash "$SCRIPT" "$d" 2>&1)"

d=$(newrepo untracked main); echo new > "$d/brand-new.js"
check "an untracked file is reported, not silently dropped" "brand-new.js" "$(bash "$SCRIPT" "$d" 2>&1)"
check "an untracked file is labelled as absent from the diff" "absent from the diff" "$(bash "$SCRIPT" "$d" 2>&1)"
check "a tree with only an untracked file is not 'nothing to review'" "untracked" "$(bash "$SCRIPT" "$d" 2>&1)"

# --out sends the diff to a file so a caller dispatching lanes never holds it.
# One compound check: the file carries the hunks and the commit list, stdout
# carries no hunk at all. A pass on either half alone would mean nothing.
d=$(newrepo out-file main)
git -C "$d" checkout -q -b topic && echo two >> "$d/a.txt" && git -C "$d" commit -qam "topic change"
out=$(bash "$SCRIPT" "$d" --out "$TMP/out-file.diff" 2>&1)
summary="file hunks: $(grep -c '^@@' "$TMP/out-file.diff" 2>/dev/null || true)"
summary="$summary, stdout hunks: $(printf '%s\n' "$out" | grep -c '^@@' || true)"
summary="$summary, commit listed: $(grep -q 'topic change' "$TMP/out-file.diff" 2>/dev/null && echo yes || echo no)"
check "--out writes hunks and the commit list to the file, and keeps hunks off stdout" \
  "file hunks: 1, stdout hunks: 0, commit listed: yes" "$summary"
check "without --out the diff is still printed" "@@" "$(bash "$SCRIPT" "$d" 2>&1)"
# An unwritable FILE must be an error, not a success line over a file that is
# not there. Exit status and the absence of the success line are one predicate.
unwritable=$(bash "$SCRIPT" "$d" --out "$TMP/no-such-dir/out.diff" 2>&1); status=$?
check "--out to an unwritable path fails and does not claim the diff was written" \
  "exit 1, announced: no" \
  "exit $status, announced: $(printf '%s' "$unwritable" | grep -q 'diff written to' && echo yes || echo no)"

# Lanes read FILE and nothing else, so an untracked file listed only on stdout
# is a file no lane sees. It goes into FILE as a new-file diff, and stdout says
# so instead of calling it absent.
d=$(newrepo out-untracked main); echo new > "$d/brand-new.js"
out=$(bash "$SCRIPT" "$d" --out "$TMP/out-untracked.diff" 2>&1)
check "--out carries an untracked file as a new-file diff" \
  "+++ b/brand-new.js" "$(cat "$TMP/out-untracked.diff" 2>/dev/null)"
check "--out says the untracked files are in FILE, not absent from it" \
  "included in FILE as new-file diffs" "$out"

# The other two exit-1 paths the header documents, each named on stderr. A
# missing value would otherwise be read as DIR, or leave FILE empty and print
# the diff to stdout as if --out had never been given.
noval=$(bash "$SCRIPT" "$d" --out 2>&1); status=$?
check "--out with no value exits 1 and says so" \
  "exit 1, said: yes" \
  "exit $status, said: $(printf '%s' "$noval" | grep -q 'review-base: --out needs a file path' && echo yes || echo no)"
nodir=$(bash "$SCRIPT" "$TMP/no-such-dir" 2>&1); status=$?
check "a DIR that cannot be entered exits 1 and says so" \
  "exit 1, said: yes" \
  "exit $status, said: $(printf '%s' "$nodir" | grep -q 'review-base: cannot enter' && echo yes || echo no)"

# A relative FILE is the caller's path, resolved where the caller stands rather
# than inside DIR: a dispatcher passing `--out review.diff` from the project
# root must find it there.
d=$(newrepo relative-out main); echo two >> "$d/a.txt"
mkdir -p "$TMP/elsewhere"
(cd "$TMP/elsewhere" && bash "$SCRIPT" "$d" --out rel.diff >/dev/null 2>&1)
landed=nowhere
[ -f "$d/rel.diff" ] && landed=DIR
[ -f "$TMP/elsewhere/rel.diff" ] && landed="the caller's cwd"
check "a relative --out resolves against the caller's cwd, not DIR" \
  "landed in: the caller's cwd" "landed in: $landed"

mkdir -p "$TMP/plain"
check "a non-repository says so and exits 0" "not a git repository" "$(bash "$SCRIPT" "$TMP/plain" 2>&1)"
bash "$SCRIPT" "$TMP/plain" >/dev/null 2>&1
check "a non-repository exits 0" "0" "$?"

# The fetch is the one step that can block. Against a dead remote or a VPN an
# unbounded `git fetch -q` waits out git's own connect timeout in silence, and a
# fetch that fails quietly leaves a stale base looking exactly like a fresh one.

# A `git` earlier in PATH that hangs on `fetch` and passes everything else
# through. A genuinely unreachable remote needs the network to cooperate to
# hang; this reproduces the block deterministically and offline.
mkdir -p "$TMP/hang-bin"
REAL_GIT="$(command -v git)"
cat > "$TMP/hang-bin/git" <<EOF
#!/usr/bin/env bash
for arg in "\$@"; do [ "\$arg" = fetch ] && exec sleep 15; done
exec "$REAL_GIT" "\$@"
EOF
chmod +x "$TMP/hang-bin/git"

d=$(newrepo hanging-fetch master); git -C "$d" remote add origin "file://$d"
started=$(date +%s)
hung=$(PATH="$TMP/hang-bin:$PATH" REVIEW_FETCH_TIMEOUT_SECONDS=1 bash "$SCRIPT" "$d" 2>&1)
elapsed=$(( $(date +%s) - started ))
check "a hanging fetch is given up on and said so" "fetch timed out after 1s" "$hung"
check "and the review is told the base may be stale" "may be stale" "$hung"
check "and the script still produces its base line" "base: master" "$hung"
check "and it returns in seconds, not in the fetch's own time" "within budget" \
  "$([ "$elapsed" -lt 10 ] && echo "within budget" || echo "took ${elapsed}s")"

d=$(newrepo dead-remote master); git -C "$d" remote add origin "file:///nonexistent/dead.git"
check "an unreachable remote is reported, not swallowed" "fetch failed" "$(bash "$SCRIPT" "$d" 2>&1)"

d=$(newrepo no-remote master)
check "a repository with no origin says the comparison is local" \
  "no origin remote" "$(bash "$SCRIPT" "$d" 2>&1)"

# The negative direction: a warning printed unconditionally would pass every
# case above and mean nothing. A fetch that worked must not claim staleness.
upstream=$(newrepo fetch-upstream master)
git clone -q "$upstream" "$TMP/fetch-clone" 2>/dev/null
refute "a fetch that succeeds does not claim the base is stale" \
  "may be stale" "$(bash "$SCRIPT" "$TMP/fetch-clone" 2>&1)"

# A tracked-diff failure must fail --out even though the untracked loop runs
# after it and always exits 0.
mkdir -p "$TMP/faildiff-bin"
cat > "$TMP/faildiff-bin/git" <<EOF
#!/usr/bin/env bash
prev=""
for arg in "\$@"; do
  if [ "\$prev" = diff ] && [ "\$arg" = -U10 ]; then echo "boom" >&2; exit 128; fi
  prev="\$arg"
done
exec "$REAL_GIT" "\$@"
EOF
chmod +x "$TMP/faildiff-bin/git"
d=$(newrepo faildiff master); echo change >> "$d/README.md"
out=$(PATH="$TMP/faildiff-bin:$PATH" bash "$SCRIPT" "$d" --out "$TMP/faildiff.patch" 2>&1); status=$?
check "a failed tracked diff fails --out" "cannot write" "$out"
check "and exits 1" "1" "$status"
refute "and does not announce the file" "diff written to" "$out"

# Untracked names outside ASCII must reach FILE unquoted, or the file is
# silently unreviewed under a header claiming inclusion.
d=$(newrepo unicode-untracked master); printf 'x\n' > "$d/café.js"
bash "$SCRIPT" "$d" --out "$TMP/unicode.patch" >/dev/null 2>&1
check "a non-ASCII untracked file is included in FILE" "+++ b/café.js" "$(cat "$TMP/unicode.patch")"

# The negative control, run through the matcher rather than through `check`, so
# it never prints a FAIL line for succeeding. Without it, every case above could
# be passing on an incidental substring match and the suite could not tell.
if printf '%s' "base: master" | grep -qF -- "base: nonesuch"; then
  printf 'FAIL  negative control matched a string that is not there — this suite proves nothing\n'
  fail=$((fail + 1))
else
  printf 'PASS  negative control did not match, so a match means something\n'
  pass=$((pass + 1))
fi

printf '\n%d/%d passed\n' "$pass" "$((pass + fail))"
[ "$fail" -eq 0 ]
