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
    # "skill/file.md" — a skill's reference file, read on demand rather than
    # loaded with SKILL.md. Pinnable like anything else; a rule that lives in a
    # reference file is no less droppable by a later edit.
    */*)           [ -f "$ROOT/skills/$1" ] && echo "$ROOT/skills/$1" || echo "" ;;
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

# --- roster drift ---------------------------------------------------------
# The output style names every agent and skill explicitly, because those
# descriptions get dropped on machines with many plugins installed. Either
# roster can silently drift from what actually ships: a renamed agent leaves the
# orchestrator dispatching a name that no longer exists, and a new one stays
# invisible — which is the whole failure the roster was added to prevent.
python3 - "$ROOT" <<'PY' || exit 1
import re, glob, os, sys
root = sys.argv[1]
style = open(os.path.join(root, 'output-styles/omc-slim.md')).read()

def expand(m):
    # "councillor-alpha / -beta / -gamma" -> the three full names, so the
    # shorthand the prose uses still matches the files on disk.
    parts = [p.strip() for p in m.group(0).split('/')]
    prefix = parts[0].split('-')[0]
    return ' '.join([parts[0]] + [f'{prefix}-{p.lstrip("-")}' for p in parts[1:]])

def section(start, end):
    a = style.index(start)
    b = style.index(end, a)
    return re.sub(r'[a-z]+-[a-z]+(?:\s*/\s*-[a-z]+)+', expand, style[a:b])

rosters = {
    'agent': (section('**Agents**', '**Skills:**'),
              {os.path.basename(f)[:-3] for f in glob.glob(os.path.join(root, 'agents/*.md'))}),
    'skill': (section('**Skills:**', 'roster is a floor'),
              {os.path.basename(os.path.dirname(f))
               for f in glob.glob(os.path.join(root, 'skills/*/SKILL.md'))}),
}

bad = 0
for kind, (text, actual) in rosters.items():
    # Present = named as a whole word. Ghost = a bolded single-word name in the
    # roster that no longer has a file behind it.
    absent = [n for n in sorted(actual) if not re.search(rf'\b{re.escape(n)}\b', text)]
    ghosts = sorted(set(re.findall(r'\*\*([a-z][a-z-]+)\*\*', text)) - actual)
    for m in absent:
        print(f'  UNLISTED      {m} exists but the orchestrator {kind} roster omits it'); bad += 1
    for g in ghosts:
        print(f'  GHOST         {kind} roster names {g}, which is not a {kind}'); bad += 1
    if not absent and not ghosts:
        print(f'{len(actual)}/{len(actual)} {kind}s present in the orchestrator roster.')
if bad:
    print('\nFix output-styles/omc-slim.md, then re-run.')
    raise SystemExit(1)
PY

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
