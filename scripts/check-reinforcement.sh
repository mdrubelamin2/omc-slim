#!/usr/bin/env bash
# Assert that a pinned rule still carries its meaning, not only its words.
#
# COVERAGE.tsv proves a phrase is present. It cannot prove the phrase still says
# what it said. 51dfbcc records what that costs: a compression pass dropped the
# clause "on a crowded machine yours compete with dozens of near-synonyms: pick
# by what the work needs, not by what surfaces first", all 87 coverage rows still
# passed, and on the same fixture the simplify skill stopped firing, the nested
# ternary went untouched and the forwarding wrapper survived as an alias.
# Restoring the clause recovered all three. A green coverage run proves no rule
# was deleted. It does not prove the remaining rules still fire.
#
# So this file pins the reinforcement rather than the rule: an anchor phrase,
# plus the phrases that must sit in the SAME PARAGRAPH as that anchor. A rewrite
# that keeps the headline and drops its reasoning moves those phrases out of the
# anchor's paragraph, and that is what this detects. A whole-file search cannot:
# the words nearly always survive somewhere else in the document.
#
# Reads REINFORCEMENT.tsv. Exits non-zero if any rule has been gutted.
#
#   ./scripts/check-reinforcement.sh
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MANIFEST="$ROOT/REINFORCEMENT.tsv"

[ -f "$MANIFEST" ] || { echo "missing $MANIFEST"; exit 1; }

