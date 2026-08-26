#!/usr/bin/env node
/**
 * omc-slim — the shared mutation runner behind both hooks' mutation suites.
 *
 * A passing test suite proves nothing about the bugs it would catch. Each
 * caller hands over a hook, its harness and a list of ways to break the hook on
 * purpose; this runs them and asserts the harness notices every time. A SURVIVED
 * line is a hole in the tests, not a bug in the hook.
 *
 * It was extracted when the second hook arrived. The sandbox logic below carries
 * scar tissue from a real corruption (see MUTANTS NEVER TOUCH THE TRACKED FILE),
 * and two copies of that would have drifted — the second copy is exactly where a
 * fixed bug comes back.
 *
 * Not a test file. `runMutants` is called by *.mutate.mjs, never run directly.
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
import { basename, join } from "node:path";

const sha = (text) => createHash("sha256").update(text).digest("hex");

/**
 * Run every mutant against the harness.
 *
 * @param {object} target
 * @param {string} target.hook     absolute path to the hook under test
 * @param {string} target.test     absolute path to its harness
 * @param {Array}  target.mutants  [label, find, replace, consequence][]
 * @returns {number} the process exit code the caller should use
 */
export function runMutants({ hook, test, mutants }) {
  const pristine = readFileSync(hook, "utf8");
  const pristineSha = sha(pristine);

  // --- MUTANTS NEVER TOUCH THE TRACKED FILE ---------------------------------
  // Each mutant is written to a throwaway copy under the OS temp dir, and the
  // harness is pointed at it with OMC_SLIM_HOOK_PATH. The tracked hook is only
  // ever read.
  //
  // It used to be mutated in place and restored from the snapshot. Two
  // concurrent runs corrupted each other: run B snapshotted while run A held a
  // mutant, then faithfully "restored" that mutant, and the sha256 line still
  // said "match" because it matched the snapshot B took. That shipped a
  // `WRITE_AGENTS = new Set(["fixer"])` mutant to disk, silently disabling the
  // designer check while every other gate reported green.
  //
  // A lock plus a pristine guard was the first fix. Both were wrong: the
  // pristine guard could not see a mutant whose `find` string occurs twice
  // (String.replace substitutes only the first, so `includes(find)` stays true),
  // and its printed remedy — `git checkout --` — discards uncommitted work. Not
  // writing to the tracked file removes the whole class instead of policing it.
  //
  // Prefixed so a leaked dir is identifiable and sweepable. SIGKILL cannot be
  // caught, so the exit handler below is best-effort; sweep stale siblings first
  // rather than accumulating them in /tmp across killed runs.
  const sandbox = mkdtempSync(join(tmpdir(), "omc-slim-mutate-"));
  try {
    for (const stale of readdirSync(tmpdir())) {
      if (!stale.startsWith("omc-slim-mutate-")) continue;
      const dir = join(tmpdir(), stale);
      if (dir !== sandbox && Date.now() - statSync(dir).mtimeMs > 3_600_000) {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  } catch {}
  process.on("exit", () => {
    try {
      rmSync(sandbox, { recursive: true, force: true });
    } catch {}
  });

  let killed = 0;
  const survivors = [];

  console.log(`mutants: ${mutants.length}\n`);

  for (const [label, find, replace, consequence] of mutants) {
    // `find` must appear verbatim in the hook. A missing anchor is reported
    // rather than skipped — a mutant that stops applying is a mutant that stops
    // testing.
    if (!pristine.includes(find)) {
      console.log(`  ANCHOR-MISS  ${label}`);
      survivors.push([label, consequence, "anchor no longer matches the hook"]);
      continue;
    }

    // Named after the hook, because the harness resolves its own default from
    // its filename and a mismatch would silently test the wrong file.
    const variant = join(sandbox, basename(hook));
    writeFileSync(variant, pristine.replace(find, replace));
    const run = spawnSync(process.execPath, [test], {
      encoding: "utf8",
      timeout: 120_000,
      env: { ...process.env, OMC_SLIM_HOOK_PATH: variant },
    });

    const output = (run.stdout || "") + (run.stderr || "");
    const failures = (output.match(/^FAIL/gm) || []).length;

    if (run.status === 0) {
      survivors.push([label, consequence, "harness passed anyway"]);
      console.log(`  SURVIVED  ${label.padEnd(46)} <-- hole in the tests`);
    } else {
      killed++;
      console.log(`  KILLED    ${label.padEnd(46)} ${failures} case(s) failed`);
    }
  }

  // The tracked hook was only ever read, so there is nothing to restore. Assert
  // that rather than trusting it: a future edit that reintroduces in-place
  // mutation should fail here rather than silently corrupt the tree.
  const restored = sha(readFileSync(hook, "utf8")) === pristineSha;

  console.log(`\nscore: ${killed}/${mutants.length} killed`);

  if (survivors.length) {
    console.log(
      "\nsurvivors — each is a regression the harness would not catch:",
    );
    for (const [label, consequence, how] of survivors) {
      console.log(`  - ${label}: ${consequence} (${how})`);
    }
  }

  console.log(
    `tracked hook untouched: ${restored ? "yes (sha256 match)" : "NO — THE TREE IS DIRTY, check git diff"}`,
  );

  if (!restored) return 2;
  return survivors.length === 0 ? 0 : 1;
}
