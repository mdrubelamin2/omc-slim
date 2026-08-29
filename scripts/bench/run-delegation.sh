#!/usr/bin/env bash
# The multi-file delegation benchmark — docs/INSTRUMENTS-R4.md §1, the
# instrument exit criterion 1 needs. THIS SPENDS REAL MONEY. Dry run by
# default; --execute is required to spend, exactly as run-arm.sh is.
#
# What this measures that run-arm.sh cannot. run-arm.sh runs a single-file
# greenfield prompt. That task has no independent sub-units, so there is
# nothing to fan out to, and all nine committed runs delegated zero times —
# a property of the task, not a finding about the plugin. This runs the
# four-adapter refund task instead (scripts/bench/make-refund-fixture.sh),
# which has four genuinely independent units behind one shared interface.
#
# Isolation is run-arm.sh's, unchanged, and is NOT re-derived here. From that
# file's header, kept because both approaches look right and are not:
#   - CLAUDE_CONFIG_DIR at a fresh directory fails: auth lives in the macOS
#     Keychain, not the config directory.
#   - --bare fails for the opposite reason: it explicitly skips keychain reads.
# What works is `--setting-sources "project"` on ALL arms, identically.
#
# The arms:
#   plain                 empty flags beyond the shared set.
#   omc-slim              + --plugin-dir <this repo>.
#   omc-slim-nodelegate   + --plugin-dir, and the Agent tool DENIED at the top
#                         level. This is the arm that settles the question. If
#                         it matches the full arm, the win is the prompt and
#                         not the routing — a publishable negative result, and
#                         the thing the previous benchmark could not determine.
#
# Agent and Task are in --allowedTools for EVERY arm. That is deliberate and
# load-bearing: run-arm.sh's allow-list omits them, and MAINTAINERS.md records
# that in -p mode a tool outside the allow-list stops the run at a permission
# prompt with no TTY to answer it. Had this benchmark inherited that list, an
# arm's zero-delegation result would have been caused by the harness and read
# as a finding about the plugin.
#
#   ./scripts/bench/run-delegation.sh                                  # dry run, full design
#   ./scripts/bench/run-delegation.sh --arms omc-slim --n 3            # dry run, cheap slice
#   ./scripts/bench/run-delegation.sh --arms omc-slim --n 3 --execute  # ~$9.13
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

ALL_ARMS="plain omc-slim omc-slim-nodelegate"
DEFAULT_N=5

# The control: identical, verbatim, for every arm. It is the specification as
# well as the prompt — the held-out fixture asserts this contract exactly, and
# a contract stated only in the grader would be measuring whether an arm can
# guess rather than whether it can execute. How each provider must be handled
# is NOT stated: that is the work, and the four providers disagree.
PROMPT="This repository is a payments integration layer. Four provider adapters (stripe, paypal, adyen, braintree) each implement charge(amount, currency, idempotency_key) against a different provider API, and every adapter writes through the one shared ledger module.

Add refund(charge_id, amount) to all four adapters and to the ledger.

The contract:
- Partial refunds must work. Refunding less than the charged amount is valid and the remaining refundable balance must stay correct.
- Refunding more than the charge has left must raise payments.types.RefundTooLarge and must leave both the provider and the ledger unchanged.
- refund is idempotent on (charge_id, amount): calling it twice with the same arguments must not refund twice at the provider and must not write a second ledger entry.
- A refund returns a payments.types.Refund whose status is \"succeeded\".
- The ledger records each refund as exactly one reversing entry, written inside the caller's transaction, whose reverses_id points at the original charge entry.

Amounts are integer minor units throughout the public interface. The four provider APIs do not agree on units, on how failure is reported, or on whether a refund is synchronous — read each mock before writing its adapter. Do not change the charge path: python3 smoke.py must still pass."

# Agent and Task both appear because the dispatch tool has been named both
# across CLI versions; 2.1.251 calls it Agent. Naming only the current one
# would silently re-introduce the allow-list confound on an older or newer CLI.
ALLOWED_TOOLS="Read Write Edit Bash Glob Grep Agent Task"

# The tool denied in the nodelegate arm, and the only flag that differs between
# it and the full omc-slim arm.
DENIED_TOOLS="Agent Task"

# Comfortably above every turn count a real run has used (run-arm.sh's plain
# 15, omc-slim 12) scaled for a task roughly 3x larger. Set rather than
# omitted so the capped:true bookkeeping below is reachable at all; MAINTAINERS.md
# records three false negatives from turn caps set too low.
MAX_TURNS=300

