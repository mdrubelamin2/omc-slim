#!/usr/bin/env bash
# Grade a candidate duplicate-file-finder tool against a fixture.
#
# The original grader for docs/BENCHMARK.md was never committed -- every arm
# was graded by a script that only ever existed on the grading machine, and
# it had three bugs that would have shipped as published findings had they
# not been caught by hand (docs/BENCHMARK.md, "Corrections made during
# grading"). This is that grader, rebuilt so it can be kept, with each of
# those three bugs guarded explicitly below at the point the guard lives.
#
# Reads <fixture-dir>/manifest.json, tree/ and hostile/ (built by the
# sibling scripts/bench/make-fixture.sh). Runs the candidate against each,
# twice, tolerantly parses whatever format it invents for its stdout, and
# prints the seven measures docs/BENCHMARK.md's results grid depends on.
# Also writes <fixture-dir>/grade-<toolname>.json.
#
# The candidate is either an executable path, or a command string such as
# "python3 -m dupefind" -- scripts/bench/measure-artifacts.sh's entry_cmd,
# for a package-structured tool with no single executable file to point at.
# Whichever form is given, it is run with cwd set to the fixture directory
# and the target directory (tree/hostile) appended as its final argument.
#
# Exits 0 for a completed grading run, regardless of how the candidate
# scored -- a candidate crashing or missing every duplicate IS a grading
# result, not a grading failure. Exits non-zero only when grading itself
# could not be performed: bad arguments, a malformed fixture, a candidate
# that isn't executable.
#
#   ./scripts/bench/grade.sh /tmp/omc-bench-fixture ./my-submission/dupefind
#   ./scripts/bench/grade.sh /tmp/omc-bench-fixture "python3 -m dupefind"
set -euo pipefail

# --- bug #2 guard -----------------------------------------------------------
# The last grader assumed pytest; the arm under test had used stdlib
# unittest, and "pytest isn't installed" was reported as a failure that
# never happened. The fix here is not a smarter test runner detector -- it's
# that this grader never runs a candidate's own test suite at all.
# Correctness is judged entirely by observed behaviour against the fixture
# (below), so there is no runner convention to guess and get wrong.

usage() {
  echo "usage: $(basename "$0") <fixture-dir> <candidate-tool-path-or-command>" >&2
}

if [ "$#" -ne 2 ]; then
  usage
  exit 1
fi

FIXTURE_DIR="$1"
CANDIDATE="$2"

[ -d "$FIXTURE_DIR" ]                  || { echo "grade: not a directory: $FIXTURE_DIR" >&2; exit 1; }
[ -f "$FIXTURE_DIR/manifest.json" ]    || { echo "grade: missing $FIXTURE_DIR/manifest.json" >&2; exit 1; }
[ -d "$FIXTURE_DIR/tree" ]             || { echo "grade: missing $FIXTURE_DIR/tree" >&2; exit 1; }
[ -d "$FIXTURE_DIR/hostile" ]          || { echo "grade: missing $FIXTURE_DIR/hostile" >&2; exit 1; }

FIXTURE_DIR="$(realpath -- "$FIXTURE_DIR")"

# --- candidate: an executable path, or a command string ---------------------
# A path never contains whitespace in practice, so that one test tells the
# two apart: no whitespace keeps the original single-executable contract
# byte-for-byte (same checks, same error messages, same realpath resolution).
# Whitespace means "this is argv, split on spaces" -- CANDIDATE_CMD holds the
# runnable command either way, and is what run_candidate() below actually
# execs.
if [[ "$CANDIDATE" != *[[:space:]]* ]]; then
  [ -f "$CANDIDATE" ] || { echo "grade: not a file: $CANDIDATE" >&2; exit 1; }
  [ -x "$CANDIDATE" ] || { echo "grade: not executable: $CANDIDATE" >&2; exit 1; }

  # Absolute, symlink-resolved: the candidate is always invoked with cwd set
  # to the fixture directory (so a well-behaved tool's own output is already
  # fixture-relative, see the Python below), and a relative path given on the
  # command line would stop resolving the moment cwd changes.
  CANDIDATE="$(realpath -- "$CANDIDATE")"
  CANDIDATE_CMD=("$CANDIDATE")

  # Both real arms in docs/bench-samples-*/ are literally named dupefind.py --
  # the candidate's own basename can't disambiguate two submissions, but each
  # arm already lives in its own directory, so that directory's name can.
  #
  # HAZARD: this only disambiguates within one FIXTURE_DIR. Two candidates
  # whose parent directory shares a name -- e.g. plain/run-2 and
  # omc-slim/run-2, both named "run-2" -- graded into the SAME fixture dir
  # produce the same JSON_OUT, and the second grading run silently overwrites
  # the first's grade-run-2.json. Grade each candidate into its own fixture
  # directory (a fresh make-fixture.sh output per candidate).
  TOOLNAME="$(basename "$(dirname "$CANDIDATE")")"
