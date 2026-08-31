#!/usr/bin/env node
/**
 * omc-slim — seed-watch-paths harness
 *
 * Every project here is a temp directory; the marker is a `.git` directory
 * unless the case is about markers, because `.git` is the one marker that is
 * not itself named as a root. The home gate is exercised by pointing HOME at a
 * temp project, so the real home is only ever read, never written.
 *
 * Run: node hooks/seed-watch-paths.test.mjs
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, parse } from "node:path";
import { fileURLToPath } from "node:url";

const HOOK =
  process.env.OMC_SLIM_HOOK_PATH ??
  join(dirname(fileURLToPath(import.meta.url)), "seed-watch-paths.mjs");

const ALLOWED = new Set(["suppressOutput", "hookSpecificOutput"]);
const MAX_ROOTS = 48;
const MARKERS = [
  ".git",
  ".hg",
  "package.json",
  "tsconfig.json",
  "pyproject.toml",
  "setup.py",
  "setup.cfg",
  "requirements.txt",
  "Pipfile",
  "Cargo.toml",
  "go.mod",
  "Gemfile",
  "pom.xml",
  "build.gradle",
  "build.gradle.kts",
  "composer.json",
  "mix.exs",
  "Makefile",
  "CMakeLists.txt",
  "Package.swift",
  "pubspec.yaml",
  "deno.json",
];

/** `spawnCwd` is the hook process's working directory, for the relative-cwd case. */
function runHook(cwd, { payload = {}, env = {}, spawnCwd } = {}) {
  const res = spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify({ cwd, hook_event_name: "SessionStart", ...payload }),
    encoding: "utf8",
    timeout: 5_000,
    env: { ...process.env, OMC_SLIM_DEBUG: "", ...env },
    ...(spawnCwd ? { cwd: spawnCwd } : {}),
  });
  if (res.error) throw res.error;
  return { status: res.status, stdout: res.stdout || "", stderr: res.stderr || "" };
}

