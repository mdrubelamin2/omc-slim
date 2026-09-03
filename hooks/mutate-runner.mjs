#!/usr/bin/env node
/**
 * omc-slim — the shared mutation runner behind both hooks' mutation suites.
 *
 * A passing test suite proves nothing about the bugs it would catch. Each
 * caller hands over a hook, its harness and a list of ways to break the hook on
 * purpose; this runs them and asserts the harness notices every time. A SURVIVED
 * line is a hole in the tests, not a bug in the hook. An UNUSABLE line is
 * neither: the harness never finished, so that mutant was never measured, and a
 * run holding one fails rather than quietly scoring it.
 *
 * Not a test file. `runMutants` is called by *.mutate.mjs, never run directly.
 */

import { spawn, spawnSync } from "node:child_process";
import {
  readFileSync,
  writeFileSync,
  mkdtempSync,
  rmSync,
  readdirSync,
  statSync,
} from "node:fs";
import { availableParallelism, tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { basename, join } from "node:path";

const sha = (text) => createHash("sha256").update(text).digest("hex");

/**
 * What one harness run means.
 *
 * A run that never finished is not a result. `spawnSync` reports a timeout as
 * `error.code === "ETIMEDOUT"` with `status === null`, which a bare
 * `status === 0` test would score as a kill.
 *
 * Signals and spawn failures are unusable for the same reason: nothing was
 * measured. Neither a kill nor a survival, and the run fails on one, because a
 * harness that hangs under a mutant is a defect in the harness whichever way
 * the mutant would have gone.
 *
 * Pure, and exercised by the self-check below: no suite runs this file, so this
 * is the only thing standing between the distinction and a silent revert.
 *
 * @param {{status: number|null, signal: string|null, error?: Error}} run
 * @returns {{outcome: "unusable"|"survived"|"killed", why: string}}
 */
function classify(run) {
  if (run.error) {
    return {
      outcome: "unusable",
      why: `${run.error.code || "error"}: ${run.error.message}`,
    };
  }
  if (run.status === null) {
    return { outcome: "unusable", why: `terminated by ${run.signal}` };
  }
  if (run.status === 0) {
    return { outcome: "survived", why: "harness passed anyway" };
  }
  return { outcome: "killed", why: "" };
}

for (const [expected, run] of [
  ["survived", { status: 0, signal: null }],
  ["killed", { status: 1, signal: null }],
  // The shape spawnSync actually returns on `timeout:`.
  [
    "unusable",
    {
      status: null,
      signal: "SIGTERM",
      error: Object.assign(new Error("spawnSync ETIMEDOUT"), {
        code: "ETIMEDOUT",
      }),
    },
  ],
  ["unusable", { status: null, signal: "SIGKILL" }],
]) {
  const { outcome } = classify(run);
  if (outcome !== expected) {
    throw new Error(
      `mutate-runner self-check: a run of ${JSON.stringify(run)} scored as ` +
        `"${outcome}", expected "${expected}" — the score this prints is wrong`,
    );
  }
}

/**
 * Run every mutant against the harness.
 *
 * @param {object} target
 * @param {string} target.hook     absolute path to the hook under test
 * @param {string} target.test     absolute path to its harness
 * @param {Array}  target.mutants  [label, find, replace, consequence][]
 * @returns {number} the process exit code the caller should use
 */
const MUTANT_TIMEOUT_MS = 120_000;
const LANES = Math.max(1, availableParallelism() - 1);

function runHarness(test, variant) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [test], {
      encoding: "utf8",
      env: { ...process.env, OMC_SLIM_HOOK_PATH: variant },
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, MUTANT_TIMEOUT_MS);
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ status: null, signal: null, error, stdout, stderr });
    });
    child.on("close", (status, signal) => {
      clearTimeout(timer);
      const error = timedOut
        ? Object.assign(new Error("spawn ETIMEDOUT"), { code: "ETIMEDOUT" })
        : undefined;
      resolve({ status, signal, error, stdout, stderr });
    });
  });
}

async function inLanes(items, lanes, work) {
  const results = new Array(items.length);
  let next = 0;
  const lane = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await work(items[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(lanes, items.length) }, lane));
  return results;
}

export async function runMutants({ hook, test, mutants }) {
  const pristine = readFileSync(hook, "utf8");
  const pristineSha = sha(pristine);

  // Mutants are written to a temp copy; the tracked hook is only ever read. The
  // copy lives under the OS temp dir, and the harness is pointed at it with
  // OMC_SLIM_HOOK_PATH.
  //
  // Two concurrent runs that mutate the tracked file in place can restore each
  // other's mutants (this shipped a `WRITE_AGENTS = new Set(["fixer"])` mutant
  // to disk once). Writing to a temp copy removes the whole class instead of
  // policing it.
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
  // Neither killed nor survived. See the classification below.
  const unusable = [];

  console.log(`mutants: ${mutants.length} across ${LANES} lane(s)\n`);

  const outcomes = await inLanes(mutants, LANES, async (mutant, index) => {
    const [label, find, replace, consequence] = mutant;
    if (!pristine.includes(find)) {
      return {
        line: `  ANCHOR-MISS  ${label}`,
        survivor: [label, consequence, "anchor no longer matches the hook"],
      };
    }

    const lane = mkdtempSync(join(sandbox, `m${index}-`));
    const variant = join(lane, basename(hook));
    writeFileSync(variant, pristine.replace(find, replace));
    const run = await runHarness(test, variant);
    rmSync(lane, { recursive: true, force: true });

    const output = (run.stdout || "") + (run.stderr || "");
    const failures = (output.match(/^FAIL/gm) || []).length;
    const { outcome, why } = classify(run);

    if (outcome === "unusable") {
      return {
        line: `  UNUSABLE  ${label.padEnd(46)} ${why} <-- neither killed nor survived`,
        unusable: [label, consequence, why],
      };
    }
    if (outcome === "survived") {
      return {
        line: `  SURVIVED  ${label.padEnd(46)} <-- hole in the tests`,
        survivor: [label, consequence, why],
      };
    }
    return {
      line: `  KILLED    ${label.padEnd(46)} ${failures} case(s) failed`,
      killed: true,
    };
  });

  for (const outcome of outcomes) {
    console.log(outcome.line);
    if (outcome.killed) killed++;
    if (outcome.survivor) survivors.push(outcome.survivor);
    if (outcome.unusable) unusable.push(outcome.unusable);
  }

  // The tracked hook was only ever read, so there is nothing to restore. Assert
  // that rather than trusting it: a future edit that reintroduces in-place
  // mutation should fail here rather than silently corrupt the tree.
  const restored = sha(readFileSync(hook, "utf8")) === pristineSha;

  console.log(`\nscore: ${killed}/${mutants.length} killed`);

  if (unusable.length) {
    console.log(
      `\n${unusable.length} produced no result — the harness never finished, so nothing was measured:`,
    );
    for (const [label, consequence, why] of unusable) {
      console.log(`  - ${label}: ${consequence} (${why})`);
    }
  }

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
  // Its own exit code: an unusable run is not a hole in the tests, it is a
  // harness that cannot answer, and the two need different fixes.
  if (unusable.length) return 3;
  return survivors.length === 0 ? 0 : 1;
}