else
  # No single file to point at (measure-artifacts.sh's entry_cmd for a
  # package: "python3 -m dupefind") -- not realpath'd, since "python3" is a
  # bare command name, not a path, and any relative path token in here is
  # meaningful relative to wherever the caller's environment resolves it,
  # not to this script's own cwd.
  read -ra CANDIDATE_CMD <<< "$CANDIDATE"

  # Same disambiguation problem and the same accepted fix as the path case
  # above (grade each candidate into its own fixture directory) -- there is
  # no parent directory to name this after, so the command itself, slugged,
  # is the closest equivalent to "which candidate is this".
  TOOLNAME="${CANDIDATE// /-}"
fi
JSON_OUT="$FIXTURE_DIR/grade-$TOOLNAME.json"

# hostile/ deliberately includes a FIFO and a symlink loop (make-fixture.sh);
# a candidate that opens entries without checking their type first can block
# on the FIFO forever, which would hang grading itself. Every invocation
# below is capped at this many wall-clock seconds. Overridable because a
# slow CI runner and a fast laptop don't agree on what "hung" means.
TIMEOUT_SECS="${GRADE_TIMEOUT_SECS:-30}"

# --- bug #1 guard -------------------------------------------------------
# zsh/bash word-splitting an unquoted path with a space in it produced two
# fake MISSED results last time. Every expansion below is quoted, directory
# names are read one full line at a time (IFS='' read -r) rather than word
# by word, and scripts/bench/make-fixture.sh's own fixture is exercised
# here too -- but it has no space in any path, so the self-test in the
# validation run for this script adds one by hand to actually cover this.
#
# BSD `stat -f`, not GNU `stat -c`: macOS ships no `-c` form.
find_unreadable_dir() {
  local base="$1" entry perm
  while IFS= read -r entry; do
    perm="$(stat -f '%Lp' -- "$entry" 2>/dev/null || true)"
    if [ "$perm" = "0" ] || [ "$perm" = "000" ]; then
      printf '%s\n' "$entry"
      return 0
    fi
  done < <(find "$base" -type d 2>/dev/null)
  return 1
}

MODE000_ABS=""
if ! MODE000_ABS="$(find_unreadable_dir "$FIXTURE_DIR/hostile")"; then
  echo "grade: warning: no mode-000 directory under $FIXTURE_DIR/hostile -- discloses_unreadable will read n/a" >&2
  MODE000_ABS=""
fi
MODE000_REL=""
[ -n "$MODE000_ABS" ] && MODE000_REL="${MODE000_ABS#"$FIXTURE_DIR"/}"

echo "grading $TOOLNAME"
echo "  candidate: ${CANDIDATE_CMD[*]}"
echo "  fixture:   $FIXTURE_DIR"
echo

