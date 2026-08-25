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
#   ./scripts/bench/smoke-contracts.sh             # dry run, prints the calls
#   ./scripts/bench/smoke-contracts.sh --self-test # prove the checkers can fail
#   ./scripts/bench/smoke-contracts.sh --execute   # spends real money
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
EXECUTE=""
SELF_TEST=""
case "${1:-}" in
  --execute)   EXECUTE=1 ;;
  --self-test) SELF_TEST=1 ;;
  "")          : ;;
  *)           echo "usage: $(basename "$0") [--execute | --self-test]" >&2; exit 2 ;;
esac

# Set by the runner to the throwaway fixture a case ran in, so a checker can
# assert on the filesystem as well as on the text. Empty for the cases that run
# against the real repository, which is what keeps those assertions off it.
SMOKE_FIXTURE=""

# =============================================================================
# Checkers
#
# Each receives the response text on stdin and returns non-zero with a reason on
# failure. A case that cannot fail proves nothing, so every check asserts
# something the restructure could have broken — and --self-test below shows each
# one rejecting a realistic bad output and accepting a realistic good one.
#
# Every assertion here comes from the component's own file. Where a file does
# not promise something, this does not assert it; see the designer note.
# =============================================================================

# --- Agents ------------------------------------------------------------------

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

# fixer: the output contract at agents/fixer.md:211-226 — summary, changes, and
# a verification block that names what ran and what it said. The verification
# block is the half that rots first, because an agent that just edited files
# has already "finished" in its own telling.
check_fixer() {
  local out; out="$(cat)"
  printf '%s' "$out" | grep -q '<changes>' \
    || { echo "no <changes> block; fixer must list what it touched"; return 1; }
  printf '%s' "$out" | grep -q '<verification>' \
    || { echo "no <verification> block; the contract requires one on every return"; return 1; }
  printf '%s' "$out" | grep -qE '^[[:space:]]*-[[:space:]]*performed:' \
    || { echo "<verification> names no command performed"; return 1; }
  printf '%s' "$out" | grep -qEi '^[[:space:]]*-[[:space:]]*result:[[:space:]]*(passed|failed|not run)' \
    || { echo "<verification> states no result of passed|failed|not run"; return 1; }
  return 0
}

# designer: agents/designer.md:82-86 — "when asked to review rather than build,
# report concrete problems with locations", with its own example naming a
# contrast ratio at Header.tsx:40 rather than "consider improving accessibility".
#
# NOT asserted here: that designer refuses non-UI work. agents/designer.md makes
# no such promise — the refusal clause lives in agents/fixer.md:19-21, pointing
# the other way. Asserting it would be asserting a contract that does not exist,
# which is the one failure worse than no check. Review mode is the cheapest thing
# the file does promise.
check_designer() {
  local out; out="$(cat)"
  printf '%s' "$out" | grep -qE '[A-Za-z0-9_./-]+\.(tsx|jsx|ts|js|css|html|svelte):[0-9]+' \
    || { echo "no file:line location; review mode must locate every problem"; return 1; }
  printf '%s' "$out" | grep -qiE 'contrast|ratio|focus|aria|semantic|keyboard|reduced-motion|tab order' \
    || { echo "no concrete interface property named; this is advice, not a finding"; return 1; }
  return 0
}

# tracer: agents/tracer.md:26-27 — at least three competing hypotheses, each with
# evidence for AND against. One confident cause is the failure mode the agent
# exists to prevent, so a single-hypothesis answer is a fail even if it is right.
check_tracer() {
  local out; out="$(cat)"
  local h
  for h in H1 H2 H3; do
    printf '%s' "$out" | grep -q "$h" \
      || { echo "only found hypotheses up to ${h%[0-9]}$((${h#H} - 1)); contract requires three"; return 1; }
  done
  printf '%s' "$out" | grep -qi 'for:' \
    || { echo "no evidence-for line; a hypothesis without evidence is a guess"; return 1; }
  printf '%s' "$out" | grep -qi 'against:' \
    || { echo "no evidence-against line; a hypothesis you only confirmed is untested"; return 1; }
  return 0
}

# --- Skills ------------------------------------------------------------------
#
# READ THIS BEFORE TRUSTING A GREEN SKILL CASE. The two halves of this file are
# not equally strong evidence.
#
# An agent is a subagent, so `subagent_stats` in the JSON envelope is the
# harness's own count of what it dispatched. It cannot be talked into a number,
# and it is why the agent cases above are real proof.
#
# A skill runs in the MAIN THREAD. `subagent_stats.spawned` therefore stays 0 for
# most of them, and the envelope carries no skill-invocation field at all. So the
# checkers below key on a DISTINCTIVE OUTPUT ARTEFACT — review's exact header
# line, deep-interview's ambiguity table, deepwork's numbered stage map,
# council's consensus level. That is weaker evidence, and the weakness is
# specific: a model that never loaded the skill can in principle imitate the
# format, and this would call that a pass. It proves the shape, not the run.
#
# Where a skill does dispatch — review above ~50 changed lines, council always —
# the case ALSO asserts `subagent_stats` (the `skill:N` kind). That half is real
# evidence, and those two cases are correspondingly stronger than the other five.
#
# codemap is the one skill with evidence outside the text: its case asserts the
# fixture filesystem was left alone, which no amount of format imitation fakes.

