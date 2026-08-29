#!/usr/bin/env node
/**
 * omc-slim — SubagentStop deliverable check.
 *
 * A subagent can report success having written nothing. This checks that a
 * write-capable specialist actually touched a file IN THE PROJECT, and tells the
 * *user* when it did not.
 *
 * "In the project" is the second half, and it is why the check is not a boolean.
 * A successful Write to /tmp/notes.md used to satisfy it outright, and an agent
 * that did its work through sanctioned shell edits used to be reported as having
 * written nothing at all. Those are two different states and they get two
 * different messages; neither one accuses.
 *
 * A third state is not about writing at all: the agent asserted a verification
 * result, and nothing in its transcript ran a check. Measured rather than
 * theorised — a benchmark of 45 Python bug-fix tasks had the agent report 45/45
 * complete; against held-out tests 26 passed, 19 false positives, and the same
 * 19 failed identically on two different vendors' models, so it is the agent
 * loop's shape rather than a model defect. The transcript reads "[Round 3] 5/5
 * tests pass. Build successful! All verified." against a suite of eight.
 * `agents/fixer.md` already says a check counts only while it can still fail and
 * `skills/review/SKILL.md` already says "all tests pass" with no output is a
 * claim, not a result; neither can tell whether a check ran at all. This can,
 * because it already holds the transcript.
 *
 * Deliberately advisory: it never blocks the subagent from stopping.
 *
 * It emits `systemMessage` (surfaced to the user) and never
 * `hookSpecificOutput.additionalContext`. On SubagentStop, additionalContext is
 * injected back into the subagent that is already finishing — the regression
 * oh-my-claudecode hit in its #3209 / #3233. We inherit that lesson rather than
 * the bug.
 *
 * Fails open in every error path: a broken guard must never break a session.
 *
 * Set OMC_SLIM_DEBUG=1 to trace on stderr. A hook that exits 0 never shows its
 * stderr to the user, so this costs nothing when unset and nothing when set.
 */

import { readFileSync, lstatSync, realpathSync } from "node:fs";
import { basename, dirname, join, resolve, sep } from "node:path";

/** Specialists expected to produce file changes. Read-only agents are exempt. */
const WRITE_AGENTS = new Set(["fixer", "designer"]);

/**
 * The namespace this plugin's own agents carry.
 *
 * `agent_type` for a plugin agent is `omc-slim:fixer` (MAINTAINERS.md, "Matchers
 * are anchored"). The matcher in hooks.json used to accept ANY prefix ending in
 * a colon, and this used to strip it with lastIndexOf — so a completely
 * unrelated plugin shipping an agent called `fixer` got told off about a brief
 * it never agreed to. Both layers are now pinned to this namespace, and they
 * have to stay in step: hooks.json decides what runs, this decides what warns.
 *
 * A BARE name is still covered. What string a `--plugin-dir` development session
 * presents is UNVERIFIED — nothing in this repository records it, and
 * scripts/bench/smoke-contracts.sh hedges by accepting either spelling. Pinning
 * to the namespace alone would therefore risk silencing the hook in development,
 * which is worse than the over-reach being fixed. Only a FOREIGN namespace is
 * excluded.
 */
const SELF_NAMESPACE = "omc-slim:";

/**
 * Cap on the transcript read. It was 2 MB, and 89% of transcripts over that cap
 * contain a successful write (39 of 44, sampled 2026-08-17) — so the check was
 * being skipped on the agents doing the most work. The largest sampled was
 * 50,017,698 bytes and parsed fully in 145 ms against the 5 s timeout in
 * hooks.json — so this bounds readFileSync's string allocation, not scan time.
 */
const MAX_TRANSCRIPT_BYTES = 64 * 1024 * 1024;

