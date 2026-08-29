#!/usr/bin/env bash
# Resolve the diff base for a review, and print the change set against it.
#
# This lived as a snippet inside SKILL.md until v0.9.2, and it was wrong there:
# the snippet tried `origin/HEAD` then fell back to the literal `main`, while the
# prose beside it described a five-step chain. In any master-default repository
# the snippet died with `fatal: ambiguous argument 'main'`. Prose and code cannot
# be kept in step by good intentions, so the code moved somewhere it can have a
# test — base.test.sh proves each rung of the chain, including the two that used
# to fail.
#
# It also costs the skill 207 tokens of dense shell inside a 5,000-token
# post-compaction re-attach budget, which is the second reason it is out here.
#
# Prints, in order: the ref it chose, the changed-line count, changed paths, and
# the diff. Exits 0 with a message and no diff when there is nothing to review.
set -uo pipefail

cd "${1:-.}" || { echo "review-base: cannot enter ${1:-.}" >&2; exit 1; }

if ! git rev-parse --git-dir >/dev/null 2>&1; then
  echo "review-base: not a git repository — review the named files and say so"
  exit 0
fi

# A stale base produces phantom findings: problems already fixed on the base
# branch look like problems in this diff. So the fetch is worth doing — but it
# is also the only step here that can block, for git's own connect timeout of
# 75 s or for as long as a VPN keeps the socket open, and `-q` with a discarded
# stderr hid that anything was happening at all. It ran first, on every review.
#
# Two halves to the fix. Bound it, so a dead remote costs seconds rather than
# minutes; and say which of the three things happened, because a fetch that did
# not run leaves a base that may be stale, and a silent skip is a stale base
# nobody knows about.
#
# The bound is a background fetch plus a polling wait rather than `timeout(1)`:
# that is GNU coreutils, and a default macOS install does not have it.
FETCH_TIMEOUT_SECONDS="${REVIEW_FETCH_TIMEOUT_SECONDS:-10}"
# A non-numeric override would make `-ge` error on every iteration and the loop
# never exit — the same hang, arrived at from the other side.
case "$FETCH_TIMEOUT_SECONDS" in
  '' | *[!0-9]*) FETCH_TIMEOUT_SECONDS=10 ;;
esac

fetch_origin() {
  git fetch -q origin >/dev/null 2>&1 &
  local pid=$!
  local waited=0
  while kill -0 "$pid" 2>/dev/null; do
    if [ "$waited" -ge "$FETCH_TIMEOUT_SECONDS" ]; then
      # TERM then KILL: git's transport child can sit in a blocking read, and a
      # TERM it does not act on would leave this waiting for what it just bounded.
      kill -TERM "$pid" 2>/dev/null
      sleep 1
      kill -KILL "$pid" 2>/dev/null
      wait "$pid" 2>/dev/null
      return 124 # what timeout(1) reports, for anyone reading a trace
    fi
    sleep 1
    waited=$((waited + 1))
  done
  wait "$pid"
}

STALE="the base may be stale, so anything already fixed on it can look like a finding here"

if ! git remote get-url origin >/dev/null 2>&1; then
  echo "review-base: no origin remote — comparing against local refs only"
else
  echo "review-base: fetching origin (up to ${FETCH_TIMEOUT_SECONDS}s)"
  fetch_origin
  FETCH_STATUS=$?
  if [ "$FETCH_STATUS" -eq 124 ]; then
    echo "review-base: fetch timed out after ${FETCH_TIMEOUT_SECONDS}s — $STALE"
  elif [ "$FETCH_STATUS" -ne 0 ]; then
    echo "review-base: fetch failed (exit $FETCH_STATUS) — $STALE"
  fi
fi

# First ref that resolves wins. The order is the review's own precedence:
# the branch's PR target, the repository default, then the conventional names
# with the remote prefix, then without it for a repository that has no remote.
BASE=""
for ref in \
  "$(gh pr view --json baseRefName -q .baseRefName 2>/dev/null || true)" \
  "$(git symbolic-ref -q --short refs/remotes/origin/HEAD 2>/dev/null || true)" \
  origin/main origin/master main master
do
  [ -n "$ref" ] || continue
  if git rev-parse -q --verify "${ref}^{commit}" >/dev/null 2>&1; then
    BASE="$ref"
    break
  fi
done

if [ -z "$BASE" ]; then
  echo "review-base: no base ref resolved — review the named files and say so"
  exit 0
fi

# The merge base, never the base tip: it excludes whatever landed on the base
# since this branch left it, which is not this change's blast radius.
if ! MERGE_BASE=$(git merge-base "$BASE" HEAD 2>/dev/null); then
  echo "review-base: $BASE and HEAD share no history — review the named files"
  exit 0
fi

echo "base: $BASE ($(git rev-parse --short "$MERGE_BASE"))"

# Untracked files are NOT in `git diff` at any base, so a brand-new file is
# invisible to a review that reads the diff alone — and review runs before the
# commit, which is exactly when new files exist. They are listed separately
# rather than staged: `git add -N` would make them appear in the diff, and a
# read-only review script must not write to the index.
UNTRACKED=$(git ls-files --others --exclude-standard)

if [ -z "$(git diff --name-only "$MERGE_BASE")" ] && [ -z "$UNTRACKED" ]; then
  echo "changed lines: 0 — nothing to review against $BASE"
  exit 0
fi

git diff --numstat "$MERGE_BASE" | awk '{n+=$1+$2} END{print "changed lines:", n+0}'
git diff --name-only "$MERGE_BASE"

if [ -n "$UNTRACKED" ]; then
  echo "untracked, absent from the diff below — read each one directly:"
  printf '%s\n' "$UNTRACKED" | sed 's/^/  /'
fi

git diff "$MERGE_BASE"
