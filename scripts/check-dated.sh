#!/usr/bin/env bash
# Assert every dated prompt file was re-dated the last time it changed.
#
# Five design files carry a calibration date and instruct the reader to treat
# their specifics as decayed after six months. That instruction is worthless if
# the date silently stops tracking the content, and the prose asking an editor
# to re-date by hand was itself an authoring rule sitting in a runtime file.
# This replaces it: git says when the file last changed, the file says when it
# was last calibrated, and a file edited after its own date fails.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if ! git rev-parse --git-dir >/dev/null 2>&1; then
  echo "  SKIPPED       not a git checkout, so no commit dates to compare"
  exit 0
fi

shopt -s nullglob
bad=0
checked=0
for file in skills/*/*.md agents/*.md output-styles/*.md; do
  stamp=$(grep -oE '\*\*(Dated|Calibrated) [0-9]{4}-[0-9]{2}-[0-9]{2}' "$file" | head -1 | grep -oE '[0-9]{4}-[0-9]{2}-[0-9]{2}' || true)
  [ -n "$stamp" ] || continue
  checked=$((checked + 1))
  committed=$(git log -1 --format=%cs -- "$file" 2>/dev/null || true)
  if [ -z "$committed" ]; then
    if [ -n "$(git status --porcelain -- "$file")" ]; then
      echo "  UNCOMMITTED   $file is dated $stamp and not yet committed"
    fi
    continue
  fi
  if [[ "$committed" > "$stamp" ]]; then
    echo "  STALE DATE    $file says $stamp and last changed $committed"
    echo "                  re-date the line, or the six-month decay notice is a lie"
    bad=$((bad + 1))
  fi
done

if [ "$bad" -gt 0 ]; then
  echo
  echo "A dated file that outlived its own date tells the reader to trust"
  echo "content nobody re-checked. Update the date with the edit."
  exit 1
fi
echo "$checked/$checked dated files were re-dated the last time they changed."