/**
 * Wall-clock budget for the transcript scan, well inside the 5 s declared in
 * hooks.json.
 *
 * That declared timeout is advisory rather than a guarantee, on the evidence
 * available: a hook wedged before `main` was reported surviving it parent-side
 * (anthropics/claude-code#85250), and one blocked reading its stdin payload held
 * a tool call for roughly 300 s against a declared 3 s (#87289). Both reports are
 * open, unconfirmed by the vendor and Windows-only, and #87289 runs a control
 * showing the timeout DOES fire for a hook that only computes. So the general
 * mechanism works; what is unbounded is the blocked case, and #87289's own triage
 * says the fix belongs to the hook author. It lives in here.
 *
 * What this covers: the per-line parse of a transcript that is under the byte
 * cap but pathological to scan. Over budget, the scan returns null — "cannot
 * tell" — never false, because false is an accusation.
 *
 * What it cannot cover, stated plainly: a blocking read on fd 0. Node's timers
 * cannot preempt synchronous I/O, so no in-process watchdog fires while
 * readFileSync(0) waits on a pipe the parent never closed (#78756). The byte cap
 * and the isFile() check bound the transcript read; nothing here bounds stdin.
 *
 * OMC_SLIM_SCAN_BUDGET_MS overrides it. That exists so the test can set 0 and
 * prove the deadline is wired and fails safe, the same seam OMC_SLIM_DEBUG uses.
 */
const SCAN_BUDGET_MS = (() => {
  const raw = process.env.OMC_SLIM_SCAN_BUDGET_MS;
  // Blank counts as unset, and that is the whole reason this is not a one-liner:
  // `Number("")` is 0, not NaN, so an exported-but-empty variable would set the
  // budget to zero, expire the deadline on line one of every transcript and mute
  // the hook permanently — a guard that stops guarding without saying so.
  if (raw === undefined || raw.trim() === "") return 2000;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : 2000;
})();

/** Tools whose successful use counts as having produced a deliverable. */
const WRITE_TOOLS = new Set(["Edit", "Write", "NotebookEdit", "MultiEdit"]);

/**
 * Tools that hand work to another agent. A successful dispatch means a check may
 * have run in a transcript this one cannot see, so the claim state abstains.
 */
const DISPATCH_TOOLS = new Set(["Task", "Agent"]);

/**
 * Substrings that make a Bash command look like a check runner.
 *
 * Deliberately generous, and matched as plain substrings: a false negative here
 * is silence, a false positive is an accusation, and this hook's charter is
 * never to accuse. `git log --oneline latest` contains "test" and buys silence;
 * that is the trade taken on purpose.
 *
 * The broad entries subsume the obvious runners — `test` covers pytest, vitest,
 * `go test`, `cargo test`, `npm`/`yarn`/`pnpm`/`make`/`dotnet test`; `lint`
 * covers eslint; `check` covers typecheck and type-check. The rest are the
 * runners whose names contain none of those.
 */
const CHECK_COMMAND_HINTS = [
  "test",
  "lint",
  "build",
  "check",
  "jest",
  "mocha",
  "tsc",
  "mypy",
  "ruff",
  "gradle",
  "mvn",
  "rspec",
  "phpunit",
  "npm t",
];

/**
 * Assertions of a verification OUTCOME — not mentions of testing.
 *
 * "I should run the tests" and "the test file lives in src/" are not results,
 * and matching them would flag an agent for describing its own work. Each entry
 * is tested against one sentence at a time; see assertsVerification.
 */
const VERIFICATION_CLAIMS = [
  // "tests pass", "all tests passing", "the suite passes"
  /\b(tests?|suites?|specs?)\s+(all\s+)?(pass|passes|passed|passing)\b/,
  // "5/5 tests pass", "45/45 passed"
  /\b\d+\s*\/\s*\d+\s+(tests?\s+)?(pass|passes|passed|passing|green)\b/,
  // "45 of 45 passed"
  /\b\d+\s+of\s+\d+\s+(tests?\s+)?(pass|passes|passed|passing)\b/,
  // "build succeeded", "build successful"
  /\bbuild\s+(is\s+)?(succeeded|successful|success|passed|passes|clean|green)\b/,
  // "typecheck clean", "lint clean", "tsc passed"
  /\b(type-?checks?|typechecking|tsc|mypy|lint|linting|linter|eslint|ruff)\s+(is\s+|are\s+|came\s+back\s+)?(clean|passes|passed|green)\b/,
  // "all green"
  /\ball\s+green\b/,
  // "verified", which only survives the filter below in an unhedged sentence
  /\bverified\b/,
];

/**
 * What disqualifies a sentence from being an assertion of success: a reported
 * failure, a negation, a hedge, an intention.
 *
 * "2 tests failed" and "not all tests pass" are the honest reporting this hook
 * exists to protect, and flagging them would punish the behaviour we want.
 */
const NOT_AN_ASSERTION =
  /\b(fail\w*|error\w*|broke\w*|missing|no|not|never|cannot|unable|unverified|unchecked|untested|skip\w*|should|would|need\w*|must|todo|pending|assume\w*|unless|if|expect\w*|hope\w*|believe\w*)\b|n't\b/;