# --- bug #3 guard -------------------------------------------------------
# A fault was reported last time without being verified. The fix isn't a
# rule bolted onto printing -- it's that every measure below is derived from
# two independent invocations of the candidate (run A, run B; see
# run_candidate() and confirm() just below), and nothing is reported as a
# fault unless it reproduces in both, with the exact command and its output
# printed next to it either way.
#
# All further path handling (parsing candidate stdout, matching it against
# manifest.json, JSON output) happens in Python: no shell word-splitting
# hazard exists there in the first place, since paths cross the shell/Python
# boundary once, as individually-quoted argv elements in the array below --
# never re-split, concatenated, or globbed. CANDIDATE_CMD is variable-length
# (one token for a path, several for a command string), so its own element
# count goes first, letting the Python side slice off exactly that many
# argv entries rather than guessing where it ends.
py_args=(
  "$FIXTURE_DIR"
  "$TOOLNAME"
  "$JSON_OUT"
  "tree"
  "hostile"
  "$MODE000_REL"
  "$TIMEOUT_SECS"
  "${#CANDIDATE_CMD[@]}"
  "${CANDIDATE_CMD[@]}"
)

python3 - "${py_args[@]}" <<'PY'
import sys, os, re, json, subprocess, shlex

def as_text(v):
    if v is None:
        return ""
    if isinstance(v, bytes):
        return v.decode(errors="replace")
    return v

def sh(*parts):
    return " ".join(shlex.quote(p) for p in parts)

# --- hostile_survived guard --------------------------------------------
# "Survived" means "did not crash", not "exited zero". Exit-code conventions
# are per-tool, not a language-level error signal: verified against real
# candidates where one exits 1 on an empty hostile tree and 0 once it finds
# real duplicates, and another exits 2 on hostile and 1 on the real tree --
# a third, different convention. Neither crashed. So rc is recorded below
# for the record (evidence_block, JSON) but never compared against zero. A
# crash is a timeout, death by signal, or -- the case rc alone can't see,
# since an uncaught exception still exits 1, not a signal -- an
# interpreter/runtime fault that shows up on stderr regardless of rc.
CRASH_SIGNATURES = ("Traceback (most recent call last)", "Segmentation fault", "panic:")

def crash_signature(stderr_text):
    return next((s for s in CRASH_SIGNATURES if s in stderr_text), None)

def run_candidate(candidate_cmd, fixture_dir, arg, timeout_s):
    """One invocation of the candidate, cwd=fixture_dir, argv=candidate_cmd +
    [arg] -- never shell=True, so a space or quote in any path is inert here.
    candidate_cmd is a list either way: one element for an executable path,
    several for a command string like ["python3", "-m", "dupefind"].
    subprocess.run's own timeout kills and reaps the child; that's the whole
    guard against the FIFO/symlink-loop hazards in hostile/, no hand-rolled
    watchdog needed."""
    cmd_display = f"(cd {shlex.quote(fixture_dir)} && {sh(*candidate_cmd, arg)})"
    try:
        proc = subprocess.run(
            [*candidate_cmd, arg], cwd=fixture_dir,
            capture_output=True, text=True, timeout=timeout_s,
        )
        stderr = as_text(proc.stderr)
        sig = crash_signature(stderr)
        return {
            "cmd": cmd_display, "rc": proc.returncode,
            "stdout": as_text(proc.stdout), "stderr": stderr,
            "timed_out": False,
            # negative == killed by signal (POSIX). subprocess.run never runs
            # the candidate through a shell, so this is Python's own
            # negative-rc report, not the shell's 128+signal convention.
            "crashed": proc.returncode < 0 or sig is not None,
            "crash_signature": sig,
        }
    except subprocess.TimeoutExpired as exc:
        return {
            "cmd": cmd_display, "rc": None,
            "stdout": as_text(exc.stdout), "stderr": as_text(exc.stderr),
            "timed_out": True, "crashed": True, "crash_signature": None,
        }
    except OSError as exc:
        return {
            "cmd": cmd_display, "rc": None,
            "stdout": "", "stderr": f"grade: could not run candidate: {exc}",
            "timed_out": False, "crashed": True, "crash_signature": None,
        }

def path_pattern(p):
    # Boundary on both sides so "x.txt" doesn't match inside "x.txt.bak", but
    # '/' is an accepted left boundary so an absolute path ending in this
    # fixture-relative suffix still counts as a match.
    return re.compile(r'(?<![\w.\-])' + re.escape(p) + r'(?![\w.\-])')

def present(text, path):
    return bool(path_pattern(path).search(text))

def matching_lines(text, path):
    pat = path_pattern(path)
    return [ln for ln in text.split("\n") if pat.search(ln)]

