#!/usr/bin/env bash
# Grade a candidate refund implementation against the held-out fixture, and —
# with --self-test — prove that fixture can still fail before anyone trusts a
# number it produced.
#
# Correctness is a committed test suite the arms never see, run against each
# arm's output (docs/INSTRUMENTS-R4.md §1). It is not a judge model, and it
# never runs the candidate's own tests: grade.sh's "bug #2" comment records
# what happens when a grader guesses at a candidate's test runner.
#
# --self-test is the negative control and it is not optional. It grades three
# trees whose scores are predicted in the fixture's manifest.json:
#
#   base     the untouched repo, with no refund at all — 20 executed, 0 passed.
#            This is the check that the suite is not scoring an empty tree as
#            a pass.
#   broken   the reference with four named defects seeded — 16 passed, and the
#            four failures must be EXACTLY the four the manifest predicts. A
#            broken tree that fails on the wrong cases is not a control.
#   correct  the reference implementation — 20 passed.
#
# If broken comes back green, the fixture is not measuring what it claims and
# the whole run is void. Nothing else in this benchmark is worth reading until
# this exits 0.
#
#   ./scripts/bench/grade-refunds.sh <fixture-dir> --self-test
#   ./scripts/bench/grade-refunds.sh <fixture-dir> <candidate-repo-dir> [--json <path>]
set -euo pipefail

usage() {
  echo "usage: $(basename "$0") <fixture-dir> --self-test" >&2
  echo "       $(basename "$0") <fixture-dir> <candidate-repo-dir> [--json <path>]" >&2
}

if [ "$#" -lt 2 ]; then
  usage
  exit 2
fi

FIXTURE_DIR="$1"; shift
[ -d "$FIXTURE_DIR" ] || { echo "grade-refunds: not a directory: $FIXTURE_DIR" >&2; exit 2; }
FIXTURE_DIR="$(cd "$FIXTURE_DIR" && pwd)"

HELDOUT="$FIXTURE_DIR/heldout/check_refunds.py"
MANIFEST="$FIXTURE_DIR/manifest.json"
[ -f "$HELDOUT" ]  || { echo "grade-refunds: missing $HELDOUT" >&2; exit 2; }
[ -f "$MANIFEST" ] || { echo "grade-refunds: missing $MANIFEST" >&2; exit 2; }

# The suite runs in a subprocess with the candidate first on sys.path, so no
# two candidates ever share a module cache. PYTHONDONTWRITEBYTECODE keeps
# __pycache__ out of the candidate tree — a run directory is measured for the
# files an arm produced, and our own grading must not add any.
run_suite() {
  local candidate="$1" json_path="${2:-}"
  local argv=(python3 "$HELDOUT" "$candidate")
  if [ -n "$json_path" ]; then
    argv+=(--json "$json_path")
  fi
  PYTHONDONTWRITEBYTECODE=1 "${argv[@]}"
}

# --- self-test ---------------------------------------------------------------

# Reads one field out of a report written by the held-out suite. Always
# python3, never grep: the reason strings are arbitrary assertion prose.
report_field() {
  python3 - "$1" "$2" <<'PY'
import json, sys

with open(sys.argv[1]) as handle:
    report = json.load(handle)
value = report.get(sys.argv[2])
if isinstance(value, list):
    print(",".join(sorted(value)))
else:
    print(value)
PY
}

expected_field() {
  python3 - "$MANIFEST" "$1" "$2" <<'PY'
import json, sys

with open(sys.argv[1]) as handle:
    manifest = json.load(handle)
value = manifest["references"][sys.argv[2]].get(sys.argv[3])
if isinstance(value, list):
    print(",".join(sorted(value)))
elif value is None:
    print("")
else:
    print(value)
PY
}

