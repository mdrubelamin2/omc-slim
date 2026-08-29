#!/usr/bin/env node
/**
 * omc-slim — verify-deliverables harness
 *
 * Runs verify-deliverables.mjs as a child process against twenty-four cases and
 * checks only its observable contract (exit code / stdout JSON / stderr):
 *
 *   1. write agent, nothing written      -> warns that no write tool was used
 *   2. write agent, clean in-project write -> silent
 *   3. namespaced "omc-slim:fixer"       -> warns on the bare name
 *   4. designer whose build failed        -> warns; both WRITE_AGENTS are reached
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
 *  15. scan over its deadline           -> abstains, silent; never accuses
 *  16. Write -> silent; 17. NotebookEdit -> outside, on its own path field
 *  18. blank OMC_SLIM_SCAN_BUDGET_MS    -> reads as unset, still warns
 *  19. non-numeric budget                -> falls back to the default, warns
 *  20. every write landed in /tmp        -> warns, and says so — not "no writes"
 *  21. symlinked project root            -> the write is still inside it, silent
 *  22. no cwd in the payload             -> cannot place writes, silent
 *  23. successful write with no path      -> cannot place it, silent
 *  24. another plugin's "otherco:fixer"   -> not ours to police, silent
 *
 * Fixtures use the real transcript shape ($.message.content[]) so the depth
 * bound in collectBlocks is exercised as it is in production. Write blocks carry
 * the path field the real tool uses — `notebook_path` for NotebookEdit,
 * `file_path` for the rest — because the hook now reads it.
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
  mkdirSync,
  symlinkSync,
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

/**
 * A scratch path outside any project. `/tmp` on macOS is a symlink to
 * `/private/tmp`, which is the point: the hook must resolve both sides before
 * comparing, and the OS temp dir the fixtures live in is under `/var` rather
 * than `/tmp`, so the two never overlap.
 */
const SCRATCH_PATH = "/tmp/omc-slim-scratch-notes.md";

// --- fixture builders: real Claude Code transcript lines ----------------------

/**
 * One write-tool call, on the path field the real tool actually uses.
 *
 * `filePath` null ships a write with no path at all — the shape the hook has to
 * treat as unplaceable rather than as a write outside the project.
 */
