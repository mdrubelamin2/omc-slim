#!/usr/bin/env bash
# Measure the ARTEFACTS a benchmark arm produced -- as opposed to whether its
# tool is correct, which is scripts/bench/grade.sh's job (it scores one
# executable against a fixture). This script takes a whole arm working
# directory and measures what got built inside it: files produced, tool LOC,
# test count, whether the tests pass, and the CLI flag surface. Together the
# two scripts reproduce the results grid at docs/BENCHMARK.md:28-42 -- rows
# "Files produced" (40), "Tool LOC" (41) and "Tests" (42) are this script's
# job, and the "2.1x the tests" claim at docs/BENCHMARK.md:57 is derived
# straight from the test-count measure below, so that count is load-bearing,
# not decorative.
#
# docs/BENCHMARK.md:104-106 records a grading bug from the original,
# never-committed grader: it assumed pytest, and reported "tests can't run --
# pytest isn't installed" for an arm that had used stdlib unittest the whole
# time. That was a false finding caught only by re-reading the transcript
# before publishing. The fix generalizes here to every measure below, not
# just the test runner: nothing is assumed, everything is discovered, and a
# failed discovery is recorded as the literal string "unknown" -- never
# folded into a wrong 0, a wrong "fail", or a crash. The one exception is an
# arm that produced no files at all: there the true answer to every count
# really is zero, and this script says so rather than "unknown".
#
# Exits 0 for a completed measurement run, regardless of how many individual
# measures came back "unknown" -- that IS a measurement result, not a
# measurement failure. Exits non-zero only when measurement itself could not
# be attempted: bad arguments, or a working directory that doesn't exist.
#
# Reads <arm-dir> recursively. Writes <arm-dir>/artifacts.json and prints the
# same measures as a table on stdout.
#
#   ./scripts/bench/measure-artifacts.sh /tmp/omc-bench/plain/run-1
set -euo pipefail

usage() {
  echo "usage: $(basename "$0") <arm-working-directory>" >&2
}

if [ "$#" -ne 1 ]; then
  usage
  exit 1
fi

ARM_DIR="$1"
[ -d "$ARM_DIR" ] || { echo "measure-artifacts: not a directory: $ARM_DIR" >&2; exit 1; }

# Absolute, symlink-resolved: artifacts.json is written inside this same
# directory, and every measure below needs a stable root to build paths from,
# regardless of the cwd this script happened to be invoked from.
ARM_DIR="$(realpath -- "$ARM_DIR")"
JSON_OUT="$ARM_DIR/artifacts.json"

echo "measuring artifacts in $ARM_DIR"
echo

# All path handling from here on happens in Python: os.walk crosses no shell
# word-splitting boundary, unlike a bash `find | while read` loop over a
# machine-generated directory name that might contain a space. The sibling
# grader, scripts/bench/grade.sh, hit exactly that bug once (its own "bug #1
# guard") and fixed it the same way -- $ARM_DIR crosses the boundary once,
# as a single quoted argv element, and nothing is re-split or globbed after.
python3 - "$ARM_DIR" "$JSON_OUT" <<'PY'
import json, os, re, shutil, subprocess, sys
from datetime import datetime, timezone

ARM_DIR, JSON_OUT = sys.argv[1], sys.argv[2]
notes = []

# --- file collection ---------------------------------------------------------
# Pruned by exact directory name, at any depth -- not a path substring, which
# would over-exclude an oddly named sibling like "mynode_modules-backup".
# __pycache__ and .pytest_cache are bytecode/test-runner cache, not something
# the arm wrote as its own output: they appear because something ran Python
# against the arm's code (the arm's own work during its session, or measure 4
# below, which runs pytest/unittest discover against ARM_DIR as part of
# tests_pass) -- a side effect of execution either way, never an artifact to
# credit the arm for producing.
EXCLUDED_DIR_NAMES = {".git", "__pycache__", ".pytest_cache", "node_modules"}

