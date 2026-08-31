#!/usr/bin/env node
/**
 * omc-slim — SessionStart watchPaths seed.
 *
 * FileChanged does not start until something names a path, and every event it
 * then delivers spawns one hook process, so what this hook names is what the
 * session pays for. Chokidar walks and watches each named root recursively,
 * with no ignore list and no depth limit.
 *
 * Gate: nothing is named unless cwd is a project. cwd must be absolute, must
 * not be the home directory or a filesystem root, and must hold one of the
 * MARKERS (`.git`, `.hg`, `package.json`, `tsconfig.json`, `requirements.txt`,
 * `Pipfile`, `Cargo.toml`, `Makefile`, ...). A shell opened in `~` would
 * otherwise watch Library, Documents and Downloads.
 *
 * Roots: the first-level real directories of cwd, minus dot-directories, minus
 * SKIP, minus symlinks (a linked `data -> /huge/tree` would be walked), plus
 * the first-level regular files (not dotfiles, not symlinks) so a project of
 * `main.py` and `Makefile` is watched. A file named like a lockfile, database,
 * log or pid file (`*.lock`, `*-lock.*`, `*.log`, `*.sqlite`, `*.sqlite3`,
 * `*.db`, `*.pid`) is not source and is not named. Never cwd itself: that would
 * take in node_modules and .git.
 *
 * Workspaces: a first-level `packages`, `apps`, `libs`, `services`, `crates`,
 * `modules` or `examples` whose children carry `package.json`,
 * `pyproject.toml` or `Cargo.toml` is not named itself. Each child's non-dot,
 * non-SKIP real subdirectories are named instead, so `packages/foo/src` is a
 * root and `packages/foo/node_modules` is its sibling, not its descendant. A
 * child with no such subdirectory contributes nothing, and a child's own
 * root-level files are not watched. A first-level directory that is itself a
 * package — `frontend/` holding a `package.json` — is descended the same way,
 * so `frontend/src` is a root and `frontend/node_modules` is under none.
 *
 * Cap: 48 roots. `src`, `lib`, `app`, `source`, `tests`, `test`, `spec`,
 * `packages` and `apps` come first, then the other directories alphabetically,
 * then files, so fifty generated `mod*` directories cannot push the source tree
 * out. Past the cap the rest are dropped silently, which a monorepo of more
 * than 24 two-directory packages will hit.
 *
 * SKIP here is the wider set: the never-source directories hooks/file-ledger.mjs
 * refuses at any depth (node_modules, .git, dist, ...) plus `build`, `out`,
 * `obj`, `tmp`, `logs` and `env`, which are output at a project's first level
 * but source deeper down (`src/build/`). The ledger decides per event and
 * cannot drop those; this hook chooses roots and can. Spelled out in both files
 * because the mutation runner copies one hook into a temp dir where a shared
 * module would not resolve.
 *
 * Emits nothing the model can see: no additionalContext, no systemMessage.
 * Fails open. Set OMC_SLIM_DEBUG=1 to trace on stderr.
 */

import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, parse, resolve } from "node:path";

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

const WORKSPACE_DIRS = new Set(["packages", "apps", "libs", "services", "crates", "modules", "examples"]);
const WORKSPACE_MARKERS = ["package.json", "pyproject.toml", "Cargo.toml"];

/** Named ahead of the other directories, so the cap never drops the source tree for a run of generated ones. */
const FIRST_ROOTS = ["src", "lib", "app", "source", "tests", "test", "spec", "packages", "apps"];

/** Root-level files that are never source: lockfiles, databases, logs, pid files. */
const NOISE_FILE = /\.(lockb?|log|sqlite3?(-wal|-shm)?|db(-journal)?|pid)$|-lock\./i;

const SKIP = new Set([
  // Never source at any depth; hooks/file-ledger.mjs carries these thirteen too.
  "node_modules",
  ".git",
  "__pycache__",
  ".venv",
  "venv",
  ".tox",
  "Pods",
  "DerivedData",
  "coverage",
  ".next",
  "dist",
  "target",
  "vendor",
  // Output at a project's first level, source deeper down.
  "build",
  "out",
  "obj",
  "tmp",
  "logs",
  "env",
]);

function debug(...args) {
  if (process.env.OMC_SLIM_DEBUG === "1") console.error("[omc-slim]", ...args);
}

function stdin() {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function realpathOrResolve(path) {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}

function isProject(cwd) {
  const dir = realpathOrResolve(cwd);
  if (dir === realpathOrResolve(homedir())) return false;
  if (parse(dir).root === dir) return false;
  return MARKERS.some((marker) => existsSync(join(dir, marker)));
}

/** The named entries of `dir` with their lstat, minus dotnames and SKIP, sorted. */
function entries(dir) {
  let names;
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  const found = [];
  for (const name of names.sort()) {
    if (name.startsWith(".") || SKIP.has(name)) continue;
    const path = join(dir, name);
    try {
      found.push({ name, path, stat: lstatSync(path) });
    } catch {}
  }
  return found;
}

/** lstat, so a symlinked directory is refused whatever it points at. */
function realDirs(dir) {
  return entries(dir)
    .filter((entry) => entry.stat.isDirectory())
    .map((entry) => entry.path);
}

/** A regular file that is not a lockfile, database, log or pid file. */
function isSourceFile(entry) {
  return entry.stat.isFile() && !NOISE_FILE.test(entry.name);
}

/** Does `dir` carry a package marker of its own? */
function isPackage(dir) {
  return WORKSPACE_MARKERS.some((marker) => existsSync(join(dir, marker)));
}

function rootsUnder(entry) {
  if (isPackage(entry.path)) return realDirs(entry.path);
  if (!WORKSPACE_DIRS.has(entry.name)) return [entry.path];
  const children = realDirs(entry.path);
  const isWorkspace = children.some(isPackage);
  if (!isWorkspace) return [entry.path];
  return children.flatMap((child) => realDirs(child));
}

/** FIRST_ROOTS in their listed order, then everything else; sort() is stable, so the rest keep readdir's alphabetical order. */
function byPriority(a, b) {
  return rank(a.name) - rank(b.name);
}

function rank(name) {
  const at = FIRST_ROOTS.indexOf(name);
  return at === -1 ? FIRST_ROOTS.length : at;
}

function watchPathsFor(cwd) {
  if (typeof cwd !== "string" || !isAbsolute(cwd)) return [];
  if (!isProject(cwd)) return [];
  const found = entries(cwd);
  const dirs = found
    .filter((entry) => entry.stat.isDirectory())
    .sort(byPriority)
    .flatMap((entry) => rootsUnder(entry));
  const files = found.filter(isSourceFile).map((entry) => entry.path);
  return [...dirs, ...files].slice(0, MAX_ROOTS);
}

function emit(watchPaths) {
  const out = { suppressOutput: true };
  if (watchPaths.length > 0) {
    out.hookSpecificOutput = {
      hookEventName: "SessionStart",
      watchPaths,
    };
  }
  process.stdout.write(JSON.stringify(out));
  process.exit(0);
}

function main() {
  const input = stdin();
  if (!input.trim()) return emit([]);
  let data;
  try {
    data = JSON.parse(input);
  } catch {
    return emit([]);
  }
  const paths = watchPathsFor(data.cwd);
  debug("watchPaths", paths);
  return emit(paths);
}

try {
  main();
} catch {
  emit([]);
}
