#!/usr/bin/env node
/**
 * omc-slim — Stop / SubagentStop deliverable check.
 *
 * A subagent can report success having written nothing. This checks that a
 * write-capable specialist actually touched a file IN THE PROJECT, and tells the
 * *user* when it did not.
 *
 * "In the project" is the second half, and it is why the check is not a boolean:
 * a successful Write to /tmp/notes.md and work done through sanctioned shell
 * edits are two different states, and they get two different messages. Neither
 * one accuses.
 *
 * A third state is not about writing at all: the agent asserted a verification
 * result, and nothing in its transcript ran a check. Measured rather than
 * theorised — a benchmark of 45 Python bug-fix tasks had the agent report 45/45
 * complete; against held-out tests 26 passed, 19 false positives, and the same
 * 19 failed identically on two different vendors' models, so it is the agent
 * loop's shape rather than a model defect. The transcript reads "[Round 3] 5/5
 * tests pass. Build successful! All verified." against a suite of eight. A
 * prompt rule cannot tell whether a check ran at all; this can, because it
 * holds the transcript.
 *
 * Every Bash command in the turn gets one of three verdicts. "check": argv0
 * names a test, build, lint or typecheck runner, or a script whose name says it
 * is one. "non-check": argv0 is a binary that cannot run one — git, echo, cat,
 * ls. "unknown": anything else — a project script, a runner these tables do not
 * name, a make target or toolchain subcommand they do not list, a command that
 * will not parse. A comment and a heredoc body are data and carry no verdict. A
 * check counts only when its tool_result came back clean; a runner that errored
 * proved nothing. An error on a line of several commands is charged to none of
 * them, because one exit status cannot say which one failed, and that line is
 * unknown. The claim advisory fires only when every command in the turn was a
 * non-check. One unknown command mutes it, because the parse cannot say what
 * that command ran, and silence is the only reading of "cannot tell" that does
 * not accuse.
 *
 * Deliberately advisory: it never blocks the subagent from stopping, and on
 * Stop it never returns `decision: "block"` (oh-my-claudecode #959 / #2542).
 *
 * On SubagentStop it emits `systemMessage` (surfaced to the user) and never
 * `hookSpecificOutput.additionalContext`. additionalContext is injected back
 * into the subagent that is already finishing — the regression oh-my-claudecode
 * hit in its #3209 / #3233.
 *
 * On Stop it emits `systemMessage` only, and never
 * `hookSpecificOutput.additionalContext`: on Stop that field continues the turn
 * under the same loop protections as `decision: "block"` (verified 2.1.251;
 * hooks docs "Stop decision control"), and a continue is refused. Only the
 * claim state is in scope there, because write advisories would fire on every
 * chatty turn, and `stop_hook_active` stays silent so nothing stacks on a
 * continue some other hook caused.
 *
 * On Stop the transcript is the whole session and only its last turn is
 * evidence, so only the tail is read: backwards in 1 MiB chunks to the last
 * human user line, then forward from there. Measured on a 42 MB, 18,500-line
 * session, five runs each: the whole-file read took 0.29-0.35 s of wall and
 * 263 MB of peak RSS; the tail read takes 0.04 s and 59 MB.
 *
 * Fails open in every error path: a broken guard must never break a session.
 *
 * Set OMC_SLIM_DEBUG=1 to trace on stderr. A hook that exits 0 never shows its
 * stderr to the user, so this costs nothing when unset and nothing when set.
 */

