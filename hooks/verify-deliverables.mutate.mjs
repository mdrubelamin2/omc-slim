#!/usr/bin/env node
/**
 * omc-slim — mutation check for the verify-deliverables harness.
 *
 * A passing test suite proves nothing about the bugs it would catch. This
 * breaks the hook on purpose, twenty-three ways, and asserts the harness notices
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
import {
  readFileSync,
  writeFileSync,
  mkdtempSync,
  rmSync,
  readdirSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
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

// --- mutants never touch the tracked file -------------------------------------
// Each mutant is written to a throwaway copy under the OS temp dir, and the test
// harness is pointed at it with OMC_SLIM_HOOK_PATH. The tracked hook is only
// ever read.
//
// It used to be mutated in place and restored from PRISTINE. Two concurrent runs
// corrupted each other: run B snapshotted while run A held a mutant, then
// faithfully "restored" that mutant, and the sha256 line still said "match"
// because it matched the snapshot B took. That shipped a
// `WRITE_AGENTS = new Set(["fixer"])` mutant to disk, silently disabling the
// designer check while every other gate reported green.
//
// A lock plus a pristine guard was the first fix. Both were wrong: the pristine
// guard could not see a mutant whose `find` string occurs twice (String.replace
// substitutes only the first, so `includes(find)` stays true), and its printed
// remedy — `git checkout --` — discards uncommitted work. Not writing to the
// tracked file removes the whole class instead of policing it.
// Prefixed so a leaked dir is identifiable and sweepable. SIGKILL cannot be
// caught, so the exit handler below is best-effort; sweep stale siblings first
// rather than accumulating them in /tmp across killed runs.
const SANDBOX = mkdtempSync(join(tmpdir(), "omc-slim-mutate-"));
try {
  for (const stale of readdirSync(tmpdir())) {
    if (!stale.startsWith("omc-slim-mutate-")) continue;
    const dir = join(tmpdir(), stale);
    if (dir !== SANDBOX && Date.now() - statSync(dir).mtimeMs > 3_600_000) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
} catch {}
process.on("exit", () => {
  try {
    rmSync(SANDBOX, { recursive: true, force: true });
  } catch {}
});

let killed = 0;
const survivors = [];

console.log(`mutants: ${MUTANTS.length}\n`);

for (const [label, find, replace, consequence] of MUTANTS) {
  if (!PRISTINE.includes(find)) {
    console.log(`  ANCHOR-MISS  ${label}`);
    survivors.push([label, consequence, "anchor no longer matches the hook"]);
    continue;
  }

  const variant = join(SANDBOX, "verify-deliverables.mjs");
  writeFileSync(variant, PRISTINE.replace(find, replace));
  const run = spawnSync(process.execPath, [TEST], {
    encoding: "utf8",
    timeout: 120_000,
    env: { ...process.env, OMC_SLIM_HOOK_PATH: variant },
  });

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

// The tracked hook was only ever read, so there is nothing to restore. Assert
// that rather than trusting it: a future edit that reintroduces in-place
// mutation should fail here rather than silently corrupt the tree.
const restored = sha(readFileSync(HOOK, "utf8")) === PRISTINE_SHA;

console.log(`\nscore: ${killed}/${MUTANTS.length} killed`);

if (survivors.length) {
  console.log("\nsurvivors — each is a regression the harness would not catch:");
  for (const [label, consequence, how] of survivors) {
    console.log(`  - ${label}: ${consequence} (${how})`);
  }
}

console.log(`tracked hook untouched: ${restored ? "yes (sha256 match)" : "NO — THE TREE IS DIRTY, check git diff"}`);

if (!restored) process.exit(2);
process.exit(survivors.length === 0 ? 0 : 1);
