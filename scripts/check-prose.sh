#!/usr/bin/env bash
# Measure this repository's own prose against the AI-slop tells readers actually
# use, and fail when a user-facing document crosses one.
#
# WHY THIS EXISTS. This project's defence against "it's AI slop" has been that
# every claim is sourced and every number re-derivable. That is true and it is
# invisible to the reader who decides in ten seconds — and worse, thoroughness is
# exactly what slop imitates, so the honesty reads as the accusation.
#
# WHY IT IS NOT A DETECTOR. AI-origin classifiers do not work on this kind of
# text. Weber-Wulff et al. (Int. J. Educational Integrity, 2023) tested fourteen
# tools: none reached 80% accuracy and only five passed 70%, with roughly half of
# lightly-obfuscated AI text misattributed. Liang et al. (Patterns, 2023) found
# seven detectors flagging over 61% of supervised TOEFL essays as machine-written,
# one of them 98%. Every condition that breaks a detector applies here: technical
# vocabulary, heavy revision, short sections. There is no scanner to pass, so this
# measures STYLE SIGNALS a human reader reacts to, and says so in its own output.
#
# The thresholds are sourced where a source exists and marked derived where not.
# A single signal convicts nobody; convergence is the fingerprint. So this fails
# only on the two signals that are visible without reading — em-dash density and
# bolded lead-ins — and reports the rest.
#
#   ./scripts/check-prose.sh            # user-facing docs
#   ./scripts/check-prose.sh <file>...  # named files
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [ "$#" -gt 0 ]; then
  FILES=("$@")
else
  # Scope is DERIVED, not hand-listed, and that is the fix for how this gate
  # spent three releases looking at six documents while claiming an estate.
  #
  # It used to name its files. So a document had to be remembered into the list,
  # and the ones nobody remembered were LIMITATIONS.md, ROUTING.md, BENCHMARK.md,
  # MAINTAINERS.md and four more — thirteen of twenty-one failed the thresholds
  # while the gate printed a clean line about the six it knew. Same asymmetry the
  # mechanism gate closed for components and the figures gate closed for numbers:
  # a list of things that must be checked is not a check that everything is on
  # the list. Every new document now joins by existing.
  #
  # The exclusions are named, and each is a closed record rather than an argument
  # to a reader. That is the line: a document that argues a conclusion is in
  # scope, one that records what happened on a date for the next maintainer is
  # not. Holding a lab notebook to a landing page's standard is how a gate gets
  # ignored. They are named individually rather than matched by date, because
  # ASSESSMENT, DOGFOOD and CRITERIA-AUDIT carry dates too and are in scope.
  #
  # CHANGELOG.md is absent for a different and harder reason, and the reason is a
  # mistake this gate already made. check-coverage.sh states the policy:
  # "CHANGELOG is deliberately NOT enrolled. It is version-scoped history, and
  # pinning a current figure into it forces rewriting what an earlier release
  # actually shipped." This gate enrolled it anyway and produced exactly that:
  # 355 changed lines inside the already-shipped v0.9.0, v0.9.1 and v0.9.2
  # entries. No fact moved, and a multiset comparison of every number, link and
  # quoted span came back empty both ways. But style is not a reason to edit
  # history, and two gates holding opposite policies on one file is worse than
  # either policy. The newest entry is checked separately below, because that one
  # is not history yet.
  EXCLUDE=(
    "docs/AUDIT-2026-08-25.md"        # the audit this repository was rebuilt from
    "docs/RESEARCH-2026-08-26.md"     # a research pass, closed
    "docs/COMPRESSION-2026-08-28.md"  # the compression protocol's working record
    "docs/VIABILITY-2026-08-28.md"    # viability pass I
    "docs/VIABILITY-2026-08-28-II.md" # viability pass II
    "CHANGELOG.md"                    # history; newest entry checked below
  )
  # A named exclusion that no longer exists is a hole nobody can see: the file was
  # renamed and its replacement silently entered scope, or left it. Say so.
  for skip in "${EXCLUDE[@]}"; do
    [ -e "$ROOT/$skip" ] || echo "  STALE SKIP    $skip is excluded and does not exist"
  done

  FILES=()
  for f in "$ROOT"/*.md "$ROOT"/docs/*.md; do
    [ -e "$f" ] || continue
    rel="${f#"$ROOT"/}"
    for skip in "${EXCLUDE[@]}"; do
      [ "$rel" = "$skip" ] && continue 2
    done
    FILES+=("$f")
  done
  FILES+=("$ROOT/output-styles/omc-slim.md" "$ROOT"/agents/*.md "$ROOT"/skills/*/SKILL.md)
fi

