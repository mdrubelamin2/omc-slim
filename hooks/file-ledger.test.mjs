#!/usr/bin/env node
/**
 * omc-slim — file-ledger harness
 *
 * Every case runs in a sandbox: a project directory as cwd, a private
 * CLAUDE_CONFIG_DIR and a private HOME, all under one temp root, so neither
 * the hook nor a mutant of it can touch the real config directory. The
 * expected ledger path is derived here from the contract, independently of the
 * hook, so a drift in either derivation fails a case.
 *
 * Run: node hooks/file-ledger.test.mjs
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdtempSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HOOK =
  process.env.OMC_SLIM_HOOK_PATH ??
  join(dirname(fileURLToPath(import.meta.url)), "file-ledger.mjs");

const ALLOWED = new Set(["suppressOutput"]);
const KEEP_ROWS = 500;
const TRIM_ABOVE_ROWS = 1000;
const SESSION = "sess-123";
const HOUR_MS = 3_600_000;

function inSandbox(fn) {
  const root = mkdtempSync(join(tmpdir(), "omc-ledger-"));
  const box = {
    root,
    cwd: join(root, "project"),
    config: join(root, "config"),
    home: join(root, "home"),
  };
  for (const dir of [box.cwd, box.config, box.home]) mkdirSync(dir);
  try {
    return fn(box);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

/** `input` is a payload object, or a raw string for the malformed-stdin case. */
function runHook(box, input, env = {}) {
  const res = spawnSync(process.execPath, [HOOK], {
    input: typeof input === "string" ? input : JSON.stringify(input),
    encoding: "utf8",
    timeout: 5_000,
    env: {
      ...process.env,
      OMC_SLIM_DEBUG: "",
      CLAUDE_CONFIG_DIR: box.config,
      HOME: box.home,
      USERPROFILE: box.home,
      ...env,
    },
  });
  if (res.error) throw res.error;
  return { status: res.status, stdout: res.stdout || "", stderr: res.stderr || "" };
}

/** The FileChanged payload as the binary sends it. */
function payload(box, file, event = "change", extra = {}) {
  return {
    session_id: SESSION,
    transcript_path: join(box.home, "transcript.jsonl"),
    cwd: box.cwd,
    hook_event_name: "FileChanged",
    file_path: file,
    event,
    ...extra,
  };
}

function realpathOrResolve(path) {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}

function ledgerName(cwd) {
  return createHash("sha256").update(realpathOrResolve(cwd)).digest("hex").slice(0, 16) + ".jsonl";
}

function ledgersDir(configDir) {
  return join(configDir, "omc-slim", "ledgers");
}

function ledgerFor(box, cwd = box.cwd) {
  return join(ledgersDir(box.config), ledgerName(cwd));
}

function listDir(dir) {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

function linesOf(path) {
  try {
    return readFileSync(path, "utf8")
      .split("\n")
      .filter((line) => line.trim() !== "");
  } catch {
    return [];
  }
}

/** Creates `rel` under the project, optionally back-dated, and returns its absolute path. */
function touch(box, rel, mtimeMs) {
  const path = join(box.cwd, rel);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, "x");
  if (mtimeMs !== undefined) utimesSync(path, mtimeMs / 1000, mtimeMs / 1000);
  return path;
}

function seedRows(ledger, count) {
  mkdirSync(dirname(ledger), { recursive: true });
  const rows = Array.from({ length: count }, (_, i) =>
    JSON.stringify({ t: i, session_id: SESSION, path: `/old/${i}.ts`, event: "change" }),
  );
  writeFileSync(ledger, rows.join("\n") + "\n");
  return rows;
}

function parse(stdout) {
  try {
    return JSON.parse(stdout);
  } catch {
    return null;
  }
}