# review: the required header at skills/review/SKILL.md:326-327, the lanes line
# beside it, and a located finding. The fixture plants an unambiguous flaw, so
# "no findings" is a miss, not a clean tree.
check_review() {
  local out; out="$(cat)"
  printf '%s' "$out" | grep -qE '^[[:space:]]*Review:[[:space:]]*(ship|fix first|needs a decision)' \
    || { echo "no 'Review: <verdict>' header; that line is the skill's output contract"; return 1; }
  printf '%s' "$out" | grep -qE '^[[:space:]]*Lanes:' \
    || { echo "no 'Lanes:' line; a lane silently skipped reads as a lane that found nothing"; return 1; }
  printf '%s' "$out" | grep -qE '[1-9][0-9]* finding' \
    || { echo "reported no findings; the fixture plants an interpolated SQL query"; return 1; }
  printf '%s' "$out" | grep -qE '[A-Za-z0-9_./-]+\.(py|js|ts|sh|mjs):[0-9]+' \
    || { echo "no file:line on any finding; a claim about code without a location is a guess"; return 1; }
  return 0
}

# deepwork: the numbered stage map at skills/deepwork/SKILL.md:141-150. Every
# stage names an artefact, so a prose plan with no numbering is the thing this
# rejects — that is exactly what the skill replaces.
check_deepwork() {
  local out; out="$(cat)"
  local stages
  stages=$(printf '%s\n' "$out" | grep -coE 'Stage[[:space:]]+[0-9]+:' | tr -d ' ')
  printf '%s' "$out" | grep -qE 'Stage[[:space:]]+1:' \
    || { echo "no 'Stage 1:' line; the stage map is the artefact this skill produces"; return 1; }
  [ "${stages:-0}" -ge 2 ] \
    || { echo "found $stages numbered stage(s); a stage map is at least two"; return 1; }
  return 0
}

# deep-interview: the ambiguity score table at skills/deep-interview/SKILL.md:39-51
# and the total that gates it, reported "so the gate is visible, not implied".
# It must also still be asking rather than building — the stop is the whole skill.
check_deep_interview() {
  local out; out="$(cat)"
  local dim hits=0
  for dim in Outcome Scope Users Constraints Success Failure; do
    printf '%s' "$out" | grep -q "$dim" && hits=$((hits + 1))
  done
  [ "$hits" -ge 4 ] \
    || { echo "named $hits of 6 ambiguity dimensions; the score table is the gate"; return 1; }
  printf '%s' "$out" | grep -qE 'Total[^0-9]{0,20}[0-9]+' \
    || { echo "no total score reported; the threshold gate is then implied, not visible"; return 1; }
  printf '%s' "$out" | grep -qiE 'i (have )?(implemented|created the|wrote the) ' \
    && { echo "started building; the skill stops for approval before any code"; return 1; }
  return 0
}

# verification-planning: skills/verification-planning/SKILL.md:14-55 — an evidence
# path, and every check on it able to fail. The skill names its own anti-pattern
# verbatim ("I reviewed it and it looks right" is not a check), so proposing that
# as the evidence is a fail even when the phrase "evidence path" is present.
#
# This is the weakest case of the thirteen: the skill specifies no output format,
# so there is no artefact only it emits.
check_verification_planning() {
  local out; out="$(cat)"
  printf '%s' "$out" | grep -qi 'evidence path' \
    || { echo "no evidence path; that is the artefact the skill exists to build"; return 1; }
  printf '%s' "$out" | grep -qE '(pytest|python3?|npm|pnpm|yarn|node|bash|make|cargo|go test|git diff|curl|\./[A-Za-z0-9_./-]+)' \
    || { echo "no runnable command named; a path nobody can execute is not a path"; return 1; }
  printf '%s' "$out" | grep -qiE 'looks right|eyeball|manual(ly)? review|read (it|through) carefully' \
    && { echo "offers inspection as a check; the skill rules that out explicitly"; return 1; }
  return 0
}

# simplify: the finding tags at skills/simplify/SKILL.md:154-156. Tagging is what
# separates this skill from a tidy-up — the tag names which rung of the ladder
# fired, so untagged prose means the ladder was never climbed.
check_simplify() {
  local out; out="$(cat)"
  printf '%s' "$out" | grep -qE '(delete|stdlib|native|yagni|shrink):' \
    || { echo "no delete:/stdlib:/native:/yagni:/shrink: tag; every finding must carry one"; return 1; }
  printf '%s' "$out" | grep -qE '[A-Za-z0-9_./-]+\.(py|js|ts|tsx|sh|mjs)' \
    || { echo "no file named; a simplification with no location cannot be checked"; return 1; }
  return 0
}

# codemap: the gate at skills/codemap/SKILL.md:12-22 — say what it costs, say what
# it will write, and get a yes FIRST. This is the only skill case with evidence
# outside the text: the fixture must still be clean afterwards. A skill that
# announced the gate and then wrote anyway fails on the filesystem, not the prose.
check_codemap() {
  local out; out="$(cat)"
  printf '%s' "$out" | grep -qiE 'expensive|cost|\$|minutes' \
    || { echo "did not announce the cost; the skill must state it before starting"; return 1; }
  printf '%s' "$out" | grep -q 'codemap.md' \
    || { echo "did not say it writes codemap.md into the repository"; return 1; }
  printf '%s' "$out" | grep -qiE 'shall i|should i|do you want|want me to|go ahead|proceed|confirm' \
    || { echo "did not ask; reaching for it unprompted is correct, doing so silently is not"; return 1; }
  printf '%s' "$out" | grep -q '?' \
    || { echo "no question asked before writing"; return 1; }
  if [ -n "$SMOKE_FIXTURE" ]; then
    local written
    written="$(find "$SMOKE_FIXTURE" \( -name 'codemap.md' -o -name 'codemap.json' \) -print -quit 2>/dev/null)"
    [ -z "$written" ] \
      && return 0 || { echo "wrote $written before the gate; the ask is not decoration"; return 1; }
  fi
  return 0
}