function inRoot(fn) {
  const root = mkdtempSync(join(tmpdir(), "omc-watch-"));
  try {
    return fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function markProject(root) {
  mkdirSync(join(root, ".git"));
}

function mkdirs(root, ...rels) {
  for (const rel of rels) mkdirSync(join(root, ...rel.split("/")), { recursive: true });
}

function parseOut(stdout) {
  try {
    return JSON.parse(stdout);
  } catch {
    return null;
  }
}

function contract(res) {
  if (res.status !== 0) return `expected exit 0, got ${res.status}`;
  if (res.stderr !== "") return `stderr: ${res.stderr}`;
  const out = parseOut(res.stdout);
  if (!out) return `expected JSON, got ${res.stdout}`;
  if (out.suppressOutput !== true) return "expected suppressOutput true";
  const forbidden = Object.keys(out).filter((k) => !ALLOWED.has(k));
  if (forbidden.length) return `forbidden fields: ${forbidden.join(", ")}`;
  if (out.systemMessage) return "must not emit systemMessage";
  const spec = out.hookSpecificOutput;
  if (spec && spec.additionalContext)
    return "must not emit additionalContext (prefix tax)";
  return null;
}

function expectPaths(res, predicate) {
  const v = contract(res);
  if (v) return v;
  const spec = parseOut(res.stdout).hookSpecificOutput;
  if (!spec || spec.hookEventName !== "SessionStart")
    return `expected SessionStart watchPaths, got ${res.stdout}`;
  if (!Array.isArray(spec.watchPaths)) return "watchPaths missing";
  return predicate(spec.watchPaths);
}

function expectNoPaths(res, why) {
  const v = contract(res);
  if (v) return v;
  if (parseOut(res.stdout).hookSpecificOutput) return `${why}: ${res.stdout}`;
  return null;
}

/** The named roots, order-insensitive, and nothing else. */
function expectExactly(res, expected) {
  return expectPaths(res, (paths) => {
    const got = [...paths].sort().join("\n");
    const want = [...expected].sort().join("\n");
    if (got !== want) return `expected exactly\n${want}\ngot\n${got}`;
    return null;
  });
}

const cases = [
  {
    name: "src is watched in a project, node_modules is not",
    run: () =>
      inRoot((root) => {
        markProject(root);
        mkdirs(root, "src", "node_modules");
        return { res: runHook(root), root };
      }),
    check: ({ res, root }) => expectExactly(res, [join(root, "src")]),
  },
  {
    name: "the home directory names nothing",
    run: () => runHook(homedir()),
    check: (res) => expectNoPaths(res, "a shell opened in ~ must seed no watch"),
  },
  {
    // The gate, not the marker check, has to be what refuses ~: a home that
    // versions its dotfiles holds a .git.
    name: "a home directory that is itself a project still names nothing",
    run: () =>
      inRoot((root) => {
        markProject(root);
        mkdirs(root, "src");
        return runHook(root, { env: { HOME: root, USERPROFILE: root } });
      }),
    check: (res) => expectNoPaths(res, "the home gate must refuse a home that holds a project"),
  },
  {
    name: "the filesystem root names nothing",
    run: () => runHook(parse(tmpdir()).root),
    check: (res) => expectNoPaths(res, "a shell opened at / must seed no watch"),
  },
  {
    name: "a directory without a project marker names nothing",
    run: () =>
      inRoot((root) => {
        mkdirs(root, "src");
        return runHook(root);
      }),
    check: (res) => expectNoPaths(res, "a directory with no project marker must seed no watch"),
  },
  {
    // Each marker as a regular file, .git included: a worktree's .git is a file.
    name: "every project marker admits the project",
    run: () =>
      MARKERS.map((marker) =>
        inRoot((root) => {
          writeFileSync(join(root, marker), "");
          mkdirs(root, "src");
          return { marker, res: runHook(root), src: join(root, "src") };
        }),
      ),
    check: (runs) => {
      const refused = [];
      for (const { marker, res, src } of runs) {
        const v = expectPaths(res, (paths) => (paths.includes(src) ? null : `no src for ${marker}`));
        if (v) refused.push(`${marker}: ${v}`);
      }
      return refused.length ? refused.join("; ") : null;
    },
  },
  {
    name: "a workspace names each package's source directories, not the workspace or its node_modules",
    run: () =>
      inRoot((root) => {
        markProject(root);
        mkdirs(root, "packages/foo/src", "packages/foo/node_modules", "packages/foo/build", "packages/bar");
        writeFileSync(join(root, "packages", "foo", "package.json"), "{}");
        writeFileSync(join(root, "packages", "bar", "index.js"), "");
        return { res: runHook(root), root };
      }),
    check: ({ res, root }) => expectExactly(res, [join(root, "packages", "foo", "src")]),
  },
  {
    name: "a workspace directory without package children is a plain root",
    run: () =>
      inRoot((root) => {
        markProject(root);
        mkdirs(root, "packages/docs/guide");
        return { res: runHook(root), root };
      }),
    check: ({ res, root }) => expectExactly(res, [join(root, "packages")]),
  },
  {
    name: "only workspace names are descended",
    run: () =>
      inRoot((root) => {
        markProject(root);
        mkdirs(root, "src/foo/lib");
        writeFileSync(join(root, "src", "foo", "package.json"), "{}");
        return { res: runHook(root), root };
      }),
    check: ({ res, root }) => expectExactly(res, [join(root, "src")]),
  },
  {
    // `frontend/` holds a package.json, a src and a node_modules. Named whole,
    // its node_modules is walked; descended like a workspace child, only src is.
    name: "a first-level directory that is itself a package is descended",
    run: () =>
      inRoot((root) => {
        markProject(root);
        mkdirs(root, "frontend/src", "frontend/node_modules");
        writeFileSync(join(root, "frontend", "package.json"), "{}");
        return { res: runHook(root), root };
      }),
    check: ({ res, root }) => expectExactly(res, [join(root, "frontend", "src")]),
  },
  {
    name: "requirements.txt admits a project of one script",
    run: () =>
      inRoot((root) => {
        writeFileSync(join(root, "requirements.txt"), "");
        writeFileSync(join(root, "main.py"), "");
        return { res: runHook(root), main: join(root, "main.py") };
      }),
    check: ({ res, main }) =>
      expectPaths(res, (paths) => (paths.includes(main) ? null : `main.py not watched: ${paths.join(", ")}`)),
  },
  {
    name: "60 first-level directories are capped at 48 roots",
    run: () =>
      inRoot((root) => {
        markProject(root);
        for (let i = 0; i < 60; i++) mkdirSync(join(root, `d${String(i).padStart(2, "0")}`));
        return runHook(root);
      }),
    check: (res) =>
      expectPaths(res, (paths) =>
        paths.length === MAX_ROOTS ? null : `expected ${MAX_ROOTS} roots, got ${paths.length}`,
      ),
  },
  {
    name: "files count toward the cap, after directories",
    run: () =>
      inRoot((root) => {
        markProject(root);
        const dirs = [];
        for (let i = 0; i < 40; i++) {
          const dir = join(root, `d${String(i).padStart(2, "0")}`);
          mkdirSync(dir);
          dirs.push(dir);
        }
        for (let i = 0; i < 20; i++) writeFileSync(join(root, `f${String(i).padStart(2, "0")}.txt`), "");
        return { res: runHook(root), dirs };
      }),
    check: ({ res, dirs }) =>
      expectPaths(res, (paths) => {
        if (paths.length !== MAX_ROOTS) return `expected ${MAX_ROOTS} roots, got ${paths.length}`;
        const missing = dirs.filter((dir) => !paths.includes(dir));
        if (missing.length) return `directories lost to files under the cap: ${missing.join(", ")}`;
        return null;
      }),
  },
  {
    // Alphabetically `src` sorts after fifty `mod*` directories and is the one
    // the cap drops. The source tree goes first.
    name: "src survives the cap ahead of fifty generated modules",
    run: () =>
      inRoot((root) => {
        markProject(root);
        for (let i = 1; i <= 50; i++) mkdirSync(join(root, `mod${String(i).padStart(2, "0")}`));
        mkdirSync(join(root, "src"));
        return { res: runHook(root), src: join(root, "src") };
      }),
    check: ({ res, src }) =>
      expectPaths(res, (paths) => {
        if (paths.length !== MAX_ROOTS) return `expected ${MAX_ROOTS} roots, got ${paths.length}`;
        if (!paths.includes(src)) return "src was dropped for generated modules";
        return null;
      }),
  },
  {
    name: "root-level regular files are watched; dotfiles and symlinked files are not",
    run: () =>
      inRoot((root) => {
        writeFileSync(join(root, "Makefile"), "");
        writeFileSync(join(root, "main.py"), "");
        writeFileSync(join(root, ".env"), "");
        symlinkSync(join(root, "main.py"), join(root, "link.py"));
        return { res: runHook(root), root };
      }),
    check: ({ res, root }) => expectExactly(res, [join(root, "Makefile"), join(root, "main.py")]),
  },
  {
    // A lockfile rewrites on every install, a database on every request, a log
    // on every line: each a FileChanged, and a hook process, for a file nobody
    // edits.
    name: "lockfiles, databases, logs and pid files at the root are not watched",
    run: () =>
      inRoot((root) => {
        markProject(root);
        const noise = [
          "package-lock.json", "yarn.lock", "pnpm-lock.yaml", "dev.sqlite3", "app.db",
          "npm-debug.log", "server.pid", "bun.lockb", "cache.sqlite-wal",
        ];
        for (const name of [...noise, "main.py"]) writeFileSync(join(root, name), "");
        return { res: runHook(root), root };
      }),
    check: ({ res, root }) => expectExactly(res, [join(root, "main.py")]),
  },
  {
    // A linked `data -> /huge/tree` would make chokidar walk that tree.
    name: "a symlinked directory is not watched",
    run: () =>
      inRoot((root) => {
        const outside = mkdtempSync(join(tmpdir(), "omc-outside-"));
        try {
          markProject(root);
          mkdirs(root, "src");
          symlinkSync(outside, join(root, "data"), "dir");
          return { res: runHook(root), root };
        } finally {
          rmSync(outside, { recursive: true, force: true });
        }
      }),
    check: ({ res, root }) => expectExactly(res, [join(root, "src")]),
  },
  {
    // Output at the first level; the ledger still records a src/build/ edit.
    name: "first-level output directories are not watched",
    run: () =>
      inRoot((root) => {
        markProject(root);
        mkdirs(root, "src", "build", "out", "obj", "tmp", "logs", "env");
        return { res: runHook(root), root };
      }),
    check: ({ res, root }) => expectExactly(res, [join(root, "src")]),
  },
  {
    name: "never-source directories are not watched",
    run: () =>
      inRoot((root) => {
        markProject(root);
        mkdirs(root, "src", "venv", "Pods", "dist", "coverage", "target", "vendor");
        return { res: runHook(root), root };
      }),
    check: ({ res, root }) => expectExactly(res, [join(root, "src")]),
  },
  {
    // Rails and Ruby gems keep editable scripts in bin/.
    name: "a first-level bin is watched",
    run: () =>
      inRoot((root) => {
        markProject(root);
        mkdirs(root, "bin", "src");
        return { res: runHook(root), root };
      }),
    check: ({ res, root }) => expectExactly(res, [join(root, "bin"), join(root, "src")]),
  },
  {
    name: "dot-directories are skipped",
    run: () =>
      inRoot((root) => {
        markProject(root);
        mkdirs(root, ".github", "src");
        return { res: runHook(root), root };
      }),
    check: ({ res, root }) => expectExactly(res, [join(root, "src")]),
  },
  {
    name: "a project with only skipped directories names nothing",
    run: () =>
      inRoot((root) => {
        markProject(root);
        mkdirs(root, "node_modules");
        return runHook(root);
      }),
    check: (res) => expectNoPaths(res, "expected no watchPaths when only skip-list dirs exist"),
  },
  {
    name: "a cwd that is a regular file names nothing",
    run: () =>
      inRoot((root) => {
        const file = join(root, "notes.txt");
        writeFileSync(file, "x");
        return runHook(file);
      }),
    check: (res) => expectNoPaths(res, "expected no watchPaths for a file cwd"),
  },
  {
    // Run from a project that does hold `src`, so a hook that resolved the
    // relative cwd against its own would name it.
    name: "a relative cwd names nothing",
    run: () =>
      inRoot((root) => {
        markProject(root);
        mkdirs(root, "src");
        return runHook(".", { spawnCwd: root });
      }),
    check: (res) => expectNoPaths(res, "expected no watchPaths for a relative cwd"),
  },
  {
    name: "malformed stdin stays silent and exits 0",
    run: () => {
      const res = spawnSync(process.execPath, [HOOK], {
        input: "{ not json",
        encoding: "utf8",
        timeout: 5_000,
      });
      return { status: res.status, stdout: res.stdout || "", stderr: res.stderr || "" };
    },
    check: (res) => contract(res),
  },
  {
    name: "missing cwd names nothing",
    run: () => runHook(undefined, { payload: { cwd: undefined } }),
    check: (res) => expectNoPaths(res, "expected no watchPaths without cwd"),
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
