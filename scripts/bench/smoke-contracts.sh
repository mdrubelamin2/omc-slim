#!/usr/bin/env bash
# Behavioural contract smoke test for the agents and skills in THIS working tree.
#
# Why this exists. Every other check in this repository is structural:
# check-coverage proves a rule's phrase is present, check-reinforcement proves it
# still sits beside its reasoning, check-shell lints, plugin validate parses.
# None of them can tell you whether a restructured prompt still BEHAVES the same.
# Two defects shipped past all of them in one session — a resident mutant in
# hooks/verify-deliverables.mjs, and six agents whose frontmatter failed to parse
# so disallowedTools was silently dropped. Structural green is not behaviour.
#
# Why it needs --plugin-dir. Agents and skills load from the INSTALLED plugin
# cache (~/.claude/plugins/cache/...), never from the working tree. Dispatching a
# subagent from inside a session therefore tests the last released version, not
# your edits. `claude -p --plugin-dir "$ROOT"` is the only way to exercise what
# is actually on disk here. Same mechanism as run-arm.sh:101-104.
#
# This is a CONTRACT test, not a benchmark. It asks "does this agent still refuse
# what it must refuse and return the shape it promised", not "is it better".
# For cost and quality use scripts/bench/run-arm.sh.
#
#   ./scripts/bench/smoke-contracts.sh            # dry run, prints the calls
#   ./scripts/bench/smoke-contracts.sh --execute  # spends real money
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
EXECUTE=""
[ "${1:-}" = "--execute" ] && EXECUTE=1

command -v claude >/dev/null 2>&1 || { echo "claude not on PATH"; exit 1; }

# Each case: name, the agent it must reach, the prompt, and a check over stdout.
# The check is a function name; it receives the response text on stdin and
# returns non-zero with a reason on failure. A case that cannot fail proves
# nothing, so every check asserts something the restructure could have broken.

# explorer: hard 150-line cap, file:line map, and it must refuse to advise.
check_explorer() {
  local out; out="$(cat)"
  local lines; lines=$(printf '%s\n' "$out" | wc -l | tr -d ' ')
  printf '%s' "$out" | grep -qE '[A-Za-z0-9_./-]+\.(mjs|sh|md|json):[0-9]+' \
    || { echo "no file:line citation in output"; return 1; }
  [ "$lines" -le 170 ] || { echo "output $lines lines; contract caps the map at 150"; return 1; }
  printf '%s' "$out" | grep -qiE 'you should (fix|change|refactor)|i recommend (fixing|changing)|next step' \
    && { echo "proposed a fix; explorer must refuse to"; return 1; }
  return 0
}

# oracle: advises, never implements, and must not have written anything.
check_oracle() {
  local out; out="$(cat)"
  printf '%s' "$out" | grep -qiE 'i (have )?(edited|updated|wrote|created|applied)' \
    && { echo "claims to have written; oracle is read-only"; return 1; }
  [ -n "$out" ] || { echo "empty response"; return 1; }
  return 0
}

# librarian: an external claim must arrive with a source, never recalled.
check_librarian() {
  local out; out="$(cat)"
  printf '%s' "$out" | grep -qE 'https?://' \
    || { echo "no source URL; librarian must cite, never recall"; return 1; }
  return 0
}

# Sourcing this file defines the checkers and runs nothing, so they can be tested
# against known-bad input. A checker that cannot fail proves nothing, which is
# the same trap REINFORCEMENT.tsv exists to avoid one directory over.
if [ "${BASH_SOURCE[0]}" != "${0}" ]; then
  return 0 2>/dev/null || true
fi

CASES=(
  "explorer|check_explorer|Use the omc-slim explorer agent. Where is the transcript size cap defined and enforced in this repository's hook?"
  "oracle|check_oracle|Use the omc-slim oracle agent. Is shelling out to a destructive-then-restore mutation suite from inside a routine repository checker the right design here?"
  "librarian|check_librarian|Use the omc-slim librarian agent. Is when_to_use a currently supported Claude Code skill frontmatter field, and when is its text loaded?"
)

echo "plugin dir : $ROOT"
if [ -n "$EXECUTE" ]; then echo "mode       : EXECUTE (spends money)"; else echo "mode       : dry run"; fi
echo

pass=0; fail=0; total_cost="0"
for spec in "${CASES[@]}"; do
  IFS='|' read -r name checker prompt <<<"$spec"
  argv=(claude -p "$prompt" --plugin-dir "$ROOT" --setting-sources "project" --output-format json --max-turns 12)

  if [ -z "$EXECUTE" ]; then
    printf '  %-12s %s\n' "$name" "${argv[*]}"
    continue
  fi

  printf '  %-12s ' "$name"
  envelope="$("${argv[@]}" 2>/dev/null)"
  if [ -z "$envelope" ]; then
    echo "FAIL  (no response)"; fail=$((fail + 1)); continue
  fi

  # Two assertions, both required. The contract check alone is vacuous: the main
  # thread can cite file:line, include a URL and avoid claiming a write entirely
  # on its own, so a green contract proves nothing about the agent. subagent_stats
  # is the harness's own count, so it cannot be talked into a number.
  read -r spawned kinds cost < <(printf '%s' "$envelope" | python3 -c '
import json, sys
d = json.load(sys.stdin)
st = d.get("subagent_stats") or {}
by = st.get("by_type") or {}
kinds = ",".join(sorted(by)) or "-"
print(st.get("spawned", 0), kinds, round(d.get("total_cost_usd") or 0, 4))
')
  response="$(printf '%s' "$envelope" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("result") or "")')"

  if [ "${spawned:-0}" -lt 1 ]; then
    echo "FAIL  no subagent spawned; the main thread answered, so nothing was tested"
    fail=$((fail + 1)); continue
  fi
  case ",$kinds," in
    *",$name,"*|*"omc-slim:$name"*) : ;;
    *) echo "FAIL  spawned [$kinds], expected $name"; fail=$((fail + 1)); continue ;;
  esac

  if reason="$(printf '%s' "$response" | "$checker")"; then
    echo "PASS  (agent ran, contract held, \$$cost)"; pass=$((pass + 1))
  else
    echo "FAIL  $reason"; fail=$((fail + 1))
  fi
  total_cost="$total_cost + $cost"
done

if [ -z "$EXECUTE" ]; then
  echo
  echo "Dry run. Re-run with --execute to actually spend."
  echo "Each case is one claude -p call against the working tree."
  exit 0
fi

echo
echo "$pass passed, $fail failed.  total cost: \$$(python3 -c "print(round($total_cost, 4))")"
[ "$fail" -eq 0 ] || exit 1
