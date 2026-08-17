#!/usr/bin/env bash
# Assert the plugin still carries every behaviour adopted from a deleted source,
# and still quotes its own published figures accurately.
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

# --- published figures ----------------------------------------------------
# Three sites across two documents quote the static-context total by hand, and by
# v0.8.1 the README carried two different ones for the same plugin — see
# CHANGELOG.md, v0.8.2, "Static context measured, not estimated". A line number
# would have rotted here: this block's first citation pointed at a line that the
# next release pushed thirty lines down.
# measure-context.sh is the one source; these are its readers.
#
# Reader sites are enrolled by hand, not found by pattern, so the dated figures
# in CHANGELOG.md and RESEARCH.md can never fire. The cost of that is a new site
# added later without enrolling it here, which is the cheaper failure.
python3 - "$ROOT" <<'PY' || exit 1
import os, re, subprocess, sys
root = sys.argv[1]

try:
    terse = subprocess.run([os.path.join(root, 'scripts/measure-context.sh'), '--terse'],
                           capture_output=True, text=True)
except OSError as exc:
    print('  UNMEASURED    scripts/measure-context.sh could not be run')
    print(f'                  {exc}')
    raise SystemExit(1)
measured = terse.stdout.strip()
if terse.returncode != 0 or not measured.isdigit():
    print('  UNMEASURED    scripts/measure-context.sh --terse printed no integer')
    print(f'                  exit {terse.returncode}, stdout {measured!r}')
    if terse.stderr.strip():
        print(f'                  stderr {terse.stderr.strip()!r}')
    raise SystemExit(1)

total = f'{int(measured):,}'
sites = [
    ('README.md',           f'~{total} tokens of static context'),
    ('docs/LIMITATIONS.md', f'**~{total} tok**'),
    # Left-anchored on "against": a bare "{total} today" is a suffix of the very
    # figure it guards, so a total that lost its leading digits would still match.
    ('docs/LIMITATIONS.md', f'against {total} today'),
]

bad = 0
for path, literal in sites:
    # Same whitespace normalisation as the COVERAGE.tsv loop above, so a figure
    # that wraps onto the next line still matches. Case-sensitive here, where
    # that loop folds case — these are our own figures, and stricter can only
    # raise a false alarm, never let a stale one through.
    text = re.sub(' +', ' ', open(os.path.join(root, path)).read().replace('\n', ' '))
    if literal in text:
        continue
    print(f'  STALE FIGURE  {path} does not quote the measured {total} tokens')
    print(f'                  expected: {literal}')
    bad += 1
if bad:
    print('\nUpdate those sites to match ./scripts/measure-context.sh, then re-run.')
    raise SystemExit(1)
print(f'{len(sites)}/{len(sites)} published figures quote the measured {total} tokens.')
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
