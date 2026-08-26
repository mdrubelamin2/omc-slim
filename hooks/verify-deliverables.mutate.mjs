#!/usr/bin/env node
/**
 * omc-slim — mutation check for the verify-deliverables harness.
 *
 * Breaks the hook on purpose, twenty-three ways, and asserts the harness
 * notices every time. A SURVIVED line is a hole in the tests, not a bug in the
 * hook.
 *
 * It exists because the first draft of that harness passed 9/9 while missing
 * nine of eleven mutants — including `additionalContext`, the one regression
 * the hook was written to avoid, and `continue: false`, which halts a session
 * while still exiting 0. Both are invisible to an exit-code assertion.
 *
 * The runner it calls is shared with check-output-style.mutate.mjs and holds the
 * sandbox discipline: mutants go to a temp copy, and the tracked hook is only
 * ever read.
 *
 * Run: node hooks/verify-deliverables.mutate.mjs
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runMutants } from "./mutate-runner.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * [label, find, replace, what breaks in production]
 */
const MUTANTS = [
  ["additionalContext emitted",
   "JSON.stringify({ systemMessage: message, suppressOutput: true })",
   'JSON.stringify({ systemMessage: message, suppressOutput: true, hookSpecificOutput: { additionalContext: "x" } })',
   "re-injects into the finishing subagent"],
  ["continue:false emitted",
   "JSON.stringify({ suppressOutput: true })",
   'JSON.stringify({ suppressOutput: true, continue: false, stopReason: "x" })',
   "halts the session while exiting 0"],
  ["debug writes to stdout",
   'console.error("[omc-slim]", ...args)',
   'console.log("[omc-slim]", ...args)',
   "corrupts the JSON payload"],
  ["scan deadline removed",
   "if ((scanned++ & 0xff) === 0 && Date.now() >= deadline) {",
   "if (false) {",
   "unbounded scan on a pathological transcript, and the 5 s in hooks.json is advisory"],
  ["scan deadline accuses instead of abstaining",
   'debug("cannot tell: scan budget exhausted", scanned, transcriptPath);\n      return null;',
   'debug("cannot tell: scan budget exhausted", scanned, transcriptPath);\n      return false;',
   "a slow scan becomes a false accusation against an agent that did write"],
  ["cap check removed",
   "if (size > MAX_TRANSCRIPT_BYTES) {",
   "if (false) {",
   "unbounded read"],
  ["regular-file check removed",
   "if (!st.isFile()) {",
   "if (false) {",
   "hangs forever on a FIFO or character device, breaking 'always exits 0'"],
  ["lstat weakened to stat",
   "const st = lstatSync(transcriptPath);",
   "const st = statSync(transcriptPath);",
   "follows a symlink to an arbitrary path"],
  ["parent transcript fallback",
   "data.agent_transcript_path ?? data.agentTranscriptPath ?? null",
   "data.agent_transcript_path ?? data.agentTranscriptPath ?? data.transcript_path ?? null",
   "credits the main thread's edits to the subagent"],
  ["namespaced name leaks into message",
   "`omc-slim: the ${bare} agent finished",
   "`omc-slim: the ${agent} agent finished",
   "user sees 'omc-slim:fixer'"],
  ["designer dropped from WRITE_AGENTS",
   'new Set(["fixer", "designer"])',
   'new Set(["fixer"])',
   "half the registered agents stop being checked"],
  ["failed tool_result counts as success",
   "node.is_error !== true",
   "true",
   "a denied write becomes a deliverable"],
  ["null treated as no-write",
   "if (wrote === null || wrote === true) return emit(null);",
   "if (wrote === true) return emit(null);",
   "cries wolf when it cannot tell"],
  ["depth bound cut to 2",
   "if (depth > 6 ||",
   "if (depth > 2 ||",
   "misses real blocks at depth 3"],
  ["MultiEdit dropped from WRITE_TOOLS",
   '"NotebookEdit", "MultiEdit"',
   '"NotebookEdit"',
   "MultiEdit stops counting as a write"],
  ["Write dropped from WRITE_TOOLS",
   '"Edit", "Write"',
   '"Edit"',
   "the commonest write tool stops counting, and every Write-only run is accused"],
  ["NotebookEdit dropped from WRITE_TOOLS",
   '"Write", "NotebookEdit"',
   '"Write"',
   "a notebook edit stops counting as a write"],
  ["blank scan budget parsed as zero",
   'if (raw === undefined || raw.trim() === "") return 2000;',
   "if (raw === undefined) return 2000;",
   "an exported-but-empty override mutes the hook permanently"],
  // The fallback is mutated TOWARDS silence, not towards NaN. `return n` on a
  // garbage value disables the deadline, which fails open and is the direction
  // this hook is allowed to fail in — no fixture can observe it. `return 0`
  // models the regression that matters: a typo'd override mutes the guard.
  ["scan budget falls back to zero instead of the default",
   "return Number.isFinite(n) && n >= 0 ? n : 2000;",
   "return Number.isFinite(n) && n >= 0 ? n : 0;",
   "a non-numeric override mutes the hook instead of using the default"],
  ["exit code 1",
   "process.exit(0);\n}",
   "process.exit(1);\n}",
   "breaks 'always exits 0'"],
  ["bare-name split removed",
   'const bare = agent.includes(":")\n    ? agent.slice(agent.lastIndexOf(":") + 1)\n    : agent;',
   "const bare = agent;",
   "namespaced agents stop being checked"],
  ["suppressOutput dropped",
   "suppressOutput: true }",
   "}",
   "raw JSON may surface to the user"],
  ["attempted write counts as a deliverable",
   "  for (const id of pendingWrites) {\n    if (succeeded.has(id)) return true;\n  }\n  return false;",
   "  return pendingWrites.size > 0;",
   "the original bug the hook was written to avoid"],
];

process.exit(
  runMutants({
    hook: join(HERE, "verify-deliverables.mjs"),
    test: join(HERE, "verify-deliverables.test.mjs"),
    mutants: MUTANTS,
  }),
);