# council: skills/council/SKILL.md:119-141 — the three seats named, and the
# consensus level. Per-seat detail is what the caller paid three dispatches for,
# so a collapsed single answer fails even when the answer is good.
check_council() {
  local out; out="$(cat)"
  printf '%s' "$out" | grep -qi 'consensus level' \
    || { echo "no 'Consensus level:' line; that is the summary's required field"; return 1; }
  local seat
  for seat in alpha beta gamma; do
    printf '%s' "$out" | grep -qi "$seat" \
      || { echo "seat $seat missing; a seat that failed is named, never silently omitted"; return 1; }
  done
  return 0
}

# =============================================================================
# Sourcing this file defines the checkers and runs nothing, so they can be tested
# against known-bad input from elsewhere. A checker that cannot fail proves
# nothing, which is the same trap REINFORCEMENT.tsv exists to avoid one
# directory over.
# =============================================================================
if [ "${BASH_SOURCE[0]}" != "${0}" ]; then
  return 0 2>/dev/null || true
fi

# =============================================================================
# Fixtures
#
# Every case that could write runs in a throwaway tree under $TMPDIR, never in
# this repository. That is not just tidiness: the runner derives --allowedTools
# from it, so a case WITHOUT a fixture is handed a read-only tool set and
# structurally cannot touch the working tree. codemap in particular writes a
# codemap.md into every directory it maps and edits AGENTS.md, and would
# otherwise do that here.
# =============================================================================

FIXTURES=()

new_fixture() {
  mktemp -d "${TMPDIR:-/tmp}/omc-smoke.XXXXXX"
}

# Only ever removes a directory this script made, by name. rm -rf deserves a
# guard that does not depend on the array being right.
cleanup_fixtures() {
  local dir
  for dir in "${FIXTURES[@]:-}"; do
    case "$dir" in
      */omc-smoke.*) [ -d "$dir" ] && rm -rf "$dir" ;;
    esac
  done
}
trap cleanup_fixtures EXIT

init_git_repo() {
  local dir="$1"
  git -C "$dir" init -q >/dev/null 2>&1
  git -C "$dir" symbolic-ref HEAD refs/heads/main >/dev/null 2>&1
  git -C "$dir" config user.email "smoke@example.invalid"
  git -C "$dir" config user.name "smoke"
  git -C "$dir" config commit.gpgsign false
}

commit_all() {
  local dir="$1" message="$2"
  git -C "$dir" add -A >/dev/null 2>&1
  git -C "$dir" commit -qm "$message" >/dev/null 2>&1
}

# A small committed service the planning skills can reason about concretely.
# deepwork writes a progress file and deep-interview writes a spec, so neither
# can be pointed at the real repository.
fixture_scratch() {
  local dir; dir="$(new_fixture)" || return 1
  mkdir -p "$dir/app"
  cat >"$dir/app/store.py" <<'PY'
"""In-memory record store. Process-local, lost on restart."""

_RECORDS = {}


def save(record_id, payload):
    _RECORDS[record_id] = payload
    return record_id


def load(record_id):
    return _RECORDS.get(record_id)


def all_records():
    return list(_RECORDS.items())
PY
  cat >"$dir/app/api.py" <<'PY'
from app import store


def put_record(record_id, payload):
    if not record_id:
        raise ValueError("record_id is required")
    return store.save(record_id, payload)


def get_record(record_id):
    record = store.load(record_id)
    if record is None:
        raise KeyError(record_id)
    return record


def list_records():
    return sorted(store.all_records())
PY
  printf '# scratch service\n\nTwo modules: app/store.py holds records, app/api.py exposes them.\n' >"$dir/README.md"
  init_git_repo "$dir"
  commit_all "$dir" "initial"
  printf '%s' "$dir"
}

# A shared function missing a guard that three callers depend on. The spec in the
# prompt names the fix; the case asserts fixer returned its verification block.
fixture_fixer() {
  local dir; dir="$(new_fixture)" || return 1
  cat >"$dir/stats.py" <<'PY'
def mean(values):
    return sum(values) / len(values)


def daily_average(readings):
    return mean(readings)


def weekly_average(readings):
    return mean(readings)


def sensor_average(readings):
    return mean([r for r in readings if r is not None])
PY
  init_git_repo "$dir"
  commit_all "$dir" "initial"
  printf '%s' "$dir"
}

# One header component with three findable interface defects: a div acting as a
# button, #aaa on #ffffff (about 2.3:1), and no focus style anywhere.
fixture_designer() {
  local dir; dir="$(new_fixture)" || return 1
  cat >"$dir/Header.tsx" <<'TSX'
export function Header({ onSignIn }: { onSignIn: () => void }) {
  return (
    <header style={{ background: "#ffffff", padding: 24 }}>
      <span style={{ fontSize: 20 }}>Acme</span>
      <div
        onClick={onSignIn}
        style={{ color: "#aaaaaa", background: "#ffffff", padding: 8, outline: "none" }}
      >
        Sign in
      </div>
    </header>
  );
}
TSX
  printf '%s' "$dir"
}