# --- discloses_unreadable guard ------------------------------------------
# A binary disclosed/silent verdict folded two very different things
# together: a tool that names the exact unreadable path, or gives an
# OS-level reason like "Permission denied", told the user something they
# could act on; a tool that only says "1 path(s) could not be read" told
# them a problem exists, not what or where. Verified against real
# candidates -- "dupefind: 1 path(s) could not be read (use -v for
# details)" and "1 path(s) skipped; re-run with -v for detail." both used
# to score "silent (FAIL)" despite plainly disclosing something. Three
# states now, checked in this order:
#   specific -- names mode000_rel, or gives a permission/EACCES-style
#               reason (specific about *why*, even without naming the path)
#   generic  -- acknowledges an unreadable/skipped path, by count or vague
#               plural, without naming it or saying why
#   silent   -- stderr says nothing about it at all
SPECIFIC_REASON_RE = re.compile(
    r'permission|denied|eacces|access is denied|operation not permitted', re.I)
GENERIC_SIGNAL_RE = re.compile(
    r'unreadable|inaccessible|could not (?:be )?read|cannot read|'
    r"couldn.t read|not readable|\bskip(?:ped|ping)?\b", re.I)

def disclosure_level(stderr_text, mode000_rel):
    if present(stderr_text, mode000_rel) or SPECIFIC_REASON_RE.search(stderr_text):
        return "specific"
    if GENERIC_SIGNAL_RE.search(stderr_text):
        return "generic"
    return "silent"

def infer_blocks(text, known_paths):
    """Split stdout into contiguous runs of path-bearing lines: a header or
    blank line (any line matching none of the known paths) ends a run.
    Returns (blocks, verified). verified is True only when the output
    actually mixed path lines with non-path lines somewhere, i.e. there was
    a real separator to key off. A bare flat dump of paths with nothing else
    gives verified=False, and callers fall back to plain set membership
    rather than trust block boundaries that were never really there."""
    lines = text.split("\n")
    pats = {p: path_pattern(p) for p in known_paths}
    blocks, current = [], set()
    any_path_line = any_plain_line = False
    for line in lines:
        found = {p for p, pat in pats.items() if pat.search(line)}
        if found:
            any_path_line = True
            current |= found
        else:
            if line.strip():
                any_plain_line = True
            if current:
                blocks.append(current)
                current = set()
    if current:
        blocks.append(current)
    return blocks, (any_path_line and any_plain_line)

def group_present(blocks, verified, found_anywhere, paths):
    wanted = set(paths)
    if verified:
        return any(wanted <= blk for blk in blocks)
    return wanted <= found_anywhere

def co_located(blocks, verified, found_anywhere, a, b):
    if verified:
        return any(a in blk and b in blk for blk in blocks)
    return a in found_anywhere and b in found_anywhere

def false_positive_flag(blocks, verified, found_anywhere, unique_path, hardlink):
    """A unique path is a false positive if the tool grouped it with
    something else as a duplicate. make-fixture.sh deliberately hangs the
    hardlink off one of the unique files, so a tool that correctly
    *discloses* that hardlink relationship -- grouping the unique file only
    with its own hardlink twin, nothing else -- must not be dinged for it;
    that disclosure is hardlink_as_dup's job to record, not a false
    positive. Only co-location with some OTHER member counts here."""
    if not verified:
        return unique_path in found_anywhere
    partner = None
    if unique_path == hardlink["path"]:
        partner = hardlink["twin"]
    elif unique_path == hardlink["twin"]:
        partner = hardlink["path"]
    ignore = {unique_path, partner} if partner else {unique_path}
    return any(unique_path in blk and (blk - ignore) for blk in blocks)