function debug(...args) {
  if (process.env.OMC_SLIM_DEBUG === "1") console.error("[omc-slim]", ...args);
}

/**
 * The written path out of a write tool's `input`, or null if it carries none.
 *
 * Edit, Write and MultiEdit all use `file_path`; NotebookEdit uses
 * `notebook_path` (read off the tool's own schema, not recalled). A block with
 * neither is not a path we can place, and null propagates as "cannot tell" —
 * never as "outside".
 */
function writtenPath(input) {
  if (input === null || typeof input !== "object") return null;
  for (const key of ["file_path", "notebook_path"]) {
    const value = input[key];
    if (typeof value === "string" && value.trim() !== "") return value;
  }
  return null;
}

/**
 * Absolute, symlink-resolved path, for a file that may no longer exist.
 *
 * Both sides of the containment test have to be resolved the same way or the
 * comparison is a coin flip: on macOS `/tmp` is a symlink to `/private/tmp`, and
 * the OS temp dir sits under `/var` -> `/private/var`, so a raw string compare
 * calls a real in-project write an outside one. `realpathSync` cannot answer for
 * a path that was written and then deleted, so resolve the nearest ancestor that
 * does exist and re-attach the rest.
 */
function realish(path, base) {
  let head = resolve(base, path);
  const tail = [];
  for (;;) {
    try {
      return join(realpathSync(head), ...tail);
    } catch {
      const parent = dirname(head);
      // At the filesystem root there is nothing left to resolve against.
      if (parent === head) return resolve(base, path);
      tail.unshift(basename(head));
      head = parent;
    }
  }
}

/** Is `path` the project root or inside it? Both must already be resolved. */
function withinRoot(path, root) {
  return path === root || path.startsWith(root + sep);
}

/**
 * Is this write inside the project — lexically, or after resolving symlinks?
 *
 * Either answer being yes is enough, and that asymmetry is the point. Resolving
 * the written path is what handles macOS `/tmp` -> `/private/tmp`, so it has to
 * happen. But it also relocates a path that is genuinely inside the project
 * through a symlinked directory — a pnpm or yarn workspace link, a nix or Bazel
 * symlink farm, a linked package directory — and the resolved form then lands
 * outside a root that never moved.
 *
 * The consequence was a message that is false twice over: it told the user
 * "nothing in the project changed" about a file they can see in the project. A
 * hook whose whole charter is never to accuse must take the reading in which no
 * accusation is warranted.
 */
function writeIsInProject(rawPath, root) {
  // Lexical first, against the UNRESOLVED cwd. Comparing a lexical path against
  // the resolved root is a category error and gets macOS wrong on its own,
  // because the root moves to /private/tmp and the path does not.
  if (root.raw !== null && withinRoot(resolve(root.raw, rawPath), root.raw)) {
    return true;
  }
  return withinRoot(realish(rawPath, root.real), root.real);
}

/**
 * The project root the payload's `cwd` names, symlink-resolved, or null.
 *
 * Null means the containment test cannot be run at all. The caller then falls
 * back to the pre-path behaviour — any successful write counts — because a hook
 * that cannot place a file must not claim it landed in the wrong place.
 */
function projectRoot(cwd) {
  if (typeof cwd !== "string" || cwd.trim() === "") {
    debug("no cwd in payload; not testing where writes landed");
    return null;
  }
  try {
    // Both forms are kept. `real` is what a resolved write path is compared
    // against; `raw` is what a lexical one is. Keeping only the resolved form is
    // what made an in-project write through a symlinked directory read as
    // outside the project.
    return { real: realpathSync(cwd), raw: resolve(cwd) };
  } catch (err) {
    debug("cannot resolve project root", cwd, err && err.message);
    return null;
  }
}

