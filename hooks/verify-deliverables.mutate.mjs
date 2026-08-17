#!/usr/bin/env node
/**
 * omc-slim — mutation check for the verify-deliverables harness.
 *
 * A passing test suite proves nothing about the bugs it would catch. This
 * breaks the hook on purpose, fifteen ways, and asserts the harness notices
 * every time. A SURVIVED line is a hole in the tests, not a bug in the hook.
 *
 * It exists because the first draft of that harness passed 9/9 while missing
 * nine of eleven mutants — including `additionalContext`, the one regression
 * the hook was written to avoid, and `continue: false`, which halts a session
 * while still exiting 0. Both are invisible to an exit-code assertion.
 *
 * The hook is restored from memory after every mutant and the restore is
 * verified by sha256, so an interrupted run cannot leave a mutant on disk.
 *
 * Run: node hooks/verify-deliverables.mutate.mjs
 */

import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const HOOK = join(HERE, "verify-deliverables.mjs");
const TEST = join(HERE, "verify-deliverables.test.mjs");

const sha = (text) => createHash("sha256").update(text).digest("hex");
const PRISTINE = readFileSync(HOOK, "utf8");
const PRISTINE_SHA = sha(PRISTINE);

/**
 * [label, find, replace, what breaks in production]
 *
 * `find` must appear verbatim in the hook. A missing anchor is reported rather
 * than skipped — a mutant that stops applying is a mutant that stops testing.
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
  ["cap check removed",
   "if (size > MAX_TRANSCRIPT_BYTES) {",
   "if (false) {",
   "unbounded read"],
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
  ["exit code 1",
   "process.exit(0);\n}",
   "process.exit(1);\n}",
   "breaks 'always exits 0'"],
  ["bare-name split removed",
   'const bare = agent.includes(":") ? agent.slice(agent.indexOf(":") + 1) : agent;',
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

let killed = 0;
const survivors = [];

console.log(`mutants: ${MUTANTS.length}\n`);

for (const [label, find, replace, consequence] of MUTANTS) {
  if (!PRISTINE.includes(find)) {
    console.log(`  ANCHOR-MISS  ${label}`);
    survivors.push([label, consequence, "anchor no longer matches the hook"]);
    continue;
  }

  writeFileSync(HOOK, PRISTINE.replace(find, replace));
  const run = spawnSync(process.execPath, [TEST], {
    encoding: "utf8",
    timeout: 120_000,
  });
  writeFileSync(HOOK, PRISTINE);

  const output = (run.stdout || "") + (run.stderr || "");
  const failures = (output.match(/^FAIL/gm) || []).length;

  if (run.status === 0) {
    survivors.push([label, consequence, "harness passed anyway"]);
    console.log(`  SURVIVED  ${label.padEnd(42)} <-- hole in the tests`);
  } else {
    killed++;
    console.log(`  KILLED    ${label.padEnd(42)} ${failures} case(s) failed`);
  }
}

writeFileSync(HOOK, PRISTINE);
const restored = sha(readFileSync(HOOK, "utf8")) === PRISTINE_SHA;

console.log(`\nscore: ${killed}/${MUTANTS.length} killed`);

if (survivors.length) {
  console.log("\nsurvivors — each is a regression the harness would not catch:");
  for (const [label, consequence, how] of survivors) {
    console.log(`  - ${label}: ${consequence} (${how})`);
  }
}

console.log(`hook restored: ${restored ? "yes (sha256 match)" : "NO — MISMATCH, check git diff"}`);

if (!restored) process.exit(2);
process.exit(survivors.length === 0 ? 0 : 1);