function contract(res) {
  if (res.status !== 0) return `expected exit 0, got ${res.status}`;
  if (res.stderr !== "") return `stderr: ${res.stderr}`;
  const out = parse(res.stdout);
  if (!out) return `expected JSON, got ${res.stdout}`;
  if (out.suppressOutput !== true) return "expected suppressOutput true";
  const forbidden = Object.keys(out).filter((k) => !ALLOWED.has(k));
  if (forbidden.length) return `forbidden fields: ${forbidden.join(", ")}`;
  if (out.hookSpecificOutput) return "must not inject into the model";
  if (out.systemMessage) return "must not emit systemMessage";
  return null;
}

/**
 * The sandbox is gone by the time `check` runs, so every case observes the
 * filesystem inside `run` and hands the observation over; these judge it.
 */

/** The one row the hook wrote, as `[row, null]`, or `[null, reason]`. */
function singleRow(res, lines) {
  const v = contract(res);
  if (v) return [null, v];
  if (lines.length !== 1) return [null, `expected 1 row, got ${lines.length}: ${lines.join(" | ")}`];
  return [JSON.parse(lines[0]), null];
}

function expectNoRows(res, lines, why) {
  const v = contract(res);
  if (v) return v;
  if (lines.length !== 0) return `${why}: ${lines.join(" | ")}`;
  return null;
}

/** Either place a ledger could land, if it was created. */
function strayWrites(box) {
  return [join(box.config, "omc-slim"), join(box.home, ".claude")].filter((dir) => existsSync(dir));
}

function expectNothingWritten(results, stray) {
  for (const res of results) {
    const v = contract(res);
    if (v) return v;
  }
  if (stray.length) return `created: ${stray.join(", ")}`;
  return null;
}