# 1 hour. The heaviest arm in this comparison historically took 259s on the
# single-file task; at 3x that is ~780s, so this is better than 4x headroom —
# a runaway guard, not a routine constraint.
WALL_CLOCK_LIMIT_SECS=3600

# Per-run ceiling. docs/INSTRUMENTS-R4.md §1 says to set one. Roughly 2.6x the
# per-run estimate below, so it stops a runaway without truncating a normal run
# and reporting the truncation as a cheap arm.
MAX_BUDGET_USD=8.00

# Per-run cost estimates in MILLS (thousandths of a dollar), from
# docs/BENCHMARK.md's measured means on the single-file task ($1.2367 plain,
# $1.0146 omc-slim) scaled 3x, as docs/INSTRUMENTS-R4.md §1 budgets ("a task
# roughly 3x larger", $45-60 for 15 runs). nodelegate carries omc-slim's
# figure: same prompt, one fewer tool.
#
# Mills rather than cents because bash has no floats and cents truncate: at
# whole cents the full design estimates $48.95 against §1's own $48.99, and an
# estimate that quietly disagrees with the document it cites invites the reader
# to trust the wrong one.
COST_MILLS_plain=3710
COST_MILLS_omc_slim=3044
COST_MILLS_omc_slim_nodelegate=3044

# Keep ambient tone plugins out, as run-arm.sh does (MAINTAINERS.md, "Testing
# tone is contamination-prone").
export CAVEMAN_DEFAULT_MODE=off
export PONYTAIL_DEFAULT_MODE=off

# --- arguments ---------------------------------------------------------------

ARMS=""
N="$DEFAULT_N"
OUTPUT_DIR=""
EXECUTE=false
# Set only on the --execute path; the dry run prints a placeholder instead,
# because building a fixture is a write and a dry run writes nothing.
FIXTURE_DIR=""

usage() {
  cat >&2 <<USAGE
usage: $(basename "$0") [--arms a,b,c] [--n N] [--out DIR] [--execute]

  --arms    comma-separated subset of: $ALL_ARMS
            (default: all three, the full docs/INSTRUMENTS-R4.md §1 design)
  --n       runs per arm (default: $DEFAULT_N)
  --out     output directory (default: a fresh timestamped directory under
            \${TMPDIR:-/tmp}, so nothing is written into the repository)
  --execute actually spend money. Without it this prints what it would do.

The recommended first run is the cheapest decisive slice:

  $(basename "$0") --arms omc-slim --n 3 --execute

It answers the question that blocks release — does the plugin delegate at all
on a task where delegation could pay — for about a fifth of the full design's
cost. Zero dispatches across those three runs makes the full comparison
unnecessary: the honest answer is already in hand.
USAGE
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --arms)    [ "$#" -ge 2 ] || { usage; exit 2; }; ARMS="$2"; shift 2 ;;
    --n)       [ "$#" -ge 2 ] || { usage; exit 2; }; N="$2"; shift 2 ;;
    --out)     [ "$#" -ge 2 ] || { usage; exit 2; }; OUTPUT_DIR="$2"; shift 2 ;;
    --execute) EXECUTE=true; shift ;;
    -h|--help) usage; exit 0 ;;
    *)         echo "error: unrecognized argument '$1'" >&2; usage; exit 2 ;;
  esac
done

if [ -z "$ARMS" ]; then
  SELECTED_ARMS="$ALL_ARMS"
else
  SELECTED_ARMS="$(printf '%s' "$ARMS" | tr ',' ' ')"
fi

for arm in $SELECTED_ARMS; do
  case " $ALL_ARMS " in
    *" $arm "*) ;;
    *) echo "error: unknown arm '$arm' — expected one of: $ALL_ARMS" >&2; exit 2 ;;
  esac
done

if ! [[ "$N" =~ ^[0-9]+$ ]] || [ "$N" -lt 1 ]; then
  echo "error: --n must be a positive integer — got '$N'" >&2
  exit 2
fi

if [ -z "$OUTPUT_DIR" ]; then
  OUTPUT_DIR="${TMPDIR:-/tmp}/omc-delegation-$(date +%Y%m%d-%H%M%S)"
fi

# --- cost estimate, printed before anything is spent -------------------------

cost_mills_for() {
  case "$1" in
    plain)               echo "$COST_MILLS_plain" ;;
    omc-slim)            echo "$COST_MILLS_omc_slim" ;;
    omc-slim-nodelegate) echo "$COST_MILLS_omc_slim_nodelegate" ;;
  esac
}