def evaluate(run_result, manifest):
    text = run_result["stdout"]
    known = set()
    for g in manifest["groups"]:
        known.update(g["paths"])
    known.update(manifest["empty"])
    known.update(manifest["unique"])
    known.add(manifest["symlink"]["path"]); known.add(manifest["symlink"]["target"])
    known.add(manifest["hardlink"]["path"]); known.add(manifest["hardlink"]["twin"])

    blocks, verified = infer_blocks(text, known)
    found_anywhere = {p for p in known if present(text, p)}

    groups = {g["id"]: group_present(blocks, verified, found_anywhere, g["paths"])
              for g in manifest["groups"]}

    fp = {u: false_positive_flag(blocks, verified, found_anywhere, u, manifest["hardlink"])
          for u in manifest["unique"]}

    sl = manifest["symlink"]
    symlink_as_dup = co_located(blocks, verified, found_anywhere, sl["path"], sl["target"])

    hl = manifest["hardlink"]
    hardlink_as_dup = co_located(blocks, verified, found_anywhere, hl["path"], hl["twin"])

    empty_paths = manifest["empty"]
    if run_result["crashed"]:
        empty_handling = "crashed"
    elif len(empty_paths) < 2:
        empty_handling = "n/a (fixture has fewer than 2 empty files)"
    elif group_present(blocks, verified, found_anywhere, empty_paths):
        empty_handling = "reported"
    else:
        empty_handling = "not reported"

    return {"verified": verified, "blocks": blocks, "found_anywhere": found_anywhere,
            "groups": groups, "false_positives": fp,
            "symlink_as_dup": symlink_as_dup, "hardlink_as_dup": hardlink_as_dup,
            "empty_handling": empty_handling}

def confirm(fault_a, fault_b):
    """bug #3: a fault is only reported once it reproduces. 'none' means
    neither run saw it, 'confirmed' means both did, 'unconfirmed' means the
    two runs disagreed -- printed as such rather than resolved either way."""
    if fault_a and fault_b:
        return "confirmed"
    if not fault_a and not fault_b:
        return "none"
    return "unconfirmed"

LABEL_WIDTH = 34

def row(label, value):
    return f"{label:{LABEL_WIDTH}s} {value}"

def evidence_block(run_a, run_b, extra_a="", extra_b=""):
    lines = [f"    run A: {run_a['cmd']}"]
    if extra_a:
        lines.append(f"           {extra_a}")
    lines.append(f"    run B: {run_b['cmd']}")
    if extra_b:
        lines.append(f"           {extra_b}")
    return "\n".join(lines)

def crash_reason(run_result):
    """Why hostile_survived called this run crashed -- rc alone doesn't say,
    since an uncaught exception exits 1 same as a deliberate status code."""
    if run_result["timed_out"]:
        return "timeout"
    if run_result["crash_signature"]:
        return f"stderr shows {run_result['crash_signature']!r}"
    if run_result["rc"] is not None and run_result["rc"] < 0:
        return f"killed by signal (rc={run_result['rc']})"
    return "could not launch"