self_test() {
  local work failures=0
  work="$(mktemp -d)"
  # $work is wanted expanded now, not at trap time, so the temp tree is still
  # removed if this function returns early.
  # shellcheck disable=SC2064
  trap "rm -rf '$work'" EXIT

  local variant candidate overlay
  for variant in base broken correct; do
    candidate="$work/$variant"
    mkdir -p "$candidate"
    cp -R "$FIXTURE_DIR/repo/." "$candidate/"
    overlay="$(expected_field "$variant" overlay)"
    if [ -n "$overlay" ] && [ "$overlay" != "None" ]; then
      cp -R "$FIXTURE_DIR/$overlay/." "$candidate/"
    fi

    echo "=============================================================="
    echo "self-test: $variant"
    echo "=============================================================="
    local status=0
    run_suite "$candidate" "$work/$variant.json" || status=$?
    if [ "$status" -eq 2 ] || [ ! -f "$work/$variant.json" ]; then
      echo "SELF-TEST FAILED [$variant]: the suite did not produce a report" >&2
      failures=$((failures + 1))
      continue
    fi

    local got_verdict want_verdict got_passed want_passed got_executed
    got_verdict="$(report_field "$work/$variant.json" verdict)"
    got_passed="$(report_field "$work/$variant.json" passed)"
    got_executed="$(report_field "$work/$variant.json" executed)"
    want_verdict="$(expected_field "$variant" expect_verdict)"
    want_passed="$(expected_field "$variant" expect_passed)"

    # A suite that executed nothing prints the same as one that passed
    # everything, so this is checked before the score is looked at at all.
    if [ "$got_executed" -eq 0 ]; then
      echo "SELF-TEST FAILED [$variant]: 0 cases executed — unproven, not passed" >&2
      failures=$((failures + 1))
      continue
    fi
    if [ "$got_verdict" != "$want_verdict" ] || [ "$got_passed" != "$want_passed" ]; then
      echo "SELF-TEST FAILED [$variant]: got $got_verdict $got_passed/20, expected $want_verdict $want_passed/20" >&2
      failures=$((failures + 1))
      continue
    fi

    local want_failed got_failed
    want_failed="$(expected_field "$variant" expect_failed)"
    if [ -n "$want_failed" ]; then
      got_failed="$(report_field "$work/$variant.json" failed)"
      if [ "$got_failed" != "$want_failed" ]; then
        echo "SELF-TEST FAILED [$variant]: red on {$got_failed}, predicted {$want_failed}" >&2
        failures=$((failures + 1))
        continue
      fi
      echo "  -> red on exactly the predicted cases: $got_failed"
    fi
    echo "  -> $variant: $got_verdict $got_passed/20, $got_executed executed — as predicted"
    echo
  done

  echo "=============================================================="
  if [ "$failures" -ne 0 ]; then
    echo "SELF-TEST FAILED: $failures of 3 reference trees scored differently than predicted."
    echo "The fixture is not measuring what it claims. Do not read any arm's score."
    return 1
  fi
  echo "SELF-TEST PASSED: the untouched tree scores 0/20, the seeded-defect tree"
  echo "scores 16/20 on exactly the four predicted cases, and the reference"
  echo "implementation scores 20/20. The fixture can fail, and it fails for the"
  echo "reasons it was built to fail for."
  return 0
}

# --- entry point --------------------------------------------------------------

if [ "$1" = "--self-test" ]; then
  [ "$#" -eq 1 ] || { usage; exit 2; }
  self_test
  exit $?
fi

CANDIDATE="$1"; shift
[ -d "$CANDIDATE" ] || { echo "grade-refunds: not a directory: $CANDIDATE" >&2; exit 2; }
CANDIDATE="$(cd "$CANDIDATE" && pwd)"

JSON_PATH=""
if [ "$#" -gt 0 ]; then
  if [ "$#" -ne 2 ] || [ "$1" != "--json" ]; then
    usage
    exit 2
  fi
  JSON_PATH="$2"
fi

# Exits 0 for a pass, 1 for a fail, 3 for unproven. A candidate scoring badly
# IS a grading result, so a failing score is reported and not treated as a
# harness error; only argument and fixture problems exit 2.
run_suite "$CANDIDATE" "$JSON_PATH"