# Mills to a rounded dollar string. Rounds to cents FIRST so a carry out of the
# cents place lands in the dollars — 1996 mills is $2.00, not "$1.100".
print_dollars() {
  local mills="$1" cents
  cents=$(((mills + 5) / 10))
  printf '$%d.%02d' $((cents / 100)) $((cents % 100))
}

print_cost_estimate() {
  local arm per total=0 full=0
  echo "Estimated cost. Per-run figures are docs/BENCHMARK.md's measured means"
  echo "on the single-file task, scaled 3x per docs/INSTRUMENTS-R4.md §1."
  echo
  for arm in $SELECTED_ARMS; do
    per="$(cost_mills_for "$arm")"
    total=$((total + per * N))
    printf '  %-22s %d run(s) x %s = %s\n' \
      "$arm" "$N" "$(print_dollars "$per")" "$(print_dollars $((per * N)))"
  done
  for arm in $ALL_ARMS; do
    per="$(cost_mills_for "$arm")"
    full=$((full + per * 5))
  done
  echo
  printf '  THIS RUN:        %s   (per-run ceiling --max-budget-usd %s)\n' \
    "$(print_dollars "$total")" "$MAX_BUDGET_USD"
  printf '  FULL DESIGN:     %s   (all three arms, n=5)\n' "$(print_dollars "$full")"
  echo
}

# --- command construction ----------------------------------------------------
# Shared by the dry-run printer and the real invocation so the two cannot drift.
# That sharing is what makes the dry run trustworthy: a separately hand-written
# string would make "the flag set is identical across arms" a claim about the
# printer rather than about what runs.
CLAUDE_ARGV=()
build_claude_argv() {
  local arm="$1"
  CLAUDE_ARGV=(claude -p "$PROMPT"
    --setting-sources "project"
    --output-format stream-json --verbose
    --allowedTools "$ALLOWED_TOOLS"
    --max-turns "$MAX_TURNS"
    --max-budget-usd "$MAX_BUDGET_USD")
  case "$arm" in
    omc-slim)
      CLAUDE_ARGV+=(--plugin-dir "$ROOT")
      ;;
    omc-slim-nodelegate)
      CLAUDE_ARGV+=(--plugin-dir "$ROOT" --disallowedTools "$DENIED_TOOLS")
      ;;
    plain)
      : # no extra flags — that is the whole of this arm
      ;;
  esac
}

# --- execution helpers --------------------------------------------------------

# run-arm.sh's portable wall-clock ceiling, unchanged: stock macOS ships
# neither `timeout` nor `gtimeout`, so this backgrounds the command and races
# it against a sleeping watcher.
run_with_timeout() {
  local limit_secs="$1"; shift
  "$@" &
  local cmd_pid=$!
  ( sleep "$limit_secs"; kill -TERM "$cmd_pid" 2>/dev/null; sleep 5; kill -KILL "$cmd_pid" 2>/dev/null ) &
  local watcher_pid=$!
  local status=0
  wait "$cmd_pid" || status=$?
  kill "$watcher_pid" 2>/dev/null || true
  wait "$watcher_pid" 2>/dev/null || true
  return "$status"
}

count_files() {
  find "$1" -type f | wc -l | tr -d ' '
}

