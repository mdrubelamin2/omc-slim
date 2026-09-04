#!/usr/bin/env node
/**
 * omc-slim — verify-deliverables harness
 *
 * Runs verify-deliverables.mjs as a child process against the cases below and
 * checks only its observable contract: exit code, stdout JSON, stderr.
 *
 * Command verdicts have one more channel. A "check" and an "unknown" command
 * are both silence on stdout — that is the design, silence over accusation —
 * so the cases that pin how a command is read run the hook with
 * OMC_SLIM_DEBUG=1 and read the verdict from its `command:` trace on stderr.
 *
 * Fixtures use the real transcript shape ($.message.content[]) so the depth
 * bound in collectBlocks is exercised as it is in production.
 *
 * Self-contained: builds its fixtures in a temp dir and removes them. No
 * dependencies beyond node built-ins.
 *
 * Run: node hooks/verify-deliverables.test.mjs
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdtempSync,
  writeFileSync,
  rmSync,
  statSync,
  openSync,
  ftruncateSync,
  writeSync,
  closeSync,
  lstatSync,
  mkdirSync,
  symlinkSync,
  realpathSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// The mutation runner points this at a throwaway copy so it never has to write a
// mutant into the tracked file. Doing that in place corrupted the repo once: two
// concurrent runs each snapshotted while the other held a mutant, and the
// sha256 "restore verified" line matched the snapshot rather than the original.
const HOOK =
  process.env.OMC_SLIM_HOOK_PATH ??
  join(dirname(fileURLToPath(import.meta.url)), "verify-deliverables.mjs");

/** The cap the large-transcript fixture must exceed to prove anything. */
const OLD_CAP_BYTES = 2 * 1024 * 1024;

/** MAX_TRANSCRIPT_BYTES in the hook: over this, the transcript is not read. */
const CAP_BYTES = 64 * 1024 * 1024;
const OVER_CAP_BYTES = 65 * 1024 * 1024;

/** TAIL_CHUNK_BYTES in the hook; a fixture past this makes Stop's backward read cross a boundary. */
const CHUNK_BYTES = 1024 * 1024;

/**
 * Wall budget for the two pathological commands. Their parse is under 50 ms;
 * the rest is node start-up, and 500 ms still fails a quadratic scan of 40,000
 * characters by an order of magnitude.
 */
const TIMING_BUDGET_MS = 500;

/**
 * The only two fields the hook may emit. Anything else is a contract breach:
 * `hookSpecificOutput.additionalContext` continues the turn on Stop.
 */
const ALLOWED_FIELDS = new Set(["systemMessage", "suppressOutput"]);

const WRITE_ID = "toolu_01A";

/** The session every payload belongs to. */
const SESSION_ID = "sess-0001";

/**
 * A scratch path outside any project. `/tmp` on macOS is a symlink to
 * `/private/tmp`, which is the point: the hook must resolve both sides before
 * comparing, and the OS temp dir the fixtures live in is under `/var` rather
 * than `/tmp`, so the two never overlap.
 */
const SCRATCH_PATH = "/tmp/omc-slim-scratch-notes.md";

// --- fixture builders: real Claude Code transcript lines ----------------------

/** One tool call, in the envelope a real assistant turn carries. */
function assistantTool(id, name, input) {
  return {
    type: "assistant",
    message: {
      role: "assistant",
      content: [{ type: "tool_use", id, name, input }],
    },
  };
}

/**
 * One write-tool call, on the path field the real tool actually uses.
 *
 * `filePath` null ships a write with no path at all — the shape the hook has to
 * treat as unplaceable rather than as a write outside the project.
 */
function assistantWrite(id, name = "Edit", filePath = SCRATCH_PATH) {
  const key = name === "NotebookEdit" ? "notebook_path" : "file_path";
  return assistantTool(id, name, filePath === null ? {} : { [key]: filePath });
}

/** One shell command, the only evidence this hook has that a check ran. */
function assistantBash(id, command) {
  return assistantTool(id, "Bash", { command, description: "run it" });
}

/** One dispatch to another agent, whose own transcript this hook cannot see. */
function assistantDispatch(id) {
  return assistantTool(id, "Task", {
    subagent_type: "general-purpose",
    prompt: "run the suite and report",
  });
}

/** A write that lands in the project, so only the claim state can speak. */
function cleanInProjectWrite(root) {
  return [assistantWrite(WRITE_ID, "Edit", inProject(root)), toolResultOk(WRITE_ID)];
}

/** An in-project path under the fixture root. The parent dir need not exist. */
function inProject(root) {
  return join(root, "src", "x.ts");
}

function toolResultOk(id) {
  return {
    type: "user",
    message: {
      role: "user",
      content: [{ type: "tool_result", tool_use_id: id, content: "ok" }],
    },
  };
}

function toolResultDenied(id) {
  return {
    type: "user",
    message: {
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: id,
          is_error: true,
          content:
            "Claude requested permissions to use Edit, but you haven't granted it yet.",
        },
      ],
    },
  };
}

/** A Bash result on a non-zero exit: `is_error` true, the runner's own output as content. */
function toolResultFailed(id) {
  return {
    type: "user",
    message: {
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: id,
          is_error: true,
          content: "npm ERR! Test failed.  See above for more details.",
        },
      ],
    },
  };
}

/** One tool_result long enough to straddle a chunk boundary in Stop's backward read. */
function bigToolResult(id, bytes) {
  return {
    type: "user",
    message: {
      role: "user",
      content: [{ type: "tool_result", tool_use_id: id, content: "x".repeat(bytes) }],
    },
  };
}

function assistantText(text) {
  return {
    type: "assistant",
    message: { role: "assistant", content: [{ type: "text", text }] },
  };
}

function humanUser(text) {
  return {
    type: "user",
    message: { role: "user", content: [{ type: "text", text }] },
  };
}

