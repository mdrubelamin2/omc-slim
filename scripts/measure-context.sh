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
#   ./scripts/measure-context.sh          # table
#   ./scripts/measure-context.sh --terse  # one number, for scripting
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TERSE=""
[ "${1:-}" = "--terse" ] && TERSE=1

# Body = everything after the closing --- of YAML frontmatter. A file with no
# frontmatter is counted whole rather than skipped, so a malformed header
# over-reports instead of silently reporting zero.
body_chars() {
  awk 'BEGIN{n=0} /^---[[:space:]]*$/{n++; if(n<=2) next} n>=2{print}' "$1" | wc -c | tr -d ' '
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

skill_c=0; skill_n=0
for f in "$ROOT"/skills/*/SKILL.md; do
  [ -e "$f" ] || continue
  skill_c=$(( skill_c + $(desc_chars "$f") )); skill_n=$(( skill_n + 1 ))
done

total_c=$(( style_c + agent_c + skill_c ))

if [ -n "$TERSE" ]; then
  tok "$total_c"
  exit 0
fi

version=$(awk -F'"' '/"version"/{print $4; exit}' "$ROOT/.claude-plugin/plugin.json" 2>/dev/null)

printf 'omc-slim static context — v%s\n\n' "${version:-unknown}"
printf '  %-34s %8s  %10s\n' "component" "chars" "~tokens"
printf '  %-34s %8s  %10s\n' "---------" "-----" "-------"
printf '  %-34s %8d  %10d\n' "output style body"            "$style_c" "$(tok $style_c)"
printf '  %-34s %8d  %10d\n' "$agent_n agent descriptions"  "$agent_c" "$(tok $agent_c)"
printf '  %-34s %8d  %10d\n' "$skill_n skill descriptions"  "$skill_c" "$(tok $skill_c)"
printf '  %-34s %8s  %10s\n' "" "--------" "----------"
printf '  %-34s %8d  %10d\n' "static context"               "$total_c" "$(tok $total_c)"
printf '\n'
printf 'Paid on every request. Agent and skill bodies and hooks\n'
printf 'are excluded — none of them load until something invokes them.\n\n'
printf 'Accuracy: chars/4 is the original hand method (RESEARCH.md:200), kept so\n'
printf 'the version series stays comparable. It runs roughly 5-15%% high on dense\n'
printf 'English prose against a real BPE tokeniser, and docs/AUDIT-2026-08-25.md\n'
printf 'measured this repository at +13.5%% against tiktoken. So the honest read of\n'
printf 'the total above is ~%d tokens, not %d.\n\n' "$(( total_c * 250 / 1135 ))" "$(tok $total_c)"
printf 'Use it to track change between versions, not as an absolute budget.\n\n'
printf 'It will not match `claude plugin details omc-slim`, and neither number is\n'
printf 'wrong. That command counts agent and skill descriptions and states that it\n'
printf 'excludes hooks and MCP; it does not count the output style at all, which is\n'
printf 'the largest single item here. Quote both bases or neither.\n'