# --- the delegation detector --------------------------------------------------
#
# Reads the TRANSCRIPT, never modelUsage. Criterion 1 is explicit about this,
# and modelUsage is exactly where the previous benchmark went blind: it reports
# which models were billed, which cannot distinguish a subagent from the main
# thread reaching for a cheaper model.
#
# The transcript is the stream-json event stream this harness captured itself,
# rather than the session file under ~/.claude/projects. Two reasons, both
# load-bearing: the on-disk session file also carries sidechain entries for the
# subagents' own turns, which would inflate a top-level dispatch count; and a
# run killed by the wall-clock guard still leaves a usable partial stream here,
# where a whole-file JSON parse would leave nothing.
#
# Three numbers, never one:
#   attempted  a tool_use block naming Agent or Task.
#   returned   attempted, and a matching tool_result came back without
#              is_error. attempted-minus-returned is the gated-Agent-tool
#              signal, which is a different finding and one criterion 3 wants.
#   distinct   distinct subagent_type values among the RETURNED dispatches.
#              One lane four times is not fan-out.
parse_transcript() {
  python3 - "$1" <<'PY'
import json
import sys


def blank(count):
    # Empty means unknown, never zero. A fabricated 0 would claim "this run
    # cost nothing" or "this run delegated nothing", and only one of those is
    # ever true of a run that produced no parseable data.
    return "\t".join([""] * count)


attempted = {}
returned_ok = {}
result_frame = None
session_id = ""


def walk(node):
    if isinstance(node, dict):
        kind = node.get("type")
        if kind == "tool_use" and node.get("name") in ("Agent", "Task"):
            payload = node.get("input") or {}
            attempted[node.get("id")] = payload.get("subagent_type") or "(unnamed)"
        elif kind == "tool_result":
            tool_use_id = node.get("tool_use_id")
            if tool_use_id is not None:
                returned_ok[tool_use_id] = not bool(node.get("is_error"))
            # Deliberately not recursed into: a subagent's reply is arbitrary
            # content and may quote a tool_use block it did not make.
            return
        for value in node.values():
            walk(value)
    elif isinstance(node, list):
        for value in node:
            walk(value)


try:
    with open(sys.argv[1]) as handle:
        lines = handle.readlines()
except OSError:
    print(blank(11))
    sys.exit(0)

for line in lines:
    line = line.strip()
    if not line:
        continue
    try:
        frame = json.loads(line)
    except ValueError:
        # A truncated final line is expected when the wall-clock guard fires.
        continue
    if isinstance(frame, dict):
        if frame.get("type") == "result":
            result_frame = frame
        if not session_id and frame.get("session_id"):
            session_id = frame["session_id"]
    walk(frame)

returned = [tid for tid in attempted if returned_ok.get(tid)]
distinct = sorted({attempted[tid] for tid in returned})

if result_frame is None:
    cost = turns = duration = out_tokens = ""
    capped = "false"
    is_error = ""
else:
    usage = result_frame.get("usage") or {}
    def value(raw):
        return "" if raw is None else str(raw)
    cost = value(result_frame.get("total_cost_usd"))
    turns = value(result_frame.get("num_turns"))
    duration = value(result_frame.get("duration_ms"))
    out_tokens = value(usage.get("output_tokens"))
    # "error_max_turns" is what -p --output-format json/stream-json emits on a
    # turns cap; run-arm.sh verified the literal against the installed binary.
    capped = "true" if result_frame.get("subtype") == "error_max_turns" else "false"
    is_error = "true" if result_frame.get("is_error") else "false"

print("\t".join([
    cost, turns, duration, out_tokens, capped, is_error,
    str(len(attempted)), str(len(returned)), str(len(distinct)),
    ",".join(distinct) or "-",
    session_id,
]))
PY
}

read_grade() {
  python3 - "$1" <<'PY'
import json
import sys

with open(sys.argv[1]) as handle:
    report = json.load(handle)
print("\t".join([str(report["executed"]), str(report["passed"]), report["verdict"]]))
PY
}