/** Text the harness files under the user role. A copy of the hook's list: a prefix dropped there fails a case here. */
const HARNESS_USER_PREFIXES = [
  "<task-notification>",
  "<system-reminder>",
  "<command-name>",
  "<command-message>",
  "<local-command-stdout>",
  "<local-command-caveat>",
  "[Request interrupted",
];

/** A user-role line the harness wrote, opening with one of its prefixes. */
function harnessUser(prefix) {
  return {
    type: "user",
    message: { role: "user", content: `${prefix} by the harness]\nnot something the user typed` },
  };
}

/** A user-role line flagged `isMeta`: the harness's own note, whatever its text. */
function metaUser(text) {
  return {
    type: "user",
    isMeta: true,
    message: { role: "user", content: [{ type: "text", text }] },
  };
}

/** A user-role line the harness wrote: the summary that replaces compacted context. */
function compactSummary() {
  return {
    type: "user",
    isCompactSummary: true,
    message: { role: "user", content: "summary of the conversation so far..." },
  };
}

/** Assistant turns that invoke no tool at all, up to the byte count asked for. */
function paddedLines(targetBytes) {
  const pad = "x".repeat(2000);
  const lines = [];
  let bytes = 0;
  while (bytes < targetBytes) {
    const line = assistantText(`no write here ${lines.length} ${pad}`);
    bytes += JSON.stringify(line).length + 1;
    lines.push(line);
  }
  return lines;
}

/**
 * A session several megabytes long. Stop's backward read has to cross chunk
 * boundaries, join a line that straddles one, and pass an earlier turn before
 * it reaches the last human line; the forward scan then sees this turn only.
 */
function longSession(lastTurn, { earlierCheck = false } = {}) {
  return [
    humanUser("first request"),
    ...(earlierCheck ? [assistantBash("old", "npm test -- --run"), toolResultOk("old")] : []),
    ...paddedLines(1.5 * CHUNK_BYTES),
    assistantText("done with the first request"),
    humanUser("ship it"),
    assistantBash("big", "ls -la"),
    bigToolResult("big", 1.5 * CHUNK_BYTES),
    ...paddedLines(1.5 * CHUNK_BYTES),
    ...lastTurn,
  ];
}

function writeTranscript(root, name, lines) {
  const path = join(root, name);
  const jsonl = lines.map((line) => JSON.stringify(line)).join("\n");
  writeFileSync(path, jsonl + "\n"); // real transcripts end with a newline
  return path;
}

/** The Claude config dir every spawn against this fixture root is pointed at. */
function configDirFor(root) {
  return join(root, "claude-config");
}

/** One line of `bytes` bytes and no newline: a tail Stop's backward read must not join chunk by chunk. */
function singleLineTranscript(root, bytes) {
  const path = join(root, "one-line.jsonl");
  writeFileSync(path, Buffer.alloc(bytes, "x"));
  return path;
}

/**
 * A file over the cap. Sparse, so 65 MB costs no disk and no read time while
 * the cap holds. One real assistant line sits past the hole, so a hook that
 * does read it finds a turn with no write and warns — which is how the case
 * tells a cap that holds from one that broke.
 */
function sparseTranscript(root, bytes) {
  const path = join(root, "over-cap.jsonl");
  const fd = openSync(path, "w");
  try {
    ftruncateSync(fd, bytes);
    writeSync(fd, "\n" + JSON.stringify(assistantText("past the hole")) + "\n", bytes);
  } finally {
    closeSync(fd);
  }
  return path;
}

// --- runner -------------------------------------------------------------------

/** Build fixtures in a throwaway dir, run the hook against them, clean up. */
function runHook(buildStdin) {
  return spawnHook(buildStdin, "");
}

/** The same, with tracing on: only these cases tolerate output on stderr. */
function runHookWithDebug(buildStdin) {
  return spawnHook(buildStdin, "1");
}

/** The same, with the scan budget forced to 0 so the deadline fires at once. */
function runHookWithNoScanBudget(buildStdin) {
  return spawnHook(buildStdin, "", { OMC_SLIM_SCAN_BUDGET_MS: "0" });
}

/** The same, with the seam exported but EMPTY — the shape a shell hands you. */
function runHookWithBlankScanBudget(buildStdin) {
  return spawnHook(buildStdin, "", { OMC_SLIM_SCAN_BUDGET_MS: "" });
}

/** The same, with a value that is not a number at all. */
function runHookWithJunkScanBudget(buildStdin) {
  return spawnHook(buildStdin, "", { OMC_SLIM_SCAN_BUDGET_MS: "soon" });
}