# The newest CHANGELOG entry, extracted to a temp file so the gate reads what is
# being written now and not what shipped in March.
NEWEST="$(mktemp -d)/CHANGELOG-newest-entry.md"
trap 'rm -rf "$(dirname "$NEWEST")"' EXIT
awk '/^## /{n++} n==1' "$ROOT/CHANGELOG.md" > "$NEWEST"
if [ -s "$NEWEST" ] && [ "$#" -eq 0 ]; then FILES+=("$NEWEST"); fi

python3 - "${FILES[@]}" <<'PY'
import collections, re, sys, statistics

# Sourced thresholds
# 10.0 rests on the HUMAN corpus, and the provenance of each half differs enough
# that flattening them into one comment was itself a defect. The human range
# 3.7-10.13/1k is slopdetector.org's own 700,000-word measurement, published with
# its method. The "GPT-4.1 at 10.62" figure that used to sit here as "measured" is
# second-hand: slopdetector citing arXiv:2603.27006, a single-author preprint,
# unreviewed, whose per-1,000-word table nobody in this project has read. It is
# kept as context and no longer as the basis, because a gate in a repository whose
# moat is re-derivable numbers had exactly one number nobody could re-derive.
EMDASH_PER_1K   = 10.0   # human corpus 3.7-10.13/1k (slopdetector, 700k words)
TRICOLON_PER_500 = 2.5   # slopdetector: >1 polished triplet per 200 words
NOTX_BUTY        = 3     # slopdetector: 3+ in one article is a template
STYLE_PER_500    = 3.0   # slopdetector flag line
BURSTINESS_MIN   = 0.4   # human 0.6-1.2, model 0.2-0.4 (GPTZero methodology)
TRANSITION_FRAC  = 0.5   # >half of paragraphs opening on a formal transition
# Derived here, not published. Every source names the pattern; none numbers it.
#
# And it is applied ONLY to documents. A prompt uses bold as a salience mechanism
# for the model, not as a listicle tell for a reader — different function, so the
# same number would be a category error. The countermeasure for a prompt is the
# output instruction the style now carries ("punctuate like someone typing fast",
# "vary sentence length"), which costs 40 tokens against 22 structural edits to
# pinned files. That trade is the 51dfbcc lesson applied: a pass that keeps every
# pinned phrase can still break behaviour, and bold is what makes a rule salient.
BOLD_LEADIN_PER_SECTION = 1.5
PROMPT_DIRS = ('agents/', 'skills/', 'output-styles/')

# `harness` is deliberately NOT on this list. This repository uses it as a noun
# for its own benchmark harness, dozens of times, correctly. A word list that
# flags a project's own vocabulary is a word list people switch off, and a gate
# switched off protects nothing.
STYLE = r'\b(delve[sd]?|delving|leverage[sd]?|utili[sz]e[sd]?|robust|seamless|tapestry|realm|beacon|pivotal|multifaceted|testament|showcas\w+|underscor\w+|comprehensive|elevate[sd]?|empower\w*|foster\w*|streamlin\w+|intricate|nuanced|myriad|plethora)\b'
TRANSITION = r'^(Furthermore|Moreover|Additionally|Ultimately|In conclusion|Notably|Importantly|Consequently)\b'
NOTX = r"\b(?:it'?s not just|not just)\b[^.]{2,60}\b(?:but|it'?s)\b"

def strip(t):
    # Quoted spans come out before anything is counted. A document that QUOTES a
    # banned word — this project's own distribution draft says «do not write
    # "delve", "leverage" or "seamless"» — was being flagged for naming the
    # thing it forbids. A predicate that cannot tell use from mention will be
    # ignored the first time it is right, because it was wrong three times first.
    t = re.sub(r'"[^"\n]{1,120}"', '""', t)
    t = re.sub(r'«[^»]{1,200}»', '', t)
    # Fences are NOT stripped, and check-coverage.sh reached the same conclusion
    # for the same reason: they carry the OUTPUT CONTRACTS. Four of five component
    # contracts mandate an em-dash on every line they emit — a ten-finding review
    # emits eleven before the model writes a word of its own — and stripping
    # fences made this gate structurally unable to see the tells the plugin
    # specifies, as opposed to the ones it merely writes.
    t = re.sub(r'^\s*\|.*$', '', t, flags=re.M)            # tables
    t = re.sub(r'`[^`]*`', '', t)                          # inline code
    t = re.sub(r'\]\([^)]*\)', ']', t)                     # link targets
    t = re.sub(r'^\s*(name|description|when_to_use|---).*$', '', t, flags=re.M)
    return t