# CLAUDE.md and the fable-mode SKILL.md are given to the CLAUDE.md + fable-mode
# arm as its starting context (see scripts/bench/run-arm.sh's
# setup_arm_workdir, "fable" case) -- not produced by the arm's own work, so
# counting them as "produced" would credit the arm for files it was handed
# rather than files it wrote. The rest are harness OUTPUT, written into this
# same directory after the arm has already finished, by two different
# scripts, that would otherwise be counted as if the arm had produced its own
# grading paperwork:
#   result.json / stderr.log -- scripts/bench/run-arm.sh's run_one(), moved
#     into the working directory only after THAT script's own file count is
#     taken (see run_one's comment there) -- but this script walks the
#     directory later, with no such ordering to lean on, so it excludes them
#     by name instead. Verified against run-arm.sh's own summary.tsv: before
#     this exclusion existed, plain/run-3 measured files_produced=5 against a
#     run-arm.sh-recorded 3 for the same run -- the two extra were exactly
#     these two files.
#   artifacts.json -- this script itself, on any previous run: without this
#     exclusion, a second run over an already-measured directory would count
#     its own prior output as one more file the arm produced, an off-by-one
#     that gets worse on every re-run.
EXCLUDED_FILE_PATHS = {
    os.path.join(ARM_DIR, "CLAUDE.md"),
    os.path.join(ARM_DIR, ".claude", "skills", "fable-mode", "SKILL.md"),
    os.path.join(ARM_DIR, "artifacts.json"),
    os.path.join(ARM_DIR, "result.json"),
    os.path.join(ARM_DIR, "stderr.log"),
}

def collect_files(root):
    found = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = sorted(d for d in dirnames if d not in EXCLUDED_DIR_NAMES)
        for name in filenames:
            full = os.path.join(dirpath, name)
            if full in EXCLUDED_FILE_PATHS:
                continue
            found.append(full)
    return sorted(found)

files = collect_files(ARM_DIR)
files_produced = len(files)
if files_produced == 0:
    notes.append("arm directory produced no files (after exclusions)")

# --- entry-point discovery: entry_cmd / tool_path / tool_loc share this pick
# Four rules, first match wins, ahead of an old any-file-anywhere fallback.
# Exists because "largest executable script, else largest source file" --
# this script's entire pick logic until now -- works for a single-file
# submission but fails badly on a package-structured one: on a real fable
# arm (pyproject.toml + an importable package + tests/) it picked a TEST
# file (tests/test_finder.py, tests/test_core.py) or a 6-line bin/ wrapper as
# "the tool". is_excluded_test_file() below keeps every rule off tests/,
# test_*.py, *_test.py and conftest.py -- selecting one of those as the tool
# is the specific bug being fixed here.
SOURCE_EXTENSIONS = {
    ".py", ".rb", ".pl", ".sh", ".bash",
    ".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx",
    ".go", ".rs", ".java", ".c", ".h", ".cpp", ".hpp", ".cc",
    ".cs", ".php", ".swift", ".kt", ".lua",
}

# Also used by rule 4 and rule 5's entry_cmd below, to invoke a script
# language's file through its interpreter rather than relying on the
# executable bit.
INTERPRETERS = {".py": "python3", ".rb": "ruby", ".pl": "perl",
                 ".js": "node", ".mjs": "node", ".cjs": "node"}

def is_excluded_test_file(rel_path):
    """Test-file guard for ENTRY-POINT DISCOVERY only -- narrower and more
    specific than looks_like_test_file() below, which does a different job
    (detecting test presence/count across several languages, where casting a
    wider net is correct there). Scoped exactly to Python's own conventions:
    anything under a tests/ directory, test_*.py, *_test.py, conftest.py."""
    parts = rel_path.split(os.sep)
    if "tests" in parts[:-1]:
        return True
    name = parts[-1]
    if name == "conftest.py":
        return True
    stem, ext = os.path.splitext(name)
    return ext == ".py" and (stem.startswith("test_") or stem.endswith("_test"))

def top_level_package_dirs():
    """Directories directly inside ARM_DIR that could hold a package -- not
    tests/ itself, and not the housekeeping dirs collect_files() already
    prunes (__pycache__ etc.)."""
    try:
        names = os.listdir(ARM_DIR)
    except OSError:
        return []
    return sorted(
        os.path.join(ARM_DIR, n) for n in names
        if n != "tests" and n not in EXCLUDED_DIR_NAMES
        and os.path.isdir(os.path.join(ARM_DIR, n))
    )