# "where" is a short name, not a path. Resolved exactly as check-coverage.sh
# resolves it, so both manifests name their targets the same way.
resolve() {
  case "$1" in
    output-styles) echo "$ROOT/output-styles/omc-slim.md" ;;
    */*)           [ -f "$ROOT/skills/$1" ] && echo "$ROOT/skills/$1" || echo "" ;;
    *)
      if   [ -f "$ROOT/skills/$1/SKILL.md" ]; then echo "$ROOT/skills/$1/SKILL.md"
      elif [ -f "$ROOT/agents/$1.md" ];       then echo "$ROOT/agents/$1.md"
      else echo ""; fi ;;
  esac
}

# Rows that survive shape and resolution are handed to one python3 pass, which
# owns the paragraph analysis. Splitting a document into paragraphs and testing
# containment per occurrence is not work for a shell loop.
rows="$(mktemp "${TMPDIR:-/tmp}/reinforcement.XXXXXX")" || exit 1
trap 'rm -f "$rows"' EXIT

bad=0

while IFS= read -r line || [ -n "$line" ]; do
  case "$line" in '#'*) continue ;; esac
  [ -z "${line//[[:space:]]/}" ] && continue

  # Deleting every non-tab character leaves one character per separator, so the
  # column count is exact. A row with a stray tab would otherwise fold part of
  # one field into the next and fail later as a phrase that can never match.
  tabs="${line//[!$'\t']/}"
  IFS=$'\t' read -r rule where anchor cooccur <<< "$line"

  if [ "${#tabs}" -ne 3 ]; then
    printf '  %-14s %-32s %s\n' 'BAD ROW' "$rule" \
      "expected 4 tab-separated columns, found $(( ${#tabs} + 1 ))"
    bad=$((bad + 1)); continue
  fi

  if [ -z "${rule// /}" ] || [ -z "${where// /}" ] || [ -z "${anchor// /}" ]; then
    printf '  %-14s %-32s %s\n' 'BAD ROW' "$rule" 'rule, where and anchor are all required'
    bad=$((bad + 1)); continue
  fi

  # An empty co-occurrence list asserts nothing, so the row would pass on the
  # anchor alone and pad the total — which is the exact bug COVERAGE.tsv rows
  # once had, and the reason check-coverage.sh grew its EMPTY PATTERN branch.
  # A manifest of reinforcement that reinforces nothing is worse than no row.
  if [ -z "${cooccur// /}" ]; then
    printf '  %-14s %-32s %s\n' 'NO COOCCUR' "$rule" 'must_cooccur is empty, so this row asserts nothing'
    bad=$((bad + 1)); continue
  fi

  target="$(resolve "$where")"
  if [ -z "$target" ]; then
    printf '  %-14s %-32s %s\n' 'MISSING FILE' "$rule" "$where"
    bad=$((bad + 1)); continue
  fi

  printf '%s\t%s\t%s\t%s\t%s\n' "$rule" "$where" "$anchor" "$cooccur" "$target" >> "$rows"
done < "$MANIFEST"

python3 - "$rows" "$bad" <<'PY'
import re, sys

rows_path, prior_failures = sys.argv[1], int(sys.argv[2])


def normalise(text):
    # The normalisation check-coverage.sh applies before its grep -qiF: newlines
    # to spaces, runs of spaces squeezed, case folded. A rule that wraps across
    # three lines has to read the same as one written on a single line.
    return re.sub(' +', ' ', text.replace('\n', ' ')).lower()


paragraphs = {}


def neighbourhoods(path):
    # The neighbourhood is the paragraph: the block between blank lines. Narrow
    # enough that a phrase inside it is still reasoning about the anchor, wide
    # enough to survive ordinary rewrapping and reordering within the block.
    if path not in paragraphs:
        with open(path) as handle:
            # Commented-out and fenced text is stripped BEFORE the paragraphs
            # are cut. Without this, a rule can be inverted in place while the
            # original sits three lines above inside an HTML comment — the
            # anchor and every co-occurrence phrase are still findable, so this
            # gate reports the rule intact while the shipped text says the
            # opposite. Demonstrated on the output style's safety floor: the
            # replacement read "simplify anything that is in the way, including
            # validation, error handling and accessibility scaffolding", and
            # this file printed "120/120 rules intact".
            #
            # Fences are NOT stripped: they carry output contracts and spec
            # templates that are the shipped rule. A pin moved into a fence
            # headed "Rejected ideas" is the residual, and it belongs to the
            # contradiction sweep — a substring test cannot read a heading.
            raw = handle.read()
            raw = re.sub(r'<!--.*?-->', '', raw, flags=re.S)
            paragraphs[path] = [normalise(p) for p in re.split(r'\n[ \t]*\n', raw)]
    return paragraphs[path]


bad = prior_failures
intact = 0
rows = 0

with open(rows_path) as handle:
    for line in handle:
        rule, where, anchor, cooccur, path = line.rstrip('\n').split('\t')
        rows += 1

        phrases = [p.strip() for p in cooccur.split('|')]
        if not all(phrases):
            print(f'  {"NO COOCCUR":<14} {rule:<32} must_cooccur has an empty phrase')
            bad += 1
            continue

        found = [p for p in neighbourhoods(path) if normalise(anchor) in p]
        if not found:
            print(f'  {"MISSING ANCHOR":<14} {rule:<32} no longer in {where}')
            print(f'  {"":<14}  anchor: {anchor}')
            bad += 1
            continue

        # Any occurrence may be the one carrying the rule, so the row passes on
        # the first that carries all of it. Report against the closest miss,
        # which is the occurrence a reader would have meant to edit.
        closest = None
        for paragraph in found:
            lost = [p for p in phrases if normalise(p) not in paragraph]
            if not lost:
                closest = []
                break
            if closest is None or len(lost) < len(closest):
                closest = lost

        if not closest:
            intact += 1
            continue

        print(f'  {"GUTTED":<14} {rule:<32} anchor kept in {where}, reinforcement lost')
        print(f'  {"":<14}  anchor: {anchor}')
        for phrase in closest:
            print(f'  {"":<14}  lost:   {phrase}')
        bad += 1

# Zero rows checked prints exactly like a clean run, so it is never called one.
if rows == 0 and bad == 0:
    print('  NO ROWS        REINFORCEMENT.tsv holds no rows — this proves nothing.')
    bad += 1

print()
if bad:
    print(f'{bad} rule(s) no longer carry their reinforcement, {intact} intact.')
    print('Restore the clause, or drop the row from REINFORCEMENT.tsv with a reason in')
    print('the commit message. A rule whose reasoning is compressed out still passes')
    print('COVERAGE.tsv and stops firing anyway — that is 51dfbcc.')
    raise SystemExit(1)

print(f'{intact}/{intact} rules intact.')
print('Every pinned anchor still sits in a paragraph that carries its rule.')
PY
exit $?
