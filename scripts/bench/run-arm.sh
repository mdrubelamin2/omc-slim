#!/usr/bin/env bash
# Run one arm of the omc-slim duplicate-file-finder benchmark, n times,
# capturing cost and metrics. THIS SPENDS REAL MONEY — every run is a live
# `claude -p` call. Defaults to a dry run; --execute is required to spend.
#
# docs/deepwork/benchmark-rerun-v0.8.1.md records how isolation was chosen and
# verified live. Repeated here so the next person does not have to re-derive
# it or re-discover the two approaches that looked plausible and are not:
#
#   - `CLAUDE_CONFIG_DIR` pointed at a fresh directory looks like isolation,
#     but auth lives in the macOS Keychain, not the config directory. A fresh
#     config dir has no credentials: "Not logged in - Please run /login".
#   - `--bare` also fails, for the opposite reason: it explicitly skips
#     keychain reads (see `claude --help`) and demands ANTHROPIC_API_KEY.
#
# What actually works: `--setting-sources "project"` on ALL THREE arms,
# identically. It drops user settings, user-level plugins and
# ~/.claude/CLAUDE.md while leaving Keychain auth untouched, so the only
# difference between arms is working-directory contents plus one flag
# (--plugin-dir, omc-slim only) — never a second differing flag, which would
# reintroduce the exact confound that invalidated the original v0.4.1 plain
# arm (docs/BENCHMARK.md, "Corrections made during grading", #1).
#
# Arm definitions (each verified live by a probe — see the doc above):
#   plain     - empty working directory.
#   omc-slim  - empty working directory, plus --plugin-dir <this repo>.
#   fable     - working directory seeded with CLAUDE.md
#               (docs/upstream/CLAUDE.md.snapshot) and
#               .claude/skills/fable-mode/SKILL.md
#               (docs/upstream/fable-mode.SKILL.md.snapshot).
#
# Usage:
#   ./scripts/bench/run-arm.sh <plain|omc-slim|fable> <n> <output-dir> [--execute]
#
# Without --execute this is a dry run: prints what would happen and spends
# nothing. Reruns cleanly since nothing is written to disk.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# The benchmark's control: identical, verbatim, for every arm.
PROMPT="Build a command-line tool that finds duplicate files in a directory tree and reports them."

# --allowedTools MUST include Write and Edit. MAINTAINERS.md (v0.6.2, "Method
# note") records a harness bug where omitting them stopped a run at the
# permission prompt instead of erroring: in `-p` mode there is no TTY to
# answer that prompt, so the arm silently produced nothing rather than
# failing loudly. Read, Bash, Glob and Grep were already allowed and were
# never the problem; Write and Edit are the ones that bit us before.
ALLOWED_TOOLS="Read Write Edit Bash Glob Grep"

# Comfortably above every turn count a real run has ever used (plain 15,
# omc-slim 12, fable-mode 64 — docs/BENCHMARK.md v0.4.1 results) so it does
# not fire under normal operation. Set rather than omitted: MAINTAINERS.md
# records THREE false negatives from turn caps set too low ("--max-turns 6"
# killing a run mid-orientation, an unset run "hitting the turn cap mid-work"
# with no stage map, and "--max-turns 13" cutting off a deepwork run) — but a
# cap has to exist at all for the capped:true bookkeeping below to ever be
# exercised instead of being dead code that never fires.
MAX_TURNS=200

# 30 minutes. The heaviest arm observed historically (fable-mode) took 810s,
# so this leaves better than 2x headroom — a runaway guard against a hung
# process, not a routine constraint. See run_with_timeout for why it is not
# built on GNU `timeout`.
WALL_CLOCK_LIMIT_SECS=1800

# Keep ambient tone plugins out, as the original run did (MAINTAINERS.md,
# "Testing tone is contamination-prone" — the first tone tests were
# contaminated by exactly these two being active).
export CAVEMAN_DEFAULT_MODE=off
export PONYTAIL_DEFAULT_MODE=off

