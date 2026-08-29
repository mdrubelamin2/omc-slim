#!/usr/bin/env bash
# Prove base.sh resolves the chain its SKILL.md prose describes.
#
# The defect this exists for: the snippet that used to live in SKILL.md tried
# `origin/HEAD` then the literal `main`, so every master-default repository got
# `fatal: ambiguous argument 'main'`. Case 1 is that repository. It fails against
# the old snippet and passes against the script, which is the only thing that
# makes it a test rather than a demonstration.
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

mkdir -p "$TMP/plain"
check "a non-repository says so and exits 0" "not a git repository" "$(bash "$SCRIPT" "$TMP/plain" 2>&1)"
bash "$SCRIPT" "$TMP/plain" >/dev/null 2>&1
check "a non-repository exits 0" "0" "$?"

# --- the fetch, which is the one step that can block ---------------------------
#
# `git fetch -q origin 2>/dev/null || true` ran before everything above, on
# every review. Against a dead remote or a VPN it blocked for git's own connect
# timeout with `-q` and a discarded stderr hiding that anything was happening,
# and when it failed it said nothing — so a stale base, which is a documented
# source of phantom findings, looked exactly like a fresh one.

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
