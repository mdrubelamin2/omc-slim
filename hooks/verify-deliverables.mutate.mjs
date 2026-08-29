#!/usr/bin/env node
/**
 * omc-slim — mutation check for the verify-deliverables harness.
 *
 * Breaks the hook on purpose, thirty-five ways, and asserts the harness
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
   "`${bare} agent. If the work landed through the shell",
   "`${agent} agent. If the work landed through the shell",
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
  // --- C5: the two layers that decide who is covered -------------------------
  // hooks.json's matcher and ownAgentName have to agree. Three mutants, because
  // the pin can fail in three directions and only one of them is loud.
  ["namespace stripping restored (the C5 over-reach)",
   '  if (agent.includes(":")) return null;\n  return agent;',
   '  if (agent.includes(":")) return agent.slice(agent.lastIndexOf(":") + 1);\n  return agent;',
   "warns another plugin's fixer about a brief it never agreed to"],
  ["pin tightened to the namespace only",
   '  if (agent.includes(":")) return null;\n  return agent;',
   "  return null;",
   "a bare agent-type — the spelling a --plugin-dir dev session may present — stops being checked"],
  ["namespaced agents stop being checked",
   "  if (agent.startsWith(SELF_NAMESPACE)) return agent.slice(SELF_NAMESPACE.length);",
   "  if (false) return agent.slice(SELF_NAMESPACE.length);",
   "omc-slim:fixer, the spelling an installed plugin presents, goes unchecked"],

  // --- A3 / C8: where the write landed ---------------------------------------
  ["outside-the-project write counted as a deliverable",
   'return sawSuccess ? "outside" : "none";',
   'return sawSuccess ? true : "none";',
   "C8 returns: a scratch write to /tmp silences the hook and the project is untouched"],
  ["containment test always passes",
   "  return path === root || path.startsWith(root + sep);",
   "  return true;",
   "every write counts wherever it landed — C8 again, one layer down"],
  ["containment test always fails",
   "  return path === root || path.startsWith(root + sep);",
   "  return false;",
   "every in-project write is reported as having landed outside"],
  ["project root not symlink-resolved",
   "    return { real: realpathSync(cwd), raw: resolve(cwd) };",
   "    return { real: cwd, raw: resolve(cwd) };",
   "a cwd reached through a symlink makes every write look external"],
  ["the lexical containment test removed",
   "  if (root.raw !== null && withinRoot(resolve(root.raw, rawPath), root.raw)) {\n    return true;\n  }",
   "  if (false) {\n    return true;\n  }",
   "a write through a symlinked directory INSIDE the project is called outside it"],
  ["written path not symlink-resolved",
   "      return join(realpathSync(head), ...tail);",
   "      return resolve(base, path);",
   "a path spelled through a symlink makes an in-project write look external"],
  ["a missing cwd is guessed at rather than abstained on",
   '    debug("no cwd in payload; not testing where writes landed");\n    return null;',
   '    debug("no cwd in payload; not testing where writes landed");\n    return "/nonexistent-project-root";',
   "a payload with no cwd turns every write into a false accusation"],
  ["a write with no path is placed anyway",
   '    if (typeof value === "string" && value.trim() !== "") return value;\n  }\n  return null;',
   '    if (typeof value === "string" && value.trim() !== "") return value;\n  }\n  return "/tmp/nowhere";',
   "a write-tool shape this hook does not know becomes an accusation"],
  ["an unplaceable write is treated as outside",
   "    if (root === null || path === null) return true;",
   '    if (root === null) return true;\n    if (path === null) return "outside";',
   "cannot-tell is reported as a verdict, which is the one thing this hook must not do"],
  ["the two states collapse into one message",
   '  if (wrote === "outside") {',
   "  if (false) {",
   "a /tmp-only run is reported as 'no write tool was used', which is false"],
  ["notebook_path stops being read",
   '  for (const key of ["file_path", "notebook_path"]) {',
   '  for (const key of ["file_path"]) {',
   "every NotebookEdit becomes an unplaceable write"],
  ["suppressOutput dropped",
   "suppressOutput: true }",
   "}",
   "raw JSON may surface to the user"],
  ["attempted write counts as a deliverable",
   "    if (!succeeded.has(id)) continue;",
   "    if (false) continue;",
   "the original bug the hook was written to avoid: a denied Edit becomes a deliverable"],
];

process.exit(
  runMutants({
    hook: join(HERE, "verify-deliverables.mjs"),
    test: join(HERE, "verify-deliverables.test.mjs"),
    mutants: MUTANTS,
  }),
);