const cases = [
  {
    name: "an in-project change lands at <config>/omc-slim/ledgers/<sha256(realpath cwd)[:16]>.jsonl",
    run: () =>
      inSandbox((box) => {
        const src = touch(box, "src/x.ts");
        const res = runHook(box, payload(box, src));
        const ledger = ledgerFor(box);
        return { res, lines: linesOf(ledger), name: basename(ledger), listing: listDir(dirname(ledger)), src };
      }),
    check: ({ res, lines, name, listing, src }) => {
      const [row, err] = singleRow(res, lines);
      if (err) return err;
      if (listing.join(",") !== name)
        return `expected exactly ${name} in the ledgers dir, got ${listing.join(", ")}`;
      const keys = Object.keys(row).sort().join(",");
      if (keys !== "event,path,session_id,t")
        return `row keys must be exactly t, session_id, path, event; got ${Object.keys(row).join(", ")}`;
      if (typeof row.t !== "number") return `expected numeric t, got ${row.t}`;
      if (row.session_id !== SESSION) return `expected session_id ${SESSION}, got ${row.session_id}`;
      if (row.path !== src) return `expected path ${src}, got ${row.path}`;
      if (row.event !== "change") return `expected event change, got ${row.event}`;
      return null;
    },
  },
  {
    // chokidar delivers 0.5-0.7 s after the write; the reader dates the write
    // against the start of a subagent's transcript.
    name: "t is the changed file's mtime, not the delivery time",
    run: () =>
      inSandbox((box) => {
        const src = touch(box, "src/x.ts", Date.now() - HOUR_MS);
        const res = runHook(box, payload(box, src));
        return { res, lines: linesOf(ledgerFor(box)), mtimeMs: statSync(src).mtimeMs };
      }),
    check: ({ res, lines, mtimeMs }) => {
      const [row, err] = singleRow(res, lines);
      if (err) return err;
      if (Math.abs(row.t - mtimeMs) > 1) return `expected t within 1 ms of mtime ${mtimeMs}, got ${row.t}`;
      return null;
    },
  },
  {
    name: "an add event carries the new file's mtime",
    run: () =>
      inSandbox((box) => {
        const src = touch(box, "src/new.ts", Date.now() - HOUR_MS);
        const res = runHook(box, payload(box, src, "add"));
        return { res, lines: linesOf(ledgerFor(box)), mtimeMs: statSync(src).mtimeMs };
      }),
    check: ({ res, lines, mtimeMs }) => {
      const [row, err] = singleRow(res, lines);
      if (err) return err;
      if (row.event !== "add") return `expected event add, got ${row.event}`;
      if (Math.abs(row.t - mtimeMs) > 1) return `expected t within 1 ms of mtime ${mtimeMs}, got ${row.t}`;
      return null;
    },
  },
  {
    name: "an unlink row is stamped with the delivery time",
    run: () =>
      inSandbox((box) => {
        const before = Date.now();
        const res = runHook(box, payload(box, join(box.cwd, "src", "gone.ts"), "unlink"));
        return { res, lines: linesOf(ledgerFor(box)), before, after: Date.now() };
      }),
    check: ({ res, lines, before, after }) => {
      const [row, err] = singleRow(res, lines);
      if (err) return err;
      if (row.event !== "unlink") return `expected event unlink, got ${row.event}`;
      if (row.t < before || row.t > after) return `expected t in [${before}, ${after}], got ${row.t}`;
      return null;
    },
  },
  {
    name: "a change whose file is already gone is stamped with the delivery time",
    run: () =>
      inSandbox((box) => {
        const before = Date.now();
        const res = runHook(box, payload(box, join(box.cwd, "src", "gone.ts")));
        return { res, lines: linesOf(ledgerFor(box)), before, after: Date.now() };
      }),
    check: ({ res, lines, before, after }) => {
      const [row, err] = singleRow(res, lines);
      if (err) return err;
      if (row.t < before || row.t > after) return `expected t in [${before}, ${after}], got ${row.t}`;
      return null;
    },
  },
  {
    // The reader scopes rows to a session; a row it cannot attribute is noise.
    name: "a payload without session_id writes nothing",
    run: () =>
      inSandbox((box) => {
        const src = touch(box, "src/x.ts");
        const results = [
          runHook(box, payload(box, src, "change", { session_id: undefined })),
          runHook(box, payload(box, src, "change", { session_id: "" })),
        ];
        return { results, stray: strayWrites(box) };
      }),
    check: ({ results, stray }) => expectNothingWritten(results, stray),
  },
  {
    name: "without CLAUDE_CONFIG_DIR the ledger lands under ~/.claude",
    run: () =>
      inSandbox((box) => {
        const src = touch(box, "src/x.ts");
        const res = runHook(box, payload(box, src), { CLAUDE_CONFIG_DIR: "" });
        const ledger = join(box.home, ".claude", "omc-slim", "ledgers", ledgerName(box.cwd));
        return { res, lines: linesOf(ledger), strayConfig: existsSync(join(box.config, "omc-slim")) };
      }),
    check: ({ res, lines, strayConfig }) => {
      const [, err] = singleRow(res, lines);
      if (err) return err;
      if (strayConfig) return "wrote under a CLAUDE_CONFIG_DIR that was not set";
      return null;
    },
  },
  {
    // The reader keys by realpath too; a session opened through a symlink must
    // share the ledger of one opened through the real path.
    name: "a cwd reached through a symlink is keyed by its real path",
    run: () =>
      inSandbox((box) => {
        const link = join(box.root, "link");
        symlinkSync(box.cwd, link, "dir");
        touch(box, "src/x.ts");
        const res = runHook(box, payload(box, join(link, "src", "x.ts"), "change", { cwd: link }));
        const ledger = ledgerFor(box, box.cwd);
        return { res, lines: linesOf(ledger), name: basename(ledger), listing: listDir(dirname(ledger)) };
      }),
    check: ({ res, lines, name, listing }) => {
      const [, err] = singleRow(res, lines);
      if (err) return err;
      if (listing.join(",") !== name) return `expected only ${name}, got ${listing.join(", ")}`;
      return null;
    },
  },
  {
    name: "a cwd that no longer exists is keyed by its resolved path",
    run: () =>
      inSandbox((box) => {
        const ghost = join(box.root, "ghost");
        const res = runHook(box, payload(box, join(ghost, "src", "x.ts"), "change", { cwd: ghost }));
        return { res, lines: linesOf(ledgerFor(box, ghost)) };
      }),
    check: ({ res, lines }) => {
      const [, err] = singleRow(res, lines);
      return err;
    },
  },
  {
    // The reader tests containment on the stored path, so a relative one would
    // read as outside every project.
    name: "a relative file_path is stored absolute",
    run: () =>
      inSandbox((box) => {
        const res = runHook(box, payload(box, "src/x.ts"));
        return { res, lines: linesOf(ledgerFor(box)), expected: join(box.cwd, "src", "x.ts") };
      }),
    check: ({ res, lines, expected }) => {
      const [row, err] = singleRow(res, lines);
      if (err) return err;
      if (row.path !== expected) return `expected path ${expected}, got ${row.path}`;
      return null;
    },
  },
  {
    // Claude Code writes settings.local.json on "always allow"; that is not a
    // project edit.
    name: ".claude/settings.local.json is not ledgered",
    run: () =>
      inSandbox((box) => {
        const res = runHook(box, payload(box, join(box.cwd, ".claude", "settings.local.json")));
        return { res, lines: linesOf(ledgerFor(box)) };
      }),
    check: ({ res, lines }) => expectNoRows(res, lines, ".claude writes must not be ledgered"),
  },
  {
    // A `build` or `bin` below the first level is source: src/build/ modules,
    // Rust's src/bin/ binaries.
    name: "src/build and src/bin are ledgered",
    run: () =>
      inSandbox((box) => {
        const files = [join(box.cwd, "src", "build", "x.ts"), join(box.cwd, "src", "bin", "x")];
        const results = files.map((file) => runHook(box, payload(box, file)));
        return { results, lines: linesOf(ledgerFor(box)), files };
      }),
    check: ({ results, lines, files }) => {
      for (const res of results) {
        const v = contract(res);
        if (v) return v;
      }
      const paths = lines.map((line) => JSON.parse(line).path);
      if (paths.join(",") !== files.join(",")) return `expected ${files.join(", ")}, got ${paths.join(", ")}`;
      return null;
    },
  },
  {
    name: "packages/a/node_modules/x is not ledgered",
    run: () =>
      inSandbox((box) => {
        const res = runHook(box, payload(box, join(box.cwd, "packages", "a", "node_modules", "x")));
        return { res, lines: linesOf(ledgerFor(box)) };
      }),
    check: ({ res, lines }) => expectNoRows(res, lines, "a nested node_modules must not be ledgered"),
  },
  {
    name: "venv, Pods and .git writes are not ledgered",
    run: () =>
      inSandbox((box) => {
        const files = [
          join(box.cwd, "venv", "lib", "x.py"),
          join(box.cwd, "Pods", "X", "x.m"),
          join(box.cwd, ".git", "index"),
        ];
        const results = files.map((file) => runHook(box, payload(box, file)));
        return { results, lines: linesOf(ledgerFor(box)) };
      }),
    check: ({ results, lines }) => {
      for (const res of results) {
        const v = contract(res);
        if (v) return v;
      }
      if (lines.length !== 0) return `never-source writes were ledgered: ${lines.join(" | ")}`;
      return null;
    },
  },
  {
    // A checkout under vendor/, or a plugin under ~/.claude, is still a project.
    name: "the skip set applies below cwd, not to cwd's own path",
    run: () =>
      inSandbox((outer) => {
        const box = { ...outer, cwd: join(outer.root, "vendor", ".claude", "proj") };
        mkdirSync(box.cwd, { recursive: true });
        const src = touch(box, "src/x.ts");
        const res = runHook(box, payload(box, src));
        return { res, lines: linesOf(ledgerFor(box)), src };
      }),
    check: ({ res, lines, src }) => {
      const [row, err] = singleRow(res, lines);
      if (err) return err;
      if (row.path !== src) return `expected path ${src}, got ${row.path}`;
      return null;
    },
  },
  {
    name: "1,001 rows are trimmed to the newest 500 through a rename",
    run: () =>
      inSandbox((box) => {
        const ledger = ledgerFor(box);
        const old = seedRows(ledger, TRIM_ABOVE_ROWS);
        const src = touch(box, "src/newest.ts");
        const res = runHook(box, payload(box, src));
        return { res, lines: linesOf(ledger), old, src, tmpLeft: existsSync(`${ledger}.tmp`) };
      }),
    check: ({ res, lines, old, src, tmpLeft }) => {
      const v = contract(res);
      if (v) return v;
      if (lines.length !== KEEP_ROWS) return `expected ${KEEP_ROWS} rows, got ${lines.length}`;
      const newest = JSON.parse(lines[lines.length - 1]);
      if (newest.path !== src) return `newest row must survive the trim, last is ${lines[lines.length - 1]}`;
      // 1,001 rows minus 500 kept: the window opens on old[501].
      if (lines[0] !== old[501]) return `expected the window to open on ${old[501]}, got ${lines[0]}`;
      if (tmpLeft) return "the .tmp file was not renamed over the ledger";
      return null;
    },
  },
  {
    // A rewrite is a second FileChanged and a race with a concurrent append, so
    // the hook only appends until the ledger is twice its kept size. The blank
    // line is the tell: a rewrite drops it.
    name: "at 501 rows the ledger is appended, never rewritten",
    run: () =>
      inSandbox((box) => {
        const ledger = ledgerFor(box);
        const rows = seedRows(ledger, KEEP_ROWS);
        const before = rows.slice(0, 250).join("\n") + "\n\n" + rows.slice(250).join("\n") + "\n";
        writeFileSync(ledger, before);
        const res = runHook(box, payload(box, touch(box, "src/x.ts")));
        return { res, raw: readFileSync(ledger, "utf8"), before };
      }),
    check: ({ res, raw, before }) => {
      const v = contract(res);
      if (v) return v;
      if (!raw.startsWith(before)) return "existing content was rewritten";
      const added = raw.slice(before.length);
      if (!added.endsWith("\n") || added.slice(0, -1).includes("\n"))
        return `expected exactly one appended line, got ${JSON.stringify(added)}`;
      return null;
    },
  },
  {
    name: "malformed lines survive a trim untouched",
    run: () =>
      inSandbox((box) => {
        const ledger = ledgerFor(box);
        mkdirSync(dirname(ledger), { recursive: true });
        const old = Array.from({ length: TRIM_ABOVE_ROWS }, (_, i) => `not json #${i} {`);
        writeFileSync(ledger, old.join("\n") + "\n");
        const src = touch(box, "src/x.ts");
        const res = runHook(box, payload(box, src));
        return { res, lines: linesOf(ledger), old, src };
      }),
    check: ({ res, lines, old, src }) => {
      const v = contract(res);
      if (v) return v;
      if (lines.length !== KEEP_ROWS) return `expected ${KEEP_ROWS} lines, got ${lines.length}`;
      const kept = old.slice(-(KEEP_ROWS - 1));
      for (let i = 0; i < kept.length; i++) {
        if (lines[i] !== kept[i]) return `line ${i} rewritten: ${lines[i]}`;
      }
      if (JSON.parse(lines[KEEP_ROWS - 1]).path !== src) return `the new row is missing: ${lines[KEEP_ROWS - 1]}`;
      return null;
    },
  },
  {
    // A crash between write and rename leaves a .tmp behind; the next trim must
    // write through it and rename it away, not around it.
    name: "a stale <ledger>.tmp is consumed by the next trim",
    run: () =>
      inSandbox((box) => {
        const ledger = ledgerFor(box);
        seedRows(ledger, TRIM_ABOVE_ROWS);
        const junk = "left over from a crashed trim";
        writeFileSync(`${ledger}.tmp`, junk + "\n");
        const res = runHook(box, payload(box, touch(box, "src/x.ts")));
        return { res, lines: linesOf(ledger), junk, tmpLeft: existsSync(`${ledger}.tmp`) };
      }),
    check: ({ res, lines, junk, tmpLeft }) => {
      const v = contract(res);
      if (v) return v;
      if (tmpLeft) return "the stale .tmp is still there";
      if (lines.length !== KEEP_ROWS) return `expected ${KEEP_ROWS} rows, got ${lines.length}`;
      if (lines.includes(junk)) return "the stale .tmp content leaked into the ledger";
      return null;
    },
  },
  {
    name: "a symlink at the ledger path is not written through",
    run: () =>
      inSandbox((box) => {
        const target = join(box.root, "settings.json");
        writeFileSync(target, "{}");
        const ledger = ledgerFor(box);
        mkdirSync(dirname(ledger), { recursive: true });
        symlinkSync(target, ledger);
        const res = runHook(box, payload(box, touch(box, "src/x.ts")));
        return { res, target: readFileSync(target, "utf8"), stillLink: lstatSync(ledger).isSymbolicLink() };
      }),
    check: ({ res, target, stillLink }) => {
      const v = contract(res);
      if (v) return v;
      if (target !== "{}") return `symlink target was written: ${JSON.stringify(target)}`;
      if (!stillLink) return "the symlink was replaced";
      return null;
    },
  },
  {
    name: "a directory at the ledger path is left alone",
    run: () =>
      inSandbox((box) => {
        const ledger = ledgerFor(box);
        mkdirSync(ledger, { recursive: true });
        const res = runHook(box, payload(box, touch(box, "src/x.ts")));
        return { res, isDir: lstatSync(ledger).isDirectory(), entries: readdirSync(ledger) };
      }),
    check: ({ res, isDir, entries }) => {
      const v = contract(res);
      if (v) return v;
      if (!isDir) return "the directory was replaced";
      if (entries.length) return `the directory was written into: ${entries.join(", ")}`;
      return null;
    },
  },
  {
    // The hook trims at 1,000 rows, so a ledger past 1 MiB is not one it wrote.
    name: "a ledger over 1 MiB is left alone",
    run: () =>
      inSandbox((box) => {
        const ledger = ledgerFor(box);
        mkdirSync(dirname(ledger), { recursive: true });
        const big = "x".repeat(1024 * 1024 + 1) + "\n";
        writeFileSync(ledger, big);
        const res = runHook(box, payload(box, touch(box, "src/x.ts")));
        return { res, size: lstatSync(ledger).size, expected: big.length };
      }),
    check: ({ res, size, expected }) => {
      const v = contract(res);
      if (v) return v;
      if (size !== expected) return `expected the ledger untouched at ${expected} bytes, got ${size}`;
      return null;
    },
  },
  {
    name: "a payload without cwd writes nothing",
    run: () =>
      inSandbox((box) => {
        const res = runHook(box, payload(box, join(box.cwd, "src", "x.ts"), "change", { cwd: undefined }));
        return { results: [res], stray: strayWrites(box) };
      }),
    check: ({ results, stray }) => expectNothingWritten(results, stray),
  },
  {
    name: "malformed stdin exits 0 and writes nothing",
    run: () =>
      inSandbox((box) => {
        const res = runHook(box, "{ not json");
        return { results: [res], stray: strayWrites(box) };
      }),
    check: ({ results, stray }) => expectNothingWritten(results, stray),
  },
];

let failed = 0;
for (const testCase of cases) {
  let reason;
  try {
    reason = testCase.check(testCase.run());
  } catch (err) {
    reason = `harness error: ${err && err.message}`;
  }
  if (reason) {
    failed++;
    console.log(`FAIL  ${testCase.name}`);
    console.log(`      ${reason}`);
  } else {
    console.log(`PASS  ${testCase.name}`);
  }
}
console.log(`\n${cases.length - failed}/${cases.length} passed`);
process.exit(failed === 0 ? 0 : 1);
