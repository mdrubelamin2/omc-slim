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
  # Only what a stranger reads before deciding: the README, the CHANGELOG, the
  # native-parity position, the assessment, the readiness check and the pitch.
  #
  # The research reports — RESEARCH-2026-08-26, both VIABILITY passes, COMPRESSION,
  # AUDIT — stay out of scope. They are lab notebooks, not a pitch, and holding a
  # notebook to a landing page's standard is how a gate gets ignored. The line is
  # whether a document argues a conclusion to a reader, or records what happened
  # for the next maintainer.
  FILES=("$ROOT/README.md" "$ROOT/CHANGELOG.md" "$ROOT/docs/NATIVE.md"
         "$ROOT/docs/ASSESSMENT-2026-08-29.md" "$ROOT/docs/RELEASE-READINESS.md"
         "$ROOT/docs/DISTRIBUTION-DRAFT.md" "$ROOT/docs/QUALITY-BAR.md")
fi

python3 - "${FILES[@]}" <<'PY'
import re, sys, statistics

# Sourced thresholds
EMDASH_PER_1K   = 10.0   # human corpus 3.7-10.13/1k; GPT-4.1 measured 10.62/1k
TRICOLON_PER_500 = 2.5   # slopdetector: >1 polished triplet per 200 words
NOTX_BUTY        = 3     # slopdetector: 3+ in one article is a template
STYLE_PER_500    = 3.0   # slopdetector flag line
BURSTINESS_MIN   = 0.4   # human 0.6-1.2, model 0.2-0.4 (GPTZero methodology)
TRANSITION_FRAC  = 0.5   # >half of paragraphs opening on a formal transition
# Derived here, not published. Every source names the pattern; none numbers it.
BOLD_LEADIN_PER_SECTION = 1.5

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
    t = re.sub(r'^```.*?^```', '', t, flags=re.M | re.S)   # fenced code
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
    lead = sum(1 for p in paras if re.match(r'^[-*]?\s*\*\*', p))
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
                     f'(measured GPT-4.1 output is 10.6; human corpus tops out at 10.1)')
    if lead_per_sec > BOLD_LEADIN_PER_SECTION:
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
