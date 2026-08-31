#!/usr/bin/env node
/**
 * omc-slim — FileChanged ledger.
 *
 * Records one JSON line per delivered FileChanged event (an Edit, an Auto-mode
 * Bash write, an editor outside Claude) so hooks/verify-deliverables.mjs can
 * tell "wrote nothing" from "wrote through a path the transcript does not
 * show". Emits nothing the model can see.
 *
 * Where: `<claudeHome>/omc-slim/ledgers/<key>.jsonl`, with
 * `claudeHome = CLAUDE_CONFIG_DIR || ~/.claude` and
 * `key = sha256(realpath(cwd)).slice(0, 16)`, falling back to `resolve(cwd)`
 * when realpath fails. The ledger lives in the user's own config directory,
 * never in the project: nothing to gitignore, no committed symlink to write
 * through, and the review skill never lists it as untracked. The reader derives
 * the same path from the same inputs; keep the two in step.
 *
 * Row: {"t", "session_id", "path", "event"}. `path` is absolute, `event` is
 * "change" | "add" | "unlink". `t` is the file's mtimeMs for change and add:
 * chokidar's awaitWriteFinish delivers 0.5-0.7 s after the write, and the
 * reader compares `t` against the moment a subagent's transcript began, so a
 * delivery time would date a write into the wrong turn. Unlink, and a stat that
 * fails, take Date.now(). A payload without session_id writes no row: the
 * reader scopes rows to the session, and a row without one can vouch for
 * nothing.
 *
 * SKIP here is the never-source set, matched on every component of the path
 * below cwd: a `node_modules` anywhere is install noise wherever it sits.
 * hooks/seed-watch-paths.mjs skips a wider set (`build`, `out`, `tmp`, ...) but
 * only at the first level, because a `src/build/` module is source while a
 * top-level `build/` is output. That hook chooses watch roots and can afford
 * the wider net; this one decides per event and cannot. A path with a `.claude`
 * component is Claude Code's own settings write, not a project edit. The two
 * sets are spelled out in both files because the mutation runner copies one
 * hook into a temp dir where a shared module would not resolve.
 *
 * Fails open. Set OMC_SLIM_DEBUG=1 to trace on stderr.
 */

import { createHash } from "node:crypto";
import {
  appendFileSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";

const KEEP_ROWS = 500;
const TRIM_ABOVE_ROWS = 1000;
const MAX_BYTES = 1024 * 1024;

const SKIP = new Set([
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

function claudeHome() {
  return process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude");
}

function realpathOrResolve(path) {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}

function ledgerPath(cwd) {
  const key = createHash("sha256").update(realpathOrResolve(cwd)).digest("hex").slice(0, 16);
  return join(claudeHome(), "omc-slim", "ledgers", `${key}.jsonl`);
}

/**
 * Matched below cwd, not on cwd's own path: a project at /tmp/proj or under
 * ~/.claude/plugins must still be ledgered.
 */
function ignored(path, cwd) {
  const parts = relative(cwd, path).split(/[/\\]/);
  if (parts.includes(".claude")) return true;
  return parts.some((part) => SKIP.has(part));
}

/** A missing ledger will be created; anything but a small regular file is refused. */
function writableLedger(dest) {
  let st;
  try {
    st = lstatSync(dest);
  } catch (err) {
    return err.code === "ENOENT";
  }
  return st.isFile() && st.size <= MAX_BYTES;
}

function timestamp(path, event) {
  if (event === "unlink") return Date.now();
  try {
    return statSync(path).mtimeMs;
  } catch {
    return Date.now();
  }
}

function row(sessionId, path, event) {
  return JSON.stringify({ t: timestamp(path, event), session_id: sessionId, path, event }) + "\n";
}

/**
 * Rewrites only once the ledger is twice the size it is kept at, so appends
 * outnumber rewrites 500 to 1, and rewrites through a rename so a reader never
 * sees a half-written file. Two hooks trimming in the same instant share the
 * tmp path; the loser's rows are the ones that survive, and the reader
 * tolerates a torn line.
 */
function trim(dest) {
  const lines = readFileSync(dest, "utf8").split("\n").filter((line) => line.trim() !== "");
  if (lines.length <= TRIM_ABOVE_ROWS) return;
  const tmp = `${dest}.tmp`;
  writeFileSync(tmp, lines.slice(-KEEP_ROWS).join("\n") + "\n");
  renameSync(tmp, dest);
}

function emit() {
  process.stdout.write(JSON.stringify({ suppressOutput: true }));
  process.exit(0);
}

function main() {
  const input = stdin();
  if (!input.trim()) return emit();
  let data;
  try {
    data = JSON.parse(input);
  } catch {
    return emit();
  }
  const { cwd, file_path: filePath, session_id: sessionId } = data;
  if (typeof cwd !== "string" || cwd.trim() === "") return emit();
  if (typeof filePath !== "string" || filePath.trim() === "") return emit();
  if (typeof sessionId !== "string" || sessionId === "") return emit();
  const path = resolve(cwd, filePath);
  if (ignored(path, cwd)) {
    debug("skip", path);
    return emit();
  }
  const dest = ledgerPath(cwd);
  if (!writableLedger(dest)) {
    debug("ledger is not a small regular file; not writing", dest);
    return emit();
  }
  mkdirSync(dirname(dest), { recursive: true });
  appendFileSync(dest, row(sessionId, path, data.event ?? "change"));
  trim(dest);
  debug("appended", path);
  return emit();
}

try {
  main();
} catch {
  emit();
}
