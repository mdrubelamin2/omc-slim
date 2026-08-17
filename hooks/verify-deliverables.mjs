#!/usr/bin/env node
/**
 * omc-slim — SubagentStop deliverable check.
 *
 * A subagent can report success having written nothing. This checks that a
 * write-capable specialist actually touched a file, and tells the *user* when it
 * did not.
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

import { readFileSync, statSync } from "node:fs";

/** Specialists expected to produce file changes. Read-only agents are exempt. */
const WRITE_AGENTS = new Set(["fixer", "designer"]);

/**
 * Cap on the transcript read. It was 2 MB, and 89% of transcripts over that cap
 * contain a successful write (39 of 44, sampled 2026-08-17) — so the check was
 * being skipped on the agents doing the most work. The largest sampled was
 * 50,017,698 bytes and parsed fully in 145 ms against the 5 s timeout in
 * hooks.json — so this bounds readFileSync's string allocation, not scan time.
 */
const MAX_TRANSCRIPT_BYTES = 64 * 1024 * 1024;

/** Tools whose successful use counts as having produced a deliverable. */
const WRITE_TOOLS = new Set(["Edit", "Write", "NotebookEdit", "MultiEdit"]);

function debug(...args) {
  if (process.env.OMC_SLIM_DEBUG === "1") console.error("[omc-slim]", ...args);
}

function readStdin() {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

/**
 * Did this agent SUCCESSFULLY write a file?
 *
 * An attempted write is not a deliverable. A permission-denied Edit still
 * appears as a `tool_use` block, so matching on tool_use alone reports success
 * for an agent that was blocked and produced nothing — the exact situation most
 * worth flagging. Pinned by "denied write is not a deliverable" in
 * verify-deliverables.test.mjs, which re-runs this against a real denial payload.
 *
 * So: collect write-tool `tool_use` ids, then require a matching `tool_result`
 * that is not `is_error`. A tool_use with no result at all (agent died
 * mid-call) also counts as no write.
 *
 * Returns null when the transcript cannot be read — the caller treats that as
 * "cannot tell" and stays silent, rather than as "no writes".
 */
function sawWriteTool(transcriptPath) {
  if (!transcriptPath) {
    debug("cannot tell: no agent transcript path in payload");
    return null;
  }

  let size;
  try {
    size = statSync(transcriptPath).size;
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

  /** ids of tool_use blocks that invoked a write tool */
  const pendingWrites = new Set();
  /** ids whose tool_result came back clean */
  const succeeded = new Set();

  for (const line of raw.split("\n")) {
    if (!line.trim().startsWith("{")) continue;
    let obj;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }
    collectBlocks(obj, pendingWrites, succeeded);
  }

  for (const id of pendingWrites) {
    if (succeeded.has(id)) return true;
  }
  return false;
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
    pendingWrites.add(node.id);
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

  // Namespaced as "omc-slim:fixer" when installed as a plugin.
  const bare = agent.includes(":") ? agent.slice(agent.indexOf(":") + 1) : agent;
  if (!WRITE_AGENTS.has(bare)) return emit(null);

  // MUST be the subagent's own transcript, not `transcript_path` — that one is
  // the parent session. Scanning the parent would find any edit the main thread
  // ever made and wrongly conclude this subagent wrote something. Pinned by
  // "missing agent transcript stays silent", whose decoy holds no write: adding a
  // `?? data.transcript_path` fallback here turns silence into a false accusation.
  const agentTranscript =
    data.agent_transcript_path ?? data.agentTranscriptPath ?? null;

  const wrote = sawWriteTool(agentTranscript);
  debug("agent", bare, "wrote:", wrote);

  // null => could not determine. Say nothing rather than cry wolf.
  if (wrote === null || wrote === true) return emit(null);

  return emit(
    `omc-slim: the ${bare} agent finished without editing or writing any file. ` +
      `If it reported the task complete, verify that before trusting it.`,
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
