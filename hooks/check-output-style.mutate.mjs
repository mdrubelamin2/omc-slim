#!/usr/bin/env node
/**
 * omc-slim — mutation check for the check-output-style harness.
 *
 * Breaks the hook on purpose, eighteen ways, and asserts the harness notices
 * every time. A SURVIVED line is a hole in the tests, not a bug in the hook.
 *
 * This hook warns the user about a condition it can only infer, so the two
 * failure directions are not symmetric. Missing a real collision costs one
 * confused user; warning on a plugin that is disabled, uninstalled or merely
 * mentions the flag costs every user's trust in the warning. The mutants below
 * are weighted accordingly — seven of them make it fire when it should not.
 *
 * Run: node hooks/check-output-style.mutate.mjs
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runMutants } from "./mutate-runner.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * [label, find, replace, what breaks in production]
 */
const MUTANTS = [
  ["omc-slim reported as its own rival",
   "const rivals = [...found].filter(([key]) => bareName(key) !== SELF);",
   "const rivals = [...found];",
   "warns about the plugin that is working, every single session"],
  ["a disabled plugin counts as enabled",
   "merged.set(key, value === true)",
   "merged.set(key, true)",
   "warns about a plugin the user already turned off"],
  ["the enabled filter is dropped",
   "return new Set([...merged].filter(([, on]) => on).map(([key]) => key));",
   "return new Set([...merged].map(([key]) => key));",
   "every plugin ever listed counts as enabled"],
  ["project settings stop being read",
   '    join(cwd, ".claude", "settings.json"),\n    join(cwd, ".claude", "settings.local.json"),\n',
   "",
   "a plugin disabled for this project still warns, and cannot be silenced"],
  ["the flag is matched anywhere in the file",
   ".test(frontmatter)",
   ".test(text)",
   "a style that documents the flag is reported as forcing it"],
  ["the flag no longer has to be a top-level key",
   "/^force-for-plugin[ \\t]*:[ \\t]*(true|yes|on|1)[ \\t]*$/im",
   "/force-for-plugin[ \\t]*:[ \\t]*(true|yes|on|1)/im",
   "an indented key inside another block counts as forcing"],
  ["the scan deadline is removed",
   "  return Date.now() >= deadline;",
   "  return false;",
   "an unbounded disk scan in front of the user's first turn"],
  ["blank style budget parsed as zero",
   'if (raw === undefined || raw.trim() === "") return 1500;',
   "if (raw === undefined) return 1500;",
   "an exported-but-empty override mutes the hook permanently"],
  // Mutated TOWARDS silence, not towards NaN: `return n` on a garbage value
  // disables the deadline, which fails open and is the direction this hook is
  // allowed to fail in. `return 0` models the regression that matters.
  ["style budget falls back to zero instead of the default",
   "return Number.isFinite(n) && n >= 0 ? n : 1500;",
   "return Number.isFinite(n) && n >= 0 ? n : 0;",
   "a typo'd override mutes the hook instead of using the default"],
  ["debug writes to stdout",
   'console.error("[omc-slim]", ...args)',
   'console.log("[omc-slim]", ...args)',
   "corrupts the JSON payload"],
  ["additionalContext emitted",
   "JSON.stringify({ systemMessage: message, suppressOutput: true })",
   'JSON.stringify({ systemMessage: message, suppressOutput: true, hookSpecificOutput: { additionalContext: "x" } })',
   "injects into the session prompt instead of telling the user"],
  ["continue:false emitted",
   "JSON.stringify({ suppressOutput: true })",
   'JSON.stringify({ suppressOutput: true, continue: false, stopReason: "x" })',
   "halts the session at startup while exiting 0"],
  ["exit code 1",
   "process.exit(0);\n}",
   "process.exit(1);\n}",
   "breaks 'always exits 0', on the hook that runs before the first turn"],
  ["suppressOutput dropped",
   "suppressOutput: true }",
   "}",
   "raw JSON may surface to the user"],
  ["a custom style directory is ignored",
   'if (typeof entry === "string" && entry.trim()) dirs.push(entry.replace(/^\\.\\//, ""));',
   "",
   "misses every plugin that does not use the default directory"],
  ["the install path is looked up by the bare name",
   "const root = paths.get(key);",
   "const root = paths.get(bareName(key));",
   "no plugin ever resolves, and the hook goes silent for good"],
  ["the session source is ignored",
   'if (source !== "startup" && source !== "resume") {',
   "if (false) {",
   "repeats the same warning at every compaction until people ignore it"],
  ["the declared style name is ignored",
   'if (declaredName) return declaredName[1].replace(/^["\']|["\']$/g, "");',
   "if (false) return declaredName[1];",
   "quotes a filename the user cannot find in /config"],
];

process.exit(
  runMutants({
    hook: join(HERE, "check-output-style.mjs"),
    test: join(HERE, "check-output-style.test.mjs"),
    mutants: MUTANTS,
  }),
);
