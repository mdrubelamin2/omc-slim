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