import {
  closeSync,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  readSync,
  realpathSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { basename, dirname, join, resolve, sep } from "node:path";

/** Specialists expected to produce file changes. Read-only agents are exempt. */
const WRITE_AGENTS = new Set(["fixer", "designer"]);

/**
 * The namespace this plugin's agents carry.
 *
 * `agent_type` for a plugin agent is `<plugin name>:<agent>` — `omc-slim:fixer`
 * — in a marketplace install and in a `--plugin-dir` session alike. The matcher
 * in hooks.json pins the same namespace, and the two have to stay in step:
 * hooks.json decides what runs, ownAgentName decides what warns. A bare name or
 * a foreign namespace is another plugin's agent, or nobody's, and is not ours
 * to police.
 */
const SELF_NAMESPACE = "omc-slim:";

/**
 * Cap on the bytes read from a transcript: the whole file on SubagentStop, the
 * tail behind the last human user line on Stop. It bounds the string
 * allocation, not scan time, which has its own budget below; the agents doing
 * the most work write the largest transcripts, so a low cap skips the check
 * where it matters.
 */
const MAX_TRANSCRIPT_BYTES = 64 * 1024 * 1024;

/** Stop reads the transcript backwards in chunks of this size. */
const TAIL_CHUNK_BYTES = 1024 * 1024;

/**
 * One line running past this many tail chunks is not a human turn the read
 * could start from — a tool result, or a file that is not a transcript — and
 * joining it would cost its length squared. The read gives up on it instead,
 * which is "cannot tell".
 */
const MAX_LINE_CHUNKS = 8;

const NEWLINE = 0x0a;

/**
 * Wall-clock budget for the transcript scan, well inside the 5 s declared in
 * hooks.json.
 *
 * The declared timeout is not a guarantee — a hook blocked on I/O can outlive
 * it — so an in-process bound lives here.
 *
 * What this covers: the per-line parse of a transcript that is under the byte
 * cap but pathological to scan. Over budget, the scan returns null — "cannot
 * tell" — never false, because false is an accusation.
 *
 * What it cannot cover, stated plainly: a blocking read on fd 0. Node's timers
 * cannot preempt synchronous I/O, so no in-process watchdog fires while
 * readFileSync(0) waits on a pipe the parent never closed (#78756). The byte cap
 * and the isFile() check bound the transcript read; nothing here bounds stdin.
 *
 * OMC_SLIM_SCAN_BUDGET_MS overrides it.
 */
const SCAN_BUDGET_MS = (() => {
  const raw = process.env.OMC_SLIM_SCAN_BUDGET_MS;
  // Blank counts as unset, and that is the whole reason this is not a one-liner:
  // `Number("")` is 0, not NaN, so an exported-but-empty variable would set the
  // budget to zero, expire the deadline on line one of every transcript and mute
  // the hook permanently — a guard that stops guarding without saying so.
  if (raw === undefined || raw.trim() === "") return 2000;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : 2000;
})();

/** Tools whose successful use counts as having produced a deliverable. */
const WRITE_TOOLS = new Set(["Edit", "Write", "NotebookEdit", "MultiEdit"]);

/**
 * Tools that hand work to another agent. A successful dispatch means a check may
 * have run in a transcript this one cannot see, so the claim state abstains.
 */
const DISPATCH_TOOLS = new Set(["Task", "Agent"]);

/**
 * An MCP tool, like Bash, can write a file without leaving a write-tool block.
 * Only an agent that used one of the two can have made a write the FileChanged
 * ledger shows and the transcript does not.
 */
const OPAQUE_TOOL_PREFIX = "mcp__";

/**
 * A segment with more tokens than this is not parsed. No runner takes that
 * many, and a generated command line is not evidence the parse can weigh.
 */
const MAX_SEGMENT_TOKENS = 64;

/** The FileChanged ledger's writer never produces a file this large. */
const MAX_LEDGER_BYTES = 1024 * 1024;

/**
 * A ledger row's `t` is the changed file's mtime, and some filesystems keep
 * mtime to the second (HFS+, ext3) or to two (FAT). A row that close before the
 * transcript's first line is not from before the agent existed.
 */
const MTIME_TOLERANCE_MS = 2000;

/**
 * Binaries that ARE a check runner when they are argv0, by bare basename: a
 * trailing .exe, .cmd or .bat comes off before the lookup.
 *
 * Matched on argv0, never as a substring of the whole command line: `git log
 * --oneline latest` contains "test" and is not a check.
 */
const CHECK_BINARIES = new Set([
  "pytest",
  "jest",
  "mocha",
  "vitest",
  "tsc",
  "mypy",
  "eslint",
  "phpunit",
  "rspec",
  "ctest",
  "tox",
  "nox",
  "pre-commit",
  "pyright",
  "flake8",
  "pylint",
]);

/**
 * Binaries that cannot run a check. An argv0 that is in no table at all is
 * "unknown", not "non-check", so this list is what lets the claim advisory fire
 * on a turn that only looked around.
 */
const NON_CHECK_BINARIES = new Set([
  "git", "echo", "printf", "cat", "ls", "grep", "rg", "sed", "awk", "cd", "rm",
  "mkdir", "rmdir", "cp", "mv", "find", "curl", "wget", "head", "tail", "wc",
  "sort", "uniq", "cut", "tr", "true", "false", "pwd", "which", "type", "export",
  "touch", "chmod", "chown", "ln", "date", "sleep", "diff", "tee", "jq", "yq",
  "open", "code", "less", "more", "pushd", "popd", "basename", "dirname",
  "readlink", "realpath", "stat", "du", "df", "ps", "kill",
]);

/** Package managers: a check when a subcommand, a script or a package binary names one. */
const PACKAGE_MANAGERS = new Set(["npm", "npx", "bunx", "yarn", "pnpm", "bun", "deno"]);

/** Of those, the ones that take a project script or an arbitrary binary as a bare first word. */
const BARE_SCRIPT_MANAGERS = new Set(["npx", "bunx", "yarn", "pnpm", "bun"]);

/** The token after one of these names a project script (`npm run test-unit`) or a binary (`pnpm exec jest`). */
const SCRIPT_RUN_WORDS = new Set(["run", "exec", "dlx", "x", "task"]);

/** Subcommands that name a check, wherever they appear in argv. */
const CHECK_WORDS = new Set([
  "test",
  "t",
  "lint",
  "build",
  "check",
  "typecheck",
  "type-check",
  "compile",
  "analyze",
  "analyse",
  "assemble",
]);

/** `npm ci` installs; a package script called `ci` runs the checks. */
const SCRIPT_WORDS = new Set([...CHECK_WORDS, "ci"]);

const COMPILER_WORDS = new Set([...CHECK_WORDS, "clippy", "nextest", "vet"]);

/** Maven lifecycle phases at or past the tests. */
const MAVEN_WORDS = new Set([...CHECK_WORDS, "verify", "package", "install"]);

/** `make` and `make all` build the default target; both are the build. */
const MAKE_WORDS = new Set([...COMPILER_WORDS, "all"]);

const MAKE_BINS = new Set(["make", "gmake", "mingw32-make"]);

/** make options that take a separate value, so `make -C sub` names no target. */
const MAKE_VALUED = new Set([
  "-C", "--directory", "-f", "--file", "--makefile", "-I", "--include-dir",
  "-j", "--jobs", "-l", "--load-average", "-o", "--old-file", "-W", "--what-if",
  "--new-file", "--assume-new",
]);

/**
 * Toolchain fronts and task runners, each with the subcommands that make it a
 * check. A subcommand in NON_CHECK_SUBCOMMANDS is a fixed one that is not
 * (`cargo fmt`, `gradle clean`, `ruff format`, `poetry install`) and reads as
 * non-check. Any other — `rake spec`, `nx affected`, `uv sync` — is a name only
 * the project can explain, and reads as unknown; bare, the tool runs a default
 * this cannot see.
 */
const SUBCOMMAND_RUNNERS = new Map([
  ["cargo", COMPILER_WORDS],
  ["go", COMPILER_WORDS],
  ["mvn", MAVEN_WORDS],
  ["mvnw", MAVEN_WORDS],
  ["dotnet", CHECK_WORDS],
  ["gradle", CHECK_WORDS],
  ["gradlew", CHECK_WORDS],
  ["ruff", CHECK_WORDS],
  ["just", CHECK_WORDS],
  ["nx", CHECK_WORDS],
  ["turbo", CHECK_WORDS],
  ["swift", CHECK_WORDS],
  ["zig", CHECK_WORDS],
  ["stack", CHECK_WORDS],
  ["mix", CHECK_WORDS],
  ["flutter", CHECK_WORDS],
  ["dart", CHECK_WORDS],
  ["rails", CHECK_WORDS],
  ["bazel", CHECK_WORDS],
  ["sbt", CHECK_WORDS],
  ["rake", CHECK_WORDS],
  ["uv", CHECK_WORDS],
  ["poetry", CHECK_WORDS],
  ["pipenv", CHECK_WORDS],
  ["pdm", CHECK_WORDS],
  ["hatch", CHECK_WORDS],
  ["mise", CHECK_WORDS],
  ["bundle", CHECK_WORDS],
]);

/**
 * Subcommands of a toolchain front, and make targets, that cannot be a check:
 * formatting, cleaning, installing, running the program itself.
 */
const NON_CHECK_SUBCOMMANDS = new Set([
  "fmt", "format", "clean", "install", "add", "remove", "run", "new", "init",
  "doc", "publish", "update", "login", "logout",
]);

/** `cargo fmt --check`, `ruff format --check .`, `dotnet format --verify-no-changes`: the flag makes any command a check. */
const CHECK_FLAGS = new Set(["--check", "--verify-no-changes"]);

const PYTHON_MODULES = new Set(["pytest", "unittest", "mypy", "ruff", "pyright"]);

/** `coverage run` options that take a separate value; `-m` is where the python invocation starts. */
const COVERAGE_VALUED = new Set(["--source", "--include", "--omit", "--context", "--data-file", "--rcfile"]);

const NODE_BINS = new Set(["node", "nodejs"]);

/** node options that take a separate value; `-e` and `-p` take code, which is not a script name. */
const NODE_VALUED = new Set([
  "-r", "--require", "--import", "--loader", "--experimental-loader",
  "--env-file", "-C", "--conditions", "--input-type", "-e", "--eval", "-p",
  "--print",
]);

const SHELLS = new Set(["sh", "bash", "zsh", "dash"]);

const SHELL_VALUED = new Set(["-o", "-O", "--rcfile", "--init-file"]);

/**
 * Reserved words that precede a command without being part of it: `if npm
 * test; then`, `{ npm test; }`, `! pytest`. Dropped before argv0 is read.
 */
const SHELL_KEYWORDS = new Set([
  "if", "then", "elif", "else", "fi", "do", "done", "while", "until", "!", "{",
  "}", "time", "esac",
]);

/** Characters that end a heredoc delimiter word. */
const HEREDOC_WORD_END = new Set([";", "|", "&", "<", ">", "(", ")", "\n"]);

/**
 * Wrappers that run whatever follows them, each with the options of its own
 * that take a separate value. Stripped before argv0 is read, repeatedly, so
 * `sudo env CI=1 timeout 60 pytest` is read as `pytest`.
 */
const WRAPPERS = new Map([
  ["timeout", new Set(["-s", "--signal", "-k", "--kill-after"])],
  ["time", new Set(["-o", "--output", "-f", "--format"])],
  ["env", new Set(["-u", "--unset", "-C", "--chdir", "-S", "--split-string"])],
  ["nice", new Set(["-n", "--adjustment"])],
  ["sudo", new Set(["-u", "-g"])],
  ["xargs", new Set(["-n", "-P", "-I", "-d", "-L", "-s", "-E", "-a"])],
  ["command", new Set()],
  ["exec", new Set(["-a"])],
]);

/** `<tool> run <name>` runs a project script by name, or the command that follows. */
const RUN_WRAPPERS = new Map([
  ["uv", "run"],
  ["poetry", "run"],
  ["pipenv", "run"],
  ["pdm", "run"],
  ["hatch", "run"],
  ["mise", "run"],
  ["bundle", "exec"],
]);

/** Run-wrapper options that take a separate value: `uv run --with rich pytest`. */
const RUN_WRAPPER_VALUED = new Set(["--extra", "--group", "--with", "--python", "-p"]);

/**
 * `docker exec|run … <container> <cmd>` and `docker compose exec|run … <service>
 * <cmd>` run the command after the container name.
 */
const DOCKER_BINS = new Set(["docker", "docker-compose"]);

const DOCKER_RUN_WORDS = new Set(["exec", "run"]);

/**
 * docker options that take NO value. Every other option without an `=` is read
 * as taking one, so an option this does not list swallows the container name
 * and the command is not found — which is "unknown", never a wrong verdict.
 */
const DOCKER_FLAGS = new Set([
  "--", "--rm", "-d", "--detach", "-i", "--interactive", "-t", "--tty", "-it",
  "-ti", "-dit", "-itd", "--privileged", "--init", "--read-only", "-P",
  "--publish-all", "--no-healthcheck", "--sig-proxy", "-T", "--no-tty",
  "--no-deps", "--build", "--service-ports", "--use-aliases", "--quiet-pull",
  "--remove-orphans", "-D", "--debug", "--compatibility", "--dry-run", "-q",
  "--quiet",
]);

/** A script file the agent ran directly: a path, or a name with a script extension. */
const SCRIPT_EXTENSION = /\.(sh|mjs|js|cjs|py|rb)$/i;

/** `run_tests.sh`, `check-coverage.sh`, `base.test.mjs`: a check word between separators. */
const CHECK_SCRIPT_NAME = /(^|[._-])(test|tests|spec|check|lint|verify)([._-]|$)/i;

/**
 * Assertions of a verification OUTCOME — not mentions of testing.
 *
 * "I should run the tests" and "the test file lives in src/" are not results,
 * and matching them would flag an agent for describing its own work. Each entry
 * is tested against one sentence at a time; see assertsVerification.
 */
const VERIFICATION_CLAIMS = [
  // "tests pass", "all tests passing", "the suite passes"
  /\b(tests?|suites?|specs?)\s+(all\s+)?(pass|passes|passed|passing)\b/,
  // "5/5 tests pass", "45/45 passed"
  /\b\d+\s*\/\s*\d+\s+(tests?\s+)?(pass|passes|passed|passing|green)\b/,
  // "45 of 45 passed"
  /\b\d+\s+of\s+\d+\s+(tests?\s+)?(pass|passes|passed|passing)\b/,
  // "12 passed", the runner's own summary line quoted back
  /\b\d+\s+passed\b/,
  // "passed in 3s"
  /\bpassed\s+in\s+[\d.]+\s*s\b/,
  // "build succeeded", "build successful"
  /\bbuild\s+(is\s+)?(succeeded|successful|success|passed|passes|clean|green)\b/,
  // "typecheck clean", "lint clean", "tsc passed"
  /\b(type-?checks?|typechecking|tsc|mypy|lint|linting|linter|eslint|ruff)\s+(is\s+|are\s+|came\s+back\s+)?(clean|passes|passed|green)\b/,
  // "all green"
  /\ball\s+green\b/,
];

/**
 * "verified" is audit prose as often as a test result — "grep-verified", "all
 * eleven verified" — so it asserts a check only in a sentence that names one.
 */
const VERIFIED = /\bverified\b/;
const VERIFIED_SUBJECT = /\b(tests?|suite|build|type-?check|lint|check)\b/;

/**
 * What disqualifies a sentence from being an assertion of success: a reported
 * failure, a negation, a hedge, an intention.
 *
 * "2 tests failed" and "not all tests pass" are the honest reporting this hook
 * exists to protect, and flagging them would punish the behaviour we want.
 */
const NOT_AN_ASSERTION =
  /\b(fail\w*|error\w*|broke\w*|missing|no|not|never|cannot|unable|unverified|unchecked|untested|skip\w*|should|would|need\w*|must|todo|pending|assume\w*|unless|if|expect\w*|hope\w*|believe\w*|once|before|badge)\b|n't\b/;

/**
 * Idioms that put a hedge word inside an assertion of success: "no failures",
 * "0 failed", "error-free", "as expected", "nothing broken". The hedge test
 * would read the sentence as honest reporting. Removed before that test, so the
 * assertion they belong to is judged alone.
 */
const HEDGE_WORD_IDIOMS = [
  /\b(no|0|zero|without)\s+(fail\w*|error\w*|regression\w*|warning\w*|issue\w*)\b/g,
  /\bnothing\s+(is\s+)?broken\b/g,
  /\berror-free\b/g,
  /\bas\s+expected\b/g,
];

/** Sentence boundaries. A dot between digits is a decimal — "passed in 0.4s" — not an end. */
const SENTENCE_END = /(?<!\d)\.(?!\d)|[!?;\n]+/;

/**
 * Text the harness files under the user's role without the user having typed
 * it: a background agent finishing, a slash command and its output, an
 * injected reminder, an interruption. None of them opens a turn.
 */
const HARNESS_TEXT_PREFIXES = [
  "<task-notification>",
  "<system-reminder>",
  "<command-name>",
  "<command-message>",
  "<local-command-stdout>",
  "<local-command-caveat>",
  "[Request interrupted",
];

function debug(...args) {
  if (process.env.OMC_SLIM_DEBUG === "1") console.error("[omc-slim]", ...args);
}

/**
 * The written path out of a write tool's `input`, or null if it carries none.
 *
 * Edit, Write and MultiEdit all use `file_path`; NotebookEdit uses
 * `notebook_path`. A block with neither is not a path we can place, and null
 * propagates as "cannot tell" — never as "outside".
 */
function writtenPath(input) {
  if (input === null || typeof input !== "object") return null;
  for (const key of ["file_path", "notebook_path"]) {
    const value = input[key];
    if (typeof value === "string" && value.trim() !== "") return value;
  }
  return null;
}

/**
 * Absolute, symlink-resolved path, for a file that may no longer exist.
 *
 * Both sides of the containment test have to be resolved the same way or the
 * comparison is a coin flip: on macOS `/tmp` is a symlink to `/private/tmp`, and
 * the OS temp dir sits under `/var` -> `/private/var`, so a raw string compare
 * calls a real in-project write an outside one. `realpathSync` cannot answer for
 * a path that was written and then deleted, so resolve the nearest ancestor that
 * does exist and re-attach the rest.
 */
function realish(path, base) {
  let head = resolve(base, path);
  const tail = [];
  for (;;) {
    try {
      return join(realpathSync(head), ...tail);
    } catch {
      const parent = dirname(head);
      // At the filesystem root there is nothing left to resolve against.
      if (parent === head) return resolve(base, path);
      tail.unshift(basename(head));
      head = parent;
    }
  }
}

/** Is `path` the project root or inside it? Both must already be resolved. */
function withinRoot(path, root) {
  const prefix = root.endsWith(sep) ? root : root + sep;
  return path === root || path.startsWith(prefix);
}

/**
 * Is this write inside the project — lexically, or after resolving symlinks?
 *
 * Either answer being yes is enough, and that asymmetry is the point. Resolving
 * the written path is what handles macOS `/tmp` -> `/private/tmp`, so it has to
 * happen. But it also relocates a path that is genuinely inside the project
 * through a symlinked directory — a pnpm or yarn workspace link, a nix or Bazel
 * symlink farm, a linked package directory — and the resolved form then lands
 * outside a root that never moved. A hook whose whole charter is never to
 * accuse must take the reading in which no accusation is warranted.
 */
function writeIsInProject(rawPath, root) {
  // Lexical first, against the UNRESOLVED cwd. Comparing a lexical path against
  // the resolved root is a category error and gets macOS wrong on its own,
  // because the root moves to /private/tmp and the path does not.
  if (root.raw !== null && withinRoot(resolve(root.raw, rawPath), root.raw)) {
    return true;
  }
  return withinRoot(realish(rawPath, root.real), root.real);
}

/**
 * The project root the payload's `cwd` names, symlink-resolved, or null.
 *
 * Null means the containment test cannot be run at all. The caller then falls
 * back to the pre-path behaviour — any successful write counts — because a hook
 * that cannot place a file must not claim it landed in the wrong place.
 */
function projectRoot(cwd) {
  if (typeof cwd !== "string" || cwd.trim() === "") {
    debug("no cwd in payload; not testing where writes landed");
    return null;
  }
  try {
    // Both forms are kept. `real` is what a resolved write path is compared
    // against; `raw` is what a lexical one is.
    return { real: realpathSync(cwd), raw: resolve(cwd) };
  } catch (err) {
    debug("cannot resolve project root", cwd, err && err.message);
    return null;
  }
}

function readStdin() {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

/**
 * Everything one pass over a transcript can establish, or null when the
 * transcript cannot be read at all.
 *
 * null is "cannot tell", and every state built on it must then stay silent: all
 * of them are accusations if they fire against a transcript nobody read.
 *
 * @param {string|null} transcriptPath
 * @param {{lastTurnOnly?: boolean}} [opts]  Stop: only the current turn. A
 *   check from turn 2 must not silence a "tests pass" at turn 40, so the read
 *   starts at the last human user line and the evidence is discarded again at
 *   any later one. A transcript with no such line is one turn.
 * @returns {null|{pendingWrites: Map, succeeded: Set, dispatches: Set,
 *                 checkRuns: Set, sawUnknownCommand: boolean,
 *                 sawOpaqueTool: boolean, earliestTimestampMs: number|null}}
 */
function scanTranscript(transcriptPath, opts = {}) {
  if (!transcriptPath) {
    debug("cannot tell: no agent transcript path in payload");
    return null;
  }

  let st;
  try {
    // lstat, not stat: a symlink is not a transcript we were handed, and
    // following one turns this into an arbitrary-path read.
    st = lstatSync(transcriptPath);
  } catch (err) {
    debug("cannot tell: stat failed", transcriptPath, err && err.message);
    return null;
  }
  // A FIFO or character device reports size 0, so the cap below waves it
  // through and a read then blocks forever with no timeout — the hook never
  // emits and never exits, breaking "always exits 0". Only a regular file can
  // be a transcript.
  if (!st.isFile()) {
    debug("cannot tell: not a regular file", transcriptPath);
    return null;
  }

  const raw =
    opts.lastTurnOnly === true
      ? readLastTurn(transcriptPath)
      : readWhole(transcriptPath, st.size);
  if (raw === null) return null;
  return scanLines(raw, opts);
}

/** The whole file, for a subagent transcript: every write block and the first timestamp matter. */
function readWhole(transcriptPath, size) {
  if (size > MAX_TRANSCRIPT_BYTES) {
    debug("cannot tell: over cap", size, transcriptPath);
    return null;
  }
  try {
    return readFileSync(transcriptPath, "utf8");
  } catch (err) {
    debug("cannot tell: read failed", transcriptPath, err && err.message);
    return null;
  }
}

/**
 * A Stop transcript from its last human user line to the end, or the whole file
 * when it has none. Null when the file cannot be read, or when the cap's worth
 * of tail holds no human line.
 */
function readLastTurn(transcriptPath) {
  let fd;
  try {
    fd = openSync(transcriptPath, "r");
  } catch (err) {
    debug("cannot tell: open failed", transcriptPath, err && err.message);
    return null;
  }
  try {
    const size = fstatSync(fd).size;
    const from = lastHumanLineOffset(fd, size);
    if (from === null) return null;
    return readBytes(fd, from, size).toString("utf8");
  } catch (err) {
    debug("cannot tell: read failed", transcriptPath, err && err.message);
    return null;
  } finally {
    closeSync(fd);
  }
}

/**
 * Byte offset of the last human user line: 0 when there is none, null when the
 * cap's worth of tail holds none.
 *
 * Chunks are read back to front. A line is judged once its start has been
 * read; the line whose start lies in a chunk not yet read waits in `pending`
 * and is completed by the next chunk.
 */
function lastHumanLineOffset(fd, size) {
  // The tail of a line whose start lies in a chunk not yet read, oldest chunk
  // first, joined once when the start is found. Joining per chunk is quadratic
  // in the line's length, and a transcript's longest line runs to megabytes.
  let pending = [];
  let end = size;
  while (end > 0) {
    if (size - end >= MAX_TRANSCRIPT_BYTES) {
      debug("cannot tell: no human user line within the cap");
      return null;
    }
    if (pending.length > MAX_LINE_CHUNKS) {
      debug("cannot tell: one line runs past", MAX_LINE_CHUNKS, "chunks");
      return null;
    }
    const start = Math.max(0, end - TAIL_CHUNK_BYTES);
    const chunk = readBytes(fd, start, end);
    let lineEnd = chunk.length;
    for (let p = chunk.length - 1; p >= 0; p--) {
      if (chunk[p] !== NEWLINE) continue;
      const line =
        lineEnd === chunk.length
          ? Buffer.concat([chunk.subarray(p + 1), ...pending])
          : chunk.subarray(p + 1, lineEnd);
      if (isHumanUserLine(line)) return start + p + 1;
      lineEnd = p;
    }
    pending = lineEnd === chunk.length ? [chunk, ...pending] : [chunk.subarray(0, lineEnd)];
    end = start;
  }
  // `pending` holds the first line of the file. Human or not, the turn starts
  // at the top.
  return 0;
}

function readBytes(fd, start, end) {
  const buffer = Buffer.alloc(end - start);
  let filled = 0;
  while (filled < buffer.length) {
    const got = readSync(fd, buffer, filled, buffer.length - filled, start + filled);
    // The file shrank under us; what was read is what there is.
    if (got === 0) break;
    filled += got;
  }
  return filled === buffer.length ? buffer : buffer.subarray(0, filled);
}

function isHumanUserLine(line) {
  let entry;
  try {
    entry = JSON.parse(line.toString("utf8"));
  } catch {
    return false;
  }
  return isHumanUserEntry(entry);
}

/**
 * One forward pass over transcript lines, or null when the scan ran out of
 * budget or the turn holds no assistant entry at all. The transcript is flushed
 * on a timer, so a turn with no assistant entry has not been written yet, and
 * nothing can be said about it.
 */
function scanLines(raw, opts) {
  const scan = { ...turnEvidence(), earliestTimestampMs: null };

  const deadline = Date.now() + SCAN_BUDGET_MS;
  let scanned = 0;

  for (const line of raw.split("\n")) {
    // Checked every 256 lines rather than every line: Date.now() per line on a
    // 50 MB transcript is itself measurable, and 256 lines of parse plus the
    // block walk below cannot overrun a 2 s budget by anything that matters.
    if ((scanned++ & 0xff) === 0 && Date.now() >= deadline) {
      debug("cannot tell: scan budget exhausted", scanned);
      return null;
    }
    if (!line.trim().startsWith("{")) continue;
    let obj;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }
    noteTimestamp(obj, scan);
    if (opts.lastTurnOnly === true && isHumanUserEntry(obj)) {
      Object.assign(scan, turnEvidence());
    }
    if (obj.type === "assistant") scan.sawAssistantEntry = true;
    collectBlocks(obj, scan);
  }

  if (!scan.sawAssistantEntry) {
    debug("cannot tell: the turn holds no assistant entry yet");
    return null;
  }
  return scan;
}

/**
 * The evidence one turn can hold. Fresh at the start of the scan and, on Stop,
 * again at every human user line, so memory stays at one turn's worth.
 */
function turnEvidence() {
  return {
    /** id of every write-tool tool_use block -> the path it wrote, or null */
    pendingWrites: new Map(),
    /** ids whose tool_result came back clean */
    succeeded: new Set(),
    /** ids whose tool_result came back `is_error` */
    errored: new Set(),
    /** ids of every Task/Agent dispatch, resolved against `succeeded` later */
    dispatches: new Set(),
    /** ids of every Bash block whose command read as a check, resolved against `succeeded` later */
    checkRuns: new Set(),
    /** of those, the blocks with more than one segment: an error on one cannot be charged to the check */
    multiSegmentCheckRuns: new Set(),
    /** did any Bash command read as "unknown"? Then nothing can say no check ran. */
    sawUnknownCommand: false,
    /** did the agent use Bash or an MCP tool, either of which can write without a write block? */
    sawOpaqueTool: false,
    /** did the turn record an assistant entry at all? */
    sawAssistantEntry: false,
  };
}

/**
 * Message lines carry an ISO 8601 `timestamp`; bookkeeping lines do not. The
 * earliest one dates the transcript, so a ledger write from before the agent
 * existed can be told apart from one it could have made.
 */
function noteTimestamp(entry, scan) {
  if (entry === null || typeof entry !== "object") return;
  if (typeof entry.timestamp !== "string") return;
  const ms = Date.parse(entry.timestamp);
  if (!Number.isFinite(ms)) return;
  if (scan.earliestTimestampMs === null || ms < scan.earliestTimestampMs) {
    scan.earliestTimestampMs = ms;
  }
}

/**
 * Did this agent SUCCESSFULLY write a file INSIDE the project?
 *
 * Four answers, because a boolean cannot separate them:
 *
 *   null       cannot tell. The caller stays silent.
 *   true       at least one successful write landed in the project root.
 *   "outside"  successful writes, every one of them outside the root.
 *   "none"     no successful write at all.
 *
 * An attempted write is not a deliverable. A permission-denied Edit still
 * appears as a `tool_use` block, so matching on tool_use alone reports success
 * for an agent that was blocked and produced nothing — the exact situation most
 * worth flagging.
 *
 * So: the scan collected write-tool `tool_use` ids with the path each one wrote;
 * this requires a matching `tool_result` that is not `is_error`. A tool_use with
 * no result at all (agent died mid-call) also counts as no write.
 *
 * A successful write whose path cannot be placed — no path in the input, or a
 * null `root` — counts as `true`. Silence is the only safe reading of a write
 * this cannot locate.
 *
 * @param {object|null} scan  scanTranscript's result, or null for "cannot tell"
 * @param {object|null} root  resolved project root, or null to skip the test
 * @returns {null|true|"outside"|"none"}
 */
function writeVerdict(scan, root) {
  if (scan === null) return null;
  const { pendingWrites, succeeded } = scan;

  let sawSuccess = false;
  for (const [id, path] of pendingWrites) {
    if (!succeeded.has(id)) continue;
    sawSuccess = true;
    if (root === null || path === null) return true;
    if (writeIsInProject(path, root)) return true;
  }
  return sawSuccess ? "outside" : "none";
}

/** Depth-bounded walk collecting the tool blocks every state is built from. */
function collectBlocks(node, scan, depth = 0) {
  if (depth > 6 || node === null || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const child of node) {
      collectBlocks(child, scan, depth + 1);
    }
    return;
  }

  if (node.type === "tool_use" && node.id) {
    if (WRITE_TOOLS.has(node.name)) {
      scan.pendingWrites.set(node.id, writtenPath(node.input));
    }
    if (DISPATCH_TOOLS.has(node.name)) scan.dispatches.add(node.id);
    if (node.name === "Bash" || isMcpTool(node.name)) scan.sawOpaqueTool = true;
    if (node.name === "Bash") noteCommand(node, scan);
  }
  // `is_error` is absent on success and true on failure.
  if (node.type === "tool_result" && node.tool_use_id) {
    if (node.is_error !== true) scan.succeeded.add(node.tool_use_id);
    else scan.errored.add(node.tool_use_id);
  }

  for (const value of Object.values(node)) {
    if (value !== null && typeof value === "object") {
      collectBlocks(value, scan, depth + 1);
    }
  }
}

