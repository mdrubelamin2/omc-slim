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
 * So: collect write-tool `tool_use` ids with the path each one wrote, then
 * require a matching `tool_result` that is not `is_error`. A tool_use with no
 * result at all (agent died mid-call) also counts as no write.
 *
 * A successful write whose path cannot be placed — no path in the input, or a
 * null `root` — counts as `true`. Silence is the only safe reading of a write
 * this cannot locate.
 *
 * @param {string|null} transcriptPath
 * @param {string|null} root  resolved project root, or null to skip the test
 * @returns {null|true|"outside"|"none"}
 */
function sawWriteTool(transcriptPath, root) {
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

  /** id of every write-tool tool_use block -> the path it wrote, or null */
  const pendingWrites = new Map();
  /** ids whose tool_result came back clean */
  const succeeded = new Set();

  const deadline = Date.now() + SCAN_BUDGET_MS;
  let scanned = 0;

  for (const line of raw.split("\n")) {
    // Checked every 256 lines rather than every line: Date.now() per line on a
    // 50 MB transcript is itself measurable, and 256 lines cannot overrun a
    // 2 s budget by anything that matters.
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
    collectBlocks(obj, pendingWrites, succeeded);
  }

  let sawSuccess = false;
  for (const [id, path] of pendingWrites) {
    if (!succeeded.has(id)) continue;
    sawSuccess = true;
    if (root === null || path === null) return true;
    if (writeIsInProject(path, root)) return true;
  }
  return sawSuccess ? "outside" : "none";
}

/** Depth-bounded walk collecting write tool_use ids and clean tool_result ids. */
function collectBlocks(node, pendingWrites, succeeded, depth = 0) {
  if (depth > 6 || node === null || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const child of node) {
      collectBlocks(child, pendingWrites, succeeded, depth + 1);
    }
    return;
  }

  if (node.type === "tool_use" && WRITE_TOOLS.has(node.name) && node.id) {
    pendingWrites.set(node.id, writtenPath(node.input));
  }
  // `is_error` is absent on success and true on failure.
  if (node.type === "tool_result" && node.tool_use_id && node.is_error !== true) {
    succeeded.add(node.tool_use_id);
  }

  for (const value of Object.values(node)) {
    if (value !== null && typeof value === "object") {
      collectBlocks(value, pendingWrites, succeeded, depth + 1);
    }
  }
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
  const wrote = sawWriteTool(agentTranscript, root);
  debug("agent", bare, "root", root, "wrote:", wrote);

  // null => could not determine. Say nothing rather than cry wolf.
  if (wrote === null || wrote === true) return emit(null);

  // Two states, two messages, because one message would be a lie in one of them.
  //
  // Neither accuses. The fixer's own brief sanctions `sed`, `git mv` and bulk
  // shell edits, and prefers an MCP code-generation server to hand-written
  // boilerplate — none of which leaves a write-tool block in the transcript. An
  // agent that followed its instructions used to be reported to the user as
  // having "finished without editing or writing any file", which is the false
  // accusation this hook's own header promises never to make.
  if (wrote === "outside") {
    return emit(
      `omc-slim: the ${bare} agent's only successful writes landed outside the ` +
        `project directory (a scratch path such as /tmp). Nothing in the project ` +
        `changed. If that was the intent, ignore this; if it was not, check the ` +
        `work before trusting the report.`,
    );
  }

  // "successful" carries weight: this state also covers the agent whose every
  // write was denied, and "no tool use was seen" would be false of that one.
  return emit(
    `omc-slim: no successful Edit/Write-family tool use was seen from the ` +
      `${bare} agent. If the work landed through the shell (sed, git mv, a bulk ` +
      `rewrite) or an MCP server, ignore this. Otherwise, check the work before ` +
      `trusting the report.`,
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