# --- one run ------------------------------------------------------------------
# Bookkeeping lives OUTSIDE the working directory the arm writes into. The
# working directory is graded, so a transcript or a stderr log sitting in it
# would be counted as a file the arm produced and would be on sys.path when
# the held-out suite imports the candidate's package.
run_one() {
  local arm="$1" run_root="$2" idx="$3" summary_tsv="$4"

  local workdir="$run_root/workdir"
  mkdir -p "$workdir"
  cp -R "$FIXTURE_DIR/repo/." "$workdir/"
  local baseline_files
  baseline_files="$(count_files "$workdir")"

  build_claude_argv "$arm"

  local status=0
  ( cd "$workdir" && run_with_timeout "$WALL_CLOCK_LIMIT_SECS" "${CLAUDE_ARGV[@]}" ) \
    </dev/null >"$run_root/transcript.jsonl" 2>"$run_root/stderr.log" || status=$?

  if [ "$status" -eq 143 ] || [ "$status" -eq 137 ]; then
    echo "WARNING: [$arm] run $idx exceeded the ${WALL_CLOCK_LIMIT_SECS}s wall-clock guard and was killed — the partial transcript is still parsed; see $run_root/stderr.log" >&2
  fi

  local post_files files_produced
  post_files="$(count_files "$workdir")"
  files_produced=$((post_files - baseline_files))

  local parsed cost turns duration out_tok capped is_error attempted returned distinct types session
  parsed="$(parse_transcript "$run_root/transcript.jsonl")"
  IFS=$'\t' read -r cost turns duration out_tok capped is_error attempted returned distinct types session <<<"$parsed"

  if [ -z "$cost" ]; then
    echo "WARNING: [$arm] run $idx produced no final result frame — cost recorded as excluded; inspect $run_root/transcript.jsonl and $run_root/stderr.log" >&2
  elif [ "$is_error" = "true" ] && [ "$capped" = "false" ]; then
    echo "WARNING: [$arm] run $idx completed with is_error=true (not a turns cap) — cost is still recorded and averaged in; inspect $run_root/transcript.jsonl" >&2
  fi

  # Correctness is the held-out fixture, run against what the arm left behind.
  local grade_json="$run_root/grade.json" executed=0 passed=0 verdict="UNPROVEN" graded
  "$ROOT/scripts/bench/grade-refunds.sh" "$FIXTURE_DIR" "$workdir" --json "$grade_json" \
    > "$run_root/grade.log" 2>&1 || true
  if [ -f "$grade_json" ]; then
    graded="$(read_grade "$grade_json")"
    IFS=$'\t' read -r executed passed verdict <<<"$graded"
    if [ "$executed" -eq 0 ]; then
      echo "WARNING: [$arm] run $idx: 0 of 20 fixture cases executed — that is UNPROVEN, not a zero score" >&2
    fi
  else
    echo "WARNING: [$arm] run $idx could not be graded at all — see $run_root/grade.log" >&2
  fi

  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' \
    "$idx" "$cost" "$turns" "$duration" "$out_tok" "$capped" "$is_error" \
    "$attempted" "$returned" "$distinct" "$types" \
    "$executed" "$passed" "$verdict" "$files_produced" "$session" >> "$summary_tsv"
}

# --- dry run -------------------------------------------------------------

print_dry_run() {
  local arm i run_root
  echo "DRY RUN — nothing below is executed, nothing is written, nothing is spent."
  echo "Pass --execute to run for real."
  echo
  echo "Fixture, built once and shared by every run, outside every working directory:"
  echo "  $ROOT/scripts/bench/make-refund-fixture.sh <fixture-dir>"
  echo "  $ROOT/scripts/bench/grade-refunds.sh <fixture-dir> --self-test"
  echo "  (the self-test is a hard gate: a fixture nobody watched fail measures nothing)"
  echo
  for arm in $SELECTED_ARMS; do
    build_claude_argv "$arm"
    echo "=============================================================="
    echo "[$arm] the command, identical for all $N run(s) of this arm:"
    echo "=============================================================="
    echo "  cp -R <fixture-dir>/repo/. <run-dir>/workdir/"
    printf '  (cd <run-dir>/workdir && '
    printf '%q ' "${CLAUDE_ARGV[@]}"
    printf ') > <run-dir>/transcript.jsonl\n'
    echo "  $ROOT/scripts/bench/grade-refunds.sh <fixture-dir> <run-dir>/workdir --json <run-dir>/grade.json"
    echo
    for ((i = 1; i <= N; i++)); do
      run_root="$OUTPUT_DIR/$arm/run-$i"
      echo "  run $i: <run-dir> = $run_root"
    done
    echo
  done
}

# --- results ------------------------------------------------------------------