function isMcpTool(name) {
  return typeof name === "string" && name.startsWith(OPAQUE_TOOL_PREFIX);
}

/** Judge one Bash block's command and record what it contributes to the turn. */
function noteCommand(node, scan) {
  const command =
    node.input !== null && typeof node.input === "object" && typeof node.input.command === "string"
      ? node.input.command
      : null;
  if (command === null) {
    debug("command:", "unknown", "(no command)");
    scan.sawUnknownCommand = true;
    return;
  }
  const segments = commandSegments(command);
  const verdicts = segmentVerdicts(segments);
  debug("command:", [...verdicts].sort().join(",") || "non-check", command.slice(0, 80));
  if (verdicts.has("check")) scan.checkRuns.add(node.id);
  if (verdicts.has("check") && segments.length > 1) scan.multiSegmentCheckRuns.add(node.id);
  if (verdicts.has("unknown")) scan.sawUnknownCommand = true;
}

/**
 * A human user turn: the line that bounds "this turn" on Stop. Everything after
 * the last one is the work that could have run a check. Tool results,
 * compaction summaries, meta entries and harness-written text all sit under the
 * user role and are not turns. A human line misread as one of those fails
 * toward silence, which is the direction this hook may fail in.
 */
function isHumanUserEntry(entry) {
  if (entry === null || typeof entry !== "object") return false;
  if (entry.type !== "user") return false;
  if (entry.isMeta === true || entry.isCompactSummary === true) return false;
  const text = userEntryText(entry);
  if (text === null) return false;
  return !HARNESS_TEXT_PREFIXES.some((prefix) => text.startsWith(prefix));
}

