#!/usr/bin/env bash
# Lint every shell script in the repo, and fail on anything at warning or above.
#
# The bar is `--severity=warning`, which is where real defects live: unquoted
# expansions that word-split, unreachable code, misused test operators. The
# `info` and `style` tiers below it are opinion, and this repo does not gate on
# opinion — running at `style` today reports 11 findings and zero bugs.
#
# Files are found by shebang as well as by extension. A hook or helper written
# without a `.sh` suffix is exactly the file most likely to go unlinted, and a
# linter that silently skips it is worse than no linter.
#
#   ./scripts/check-shell.sh
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT" || exit 1

# Collect shell files: *.sh, or any file whose first line names a shell.
#
# Git is the preferred lister because it honours .gitignore and still includes
# untracked files, so a new script is linted before it is committed. But git is
# not always there: a release tarball or a vendored copy has no metadata, and
# `git ls-files` then returns nothing. Reading that as "zero files" made this
# exit 1 for everyone not working from a clone — the same regression that once
# made check-upstream.sh permanently red. So fall back to walking the tree.
list_candidates() {
  if git rev-parse --git-dir >/dev/null 2>&1; then
    git ls-files --cached --others --exclude-standard
  else
    find . -type f -not -path './.git/*' | sed 's|^\./||'
  fi
}

files=()
while IFS= read -r f; do
  [ -f "$f" ] || continue
  case "$f" in
    *.sh) files+=("$f"); continue ;;
  esac
  IFS= read -r first < "$f" 2>/dev/null || continue
  case "$first" in
    '#!'*[/\ ]bash*|'#!'*[/\ ]sh*|'#!'*[/\ ]dash*|'#!'*[/\ ]ksh*) files+=("$f") ;;
  esac
done < <(list_candidates 2>/dev/null)

# A check that ran over nothing prints the same as a check that passed, so the
# count is always stated and zero is never called a pass.
if [ "${#files[@]}" -eq 0 ]; then
  echo "0 shell files found — nothing was linted, so this proves nothing."
  echo "Expected at least scripts/*.sh; is this being run outside the repo?"
  exit 1
fi

if ! command -v shellcheck >/dev/null 2>&1; then
  echo "shellcheck is not installed — 0 of ${#files[@]} shell files linted."
  echo "This is not a pass. Install it (brew install shellcheck) and re-run."
  echo "Exiting 0 so a missing optional tool does not block anyone, but no"
  echo "claim is made about these files."
  exit 0
fi

if shellcheck --severity=warning --external-sources "${files[@]}"; then
  echo "${#files[@]}/${#files[@]} shell files clean at severity=warning."
  echo "shellcheck $(shellcheck --version | awk '/version:/{print $2}')"
  exit 0
fi

echo
echo "shellcheck found problems at warning severity in the files above."
exit 1