report_results() {
  local arm="$1" summary_tsv="$2"
  echo
  python3 - "$arm" "$summary_tsv" <<'PY'
import csv
import sys

arm, path = sys.argv[1], sys.argv[2]
with open(path, newline="") as handle:
    rows = list(csv.reader(handle, delimiter="\t"))[1:]

costs, walls = [], []
excluded = 0
zero_attempt = []
delegating = []

print("[{}] per-run:".format(arm))
for row in rows:
    (idx, cost, turns, duration, out_tok, capped, is_error,
     attempted, returned, distinct, types,
     executed, passed, verdict, files, session_id) = row
    tag = ""
    if capped == "true":
        tag = "  [CAPPED — excluded from cost stats]"
    if not cost:
        tag = "  [NO RESULT FRAME — excluded from cost stats]"
    shown = "${:.4f}".format(float(cost)) if cost else "unknown"
    wall = "{:.0f}s".format(float(duration) / 1000) if duration else "unknown"
    score = "{}/20".format(passed) if verdict != "UNPROVEN" else "UNPROVEN"
    print("  run {}: {:>9}  {:>7}  {}  dispatches {}→{} across {} type(s) [{}]{}".format(
        idx, shown, wall, "{:>9}".format(score),
        attempted or "?", returned or "?", distinct or "?", types, tag))
    if executed == "0":
        print("           ^ 0 of 20 fixture cases executed — unproven, not a zero score")
    if capped == "true" or not cost:
        excluded += 1
        continue
    costs.append(float(cost))
    if duration:
        walls.append(float(duration) / 1000)
    if attempted == "0":
        zero_attempt.append(idx)
    else:
        delegating.append(idx)

print()
print("runs: {}   used in stats: {}   excluded: {}".format(len(rows), len(costs), excluded))

if not costs:
    print("no usable runs — every run was capped or produced no result frame")
    print("This is UNPROVEN, not a result.")
    sys.exit(0)

lo, hi = min(costs), max(costs)
print("cost   mean ${:.4f}".format(sum(costs) / len(costs)))
print("=" * 58)
print("COST SPREAD:  ${:.4f}  ..  ${:.4f}   (delta ${:.4f})".format(lo, hi, hi - lo))
if walls:
    print("WALL SPREAD:  {:.0f}s  ..  {:.0f}s".format(min(walls), max(walls)))
print("=" * 58)

# docs/INSTRUMENTS-R4.md §1: a run with zero attempted dispatches does not
# count as an omc-slim arm. It is a plain arm wearing a plugin, and averaging
# it in is how the last benchmark ended up defending a prompt while claiming
# to defend an orchestrator.
print()
print("delegation: {} of {} usable run(s) attempted at least one dispatch".format(
    len(delegating), len(costs)))
if zero_attempt:
    print("ZERO-DISPATCH RUNS: {} ({})".format(len(zero_attempt), ", ".join(zero_attempt)))
    if arm == "omc-slim":
        print("These are NOT omc-slim arms. They are plain arms wearing a plugin, and")
        print("they must be reported separately rather than averaged into this arm.")
        if not delegating:
            print()
            print("EVERY run in this arm delegated zero times. The full three-arm")
            print("comparison is unnecessary: the plugin does not delegate on a task")
            print("built so that delegation could pay, and that is the answer.")
PY
}

# --- entry point --------------------------------------------------------------

print_cost_estimate

if [ "$EXECUTE" = false ]; then
  print_dry_run
  exit 0
fi

if [ -e "$OUTPUT_DIR" ]; then
  echo "refusing to run: '$OUTPUT_DIR' already exists — delete it first, --execute does not merge into a previous run" >&2
  exit 1
fi

# The fixture lives outside $OUTPUT_DIR so the held-out suite is nowhere an arm
# could reach it, even by walking up from its own working directory.
FIXTURE_DIR="$(mktemp -d "${TMPDIR:-/tmp}/omc-refund-fixture.XXXXXX")/fixture"
"$ROOT/scripts/bench/make-refund-fixture.sh" "$FIXTURE_DIR"

echo
echo "Proving the correctness fixture can fail before any arm is graded by it."
echo "A fixture that has not been watched failing is not evidence."
echo
if ! "$ROOT/scripts/bench/grade-refunds.sh" "$FIXTURE_DIR" --self-test; then
  echo "refusing to spend: the fixture self-test failed, so no arm's score would mean anything" >&2
  exit 1
fi

mkdir -p "$OUTPUT_DIR"
echo
echo "fixture:   $FIXTURE_DIR"
echo "output:    $OUTPUT_DIR"
echo "arms:      $SELECTED_ARMS"
echo "n per arm: $N"
echo
echo "Executing — this spends real money."

for arm in $SELECTED_ARMS; do
  arm_dir="$OUTPUT_DIR/$arm"
  mkdir -p "$arm_dir"
  summary_tsv="$arm_dir/summary.tsv"
  printf 'run\ttotal_cost_usd\tnum_turns\tduration_ms\toutput_tokens\tcapped\tis_error\tdispatches_attempted\tdispatches_returned\tdistinct_subagent_types\tsubagent_types\tcases_executed\tcases_passed\tverdict\tfiles_produced\tsession_id\n' > "$summary_tsv"
  for ((i = 1; i <= N; i++)); do
    echo "[$arm] run $i of $N ..."
    run_one "$arm" "$arm_dir/run-$i" "$i" "$summary_tsv"
  done
  report_results "$arm" "$summary_tsv"
done

echo
echo "Runs are sequential and never parallel: wall time is a measure here, and"
echo "concurrent arms would contend for the same API and corrupt it."
echo "Per-run detail: $OUTPUT_DIR/<arm>/run-<i>/{transcript.jsonl,grade.json,workdir}"