# A bug with three genuinely competing causes: the lexical sort in versions.py,
# the cache that would hold a stale result across a fix, and the second sort in
# report.py that overrides whatever the first one returned. The "fix" commit
# touched the sort that does not decide the output, which is why it is still
# broken — and why git history is part of the evidence.
fixture_tracer() {
  local dir; dir="$(new_fixture)" || return 1
  mkdir -p "$dir"
  cat >"$dir/versions.py" <<'PY'
_CACHE = {}


def sorted_versions(names):
    key = tuple(names)
    if key in _CACHE:
        return _CACHE[key]
    result = sorted(names)
    _CACHE[key] = result
    return result
PY
  cat >"$dir/report.py" <<'PY'
from versions import sorted_versions


def render(names):
    ordered = sorted_versions(names)
    return "\n".join(sorted(ordered))
PY
  init_git_repo "$dir"
  commit_all "$dir" "initial"
  cat >"$dir/report.py" <<'PY'
from versions import sorted_versions


def render(names):
    ordered = sorted_versions(names)
    return "\n".join(sorted(ordered, key=lambda n: [int(p) for p in n.split(".")]))
PY
  commit_all "$dir" "fix: sort versions numerically, not lexically"
  cat >"$dir/report.py" <<'PY'
from versions import sorted_versions


def render(names):
    ordered = sorted_versions(names)
    return "\n".join(sorted(ordered))
PY
  commit_all "$dir" "revert the render change, it did not help"
  printf '%s' "$dir"
}

# A git repository with an uncommitted diff of about eighty lines, carrying one
# unambiguous flaw: the search term is interpolated straight into SQL. Over the
# ~50-line threshold on purpose, so review must dispatch its lanes and
# subagent_stats becomes real evidence alongside the header line.
fixture_review() {
  local dir; dir="$(new_fixture)" || return 1
  mkdir -p "$dir/app"
  cat >"$dir/app/db.py" <<'PY'
import sqlite3


def connect(path):
    return sqlite3.connect(path)


def query(conn, sql, params=()):
    cursor = conn.execute(sql, params)
    return cursor.fetchall()
PY
  printf 'def health():\n    return "ok"\n' >"$dir/app/users.py"
  init_git_repo "$dir"
  commit_all "$dir" "initial"
  cat >"$dir/app/users.py" <<'PY'
from app.db import connect, query

DB_PATH = "users.db"
PAGE_SIZE = 25


def health():
    return "ok"


def _open():
    return connect(DB_PATH)


def get_user(user_id):
    conn = _open()
    rows = query(conn, "SELECT id, email, display_name FROM users WHERE id = ?", (user_id,))
    if not rows:
        return None
    return _row_to_user(rows[0])


def list_users(page=0):
    conn = _open()
    offset = page * PAGE_SIZE
    rows = query(
        conn,
        "SELECT id, email, display_name FROM users ORDER BY id LIMIT ? OFFSET ?",
        (PAGE_SIZE, offset),
    )
    return [_row_to_user(row) for row in rows]


def search_users(term, page=0):
    conn = _open()
    offset = page * PAGE_SIZE
    sql = (
        "SELECT id, email, display_name FROM users "
        f"WHERE display_name LIKE '%{term}%' "
        f"ORDER BY id LIMIT {PAGE_SIZE} OFFSET {offset}"
    )
    rows = query(conn, sql)
    return [_row_to_user(row) for row in rows]


def deactivate_user(user_id):
    conn = _open()
    query(conn, "UPDATE users SET active = 0 WHERE id = ?", (user_id,))
    conn.commit()
    return True


def _row_to_user(row):
    return {
        "id": row[0],
        "email": row[1],
        "display_name": row[2],
    }


def display_name_for(user_id):
    user = get_user(user_id)
    if user is None:
        return "unknown"
    return user["display_name"]


def emails_for(user_ids):
    return [get_user(uid)["email"] for uid in user_ids if get_user(uid)]
PY
  printf '%s' "$dir"
}

# Over-built on purpose, one instance per rung of the ladder: a factory with a
# single product, a config block nobody reads, and two hand-rolled functions the
# standard library already ships.
fixture_simplify() {
  local dir; dir="$(new_fixture)" || return 1
  cat >"$dir/notify.py" <<'PY'
import itertools

CONFIG = {
    "transport": "email",
    "retry_backoff_base": 2,
    "enable_email": True,
    "enable_pager": False,
}


class EmailNotifier:
    def send(self, address, body):
        return f"sent to {address}: {body}"


class NotifierFactory:
    @staticmethod
    def create(kind="email"):
        if kind == "email":
            return EmailNotifier()
        raise ValueError(kind)


def chunk(items, size):
    out = []
    current = []
    for item in items:
        current.append(item)
        if len(current) == size:
            out.append(current)
            current = []
    if current:
        out.append(current)
    return out


def unique(items):
    seen = []
    for item in items:
        if item not in seen:
            seen.append(item)
    return seen


def notify_all(addresses, body):
    notifier = NotifierFactory.create()
    results = []
    for batch in chunk(unique(addresses), 10):
        for address in batch:
            results.append(notifier.send(address, body))
    return list(itertools.chain(results))
PY
  init_git_repo "$dir"
  commit_all "$dir" "initial"
  printf '%s' "$dir"
}

