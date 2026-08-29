#!/usr/bin/env bash
# Measure the plugin's static context cost — what every request pays before any
# work starts.
#
# This exists because the figures in README.md drifted across twenty releases.
# They were measured by hand, so nothing caught them going stale, and by v0.8.1
# the README quoted two different totals in one file. A number nothing can
# re-derive is a number that rots.
#
# Method: chars ÷ 4, matching the original hand measurement in RESEARCH.md:200
# so the series stays comparable. That ratio is an approximation, not a
# tokeniser — see "Accuracy" below.
#
# Counted, because all three load on every request:
#   - the output style BODY (frontmatter is config, not prompt)
#   - each agent's `description` (the roster the router reads)
#   - each skill's `description` (likewise)
#
# Not counted, because none of it is static:
#   - agent and skill BODIES, loaded only when that specialist runs
#   - hooks/*, which run out of process and inject nothing
#
#   ./scripts/measure-context.sh              # table
#   ./scripts/measure-context.sh --terse      # chars/4 static total, for scripting
#   ./scripts/measure-context.sh --terse-real # real-tokeniser static total
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TERSE=""
REAL=""
[ "${1:-}" = "--terse" ] && TERSE=1
[ "${1:-}" = "--terse-real" ] && REAL=1

# Count real BPE tokens over the concatenation of whatever is piped in.
#
# The chars/4 basis is kept because the version series is measured on it, but it
# is an estimate and it was believed with a hard-coded correction: chars/4 ÷ 1.135,
# a whole-estate average taken once in the 2026-08-25 audit. That average does not
# hold per file. Measured 2026-08-29, it read `review/SKILL.md` as 4,956 tokens
# against a 5,000 cap — 44 under — while the real count was 5,298, nearly 300 OVER.
# A gate that guards a cap must not estimate the thing it guards.
#
# Prints an integer, or nothing when no tokeniser is installed. Callers that need
# the number treat empty as "cannot tell" and say so; they never fall back to the
# estimate and call it measured.
real_tokens() {
  python3 - "$@" 2>/dev/null <<'RTPY'
import sys
try:
    import tiktoken
except ImportError:
    raise SystemExit(1)
enc = tiktoken.get_encoding("cl100k_base")
print(sum(len(enc.encode(open(p, encoding="utf-8").read())) for p in sys.argv[1:]))
RTPY
}

# The static surface as one string, so it is tokenised the way the model sees it
# rather than summed per fragment — BPE is not additive across concatenation.
static_real() {
  python3 - "$ROOT" 2>/dev/null <<'SRPY'
import glob, os, re, sys
try:
    import tiktoken
except ImportError:
    raise SystemExit(1)
root = sys.argv[1]

def body(p):
    t = open(p, encoding="utf-8").read()
    if t.startswith("---"):
        i = t.find("\n---", 3)
        if i != -1:
            return t[i + 4:].lstrip("\n")
    return t

def descs(p):
    out, inblock = [], False
    for ln in open(p, encoding="utf-8").read().split("\n"):
        if re.match(r'^(description|when_to_use):\s*[>|]\s*$', ln):
            inblock = True; continue
        m = re.match(r'^(description|when_to_use):\s*(.*)$', ln)
        if m and not inblock:
            out.append(m.group(2)); continue
        if inblock and re.match(r'^\s+\S', ln):
            out.append(ln.strip()); continue
        inblock = False
    return "\n".join(out)

parts = [body(os.path.join(root, 'output-styles/omc-slim.md'))]
parts += [descs(f) for f in sorted(glob.glob(os.path.join(root, 'agents/*.md')))]
for f in sorted(glob.glob(os.path.join(root, 'skills/*/SKILL.md'))):
    if re.search(r'^disable-model-invocation:\s*(true|yes|on|1)\s*$',
                 open(f, encoding="utf-8").read(), re.M):
        continue
    parts.append(descs(f))
print(len(tiktoken.get_encoding("cl100k_base").encode("\n".join(parts))))
SRPY
}