def top_level_py_candidates():
    """Non-test .py files directly inside ARM_DIR -- rules 3 and 4's shared
    scope, one level up from rule 1's package directories and distinct from
    rule 2's bin/."""
    try:
        names = os.listdir(ARM_DIR)
    except OSError:
        return []
    return sorted(
        os.path.join(ARM_DIR, n) for n in names
        if n.endswith(".py") and not is_excluded_test_file(n)
        and os.path.isfile(os.path.join(ARM_DIR, n))
    )

def package_py_files(pkg_dir_abs):
    """A package's own .py files, recursively, tests excluded. `files`
    (built above) already has __pycache__ pruned out, so there is no need to
    repeat that here."""
    prefix = pkg_dir_abs + os.sep
    return sorted(
        f for f in files
        if f.startswith(prefix) and f.endswith(".py")
        and not is_excluded_test_file(os.path.relpath(f, ARM_DIR))
    )

entry_cmd = None
tool_path_rel = None
tool_loc_file_abs = []  # the file(s) actually summed for tool_loc, in order

# Rule 1: a top-level package directory containing __main__.py. Runs via
# `python3 -m <pkg>`, never the file directly -- running it directly breaks a
# relative import like `from .cli import run` (no package context to resolve
# it against), which is exactly why this needs its own rule instead of
# falling into rule 3/4 below.
pkg_candidates = [d for d in top_level_package_dirs()
                   if os.path.isfile(os.path.join(d, "__main__.py"))]
if pkg_candidates:
    pkg_dir_abs = pkg_candidates[0]
    pkg_name = os.path.basename(pkg_dir_abs)
    entry_cmd = ["python3", "-m", pkg_name]
    tool_path_rel = pkg_name
    tool_loc_file_abs = package_py_files(pkg_dir_abs)

# Rule 2: an executable file directly under bin/ (largest, ties broken
# lexicographically -- same tie-break convention as rule 5's pick below).
if entry_cmd is None:
    bin_dir = os.path.join(ARM_DIR, "bin")
    if os.path.isdir(bin_dir):
        bin_exec = [os.path.join(bin_dir, n) for n in os.listdir(bin_dir)
                    if os.path.isfile(os.path.join(bin_dir, n))
                    and os.access(os.path.join(bin_dir, n), os.X_OK)]
        if bin_exec:
            picked = max(bin_exec, key=lambda f: (os.path.getsize(f), f))
            tool_path_rel = os.path.relpath(picked, ARM_DIR)
            entry_cmd = ["./" + tool_path_rel]
            tool_loc_file_abs = [picked]

# Rule 3: exactly one executable .py at top level -- unambiguous, run
# directly.
if entry_cmd is None:
    executable_top_py = [f for f in top_level_py_candidates() if os.access(f, os.X_OK)]
    if len(executable_top_py) == 1:
        picked = executable_top_py[0]
        tool_path_rel = os.path.basename(picked)
        entry_cmd = ["./" + tool_path_rel]
        tool_loc_file_abs = [picked]

# Rule 4: no single unambiguous executable -- fall back to the largest
# non-test .py at top level, invoked through the interpreter explicitly since
# its executable bit can't be relied on here.
if entry_cmd is None:
    top_level_py = top_level_py_candidates()
    if top_level_py:
        picked = max(top_level_py, key=lambda f: (os.path.getsize(f), f))
        tool_path_rel = os.path.basename(picked)
        entry_cmd = ["python3", tool_path_rel]
        tool_loc_file_abs = [picked]
        notes.append(f"no single unambiguous top-level executable .py found; picked the largest top-level .py instead: {tool_path_rel}")