bad = 0
rows = []
for path in sys.argv[1:]:
    raw = open(path, encoding='utf-8').read()
    t = strip(raw)
    words = len(re.findall(r"[A-Za-z][A-Za-z'-]*", t))
    if words < 200:
        continue
    paras = [p.strip() for p in t.split('\n\n') if p.strip() and not p.lstrip().startswith('#')]
    sections = max(1, len(re.findall(r'^## ', t, flags=re.M)))
    em = t.count('—')
    em1k = em * 1000 / words
    # A bolded lead-in is invented emphasis: a phrase bolded to make a paragraph
    # feel like it has a thesis. A TAG is different — a label drawn from a closed
    # vocabulary the document declares, repeated on every member of a list.
    #
    # This counted both, and that is not a cosmetic difference. docs/TODO-v1.0.md
    # declares a tag legend and marks every backlog item with one. A writer lane
    # sent to lower this metric could not lower it without destroying the
    # taxonomy, so it stripped `- **POSITION:**` off all seven of that tag's
    # items, taking the count from 7 to 0 while leaving the legend in place. A
    # style gate had pushed a structural change into a backlog, and the fact
    # multiset saw nothing because no fact moved.
    #
    # A bolded opener on a LIST ITEM that repeats three or more times verbatim is
    # a taxonomy. Slop is varied invented emphasis, never the same label forty
    # times. Paragraph-level bold openers still all count, and a bullet label
    # used once or twice still counts, so the escape needs an actual convention
    # rather than a bolded phrase.
    bold_open = re.compile(r'^[-*]?\s*\*\*([^*]{1,40})\*\*')
    bullet_labels = collections.Counter(
        m.group(1) for p in paras
        if p.lstrip().startswith(('-', '*')) and (m := bold_open.match(p)))
    taxonomy = {k for k, n in bullet_labels.items() if n >= 3}
    def is_leadin(p):
        m = bold_open.match(p)
        if not m:
            return bool(re.match(r'^[-*]?\s*\*\*', p))
        if p.lstrip().startswith(('-', '*')) and m.group(1) in taxonomy:
            return False
        return True
    lead = sum(1 for p in paras if is_leadin(p))
    lead_per_sec = lead / sections
    tri = len(re.findall(r'\b\w+, \w+ and \w+\b|\b\w+, \w+, and \w+\b', t))
    tri500 = tri * 500 / words
    notx = len(re.findall(NOTX, t, re.I))
    style500 = len(re.findall(STYLE, t, re.I)) * 500 / words
    sents = [s for s in re.split(r'(?<=[.!?])\s+', t) if len(s.split()) > 2]
    lens = [len(s.split()) for s in sents]
    burst = (statistics.pstdev(lens) / statistics.mean(lens)) if len(lens) > 3 else 1.0
    trans = sum(1 for p in paras if re.match(TRANSITION, p)) / max(len(paras), 1)

    name = path.rsplit('/', 1)[-1]
    fails = []
    if em1k > EMDASH_PER_1K:
        fails.append(f'em-dashes {em1k:.1f}/1k words, over {EMDASH_PER_1K} '
                     f'(the human corpus tops out at 10.1)')
    is_prompt = any(d in path for d in PROMPT_DIRS)
    if lead_per_sec > BOLD_LEADIN_PER_SECTION and not is_prompt:
        fails.append(f'{lead} paragraphs open on a bolded lead-in across {sections} '
                     f'sections = {lead_per_sec:.1f} each, over {BOLD_LEADIN_PER_SECTION}')
    warns = []
    if tri500 > TRICOLON_PER_500: warns.append(f'tricolons {tri500:.1f}/500w')
    if notx >= NOTX_BUTY:         warns.append(f'"not just X but Y" x{notx}')
    if style500 > STYLE_PER_500:  warns.append(f'style words {style500:.1f}/500w')
    if burst < BURSTINESS_MIN:    warns.append(f'burstiness {burst:.2f} (flat sentences)')
    if trans > TRANSITION_FRAC:   warns.append(f'{trans:.0%} paragraphs open on a transition')

    rows.append((name, words, em1k, lead_per_sec, burst, style500, fails, warns))
    for f in fails:
        print(f'  SLOP SIGNAL   {name}: {f}')
        bad += 1
    for w in warns:
        print(f'  note          {name}: {w}')

print()
print(f"  {'file':<28} {'words':>6} {'em/1k':>7} {'bold/sec':>9} {'burst':>6} {'style/500':>10}")
for name, words, em1k, lead, burst, style500, *_ in rows:
    print(f'  {name:<28} {words:>6} {em1k:>7.1f} {lead:>9.1f} {burst:>6.2f} {style500:>10.1f}')
print()
if bad:
    print(f'{bad} signal(s) over threshold in text a stranger reads before deciding.')
    print('These are the two a reader sees without reading. Neither is about truth;')
    print('both are about whether the truth gets read. Detectors do not work on')
    print('technical prose, so this is craft, not a scanner to pass.')
    raise SystemExit(1)
print(f'{len(rows)}/{len(rows)} user-facing documents inside the style thresholds.')
PY