# --- working-directory setup -------------------------------------------------
# This function is the entire difference in working-directory contents
# between arms; build_claude_argv below is the only other difference
# (--plugin-dir). Nothing else may vary between arms.
setup_arm_workdir() {
  local arm="$1" dir="$2"
  mkdir -p "$dir"
  case "$arm" in
    fable)
      mkdir -p "$dir/.claude/skills/fable-mode"
      cp "$ROOT/docs/upstream/CLAUDE.md.snapshot" "$dir/CLAUDE.md"
      cp "$ROOT/docs/upstream/fable-mode.SKILL.md.snapshot" "$dir/.claude/skills/fable-mode/SKILL.md"
      ;;
    plain|omc-slim)
      : # deliberately empty — that emptiness is the whole point of these two
      ;;
  esac
}

# --- command construction ----------------------------------------------------
# Shared by the dry-run printer and the real invocation so the two can never
# drift apart. That sharing is what makes the dry run trustworthy: if it were
# a separate hand-written string, "the flag set is identical across arms"
# would be a claim about the printer, not about what actually runs.
CLAUDE_ARGV=()
build_claude_argv() {
  local arm="$1"
  CLAUDE_ARGV=(claude -p "$PROMPT" --setting-sources "project" --output-format json \
    --allowedTools "$ALLOWED_TOOLS" --max-turns "$MAX_TURNS")
  if [ "$arm" = "omc-slim" ]; then
    CLAUDE_ARGV+=(--plugin-dir "$ROOT")
  fi
}

# --- execution helpers --------------------------------------------------------

# Wall-clock ceiling with no GNU-coreutils dependency. Stock macOS ships
# neither `timeout` nor `gtimeout` — both are Homebrew coreutils, not part of
# BSD base — so this has to be portable bash: background the command, race it
# against a sleeping watcher, TERM then KILL if the watcher wins.
run_with_timeout() {
  local limit_secs="$1"; shift
  "$@" &
  local cmd_pid=$!
  # The watcher holds its sleep as a job and waits on it, so killing the watcher
  # kills the sleep. A bare `sleep` inline is a CHILD of this subshell: killing
  # the subshell orphans it, and it runs out the full limit under init. One
  # stray sleep per run, and this script runs nine.
  ( trap 'kill "$s" 2>/dev/null; exit' TERM
    sleep "$limit_secs" & s=$!; wait "$s"
    kill -TERM "$cmd_pid" 2>/dev/null
    sleep 5 & s=$!; wait "$s"
    kill -KILL "$cmd_pid" 2>/dev/null ) &
  local watcher_pid=$!
  local status=0
  wait "$cmd_pid" || status=$?
  kill -TERM "$watcher_pid" 2>/dev/null || true
  wait "$watcher_pid" 2>/dev/null || true
  return "$status"
}

count_files() {
  find "$1" -type f | wc -l | tr -d ' '
}

# Parses one run's raw JSON into six tab-separated fields: total_cost_usd,
# num_turns, duration_ms, output_tokens, capped, is_error. Always python3,
# never grep/sed — the JSON's "result" field is arbitrary model prose that can
# contain newlines and quotes, exactly the kind of content line-oriented tools
# mishandle.
parse_result() {
  python3 - "$1" <<'PY'
import json, sys

def val(x):
    # None means "key present, value null"; missing keys already default to
    # None via .get(). Either way that is unknown data, not zero — 0.0 is a
    # real, legitimate cost and must not collapse into the same blank field.
    return "" if x is None else x

try:
    with open(sys.argv[1]) as f:
        data = json.load(f)
except (OSError, ValueError):
    # Empty or truncated file: the wall-clock guard killed claude before it
    # produced a final result, or it crashed before writing anything at all.
    # Every field is genuinely unknown here — an empty TSV field says that; a
    # fabricated 0 would claim "this run cost nothing", which is false.
    print("\t".join(["", "", "", "", "false", ""]))
    sys.exit(0)

# "error_max_turns" is what Claude Code's own `-p --output-format json`
# emits when --max-turns is hit — confirmed by inspecting the installed CLI
# binary directly (`strings` on claude 2.1.233), not recalled from memory,
# since --max-turns itself is undocumented (accepted, but hidden from
# --help). Re-verify with `strings "$(command -v claude)" | grep
# error_max_turns` if this ever seems wrong after an upgrade.
capped = data.get("subtype") == "error_max_turns"
is_error = bool(data.get("is_error"))
usage = data.get("usage") or {}
fields = [
    val(data.get("total_cost_usd")),
    val(data.get("num_turns")),
    val(data.get("duration_ms")),
    val(usage.get("output_tokens")),
    "true" if capped else "false",
    "true" if is_error else "false",
]
print("\t".join(str(f) for f in fields))
PY
}