# Rule 5 (old fallback, unscoped by language or position): largest executable
# file anywhere in the tree, else largest file with a recognized source
# extension anywhere in the tree -- covers what rules 1-4 don't, e.g. a
# non-Python submission, or a tool that lives deeper than top level. Same
# test-file guard applies here too.
if entry_cmd is None:
    executables = [f for f in files if os.access(f, os.X_OK)
                   and not is_excluded_test_file(os.path.relpath(f, ARM_DIR))]
    pool = executables if executables else [
        f for f in files
        if os.path.splitext(f)[1] in SOURCE_EXTENSIONS
        and not is_excluded_test_file(os.path.relpath(f, ARM_DIR))
    ]
    if pool:
        # Ties broken lexicographically for a deterministic pick -- which
        # file wins a tie is arbitrary, but tool_path makes the pick
        # auditable either way, per the brief.
        picked = max(pool, key=lambda f: (os.path.getsize(f), f))
        tool_path_rel = os.path.relpath(picked, ARM_DIR)
        tool_loc_file_abs = [picked]
        if picked in executables:
            entry_cmd = ["./" + tool_path_rel]
        else:
            notes.append(f"no executable file found; picked the largest recognized source file instead: {tool_path_rel}")
            interpreter = INTERPRETERS.get(os.path.splitext(picked)[1])
            if interpreter:
                entry_cmd = [interpreter, tool_path_rel]
            else:
                notes.append(f"{tool_path_rel} is not executable and its language has no known interpreter to invoke it with; entry_cmd left unknown")
    elif files_produced > 0:
        notes.append("no executable file, recognized source file, package __main__.py, or bin/ executable found; tool_path/tool_loc/entry_cmd/cli_flags left unknown")

tool_rel = tool_path_rel if tool_path_rel else "unknown"

# --- measure 2: tool_loc / tool_loc_files -------------------------------------
COMMENT_HASH = {".py", ".sh", ".bash", ".rb", ".pl", ".r", ".yaml", ".yml", ".toml"}
COMMENT_SLASH = {".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".go", ".rs", ".java",
                  ".c", ".h", ".cpp", ".hpp", ".cc", ".cs", ".swift", ".kt", ".php"}
COMMENT_DASH = {".lua", ".sql", ".hs"}

def is_binary(path):
    try:
        with open(path, "rb") as fh:
            return b"\0" in fh.read(8192)
    except OSError:
        return True

def comment_leader(path):
    """Best-effort line-comment token, used only to decide which lines count
    as code below. Extension first; an extensionless script (a plausible
    shape for "the main tool" once compiled or renamed) falls back to
    sniffing the shebang, defaulting to '#' since that covers the large
    majority of interpreted scripts."""
    ext = os.path.splitext(path)[1]
    if ext in COMMENT_HASH:
        return "#"
    if ext in COMMENT_SLASH:
        return "//"
    if ext in COMMENT_DASH:
        return "--"
    try:
        with open(path, "r", errors="replace") as fh:
            first_line = fh.readline()
    except OSError:
        return "#"
    return "//" if first_line.startswith("#!") and "node" in first_line else "#"

def count_loc(path):
    """Non-blank, non-full-line-comment count: a line counts as code unless
    it is empty after stripping whitespace, or its first non-whitespace
    characters are the language's line-comment leader. This is a per-line
    heuristic, not a language parser -- trailing comments and block/doc
    comments are not stripped, so a docstring counts as code. That is a
    legitimate counting-rule choice, not a bug: docs/BENCHMARK.md's own
    recorded "Tool LOC" (197 / 208) is a plain `wc -l` of the whole file,
    which this deliberately does not reproduce -- see the validation report
    for the resulting (consistent, expected) delta."""
    if is_binary(path):
        return None
    leader = comment_leader(path)
    n = 0
    with open(path, "r", errors="replace") as fh:
        for line in fh:
            stripped = line.strip()
            if stripped and not stripped.startswith(leader):
                n += 1
    return n

# A package sums every one of its own files -- a 6-line bin/ wrapper is not
# the size of the tool, and neither is one module out of five. Single-file
# rules (2-5) put exactly one path in tool_loc_file_abs, so the sum below
# degenerates to today's plain per-file count for every arm that isn't
# package-shaped -- verified in the validation report against plain/run-1
# and omc-slim/run-1, whose tool_loc must come out unchanged.
tool_loc_files_rel = []
if not tool_loc_file_abs:
    tool_loc = 0 if files_produced == 0 else "unknown"
