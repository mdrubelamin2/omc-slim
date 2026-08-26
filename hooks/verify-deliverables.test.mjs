#!/usr/bin/env node
/**
 * omc-slim — verify-deliverables harness
 *
 * Runs verify-deliverables.mjs as a child process against fourteen cases and
 * checks only its observable contract (exit code / stdout JSON / stderr):
 *
 *   1. write agent, nothing written      -> warns
 *   2. write agent, clean write          -> silent
 *   3. namespaced "omc-slim:fixer"       -> warns on the bare name
 *   4. designer, nothing written         -> warns; both WRITE_AGENTS are reached
 *   5. MultiEdit write                   -> silent; every WRITE_TOOL counts
 *   6. read-only agent                   -> exempt, silent
 *   7. write denied (is_error result)    -> warns; an attempt is not a write
 *   8. no agent transcript in payload    -> cannot tell, silent
 *   9. malformed stdin                   -> no crash, silent
 *  10. write block nested one level deep -> still found (depth > 6 headroom)
 *  11. 3 MB transcript, no writes        -> still scanned, warns
 *  12. OMC_SLIM_DEBUG=1                  -> traces on stderr, stdout stays JSON
 *  13. transcript over the 64 MB cap     -> never read, silent
 *  14. FIFO transcript (non-regular file) -> not read, silent, does not hang
 *
 * Fixtures use the real transcript shape ($.message.content[]) so the depth
 * bound in collectBlocks is exercised as it is in production.
 *
 * Every payload carries a decoy `transcript_path` — the parent session, which
 * the hook must never read. It only discriminates where the two verdicts
 * differ: in the warning cases (1, 3, 4, 7, 11) it holds a successful write, so
 * a hook reading the parent falls silent; in case 8, which has no agent
 * transcript at all, it holds none, so a hook falling back to the parent warns.
 * Elsewhere both readings are silent and the decoy proves nothing.
 *
 * Self-contained: builds its fixtures in a temp dir and removes them. No
 * dependencies beyond node built-ins.
 *
 * Run: node hooks/verify-deliverables.test.mjs
 */

import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  writeFileSync,
  rmSync,
  statSync,
  openSync,
  ftruncateSync,
  closeSync,
  lstatSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
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

/** The only two fields the hook may emit. Anything else is a contract breach. */
const ALLOWED_FIELDS = new Set(["systemMessage", "suppressOutput"]);

const WRITE_ID = "toolu_01A";

// --- fixture builders: real Claude Code transcript lines ----------------------