function readStdin() {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

/**
 * Everything one pass over the agent's own transcript can establish, or null
 * when the transcript cannot be read at all.
 *
 * null is "cannot tell", and every state built on it must then stay silent: both
 * of them are accusations if they fire against a transcript nobody read.
 *
 * @param {string|null} transcriptPath
 * @returns {null|{pendingWrites: Map, succeeded: Set, dispatches: Set,
 *                 sawCheckCommand: boolean, finalAssistantText: string|null}}
 */
function scanTranscript(transcriptPath) {
  if (!transcriptPath) {
    debug("cannot tell: no agent transcript path in payload");
    return null;
  }

  let size;
  try {
    // lstat, not stat: a symlink is not a transcript we were handed, and
    // following one turns this into an arbitrary-path read.
    const st = lstatSync(transcriptPath);
    // A FIFO or character device reports size 0, so the cap below waves it
    // through and readFileSync then blocks forever with no timeout — the hook
    // never emits and never exits, breaking "always exits 0". Only a regular
    // file can be a transcript. Pinned by "non-regular transcript stays silent".
    if (!st.isFile()) {
      debug("cannot tell: not a regular file", transcriptPath);
      return null;
    }
    size = st.size;
  } catch (err) {
    debug("cannot tell: stat failed", transcriptPath, err && err.message);
    return null;
  }

  if (size > MAX_TRANSCRIPT_BYTES) {
    debug("cannot tell: over cap", size, transcriptPath);
    return null;
  }

  let raw;
  try {
    raw = readFileSync(transcriptPath, "utf8");
  } catch (err) {
    debug("cannot tell: read failed", transcriptPath, err && err.message);
    return null;
  }

  const scan = {
    /** id of every write-tool tool_use block -> the path it wrote, or null */
    pendingWrites: new Map(),
    /** ids whose tool_result came back clean */
    succeeded: new Set(),
    /** ids of every Task/Agent dispatch, resolved against `succeeded` later */
    dispatches: new Set(),
    /** did any Bash command look like a test, build or typecheck run? */
    sawCheckCommand: false,
    /** the text of the last assistant turn that carried any, or null */
    finalAssistantText: null,
  };

  const deadline = Date.now() + SCAN_BUDGET_MS;
  let scanned = 0;

  for (const line of raw.split("\n")) {
    // Checked every 256 lines rather than every line: Date.now() per line on a
    // 50 MB transcript is itself measurable, and 256 lines of parse plus the
    // text extraction below cannot overrun a 2 s budget by anything that
    // matters.
    if ((scanned++ & 0xff) === 0 && Date.now() >= deadline) {
      debug("cannot tell: scan budget exhausted", scanned, transcriptPath);
      return null;
    }
    if (!line.trim().startsWith("{")) continue;
    let obj;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }
    collectBlocks(obj, scan);
    const text = assistantLineText(obj);
    if (text !== null) scan.finalAssistantText = text;
  }

  return scan;
}

/**
 * Did this agent SUCCESSFULLY write a file INSIDE the project?
 *
 * Four answers, because two different false accusations came out of one boolean:
 *
 *   null       cannot tell. The caller stays silent.
 *   true       at least one successful write landed in the project root.
 *   "outside"  successful writes, every one of them outside the root.
 *   "none"     no successful write at all.
 *
 * An attempted write is not a deliverable. A permission-denied Edit still
 * appears as a `tool_use` block, so matching on tool_use alone reports success
 * for an agent that was blocked and produced nothing — the exact situation most
 * worth flagging. Pinned by "denied write is not a deliverable" in
 * verify-deliverables.test.mjs, which re-runs this against a real denial payload.
 *
 * So: the scan collected write-tool `tool_use` ids with the path each one wrote;
 * this requires a matching `tool_result` that is not `is_error`. A tool_use with
 * no result at all (agent died mid-call) also counts as no write.
 *
 * A successful write whose path cannot be placed — no path in the input, or a
 * null `root` — counts as `true`. Silence is the only safe reading of a write
 * this cannot locate.
 *
 * @param {object|null} scan  scanTranscript's result, or null for "cannot tell"
 * @param {object|null} root  resolved project root, or null to skip the test
 * @returns {null|true|"outside"|"none"}
 */
function writeVerdict(scan, root) {
  if (scan === null) return null;
  const { pendingWrites, succeeded } = scan;

  let sawSuccess = false;
  for (const [id, path] of pendingWrites) {
    if (!succeeded.has(id)) continue;
    sawSuccess = true;
    if (root === null || path === null) return true;
    if (writeIsInProject(path, root)) return true;
  }
  return sawSuccess ? "outside" : "none";
}