# Runs one (arm, index) into its own fresh directory and appends one row to
# summary.tsv. Never aborts the batch on a single bad run — set -e is
# deliberately defeated around the claude invocation (`|| status=$?`) so run 2
# still happens if run 1 errors, crashes or times out.
run_one() {
  local arm="$1" run_dir="$2" idx="$3" summary_tsv="$4"

  setup_arm_workdir "$arm" "$run_dir"
  local baseline_files
  baseline_files="$(count_files "$run_dir")"

  build_claude_argv "$arm"

  # Captured outside run_dir first, moved in only after the file count below —
  # result.json and stderr.log live INSIDE the working directory the tool
  # itself writes into, so counting after would count our own bookkeeping as
  # if the run had produced it.
  local raw_stdout raw_stderr status
  raw_stdout="$(mktemp)"
  raw_stderr="$(mktemp)"
  status=0
  ( cd "$run_dir" && run_with_timeout "$WALL_CLOCK_LIMIT_SECS" "${CLAUDE_ARGV[@]}" ) \
    </dev/null >"$raw_stdout" 2>"$raw_stderr" || status=$?

  if [ "$status" -eq 143 ] || [ "$status" -eq 137 ]; then
    echo "WARNING: [$arm] run $idx exceeded the ${WALL_CLOCK_LIMIT_SECS}s wall-clock guard and was killed — recorded as excluded (empty fields); see $run_dir/stderr.log" >&2
  fi

  local post_files files_produced
  post_files="$(count_files "$run_dir")"
  files_produced=$((post_files - baseline_files))

  mv "$raw_stdout" "$run_dir/result.json"
  mv "$raw_stderr" "$run_dir/stderr.log"

  local parsed cost turns duration out_tok capped is_error
  parsed="$(parse_result "$run_dir/result.json")"
  IFS=$'\t' read -r cost turns duration out_tok capped is_error <<<"$parsed"

  if [ -z "$cost" ]; then
    echo "WARNING: [$arm] run $idx produced no parseable JSON result — recorded as excluded (empty fields); inspect $run_dir/result.json and $run_dir/stderr.log" >&2
  elif [ "$is_error" = "true" ] && [ "$capped" = "false" ]; then
    # Not a turns-cap (that's the only subtype "capped" tracks — see
    # parse_result), so this row still carries real cost/turn data and is
    # still averaged in below. Flagged because a run that errored without
    # hitting the cap is still worth a human look.
    echo "WARNING: [$arm] run $idx completed with is_error=true (not a turns-cap) — cost is still recorded and averaged in; inspect $run_dir/result.json" >&2
  fi

  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\n' "$idx" "$cost" "$turns" "$duration" "$out_tok" "$capped" "$files_produced" >> "$summary_tsv"
}

# --- dry run -------------------------------------------------------------
print_dry_run() {
  local arm="$1" n="$2" output_dir="$3"
  echo "DRY RUN — nothing below is executed and nothing is spent. Pass --execute to run for real."
  echo
  echo "[$arm] working-directory setup, applied fresh to every run-<i> directory:"
  case "$arm" in
    fable)
      echo "  cp '$ROOT/docs/upstream/CLAUDE.md.snapshot' '<run-dir>/CLAUDE.md'"
      echo "  cp '$ROOT/docs/upstream/fable-mode.SKILL.md.snapshot' '<run-dir>/.claude/skills/fable-mode/SKILL.md'"
      ;;
    plain|omc-slim)
      echo "  (empty — no seed files)"
      ;;
  esac
  echo

  build_claude_argv "$arm"
  local i run_dir
  for ((i = 1; i <= n; i++)); do
    run_dir="$output_dir/$arm/run-$i"
    printf '[%s] run %d: mkdir -p %q\n' "$arm" "$i" "$run_dir"
    if [ "$arm" = "fable" ]; then
      printf '[%s] run %d: cp %q %q\n' "$arm" "$i" "$ROOT/docs/upstream/CLAUDE.md.snapshot" "$run_dir/CLAUDE.md"
      printf '[%s] run %d: cp %q %q\n' "$arm" "$i" "$ROOT/docs/upstream/fable-mode.SKILL.md.snapshot" "$run_dir/.claude/skills/fable-mode/SKILL.md"
    fi
    printf '[%s] run %d: (cd %q && ' "$arm" "$i" "$run_dir"
    printf '%q ' "${CLAUDE_ARGV[@]}"
    printf ')\n'
  done
}