else:
    total = 0
    for f in tool_loc_file_abs:
        counted = count_loc(f)
        rel = os.path.relpath(f, ARM_DIR)
        if counted is None:
            notes.append(f"{rel} looks binary (a NUL byte in its first 8KB); excluded from the tool_loc sum")
            continue
        total += counted
        tool_loc_files_rel.append(rel)
    tool_loc = total if tool_loc_files_rel else "unknown"

# --- measure 3: tests_present / test_count -----------------------------------
# Three counting patterns, one per language named in the brief -- deliberately
# NOT a test-runner probe (see docs/BENCHMARK.md:104-106 above): this counts
# what is in the source, so it can never be fooled by a runner that happens
# not to be installed.
PY_TEST_RE = re.compile(r'^[ \t]*(?:async[ \t]+)?def[ \t]+test_\w*[ \t]*\(', re.M)
# ".test(" is excluded from the left context because `someRegex.test(str)` is
# an extremely common, unrelated JS/TS idiom -- without that exclusion every
# regex-using file would look like a test file.
JS_TEST_RE = re.compile(r'(?<![\w$.])(?:it|test)[ \t]*\(')
RUST_TEST_RE = re.compile(r'#\[[ \t]*test[ \t]*\]')

LANG_EXTENSIONS = {
    "python": {".py"},
    "javascript": {".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"},
    "rust": {".rs"},
}
LANG_PATTERN = {"python": PY_TEST_RE, "javascript": JS_TEST_RE, "rust": RUST_TEST_RE}

def read_text(path):
    try:
        with open(path, "r", errors="replace") as fh:
            return fh.read()
    except OSError:
        return ""

test_counts = {lang: 0 for lang in LANG_EXTENSIONS}
for f in files:
    ext = os.path.splitext(f)[1]
    for lang, exts in LANG_EXTENSIONS.items():
        if ext in exts:
            test_counts[lang] += len(LANG_PATTERN[lang].findall(read_text(f)))

test_language = max(test_counts, key=lambda l: test_counts[l]) if any(test_counts.values()) else None

def looks_like_test_file(path):
    """Filename-convention fallback for a language none of the three patterns
    above cover. Exists so an arm that used a framework we don't parse still
    reads as "present, count unknown" rather than a false 0 -- the exact
    failure mode this whole script is built to avoid (see header)."""
    base = os.path.splitext(os.path.basename(path))[0].lower()
    if base.startswith(("test_", "test-")) or base in ("test", "tests"):
        return True
    if base.endswith(("_test", "-test", "_tests", "_spec", ".spec", ".test")):
        return True
    parts = os.path.dirname(path).lower().split(os.sep)
    return any(p in ("test", "tests", "__tests__", "spec") for p in parts)

if test_language is not None:
    tests_present = True
    test_count = test_counts[test_language]
elif any(looks_like_test_file(f) for f in files):
    tests_present = True
    test_count = "present, count unknown"
    notes.append("test-like filename(s) found but no def test_/it(/test(/#[test] pattern matched inside; test_count reported as unknown rather than 0")
else:
    tests_present = False
    test_count = 0

test_language_out = test_language if test_language else ("unknown" if tests_present else "n/a")

# --- shared: one capped subprocess invocation --------------------------------
def run_capped(cmd, cwd, timeout):
    """Returns (ok, returncode, stdout, stderr, timed_out). ok is False only
    when the command could not even be started (missing interpreter/binary);
    callers use that to fall through to the next candidate rather than report
    a result for a runner that never actually ran -- the same distinction
    docs/BENCHMARK.md:104-106 was missed on."""
    try:
        proc = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=timeout)
        return True, proc.returncode, proc.stdout, proc.stderr, False
    except FileNotFoundError:
        return False, None, "", "", False
    except subprocess.TimeoutExpired as exc:
        return True, None, exc.stdout or "", exc.stderr or "", True

# --- measure 4: tests_pass / runner_used --------------------------------------
RUN_TIMEOUT = 120  # cap per the brief

TEST_SCRIPT_NAMES = ("run_tests.sh", "run-tests.sh", "runtests.sh", "test.sh", "tests.sh")