function assistantWrite(id, name = "Edit") {
  return {
    type: "assistant",
    message: {
      role: "assistant",
      content: [
        {
          type: "tool_use",
          id,
          name,
          input: { file_path: "/tmp/x.ts" },
        },
      ],
    },
  };
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

function assistantText(text) {
  return {
    type: "assistant",
    message: { role: "assistant", content: [{ type: "text", text }] },
  };
}

/** The same line with one extra object between `message` and `content`. */
function nestedOneLevelDeeper(line) {
  const { role, content } = line.message;
  return { ...line, message: { role, envelope: { content } } };
}

/** ~3 MB of assistant turns that invoke no tool at all. */
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

function writeTranscript(root, name, lines) {
  const path = join(root, name);
  const jsonl = lines.map((line) => JSON.stringify(line)).join("\n");
  writeFileSync(path, jsonl + "\n"); // real transcripts end with a newline
  return path;
}

/**
 * A file over the cap. Sparse, so 65 MB costs no disk and no read time — while
 * the cap holds nothing ever opens it, and once it breaks the NUL bytes parse
 * as no transcript lines at all, which reads as "no write".
 */
function sparseTranscript(root, bytes) {
  const path = join(root, "over-cap.jsonl");
  const fd = openSync(path, "w");
  try {
    ftruncateSync(fd, bytes);
  } finally {
    closeSync(fd);
  }
  return path;
}

/** The parent session. Contains a successful write the hook must never credit. */
function writeDecoy(root) {
  return writeTranscript(root, "parent-session.jsonl", [
    assistantWrite("toolu_parent"),
    toolResultOk("toolu_parent"),
  ]);
}

/**
 * A parent session with no successful write, for the case that has no agent
 * transcript. There, "read the parent instead" and "cannot tell" are both
 * silent against the ordinary decoy; only a parent holding no write separates
 * them, by making the wrong reading warn.
 */
function writeQuietDecoy(root) {
  return writeTranscript(root, "parent-session.jsonl", [
    assistantText("the main thread only read files."),
  ]);
}

// --- runner -------------------------------------------------------------------

/** Build fixtures in a throwaway dir, run the hook against them, clean up. */
function runHook(buildStdin) {
  return spawnHook(buildStdin, "");
}

/** The same, with tracing on: only this one tolerates output on stderr. */
function runHookWithDebug(buildStdin) {
  return spawnHook(buildStdin, "1");
}

/** The same, with the scan budget forced to 0 so the deadline fires at once. */
function runHookWithNoScanBudget(buildStdin) {
  return spawnHook(buildStdin, "", { OMC_SLIM_SCAN_BUDGET_MS: "0" });
}

function spawnHook(buildStdin, debugFlag, extraEnv = {}) {
  const root = mkdtempSync(join(tmpdir(), "omc-slim-verify-"));
  try {
    const res = spawnSync(process.execPath, [HOOK], {
      input: buildStdin(root),
      encoding: "utf8",
      // The production budget: `timeout: 5` seconds in hooks.json. A slower
      // hook passes nothing here that would not be discarded in a session.
      timeout: 5_000,
      env: { ...process.env, OMC_SLIM_DEBUG: debugFlag, ...extraEnv },
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
  // The key set, not a subset: `hookSpecificOutput.additionalContext` re-injects
  // into the finishing subagent and `continue: false` stops all processing, and
  // both do it while exiting 0, so no exit-code assertion covers them.
  const forbidden = Object.keys(out).filter((key) => !ALLOWED_FIELDS.has(key));
  if (forbidden.length)
    return `hook emitted forbidden field(s): ${forbidden.join(", ")}`;
  return null;
}

/** The above plus silence on stderr — every case except the debug one. */
function contractViolation(res) {
  if (res.stderr !== "") return `expected empty stderr, got: ${res.stderr}`;
  return outputViolation(res);
}

function warningViolation(out) {
  const { systemMessage } = out;
  if (typeof systemMessage !== "string")
    return "expected a systemMessage, got none";
  if (!systemMessage.includes("finished without editing"))
    return `systemMessage did not name the failure: ${systemMessage}`;
  return null;
}

function expectWarning(res) {
  const violation = contractViolation(res);
  if (violation) return violation;
  return warningViolation(parseStdout(res.stdout));
}

/**
 * A warning naming one specific agent. Pins two things a plain warning does not:
 * that the namespace is stripped before the user sees it, and that every agent
 * in WRITE_AGENTS is actually reached — `designer` is registered in hooks.json
 * and would otherwise be untested.
 */
function expectWarningNaming(agentName) {
  return (res) => {
    const violation = expectWarning(res);
    if (violation) return violation;
    const { systemMessage } = parseStdout(res.stdout);
    if (!systemMessage.includes(`the ${agentName} agent`))
      return `expected "the ${agentName} agent", got: ${systemMessage}`;
    return null;
  };
}

/** Tracing must go to stderr only: a stray console.log corrupts the JSON. */
function expectDebugTrace(res) {
  const violation = outputViolation(res);
  if (violation) return violation;
  const warning = warningViolation(parseStdout(res.stdout));
  if (warning) return warning;
  if (!res.stderr.startsWith("[omc-slim]"))
    return `expected an [omc-slim] trace on stderr, got: ${res.stderr || "(empty)"}`;
  return null;
}

function expectSilence(res) {
  const violation = contractViolation(res);
  if (violation) return violation;
  const out = parseStdout(res.stdout);
  if ("systemMessage" in out)
    return `expected no systemMessage, got: ${out.systemMessage}`;
  return null;
}

function payload(agentType, agentTranscript, root) {
  return JSON.stringify({
    agent_type: agentType,
    agent_transcript_path: agentTranscript,
    transcript_path: writeDecoy(root),
  });
}

// --- cases --------------------------------------------------------------------

const cases = [
  {
    name: "fixer that wrote nothing is flagged",
    run: () =>
      runHook((root) => {
        const transcript = writeTranscript(root, "agent.jsonl", [
          assistantText("I looked at the file and it seems fine."),
        ]);
        return payload("fixer", transcript, root);
      }),
    check: expectWarning,
  },
  {
    name: "fixer with a successful write stays silent",
    run: () =>
      runHook((root) => {
        const transcript = writeTranscript(root, "agent.jsonl", [
          assistantWrite(WRITE_ID),
          toolResultOk(WRITE_ID),
        ]);
        return payload("fixer", transcript, root);
      }),
    check: expectSilence,
  },
  {
    name: "namespaced omc-slim:fixer is matched on the bare name",
    run: () =>
      runHook((root) => {
        const transcript = writeTranscript(root, "agent.jsonl", [
          assistantText("nothing to do here."),
        ]);
        return payload("omc-slim:fixer", transcript, root);
      }),
    check: expectWarningNaming("fixer"),
  },
  {
    name: "designer is checked too, not just fixer",
    run: () =>
      runHook((root) => {
        const transcript = writeTranscript(root, "agent.jsonl", [
          assistantText("the layout looks fine as it is."),
        ]);
        return payload("designer", transcript, root);
      }),
    check: expectWarningNaming("designer"),
  },
  {
    name: "MultiEdit counts as a write",
    run: () =>
      runHook((root) => {
        const transcript = writeTranscript(root, "agent.jsonl", [
          assistantWrite(WRITE_ID, "MultiEdit"),
          toolResultOk(WRITE_ID),
        ]);
        return payload("fixer", transcript, root);
      }),
    check: expectSilence,
  },
  {
    name: "read-only agent is exempt",
    run: () =>
      runHook((root) => {
        const transcript = writeTranscript(root, "agent.jsonl", [
          assistantText("here is what I found."),
        ]);
        return payload("explorer", transcript, root);
      }),
    check: expectSilence,
  },
  {
    name: "denied write is not a deliverable",
    run: () =>
      runHook((root) => {
        const transcript = writeTranscript(root, "agent.jsonl", [
          assistantWrite(WRITE_ID),
          toolResultDenied(WRITE_ID),
        ]);
        return payload("fixer", transcript, root);
      }),
    check: expectWarning,
  },
  {
    name: "missing agent transcript stays silent",
    run: () =>
      runHook((root) =>
        JSON.stringify({
          agent_type: "fixer",
          transcript_path: writeQuietDecoy(root),
        }),
      ),
    check: expectSilence,
  },
  {
    name: "malformed stdin does not crash",
    run: () => runHook(() => "{ not json"),
    check: expectSilence,
  },
  {
    name: "write nested one level deeper is still found",
    run: () =>
      runHook((root) => {
        const transcript = writeTranscript(root, "agent.jsonl", [
          nestedOneLevelDeeper(assistantWrite(WRITE_ID)),
          nestedOneLevelDeeper(toolResultOk(WRITE_ID)),
        ]);
        return payload("fixer", transcript, root);
      }),
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
        return payload("fixer", transcript, root);
      }),
    check: expectWarning,
  },
  {
    name: "debug tracing goes to stderr, never stdout",
    run: () =>
      runHookWithDebug((root) => {
        const transcript = writeTranscript(root, "agent.jsonl", [
          assistantText("I looked at the file and it seems fine."),
        ]);
        return payload("fixer", transcript, root);
      }),
    check: expectDebugTrace,
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
        return payload("fixer", transcript, root);
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
        return payload("fixer", fifo, root);
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
          assistantText("I read the file and decided nothing needed changing."),
        ]);
        return payload("fixer", transcript, root);
      }),
    check: expectSilence,
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

console.log(`\n${cases.length - failed}/${cases.length} passed`);
process.exit(failed === 0 ? 0 : 1);
