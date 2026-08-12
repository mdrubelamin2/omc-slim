#!/usr/bin/env node
/**
 * omc-slim — PreToolUse fan-out advisory.
 *
 * No hook in Claude Code can cap what a subagent returns to its parent
 * (PostToolUse is purely additive; nothing can rewrite existing context). So the
 * only lever on subagent flooding is deciding *not* to fan out when the context
 * is already tight. This is that lever.
 *
 * Two deliberate differences from oh-my-claudecode's equivalent, both of which
 * were bugs there:
 *
 *   1. It matches `Agent` as well as `Task`. OMC's AGENT_HEAVY_TOOLS set omits
 *      `Agent`, which is the current fan-out tool, so its guard never fires.
 *   2. It **warns, never denies.** A blocking guard whose signal is unreadable
 *      is worse than no guard: OMC's estimator returns 0 on any parse failure,
 *      silently disabling itself. Advisory means failing open is harmless.
 */

import { closeSync, openSync, readFileSync, readSync, statSync } from "node:fs";

/** Warn above this share of the context window. */
const WARN_AT_PERCENT = Number(process.env.OMC_SLIM_PREFLIGHT_PERCENT || 75);

/**
 * Known context-window sizes, ascending. We pick the smallest window that could
 * hold the observed token count.
 *
 * Hardcoding 200K here was a real bug: on a 1M-context session, 160K tokens is
 * 16% used, not 80%, and the hook would have warned on a nearly empty context
 * every single time an agent was spawned. A guard that cries wolf gets ignored,
 * which is the same as not shipping it.
 *
 * Override with OMC_SLIM_CONTEXT_WINDOW when you know the real number.
 */
const KNOWN_WINDOWS = [200_000, 1_000_000];

const WINDOW_OVERRIDE = Number(process.env.OMC_SLIM_CONTEXT_WINDOW || 0);

/**
 * Smallest known window that could contain `tokens`.
 * Falls back to the largest known window rather than reporting >100%.
 */
function inferWindow(tokens) {
  if (WINDOW_OVERRIDE > 0) return WINDOW_OVERRIDE;
  for (const w of KNOWN_WINDOWS) {
    if (tokens <= w) return w;
  }
  return KNOWN_WINDOWS[KNOWN_WINDOWS.length - 1];
}

const FANOUT_TOOLS = new Set(["Agent", "Task"]);

function readStdin() {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

/**
 * Estimate context usage as a percentage of the inferred window.
 *
 * Returns null when the transcript records no usage figure. The caller then
 * stays silent, which is the whole point of being advisory: no signal is a
 * better outcome than a fabricated one.
 */
function estimateContextPercent(transcriptPath) {
  if (!transcriptPath) return null;

  let size;
  try {
    size = statSync(transcriptPath).size;
  } catch {
    return null;
  }

  const reported = readReportedUsage(transcriptPath, size);
  if (reported !== null) return (reported / inferWindow(reported)) * 100;

  // No usage record found. A transcript-size proxy was tried and removed: it
  // counts turns compaction has already dropped, and it cannot distinguish a
  // 200K window from a 1M one. Guessing produces false alarms, and a guard that
  // cries wolf gets ignored. Stay silent instead.
  return null;
}

/**
 * Look for a usage record in the transcript tail. Reads at most the final
 * 256 KB so this stays cheap on long sessions.
 */
function readReportedUsage(transcriptPath, size) {
  const TAIL = 256 * 1024;
  let raw;
  try {
    if (size <= TAIL) {
      raw = readFileSync(transcriptPath, "utf8");
    } else {
      // Read only the final TAIL bytes rather than loading the whole file.
      const fd = openSync(transcriptPath, "r");
      try {
        const buf = Buffer.alloc(TAIL);
        const read = readSync(fd, buf, 0, TAIL, size - TAIL);
        raw = buf.toString("utf8", 0, read);
      } finally {
        closeSync(fd);
      }
      // The first line is almost certainly truncated mid-JSON; drop it.
      const nl = raw.indexOf("\n");
      if (nl !== -1) raw = raw.slice(nl + 1);
    }
  } catch {
    return null;
  }

  let best = null;
  for (const line of raw.split("\n")) {
    if (!line.includes("usage")) continue;
    if (!line.trim().startsWith("{")) continue;
    let obj;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }
    const usage = findUsage(obj);
    if (!usage) continue;
    const total =
      (usage.input_tokens || 0) +
      (usage.cache_read_input_tokens || 0) +
      (usage.cache_creation_input_tokens || 0);
    if (total > 0) best = total;
  }
  return best;
}

function findUsage(node, depth = 0) {
  if (depth > 5 || node === null || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const c of node) {
      const hit = findUsage(c, depth + 1);
      if (hit) return hit;
    }
    return null;
  }
  if (node.usage && typeof node.usage === "object") return node.usage;
  for (const v of Object.values(node)) {
    if (v !== null && typeof v === "object") {
      const hit = findUsage(v, depth + 1);
      if (hit) return hit;
    }
  }
  return null;
}

function main() {
  const input = readStdin();
  if (!input.trim()) return quiet();

  let data;
  try {
    data = JSON.parse(input);
  } catch {
    return quiet();
  }

  const tool = String(data.tool_name ?? data.toolName ?? "");
  if (!FANOUT_TOOLS.has(tool)) return quiet();

  const pct = estimateContextPercent(
    data.transcript_path ?? data.transcriptPath,
  );
  if (pct === null || pct < WARN_AT_PERCENT) return quiet();

  return warn(
    `omc-slim: context is roughly ${Math.round(pct)}% full and you are about to ` +
      `fan out. Subagent results cannot be truncated once returned. Consider ` +
      `running this lane sequentially, narrowing its scope, or compacting first.`,
  );
}

/** Emit nothing actionable; the tool call proceeds untouched. */
function quiet() {
  process.stdout.write(JSON.stringify({ suppressOutput: true }));
  process.exit(0);
}

/**
 * Advisory only. No permissionDecision is returned, so the call is never denied
 * or auto-approved — normal permission flow continues.
 */
function warn(message) {
  process.stdout.write(
    JSON.stringify({
      systemMessage: message,
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        additionalContext: message,
      },
    }),
  );
  process.exit(0);
}

try {
  main();
} catch {
  quiet();
}