# A throwaway tree for codemap to want to map. It has no codemap.md, no
# .slim/codemap.json and no AGENTS.md, so anything the checker finds afterwards
# was written past the gate.
fixture_codemap() {
  local dir; dir="$(new_fixture)" || return 1
  mkdir -p "$dir/src/api" "$dir/src/store"
  printf 'from src.store import records\n\n\ndef handle_get(record_id):\n    return records.load(record_id)\n' >"$dir/src/api/handlers.py"
  printf 'ROUTES = {"/records/<id>": "handle_get"}\n' >"$dir/src/api/routes.py"
  printf '_DATA = {}\n\n\ndef load(record_id):\n    return _DATA.get(record_id)\n\n\ndef save(record_id, value):\n    _DATA[record_id] = value\n' >"$dir/src/store/records.py"
  printf '{"name": "scratch", "version": "0.1.0"}\n' >"$dir/package.json"
  init_git_repo "$dir"
  commit_all "$dir" "initial"
  printf '%s' "$dir"
}

# =============================================================================
# Non-vacuity: every checker rejects a realistic bad output and accepts a
# realistic good one.
#
# This is the part that keeps the rest honest. A checker nobody has watched fail
# manufactures confidence, and the skill checkers need it most — they assert an
# output shape, so it must be shown that the shape is actually load-bearing and
# not satisfied by any fluent paragraph.
#
#   ./scripts/bench/smoke-contracts.sh --self-test
# =============================================================================

st_pass=0
st_fail=0

# expect <checker> <accept|reject> <label>, sample on stdin
expect() {
  local checker="$1" want="$2" label="$3" sample got reason
  sample="$(cat)"
  if reason="$(printf '%s\n' "$sample" | "$checker")"; then got="accept"; else got="reject"; fi
  if [ "$got" = "$want" ]; then
    st_pass=$((st_pass + 1))
    printf '  ok    %-28s %-7s %s\n' "$checker" "$want" "$label"
  else
    st_fail=$((st_fail + 1))
    printf '  FAIL  %-28s want %s, got %s — %s\n' "$checker" "$want" "$got" "$label"
    [ -n "$reason" ] && printf '        reason: %s\n' "$reason"
  fi
}