def attempt_explicit_script():
    for name in TEST_SCRIPT_NAMES:
        path = os.path.join(ARM_DIR, name)
        if not os.path.isfile(path):
            continue
        cmd = [path] if os.access(path, os.X_OK) else ["/bin/sh", path]
        ok, rc, out, err, timed_out = run_capped(cmd, ARM_DIR, RUN_TIMEOUT)
        display = " ".join(cmd)
        if not ok:
            notes.append(f"found {name} but could not execute it")
            continue
        if timed_out:
            return {"outcome": None, "cmd": display, "note": f"{display} did not finish within {RUN_TIMEOUT}s"}
        return {"outcome": "pass" if rc == 0 else "fail", "cmd": display}
    return None

def attempt_pytest():
    cmd = ["python3", "-m", "pytest"]
    ok, rc, out, err, timed_out = run_capped(cmd, ARM_DIR, RUN_TIMEOUT)
    display = " ".join(cmd)
    if not ok:
        return None
    if timed_out:
        return {"outcome": None, "cmd": display, "note": f"{display} did not finish within {RUN_TIMEOUT}s"}
    if re.search(r"No module named ['\"]?pytest", out + err):
        return None  # not installed here -- this is the exact bug being guarded against
    if rc == 5:
        return None  # ran, but collected zero tests: not this project's runner
    return {"outcome": "pass" if rc == 0 else "fail", "cmd": display}

def attempt_unittest():
    cmd = ["python3", "-m", "unittest", "discover"]
    ok, rc, out, err, timed_out = run_capped(cmd, ARM_DIR, RUN_TIMEOUT)
    display = " ".join(cmd)
    if not ok:
        return None
    if timed_out:
        return {"outcome": None, "cmd": display, "note": f"{display} did not finish within {RUN_TIMEOUT}s"}
    ran = int(m.group(1)) if (m := re.search(r"Ran (\d+) tests?", out + err)) else 0
    if ran == 0:
        return None  # discovered nothing here: not this project's runner
    return {"outcome": "pass" if rc == 0 else "fail", "cmd": display}

def attempt_npm():
    pkg = os.path.join(ARM_DIR, "package.json")
    if not os.path.isfile(pkg):
        return None
    try:
        with open(pkg) as fh:
            script = (json.load(fh).get("scripts") or {}).get("test", "")
    except (OSError, json.JSONDecodeError):
        return None
    if not script or "no test specified" in script:
        return None
    if shutil.which("npm") is None:
        notes.append("package.json defines a test script but npm is not on PATH")
        return None
    cmd = ["npm", "test"]
    ok, rc, out, err, timed_out = run_capped(cmd, ARM_DIR, RUN_TIMEOUT)
    display = " ".join(cmd)
    if not ok:
        return None
    if timed_out:
        return {"outcome": None, "cmd": display, "note": f"{display} did not finish within {RUN_TIMEOUT}s"}
    return {"outcome": "pass" if rc == 0 else "fail", "cmd": display}

if not tests_present:
    tests_pass = "n/a (no tests found)"
    runner_used = None
else:
    tests_pass = "unknown"
    runner_used = "unknown"
    for attempt in (attempt_explicit_script, attempt_pytest, attempt_unittest, attempt_npm):
        result = attempt()
        if result is None:
            continue
        runner_used = result["cmd"]
        if result["outcome"] is None:
            notes.append(result["note"])
            tests_pass = "unknown"
        else:
            tests_pass = result["outcome"]
        break
    else:
        notes.append("no runner could run this arm's tests: tried an explicit test script, "
                      "python3 -m pytest, python3 -m unittest discover, npm test")

# --- measure 5: cli_flags / cli_flag_list -------------------------------------
# --help should be instant; still capped so a tool that blocks on stdin
# (misreading --help as a positional argument, say) cannot hang this script --
# the same "never hang on an untrusted candidate" principle scripts/bench/
# grade.sh applies to the FIFO in its hostile tree.
HELP_TIMEOUT = 10

