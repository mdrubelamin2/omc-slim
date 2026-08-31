#!/usr/bin/env bash
# Resolve the diff base for a review, and print the change set against it.
#
#   base.sh [DIR] [--out FILE]
#
# Prints, in order: the ref it chose, the changed-line count, changed paths, and
# the diff. Exits 0 with a message and no diff when there is nothing to review.
#
# With --out, the diff goes to FILE instead of stdout, with the commit list and
# the --stat ahead of it and ten lines of context (-U10). A caller dispatching
# review lanes hands each one the path, so the diff never passes through the
# caller's own context and every lane reads the same bytes. Untracked files go
# into FILE too, as new-file diffs, because lanes read FILE and nothing else.
#
# Exits 1, saying which on stderr, when DIR cannot be entered, when --out has no
# value, or when FILE cannot be written. Everything else that ends a review early
# (no repository, no base ref, nothing changed) is said on stdout with exit 0.
set -uo pipefail

DIR=.
OUT=""
while [ $# -gt 0 ]; do
  case "$1" in
    --out)
      [ $# -ge 2 ] || { echo "review-base: --out needs a file path" >&2; exit 1; }
      OUT="$2"; shift 2 ;;
    *) DIR="$1"; shift ;;
  esac
done
# Resolved before the cd, so a relative FILE lands where the caller stands
# rather than inside DIR.
case "$OUT" in
  '' | /*) ;;
  *) OUT="$PWD/$OUT" ;;
esac

cd "$DIR" || { echo "review-base: cannot enter $DIR" >&2; exit 1; }

if ! git rev-parse --git-dir >/dev/null 2>&1; then
  echo "review-base: not a git repository — review the named files and say so"
  exit 0
fi

# A stale base produces phantom findings: problems already fixed on the base
# branch look like problems in this diff. So the fetch is worth doing. It is
# also the only step here that can block, for git's own connect timeout of 75 s
# or for as long as a VPN keeps the socket open.
#
# So it is bounded, and a dead remote costs seconds rather than minutes. And it
# says which of the three things happened: a fetch that did not run leaves a
# base that may be stale, and a silent skip is a stale base nobody knows about.
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
      # Reap before claiming a timeout. The fetch can finish between the
      # `kill -0` above and this branch, and calling that a timeout reports a
      # fresh base as a stale one, which sends the reviewer looking for phantom
      # findings. If it did land, report what it actually returned.
      local late=0
      wait "$pid" 2>/dev/null || late=$?
      [ "$late" -eq 0 ] && return 0
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
# commit, which is exactly when new files exist. They are listed separately, and
# under --out diffed against /dev/null, rather than staged: `git add -N` would
# make them appear in the diff, and a read-only review script must not write to
# the index.
# quotePath off everywhere a path is printed: a C-quoted name (non-ASCII, a
# quote, a tab) is not a path a lane can open, in a header or in a list.
git() { command git -c core.quotePath=false "$@"; }
UNTRACKED=$(git ls-files --others --exclude-standard)

if [ -z "$(git diff --name-only "$MERGE_BASE")" ] && [ -z "$UNTRACKED" ]; then
  echo "changed lines: 0 — nothing to review against $BASE"
  exit 0
fi

git diff --numstat "$MERGE_BASE" | awk '{n+=$1+$2} END{print "changed lines:", n+0}'
git diff --name-only "$MERGE_BASE"

if [ -n "$UNTRACKED" ]; then
  if [ -n "$OUT" ]; then
    echo "untracked, included in FILE as new-file diffs:"
  else
    echo "untracked, absent from the diff below — read each one directly:"
  fi
  printf '%s\n' "$UNTRACKED" | sed 's/^/  /'
fi

if [ -z "$OUT" ]; then
  git diff "$MERGE_BASE"
  exit 0
fi

# A function rather than a brace group: in bash, `if ! { ...; } > FILE` does not
# see a failed redirection. The group reports status 1 and the `!` branch still
# takes the success path, so an unwritable FILE gets announced as written.
write_change_set() {
  echo "commits:"
  git log --oneline "$MERGE_BASE"..HEAD
  echo
  echo "stat:"
  git diff --stat "$MERGE_BASE"
  echo
  git diff -U10 "$MERGE_BASE"
  local rc=$?
  # `--no-index` exits 1 whenever the two sides differ, which against /dev/null
  # is always. Left as the function's status it would read as a failed write.
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    git diff --no-index -U10 -- /dev/null "$f" || :
  done <<< "$UNTRACKED"
  # The tracked diff's status is the function's status, not the loop's.
  return "$rc"
}

if ! write_change_set > "$OUT"; then
  echo "review-base: cannot write $OUT" >&2
  exit 1
fi
echo "diff written to: $OUT"