# --- results ---------------------------------------------------------------
# n=3 exists to report a spread, not a point — this is the one place that
# spread must be impossible to miss, so it gets a bordered block, not just
# another printed line.
report_results() {
  local arm="$1" summary_tsv="$2"
  echo
  echo "[$arm] per-run cost:"
  python3 - "$summary_tsv" <<'PY'
import csv, sys

path = sys.argv[1]
with open(path, newline="") as f:
    rows = list(csv.reader(f, delimiter="\t"))

rows = rows[1:]  # drop the header row
costs = []
excluded = 0
for run_idx, cost, turns, duration, out_tok, capped, files in rows:
    tag = " [CAPPED — excluded]" if capped == "true" else ""
    if not cost:
        tag = " [NO DATA — excluded]"
    shown_cost = f"${float(cost):.4f}" if cost else "unknown"
    print(f"  run {run_idx}: {shown_cost}{tag}")
    if capped == "true" or not cost:
        excluded += 1
        continue
    costs.append(float(cost))

print()
print(f"runs: {len(rows)}   used in stats: {len(costs)}   excluded: {excluded}")
if costs:
    total = sum(costs)
    mean = total / len(costs)
    lo, hi = min(costs), max(costs)
    print(f"total: ${total:.4f}")
    print(f"mean:  ${mean:.4f}")
    print("=" * 46)
    print(f"SPREAD: ${lo:.4f}  ..  ${hi:.4f}   (delta ${hi - lo:.4f})")
    print("=" * 46)
else:
    print("no usable runs — every run was capped or produced no parseable cost")
PY
}

# --- entry point -------------------------------------------------------------
main() {
  if [ "$#" -lt 3 ] || [ "$#" -gt 4 ]; then
    echo "usage: $(basename "$0") <plain|omc-slim|fable> <n> <output-dir> [--execute]" >&2
    exit 1
  fi

  local arm="$1" n="$2" output_dir="$3" execute_flag="${4:-}"

  case "$arm" in
    plain|omc-slim|fable) ;;
    *) echo "error: arm must be one of plain, omc-slim, fable — got '$arm'" >&2; exit 1 ;;
  esac

  if ! [[ "$n" =~ ^[0-9]+$ ]] || [ "$n" -lt 1 ]; then
    echo "error: n must be a positive integer — got '$n'" >&2
    exit 1
  fi

  local execute=false
  if [ -n "$execute_flag" ]; then
    if [ "$execute_flag" != "--execute" ]; then
      echo "error: unrecognized 4th argument '$execute_flag' — expected --execute" >&2
      exit 1
    fi
    execute=true
  fi

  if [ "$execute" = false ]; then
    print_dry_run "$arm" "$n" "$output_dir"
    return 0
  fi

  local arm_dir="$output_dir/$arm"

  # Refuses on the arm's OWN subdirectory, not on <output-dir> itself. A full
  # benchmark is three separate invocations of this script (one per arm)
  # sharing one <output-dir> so every arm's results land in the same place —
  # if the refusal targeted <output-dir> itself, only the first of the three
  # invocations could ever succeed. What must not be clobbered is this arm's
  # own prior output, mirroring make-fixture.sh's refusal for the same reason:
  # a stale file surviving into "regenerated" output defeats the point of
  # regenerating it.
  if [ -e "$arm_dir" ]; then
    echo "refusing to run: '$arm_dir' already exists — delete it first, --execute does not merge into a previous run" >&2
    exit 1
  fi

  mkdir -p "$arm_dir"
  local summary_tsv="$arm_dir/summary.tsv"
  printf 'run\ttotal_cost_usd\tnum_turns\tduration_ms\toutput_tokens\tcapped\tfiles_produced\n' > "$summary_tsv"

  echo "[$arm] executing $n run(s) into $arm_dir — this spends real money."

  local i
  for ((i = 1; i <= n; i++)); do
    run_one "$arm" "$arm_dir/run-$i" "$i" "$summary_tsv"
  done

  report_results "$arm" "$summary_tsv"
}

# Guarded so this file can be `source`d to reach setup_arm_workdir and the
# other helpers directly (for testing the workdir setup without spending
# money — see the file's own validation) without also running main.
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