run_self_test() {
  echo "non-vacuity: each checker against one realistic good and one realistic bad output"
  echo

  expect check_explorer accept "map with file:line, no advice" <<'EOF'
<files>
hooks/verify-deliverables.mjs:31  MAX_TRANSCRIPT_BYTES, the cap itself
hooks/verify-deliverables.mjs:88  where the cap is applied to the read
</files>
<answer>
The cap is defined at hooks/verify-deliverables.mjs:31 and enforced at :88.
</answer>
EOF

  expect check_explorer reject "drifted into proposing a fix" <<'EOF'
<files>
hooks/verify-deliverables.mjs:31  MAX_TRANSCRIPT_BYTES, the cap itself
</files>
<answer>
The cap is at hooks/verify-deliverables.mjs:31. You should change it to stream
the file instead, and the next step is to add a test.
</answer>
EOF

  expect check_oracle accept "verdict with a location, no writes" <<'EOF'
No. Shelling out to a destructive-then-restore suite from a routine checker
puts an uncommitted tree one crash away from loss — scripts/check-coverage.sh:212
is the call site. Keep the mutation suite behind its own entry point.
EOF

  expect check_oracle reject "claims to have applied the change" <<'EOF'
Agreed, that design is wrong. I have updated scripts/check-coverage.sh to run
the mutation suite behind a flag instead.
EOF

  expect check_librarian accept "claim carries a source" <<'EOF'
`when_to_use` is not a documented skill frontmatter field; the supported set is
name and description.
Source: https://docs.claude.com/en/docs/claude-code/skills (read 2026-08-25)
EOF

  expect check_librarian reject "recalled, no source" <<'EOF'
As far as I recall, when_to_use is supported and its text loads with the skill
description at session start.
EOF

  expect check_fixer accept "full output contract" <<'EOF'
<summary>
mean() now raises a clear error on empty input instead of dividing by zero.
</summary>
<changes>
- stats.py — guard added in mean(), the shared function all three callers reach
</changes>
<verification>
- performed: python3 -c "import stats; stats.mean([])"
- result: passed
</verification>
EOF

  expect check_fixer reject "edits reported without a verification block" <<'EOF'
<summary>
mean() now raises a clear error on empty input instead of dividing by zero.
</summary>
<changes>
- stats.py — guard added in mean()
</changes>
I did not run anything, but the change is small and obviously correct.
EOF

  expect check_designer accept "located, concrete interface findings" <<'EOF'
Header.tsx:8 — the sign-in control is a div with onClick: no keyboard path and
no role. Header.tsx:10 — #aaaaaa on #ffffff is 2.3:1, under the 4.5:1 minimum,
and outline: none removes the focus ring with nothing replacing it.
EOF

  expect check_designer reject "vague advice with no location" <<'EOF'
The header could be stronger. Consider improving the accessibility and the
visual hierarchy, and giving the sign-in action more presence.
EOF

  expect check_tracer accept "three hypotheses, evidence both ways" <<'EOF'
<observation>
render(["9.0", "10.0"]) returns "10.0\n9.0".
</observation>
<hypotheses>
H1 versions.py sorts lexically
   for:     versions.py:8 — plain sorted(names)
   against: none found
   verdict: likely
H2 _CACHE holds a pre-fix result
   for:     versions.py:5 — returns the cached list unconditionally
   against: report.py re-sorts afterwards, so the cache cannot decide the output
   verdict: ruled out
H3 report.py re-sorts and overrides
   for:     report.py:6 — sorted(ordered) with no key
   against: git log shows the key was reverted deliberately
   verdict: possible
</hypotheses>
<conclusion>
H1 and H3 both hold; the lexical sort at report.py:6 decides the output today.
</conclusion>
EOF

  expect check_tracer reject "one confident cause" <<'EOF'
<observation>
render(["9.0", "10.0"]) returns "10.0\n9.0".
</observation>
<conclusion>
versions.py:8 sorts lexically. That is the cause. Add a numeric key.
</conclusion>
EOF

  expect check_review accept "header, lanes, located finding" <<'EOF'
Review: fix first — 2 findings (1 critical, 1 required, 0 optional)
Lanes: correctness, completeness, simplicity, tests, security · skipped: data and schema (no migration)

NEEDS A DECISION
- [CRITICAL] (9/10) app/users.py:41 — the search term is interpolated into SQL
  Fix: bind it as a parameter alongside LIMIT and OFFSET
EOF

  expect check_review reject "fluent prose without the contract header" <<'EOF'
I read through the diff. The main problem is at app/users.py:41, where the
search term goes straight into the SQL string — that is an injection. Otherwise
it looks reasonable to me.
EOF

  expect check_deepwork accept "numbered stage map with artefacts" <<'EOF'
Rejected: keep the dict and add periodic JSON dumps — loses data on crash.

Stage 1: pin current behaviour → tests/test_store_contract.py, green on the dict
Stage 2: add the SQLite backend behind the same functions → app/store.py
Stage 3: migrate app/api.py callers → diff of app/api.py, contract tests still green
EOF

  expect check_deepwork reject "prose plan, no stage map" <<'EOF'
I would start by writing the SQLite schema, then swap the store over, then
update the API callers and check nothing broke.
EOF

  expect check_deep_interview accept "ambiguity table with a total" <<'EOF'
Before anything gets built, here is where the request sits:

Outcome     3
Scope       3
Users       2
Constraints 2
Success     3
Failure     2
Total       15 — well above the threshold of 4

Two questions to start: who opens this dashboard, and what decision do they
make from it?
EOF

  expect check_deep_interview reject "questions with no score table" <<'EOF'
Happy to help. What should the dashboard show, and who is it for? Once I know
that I can start on a first version.
EOF

  expect check_verification_planning accept "evidence path with runnable checks" <<'EOF'
Claim: swapping app/store.py to SQLite leaves app/api.py behaviour unchanged.

Evidence path, from the system itself:
1. `python3 -m pytest tests/test_api_contract.py` against the dict, recorded green
2. Same suite against SQLite — inputs reaching the assertion printed beside the verdict
3. `git diff --stat` to confirm no api.py behaviour moved with the storage change

Limitation: none of this covers concurrent writers; that needs a second path.
EOF

  expect check_verification_planning reject "names the path, offers inspection as the check" <<'EOF'
Evidence path: I will manually review each call site in app/api.py and confirm
the behaviour looks right after the swap.
EOF

  expect check_simplify accept "tagged findings against named files" <<'EOF'
notify.py findings:
- yagni: NotifierFactory produces one product — call EmailNotifier() directly
- stdlib: chunk() is itertools.batched (3.12+) or an islice loop
- delete: CONFIG["enable_pager"] is read nowhere
EOF

  expect check_simplify reject "untagged tidy-up prose" <<'EOF'
I made notify.py simpler. The factory is gone, the helpers read better now, and
the config is tidier than it was.
EOF

  expect check_codemap accept "announces cost, names writes, asks" <<'EOF'
Before I start: this is expensive. It reads the whole tree and dispatches one
fixer per directory — on this repo that is roughly $3 and several minutes.

It also writes into your repository: a codemap.md in src/api/ and src/store/,
.slim/codemap.json, and a Repository Map section in AGENTS.md.

Shall I go ahead?
EOF

  expect check_codemap reject "starts mapping without the gate" <<'EOF'
Mapping the repository now. I will begin with src/api/ and work down the tree.
EOF

  # The same good text, with the fixture showing a file was written anyway. This
  # is the sub-assertion that no format imitation can satisfy.
  local written_dir
  written_dir="$(new_fixture)" && FIXTURES+=("$written_dir")
  printf '# src/api/\n' >"$written_dir/codemap.md"
  SMOKE_FIXTURE="$written_dir"
  expect check_codemap reject "gate announced but a codemap.md was written anyway" <<'EOF'
Before I start: this is expensive, roughly $3 and several minutes. It writes a
codemap.md into every mapped directory and a section in AGENTS.md.

Shall I go ahead?
EOF
  SMOKE_FIXTURE=""

  expect check_council accept "consensus level and all three seats" <<'EOF'
### Council Response
Move to SQLite. Both alternatives lose durability at the same cost.

### Per-Seat Details
- alpha: a JSON file has no atomic write path; a crash mid-dump truncates it. High.
- beta: sqlite3 is in the standard library, so this adds no dependency. High.
- gamma: app/store.py:1 already documents "lost on restart" as a known gap. Medium.

### Council Summary
- Consensus level: unanimous
- Remaining uncertainty: three seats of one lineage agreeing is weaker than
  cross-vendor consensus; treat the agreement accordingly.
EOF

  expect check_council reject "collapsed into one answer, no seats" <<'EOF'
### Council Response
Move to SQLite — it is in the standard library and gives you durability and
atomic writes for nothing. That is the recommendation.
EOF

  # A fixture that fails to build fails its case with no evidence either way, and
  # nothing else in a dry run would notice. Build each one for real.
  echo
  local builder dir files review_dir=""
  for builder in fixture_scratch fixture_fixer fixture_designer fixture_tracer \
                 fixture_review fixture_simplify fixture_codemap; do
    dir="$("$builder")"
    if [ -z "$dir" ] || [ ! -d "$dir" ]; then
      st_fail=$((st_fail + 1)); printf '  FAIL  %-28s did not build\n' "$builder"; continue
    fi
    FIXTURES+=("$dir")
    [ "$builder" = "fixture_review" ] && review_dir="$dir"
    files="$(find "$dir" -type f -not -path '*/.git/*' | wc -l | tr -d ' ')"
    if [ "$files" -lt 1 ]; then
      st_fail=$((st_fail + 1)); printf '  FAIL  %-28s built an empty tree\n' "$builder"
    else
      st_pass=$((st_pass + 1)); printf '  ok    %-28s builds  %s files\n' "$builder" "$files"
    fi
  done

  # review's `skill:1` case rests on the fixture clearing the ~50-changed-line
  # threshold at skills/review/SKILL.md:117-121. Under it the skill correctly
  # runs its lanes in-thread and spawns nothing, and the case would then fail on
  # the fixture rather than on the contract — the worst kind of red.
  local changed
  changed="$(git -C "$review_dir" diff --numstat 2>/dev/null | awk '{n+=$1+$2} END{print n+0}')"
  if [ "${changed:-0}" -gt 50 ]; then
    st_pass=$((st_pass + 1)); printf '  ok    %-28s %s changed lines, over the dispatch threshold\n' "fixture_review diff" "$changed"
  else
    st_fail=$((st_fail + 1)); printf '  FAIL  %-28s %s changed lines; review will not dispatch under ~50\n' "fixture_review diff" "${changed:-0}"
  fi

  echo
  echo "$st_pass passed, $st_fail failed."
  [ "$st_fail" -eq 0 ] || return 1
  return 0
}

