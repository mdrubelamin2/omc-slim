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

def section(start, end):
    # Anchors must stay unique and in this order; style.index raises otherwise.
    a = style.index(start)
    b = style.index(end, a)
    return style[a:b]

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
# The chars/4 method runs +13.5% high against a real tokeniser
# (docs/AUDIT-2026-08-25.md). Both figures are published, so both are pinned —
# a README that quotes one basis without the other is the ambiguity that made
# `claude plugin details` look like it contradicted us.
corrected = f'{round(int(measured) / 1.135):,}'

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
ceiling_corr = f'{round(ceil_chars / 4 / 1.135):,}'

# review/SKILL.md is measured WHOLE, frontmatter included, because that is what
# the harness re-attaches after compaction. Measuring the body alone flattered
# the figure by 124 tokens and turned a 28-token overrun into an 81-token margin.
review_bytes = os.path.getsize(os.path.join(root, 'skills/review/SKILL.md'))
review_c4 = f'{review_bytes // 4:,}'
review_corr = f'{round(review_bytes / 4 / 1.135):,}'
if round(review_bytes / 4 / 1.135) >= 5000:
    print(f'  OVER THE CAP  skills/review/SKILL.md is {review_corr} corrected tokens')
    print('                  the post-compaction re-injection limit keeps the first 5,000')
    bad_cap = 1
else:
    bad_cap = 0

sites = [
    ('docs/LIMITATIONS.md', f'**{ceiling} chars/4, ~{ceiling_corr} corrected**'),
    ('docs/LIMITATIONS.md', f'is {review_c4} tokens on the chars/4 basis, ~{review_corr} corrected'),
    # CHANGELOG is deliberately NOT enrolled. It is version-scoped history, and
    # pinning a current figure into it forces rewriting what an earlier release
    # actually shipped — which this repository did once, publishing v0.9.1's
    # numbers inside the v0.9.0 entry.

    ('README.md',           f'~{corrected} tokens'),
    ('README.md',           f'**{total} on a chars/4 basis**'),
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
        leaky = {'OMC_SLIM_HOOK_PATH', 'OMC_SLIM_SCAN_BUDGET_MS'}
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