/** The user-role text of one entry, trimmed, or null when it carries none. */
function userEntryText(entry) {
  const content = entry.message && entry.message.content;
  let text = "";
  if (typeof content === "string") text = content;
  if (Array.isArray(content)) {
    text = content.filter(isTextBlock).map((block) => block.text).join("\n");
  }
  const trimmed = text.trim();
  return trimmed === "" ? null : trimmed;
}

function isTextBlock(block) {
  return (
    block !== null &&
    typeof block === "object" &&
    block.type === "text" &&
    typeof block.text === "string"
  );
}

/**
 * The simple commands a shell command line runs, so argv0 is read per segment:
 * `cd src && npm test` counts and `git log --oneline latest` does not.
 *
 * A character scan, not a regex. A split on `\s*` before a literal is quadratic
 * in the whitespace it fails to match, and one long command line then stalls
 * the hook. Operators inside quotes are text (`git commit -m "a; b"`). A
 * comment runs to the end of its line and is no segment. A heredoc's body is
 * data: the lines after the operator's line are skipped up to the delimiter
 * line, and the scan resumes after it. A body no line closes runs to the end of
 * the command, and its segment is returned as null: nothing in it can be read.
 */
function commandSegments(command) {
  const segments = [];
  let start = 0;
  let quote = null;
  let heredoc = null;
  let i = 0;
  while (i < command.length) {
    const ch = command[i];
    if (quote !== null) {
      if (ch === quote) {
        quote = null;
      } else if (ch === "\\" && quote === '"') {
        i += 1;
      }
      i += 1;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      i += 1;
      continue;
    }
    if (ch === "\\") {
      i += 2;
      continue;
    }
    if (ch === "#" && startsWord(command, i, start)) {
      segments.push(command.slice(start, i));
      i = lineEnd(command, i);
      start = i;
      continue;
    }
    if (ch === "<" && command[i + 1] === "<") {
      // `<<<` is a here-string: one word, not a body.
      if (command[i + 2] === "<") {
        i += 3;
        continue;
      }
      const found = heredocAt(command, i, start);
      if (found === null) {
        i += 2;
        continue;
      }
      heredoc = { ...found, segment: segments.length };
      i = found.end;
      continue;
    }
    const width = operatorWidth(command, i);
    if (width === 0) {
      i += 1;
      continue;
    }
    segments.push(command.slice(start, i));
    i += width;
    start = i;
    if (ch === "\n" && heredoc !== null) {
      const bodyEnd = heredocBodyEnd(command, i, heredoc);
      if (bodyEnd === null) {
        segments[heredoc.segment] = null;
        return nonBlank(segments);
      }
      i = bodyEnd;
      start = i;
      heredoc = null;
    }
  }
  segments.push(command.slice(start));
  if (heredoc !== null) segments[heredoc.segment] = null;
  return nonBlank(segments);
}