function assistantWrite(id, name = "Edit", filePath = SCRATCH_PATH) {
  const key = name === "NotebookEdit" ? "notebook_path" : "file_path";
  return {
    type: "assistant",
    message: {
      role: "assistant",
      content: [
        {
          type: "tool_use",
          id,
          name,
          input: filePath === null ? {} : { [key]: filePath },
        },
      ],
    },
  };
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

/**
 * The parent session. Contains a successful IN-PROJECT write the hook must never
 * credit — in-project so that a hook reading the parent falls fully silent, which
 * is what makes the decoy discriminate in the warning cases.
 */
function writeDecoy(root) {
  return writeTranscript(root, "parent-session.jsonl", [
    assistantWrite("toolu_parent", "Edit", inProject(root)),
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

function warningViolation(out, expected, rejected) {
  const { systemMessage } = out;
  if (typeof systemMessage !== "string")
    return "expected a systemMessage, got none";
  if (!systemMessage.includes(expected))
    return `systemMessage did not say "${expected}": ${systemMessage}`;
  if (systemMessage.includes(rejected))
    return `systemMessage used the other state's wording: ${systemMessage}`;
  return null;
}

/** State 1: no successful write-family tool use anywhere. */
function expectWarning(res) {
  const violation = contractViolation(res);
  if (violation) return violation;
  return warningViolation(parseStdout(res.stdout), NO_WRITE_PHRASE, OUTSIDE_PHRASE);
}

/** State 2: writes succeeded, every one of them outside the project root. */
function expectOutsideWarning(res) {
  const violation = contractViolation(res);
  if (violation) return violation;
  return warningViolation(parseStdout(res.stdout), OUTSIDE_PHRASE, NO_WRITE_PHRASE);
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

/** The same, for the outside-the-project state. */
function expectOutsideWarningNaming(agentName) {
  return (res) => {
    const violation = expectOutsideWarning(res);
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
  const warning = warningViolation(
    parseStdout(res.stdout),
    NO_WRITE_PHRASE,
    OUTSIDE_PHRASE,
  );
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

/**
 * `cwd` defaults to the fixture root, which is what a real payload carries and
 * what the containment test measures against. A case passes null to model a
 * payload with no cwd at all.
 */
function payload(agentType, agentTranscript, root, cwd = root) {
  return JSON.stringify({
    agent_type: agentType,
    agent_transcript_path: agentTranscript,
    transcript_path: writeDecoy(root),
    ...(cwd === null ? {} : { cwd }),
  });
}

// --- cases --------------------------------------------------------------------

const cases = [
  {
    // A workspace link, a nix or Bazel symlink farm, or a linked package
    // directory: the path is inside the project and resolves outside it. The
    // resolved-only test called that "landed outside the project directory —
    // nothing in the project changed", which is false in both clauses about a
    // file the user can see in their own tree.
    name: "a write through a symlinked directory inside the project is not outside it",
    run: () =>
      runHook((root) => {
        const outside = mkdtempSync(join(tmpdir(), "omc-outside-"));
        symlinkSync(outside, join(root, "linked"), "dir");
        writeFileSync(join(outside, "a.ts"), "x");
        const transcript = writeTranscript(root, "agent.jsonl", [
          assistantWrite("w1", "Write", join(root, "linked", "a.ts")),
          toolResultOk("w1"),
        ]);
        return payload("omc-slim:fixer", transcript, root);
      }),
    check: expectSilence,
  },

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
    name: "fixer with a successful in-project write stays silent",
    run: () =>
      runHook((root) => {
        const transcript = writeTranscript(root, "agent.jsonl", [
          assistantWrite(WRITE_ID, "Edit", inProject(root)),
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
    // The fixture used to be "the layout looks fine as it is." — a Review-mode
    // verdict, i.e. a legitimate no-write outcome the harness then pinned as an
    // expected warning. Warning on sanctioned behaviour is a defect, not a case,
    // and `agents/designer.md`'s Review mode has since been deleted: a designer
    // always writes. So the fixture is now an outcome that genuinely warrants
    // the warning — the agent gave up before touching anything.
    name: "designer is checked too, not just fixer",
    run: () =>
      runHook((root) => {
        const transcript = writeTranscript(root, "agent.jsonl", [
          assistantText("the build failed, so I stopped before changing anything."),
        ]);
        return payload("designer", transcript, root);
      }),
    check: expectWarningNaming("designer"),
  },
  {
    // `Write` is the tool a fixer reaches for most, and it was the only member
    // of WRITE_TOOLS no fixture exercised — so dropping it from the set killed
    // no test and no mutant, while turning every Write-only run into a false
    // accusation.
    name: "Write counts as a write",
    run: () =>
      runHook((root) => {
        const transcript = writeTranscript(root, "agent.jsonl", [
          assistantWrite(WRITE_ID, "Write", inProject(root)),
          toolResultOk(WRITE_ID),
        ]);
        return payload("fixer", transcript, root);
      }),
    check: expectSilence,
  },
  {
    // NotebookEdit is the one write tool that does not use `file_path` — its
    // schema says `notebook_path`, and the fixture used to spell it the other
    // way, so nothing here would have noticed the hook reading the wrong field.
    //
    // Written OUTSIDE the project on purpose, which makes one fixture prove two
    // things: dropping NotebookEdit from WRITE_TOOLS produces the no-write
    // message, and failing to read `notebook_path` produces silence. Both differ
    // from the outside-the-project message this expects.
    name: "NotebookEdit counts as a write, and its path is notebook_path",
    run: () =>
      runHook((root) => {
        const transcript = writeTranscript(root, "agent.jsonl", [
          assistantWrite(WRITE_ID, "NotebookEdit", SCRATCH_PATH),
          toolResultOk(WRITE_ID),
        ]);
        return payload("fixer", transcript, root);
      }),
    check: expectOutsideWarningNaming("fixer"),
  },
  {
    name: "MultiEdit counts as a write",
    run: () =>
      runHook((root) => {
        const transcript = writeTranscript(root, "agent.jsonl", [
          assistantWrite(WRITE_ID, "MultiEdit", inProject(root)),
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
          nestedOneLevelDeeper(assistantWrite(WRITE_ID, "Edit", inProject(root))),
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
          assistantText("I read the file and decided nothing needed changing."),
        ]);
        return payload("fixer", transcript, root);
      }),
    check: expectWarningNaming("fixer"),
  },
  {
    // Same shape, one step further out: a value that is not a number must fall
    // back to the default, never to zero. Falling back to zero would be silent,
    // and silence is how this guard stops guarding.
    name: "a non-numeric scan budget falls back to the default",
    run: () =>
      runHookWithJunkScanBudget((root) => {
        const transcript = writeTranscript(root, "agent.jsonl", [
          assistantText("I read the file and decided nothing needed changing."),
        ]);
        return payload("fixer", transcript, root);
      }),
    check: expectWarningNaming("fixer"),
  },
  {
    // C8. A successful Write to /tmp used to satisfy the check outright: the
    // agent "wrote a file", so the hook fell silent and the project was
    // untouched. It is a warning — but NOT the no-write warning, which would be
    // false here. expectOutsideWarning rejects the other state's wording, so a
    // hook that collapses the two states back into one fails this case.
    name: "a successful write outside the project is reported as such",
    run: () =>
      runHook((root) => {
        const transcript = writeTranscript(root, "agent.jsonl", [
          assistantWrite(WRITE_ID, "Write", SCRATCH_PATH),
          toolResultOk(WRITE_ID),
        ]);
        return payload("fixer", transcript, root);
      }),
    check: expectOutsideWarningNaming("fixer"),
  },
  {
    // BOTH sides of the containment test must be symlink-resolved, or it is a
    // string comparison between two spellings of the same directory — on macOS
    // `/tmp` is `/private/tmp` and the OS temp dir is under `/var` ->
    // `/private/var`, so this is the ordinary case, not an exotic one.
    //
    // The payload's cwd and the written path go through two DIFFERENT symlinks
    // to one directory, deliberately: resolving only the root leaves the two
    // aliases unequal, and so does resolving only the path. Either half missing
    // turns a write the agent was asked to make into an accusation, and neither
    // half can hide behind a platform where the temp dir happens to be real.
    name: "a symlinked project root still contains its own writes",
    run: () =>
      runHook((root) => {
        const project = join(root, "project");
        mkdirSync(join(project, "src"), { recursive: true });
        const cwdAlias = join(root, "by-cwd");
        const writeAlias = join(root, "by-write");
        symlinkSync(project, cwdAlias);
        symlinkSync(project, writeAlias);
        const transcript = writeTranscript(root, "agent.jsonl", [
          assistantWrite(WRITE_ID, "Write", join(writeAlias, "src", "x.ts")),
          toolResultOk(WRITE_ID),
        ]);
        return payload("fixer", transcript, root, cwdAlias);
      }),
    check: expectSilence,
  },
  {
    // No cwd means the root cannot be resolved, so no write can be placed. The
    // hook must fall back to the pre-path behaviour — any successful write
    // counts — rather than guess that a scratch path is outside a project it
    // cannot locate. The fixture writes to /tmp precisely so that a hook which
    // guesses warns here and fails.
    name: "a payload with no cwd cannot place writes, and says nothing",
    run: () =>
      runHook((root) => {
        const transcript = writeTranscript(root, "agent.jsonl", [
          assistantWrite(WRITE_ID, "Write", SCRATCH_PATH),
          toolResultOk(WRITE_ID),
        ]);
        return payload("fixer", transcript, root, null);
      }),
    check: expectSilence,
  },
  {
    // A write tool_use whose input carries no path at all. Unplaceable is not
    // outside: treating it as outside turns any tool shape this hook does not
    // know about into an accusation.
    name: "a successful write with no path in its input stays silent",
    run: () =>
      runHook((root) => {
        const transcript = writeTranscript(root, "agent.jsonl", [
          assistantWrite(WRITE_ID, "Write", null),
          toolResultOk(WRITE_ID),
        ]);
        return payload("fixer", transcript, root);
      }),
    check: expectSilence,
  },
  {
    // C5. `otherco:fixer` is another plugin's agent, following another plugin's
    // brief. Warning it about omc-slim's deliverable rule is over-reach, and the
    // old lastIndexOf strip did exactly that. hooks.json is pinned to the same
    // namespace; this proves the two layers agree.
    //
    // A BARE `fixer` is still covered — case 1 pins that — because no evidence
    // in this repository establishes which spelling a `--plugin-dir` dev session
    // presents, and silencing the hook in development is the worse failure.
    name: "another plugin's namespaced agent is not ours to police",
    run: () =>
      runHook((root) => {
        const transcript = writeTranscript(root, "agent.jsonl", [
          assistantText("I reviewed it and changed nothing."),
        ]);
        return payload("otherco:fixer", transcript, root);
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