/** Depth-bounded walk collecting the tool blocks every state is built from. */
function collectBlocks(node, scan, depth = 0) {
  if (depth > 6 || node === null || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const child of node) {
      collectBlocks(child, scan, depth + 1);
    }
    return;
  }

  if (node.type === "tool_use" && node.id) {
    if (WRITE_TOOLS.has(node.name)) {
      scan.pendingWrites.set(node.id, writtenPath(node.input));
    }
    if (DISPATCH_TOOLS.has(node.name)) scan.dispatches.add(node.id);
    if (node.name === "Bash" && isCheckCommand(node.input)) {
      scan.sawCheckCommand = true;
    }
  }
  // `is_error` is absent on success and true on failure.
  if (node.type === "tool_result" && node.tool_use_id && node.is_error !== true) {
    scan.succeeded.add(node.tool_use_id);
  }

  for (const value of Object.values(node)) {
    if (value !== null && typeof value === "object") {
      collectBlocks(value, scan, depth + 1);
    }
  }
}

/**
 * The text of one assistant transcript line, or null if it carries none.
 *
 * Only the entry's own content array. A `tool_result` also holds text, and it
 * belongs to the user turn that carried it — crediting a test runner's own
 * output to the agent would read the evidence back as the claim.
 */
function assistantLineText(entry) {
  if (entry === null || typeof entry !== "object") return null;
  if (entry.type !== "assistant") return null;
  const content = entry.message && entry.message.content;
  if (!Array.isArray(content)) return null;

  const text = content
    .filter(
      (block) =>
        block !== null &&
        typeof block === "object" &&
        block.type === "text" &&
        typeof block.text === "string",
    )
    .map((block) => block.text)
    .join("\n");
  return text.trim() === "" ? null : text;
}

/** Does this Bash tool input look like it ran a test, build or typecheck? */
function isCheckCommand(input) {
  if (input === null || typeof input !== "object") return false;
  if (typeof input.command !== "string") return false;
  const command = input.command.toLowerCase();
  return CHECK_COMMAND_HINTS.some((hint) => command.includes(hint));
}

/**
 * Does the agent's final message assert a verification outcome?
 *
 * Sentence by sentence, and that granularity is the whole design. A real final
 * message mixes an assertion with prose — "I fixed the bug. All tests pass. No
 * other files were touched." — so testing the whole text against the hedge list
 * below would find "no" and fall silent on every realistic report. Testing each
 * sentence keeps the honest carve-out (a sentence that reports a failure is not
 * a claim) without muting the state it exists to catch.
 */
function assertsVerification(text) {
  // The curly apostrophe is what a model actually emits, and "didn't" spelled
  // with one would otherwise slip past the hedge list as an assertion.
  const normalised = text.replace(/[\u2018\u2019]/g, "'").toLowerCase();
  for (const sentence of normalised.split(/[.!?;\n]+/)) {
    if (NOT_AN_ASSERTION.test(sentence)) continue;
    if (VERIFICATION_CLAIMS.some((claim) => claim.test(sentence))) return true;
  }
  return false;
}

/**
 * The agent's final message: the payload's field, else the transcript's last
 * assistant text, else null.
 *
 * SubagentStop carries `last_assistant_message` — "Text content of the last
 * assistant message before stopping. Avoids the need to read and parse the
 * transcript file." (verified against binary 2.1.251, 2026-08-29). The
 * transcript walk is the fallback for a payload that omits it.
 */
function finalAssistantMessage(scan, payloadMessage) {
  if (typeof payloadMessage === "string" && payloadMessage.trim() !== "") {
    return payloadMessage;
  }
  return scan === null ? null : scan.finalAssistantText;
}

/** Did any dispatch to another agent come back clean? */
function sawDelegation(scan) {
  for (const id of scan.dispatches) {
    if (scan.succeeded.has(id)) return true;
  }
  return false;
}

/**
 * Did the agent report a verification result that nothing in its transcript ran?
 *
 * Both halves have to hold, and each is biased towards silence: the message must
 * assert an outcome rather than mention testing, and no Bash command anywhere in
 * the transcript may look like a check.
 */
function claimedUnrunCheck(scan, payloadMessage) {
  const finalText = finalAssistantMessage(scan, payloadMessage);
  if (finalText === null || !assertsVerification(finalText)) return false;
  // A transcript that could not be read cannot show the check that did run, and
  // a dispatched agent runs its checks in a transcript this one never sees.
  if (scan === null || scan.sawCheckCommand || sawDelegation(scan)) return false;
  return true;
}

/**
 * This plugin's own agent, by bare name — or null when the agent is another
 * plugin's. Kept in step with the matcher in hooks.json; see SELF_NAMESPACE.
 */