# Body = everything after the closing --- of YAML frontmatter. A file with no
# frontmatter is counted WHOLE rather than skipped, so a malformed header
# over-reports instead of silently reporting zero.
#
# That was the documented intent and not the behaviour: the old one-liner only
# emitted lines after seeing two `---` delimiters, so any file without
# frontmatter measured 0. Every SKILL.md and agent has frontmatter, so nothing
# in the published figures was ever wrong — but it meant sibling files could
# never be counted, and the moment v0.9.0 tried to count one it silently
# reported nothing. Frontmatter is now required to START the file, which is the
# only place a YAML header is valid anyway.
body_chars() {
  if [ "$(head -n 1 "$1")" = "---" ]; then
    awk 'NR==1{next} /^---[[:space:]]*$/ && !seen {seen=1; next} seen{print}' "$1" | wc -c | tr -d ' '
  else
    wc -c < "$1" | tr -d ' '
  fi
}

# The `description:` value, whether written inline or as a `>` block scalar.
# Both forms are in use across agents/ and skills/, and counting only the inline
# form would silently score every block-scalar agent as ~0.
#
# Leading indent is stripped because YAML folds it away — the model never sees
# it. Left in, it over-reported by ~25 tokens across the roster.
#
# `when_to_use` is counted with `description` because the harness appends it to
# the description in the skill listing, so it is loaded on every request just the
# same. Counting only `description` under-reported the skill roster by 1,308
# chars (~327 tokens) the day `when_to_use` was introduced — a published figure
# that omits an always-on field is the understatement this script exists to stop.
desc_chars() {
  awk '
    /^(description|when_to_use):[[:space:]]*[>|]/ { inblock=1; next }
    /^(description|when_to_use):/ { sub(/^(description|when_to_use):[[:space:]]*/,""); print; next }
    inblock && /^[[:space:]]+[^[:space:]]/ { sub(/^[[:space:]]+/,""); print; next }
    inblock                         { inblock=0 }
  ' "$1" | wc -c | tr -d ' '
}

tok() { echo $(( $1 / 4 )); }

style_c=$(body_chars "$ROOT/output-styles/omc-slim.md")

agent_c=0; agent_n=0
for f in "$ROOT"/agents/*.md; do
  [ -e "$f" ] || continue
  agent_c=$(( agent_c + $(desc_chars "$f") )); agent_n=$(( agent_n + 1 ))
done

# A skill with `disable-model-invocation: true` is removed from the model's
# context entirely, not merely hidden from the slash menu — so its description
# costs nothing until someone types its name. Counting it would overstate the
# figure this script exists to keep honest.
skill_c=0; skill_n=0; skill_manual=0
for f in "$ROOT"/skills/*/SKILL.md; do
  [ -e "$f" ] || continue
  if grep -qE '^disable-model-invocation:[[:space:]]*(true|yes|on|1)[[:space:]]*$' "$f"; then
    skill_manual=$(( skill_manual + 1 )); continue
  fi
  skill_c=$(( skill_c + $(desc_chars "$f") )); skill_n=$(( skill_n + 1 ))
done

total_c=$(( style_c + agent_c + skill_c ))

if [ -n "$TERSE" ]; then
  tok "$total_c"
  exit 0
fi

if [ -n "$REAL" ]; then
  measured=$(static_real)
  [ -n "$measured" ] || exit 1
  echo "$measured"
  exit 0
fi

version=$(awk -F'"' '/"version"/{print $4; exit}' "$ROOT/.claude-plugin/plugin.json" 2>/dev/null)

printf 'omc-slim static context — v%s\n\n' "${version:-unknown}"
printf '  %-34s %8s  %10s\n' "component" "chars" "~tokens"
printf '  %-34s %8s  %10s\n' "---------" "-----" "-------"
printf '  %-34s %8d  %10d\n' "output style body"            "$style_c" "$(tok $style_c)"
printf '  %-34s %8d  %10d\n' "$agent_n agent descriptions"  "$agent_c" "$(tok $agent_c)"
printf '  %-34s %8d  %10d\n' "$skill_n skill descriptions"  "$skill_c" "$(tok $skill_c)"
[ "$skill_manual" -gt 0 ] && printf '  %-34s %8s  %10s\n' \
  "($skill_manual manual-only, not in context)" "—" "—"
printf '  %-34s %8s  %10s\n' "" "--------" "----------"
printf '  %-34s %8d  %10d\n' "static context"               "$total_c" "$(tok $total_c)"
printf '\n'
printf 'Paid on every request. Agent and skill bodies and hooks\n'
printf 'are excluded — none of them load until something invokes them.\n\n'