# Pairs a short/long synonym written as "-h, --help" (argparse/click/optparse
# convention) into one canonical flag, preferring the short spelling. A lone
# flag (no comma-adjacent partner -- the usage line's "[-m BYTES] [-x GLOB]"
# style, where each bracket is a DIFFERENT option, not a synonym) is kept as
# its own entry. The leading lookbehind keeps this from matching mid-word,
# e.g. the "-detect" inside "auto-detect"; the comma-gap is restricted to
# non-newline whitespace so a synonym pair can never accidentally span two
# lines of wrapped help text.
FLAG_RE = re.compile(r'(?<![\w-])(-{1,2}[A-Za-z][\w-]*)(?:,[ \t]*(-{1,2}[A-Za-z][\w-]*))?')

def is_short(flag):
    return not flag.startswith("--")

def canonical_flags_from_help(text):
    flags = set()
    for m in FLAG_RE.finditer(text):
        g1, g2 = m.group(1), m.group(2)
        if g2 is None:
            flags.add(g1)
        else:
            flags.add(g1 if is_short(g1) else (g2 if is_short(g2) else g1))
    return flags

cli_flags = "unknown"
cli_flag_list = []
if entry_cmd is None:
    cli_flags = 0 if files_produced == 0 else "unknown"
else:
    # entry_cmd, not tool + a hand-built interpreter check: a package's
    # entry_cmd is ["python3", "-m", pkg], and "-m" is the only invocation
    # that keeps its relative imports working -- see rule 1 above. A missing
    # interpreter (or any other launch failure) surfaces via run_capped's
    # ok=False below, the same fallback every other runner in this file
    # (attempt_pytest, attempt_unittest, ...) already relies on.
    cmd = entry_cmd + ["--help"]
    ok, rc, out, err, timed_out = run_capped(cmd, ARM_DIR, HELP_TIMEOUT)
    display = " ".join(cmd)
    if not ok:
        notes.append(f"could not run `{display}`; cli_flags left unknown")
    elif timed_out:
        notes.append(f"`{display}` did not finish within {HELP_TIMEOUT}s; cli_flags left unknown")
    else:
        flags = canonical_flags_from_help((out or "") + (err or ""))
        if flags or rc == 0:
            cli_flags = len(flags)
            cli_flag_list = sorted(flags)
        else:
            notes.append(f"`{display}` exited {rc} with no recognizable flags in its output; cli_flags left unknown")

# --- assemble, print, write ---------------------------------------------------
payload = {
    "arm_dir": ARM_DIR,
    "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    "files_produced": files_produced,
    "tool_path": tool_rel,
    "entry_cmd": entry_cmd,
    "tool_loc": tool_loc,
    "tool_loc_files": tool_loc_files_rel,
    "tests_present": tests_present,
    "test_count": test_count,
    "test_language": test_language_out,
    "tests_pass": tests_pass,
    "runner_used": runner_used,
    "cli_flags": cli_flags,
    "cli_flag_list": cli_flag_list,
    "notes": notes,
}

with open(JSON_OUT, "w") as fh:
    json.dump(payload, fh, indent=2)
    fh.write("\n")

LABEL_WIDTH = 16

def row(label, value):
    return f"{label:{LABEL_WIDTH}s} {value}"

out = [row("MEASURE", "VALUE")]
out.append(row("files_produced", files_produced))
out.append(row("tool_path", tool_rel))
out.append(row("entry_cmd", " ".join(entry_cmd) if entry_cmd else "unknown"))
out.append(row("tool_loc", tool_loc))
out.append(row("tool_loc_files", ", ".join(tool_loc_files_rel) if tool_loc_files_rel else "(none)"))
out.append(row("tests_present", tests_present))
out.append(row("test_count", test_count))
out.append(row("test_language", test_language_out))
out.append(row("tests_pass", tests_pass))
out.append(row("runner_used", runner_used if runner_used else "n/a"))
out.append(row("cli_flags", cli_flags))
out.append(row("cli_flag_list", ", ".join(cli_flag_list) if cli_flag_list else "(none)"))

if notes:
    out.append("")
    out.append("NOTES:")
    out.extend(f"  - {n}" for n in notes)

out.append("")
out.append(f"json: {JSON_OUT}")
print("\n".join(out))
PY