if [ -n "$SELF_TEST" ]; then
  run_self_test
  exit $?
fi

command -v claude >/dev/null 2>&1 || { echo "claude not on PATH"; exit 1; }

# =============================================================================
# Cases:  name | kind | checker | fixture | max-turns | prompt
#
# kind is how invocation is proven, and the two halves differ in strength:
#   agent    — subagent_stats must report this agent spawned. Harness-counted.
#   skill    — output shape only. See the caveat above the skill checkers.
#   skill:N  — output shape AND at least N subagents, for the skills that dispatch.
#
# fixture is `-` for a case that runs against this repository, or the function
# that builds a throwaway tree under $TMPDIR. Only the latter gets write tools.
#
# max-turns is per case because the work is not the same size: explorer answers
# one question, council runs three oracles and a synthesis.
# =============================================================================
CASES=(
  # --- Agents: subagent_stats is real evidence -------------------------------
  "explorer|agent|check_explorer|-|12|Use the omc-slim explorer agent. Where is the transcript size cap defined and enforced in this repository's hook?"
  "oracle|agent|check_oracle|-|12|Use the omc-slim oracle agent. Is shelling out to a destructive-then-restore mutation suite from inside a routine repository checker the right design here?"
  "librarian|agent|check_librarian|-|12|Use the omc-slim librarian agent. Is when_to_use a currently supported Claude Code skill frontmatter field, and when is its text loaded?"
  "fixer|agent|check_fixer|fixture_fixer|20|Use the omc-slim fixer agent with this spec: stats.py mean() divides by zero on an empty list. Add the guard in the shared function rather than in each of the three callers, and leave one runnable check behind."
  "designer|agent|check_designer|fixture_designer|14|Use the omc-slim designer agent in review mode. Review Header.tsx and report the interface problems you find. Do not change the file."
  "tracer|agent|check_tracer|fixture_tracer|18|Use the omc-slim tracer agent. render([\"9.0\", \"10.0\"]) returns \"10.0\" before \"9.0\". I already tried fixing the sort and it is still broken. Why?"

  # --- Skills: output shape is the evidence, and it is weaker ----------------
  # review and council also assert subagent_stats; the other five cannot.
  "review|skill:1|check_review|fixture_review|40|Use the omc-slim:review skill on the uncommitted changes in this repository."
  "deepwork|skill|check_deepwork|fixture_scratch|40|Use the omc-slim:deepwork skill. Migrate the in-memory store in app/store.py to SQLite without breaking the callers in app/api.py. Give me the stage map before doing anything."
  "deep-interview|skill|check_deep_interview|fixture_scratch|14|Use the omc-slim:deep-interview skill. I have an idea: build me a dashboard for this service."
  "verification-planning|skill|check_verification_planning|fixture_scratch|16|Use the omc-slim:verification-planning skill. How do I prove that switching app/store.py from a dict to SQLite did not break app/api.py?"
  "simplify|skill|check_simplify|fixture_simplify|28|Use the omc-slim:simplify skill on notify.py."
  "codemap|skill|check_codemap|fixture_codemap|10|Use the omc-slim:codemap skill on this repository."
  "council|skill:3|check_council|fixture_scratch|45|I have already accepted the cost of three seats. Use the omc-slim:council skill. Should app/store.py move to SQLite or to a JSON file on disk? Data is already being written, so this is expensive to reverse."
)