# On-invoke cost. Excluded from the total above because none of it is static —
# and tracked here anyway, because "not static" is not "free". This is where the
# cost actually lives in comparable plugins: one documented case spent 68M tokens
# on ~3,000 lines of code, and none of that was startup context. A plugin with a
# disciplined static figure and an unmeasured body has moved the problem, not
# solved it. v0.9.x added ~7,377 tokens here across two releases; that is visible now.
printf '  on-invoke — paid each time that component fires\n'
printf '  %-34s %8s  %10s\n' "component" "chars" "~tokens"
printf '  %-34s %8s  %10s\n' "---------" "-----" "-------"
# Sibling files count too, and only the ones the skill reads unconditionally.
# review/checklists.md is mandatory — "Read checklists.md now, before judging
# anything" — so a figure that omits it understates every review by ~1,900
# tokens, which it silently did until v0.9.0. The conditional siblings
# (performance.md, depth.md, principles.md) are listed below the total and
# excluded from it, because a file you open on one run in five is not a cost you
# pay on every run.
mandatory_sibling() {
  case "$1" in review) echo "$ROOT/skills/review/checklists.md" ;; *) echo "" ;; esac
}

invoke_c=0
for f in "$ROOT"/agents/*.md "$ROOT"/skills/*/SKILL.md; do
  [ -e "$f" ] || continue
  c=$(body_chars "$f")
  n=$(basename "$(dirname "$f")")
  case "$n" in agents) n=$(basename "$f" .md) ;; esac
  sib=$(mandatory_sibling "$n")
  if [ -n "$sib" ] && [ -f "$sib" ]; then
    c=$(( c + $(body_chars "$sib") ))
    n="$n + checklists"
  fi
  invoke_c=$(( invoke_c + c ))
  printf '  %-34s %8d  %10d\n' "$n" "$c" "$(tok "$c")"
done
printf '  %-34s %8s  %10s\n' "" "--------" "----------"
printf '  %-34s %8d  %10d\n' "all twelve, if every one fires" "$invoke_c" "$(tok $invoke_c)"
printf '\n'
printf 'That total is the ceiling, not a typical session: it assumes every\n'
printf 'component fires once. One skill and one agent is the common case.\n\n'

printf '  conditional siblings — excluded above, opened only when they apply\n'
for sib in "$ROOT"/skills/review/performance.md \
           "$ROOT"/skills/deepwork/depth.md \
           "$ROOT"/skills/simplify/principles.md \
           "$ROOT"/skills/verification-planning/procedure.md; do
  [ -f "$sib" ] || continue
  c=$(body_chars "$sib")
  printf '  %-34s %8d  %10d\n' "$(basename "$(dirname "$sib")")/$(basename "$sib")" "$c" "$(tok "$c")"
done
printf '\n'
printf 'Accuracy: chars/4 is the original hand method (RESEARCH.md:200), kept so\n'
printf 'the version series stays comparable. It is an estimate and it runs high.\n'
static_measured=$(static_real)
if [ -n "$static_measured" ]; then
  printf 'Measured against cl100k on THIS build: the static surface is %d real\n' "$static_measured"
  printf 'tokens against %d on the chars/4 basis — the estimate runs %d%% high.\n' \
    "$(tok $total_c)" "$(( ( (total_c / 4) - static_measured ) * 100 / static_measured ))"
  printf 'That percentage is re-derived here every run. It was a hard-coded 13.5%%\n'
  printf 'until 2026-08-29, taken as one whole-estate average in the 2026-08-25\n'
  printf 'audit — and a single average does not hold per file. Applied to\n'
  printf 'review/SKILL.md it under-read a 298-token cap overrun as a 44-token\n'
  printf 'margin. Estimate to track versions; measure before trusting a cap.\n\n'
else
  printf 'No tokeniser installed, so the corrected figure is UNAVAILABLE — not\n'
  printf 'estimated. `pip install tiktoken` to get it. Publishing a corrected\n'
  printf 'number derived from a constant is how the last one went wrong.\n\n'
fi
printf 'It will not match `claude plugin details omc-slim`, and neither number is\n'
printf 'wrong. That command counts agent and skill descriptions and states that it\n'
printf 'excludes hooks and MCP; it does not count the output style at all, which is\n'
printf 'the largest single item here. Quote both bases or neither.\n'
