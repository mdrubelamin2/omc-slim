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
    # Any *.md path. Three forms, tried in this order:
    #   "skill/file.md"     a skill's reference file, read on demand rather than
    #                       loaded with SKILL.md — a rule living in a reference
    #                       file is no less droppable by a later edit;
    #   "docs/THING.md"     a repo-relative path;
    #   "README.md"         likewise, at the root.
    # The last two are new. A residue sweep on 2026-08-29 found seven live
    # behaviours pinned by nothing, three of them documented rather than
    # prompted — the compaction-eviction measurement, the two environment
    # settings the README recommends, and the keep/cut audit. A behaviour is no
    # less real for living in a document, and nothing else would notice it going.
    *.md)
      if   [ -f "$ROOT/skills/$1" ]; then echo "$ROOT/skills/$1"
      elif [ -f "$ROOT/$1" ];        then echo "$ROOT/$1"
      else echo ""; fi ;;
    *)
      if   [ -f "$ROOT/skills/$1/SKILL.md" ]; then echo "$ROOT/skills/$1/SKILL.md"
      elif [ -f "$ROOT/agents/$1.md" ];       then echo "$ROOT/agents/$1.md"
      else echo ""; fi ;;
  esac
}


# One place that decides what counts as shipped text. A comment and a fenced
# block both reach the model, but neither is the rule — a rule quoted inside
# either is a mention, and a mention must not stand in for the thing.#
# Fenced blocks are deliberately NOT stripped. They carry output contracts and
# spec templates that ARE the shipped rule — `deep-interview`'s spec schema pins
# `## Files and interfaces`, which lives inside a fenced template, and stripping
# fences reported that rule missing. The residual risk is a pin relocated into a
# fence headed "Rejected ideas", which is real and is the contradiction sweep's
# job rather than this one's: a substring test cannot read a heading.
strip_inert() {
  python3 -c '
import re, sys
raw = open(sys.argv[1], encoding="utf-8", errors="replace").read()
raw = re.sub(r"<!--.*?-->", "", raw, flags=re.S)
sys.stdout.write(re.sub(" +", " ", raw.replace("\n", " ")))
' "$1"
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

  # An empty pattern matches every file, so a row asserting nothing would count
  # as a covered behaviour and pad the total. A row with a missing or blank
  # fourth column is a broken row, not a passing one.
  if [ -z "${pattern// /}" ]; then
    printf '  EMPTY PATTERN %-32s asserts nothing (row has no pattern column)\n' "$rule"
    missing=$((missing + 1)); continue
  fi

  # Collapse all whitespace to single spaces so line-wrapped prose still
  # matches. Without this, a rule that happens to wrap across two lines reads
  # as absent — which cost a false alarm the first time this was run by hand.
  #
  # Commented-out text is removed first, and that is not tidiness. (Fences are
  # NOT removed — see the note on strip_inert above, which is the true one. This
  # comment said "and fenced" until 2026-08-29 and was wrong, which mattered
  # because it is the comment a reader consults when deciding whether the cap
  # gate can be bypassed by hiding a pin in a fence.) A
  # rule can be inverted in place with the original left three lines above inside
  # an HTML comment: the pattern is still findable, so this loop reports the rule
  # present while the shipped text says the opposite. Demonstrated against the
  # output style's safety floor. A pin relocated into a fenced block headed
  # "Rejected ideas" was the same trick with a different lid.
  if strip_inert "$target" | grep -qiF -- "$pattern"; then
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

def section(start, end):
    # Anchors must stay unique and in this order. A missing one used to raise
    # ValueError and print a traceback — a gate that crashes tells the reader
    # nothing about what it was guarding, and reads like a broken script rather
    # than a failed check. Name the anchor instead.
    a = style.find(start)
    if a == -1:
        print(f'  LOST ANCHOR   output-styles/omc-slim.md no longer contains {start!r}')
        print('                  the roster gate cannot find the block it checks')
        raise SystemExit(1)
    b = style.find(end, a)
    if b == -1:
        print(f'  LOST ANCHOR   output-styles/omc-slim.md has {start!r} but no {end!r} after it')
        raise SystemExit(1)
    return style[a:b]

# Anchored on the bare bold labels, not on the punctuation that followed them.
# `**Skills:**` was the anchor until the dispatch rule ("agents go through the
# Agent tool, skills through the Skill tool") turned the heading into
# `**Skills** — invoked with the **Skill** tool:`, and the gate crashed rather
# than reporting anything. The label is the stable part; what trails it is prose.
rosters = {
    'agent': (section('**Agents**', '**Skills**'),
              {os.path.basename(f)[:-3] for f in glob.glob(os.path.join(root, 'agents/*.md'))}),
    'skill': (section('**Skills**', 'roster is a floor'),
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
# Four sites across two documents quote the static-context total by hand, and by
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
import glob, json, os, re, subprocess, sys
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

# The corrected figure is MEASURED, not derived from a constant.
#
# It used to be chars/4 ÷ 1.135, a whole-estate average taken once in the
# 2026-08-25 audit. A single average does not hold per file, and the cost of
# believing it was concrete: applied to skills/review/SKILL.md it reported 4,956
# tokens against a 5,000 cap — 44 under — while the real count was 5,298, nearly
# 300 OVER. The gate that existed to guard the cap was the thing hiding the
# breach.
#
# No tokeniser, no corrected figure. This block exits 1 rather than printing a
# number it cannot stand behind, the same way check-evals.sh refuses without
# PyYAML. Both figures are published, so both are pinned — a README that quotes
# one basis without the other is the ambiguity that made `claude plugin details`
# look like it contradicted us.
real = subprocess.run([os.path.join(root, 'scripts/measure-context.sh'), '--terse-real'],
                      capture_output=True, text=True)
real_measured = real.stdout.strip()
if real.returncode != 0 or not real_measured.isdigit():
    print('  UNMEASURED    no tokeniser, so the corrected figure cannot be derived')
    print('                  pip install tiktoken')
    print('                  the alternative is a published number resting on a')
    print('                  constant, which is exactly how the last one went wrong')
    raise SystemExit(1)
corrected = f'{int(real_measured):,}'

# The static total is not the only published figure, and it is not the one that
# rots. The on-invoke figures were re-derived by hand three times in one release
# and were wrong twice, because nothing checked them. Derive them here from the
# same script and pin them too.
full = subprocess.run([os.path.join(root, 'scripts/measure-context.sh')],
                      capture_output=True, text=True).stdout
ceil_m = re.search(r'if every one fires\s+(\d+)\s+(\d+)', full)
if not ceil_m:
    print('  UNMEASURED    measure-context.sh printed no on-invoke ceiling')
    raise SystemExit(1)
ceil_chars = int(ceil_m.group(1))
ceiling = f'{ceil_chars // 4:,}'

import tiktoken
enc = tiktoken.get_encoding('cl100k_base')

def real_of(path):
    return len(enc.encode(open(path, encoding='utf-8').read()))

# The ceiling's correction is MEASURED over the on-invoke set, not scaled from
# the static one.
#
# It used to be `ceil_chars / 4 * real_static / est_static`, justified as keeping
# both published numbers on one basis rather than two constants. One basis, wrong
# set. The static surface is twelve descriptions and the style body; the
# on-invoke surface is twelve full prompt bodies, and they do not tokenise alike.
# The scaled figure read 34,147 against a real 35,144 — understated by 997
# tokens, in the direction that makes a budget look safe. That is the same defect
# as the 1.135 constant one section up, committed again while quoting the fix.
ceil_real = subprocess.run([os.path.join(root, 'scripts/measure-context.sh'), '--terse-invoke-real'],
                           capture_output=True, text=True).stdout.strip()
if not ceil_real.isdigit():
    print('  UNMEASURED    measure-context.sh printed no on-invoke real ceiling')
    raise SystemExit(1)
ceiling_corr = f'{int(ceil_real):,}'

# Every skill is measured WHOLE, frontmatter included, because that is what the
# harness re-attaches after compaction. Measuring the body alone flattered review
# by 124 tokens and turned a 28-token overrun into an 81-token margin.
#
# And the cap is checked against what actually has to survive, not against a round
# number: after compaction the first 5,000 tokens of a skill come back and the
# rest does not, so a PINNED rule past that point is a rule that stops firing with
# nothing to say it did. That is 51dfbcc's failure mode reached by position rather
# than by deletion, and no presence check can see it.
RE_CAP = 5000
# The per-skill cap is not the binding one. Re-attached skills share a COMBINED
# 25,000-token budget, filled from the most recently invoked, so past it older
# skills are dropped ENTIRELY rather than truncated — and the budget is shared
# with every other plugin's skills, so a crowded machine evicts ours whole. This
# release built a gate for the cap it calls non-binding and none for the one it
# calls binding; that asymmetry is the gap this closes.
SHARED_CAP = 25000
skill_tokens = {}
pin_rows = []
for tsv, wcol, pcol in (('COVERAGE.tsv', 2, 3), ('REINFORCEMENT.tsv', 1, 2)):
    for line in open(os.path.join(root, tsv), encoding='utf-8'):
        if line.startswith('#') or not line.strip():
            continue
        cols = line.rstrip('\n').split('\t')
        if len(cols) > max(wcol, pcol):
            pin_rows.append((cols[wcol], cols[pcol]))

bad_cap = 0
review_c4 = review_corr = None
for skill in sorted(glob.glob(os.path.join(root, 'skills/*/SKILL.md'))):
    name = os.path.basename(os.path.dirname(skill))
    text = open(skill, encoding='utf-8').read()
    tokens = real_of(skill)
    if name == 'review':
        review_c4 = f'{os.path.getsize(skill) // 4:,}'
        review_corr = f'{tokens:,}'
    # POSITION IS MEASURED ON THE RAW FILE, and that is the whole correctness of
    # this block. The harness re-attaches the raw file, comments included, so a
    # position computed on a stripped copy describes a document that is never
    # loaded. An earlier version stripped comments here while `real_of` counted
    # raw, and the two halves disagreed by construction: a 230-token comment
    # after the frontmatter put deepwork's last pinned rule at token 5,099 while
    # this block printed "no pinned rule is in that tail (worst sits at ~4,887)"
    # — false by 99 tokens, in the sentence the block exists to make true.
    #
    # And the LAST occurrence, not the first. `find` returning the earliest match
    # let a fenced block quoting a file's own pins report every rule at ~797
    # while all of them sat past the cap. A rule quoted early and stated late is
    # in the tail; a rule genuinely stated twice reports the later one, which
    # over-states position and is the safe direction for a cap.
    hay = re.sub(' +', ' ', text.replace('\n', ' ')).lower()
    worst = 0
    worst_pat = None
    for where, pat in pin_rows:
        if where != name:
            continue
        needle = re.sub(' +', ' ', pat.replace('\n', ' ')).lower()
        at = hay.rfind(needle)
        if at == -1:
            continue  # the presence loops above already own a missing pattern
        # hay is whitespace-normalised, so map back by ratio. The ratio does NOT
        # only over-state: collapsed whitespace lying BEFORE the match lands the
        # estimate early, which is the unsafe direction. The bound is
        # len(text)-len(hay), so take the whole slack as a margin rather than
        # trusting an average that grows with every indented block added ahead of
        # a pinned rule.
        slack = len(text) - len(hay)
        approx = min(len(text), int(at * len(text) / max(len(hay), 1)) + slack)
        pos = len(enc.encode(text[:approx]))
        if pos > worst:
            worst, worst_pat = pos, pat
    if worst > RE_CAP:
        print(f'  PAST THE CAP  skills/{name}/SKILL.md carries a pinned rule at token '
              f'~{worst:,}, past the {RE_CAP:,} that re-attach after a compaction')
        print(f'                  rule: {worst_pat[:60]!r}')
        print('                  move it earlier, or cut ahead of it — it stops firing')
        bad_cap = 1
    elif tokens > RE_CAP:
        # Reported, not failed, and that is a decision rather than an oversight:
        # what has to survive a compaction is the PINNED rules, and none is in
        # this tail. It stays visible because unpinned prose can otherwise fall
        # off the end release after release with nothing saying so.
        print(f'  TAIL DROPPED  skills/{name}/SKILL.md is {tokens:,} real tokens; the '
              f'{tokens - RE_CAP:,} past {RE_CAP:,} do not survive a compaction')
        print(f'                  no pinned rule is in that tail (worst sits at ~{worst:,})')
    skill_tokens[name] = min(tokens, RE_CAP)

shared = sum(skill_tokens.values())
if shared > SHARED_CAP:
    print(f'  SHARED BUDGET the {len(skill_tokens)} skills re-attach {shared:,} tokens '
          f'against a shared {SHARED_CAP:,}')
    print('                  past it, whole skills are dropped rather than truncated')
    bad_cap = 1

# README says how many `check-*.sh` scripts CI runs. It said "four" while the
# workflow ran seven — a claim that undersells the thing it describes, which is
# the direction nobody proofreads for. Derived from the workflow, not counted by
# hand, because hand-counting is how it got to four.
import yaml as _yaml
_wf = _yaml.safe_load(open(os.path.join(root, '.github/workflows/gates.yml')))
_runs = '\n'.join(s.get('run', '') or '' for s in _wf['jobs']['gates']['steps'])
_n = len(set(re.findall(r'check-[a-z-]+\.sh', _runs)))
_words = {4: 'four', 5: 'five', 6: 'six', 7: 'seven', 8: 'eight', 9: 'nine', 10: 'ten'}

sites = [
    ('README.md', f'all {_words.get(_n, _n)} `check-*.sh` scripts'),
    ('docs/LIMITATIONS.md', f'**{ceiling} chars/4, ~{ceiling_corr} corrected**'),
    ('docs/LIMITATIONS.md', f'is {review_c4} tokens on the chars/4 basis, ~{review_corr} corrected'),
    # CHANGELOG is deliberately NOT enrolled. It is version-scoped history, and
    # pinning a current figure into it forces rewriting what an earlier release
    # actually shipped — which this repository did once, publishing v0.9.1's
    # numbers inside the v0.9.0 entry.

    # RELEASE-READINESS is the document a maintainer reads to decide whether to
    # ship, and its version line said v0.9.4 while plugin.json said 0.9.6. It was
    # the only headline document nothing watched.
    ('docs/RELEASE-READINESS.md',
     'The version stands at **v' + json.load(
         open(os.path.join(root, '.claude-plugin/plugin.json')))['version'] + '**'),
    ('README.md',           f'~{corrected} tokens'),
    ('README.md',           f'**{total} on a chars/4 basis**'),
    ('docs/LIMITATIONS.md', f'**~{total} tok**'),
    # Left-anchored on "against": a bare "{total} today" is a suffix of the very
    # figure it guards, so a total that lost its leading digits would still match.
    ('docs/LIMITATIONS.md', f'against {total} today'),

    # The three sites below went stale in this release and no gate said so. The
    # seven pins above were the seven someone thought to enrol; every OTHER
    # present-tense use of the same number was unwatched, so a static figure
    # moved and six sentences kept quoting 4,309 as current. Same asymmetry the
    # mechanism gate closed for components: a list of things that must be right
    # is not a check that everything right is on the list.
    #
    # ASSESSMENT argues the adoption case FROM the figure, so a stale one makes
    # the argument about a plugin that no longer exists.
    ('docs/ASSESSMENT-2026-08-29.md', f'A {corrected}-token plugin'),
    ('docs/ASSESSMENT-2026-08-29.md', f'It is {corrected} tokens'),
    ('docs/LIMITATIONS.md',           f'the ~{corrected} this repository publishes'),
    ('docs/ASSESSMENT-2026-08-29.md', f'on-invoke bodies up to {ceiling_corr}'),
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
    print(f'  STALE FIGURE  {path} does not carry the measured figure')
    print(f'                  expected: {literal}')
    bad += 1
if bad or bad_cap:
    print('\nUpdate those sites to match ./scripts/measure-context.sh, then re-run.')
    raise SystemExit(1)
print(f'{len(sites)}/{len(sites)} published figures quote a measured basis '
      f'({total} chars/4, {corrected} corrected).')
PY

# --- internal references --------------------------------------------------
# Two things nothing else catches.
#
# A `${CLAUDE_PLUGIN_ROOT}` path is resolved by the runtime, not by this repo, so
# renaming the file behind one breaks the hook or the skill at install time
# rather than at edit time — with no error here.
#
# Two documents state the roster in words, and the roster block above checks
# every name but never the count. Note what this does and does not catch: adding
# an eleventh agent trips `UNLISTED` first, and this block never runs. The live
# path is a change that leaves all three earlier blocks green — a hook added to
# hooks.json, or a roster updated everywhere except the prose.
#
# Scoped to plugin-internal paths deliberately. A general markdown link check was
# written first and rejected: skills/codemap/SKILL.md:168-170 shows sample output
# containing `src/payments/codemap.md`, illustrating what codemap writes in the
# user's repo. A link checker calls those three broken on day one, and a check
# that is born red is a check nobody reads.
python3 - "$ROOT" <<'PY' || exit 1
import glob, json, os, re, subprocess, sys
root = sys.argv[1]
bad = 0

refs = {}
for f in (glob.glob(os.path.join(root, 'agents/*.md'))
          + glob.glob(os.path.join(root, 'skills/**/*.md'), recursive=True)
          + glob.glob(os.path.join(root, 'output-styles/*.md'))
          + glob.glob(os.path.join(root, 'hooks/*.json'))):
    for hit in re.findall(r'\$\{?CLAUDE_PLUGIN_ROOT\}?(/[A-Za-z0-9_./-]+)', open(f).read()):
        refs.setdefault(hit.lstrip('/'), set()).add(os.path.relpath(f, root))
for path, sources in sorted(refs.items()):
    if not os.path.exists(os.path.join(root, path)):
        print(f'  DANGLING PATH {path}')
        print(f'                  named by {", ".join(sorted(sources))}')
        bad += 1
# `refs` is glob-derived, so a broken glob empties it and "0/0 resolve" reads
# exactly like a pass. The plugin forbids that in verification-planning; it would
# be a poor look to ship it here.
if not refs:
    print('  NO REFERENCES found to check — the globs above matched nothing')
    bad += 1
elif not bad:
    print(f'{len(refs)}/{len(refs)} plugin-internal paths resolve.')

WORDS = {1: 'one', 2: 'two', 3: 'three', 4: 'four', 5: 'five', 6: 'six',
         7: 'seven', 8: 'eight', 9: 'nine', 10: 'ten', 11: 'eleven',
         12: 'twelve', 13: 'thirteen', 14: 'fourteen', 15: 'fifteen',
         16: 'sixteen', 17: 'seventeen', 18: 'eighteen', 19: 'nineteen',
         20: 'twenty', 21: 'twenty-one', 22: 'twenty-two',
         23: 'twenty-three', 24: 'twenty-four', 25: 'twenty-five',
         26: 'twenty-six', 27: 'twenty-seven', 28: 'twenty-eight',
         29: 'twenty-nine', 30: 'thirty'}
agents = len(glob.glob(os.path.join(root, 'agents/*.md')))
skills = len(glob.glob(os.path.join(root, 'skills/*/SKILL.md')))
hooks_cfg = json.load(open(os.path.join(root, 'hooks/hooks.json')))
hooks = sum(len(g.get('hooks', [])) for ev in hooks_cfg['hooks'].values() for g in ev)

# Above the table the phrase would be spelled in digits, so it stops matching and
# says so — louder than a KeyError and in the right place.
def word(n):
    return WORDS.get(n, str(n))

hookword = 'hook' if hooks == 1 else 'hooks'
roster_sites = [
    ('README.md',
     f'{word(agents)} agents, {word(skills)} skills, {word(hooks)} {hookword}'),
    # plugin.json's description is a second worded roster, and it has been wrong
    # before: 4c5ee9b records it claiming two hooks while one existed. It is also
    # the copy a marketplace shows, so it is the one strangers read first.
    ('.claude-plugin/plugin.json',
     f'{word(agents)} specialists, {word(skills)} skills, {word(hooks)} advisory {hookword}'),
    # PROVENANCE.md pastes this checker's own output as a sample. That block has
    # now gone stale TWICE — CHANGELOG.md records correcting two stale row counts
    # in it one release ago, and every line of it was wrong again by the next.
    # A doc that quotes a checker and is not checked by it will always drift.
    ('docs/PROVENANCE.md',
     f'{word(agents)} agents, {word(skills)} skills, {word(hooks)} {hookword}'),
    # marketplace.json carries its OWN description, separate from plugin.json's,
    # and it was not checked here — so it sat at "seven skills" through the
    # release that removed the seventh. It is also the copy a stranger reads
    # before installing anything, which makes it the worst place to be stale.
    ('.claude-plugin/marketplace.json',
     f'{word(agents)} specialists, {word(skills)} skills, {word(hooks)} advisory {hookword}'),
]
matched = 0
for path, expect in roster_sites:
    text = re.sub(' +', ' ', open(os.path.join(root, path)).read().replace('\n', ' '))
    if expect.lower() in text.lower():
        matched += 1
    else:
        print(f'  STALE ROSTER  {path} does not state the roster this plugin ships')
        print(f'                  expected: "{expect}"')
        bad += 1
if matched == len(roster_sites):
    print(f'{matched}/{matched} worded rosters match: {word(agents)} agents, '
          f'{word(skills)} skills, {word(hooks)} {hookword}.')

# The README quotes how many cases the hook suite runs and how many mutants the
# mutation suite kills.
suite_counts = []
# Both hooks are enrolled. A second hook whose suite nobody runs is the state
# this gate exists to prevent, and its counts drift out of the README exactly
# the way the first hook's did.
SUITES = [
    ('test cases', 'hooks/verify-deliverables.test.mjs', r'(\d+)/(\d+) passed'),
    ('mutants', 'hooks/verify-deliverables.mutate.mjs', r'score: (\d+)/(\d+) killed'),
    ('test cases', 'hooks/check-output-style.test.mjs', r'(\d+)/(\d+) passed'),
    ('mutants', 'hooks/check-output-style.mutate.mjs', r'score: (\d+)/(\d+) killed'),
]
for label, script, pattern in SUITES:
    try:
        # OMC_SLIM_HOOK_PATH redirects the suite at a different file. The
        # mutation runner sets it deliberately for its sandbox; anything in the
        # caller's shell would make this gate test some other file and pass.
        # That is the same failure the sandbox rewrite closed, moved from disk
        # to environment, so strip it rather than trust the caller.
        # OMC_SLIM_SCAN_BUDGET_MS is stripped for the same reason: an ambient
        # value changes what the suite measures, and a blank one used to mute
        # the hook outright.
        # OMC_SLIM_STYLE_BUDGET_MS and OMC_SLIM_SELF_ROOT are stripped for the
        # same reason and were missed when each was introduced: the first
        # expires the style scan's deadline, the second overrides which install
        # path the hook calls itself. Neither can change a result today, because
        # the suites set both explicitly per spawn — which is exactly how the
        # first two got here, and why the set is a set rather than two names.
        leaky = {'OMC_SLIM_HOOK_PATH', 'OMC_SLIM_SCAN_BUDGET_MS',
                 'OMC_SLIM_STYLE_BUDGET_MS', 'OMC_SLIM_SELF_ROOT'}
        env = {k: v for k, v in os.environ.items() if k not in leaky}
        # The guard has to clear the runner's own worst case, not a typical run:
        # 23 mutants x its 120s per-mutant ceiling is 46 min. 60 min is a hang
        # guard, not a budget — a real run is under two minutes.
        proc = subprocess.run(['node', os.path.join(root, script)],
                              capture_output=True, text=True, timeout=3600,
                              env=env)
        out = proc.stdout
        # The runner prints its score BEFORE it exits non-zero on a failed
        # restore, so matching the score line alone reports green while a mutant
        # sits on disk. Read the exit code, not just the output.
        if proc.returncode != 0:
            print(f'  SUITE FAILED  {script} exited {proc.returncode}')
            bad += 1
            continue
    except Exception as exc:
        print(f'  SUITE FAILED  {script} did not run: {exc}')
        bad += 1
        continue
    m = re.search(pattern, out)
    if not m:
        print(f'  SUITE FAILED  {script} printed no "{label}" total')
        bad += 1
        continue
    got, total = int(m.group(1)), int(m.group(2))
    if got != total:
        print(f'  SUITE FAILED  {script}: {got}/{total} {label}')
        bad += 1
        continue
    suite_counts.append((label, script, total))

# The same sample block quotes the row total. Enrol it too, or the counts and the
# total drift apart independently.
prov = open(os.path.join(root, 'docs/PROVENANCE.md')).read()
rows = sum(1 for ln in open(os.path.join(root, 'COVERAGE.tsv'))
           if ln.strip() and not ln.lstrip().startswith('#'))
for literal in (f'{rows}/{rows} adopted behaviours present.', f'{rows} rows'):
    if literal not in prov:
        print(f'  STALE SAMPLE  docs/PROVENANCE.md does not quote "{literal}"')
        bad += 1

readme = re.sub(' +', ' ', open(os.path.join(root, 'README.md')).read().replace('\n', ' ')).lower()
for label, script, total in suite_counts:
    if word(total).lower() not in readme and str(total) not in readme:
        print(f'  STALE COUNT   README does not state {total} {label} for {script}')
        bad += 1
if len(suite_counts) == len(SUITES) and not bad:
    cases = sum(t for label, _, t in suite_counts if label == 'test cases')
    mutants = sum(t for label, _, t in suite_counts if label == 'mutants')
    print(f'{cases} hook test cases and {mutants} mutants across '
          f'{len(suite_counts) // 2} suites, each total stated in README.')

if bad:
    raise SystemExit(1)
PY

# --- frontmatter parses ---------------------------------------------------
# An agent whose YAML frontmatter fails to parse loads with its name taken from
# the filename and EVERY OTHER FIELD SILENTLY DROPPED — including
# disallowedTools, which is the only harness-enforced guarantee this plugin has.
# It happened: a rewritten description beginning with a double quote, and several
# containing ": ", broke all six agents at once while every other check stayed
# green. Quote any description containing a colon-space or a leading quote.
python3 - "$ROOT" <<'FMPY' || exit 1
import glob, os, sys
root = sys.argv[1]
try:
    import yaml
except ImportError:
    print('  SKIPPED       PyYAML not installed; frontmatter unparsed')
    raise SystemExit(0)

bad = 0
files = sorted(glob.glob(os.path.join(root, 'agents/*.md')))
files += sorted(glob.glob(os.path.join(root, 'skills/*/SKILL.md')))
for path in files:
    rel = os.path.relpath(path, root)
    text = open(path).read()
    if not text.startswith('---'):
        print('  NO FRONTMATTER ' + rel)
        bad += 1
        continue
    try:
        data = yaml.safe_load(text.split('---', 2)[1])
    except Exception as exc:
        print('  UNPARSEABLE   ' + rel)
        print('                  ' + str(exc).splitlines()[0][:88])
        print('                  every field but name is dropped at runtime')
        bad += 1
        continue
    if not isinstance(data, dict) or 'name' not in data or 'description' not in data:
        print('  BAD KEYS      ' + rel + ' needs name and description')
        bad += 1
if bad:
    raise SystemExit(1)
print(str(len(files)) + '/' + str(len(files)) + ' frontmatter blocks parse.')
FMPY

# --- hidden characters in shipped text ------------------------------------
# Every prompt this plugin ships is executable content. The Rules File Backdoor
# demonstrated invisible Unicode in a rules file making an agent inject a
# malicious script AND not mention it in chat — surviving a fork, invisible in
# review. A marketplace plugin is exactly the distribution path that attack
# wants, so the bytes get checked rather than trusted.
python3 - "$ROOT" <<'UNIPY' || exit 1
import glob, os, sys, unicodedata
root = sys.argv[1]

# Bidi overrides, zero-width joiners/spaces, invisible separators, tag
# characters (the ASCII-smuggling block), BOM anywhere but byte 0.
SUSPECT = {
    0x200B, 0x200C, 0x200D, 0x200E, 0x200F, 0x2028, 0x2029,
    0x202A, 0x202B, 0x202C, 0x202D, 0x202E,
    0x2060, 0x2061, 0x2062, 0x2063, 0x2064, 0x206A, 0x206B,
    0x206C, 0x206D, 0x206E, 0x206F, 0xFEFF, 0x00AD,
    # The bidi ISOLATES and the Arabic letter mark. An enumeration that stops at
    # 0x2064 and resumes at 0x206A skips exactly 0x2066-0x2069, which is the
    # Trojan Source set (CVE-2021-42574) — the attack this block cites.
    0x061C, 0x2066, 0x2067, 0x2068, 0x2069,
    # Blank glyphs that are not format characters, so no category test finds
    # them: Hangul fillers, Khmer vowel inherents, Mongolian separators.
    0x115F, 0x1160, 0x17B4, 0x17B5, 0x180B, 0x180C, 0x180D, 0x180E,
    0x3164, 0xFFA0,
}
def suspect(cp):
    # Category Cf catches every future format character without a list to
    # maintain; the enumeration above stays for the ones Cf does not cover.
    if cp in SUSPECT or 0xE0000 <= cp <= 0xE007F:
        return True
    # Variation selectors (U+FE00-FE0F) are deliberately NOT here: U+FE0F is
    # what makes an emoji render as an emoji, and this repository's own prose
    # uses it. Flagging the range reports every warning sign in RESEARCH.md.
    return unicodedata.category(chr(cp)) == 'Cf'

files = []
# The manifests carry prompt text too, and marketplace.json is the copy a
# stranger reads before installing. evals/README.md sits one level above the
# `evals/*/*.md` glob and was unscanned; so were the shipped scripts.
for pat in ('output-styles/*.md', 'agents/*.md', 'skills/*/*.md',
            'skills/*/scripts/*', 'evals/*.md', 'evals/*/*.md',
            'evals/*/graders/*.md', '*.md', 'docs/*.md', 'docs/*/*.md',
            '.claude-plugin/*.json', 'hooks/*'):
    files += glob.glob(os.path.join(root, pat))
files = [f for f in files if os.path.isfile(f)]

bad = 0
for path in sorted(set(files)):
    rel = os.path.relpath(path, root)
    for lineno, line in enumerate(open(path, encoding='utf-8', errors='replace'), 1):
        for col, ch in enumerate(line, 1):
            cp = ord(ch)
            if cp == 0xFEFF and lineno == 1 and col == 1:
                continue
            if suspect(cp):
                name = unicodedata.name(ch, 'unnamed')
                print(f'  HIDDEN CHAR   {rel}:{lineno}:{col} U+{cp:04X} {name}')
                bad += 1
if bad:
    print('\nInvisible characters in shipped prompt text. Remove them, or if one')
    print('is deliberate, add it to SUSPECT with a comment saying why.')
    raise SystemExit(1)
print(f'{len(set(files))}/{len(set(files))} text assets free of invisible characters.')
UNIPY

# --- every component is reachable from another one ------------------------
# `tracer` shipped with ZERO inbound references while `oracle`'s description
# claimed its trigger verbatim — "escalation for a bug that survived a first
# fix". Nothing routed to it, because every routing sentence that needed a
# bug-escalation target already had a nearer candidate. A component nothing
# names is a component nothing reaches, and the contradiction sweep could not
# see it: the rules did not conflict, the TRIGGERS overlapped.
#
# Entry points are exempt and must say why. Everything else earns an inbound
# edge from some other component's prompt.
python3 - "$ROOT" <<'REACHPY' || exit 1
import glob, os, re, sys
root = sys.argv[1]

ENTRY_POINTS = {
    # component: why nothing routes to it
    'codemap': 'user-invoked on an unfamiliar repo, before any component runs',
    'deep-interview': 'runs before there is a plan for anything to route from',
}
# An exemption for a component that no longer exists silently shrinks the
# denominator, so the gate would report 9/9 while ten components needed checking.
STALE_EXEMPTIONS = None  # set below, once the component list is known

components = ([os.path.basename(f)[:-3] for f in glob.glob(os.path.join(root, 'agents/*.md'))]
              + [os.path.basename(os.path.dirname(f))
                 for f in glob.glob(os.path.join(root, 'skills/*/SKILL.md'))])

prompts = []
for pat in ('agents/*.md', 'skills/*/*.md', 'output-styles/*.md'):
    prompts += glob.glob(os.path.join(root, pat))

bad = 0
STALE_EXEMPTIONS = sorted(set(ENTRY_POINTS) - set(components))
for stale in STALE_EXEMPTIONS:
    print(f'  STALE EXEMPT  ENTRY_POINTS lists {stale}, which is not a component')
    bad += 1

for name in sorted(components):
    inbound = []
    for path in prompts:
        rel = os.path.relpath(path, root)
        # A component naming itself is not an inbound edge.
        if rel == f'agents/{name}.md' or rel.startswith(f'skills/{name}/'):
            continue
        # The orchestrator roster lists everything by definition, so it cannot
        # be the edge that proves reachability.
        if rel.startswith('output-styles/'):
            continue
        # A citation is not a handoff. Strip fenced blocks and any Credit or
        # Reference section before looking: `codemap` cites `omc-slim:review`
        # inside an argument about line numbers, which is not an edge, and a
        # component whose last surviving mention is that kind would go
        # unreachable while this gate stayed green.
        body = open(path, encoding='utf-8', errors='replace').read()
        # Fence stripping is line-state, not regex. `^```.*?^```` pairs fences
        # positionally, so an ODD fence count leaves the tail unstripped and a
        # four-backtick wrapper gets closed by its own inner fence. Walking the
        # lines is exact and unclosed fences swallow the remainder, which is the
        # conservative direction: it drops text rather than counting it.
        kept, fence = [], None
        for ln in body.split('\n'):
            marker = re.match(r'^(`{3,})', ln)
            if fence is None and marker:
                fence = marker.group(1)
                continue
            if fence is not None:
                if marker and len(marker.group(1)) >= len(fence):
                    fence = None
                continue
            kept.append(ln)
        body = '\n'.join(kept)
        body = re.sub(r'^#{1,6} +(Credit|Reference|Provenance|Source)s?\b.*?(?=^#{1,6} |\Z)',
                      '', body, flags=re.M | re.S | re.I)
        # `\b` sits between "r" and "-", so `omc-slim:tracer-lite` would satisfy
        # `tracer`. Require the name to end the reference.
        if re.search(rf'omc-slim:{re.escape(name)}(?![\w-])', body):
            inbound.append(rel)
    if not inbound and name not in ENTRY_POINTS:
        print(f'  UNREACHABLE   {name} is named by no other component')
        print('                  add the handoff, or list it as an entry point with a reason')
        bad += 1
if bad:
    raise SystemExit(1)
print(f'{len(components) - len(ENTRY_POINTS)}/{len(components) - len(ENTRY_POINTS)} '
      f'non-entry components are reachable ({len(ENTRY_POINTS)} entry points).')
REACHPY

# --- no third-party components named in shipped prompts -------------------
# An agent or skill body that names another plugin's component is a dead pointer
# on any machine that does not have it, and it fails SILENTLY: the model reads
# "use foo:bar instead", finds no foo:bar, and either invents a substitute or
# does nothing. This plugin already applies the rule to MCP servers — describe
# the CLASS of tool, never the vendor — and the same reasoning covers agents and
# skills. Only `omc-slim:` names are guaranteed present wherever this is
# installed. Boundaries are stated as capabilities: "not a first debugging pass",
# never "use someone-else:their-skill".
python3 - "$ROOT" <<'NSPY' || exit 1
import glob, os, re, sys
root = sys.argv[1]

# A plugin-namespaced reference has a distinctive shape: two lowercase words
# joined by a colon.
#
# The lookbehind does NOT exclude a backtick, and that is the whole point: this
# repository writes every reference in backticks, so a lookbehind that skipped
# them would be blind to the only form anyone actually writes. The first version
# of this check had that bug and passed a backticked third-party pointer.
REF = re.compile(r'(?<![\w/.-])([a-z][a-z0-9-]{2,}):([a-z][a-z0-9-]{2,})(?![\w/-])')
ALLOWED_PREFIX = 'omc-slim'
# Idioms that share the shape and mean something else. Enumerated rather than
# pattern-matched, so a new one has to be a deliberate addition.
ALLOWED_IDIOMS = {'file:line', 'file:lines', 'chars:tokens', 'key:value'}

files = []
for pat in ('agents/*.md', 'skills/*/*.md', 'output-styles/*.md'):
    files += glob.glob(os.path.join(root, pat))

# A BARE sibling name is the other half of the same problem. `fixer` in prose can
# resolve to another plugin's agent of that name, and it does not read as a
# reference at all to anything that counts edges — which is how one component's
# handoff silently left the graph. A component naming itself is not a reference.
COMPONENTS = ([os.path.basename(f)[:-3] for f in glob.glob(os.path.join(root, 'agents/*.md'))]
              + [os.path.basename(os.path.dirname(f))
                 for f in glob.glob(os.path.join(root, 'skills/*/SKILL.md'))])
BARE = re.compile(r'`(' + '|'.join(re.escape(c) for c in sorted(COMPONENTS)) + r')`')

bad = 0
for path in sorted(files):
    rel = os.path.relpath(path, root)
    own = (os.path.basename(path)[:-3] if rel.startswith('agents/')
           else rel.split('/')[1] if rel.startswith('skills/') else None)
    for lineno, line in enumerate(open(path, encoding='utf-8', errors='replace'), 1):
        for m in REF.finditer(line.replace('`', '')):
            if m.group(0) in ALLOWED_IDIOMS:
                continue
            if m.group(1) == ALLOWED_PREFIX:
                # Inside our own namespace, the risk is a typo rather than a
                # missing plugin — and it fails exactly as silently. This
                # release added 51 of these pointers; none is checked by the
                # reachability block, which only counts edges INTO components
                # that exist.
                if m.group(2) not in COMPONENTS:
                    print(f'  NO SUCH       {rel}:{lineno} points at {m.group(0)!r}, '
                          f'which is not a component')
                    bad += 1
                continue
            print(f'  THIRD PARTY   {rel}:{lineno} names {m.group(0)!r}')
            bad += 1
        for m in BARE.finditer(line):
            if m.group(1) == own:
                continue
            print(f'  BARE NAME     {rel}:{lineno} says {m.group(0)} — write '
                  f'`omc-slim:{m.group(1)}`, which cannot resolve elsewhere')
            bad += 1
if bad:
    print('\nShipped prompts may name only omc-slim components. Another plugin')
    print('may not be installed, and the pointer fails silently when it is not.')
    print('State the boundary as a capability instead.')
    raise SystemExit(1)
print(f'{len(files)}/{len(files)} prompt files name no third-party component.')
NSPY

# --- the review skill's base-resolution script still resolves -------------
# B3: the base-resolution logic used to be a snippet inside review/SKILL.md, and
# it implemented two of the five steps the prose beside it described — so every
# `master`-default repository died on `fatal: ambiguous argument`. Prose and code
# do not stay in step by intention. The code is a script now, and this runs its
# suite, which builds a master-default repository as its first case and carries a
# negative control so a match means something.
#
# Not enrolled in the README hook counts above: those describe the two hooks, and
# folding a third suite into that sentence would make it wrong in a different way.
# Both component suites, not just the one. codemap.mjs is 800+ lines, is the only
# thing here that writes into the USER's repository, and its suite was reachable
# from CI and from nothing else — so a local `check-coverage.sh` reported green
# over a broken codemap. The hook suites above are enrolled with README counts
# because those counts are published; these two are enrolled for the exit code.
for suite in "bash $ROOT/skills/review/scripts/base.test.sh" \
             "node $ROOT/skills/codemap/scripts/codemap.test.mjs" \
             "bash $ROOT/scripts/check-adversarial.sh" \
             "bash $ROOT/scripts/optional/statusline.test.sh"; do
  name=$(basename "${suite##* }")
  if suite_out=$($suite 2>&1); then
    echo "$suite_out" | tail -1 | sed "s|^|${name}: |"
  else
    echo "  SUITE FAILED  $name"
    echo "$suite_out" | tail -12 | sed 's/^/                  /'
    exit 1
  fi
done

# --- the harness-enforced mechanisms, asserted -----------------------------
# Every other block in this file checks that a LISTED thing still exists. None
# of them checks that an EXISTING thing is listed, and that one asymmetry is a
# single bug wearing six hats: an added Set member, an edited matcher, a deleted
# frontmatter key, a gutted grader body, a new unpinned agent, a deleted sibling.
#
# The most expensive hat: `disallowedTools` is described three lines below this
# comment's own neighbourhood as "the only harness-enforced guarantee this plugin
# has", and until now it was asserted by NOTHING. Deleting the line from an agent
# grants it `Agent` — breaking one-level delegation — and `WebSearch` — breaking
# the research boundary — while the agent's own description still promises "no
# subagents, no web research". Every presence check passes on the prose the
# deleted key was enforcing. That is 51dfbcc at the mechanism layer.
#
# So this block asserts the mechanisms directly, from a table that has to be
# edited by hand. A new agent fails until someone decides what it may not do,
# which is the point: the decision is the guarantee.
python3 - "$ROOT" <<'MECHPY' || exit 1
import glob, json, os, re, sys
root = sys.argv[1]
bad = 0

# name -> tools that MUST be denied. Hand-maintained on purpose.
#   Agent, Task    one-level delegation. The plugin's central guarantee, and the
#                  reason `Task` stays: it is a live legacy alias for `Agent`,
#                  and 2.1.251's `toolAliases` map is "applied before name
#                  resolution", so a deny bound to one name is a deny the host's
#                  alias table can move. Both names, or the guarantee is a bet.
#   Edit/Write/... read-only agents. A read-only agent that can write is not one.
#   WebSearch      the research boundary, on both writers, after v0.9.2 made it
#                  one policy instead of prose on one side and a key on the other.
REQUIRED = {
    'explorer':  {'Edit', 'Write', 'NotebookEdit', 'Agent', 'Task'},
    'librarian': {'Edit', 'Write', 'NotebookEdit', 'Agent', 'Task'},
    'oracle':    {'Edit', 'Write', 'NotebookEdit', 'Agent', 'Task'},
    'tracer':    {'Edit', 'Write', 'NotebookEdit', 'Agent', 'Task'},
    'fixer':     {'Agent', 'Task', 'WebSearch'},
    'designer':  {'Agent', 'Task', 'WebSearch'},
}

present = {os.path.basename(f)[:-3] for f in glob.glob(os.path.join(root, 'agents/*.md'))}
for extra in sorted(present - set(REQUIRED)):
    print(f'  UNGOVERNED    agents/{extra}.md has no entry in the disallowedTools table')
    print('                  decide what it may not do, then add it here')
    bad += 1
for gone in sorted(set(REQUIRED) - present):
    print(f'  STALE ENTRY   the disallowedTools table governs {gone}, which no longer exists')
    bad += 1

for name in sorted(present & set(REQUIRED)):
    src = open(os.path.join(root, f'agents/{name}.md'), encoding='utf-8').read()
    m = re.search(r'^disallowedTools:\s*\[([^\]]*)\]', src, re.M)
    if not m:
        print(f'  NO GUARANTEE  agents/{name}.md declares no disallowedTools')
        print('                  its description still promises the boundary the key enforced')
        bad += 1
        continue
    got = {tool.strip() for tool in m.group(1).split(',') if tool.strip()}
    missing = REQUIRED[name] - got
    if missing:
        print(f'  WEAKENED      agents/{name}.md no longer denies {", ".join(sorted(missing))}')
        bad += 1

# The SubagentStop matcher governs which agents the deliverable hook covers, and
# hooks.json was parsed only to COUNT hooks. Narrowing it to one name silently
# unregisters the hook for half the write-capable roster, while the mutation
# suite carries a dedicated mutant for that identical defect one layer down —
# now guarding nothing.
cfg = json.load(open(os.path.join(root, 'hooks/hooks.json')))
WRITERS = {'fixer', 'designer'}
matchers = [g.get('matcher', '') for g in cfg['hooks'].get('SubagentStop', [])]
covered = set()
for pat in matchers:
    try:
        rx = re.compile(pat)
    except re.error:
        print(f'  BAD MATCHER   hooks.json SubagentStop matcher does not compile: {pat!r}')
        bad += 1
        continue
    for w in WRITERS:
        if rx.search(w) or rx.search(f'omc-slim:{w}'):
            covered.add(w)
for w in sorted(WRITERS - covered):
    print(f'  UNCOVERED     hooks.json SubagentStop does not match {w!r}')
    print('                  the deliverable check silently stops running for it')
    bad += 1

# verify-deliverables reasons from the declared timeout: its own comment says the
# internal budget sits "well inside the 5 s declared in hooks.json". Cut the
# declared value below the internal one and the hook is killed mid-scan instead
# of abstaining — it stops reporting "cannot tell" and starts reporting nothing.
src = open(os.path.join(root, 'hooks/verify-deliverables.mjs'), encoding='utf-8').read()
budget = re.search(r'return (\d+);\s*\n\s*const n = Number\(raw\)', src)
internal_ms = int(budget.group(1)) if budget else 2000
for ev, groups in cfg['hooks'].items():
    for g in groups:
        for h in g.get('hooks', []):
            declared_ms = int(h.get('timeout', 0)) * 1000
            if declared_ms and declared_ms <= internal_ms:
                print(f'  BUDGET FLIP   {ev} declares {declared_ms // 1000}s, '
                      f'inside the hook\'s own {internal_ms}ms scan budget')
                print('                  the hook is killed mid-scan rather than abstaining')
                bad += 1

# Every component must carry at least one pinned row. A new agent or skill with
# zero rows passes every other block in this file, including the one that prints
# "N/N adopted behaviours present".
pinned = set()
for tsv, col in (('COVERAGE.tsv', 2), ('REINFORCEMENT.tsv', 1)):
    for line in open(os.path.join(root, tsv), encoding='utf-8'):
        if line.startswith('#') or not line.strip():
            continue
        cols = line.rstrip('\n').split('\t')
        if len(cols) > col:
            pinned.add(cols[col].split('/')[0])
components = present | {os.path.basename(os.path.dirname(f))
                        for f in glob.glob(os.path.join(root, 'skills/*/SKILL.md'))}
for c in sorted(components - pinned):
    print(f'  UNPINNED      {c} ships with no COVERAGE or REINFORCEMENT row')
    print('                  nothing would notice its rules being removed')
    bad += 1

if bad:
    print('\nEvery other block here checks a listed thing still exists. This one')
    print('checks an existing thing is listed, which is the direction the scar runs.')
    raise SystemExit(1)
print(f'{len(REQUIRED)}/{len(REQUIRED)} agents keep their tool denials; '
      f'{len(components)} components pinned; hook coverage and budgets hold.')
MECHPY

# --- every component reference carries its type ---------------------------
# Agents and skills both reach the model as bare `omc-slim:<name>` strings. The
# Agent tool's subagent_type list and the Skill tool's list share the prefix, and
# nothing in the name says which list a name belongs to — so the model picks the
# wrong tool. Observed: `deepwork` dispatched as an agent, Agent-tool error, retry
# as a skill. The cost is an error, a retry and a slower answer, every time.
#
# Predicate: a type word — agent, agents, skill, skills — in the same sentence as
# the reference. The dispatch-shaped forms `Agent(omc-slim:x)`, `Skill(omc-slim:x)`
# and `/omc-slim:x` say it structurally and satisfy it on their own.
#
# SCOPE, and its limit stated rather than implied. Covered: agent and skill
# frontmatter descriptions (the most model-facing strings on a crowded machine),
# the output style, SKILL.md bodies, the hooks' user-facing messages, README.
# NOT covered: agent bodies and skill siblings. A subagent cannot dispatch
# (`disallowedTools: [Agent, Task]`), so marking a name it can only report buys
# nothing — but an agent's HANDOFF sentence does travel back to a caller who
# dispatches, and those are marked by hand. They are not gated, because a
# predicate for "a line that instructs onward routing" needs a keyword list, and
# a keyword list that misses one returns GREEN over an unmarked handoff. A
# narrower gate that is honest beats a wider one that lies.
# docs/ are frozen history and out of scope everywhere.
python3 - "$ROOT" <<'TYPEPY' || exit 1
import glob, os, re, sys
root = sys.argv[1]

COMPONENTS = set([os.path.basename(f)[:-3] for f in glob.glob(os.path.join(root, 'agents/*.md'))] +
                 [os.path.basename(os.path.dirname(f))
                  for f in glob.glob(os.path.join(root, 'skills/*/SKILL.md'))])
TYPE = re.compile(r'\b(agent|agents|skill|skills)\b', re.I)
REF = re.compile(r'(?<![\w/])omc-slim:([a-z][a-z0-9-]*)')
DISPATCH = re.compile(r'(?:Agent|Skill)\(omc-slim:[a-z-]+\)|/omc-slim:[a-z-]+')

def frontmatter_desc(p):
    out, inblock = [], False
    for ln in open(p, encoding='utf-8').read().split('\n'):
        if re.match(r'^(description|when_to_use):\s*[>|]\s*$', ln):
            inblock = True; continue
        m = re.match(r'^(description|when_to_use):\s*(.*)$', ln)
        if m and not inblock:
            out.append(m.group(2)); continue
        if inblock and re.match(r'^\s+\S', ln):
            out.append(ln.strip()); continue
        inblock = False
    return '\n'.join(out)

def body(p):
    t = open(p, encoding='utf-8').read()
    if t.startswith('---'):
        i = t.find('\n---', 3)
        if i != -1:
            return t[i + 4:]
    return t

scope = []
for f in sorted(glob.glob(os.path.join(root, 'agents/*.md'))) + \
         sorted(glob.glob(os.path.join(root, 'skills/*/SKILL.md'))):
    scope.append((os.path.relpath(f, root) + ' frontmatter', frontmatter_desc(f)))
for f in sorted(glob.glob(os.path.join(root, 'skills/*/SKILL.md'))) + \
         sorted(glob.glob(os.path.join(root, 'output-styles/*.md'))):
    scope.append((os.path.relpath(f, root), body(f)))
for f in sorted(glob.glob(os.path.join(root, 'hooks/*.mjs'))):
    if f.endswith(('.test.mjs', '.mutate.mjs')):
        continue
    # The whole source, not the extracted matches. Pulling matches out and
    # re-joining them destroyed the sentence they sat in, and the type word is
    # BY DEFINITION in that sentence — the gate reported a line reading "for a
    # plugin agent is `omc-slim:fixer`" as untyped, having removed the word
    # "agent" itself. A predicate that mangles its own input is worse than no
    # predicate. Comments count here too: a comment naming a component without
    # its type is the same ambiguity for the next reader.
    scope.append((os.path.relpath(f, root), open(f, encoding='utf-8').read()))
scope.append(('README.md', open(os.path.join(root, 'README.md'), encoding='utf-8').read()))

bad = 0
checked = 0
for label, text in scope:
    # Paragraphs first, then sentences INSIDE a paragraph. Splitting the whole
    # text on newlines treats every wrapped line as its own sentence, which is
    # how a type word two words after a line break stopped counting.
    for block in re.split(r'\n\s*\n', text):
        flat = re.sub(r'\s+', ' ', block)
        for sent in re.split(r'(?<=[.!?:])\s+(?=[A-Z*`\-])', flat):
            for m in REF.finditer(sent):
                if m.group(1) not in COMPONENTS:
                    continue      # the namespace block above owns a bad name
                checked += 1
                if DISPATCH.search(sent) or TYPE.search(sent):
                    continue
                bad += 1
                print(f'  UNTYPED REF   {label} names {m.group(0)!r} with no type word')
                print(f'                  {sent.strip()[:110]}')
if not checked:
    print('  NO REFERENCES the type-marking scope matched nothing — check the globs')
    raise SystemExit(1)
if bad:
    print('\nA name is not a type. Say "the `omc-slim:x` agent" or "the `omc-slim:x`')
    print('skill" in the same sentence, or write the dispatch form Agent(omc-slim:x).')
    print('Without it the model picks the wrong tool, errors, and retries.')
    raise SystemExit(1)
print(f'{checked}/{checked} component references carry their type.')
TYPEPY

# --- the code-slop taxonomy is covered ------------------------------------
# "Does this plugin fix the AI slop in the code it writes?" is a fair question
# and it was answered by assertion until this block existed. Measured on
# 2026-08-29 the answer was "partially, and lopsidedly": `simplify` carried 5 of
# 10 markers, `fixer` — the WRITER — carried 3, `designer` carried 0, and two
# markers were absent from the entire estate.
#
# The lopsidedness was the finding. Coverage sat on the component that DELETES
# code rather than the two that write it, so slop was being caught at the latest
# and most expensive point instead of prevented at the cheapest.
#
# The taxonomy is slop-scan's eight rules plus two tells from the complaint
# corpus. slop-scan is the only tool in this space with a published
# discrimination number: known-AI repositories median 6.91 against mature
# open-source median 1.00, with the OSS cohort pinned to commits on or before
# 2025-01-01 so the baseline predates the thing being measured.
#
# What this checks and what it cannot: that a rule addressing each marker EXISTS
# somewhere a model will read. It cannot check that the rule fires, which is the
# same limit every presence gate here has and is why the contradiction sweep and
# the eval suite exist.
python3 - "$ROOT" <<'SLOPPY' || exit 1
import glob, os, re, sys
root = sys.argv[1]

# marker -> (pattern, where it must appear at minimum)
#   'writer' means at least one of fixer/designer must carry it, because a rule
#   that only lives in the reviewer catches slop after it is written.
TAXONOMY = [
    ('catch that swallows or logs-and-continues',
     r'empty catch|swallow\w*\s+(an?\s+)?error|logs and continue|log and continue', 'writer'),
    ('a failure that becomes a default value',
     r'becomes a default|\|\| \{\}|\?\? \[\]|catch\(\(\) =>', 'writer'),
    ('a status envelope around something that throws',
     r'status envelope|success: true', 'writer'),
    ('a redundant or widening cast',
     r'redundant cast|as any|widening a type', 'any'),
    ('a wrapper that only forwards',
     r'wrapper that adds nothing|only forwards|pass-through wrapper', 'any'),
    ('a test that asserts the mock',
     r'asserts the mock', 'any'),
    ('duplicated logic or a copy-paste clone',
     r'same conditional repeated|Same 5\+ lines|Re-implementing what lives', 'any'),
    ('a comment that narrates the code',
     r'narrat\w+|restating the code', 'writer'),
    ('an abstraction built for a caller that never came',
     r'second caller that never came|one implementation|speculative', 'any'),
    ('reflexive memoisation or wrapping',
     r'memo around everything|useMemo around everything|over-memoisation', 'any'),
]

estate = {}
for pat in ('agents/*.md', 'skills/*/*.md', 'output-styles/*.md'):
    for f in glob.glob(os.path.join(root, pat)):
        estate[os.path.relpath(f, root)] = open(f, encoding='utf-8').read()
writers = [k for k in estate if k in ('agents/fixer.md', 'agents/designer.md')]

bad = 0
for name, pattern, scope in TAXONOMY:
    rx = re.compile(pattern, re.I)
    hits = [k for k, v in estate.items() if rx.search(v)]
    if not hits:
        print(f'  SLOP UNCOVERED no component addresses: {name}')
        bad += 1
        continue
    if scope == 'writer' and not any(h in writers for h in hits):
        print(f'  REVIEWER ONLY {name}')
        print(f'                  covered in {", ".join(sorted(hits)[:2])}, but neither writer')
        print('                  a rule only the reviewer has catches slop after it is written')
        bad += 1

# The register rule has to reach the SUBAGENTS, and this is the direction that
# gets missed. Skills run in the main thread and inherit the output style; agents
# do not — this repository documents that as the reason every cross-file
# "duplicate" whose canonical copy is the style is a false duplicate at runtime.
# So the style telling the main thread how to write reaches none of the six
# agents, and two of those six write the code the user reads.
missing_register = [os.path.relpath(f, root) for f in sorted(glob.glob(os.path.join(root, 'agents/*.md')))
                    if 'punctuate like someone typing fast' not in open(f, encoding='utf-8').read().lower()]
for f in missing_register:
    print(f'  NO REGISTER   {f} never tells its agent how to write')
    print('                  subagents do not inherit the output style, so the')
    print('                  register rule has to be in the agent or it reaches nothing')
    bad += 1

if bad:
    print('\nThe taxonomy is slop-scan\'s eight rules plus two from the complaint')
    print('corpus. Prevention belongs on the agent that writes the code.')
    raise SystemExit(1)
agents_n = len(glob.glob(os.path.join(root, 'agents/*.md')))
print(f'{len(TAXONOMY)}/{len(TAXONOMY)} code-slop markers addressed, prevention on the '
      f'writers; {agents_n}/{agents_n} agents carry the register rule.')
SLOPPY

# --- adoption provenance --------------------------------------------------
# COVERAGE.tsv records what this plugin took and from where. Two things must stay
# true of that record: every origin is classified, and every external one is
# documented where a reader can find it.
#
# Neither held. The audit that added this block found `gstack` pinned in
# UPSTREAM.tsv with 26 adopted rules and no entry in PROVENANCE.md at all, plus
# three further origins with no provenance anywhere. An adopted rule whose source
# is undocumented is folklore.
#
# Classified by hand rather than matched, because the two files legitimately use
# different names for one source — `omc` here, `oh-my-claudecode` there — and a
# fuzzy match across them produced ten false positives when tried. An origin
# missing from this table fails the check, which is the point: a new source
# cannot enter COVERAGE.tsv without someone saying what it is.
#
# `tracked`    pinned in UPSTREAM.tsv, so drift is detected.
# `documented` no commit to pin — a local install, or bundled with Claude Code.
# `internal`   our own review found the defect; there is no upstream.
python3 - "$ROOT" <<'PY' || exit 1
import os, re, sys
root = sys.argv[1]

ORIGINS = {
    # origin                 kind          UPSTREAM.tsv name      must appear in PROVENANCE.md
    'audit':                ('internal',   None,                  None),
    # Rules adopted from the 2026-08-26 external research sweep. `internal`
    # because there is no upstream repository to pin: the sources are papers,
    # vendor documentation and measured results, and the trail from each rule
    # back to its evidence lives in docs/RESEARCH-2026-08-26.md.
    'research':             ('internal',   None,                  None),
    'CLAUDE.md':            ('tracked',    'CLAUDE.md',           '~/.claude/CLAUDE.md'),
    'fable-mode':           ('tracked',    'fable-mode.SKILL.md', 'fable-mode'),
    'addy':                 ('tracked',    'agent-skills',        'addyosmani/agent-skills'),
    'gstack':               ('tracked',    'gstack',              'garrytan/gstack'),
    'omc':                  ('tracked',    'oh-my-claudecode',    'Yeachan-Heo/oh-my-claudecode'),
    'omo-slim':             ('tracked',    'oh-my-opencode-slim', 'alvinunreal/oh-my-opencode-slim'),
    'ballast':              ('tracked',    'ballast',             'svy04/ballast'),
    'ani-skills':           ('tracked',    'ani-skills',          'aniruddha-adhikary/skills'),
    'powerball':            ('tracked',    'powerball-harness',   'tim-hub/powerball-harness'),
    'superpowers':          ('tracked',    'superpowers',         'obra/superpowers'),
    'ponytail':             ('documented', None,                  'DietrichGebert/ponytail'),
    'caveman':              ('documented', None,                  'JuliusBrussee/caveman'),
    'wait-what':            ('documented', None,                  '`wait-what` skill'),
    'omc-official':         ('documented', None,                  'bundled simplification skill'),
    # A personal output style published as a screenshot in a post, so there is no
    # repository and no commit to pin. PROVENANCE.md carries the post URL and the
    # engagement figures instead, which is the only durable handle it has.
    'eli5':                 ('documented', None,                  'lydiahallie/eli5'),
    # RETIRED 2026-08-25 — its single adopted rule (a hard confidence floor that
    # suppressed findings) was deliberately reversed. No rows remain, so the origin
    # leaves ORIGINS rather than sitting here classifying nothing.
    # 'code-review-official': ('documented', None,               'bundled `code-review` plugin'),
}

pinned = {}
for line in open(os.path.join(root, 'UPSTREAM.tsv')):
    if line.startswith('#') or not line.strip():
        continue
    fields = line.rstrip('\n').split('\t')
    pinned[fields[1]] = fields[2]

seen = []
for line in open(os.path.join(root, 'COVERAGE.tsv')):
    if line.startswith('#') or not line.strip():
        continue
    origin = line.split('\t')[0]
    if origin not in seen:
        seen.append(origin)

prov = re.sub(' +', ' ', open(os.path.join(root, 'docs/PROVENANCE.md')).read().replace('\n', ' '))

bad = 0
for origin in sorted(seen):
    entry = ORIGINS.get(origin)
    if entry is None:
        print(f'  UNCLASSIFIED  COVERAGE.tsv origin {origin!r} is not in this check')
        print('                  classify it as tracked, documented or internal')
        bad += 1
        continue
    kind, upstream_name, doc_token = entry
    if kind == 'tracked':
        if upstream_name not in pinned:
            print(f'  UNPINNED      {origin} claims to be tracked, but UPSTREAM.tsv')
            print(f'                  has no row named {upstream_name!r}')
            bad += 1
        # The pin we track must be a pin the record names. PROVENANCE.md was
        # built by lifting a table out of README.md that had already fallen
        # behind, so three sources documented a commit that predated most of what
        # was taken from them — addy's row cited the read that produced 8 rules
        # while 27 more came from the later pin. A source read twice needs both
        # pins in the table; it does not need them merged.
        elif pinned[upstream_name][:8] not in prov:
            print(f'  STALE PIN     {origin} is tracked at {pinned[upstream_name][:8]},')
            print('                  which docs/PROVENANCE.md never mentions')
            bad += 1
    if doc_token and doc_token not in prov:
        print(f'  UNDOCUMENTED  {origin} has adopted rules but no provenance entry')
        print(f'                  expected in docs/PROVENANCE.md: {doc_token!r}')
        bad += 1

# The table only gets consulted for origins that exist, so an entry whose rows all
# left COVERAGE.tsv would sit here forever unnoticed.
for gone in sorted(set(ORIGINS) - set(seen)):
    print(f'  STALE ENTRY   this check classifies {gone!r}, which COVERAGE.tsv')
    print('                  no longer uses — drop it from ORIGINS')
    bad += 1

if bad:
    print('\nEvery origin in COVERAGE.tsv needs a pin or a stated reason it has none.')
    raise SystemExit(1)
external = sum(1 for o in seen if ORIGINS[o][0] != 'internal')
print(f'{len(seen)}/{len(seen)} adopted origins classified, {external} external and all documented.')
PY

# --- the published figure that lives outside the repository ---------------
# The GitHub repository description is the fifth site quoting the roster and the
# static total, and the only one no other check can see. It drifted twice: it
# claimed one advisory hook after the second shipped, and carried v0.9.0's token
# figure into v0.9.1.
#
# Skipped rather than failed whenever it cannot be read — no `gh`, not logged in,
# no network, no GitHub remote. A gate that fails on an aeroplane is a gate people
# learn to bypass, and this one guards prose, not behaviour. Set
# OMC_SLIM_SKIP_REMOTE=1 to skip it deliberately.
if [ "${OMC_SLIM_SKIP_REMOTE:-}" = "1" ]; then
  echo "  SKIPPED       GitHub description unchecked (OMC_SLIM_SKIP_REMOTE=1)"
elif ! command -v gh >/dev/null 2>&1; then
  echo "  SKIPPED       GitHub description unchecked (gh not installed)"
else
  # -q on the server side, so a repo with no description yields an empty string
  # rather than the literal "null" that would then fail every assertion below.
  REMOTE_DESC="$(cd "$ROOT" && gh repo view --json description -q '.description // ""' 2>/dev/null)" || REMOTE_DESC=""
  if [ -z "$REMOTE_DESC" ]; then
    echo "  SKIPPED       GitHub description unchecked (not readable from here)"
  else
    REMOTE_DESC="$REMOTE_DESC" python3 - "$ROOT" <<'GHPY' || exit 1
import glob, json, os, subprocess, sys

root = sys.argv[1]
desc = os.environ['REMOTE_DESC']

WORDS = {1: 'one', 2: 'two', 3: 'three', 4: 'four', 5: 'five', 6: 'six',
         7: 'seven', 8: 'eight', 9: 'nine', 10: 'ten'}

agents = len(glob.glob(os.path.join(root, 'agents/*.md')))
skills = len(glob.glob(os.path.join(root, 'skills/*/SKILL.md')))
cfg = json.load(open(os.path.join(root, 'hooks/hooks.json')))
hooks = sum(len(g.get('hooks', [])) for ev in cfg['hooks'].values() for g in ev)

def word(n):
    return WORDS.get(n, str(n))

# The description quotes the CORRECTED figure, not the chars/4 one — publishing
# the raw basis to strangers overstates the cost.
#
# This block derived it as chars/4 ÷ 1.135 until 2026-08-29, which is the exact
# constant the rest of this release exists to delete, and it survived here
# because this is the block a reviewer is told to skip with OMC_SLIM_SKIP_REMOTE.
# Two figures then disagreed: the README said 4,388 while this told the
# maintainer to publish 4,254 on the repository's front page — the two
# most-read surfaces contradicting each other, which is the failure the README's
# own "quote a basis or don't quote a number" exists to stop.
#
# It reads the same measured figure every other site reads. A skipped check is a
# check that has stopped being read, and this one was skipped for a whole release.
measured = subprocess.run([os.path.join(root, 'scripts/measure-context.sh'), '--terse-real'],
                          capture_output=True, text=True).stdout.strip()
if not measured.isdigit():
    print('  UNMEASURED    measure-context.sh --terse-real printed no integer')
    print('                  no tokeniser, so the published figure cannot be checked')
    raise SystemExit(1)
corrected = f'{int(measured):,}'

hookword = 'hook' if hooks == 1 else 'hooks'
expected = [
    f'{word(agents)} agents, {word(skills)} skills, {word(hooks)} advisory {hookword}',
    f'{corrected} tokens',
]

stale = [e for e in expected if e.lower() not in desc.lower()]
if stale:
    for e in stale:
        print(f'  STALE REMOTE  the GitHub description does not carry "{e}"')
    print('                  it currently reads:')
    print(f'                  {desc}')
    print('                  fix it with:')
    print(f'                  gh repo edit --description "... {expected[0]} '
          f'\u2014 ~{expected[1]} of static context ..."')
    raise SystemExit(1)

print(f'GitHub description carries the roster and ~{corrected} tokens.')
GHPY
  fi
fi

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