/** Is the character at `i` the first of a word: at the segment's start, or after whitespace? */
function startsWord(command, i, segmentStart) {
  return i === segmentStart || isSpace(command[i - 1]);
}

/** The offset of the newline ending the line that holds `i`, or the command's end. */
function lineEnd(command, i) {
  const at = command.indexOf("\n", i);
  return at === -1 ? command.length : at;
}

/**
 * The heredoc operator at `i`, or null when the `<<` there is something else:
 * the `<<` of `$((1<<2))` follows a digit, and a `<<` with no word after it
 * redirects nothing.
 */
function heredocAt(command, i, segmentStart) {
  if (!startsWord(command, i, segmentStart)) return null;
  let p = i + 2;
  const stripTabs = command[p] === "-";
  if (stripTabs) p += 1;
  while (isSpace(command[p])) p += 1;
  const wordStart = p;
  while (p < command.length && !isSpace(command[p]) && !HEREDOC_WORD_END.has(command[p])) p += 1;
  if (p === wordStart) return null;
  // `<<'EOF'`, `<<"EOF"` and `<<\EOF` quote the body; the delimiter is the bare word.
  const delimiter = command.slice(wordStart, p).replace(/['"\\]/g, "");
  return { delimiter, stripTabs, end: p };
}

/**
 * The offset just past the line that closes the heredoc body starting at
 * `from`, or null when no line does. `<<-` lets the closing line be indented
 * with tabs.
 */
function heredocBodyEnd(command, from, heredoc) {
  let lineStart = from;
  for (;;) {
    const end = lineEnd(command, lineStart);
    let line = command.slice(lineStart, end);
    if (heredoc.stripTabs) line = line.replace(/^\t+/, "");
    if (line === heredoc.delimiter) return Math.min(end + 1, command.length);
    if (end === command.length) return null;
    lineStart = end + 1;
  }
}

/** Width of the list or pipeline operator at `i`, or 0 when there is none. */
function operatorWidth(command, i) {
  const ch = command[i];
  if (ch === ";" || ch === "\n") return 1;
  if (ch === "|") return command[i + 1] === "|" ? 2 : 1;
  if (ch === "&" && command[i + 1] === "&") return 2;
  return 0;
}

/** Blank segments dropped; a null one (a heredoc no line closed) is kept, to be judged unknown. */
function nonBlank(segments) {
  return segments.filter((segment) => segment === null || segment.trim() !== "");
}

/**
 * argv of one segment: subshell parens and quotes trimmed from every token's
 * edges, leading reserved words and leading assignments dropped.
 */
function tokenize(segment) {
  const tokens = (segment.match(/"[^"]*"|'[^']*'|\S+/g) || [])
    .map(bareToken)
    .filter((token) => token !== "");
  let i = 0;
  while (i < tokens.length && SHELL_KEYWORDS.has(tokens[i])) i++;
  while (i < tokens.length && isAssignment(tokens[i])) i++;
  return tokens.slice(i);
}

/**
 * `(cd sub && npm test) 2>&1` splits into `(cd sub` and `npm test) 2>&1`; the
 * parens belong to the subshell, not to argv, wherever in the segment they sit.
 */
function bareToken(token) {
  return token.replace(/^\(+|\)+$/g, "").replace(/^['"]|['"]$/g, "");
}

function isSpace(ch) {
  return ch === " " || ch === "\t" || ch === "\r";
}

function isAssignment(token) {
  return /^[A-Za-z_]\w*=/.test(token);
}

/** The bare program name of a token: path stripped, lowercased, one Windows launcher suffix removed. */
function basenameArg(token) {
  const cleaned = token.replace(/\\/g, "/");
  const slash = cleaned.lastIndexOf("/");
  const name = (slash === -1 ? cleaned : cleaned.slice(slash + 1)).toLowerCase();
  return name.replace(/\.(exe|cmd|bat)$/, "");
}

/** `test`, `test:unit`, `check-types`, `ci`: a package script whose stem names a check. */
function scriptLooksLikeCheck(name) {
  const n = name.toLowerCase();
  return [...SCRIPT_WORDS].some(
    (word) => n === word || (n.startsWith(word) && /^[-_:]/.test(n.slice(word.length))),
  );
}

function isScriptPath(token) {
  return token.includes("/") || token.includes("\\") || SCRIPT_EXTENSION.test(token);
}

/** A script the agent ran directly: a check if its name says so, otherwise anything at all. */
function scriptVerdict(token) {
  return CHECK_SCRIPT_NAME.test(basenameArg(token)) ? "check" : "unknown";
}

function hasCheckWord(args, words) {
  return args.some((arg) => words.has(arg.toLowerCase()));
}

function packageManagerVerdict(bin, args) {
  if (hasCheckWord(args, CHECK_WORDS)) return "check";
  if (args.some((arg) => CHECK_BINARIES.has(basenameArg(arg)))) return "check";
  const script = namedScript(bin, args);
  if (script === null) return "non-check";
  return scriptLooksLikeCheck(script) ? "check" : "unknown";
}

/**
 * The project script or arbitrary binary a package-manager command names, or
 * null when it runs a fixed subcommand of its own (`npm ci`, `deno fmt`).
 */
function namedScript(bin, args) {
  const words = args.filter((arg) => !arg.startsWith("-"));
  const runAt = words.findIndex((word) => SCRIPT_RUN_WORDS.has(word.toLowerCase()));
  if (runAt !== -1) return words[runAt + 1] ?? null;
  if (BARE_SCRIPT_MANAGERS.has(bin)) return words[0] ?? null;
  return null;
}

/**
 * Bare `make` builds the default target. A named target is a check when it is a
 * check word, a non-check when every target is a fixed non-check one, and
 * otherwise a name only the Makefile can explain.
 */
function makeVerdict(args) {
  const targets = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith("-")) {
      if (MAKE_VALUED.has(arg)) i++;
      continue;
    }
    if (isAssignment(arg)) continue;
    targets.push(arg.toLowerCase());
  }
  if (targets.length === 0) return "check";
  if (targets.some((target) => MAKE_WORDS.has(target))) return "check";
  return targets.every((target) => NON_CHECK_SUBCOMMANDS.has(target)) ? "non-check" : "unknown";
}

/** A toolchain front or task runner: see SUBCOMMAND_RUNNERS and NON_CHECK_SUBCOMMANDS. */
function subcommandVerdict(args, words) {
  if (hasCheckWord(args, words)) return "check";
  const positional = args.filter((arg) => !arg.startsWith("-"));
  const subcommand = positional[0];
  if (subcommand === undefined) return "unknown";
  if (subcommand.toLowerCase() === "run") {
    // A task runner's `run <project>:<target>` names the target last; both
    // `run test:unit` and `run app:test` are test invocations.
    const target = positional[positional.length - 1];
    if (target === subcommand) return "non-check";
    const tail = target.split(/[:=]/).pop();
    if (scriptLooksLikeCheck(target) || scriptLooksLikeCheck(tail)) return "check";
    return "unknown";
  }
  return NON_CHECK_SUBCOMMANDS.has(subcommand.toLowerCase()) ? "non-check" : "unknown";
}

/** `python -m pytest`, `python manage.py test`, `python run_tests.py`: by module, by Django command, by script name. */
function pythonVerdict(args) {
  for (let i = 0; i < args.length - 1; i++) {
    if (args[i] === "-c") return "unknown";
    if (args[i] === "-m") {
      const module = args[i + 1].toLowerCase();
      if (module === "coverage") return coverageVerdict(args.slice(i + 2));
      return PYTHON_MODULES.has(module) ? "check" : "unknown";
    }
  }
  const scriptAt = args.findIndex((arg) => !arg.startsWith("-"));
  if (scriptAt === -1) return "unknown";
  if (basenameArg(args[scriptAt]) === "manage.py") {
    return hasCheckWord(args.slice(scriptAt + 1), CHECK_WORDS) ? "check" : "unknown";
  }
  return scriptVerdict(args[scriptAt]);
}

function isPythonBin(bin) {
  return bin === "py" || /^python(\d+(\.\d+)?)?$/.test(bin);
}

/** `coverage run -m pytest`, `coverage run tests.py`: the python invocation it wraps. Its reports are not checks. */
function coverageVerdict(args) {
  if (args[0] === undefined) return "unknown";
  if (args[0].toLowerCase() !== "run") return "non-check";
  const rest = args.slice(1);
  let i = 0;
  while (i < rest.length && rest[i].startsWith("-") && rest[i] !== "-m") {
    i += COVERAGE_VALUED.has(rest[i]) ? 2 : 1;
  }
  return pythonVerdict(rest.slice(i));
}

/** `node --test`, or a script whose name says it is a check. */
function nodeVerdict(args) {
  if (args.some((arg) => arg === "--test" || arg.startsWith("--test="))) return "check";
  const rest = dropOptions(args, NODE_VALUED);
  return rest.length === 0 ? "unknown" : scriptVerdict(rest[0]);
}

/** `sh -c "<cmd>"`: the quoted command's verdict. `bash script.sh`: the script's name. */
function shellVerdict(args) {
  for (let i = 0; i < args.length - 1; i++) {
    if (/^-[a-z]*c$/i.test(args[i])) return commandVerdict(args[i + 1]);
  }
  const rest = dropOptions(args, SHELL_VALUED);
  return rest.length === 0 ? "unknown" : scriptVerdict(rest[0]);
}

/** `php artisan test`, or `php vendor/bin/phpunit`. */
function phpVerdict(args) {
  if (args.some((arg) => CHECK_BINARIES.has(basenameArg(arg)))) return "check";
  const artisan = args[0] !== undefined && args[0].toLowerCase() === "artisan";
  if (artisan && hasCheckWord(args.slice(1), CHECK_WORDS)) return "check";
  return "unknown";
}

/** Drop leading option tokens, and the value of each option that takes one. */
function dropOptions(tokens, valued) {
  let i = 0;
  while (i < tokens.length && tokens[i].startsWith("-")) {
    i += valued.has(tokens[i]) ? 2 : 1;
  }
  return tokens.slice(i);
}

function dropAssignments(tokens) {
  let i = 0;
  while (i < tokens.length && isAssignment(tokens[i])) i++;
  return tokens.slice(i);
}

/** docker options, with the value of each one that takes one; see DOCKER_FLAGS. */
function dropDockerOptions(tokens) {
  let i = 0;
  while (i < tokens.length && tokens[i].startsWith("-")) {
    const option = tokens[i].toLowerCase();
    i += DOCKER_FLAGS.has(option) || option.includes("=") ? 1 : 2;
  }
  return tokens.slice(i);
}

/**
 * The command a `docker exec|run` or `docker compose exec|run` runs, after the
 * container, service or image name — or null when this is not that shape, or
 * the command cannot be found.
 */
function dockerCommand(bin, argv) {
  let rest = dropDockerOptions(argv.slice(1));
  if (bin === "docker" && rest[0] !== undefined && rest[0].toLowerCase() === "compose") {
    rest = dropDockerOptions(rest.slice(1));
  }
  if (rest[0] === undefined || !DOCKER_RUN_WORDS.has(rest[0].toLowerCase())) return null;
  const afterContainer = dropDockerOptions(rest.slice(1)).slice(1);
  return afterContainer.length === 0 ? null : afterContainer;
}

/**
 * The command after every wrapper — `sudo`, `env`, `timeout`, `uv run`, `docker
 * exec … <container>` — and the project script a run wrapper named, if any.
 *
 * One loop, no recursion: every pass strips at least one token, so it ends
 * within the segment's token count, which segmentVerdict has already capped.
 * Null when a wrapper's shape cannot be read, which the caller reads as
 * "unknown".
 */
function unwrap(argv) {
  let tokens = argv;
  let script = null;
  for (;;) {
    if (tokens.length === 0) return { argv: tokens, script };
    const bin = basenameArg(tokens[0]);
    const valued = WRAPPERS.get(bin);
    if (valued !== undefined) {
      // `command -v x` asks whether x exists; it runs nothing.
      if (bin === "command" && tokens[1] !== undefined && /^-[vV]$/.test(tokens[1])) {
        return { argv: [], script: null };
      }
      let rest = dropOptions(tokens.slice(1), valued);
      if (bin === "timeout") rest = rest.slice(1);
      if (bin === "env") rest = dropAssignments(rest);
      tokens = rest;
      continue;
    }
    const runWord = RUN_WRAPPERS.get(bin);
    if (runWord !== undefined) {
      // `uv sync`, `poetry install`: the tool's own subcommand, judged by name.
      if (tokens[1] === undefined || tokens[1].toLowerCase() !== runWord) {
        return { argv: tokens, script };
      }
      tokens = dropOptions(tokens.slice(2), RUN_WRAPPER_VALUED);
      script = tokens[0] ?? null;
      continue;
    }
    if (DOCKER_BINS.has(bin)) {
      const inner = dockerCommand(bin, tokens);
      if (inner === null) return null;
      tokens = inner;
      continue;
    }
    return { argv: tokens, script };
  }
}

function argvVerdict(argv) {
  const unwrapped = unwrap(argv);
  if (unwrapped === null) return "unknown";
  const { argv: tokens, script } = unwrapped;
  if (script !== null && scriptLooksLikeCheck(script)) return "check";
  if (tokens.length === 0) return "non-check";
  const bin = basenameArg(tokens[0]);
  const args = tokens.slice(1);
  if (CHECK_BINARIES.has(bin)) return "check";
  if (bin === "git" && hasCheckWord(args, CHECK_FLAGS)) return "check";
  if (NON_CHECK_BINARIES.has(bin)) return "non-check";
  if (hasCheckWord(args, CHECK_FLAGS)) return "check";
  if (PACKAGE_MANAGERS.has(bin)) return packageManagerVerdict(bin, args);
  if (MAKE_BINS.has(bin)) return makeVerdict(args);
  if (SUBCOMMAND_RUNNERS.has(bin)) return subcommandVerdict(args, SUBCOMMAND_RUNNERS.get(bin));
  if (SHELLS.has(bin)) return shellVerdict(args);
  if (isPythonBin(bin)) return pythonVerdict(args);
  if (bin === "coverage") return coverageVerdict(args);
  if (NODE_BINS.has(bin)) return nodeVerdict(args);
  if (bin === "php") return phpVerdict(args);
  if (isScriptPath(tokens[0])) return scriptVerdict(tokens[0]);
  return "unknown";
}

/** "check", "non-check" or "unknown" for one simple command; null is a segment the scan could not read. */
function segmentVerdict(segment) {
  if (segment === null) return "unknown";
  const argv = tokenize(segment);
  if (argv.length > MAX_SEGMENT_TOKENS) return "unknown";
  return argvVerdict(argv);
}

/** Every verdict the segments reach. */
function segmentVerdicts(segments) {
  const verdicts = new Set();
  for (const segment of segments) {
    verdicts.add(segmentVerdict(segment));
  }
  return verdicts;
}

/** One verdict for a whole command line: a check anywhere in it is a check. */
function commandVerdict(command) {
  const verdicts = segmentVerdicts(commandSegments(command));
  if (verdicts.has("check")) return "check";
  if (verdicts.has("unknown")) return "unknown";
  return "non-check";
}

function withoutHedgeWordIdioms(sentence) {
  return HEDGE_WORD_IDIOMS.reduce((text, phrase) => text.replace(phrase, " "), sentence);
}

/**
 * Does the agent's final message assert a verification outcome?
 *
 * Sentence by sentence, and that granularity is the whole design. A real final
 * message mixes an assertion with prose — "I fixed the bug. All tests pass. No
 * other files were touched." — so testing the whole text against the hedge list
 * below would find "no" and fall silent on every realistic report. Testing each
 * sentence keeps the honest carve-out (a sentence that reports a failure is not
 * a claim) without muting the state it exists to catch.
 */
function assertsVerification(text) {
  // The curly apostrophe is what a model actually emits, and "didn't" spelled
  // with one would otherwise slip past the hedge list as an assertion.
  const normalised = text.replace(/[‘’]/g, "'").toLowerCase();
  for (const sentence of normalised.split(SENTENCE_END)) {
    const claimable = withoutHedgeWordIdioms(sentence);
    if (NOT_AN_ASSERTION.test(claimable)) continue;
    if (VERIFICATION_CLAIMS.some((claim) => claim.test(claimable))) return true;
    if (VERIFIED.test(claimable) && VERIFIED_SUBJECT.test(claimable)) return true;
  }
  return false;
}

/** Did any dispatch to another agent come back clean? */
function sawDelegation(scan) {
  for (const id of scan.dispatches) {
    if (scan.succeeded.has(id)) return true;
  }
  return false;
}

/** Did any check command come back clean? A runner that errored proved nothing. */
function sawCleanCheck(scan) {
  for (const id of scan.checkRuns) {
    if (scan.succeeded.has(id)) return true;
  }
  return false;
}

/**
 * Did a line of several commands, one of them a check, come back an error? One
 * exit status cannot say which command failed: `npm test && git commit` fails
 * when the commit does, with the tests passed.
 */
function sawUnattributableFailure(scan) {
  for (const id of scan.multiSegmentCheckRuns) {
    if (scan.errored.has(id)) return true;
  }
  return false;
}

/**
 * Did the agent report a verification result that nothing in its transcript ran?
 *
 * Every clause is biased towards silence. The message must assert an outcome
 * rather than mention testing; the transcript must have been read; no check
 * command may have come back clean; no command may have been one the parse could
 * not classify; no dispatch may have handed the checking to another agent; and
 * no line of several commands with a check among them may have errored, since
 * which of them failed cannot be told.
 *
 * `message` is the payload's `last_assistant_message`. Absent means abstain, on
 * both events: the field is missing when the final assistant message carries no
 * text block, and the transcript is no substitute — it is flushed on a timer and
 * may not yet hold that message when the hook runs, so its "last assistant text"
 * can be an earlier one.
 */
function claimedUnrunCheck(scan, message) {
  if (typeof message !== "string" || message.trim() === "") return false;
  if (!assertsVerification(message)) return false;
  if (scan === null) return false;
  if (sawCleanCheck(scan) || scan.sawUnknownCommand || sawDelegation(scan)) return false;
  return !sawUnattributableFailure(scan);
}

/**
 * This plugin's own agent, by bare name — or null when the agent is another
 * plugin's or carries no namespace. Kept in step with the matcher in hooks.json;
 * see SELF_NAMESPACE.
 */
function ownAgentName(agent) {
  if (!agent.startsWith(SELF_NAMESPACE)) return null;
  return agent.slice(SELF_NAMESPACE.length);
}

/**
 * Where hooks/file-ledger.mjs keeps this project's FileChanged ledger: one file
 * per project under the Claude config dir, keyed by the resolved cwd. Duplicated
 * there on purpose — the mutation runner copies one hook file into a temp dir,
 * where a shared module would not resolve.
 */
function ledgerPathFor(cwd) {
  let real;
  try {
    real = realpathSync(cwd);
  } catch {
    real = resolve(cwd);
  }
  const key = createHash("sha256").update(real).digest("hex").slice(0, 16);
  const claudeHome = process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude");
  return join(claudeHome, "omc-slim", "ledgers", `${key}.jsonl`);
}

/**
 * Has FileChanged recorded an in-project write this subagent could have made?
 *
 * Used only to abstain from the no-write advisory: Auto-mode Bash and an MCP
 * server leave no Edit/Write block. FileChanged carries a session_id and never
 * an agent id, so a hit means "cannot tell who wrote", which is silence — never
 * a deliverable. A row counts only from this session, only from after the
 * transcript's first timestamp, only for a path inside the project, and never
 * for a deletion. A payload with no session_id can match no row, so the ledger
 * is not consulted at all.
 */
function ledgerShowsInProjectWrite(cwd, root, sessionId, sinceMs) {
  if (root === null || typeof sessionId !== "string" || sessionId === "") return false;
  const path = ledgerPathFor(cwd);
  let raw;
  try {
    // lstat: a symlink at the ledger path is not a ledger this plugin wrote.
    const st = lstatSync(path);
    if (!st.isFile() || st.size > MAX_LEDGER_BYTES) return false;
    raw = readFileSync(path, "utf8");
  } catch {
    return false;
  }
  for (const line of raw.split("\n")) {
    if (line.trim() === "") continue;
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      continue;
    }
    if (ledgerRowCounts(row, sessionId, sinceMs) && writeIsInProject(row.path, root)) {
      return true;
    }
  }
  return false;
}

/**
 * One ledger row is `{t, session_id, path, event}`, `t` in ms since the epoch
 * and an mtime, so it may be coarser than `sinceMs`; see MTIME_TOLERANCE_MS.
 */
function ledgerRowCounts(row, sessionId, sinceMs) {
  if (row === null || typeof row !== "object") return false;
  if (typeof row.path !== "string" || row.path.trim() === "") return false;
  if (row.event === "unlink") return false;
  if (row.session_id !== sessionId) return false;
  if (!Number.isFinite(sinceMs)) return true;
  return typeof row.t === "number" && row.t >= sinceMs - MTIME_TOLERANCE_MS;
}

function main() {
  const input = readStdin();
  if (!input.trim()) return emit(null);

  let data;
  try {
    data = JSON.parse(input);
  } catch {
    return emit(null);
  }

  const event = String(data.hook_event_name ?? "SubagentStop");
  const lastMessage = data.last_assistant_message;
  if (event === "Stop") return mainStop(data, lastMessage);
  return mainSubagentStop(data, lastMessage);
}

/**
 * Main thread. Write advisories would fire on every chatty turn; only the
 * claim state is in scope. The transcript is the parent session's, read from
 * its last human turn.
 */
function mainStop(data, lastMessage) {
  if (data.stop_hook_active === true) {
    return emit(null);
  }
  const transcript = data.transcript_path ?? null;
  const scan = scanTranscript(transcript, { lastTurnOnly: true });
  const claimed = claimedUnrunCheck(scan, lastMessage);
  debug("Stop", "unrun claim:", claimed);
  if (!claimed) return emit(null);
  const message =
    "omc-slim: this turn reported a verification result, and no test, build " +
    "or typecheck command came back clean in the transcript. If it verified another way " +
    "— an MCP server, a tool that is not Bash — ignore this. Otherwise the " +
    "result is a claim, not an observation.";
  return emit(message);
}

function mainSubagentStop(data, lastMessage) {
  const agent = String(data.agent_type ?? "").toLowerCase();

  const bare = ownAgentName(agent);
  if (bare === null || !WRITE_AGENTS.has(bare)) return emit(null);

  // MUST be the subagent's own transcript, not `transcript_path` — that one is
  // the parent session. Scanning the parent would find any edit the main thread
  // ever made and wrongly conclude this subagent wrote something; a
  // `?? data.transcript_path` fallback here turns silence into that accusation.
  const agentTranscript = data.agent_transcript_path ?? null;

  const root = projectRoot(data.cwd);
  const scan = scanTranscript(agentTranscript);
  let wrote = writeVerdict(scan, root);
  // FileChanged recorded an in-project write, in this session and after this
  // transcript began, and the agent ran a tool that can write without leaving a
  // write block. Cannot tell who wrote (the event has no agent id), so do not
  // accuse: neither "wrote nothing" nor "nothing in the project changed", which
  // the ledger contradicts just the same when every write block went to /tmp.
  // An agent that ran no such tool cannot have made that write.
  if (
    (wrote === "none" || wrote === "outside") &&
    scan.sawOpaqueTool &&
    ledgerShowsInProjectWrite(data.cwd, root, data.session_id, scan.earliestTimestampMs)
  ) {
    wrote = null;
  }
  const claimed = claimedUnrunCheck(scan, lastMessage);
  debug("agent", bare, "root", root, "wrote:", wrote, "unrun claim:", claimed);

  // Three states, three messages, because one message would be a lie in two of
  // them. `null` for the write verdict means "could not determine" and says
  // nothing rather than crying wolf.
  //
  // None of them accuses. The fixer's own brief sanctions `sed`, `git mv` and
  // bulk shell edits, and prefers an MCP code-generation server to hand-written
  // boilerplate — none of which leaves a write-tool block in the transcript, so
  // each message offers that reading first.
  //
  // The write states and the claim state are independent: an agent can write
  // nothing AND report a check it never ran, and both are worth saying. The user
  // gets one message, not two.
  const advisories = [];
  if (wrote === "outside") {
    advisories.push(outsideWriteAdvisory(bare));
  } else if (wrote === "none") {
    advisories.push(noWriteAdvisory(bare));
  }
  if (claimed) advisories.push(unrunCheckAdvisory(bare));

  return emit(advisories.length ? `omc-slim: ${advisories.join("\n")}` : null);
}

/** Successful writes, every one of them outside the project root. */
function outsideWriteAdvisory(agentName) {
  return (
    `the ${agentName} agent's only successful writes landed outside the ` +
    `project directory (a scratch path such as /tmp). Nothing in the project ` +
    `changed. If that was the intent, ignore this; if it was not, check the ` +
    `work before trusting the report.`
  );
}

/**
 * No successful write at all. "successful" carries weight: this state also
 * covers the agent whose every write was denied, and "no tool use was seen"
 * would be false of that one.
 */
function noWriteAdvisory(agentName) {
  return (
    `no successful Edit/Write-family tool use was seen from the ` +
    `${agentName} agent. If the work landed through the shell (sed, git mv, a bulk ` +
    `rewrite) or an MCP server, ignore this. Otherwise, check the work before ` +
    `trusting the report.`
  );
}

/**
 * A verification result asserted with nothing in the transcript that ran one.
 *
 * It names the state, not the person, and it offers the innocent reading first —
 * an MCP server or a tool that is not Bash is a check this hook cannot see.
 */
function unrunCheckAdvisory(agentName) {
  return (
    `the ${agentName} agent reported a verification result, and no test, build ` +
    `or typecheck command came back clean in its transcript. If it verified another way ` +
    `— an MCP server, a tool that is not Bash — ignore this. Otherwise the ` +
    `result is a claim, not an observation.`
  );
}

/** Always exit 0. Advisory hooks must not fail a session. */
function emit(message) {
  if (message) {
    process.stdout.write(
      JSON.stringify({ systemMessage: message, suppressOutput: true }),
    );
  } else {
    process.stdout.write(JSON.stringify({ suppressOutput: true }));
  }
  process.exit(0);
}

try {
  main();
} catch {
  emit(null);
}