def main():
    (fixture_dir, toolname, json_out,
     tree_arg, hostile_arg, mode000_rel, timeout_s, n_cmd) = sys.argv[1:9]
    timeout_s = float(timeout_s)
    # CANDIDATE_CMD's own element count precedes it (see py_args in the bash
    # above) so a multi-token command string ("python3 -m dupefind") can be
    # sliced back out without guessing where it ends.
    candidate_cmd = sys.argv[9:9 + int(n_cmd)]

    manifest_path = os.path.join(fixture_dir, "manifest.json")
    try:
        with open(manifest_path) as fh:
            manifest = json.load(fh)
    except (OSError, json.JSONDecodeError) as exc:
        print(f"grade: cannot read/parse {manifest_path}: {exc}", file=sys.stderr)
        return 1
    for key in ("groups", "empty", "unique", "symlink", "hardlink"):
        if key not in manifest:
            print(f"grade: manifest.json missing required key {key!r}", file=sys.stderr)
            return 1

    tree_a = run_candidate(candidate_cmd, fixture_dir, tree_arg, timeout_s)
    tree_b = run_candidate(candidate_cmd, fixture_dir, tree_arg, timeout_s)
    hostile_a = run_candidate(candidate_cmd, fixture_dir, hostile_arg, timeout_s)
    hostile_b = run_candidate(candidate_cmd, fixture_dir, hostile_arg, timeout_s)

    eval_a, eval_b = evaluate(tree_a, manifest), evaluate(tree_b, manifest)

    notes = []
    out = [row("MEASURE", "RESULT")]

    # --- 1. groups_found ----------------------------------------------------
    group_detail = {}
    n_found = 0
    for gid in eval_a["groups"]:
        status = confirm(eval_a["groups"][gid], eval_b["groups"][gid])
        if status == "confirmed":
            label, n_found = "found", n_found + 1
        elif status == "none":
            label = "MISSED"
            group_paths = next(g["paths"] for g in manifest["groups"] if g["id"] == gid)
            missing = sorted(set(group_paths) - eval_a["found_anywhere"])
            if missing:
                notes.append(f"group {gid} missed -- never appeared in output: {missing}")
        else:
            label = "unconfirmed (A/B disagree)"
            notes.append(f"group {gid}: run A and run B disagreed on whether it was reported; not scored as found")
        group_detail[gid] = status
        out.append(row(f"  group {gid}", label))
    out.append(row("groups_found", f"{n_found}/{len(eval_a['groups'])}"))
    out.append("")

    # --- 2. false_positives (the measure that matters most) -----------------
    fp_status = {u: confirm(eval_a["false_positives"][u], eval_b["false_positives"][u])
                 for u in manifest["unique"]}
    confirmed_fp = sorted(u for u, s in fp_status.items() if s == "confirmed")
    unconfirmed_fp = sorted(u for u, s in fp_status.items() if s == "unconfirmed")
    out.append(row("false_positives", str(len(confirmed_fp))
                    + (f"  (+{len(unconfirmed_fp)} unconfirmed)" if unconfirmed_fp else "")))
    for u in confirmed_fp:
        out.append(f"  FAIL: {u!r} reported as a duplicate -- reproduced in both runs")
        out.append(evidence_block(
            tree_a, tree_b,
            "; ".join(matching_lines(tree_a["stdout"], u)) or "(line not found on re-check)",
            "; ".join(matching_lines(tree_b["stdout"], u)) or "(line not found on re-check)"))
    for u in unconfirmed_fp:
        notes.append(f"{u!r} looked like a false positive in one run but not the other -- not reproduced, not scored as a fault")
    out.append("")

    # --- 3. symlink_as_dup (a fault) -----------------------------------------
    sl_status = confirm(eval_a["symlink_as_dup"], eval_b["symlink_as_dup"])
    out.append(row("symlink_as_dup", "no" if sl_status == "none" else sl_status))
    if sl_status == "confirmed":
        sl = manifest["symlink"]
        out.append(f"  FAIL: {sl['path']!r} reported as a duplicate of its target {sl['target']!r}")
        out.append(evidence_block(
            tree_a, tree_b,
            "; ".join(matching_lines(tree_a["stdout"], sl["path"])),
            "; ".join(matching_lines(tree_b["stdout"], sl["path"]))))
    elif sl_status == "unconfirmed":
        notes.append("symlink_as_dup did not reproduce between run A and run B -- not scored as a fault")

    # --- 4. hardlink_as_dup: recorded, never faulted -------------------------
    hl_a, hl_b = eval_a["hardlink_as_dup"], eval_b["hardlink_as_dup"]
    hl_value = str(hl_a) if hl_a == hl_b else f"{hl_a} (A) / {hl_b} (B), varied between runs"
    out.append(row("hardlink_as_dup (recorded only)", hl_value))

    # --- 5. empty_handling: recorded, not scored -----------------------------
    eh_a, eh_b = eval_a["empty_handling"], eval_b["empty_handling"]
    eh_value = eh_a if eh_a == eh_b else f"{eh_a} (A) / {eh_b} (B), varied between runs"
    out.append(row("empty_handling (recorded only)", eh_value))
    out.append("")
    verified_note = "" if eval_a["verified"] else \
        "  (no header/blank-line separation seen; groups_found and false_positives fell back to plain set membership)"
    out.append(row("grouping_verified", str(eval_a["verified"])) + verified_note)
    out.append("")

    # --- 6. hostile_survived --------------------------------------------------
    # rc is never compared to zero here -- see the guard above run_candidate().
    crash_status = confirm(hostile_a["crashed"], hostile_b["crashed"])
    survived = {"none": "yes", "confirmed": "no", "unconfirmed": "unconfirmed (A/B disagree)"}[crash_status]
    out.append(row("hostile_survived", survived))
    out.append(f"  run A: exit={hostile_a['rc']} timed_out={hostile_a['timed_out']} cmd: {hostile_a['cmd']}")
    out.append(f"  run B: exit={hostile_b['rc']} timed_out={hostile_b['timed_out']} cmd: {hostile_b['cmd']}")
    if crash_status != "none":
        for label, r in (("A", hostile_a), ("B", hostile_b)):
            if r["crashed"]:
                out.append(f"  crashed ({label}): {crash_reason(r)}")
            if r["crashed"] and r["stderr"].strip():
                out.append(f"  stderr ({label}, last line): {r['stderr'].strip().splitlines()[-1]}")
    if crash_status == "unconfirmed":
        notes.append("hostile crash did not reproduce between run A and run B -- recorded as unconfirmed, not a confirmed fault")
    out.append("")

    # --- 7. discloses_unreadable ----------------------------------------------
    if not mode000_rel:
        disclosure = "n/a"
        level_a = level_b = None
        out.append(row("discloses_unreadable", "n/a (no mode-000 directory found under hostile/)"))
    else:
        level_a = disclosure_level(hostile_a["stderr"], mode000_rel)
        level_b = disclosure_level(hostile_b["stderr"], mode000_rel)
        # Silence is the only FAIL here (the plain arm, docs/BENCHMARK.md
        # line ~46), so -- same two-run discipline as every other fault in
        # this file -- it is the state that needs both runs to agree before
        # being reported as such. "specific" and "generic" are both real
        # disclosures of differing strength, never folded into each other,
        # so any other disagreement between runs is reported honestly
        # rather than resolved by picking a side.
        if level_a == level_b:
            disclosure = "silent (FAIL)" if level_a == "silent" else level_a
            out.append(row("discloses_unreadable", disclosure))
            if level_a == "silent":
                out.append(f"  FAIL: no mention of {mode000_rel!r}, a permission-style reason, "
                           "or a count/skip notice on stderr, in either run")
                out.append(evidence_block(
                    hostile_a, hostile_b,
                    f"stderr: {hostile_a['stderr'].strip()!r}",
                    f"stderr: {hostile_b['stderr'].strip()!r}"))
        else:
            disclosure = f"unconfirmed (A={level_a}, B={level_b})"
            out.append(row("discloses_unreadable", disclosure))
            notes.append(f"discloses_unreadable differed between run A ({level_a}) and run B ({level_b}) -- not scored as a confirmed silence")

    if notes:
        out.append("")
        out.append("NOTES:")
        out.extend(f"  - {n}" for n in notes)

    out.append("")
    out.append(f"json: {json_out}")
    print("\n".join(out))

    payload = {
        "tool": toolname, "candidate": " ".join(candidate_cmd), "fixture": fixture_dir,
        "grouping_verified": eval_a["verified"],
        "measures": {
            "groups_found": {"count": n_found, "total": len(eval_a["groups"]), "detail": group_detail},
            "false_positives": {"count": len(confirmed_fp), "confirmed": confirmed_fp, "unconfirmed": unconfirmed_fp},
            "symlink_as_dup": sl_status,
            "hardlink_as_dup": {"run_a": hl_a, "run_b": hl_b},
            "empty_handling": {"run_a": eh_a, "run_b": eh_b},
            "hostile_survived": {
                "status": crash_status,
                "run_a": {"rc": hostile_a["rc"], "timed_out": hostile_a["timed_out"],
                          "crash_signature": hostile_a["crash_signature"]},
                "run_b": {"rc": hostile_b["rc"], "timed_out": hostile_b["timed_out"],
                          "crash_signature": hostile_b["crash_signature"]},
            },
            "discloses_unreadable": {"mode000_path": mode000_rel or None, "status": disclosure,
                                      "run_a": level_a, "run_b": level_b},
        },
        "notes": notes,
    }
    with open(json_out, "w") as fh:
        json.dump(payload, fh, indent=2)
        fh.write("\n")
    return 0

sys.exit(main())
PY