function spawnHook(buildStdin, debugFlag, extraEnv = {}) {
  const root = mkdtempSync(join(tmpdir(), "omc-slim-verify-"));
  try {
    const env = {
      ...process.env,
      OMC_SLIM_DEBUG: debugFlag,
      CLAUDE_CONFIG_DIR: configDirFor(root),
      ...extraEnv,
    };
    const res = spawnSync(process.execPath, [HOOK], {
      input: buildStdin(root),
      encoding: "utf8",
      // The production budget: `timeout: 5` seconds in hooks.json. A slower
      // hook passes nothing here that would not be discarded in a session.
      timeout: 5_000,
      env,
    });
    if (res.error) throw res.error;
    return {
      status: res.status,
      stdout: res.stdout || "",
      stderr: res.stderr || "",
    };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function parseStdout(stdout) {
  try {
    return JSON.parse(stdout);
  } catch {
    return null;
  }
}

/** True of every case: exit 0, JSON stdout, suppressOutput, nothing else. */
function outputViolation(res) {
  if (res.status !== 0) return `expected exit 0, got ${res.status}`;
  const out = parseStdout(res.stdout);
  if (!out) return `expected JSON on stdout, got: ${res.stdout || "(empty)"}`;
  if (out.suppressOutput !== true)
    return `expected suppressOutput true, got ${out.suppressOutput}`;
  // The key set, not a subset: `hookSpecificOutput.additionalContext` re-enters
  // a finishing subagent and continues a Stop turn, and `continue: false` stops
  // all processing; each does it while exiting 0, so no exit-code assertion
  // covers them.
  const forbidden = Object.keys(out).filter((key) => !ALLOWED_FIELDS.has(key));
  if (forbidden.length)
    return `hook emitted forbidden field(s): ${forbidden.join(", ")}`;
  if (out.decision !== undefined)
    return `hook emitted decision ${JSON.stringify(out.decision)}`;
  if (out.continue !== undefined)
    return `hook emitted continue ${JSON.stringify(out.continue)}`;
  return null;
}

/** The above plus silence on stderr — every case except the traced ones. */
function contractViolation(res) {
  if (res.stderr !== "") return `expected empty stderr, got: ${res.stderr}`;
  return outputViolation(res);
}

/**
 * The two states get two messages, and each must be recognisable on its own.
 *
 * Asserting only "some warning appeared" would let the hook emit the no-write
 * message for a /tmp-only run — a message that is false in that state, which is
 * the defect these cases exist to close. So each phrase is pinned, and each
 * checker rejects the other state's phrase.
 */
const NO_WRITE_PHRASE = "no successful Edit/Write-family tool use";
const OUTSIDE_PHRASE = "landed outside the";

/** State 3, which is about the report rather than about the files. */
const CLAIM_PHRASE = "reported a verification result";

/** The claim advisory, and neither write-state phrase beside it. */
function claimViolation(out) {
  const { systemMessage } = out;
  if (typeof systemMessage !== "string")
    return "expected a systemMessage, got none";
  if (!systemMessage.includes(CLAIM_PHRASE))
    return `systemMessage did not report an unrun check: ${systemMessage}`;
  if (systemMessage.includes(NO_WRITE_PHRASE) || systemMessage.includes(OUTSIDE_PHRASE))
    return `the claim message carried a write-state message too: ${systemMessage}`;
  return null;
}

/**
 * State 3: a verification result asserted with nothing that ran a check.
 *
 * It rejects both write-state phrases, which is what pins the states as
 * independent: these fixtures write cleanly into the project, so a hook that
 * reports the claim as a write problem is saying something false.
 */
function expectClaimWarning(res) {
  const violation = contractViolation(res);
  if (violation) return violation;
  return claimViolation(parseStdout(res.stdout));
}

/**
 * Stop claim-miss: the user sees the advisory through `systemMessage`, and
 * nothing else is emitted. On Stop, `hookSpecificOutput.additionalContext`
 * continues the turn under the same loop protections as `decision: "block"`,
 * so the key-set check in outputViolation is what makes this a Stop contract.
 */
function expectStopClaim(res) {
  const violation = contractViolation(res);
  if (violation) return violation;
  const { systemMessage } = parseStdout(res.stdout);
  if (typeof systemMessage !== "string" || !systemMessage.includes(CLAIM_PHRASE))
    return `Stop claim missed the user-facing advisory: ${res.stdout}`;
  return null;
}

/** Tracing must go to stderr only: a stray console.log corrupts the JSON. */
function expectDebugTrace(res) {
  const violation = outputViolation(res);
  if (violation) return violation;
  const warning = claimViolation(parseStdout(res.stdout));
  if (warning) return warning;
  if (!res.stderr.startsWith("[omc-slim]"))
    return `expected an [omc-slim] trace on stderr, got: ${res.stderr || "(empty)"}`;
  return null;
}

function silenceViolation(out) {
  if ("systemMessage" in out) return `expected no systemMessage, got: ${out.systemMessage}`;
  return null;
}

function expectSilence(res) {
  const violation = contractViolation(res);
  if (violation) return violation;
  return silenceViolation(parseStdout(res.stdout));
}

/**
 * The verdicts the hook traced for the case's one command: `[omc-slim] command:
 * <verdicts> <text>`, verdicts comma-joined when the segments disagree.
 */
function tracedVerdicts(res) {
  const match = res.stderr.match(/\[omc-slim\] command: (\S+)/);
  return match === null ? null : match[1].split(",");
}

function verdictViolation(res, wanted, unwanted = null) {
  const verdicts = tracedVerdicts(res);
  if (verdicts === null)
    return `expected a traced command verdict, stderr: ${res.stderr || "(empty)"}`;
  if (!verdicts.includes(wanted))
    return `expected the command read as "${wanted}", got "${verdicts.join(",")}"`;
  if (unwanted !== null && verdicts.includes(unwanted))
    return `expected no "${unwanted}" segment, got "${verdicts.join(",")}"`;
  return null;
}

/** Silence, AND the command traced as a check: a check that stopped being one is otherwise indistinguishable from an unknown. */
function expectCheck(res) {
  const violation = outputViolation(res) ?? silenceViolation(parseStdout(res.stdout));
  if (violation) return violation;
  return verdictViolation(res, "check");
}

/** Silence, AND the command traced as unknown with no check segment beside it. */
function expectUnknown(res) {
  const violation = outputViolation(res) ?? silenceViolation(parseStdout(res.stdout));
  if (violation) return violation;
  return verdictViolation(res, "unknown", "check");
}

/** The claim advisory, AND the command traced as a non-check and nothing else. */
function expectNonCheck(res) {
  const violation = outputViolation(res) ?? claimViolation(parseStdout(res.stdout));
  if (violation) return violation;
  const verdicts = tracedVerdicts(res);
  if (verdicts === null || verdicts.join(",") !== "non-check")
    return `expected the command read as "non-check" only, got "${verdicts === null ? "(no trace)" : verdicts.join(",")}"`;
  return null;
}

/**
 * `cwd` defaults to the fixture root, which is what a real payload carries and
 * what the containment test measures against. A case passes null to model a
 * payload with no cwd at all. `lastMessage` null models a payload without
 * `last_assistant_message`, the shape a final message with no text block has.
 */
function payload(agentTranscript, root, cwd = root, lastMessage = null) {
  return JSON.stringify({
    transcript_path: agentTranscript,
    hook_event_name: "Stop",
    session_id: SESSION_ID,
    ...(cwd === null ? {} : { cwd }),
    ...(lastMessage === null ? {} : { last_assistant_message: lastMessage }),
  });
}

function stopPayload(root, { lastMessage, lines, stopHookActive = false, extra = {} }) {
  const transcript = writeTranscript(root, "session.jsonl", lines);
  return JSON.stringify({
    hook_event_name: "Stop",
    transcript_path: transcript,
    cwd: root,
    stop_hook_active: stopHookActive,
    ...(lastMessage === undefined ? {} : { last_assistant_message: lastMessage }),
    ...extra,
  });
}

/**
 * The same clean write and the same claim behind each command. Silence means
 * the command was read as a check or as unknown; the claim warning means it
 * was read as a non-check.
 */
function claimAfterCommand(command, claim = "All tests passing.", result = toolResultOk) {
  return (root) => {
    const transcript = writeTranscript(root, "agent.jsonl", [
      ...cleanInProjectWrite(root),
      assistantBash("bash1", command),
      result("bash1"),
      assistantText(claim),
    ]);
    return payload(transcript, root, root, claim);
  };
}

/** A final message behind a clean write and no command at all. */
function claimOnly(text) {
  return (root) => {
    const transcript = writeTranscript(root, "agent.jsonl", [
      ...cleanInProjectWrite(root),
      assistantText(text),
    ]);
    return payload(transcript, root, root, text);
  };
}

/** A Stop turn that ran `npm test`, then saw one non-human user line, then claimed. */
function stopClaimAcross(userLine) {
  return (root) =>
    stopPayload(root, {
      lastMessage: "All tests pass.",
      lines: [
        humanUser("fix it"),
        assistantBash("bash1", "npm test -- --run"),
        toolResultOk("bash1"),
        userLine,
        assistantText("All tests pass."),
      ],
    });
}

const timings = [];

/**
 * A case that must also finish inside TIMING_BUDGET_MS. The whole spawn is
 * timed, node start-up included, which is why the budget is ten times the
 * parse it guards.
 */
function timedCase(name, buildStdin, expectation) {
  let elapsedMs = 0;
  return {
    name,
    run: () => {
      const started = performance.now();
      const res = runHookWithDebug(buildStdin);
      elapsedMs = performance.now() - started;
      timings.push([name, elapsedMs]);
      return res;
    },
    check: (res) => {
      const violation = expectation(res);
      if (violation) return violation;
      if (elapsedMs >= TIMING_BUDGET_MS)
        return `took ${elapsedMs.toFixed(0)} ms, over the ${TIMING_BUDGET_MS} ms budget`;
      return null;
    },
  };
}

/** Commands the matcher must read as a check: wrappers, shells, runners, scripts, subcommands. */
const CHECK_COMMANDS = [
  "nx run app:test",
  "turbo run test:unit",
  "git diff --check",
  "timeout 60 pytest -q",
  "timeout -s KILL 60 pytest",
  "uv run pytest",
  "uv run --frozen pytest -q",
  "poetry run pytest",
  "poetry run --quiet pytest",
  "bundle exec rspec",
  "sudo env CI=1 timeout 60 pytest",
  "env CI=1 pytest",
  "nice -n 10 pytest",
  "yarn test:unit",
  "pnpm test:e2e",
  "npm run test-unit",
  "npm run check:types",
  "python3.12 -m pytest",
  "python manage.py test",
  "coverage run -m pytest",
  "(cd sub && npm test)",
  'sh -c "npm test"',
  "bash -lc 'pytest'",
  'bash -c "npm test && echo ok"',
  'bash -c "make test 2>&1 | tail -20"',
  "if npm test; then echo ok; fi",
  "for f in a b; do pytest $f; done",
  "! pytest",
  "{ npm test; }",
  "node --test",
  "node hooks/verify-deliverables.test.mjs",
  "bash skills/review/scripts/base.test.sh",
  "./run_tests.sh",
  "scripts/test.sh",
  "./scripts/check-coverage.sh",
  "php vendor/bin/phpunit",
  "php artisan test",
  "make",
  "make -j8",
  "mvn package",
  "mvn verify",
  "tox",
  "pyright",
  "just test",
  "cargo clippy",
  "ruff check .",
  "node_modules\\.bin\\jest.cmd",
  "C:\\Python\\Scripts\\pytest.exe -q",
  "docker compose exec -T web pytest",
  "docker run --rm -e CI=1 img npm test",
  "(cd sub && npm test) 2>&1 | tail -20",
  "(cd sub && npm test) > out.log",
  "cat > t.py <<'EOF'\nprint(1)\nEOF\npytest t.py",
  "npm test # runs the suite",
  "cargo fmt --check",
  "ruff format --check .",
  "dotnet format --verify-no-changes",
  "mix compile",
  "sbt compile",
  "mvn compile",
  "dart analyze",
  "gradle assemble",
];

/** Commands whose argv0 cannot run a check, or a known tool's fixed subcommand that is not one. */
const NON_CHECK_COMMANDS = [
  "npm ci",
  "gradle clean",
  "ruff format .",
  "cargo fmt",
  "grep -rn -- --check src/",
  "make clean",
  "coverage report",
  "git status --short",
  "ls -la src",
  "cat <<EOF\nnpm test\nEOF",
  "cat <<-EOF\n\tnpm test\n\tEOF",
  "cat <<EOF | tee out.txt\nnpm test\nEOF",
  "# run tests\ngit status",
  'git commit -m "wip\nnpm test"',
];

/**
 * Commands the parse cannot classify: a project script, a runner the tables do
 * not name, a make target or subcommand they do not list, a heredoc no line
 * closes.
 */
const UNKNOWN_COMMANDS = [
  "python analyze.py",
  "frobnicate --all",
  "./deploy.sh",
  "npm run deploy",
  "docker compose exec web",
  "docker build .",
  "make ci",
  "make unit",
  "rake spec",
  "just ci",
  "nx affected --target=test",
  "cargo run --bin x",
  "nx run app:serve",
  "dotnet restore",
  "mvn dependency:tree",
  "cat <<EOF\nnpm test",
];

/**
 * Assertions of success that carry a failure word only to deny it, or a
 * runner's own summary. "12 passed." on its own matches nothing but the bare
 * count rule; every timed variant is also caught by the "passed in N s" rule.
 */
const FLAGGED_CLAIMS = [
  "All 12 tests pass, no failures.",
  "45/45 passed, 0 failed.",
  "12 passed.",
  "12 passed in 0.4s.",
  "Build succeeded with no errors.",
  "Everything passed in 3s.",
  "Everything passed in 0.4s.",
  "Verified: the test suite passes.",
  "Verified against the build.",
  "All tests pass as expected.",
  "Nothing broken, tests pass.",
  "Error-free, tests pass.",
];

/** Sentences that mention passing or verifying without asserting a check ran. */
const NOT_CLAIMS = [
  "Ready for review once tests pass in CI.",
  "The CI badge shows all green.",
  "Tests passed before the refactor.",
  "All eleven verified.",
  "All verified.",
  "I grep-verified the rename across the tree.",
];

// --- cases --------------------------------------------------------------------

const cases = [

  {
    name: "malformed stdin does not crash",
    run: () => runHook(() => "{ not json"),
    check: expectSilence,
  },
  {
    name: "3 MB transcript is still scanned (regression: old 2 MB cap)",
    run: () =>
      runHook((root) => {
        const transcript = writeTranscript(
          root,
          "agent.jsonl",
          paddedLines(3 * 1024 * 1024),
        );
        const size = statSync(transcript).size;
        if (size <= OLD_CAP_BYTES)
          throw new Error(
            `fixture is ${size} bytes, under the old ${OLD_CAP_BYTES}-byte cap`,
          );
        return payload(transcript, root, root, "All tests pass.");
      }),
    check: expectClaimWarning,
  },
  {
    name: "debug tracing goes to stderr, never stdout",
    run: () =>
      runHookWithDebug((root) => {
        const transcript = writeTranscript(root, "agent.jsonl", [
          assistantBash("bash1", "git status"),
          toolResultOk("bash1"),
          assistantText("All tests pass."),
        ]);
        return payload(transcript, root, root, "All tests pass.");
      }),
    check: expectDebugTrace,
  },
  {
    // The over-cap fixture above holds no newline, so it trips the long-line
    // bail before the byte cap is ever consulted. This one is all newlines and
    // no human user line, so the backward walk runs until the cap stops it.
    // Removing the cap reads the whole file and the claim then speaks.
    name: "no human user line within the cap: the backward read stops",
    run: () =>
      runHook((root) => {
        const transcript = writeTranscript(
          root,
          "no-human.jsonl",
          paddedLines(CAP_BYTES + CHUNK_BYTES),
        );
        const size = statSync(transcript).size;
        if (size <= CAP_BYTES)
          throw new Error(`fixture is ${size} bytes, under the ${CAP_BYTES}-byte cap`);
        return payload(transcript, root, root, "All tests pass.");
      }),
    check: expectSilence,
  },
  {
    name: "transcript over the 64 MB cap is not read",
    run: () =>
      runHook((root) => {
        const transcript = sparseTranscript(root, OVER_CAP_BYTES);
        const size = statSync(transcript).size;
        if (size <= CAP_BYTES)
          throw new Error(
            `fixture is ${size} bytes, under the ${CAP_BYTES}-byte cap`,
          );
        return payload(transcript, root);
      }),
    check: expectSilence,
  },
  {
    // A FIFO stats as size 0, so the cap waves it through; readFileSync then
    // blocks with no timeout and the hook never exits. That breaks "always
    // exits 0" — the one invariant the README states in absolute terms. The
    // spawnSync timeout in runHook surfaces a hang as status null, which
    // outputViolation reports, so this case fails loudly if the guard is lost.
    name: "non-regular transcript stays silent",
    run: () =>
      runHook((root) => {
        const fifo = join(root, "agent.jsonl");
        spawnSync("mkfifo", [fifo]);
        if (!lstatSync(fifo).isFIFO())
          throw new Error("fixture is not a FIFO");
        return payload(fifo, root);
      }),
    check: expectSilence,
  },
  {
    // The scan deadline must fail SAFE: over budget the answer is "cannot
    // tell", never "wrote nothing", because the second is an accusation.
    //
    // The fixture holds NO write on purpose, and that choice is the whole test.
    // With a write in it, both a working deadline and a deleted one end silent
    // and the case proves nothing — the first draft of this test did exactly
    // that and the mutation run caught it. With no write, the two outcomes
    // diverge: the deadline abstains, its absence accuses. Budget 0 fires the
    // check on the first line, so this is deterministic, not timing-dependent.
    name: "scan over its budget abstains rather than accusing",
    run: () =>
      runHookWithNoScanBudget((root) => {
        const transcript = writeTranscript(root, "agent.jsonl", [
          assistantBash("bash1", "git status"),
          toolResultOk("bash1"),
          assistantText("All tests pass."),
        ]);
        return payload(transcript, root, root, "All tests pass.");
      }),
    check: expectSilence,
  },
  {
    // A blank override is the shape a shell actually produces — `export VAR=`,
    // or a CI runner passing an unset value through. `Number("")` is 0, so a
    // naive parse reads it as "budget zero", expires the deadline on line one
    // and mutes the hook for good. Blank must read as unset: same fixture as
    // the case above, opposite expectation.
    name: "a blank scan budget reads as unset, not as zero",
    run: () =>
      runHookWithBlankScanBudget((root) => {
        const transcript = writeTranscript(root, "agent.jsonl", [
          assistantBash("bash1", "git status"),
          toolResultOk("bash1"),
          assistantText("All tests pass."),
        ]);
        return payload(transcript, root, root, "All tests pass.");
      }),
    check: expectClaimWarning,
  },
  {
    // Same shape, one step further out: a value that is not a number must fall
    // back to the default, never to zero. Falling back to zero would be silent,
    // and silence is how this guard stops guarding.
    name: "a non-numeric scan budget falls back to the default",
    run: () =>
      runHookWithJunkScanBudget((root) => {
        const transcript = writeTranscript(root, "agent.jsonl", [
          assistantBash("bash1", "git status"),
          toolResultOk("bash1"),
          assistantText("All tests pass."),
        ]);
        return payload(transcript, root, root, "All tests pass.");
      }),
    check: expectClaimWarning,
  },

  // --- state 3: a verification result nothing in the transcript ran ----------
  // Every fixture below writes cleanly INTO the project, so the two write states
  // are silent and only the claim state can speak. That is deliberate: it proves
  // the states are independent rather than a rewording of each other. The claim
  // travels in `last_assistant_message`, as it does in a real payload.
  {
    // The measured failure, in the agent's own words: a benchmark of 45 Python
    // bug-fix tasks reported 45/45 complete and 26 held up against the real
    // suite. The transcript said this, and ran nothing.
    name: "a verification result with nothing that ran a check is flagged",
    run: () => runHook(claimOnly("[Round 3] 5/5 tests pass. Build successful! All verified.")),
    check: expectClaimWarning,
  },
  {
    // The same claim with a runner behind it. This is the ordinary, correct run,
    // and it is the case that must stay silent or the hook is unusable.
    name: "a verification result with a test run behind it stays silent",
    run: () => runHook(claimAfterCommand("npm test -- --run")),
    check: expectSilence,
  },
  {
    // A runner that exited non-zero proved nothing, and a "tests pass" written
    // over its failure is the exact report this state exists to catch.
    name: "a check that came back an error does not answer the claim",
    run: () => runHook(claimAfterCommand("npm test -- --run", "All tests pass.", toolResultFailed)),
    check: expectClaimWarning,
  },
  {
    name: "an error on a lone check is the check failing",
    run: () => runHook(claimAfterCommand("pytest", "All tests pass.", toolResultFailed)),
    check: expectClaimWarning,
  },
  {
    // One exit status for two commands. The commit failing is the likelier
    // reading, with the tests passed; charging the check with it accuses an
    // honest "All tests pass."
    name: "an error on a line of several commands is not charged to the check in it",
    run: () =>
      runHook(claimAfterCommand("npm test && git commit -m x", "All tests pass.", toolResultFailed)),
    check: expectSilence,
  },
  {
    // Reporting a failure is the behaviour this plugin asks for. Flagging it
    // would punish honesty, so a sentence carrying a failure is never a claim —
    // and the sentence has to contain a matching phrase too, or the case would
    // pass with the whole filter deleted.
    name: "a reported failure is not a claim",
    run: () => runHook(claimOnly("3 of 5 tests passed and 2 failed, so I stopped.")),
    check: expectSilence,
  },
  {
    // No `last_assistant_message` worth reading. There is no claim to test, and
    // "no claim" must never collapse into "an unverified claim".
    name: "an empty last_assistant_message with no assistant text stays silent",
    run: () =>
      runHook((root) => {
        const transcript = writeTranscript(root, "agent.jsonl", [
          ...cleanInProjectWrite(root),
        ]);
        return payload(transcript, root, root, "");
      }),
    check: expectSilence,
  },
  {
    // The field is absent when the final assistant message has no text block,
    // and the transcript is flushed on a timer, so it may not yet hold that
    // message when the hook runs: its last assistant text can be an earlier
    // one. No field, no claim to test. The hook abstains rather than read it.
    name: "a claim only in the transcript, with no last_assistant_message, stays silent",
    run: () =>
      runHook((root) => {
        const transcript = writeTranscript(root, "agent.jsonl", [
          ...cleanInProjectWrite(root),
          assistantText("All tests pass."),
        ]);
        return payload(transcript, root);
      }),
    check: expectSilence,
  },
  {
    // The work may have been delegated, and a dispatched agent runs its checks
    // in a transcript this hook never sees. Cannot rule it out, so say nothing.
    name: "a claim with a successful dispatch behind it stays silent",
    run: () =>
      runHook((root) => {
        const transcript = writeTranscript(root, "agent.jsonl", [
          ...cleanInProjectWrite(root),
          assistantDispatch("task1"),
          toolResultOk("task1"),
          assistantText("All tests pass."),
        ]);
        return payload(transcript, root, root, "All tests pass.");
      }),
    check: expectSilence,
  },
  {
    // `last_assistant_message` is the only text the hook reads. The
    // transcript's own last text is innocuous here, so a hook reading the
    // transcript instead falls silent and fails this case.
    name: "the payload's last_assistant_message is what gets read",
    run: () =>
      runHook((root) => {
        const transcript = writeTranscript(root, "agent.jsonl", [
          ...cleanInProjectWrite(root),
          assistantText("I made the change."),
        ]);
        return payload(transcript, root, root, "Typecheck clean.");
      }),
    check: expectClaimWarning,
  },
  {
    // A Bash block is not evidence of a check; a Bash block that looks like a
    // runner is. `git status --short` is a binary that cannot run one, so the
    // claim still stands unanswered.
    name: "a shell command that is not a check does not answer the claim",
    run: () => runHook(claimAfterCommand("git status --short", "All green.")),
    check: expectClaimWarning,
  },
  {
    // A dispatch that came back an error delegated nothing. Counting it would
    // let any failed Task silence the state permanently.
    name: "a failed dispatch is not work having been delegated",
    run: () =>
      runHook((root) => {
        const transcript = writeTranscript(root, "agent.jsonl", [
          ...cleanInProjectWrite(root),
          assistantDispatch("task1"),
          toolResultDenied("task1"),
          assistantText("The suite passes."),
        ]);
        return payload(transcript, root, root, "The suite passes.");
      }),
    check: expectClaimWarning,
  },
  {
    // No agent transcript means no evidence either way. The payload still
    // carries a claim, and a claim alone is not a finding: a transcript that
    // could not be read cannot show the check that did run.
    name: "a claim with no readable transcript stays silent",
    run: () =>
      runHook((root) =>
        JSON.stringify({
          hook_event_name: "Stop",
          transcript_path: join(root, "does-not-exist.jsonl"),
          cwd: root,
          last_assistant_message: "All tests pass.",
        }),
      ),
    check: expectSilence,
  },
  {
    // Real final messages mix an assertion with prose. Testing the whole message
    // against the hedge list finds "No other files" and falls silent on every
    // realistic report, which is how this state would quietly stop existing.
    name: "a claim still counts among sentences that hedge elsewhere",
    run: () => runHook(claimOnly("I fixed the bug. 45/45 pass. No other files were touched.")),
    check: expectClaimWarning,
  },
  {
    name: "the N-of-N phrasing is a claim",
    run: () => runHook(claimOnly("45 of 45 pass.")),
    check: expectClaimWarning,
  },
  {
    // argv0 is `git`. The command line contains "test" and that is not a check.
    name: "git log --oneline latest does not count as a check",
    run: () => runHook(claimAfterCommand("git log --oneline latest", "All tests pass.")),
    check: expectClaimWarning,
  },
  {
    name: "echo tests pass does not count as a check",
    run: () => runHook(claimAfterCommand("echo tests pass", "All tests pass.")),
    check: expectClaimWarning,
  },
  {
    name: "python -m pytest counts as a check",
    run: () => runHook(claimAfterCommand("python -m pytest -q")),
    check: expectSilence,
  },
  {
    name: "cd src && npm test still counts as a check",
    run: () => runHook(claimAfterCommand("cd src && npm test -- --run")),
    check: expectSilence,
  },

  // --- the three command verdicts, read from the trace -----------------------
  // A check and an unknown are both silent on stdout, so each command here is
  // also pinned to the verdict the hook traced for it. Silence alone would let
  // every runner in CHECK_COMMANDS degrade to "unknown" without a case failing.
  ...CHECK_COMMANDS.map((command) => ({
    name: `${JSON.stringify(command)} is a check`,
    run: () => runHookWithDebug(claimAfterCommand(command)),
    check: expectCheck,
  })),
  ...NON_CHECK_COMMANDS.map((command) => ({
    name: `${JSON.stringify(command)} is a non-check, and the claim stands`,
    run: () => runHookWithDebug(claimAfterCommand(command)),
    check: expectNonCheck,
  })),
  ...UNKNOWN_COMMANDS.map((command) => ({
    name: `${JSON.stringify(command)} is unknown, and the advisory abstains`,
    run: () => runHookWithDebug(claimAfterCommand(command)),
    check: expectUnknown,
  })),
  // A split on `\s*` before a literal is quadratic in the whitespace it fails
  // to match. Forty thousand spaces run nothing, so the claim stands; the
  // budget is what the case is for.
  timedCase(
    "a 40,000-space command is split in linear time",
    claimAfterCommand(" ".repeat(40_000)),
    expectNonCheck,
  ),
  // Twenty thousand tokens of wrappers. Over the token cap the segment is not
  // parsed at all: "unknown", in linear time. Without the cap the loop strips
  // every wrapper, finds nothing, and calls the empty command a non-check.
  timedCase(
    "`uv run` repeated 10,000 times is unknown, in linear time",
    claimAfterCommand("uv run ".repeat(10_000)),
    expectUnknown,
  ),
  {
    // `<<` after a digit is an arithmetic shift. Read as a heredoc it swallows
    // the line, and the `npm test` behind it stops counting; read as one whose
    // body never closes it is unknown, which is the wrong silence. Neither.
    name: "an arithmetic shift is not a heredoc",
    run: () => runHookWithDebug(claimAfterCommand("x=$((1<<2)); npm test")),
    check: (res) => expectCheck(res) ?? verdictViolation(res, "check", "unknown"),
  },

  ...FLAGGED_CLAIMS.map((text) => ({
    name: `"${text}" is a claim`,
    run: () => runHook(claimOnly(text)),
    check: expectClaimWarning,
  })),
  ...NOT_CLAIMS.map((text) => ({
    name: `"${text}" is not a claim`,
    run: () => runHook(claimOnly(text)),
    check: expectSilence,
  })),


  // --- Stop: the main thread's own claims, bounded to the current turn -------
  {
    name: "Stop flags a main-thread tests-pass claim with no runner",
    run: () =>
      runHook((root) =>
        stopPayload(root, {
          lastMessage: "All tests pass.",
          lines: [assistantText("I edited src/foo.ts by hand.")],
        }),
      ),
    check: expectStopClaim,
  },
  {
    name: "Stop stays silent when npm test ran",
    run: () =>
      runHook((root) =>
        stopPayload(root, {
          lastMessage: "All tests passing.",
          lines: [
            assistantBash("bash1", "npm test -- --run"),
            toolResultOk("bash1"),
            assistantText("All tests passing."),
          ],
        }),
      ),
    check: expectSilence,
  },
  {
    name: "Stop does not stack when stop_hook_active is set",
    run: () =>
      runHook((root) =>
        stopPayload(root, {
          lastMessage: "All tests pass.",
          stopHookActive: true,
          lines: [assistantText("All tests pass.")],
        }),
      ),
    check: expectSilence,
  },
  {
    // No field, no claim to test: abstain.
    name: "Stop abstains when last_assistant_message is absent",
    run: () =>
      runHook((root) =>
        stopPayload(root, {
          lines: [assistantText("All tests pass.")],
        }),
      ),
    check: expectSilence,
  },
  {
    // A check that ran in a child must not silence the parent. Stop reads
    // transcript_path, never a subagent's own.
    name: "Stop does not credit a check that ran only in a subagent transcript",
    run: () =>
      runHook((root) =>
        stopPayload(root, {
          lastMessage: "All tests pass.",
          lines: [assistantText("All tests pass.")],
          extra: {
            agent_transcript_path: writeTranscript(root, "agent.jsonl", [
              assistantBash("bash1", "npm test -- --run"),
              toolResultOk("bash1"),
            ]),
          },
        }),
      ),
    check: expectStopClaim,
  },
  {
    name: "Stop does not emit a write advisory on a chatty turn",
    run: () =>
      runHook((root) =>
        stopPayload(root, {
          lastMessage: "Here is the answer.",
          lines: [assistantText("Here is the answer.")],
        }),
      ),
    check: expectSilence,
  },
  {
    name: "Stop does not credit a check from an earlier turn",
    run: () =>
      runHook((root) =>
        stopPayload(root, {
          lastMessage: "All tests pass.",
          lines: [
            humanUser("run the suite"),
            assistantBash("old", "npm test -- --run"),
            toolResultOk("old"),
            assistantText("All tests pass."),
            humanUser("ship it"),
            assistantText("All tests pass."),
          ],
        }),
      ),
    check: expectStopClaim,
  },
  {
    name: "Stop stays silent when this turn ran npm test",
    run: () =>
      runHook((root) =>
        stopPayload(root, {
          lastMessage: "All tests passing.",
          lines: [
            humanUser("run the suite"),
            assistantBash("old", "npm test -- --run"),
            toolResultOk("old"),
            assistantText("old claim"),
            humanUser("again"),
            assistantBash("now", "npm test -- --run"),
            toolResultOk("now"),
            assistantText("All tests passing."),
          ],
        }),
      ),
    check: expectSilence,
  },
  // Harness-written user lines are not turns: the npm test before each one is
  // this turn's evidence. One case per prefix, so a prefix dropped from the
  // hook's list fails its own case rather than hiding behind the others.
  ...HARNESS_USER_PREFIXES.map((prefix) => ({
    name: `Stop does not treat a ${prefix} user line as a new turn`,
    run: () => runHook(stopClaimAcross(harnessUser(prefix))),
    check: expectSilence,
  })),
  {
    name: "Stop does not treat an isMeta user line as a new turn",
    run: () => runHook(stopClaimAcross(metaUser("Caveat: the messages below were generated by the harness."))),
    check: expectSilence,
  },
  {
    name: "Stop does not treat a compaction summary as a new turn",
    run: () => runHook(stopClaimAcross(compactSummary())),
    check: expectSilence,
  },
  // A session file runs to tens of megabytes, and Stop reads only its tail. The
  // three verdicts below match what a whole-file scan bounded to the last turn
  // would give; the fixture is long enough that the backward read crosses
  // chunk boundaries and joins a line that straddles one.
  {
    name: "Stop reads a long session's last turn: a claim with no runner is flagged",
    run: () =>
      runHook((root) =>
        stopPayload(root, {
          lastMessage: "All tests pass.",
          lines: longSession([assistantText("All tests pass.")]),
        }),
      ),
    check: expectStopClaim,
  },
  {
    name: "Stop reads a long session's last turn: its own npm test silences it",
    run: () =>
      runHook((root) =>
        stopPayload(root, {
          lastMessage: "All tests pass.",
          lines: longSession([
            assistantBash("now", "npm test -- --run"),
            toolResultOk("now"),
            assistantText("All tests pass."),
          ]),
        }),
      ),
    check: expectSilence,
  },
  {
    name: "Stop reads a long session's last turn: an earlier turn's npm test is ignored",
    run: () =>
      runHook((root) =>
        stopPayload(root, {
          lastMessage: "All tests pass.",
          lines: longSession([assistantText("All tests pass.")], { earlierCheck: true }),
        }),
      ),
    check: expectStopClaim,
  },
  {
    // The transcript is flushed on a timer. A tail that holds the human line
    // and nothing after it has not recorded this turn yet, and a claim judged
    // against it would be judged against nothing.
    name: "Stop abstains when the tail holds no assistant entry yet",
    run: () =>
      runHook((root) =>
        stopPayload(root, {
          lastMessage: "All tests pass.",
          lines: [humanUser("fix it")],
        }),
      ),
    check: expectSilence,
  },
  {
    // Joining the pending tail per chunk is quadratic in the line's length, and
    // one very long line then costs the hook a gigabyte. Past eight chunks the
    // read gives up. The fixture is silent either way — a line of x's holds no
    // assistant entry — so the trace is what pins the bail.
    name: "Stop gives up on one line longer than eight chunks, and says so",
    run: () =>
      runHookWithDebug((root) =>
        JSON.stringify({
          hook_event_name: "Stop",
          transcript_path: singleLineTranscript(root, 12 * CHUNK_BYTES),
          cwd: root,
          last_assistant_message: "All tests pass.",
        }),
      ),
    check: (res) => {
      const violation = outputViolation(res) ?? silenceViolation(parseStdout(res.stdout));
      if (violation) return violation;
      if (!/one line runs past \d+ chunks/.test(res.stderr))
        return `expected the trace to name the long-line bail, got: ${res.stderr || "(empty)"}`;
      return null;
    },
  },
];

let failed = 0;
for (const testCase of cases) {
  let reason;
  try {
    reason = testCase.check(testCase.run());
  } catch (err) {
    reason = `harness error: ${err && err.message}`;
  }
  if (reason) {
    failed++;
    console.log(`FAIL  ${testCase.name}`);
    console.log(`      ${reason}`);
  } else {
    console.log(`PASS  ${testCase.name}`);
  }
}

for (const [name, ms] of timings) {
  console.log(`time  ${name}: ${ms.toFixed(0)} ms (budget ${TIMING_BUDGET_MS} ms)`);
}

console.log(`\n${cases.length - failed}/${cases.length} passed`);
process.exit(failed === 0 ? 0 : 1);
