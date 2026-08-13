#!/usr/bin/env bash
# Assert the plugin still carries every behaviour adopted from a deleted source.
#
# The whole point of v0.3.0 was to make ~/.claude/CLAUDE.md and the fable-mode
# skill unnecessary. Once those are deleted there is no original left to compare
# against, so nothing would catch a rule being dropped by a later edit. This is
# that catch.
#
# Reads COVERAGE.tsv. Exits non-zero if any adopted behaviour has gone missing.
#
#   ./scripts/check-coverage.sh            # all
#   ./scripts/check-coverage.sh fable-mode # one origin
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MANIFEST="$ROOT/COVERAGE.tsv"
FILTER="${1:-}"

[ -f "$MANIFEST" ] || { echo "missing $MANIFEST"; exit 1; }

# "where" is a short name, not a path — resolve it to the file that owns it.
resolve() {
  case "$1" in
    output-styles) echo "$ROOT/output-styles/omc-slim.md" ;;
    *)
      if   [ -f "$ROOT/skills/$1/SKILL.md" ]; then echo "$ROOT/skills/$1/SKILL.md"
      elif [ -f "$ROOT/agents/$1.md" ];       then echo "$ROOT/agents/$1.md"
      else echo ""; fi ;;
  esac
}

missing=0
checked=0

while IFS=$'\t' read -r origin rule where pattern; do
  case "$origin" in ''|'#'*) continue ;; esac
  [ -n "$FILTER" ] && [[ "$origin" != *"$FILTER"* ]] && continue

  target="$(resolve "$where")"
  if [ -z "$target" ]; then
    printf '  MISSING FILE  %-32s %s\n' "$rule" "$where"
    missing=$((missing + 1)); continue
  fi

  # Collapse all whitespace to single spaces so line-wrapped prose still
  # matches. Without this, a rule that happens to wrap across two lines reads
  # as absent — which cost a false alarm the first time this was run by hand.
  if tr '\n' ' ' < "$target" | tr -s ' ' | grep -qiF -- "$pattern"; then
    checked=$((checked + 1))
  else
    printf '  DROPPED       %-32s expected in %s\n' "$rule" "$where"
    printf '                  pattern: %s\n' "$pattern"
    missing=$((missing + 1))
  fi
done < "$MANIFEST"

echo
if [ "$missing" -eq 0 ]; then
  echo "$checked/$checked adopted behaviours present."
  echo "Safe to delete the adopted sources; the plugin covers them."
  exit 0
fi

echo "$missing adopted behaviour(s) missing, $checked present."
echo "Either restore them, or delete the row from COVERAGE.tsv with a reason in"
echo "the commit message. Silently losing an adopted rule is the failure this"
echo "check exists to prevent."
exit 1