function ownAgentName(agent) {
  if (agent.startsWith(SELF_NAMESPACE)) return agent.slice(SELF_NAMESPACE.length);
  if (agent.includes(":")) return null;
  return agent;
}

function main() {
  const input = readStdin();
  if (!input.trim()) return emit(null);

  let data;
  try {
    data = JSON.parse(input);
  } catch {
    return emit(null);
  }

  const agent = String(
    data.agent_type ?? data.agentType ?? data.subagent_type ?? "",
  ).toLowerCase();

  const bare = ownAgentName(agent);
  if (bare === null || !WRITE_AGENTS.has(bare)) return emit(null);

  // MUST be the subagent's own transcript, not `transcript_path` — that one is
  // the parent session. Scanning the parent would find any edit the main thread
  // ever made and wrongly conclude this subagent wrote something. Pinned by
  // "missing agent transcript stays silent", whose decoy holds no write: adding a
  // `?? data.transcript_path` fallback here turns silence into a false accusation.
  const agentTranscript =
    data.agent_transcript_path ?? data.agentTranscriptPath ?? null;

  const root = projectRoot(data.cwd);
  const scan = scanTranscript(agentTranscript);
  const wrote = writeVerdict(scan, root);
  const claimed = claimedUnrunCheck(
    scan,
    data.last_assistant_message ?? data.lastAssistantMessage ?? null,
  );
  debug("agent", bare, "root", root, "wrote:", wrote, "unrun claim:", claimed);

  // Three states, three messages, because one message would be a lie in two of
  // them. `null` for the write verdict means "could not determine" and says
  // nothing rather than crying wolf.
  //
  // None of them accuses. The fixer's own brief sanctions `sed`, `git mv` and
  // bulk shell edits, and prefers an MCP code-generation server to hand-written
  // boilerplate — none of which leaves a write-tool block in the transcript. An
  // agent that followed its instructions used to be reported to the user as
  // having "finished without editing or writing any file", which is the false
  // accusation this hook's own header promises never to make.
  //
  // The write states and the claim state are independent: an agent can write
  // nothing AND report a check it never ran, and both are worth saying. The user
  // gets one message, not two.
  const advisories = [];
  if (wrote === "outside") {
    advisories.push(outsideWriteAdvisory(bare));
  } else if (wrote === "none") {
    advisories.push(noWriteAdvisory(bare));
  }
  if (claimed) advisories.push(unrunCheckAdvisory(bare));

  return emit(advisories.length ? `omc-slim: ${advisories.join("\n")}` : null);
}

/** Successful writes, every one of them outside the project root. */
function outsideWriteAdvisory(agentName) {
  return (
    `the ${agentName} agent's only successful writes landed outside the ` +
    `project directory (a scratch path such as /tmp). Nothing in the project ` +
    `changed. If that was the intent, ignore this; if it was not, check the ` +
    `work before trusting the report.`
  );
}

/**
 * No successful write at all. "successful" carries weight: this state also
 * covers the agent whose every write was denied, and "no tool use was seen"
 * would be false of that one.
 */
function noWriteAdvisory(agentName) {
  return (
    `no successful Edit/Write-family tool use was seen from the ` +
    `${agentName} agent. If the work landed through the shell (sed, git mv, a bulk ` +
    `rewrite) or an MCP server, ignore this. Otherwise, check the work before ` +
    `trusting the report.`
  );
}

/**
 * A verification result asserted with nothing in the transcript that ran one.
 *
 * It names the state, not the person, and it offers the innocent reading first —
 * an MCP server or a tool that is not Bash is a check this hook cannot see.
 */
function unrunCheckAdvisory(agentName) {
  return (
    `the ${agentName} agent reported a verification result, and no test, build ` +
    `or typecheck command appears in its transcript. If it verified another way ` +
    `— an MCP server, a tool that is not Bash — ignore this. Otherwise the ` +
    `result is a claim, not an observation.`
  );
}

/** Always exit 0. Advisory hooks must not fail a session. */
function emit(message) {
  if (message) {
    process.stdout.write(
      JSON.stringify({ systemMessage: message, suppressOutput: true }),
    );
  } else {
    process.stdout.write(JSON.stringify({ suppressOutput: true }));
  }
  process.exit(0);
}

try {
  main();
} catch {
  emit(null);
}