# The denominator is read off disk, not hard-coded, so adding a fourteenth
# component and forgetting to smoke-test it turns this line red instead of
# silently reporting full coverage of a smaller plugin.
count_components() {
  local file total=0
  for file in "$ROOT"/agents/*.md "$ROOT"/skills/*/SKILL.md; do
    [ -f "$file" ] && total=$((total + 1))
  done
  printf '%s' "$total"
}

echo "plugin dir : $ROOT"
if [ -n "$EXECUTE" ]; then echo "mode       : EXECUTE (spends money)"; else echo "mode       : dry run"; fi
echo

pass=0; fail=0; total_cost="0"
for spec in "${CASES[@]}"; do
  IFS='|' read -r name kind checker fixture turns prompt <<<"$spec"

  # A case with a throwaway tree may write in it; a case running against this
  # repository may not. Same tool string as run-arm.sh:50 for the write set.
  if [ "$fixture" = "-" ]; then
    tools="Read Bash Glob Grep"
  else
    tools="Read Write Edit Bash Glob Grep"
  fi

  if [ -z "$EXECUTE" ]; then
    printf '  %-22s %-8s %-18s turns=%-3s %s\n' "$name" "$kind" "$fixture" "$turns" "$checker"
    continue
  fi

  printf '  %-22s ' "$name"

  workdir="$ROOT"
  SMOKE_FIXTURE=""
  if [ "$fixture" != "-" ]; then
    workdir="$("$fixture")"
    if [ -z "$workdir" ] || [ ! -d "$workdir" ]; then
      echo "FAIL  fixture $fixture did not build"; fail=$((fail + 1)); continue
    fi
    FIXTURES+=("$workdir")
    SMOKE_FIXTURE="$workdir"
  fi

  argv=(claude -p "$prompt" --plugin-dir "$ROOT" --setting-sources "project" \
    --output-format json --allowedTools "$tools" --max-turns "$turns")

  envelope="$(cd "$workdir" && "${argv[@]}" </dev/null 2>/dev/null)"
  if [ -z "$envelope" ]; then
    echo "FAIL  (no response)"; fail=$((fail + 1)); continue
  fi

  read -r spawned kinds cost < <(printf '%s' "$envelope" | python3 -c '
import json, sys
d = json.load(sys.stdin)
st = d.get("subagent_stats") or {}
by = st.get("by_type") or {}
kinds = ",".join(sorted(by)) or "-"
print(st.get("spawned", 0), kinds, round(d.get("total_cost_usd") or 0, 4))
')
  response="$(printf '%s' "$envelope" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("result") or "")')"
  total_cost="$total_cost + $cost"

  # Dispatch evidence, before the contract check. For an agent the contract
  # check alone is vacuous: the main thread can cite file:line, include a URL and
  # avoid claiming a write entirely on its own, so a green contract proves
  # nothing about the agent. subagent_stats is the harness's own count, so it
  # cannot be talked into a number.
  case "$kind" in
    agent)
      if [ "${spawned:-0}" -lt 1 ]; then
        echo "FAIL  no subagent spawned; the main thread answered, so nothing was tested"
        fail=$((fail + 1)); continue
      fi
      case ",$kinds," in
        *",$name,"*|*"omc-slim:$name"*) : ;;
        *) echo "FAIL  spawned [$kinds], expected $name"; fail=$((fail + 1)); continue ;;
      esac
      evidence="agent ran"
      ;;
    skill|skill:*)
      min="${kind#skill}"; min="${min#:}"
      if [ -n "$min" ] && [ "${spawned:-0}" -lt "$min" ]; then
        echo "FAIL  spawned ${spawned:-0} subagents [$kinds], the skill must dispatch at least $min"
        fail=$((fail + 1)); continue
      fi
      if [ -n "$min" ]; then evidence="output shape + $spawned subagents"; else evidence="output shape only"; fi
      ;;
    *)
      echo "FAIL  unknown kind '$kind'"; fail=$((fail + 1)); continue ;;
  esac

  if reason="$(printf '%s' "$response" | "$checker")"; then
    echo "PASS  ($evidence, contract held, \$$cost)"; pass=$((pass + 1))
  else
    echo "FAIL  $reason"; fail=$((fail + 1))
  fi
done

covered="${#CASES[@]}"
components="$(count_components)"

if [ -z "$EXECUTE" ]; then
  echo
  echo "$covered of $components components covered"
  [ "$covered" -eq "$components" ] || echo "  ^ a component ships with no contract case; add one or say why."
  echo
  echo "Dry run. Re-run with --execute to actually spend."
  echo "Each case is one claude -p call against the working tree."
  echo "Re-run with --self-test to prove every checker can still fail."
  exit 0
fi

echo
echo "$pass passed, $fail failed.  total cost: \$$(python3 -c "print(round($total_cost, 4))")"
echo "$covered of $components components covered"
[ "$covered" -eq "$components" ] || echo "  ^ a component ships with no contract case; add one or say why."
[ "$fail" -eq 0 ] || exit 1
