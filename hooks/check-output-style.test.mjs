#!/usr/bin/env node
/**
 * omc-slim — check-output-style harness
 *
 * Runs check-output-style.mjs as a child process against eighteen cases and
 * checks only its observable contract (exit code / stdout JSON / stderr):
 *
 *   1. a rival plugin forces a style     -> warns, and names it
 *   2. only omc-slim forces one          -> silent
 *   3. rival installed but not enabled   -> silent
 *   4. rival enabled with no install path -> silent
 *   5. no enabledPlugins anywhere        -> cannot tell, silent
 *   6. malformed stdin                   -> no crash, silent
 *   7. style file without the flag       -> silent
 *   8. the flag appears in the BODY only -> silent; frontmatter is the contract
 *   9. the flag is indented under a key   -> silent; only a top-level key counts
 *  10. budget forced to 0                -> abstains, silent; never guesses
 *  11. blank OMC_SLIM_STYLE_BUDGET_MS    -> reads as unset, still warns
 *  12. non-numeric budget                -> falls back to the default, warns
 *  13. OMC_SLIM_DEBUG=1                  -> traces on stderr, stdout stays JSON
 *  14. project settings disable the rival -> silent; the nearest layer wins
 *  15. rival declares a custom style dir  -> still found
 *  16. the style dir is missing entirely  -> silent, no crash
 *  17. SessionStart source is "compact"   -> silent; one warning per session
 *  18. two rivals                         -> both named
 *
 * Every case builds a whole fake Claude home — settings, installed_plugins.json
 * and plugin trees — under a temp dir, and points the hook at it with
 * CLAUDE_CONFIG_DIR. Nothing reads the developer's real configuration, so the
 * result does not depend on which plugins happen to be installed here.
 *
 * Self-contained: no dependencies beyond node built-ins.
 *
 * Run: node hooks/check-output-style.test.mjs
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// The mutation runner points this at a throwaway copy, so a mutant never has to
// be written into the tracked hook.
const HOOK =
  process.env.OMC_SLIM_HOOK_PATH ??
  join(dirname(fileURLToPath(import.meta.url)), "check-output-style.mjs");

/** The only two fields the hook may emit. Anything else is a contract breach. */
const ALLOWED_FIELDS = new Set(["systemMessage", "suppressOutput"]);

// --- fixture builders ---------------------------------------------------------

/**
 * A plugin tree under <root>/plugins-store/<key>, returned as an install path.
 *
 * `style` is the frontmatter body of output-styles/style.md, written verbatim so
 * a case can plant a malformed or misplaced key. Passing null ships no style
 * directory at all.
 */
function plantPlugin(root, key, style, { dir = "output-styles", manifest } = {}) {
  const installPath = join(root, "plugins-store", key);
  mkdirSync(installPath, { recursive: true });
  if (manifest !== undefined) {
    mkdirSync(join(installPath, ".claude-plugin"), { recursive: true });
    writeFileSync(
      join(installPath, ".claude-plugin", "plugin.json"),
      JSON.stringify(manifest),
    );
  }
  if (style !== null) {
    mkdirSync(join(installPath, dir), { recursive: true });
    writeFileSync(join(installPath, dir, "style.md"), style);
  }
  return installPath;
}

/** The ordinary shape: frontmatter with a name and the flag set. */
function forcedStyle(name) {
  return `---\nname: ${name}\ndescription: whatever\nforce-for-plugin: true\n---\n\n# Body\n`;
}

/** Frontmatter with a name and no flag. */
function plainStyle(name) {
  return `---\nname: ${name}\ndescription: whatever\n---\n\n# Body\n`;
}

function writeSettings(dir, enabledPlugins) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "settings.json"),
    JSON.stringify({ enabledPlugins }, null, 1),
  );
}

function writeInstalled(configDir, paths) {
  mkdirSync(join(configDir, "plugins"), { recursive: true });
  const plugins = {};
  for (const [key, installPath] of Object.entries(paths)) {
    plugins[key] = [{ scope: "user", installPath, version: "1.0.0" }];
  }
  writeFileSync(
    join(configDir, "plugins", "installed_plugins.json"),
    JSON.stringify({ version: 2, plugins }, null, 1),
  );
}

/**
 * The common world: omc-slim forcing its style, plus whatever else a case wants.
 *
 * Returns the config dir and the project cwd, so a case can add project-level
 * settings on top.
 */
function buildWorld(root, { extraPlugins = {}, enabled, projectEnabled } = {}) {
  const configDir = join(root, "config");
  const project = join(root, "project");
  mkdirSync(project, { recursive: true });

  const paths = {
    "omc-slim@omc-slim": plantPlugin(root, "omc-slim", forcedStyle("omc-slim")),
  };
  for (const [key, spec] of Object.entries(extraPlugins)) {
    paths[key] = plantPlugin(root, key.replace(/[@/]/g, "_"), spec.style, spec.options);
  }
  // A case may name a plugin that is enabled but was never installed. Those keys
  // are dropped here so the hook has to survive the mismatch.
  for (const key of Object.keys(paths)) {
    if (extraPlugins[key] && extraPlugins[key].uninstalled) delete paths[key];
  }
  writeInstalled(configDir, paths);

  const defaultEnabled = Object.fromEntries(
    ["omc-slim@omc-slim", ...Object.keys(extraPlugins)].map((k) => [k, true]),
  );
  writeSettings(configDir, enabled ?? defaultEnabled);
  if (projectEnabled) {
    mkdirSync(join(project, ".claude"), { recursive: true });
    writeFileSync(
      join(project, ".claude", "settings.local.json"),
      JSON.stringify({ enabledPlugins: projectEnabled }),
    );
  }
  return { configDir, project };
}

function payload(cwd) {
  return JSON.stringify({
    session_id: "test-session",
    transcript_path: join(cwd, "transcript.jsonl"),
    cwd,
    hook_event_name: "SessionStart",
    source: "startup",
  });
}

// --- runner -------------------------------------------------------------------

function runHook(build) {
  return spawnHook(build, "");
}

/** The same, with tracing on: only this one tolerates output on stderr. */
function runHookWithDebug(build) {
  return spawnHook(build, "1");
}

/** The same, with the budget forced to 0 so the deadline fires at once. */
function runHookWithNoBudget(build) {
  return spawnHook(build, "", { OMC_SLIM_STYLE_BUDGET_MS: "0" });
}

/** The same, with the seam exported but EMPTY — the shape a shell hands you. */
function runHookWithBlankBudget(build) {
  return spawnHook(build, "", { OMC_SLIM_STYLE_BUDGET_MS: "" });
}

/** The same, with a value that is not a number at all. */
function runHookWithJunkBudget(build) {
  return spawnHook(build, "", { OMC_SLIM_STYLE_BUDGET_MS: "soon" });
}

function spawnHook(build, debugFlag, extraEnv = {}) {
  const root = mkdtempSync(join(tmpdir(), "omc-slim-style-"));
  try {
    const { stdin, configDir } = build(root);
    const res = spawnSync(process.execPath, [HOOK], {
      input: stdin,
      encoding: "utf8",
      // The production budget: `timeout: 5` seconds in hooks.json.
      timeout: 5_000,
      env: {
        ...process.env,
        OMC_SLIM_DEBUG: debugFlag,
        CLAUDE_CONFIG_DIR: configDir,
        ...extraEnv,
      },
    });
    if (res.error) throw res.error;
    return {
      status: res.status,
      stdout: res.stdout || "",
      stderr: res.stderr || "",
    };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function parseStdout(stdout) {
  try {
    return JSON.parse(stdout);
  } catch {
    return null;
  }
}

/** True of every case: exit 0, JSON stdout, suppressOutput, nothing else. */
function outputViolation(res) {
  if (res.status !== 0) return `expected exit 0, got ${res.status}`;
  const out = parseStdout(res.stdout);
  if (!out) return `expected JSON on stdout, got: ${res.stdout || "(empty)"}`;
  if (out.suppressOutput !== true)
    return `expected suppressOutput true, got ${out.suppressOutput}`;
  // The key set, not a subset. `hookSpecificOutput.additionalContext` injects
  // into the session prompt and `continue: false` halts the session, and both do
  // it while exiting 0 — no exit-code assertion covers either.
  const forbidden = Object.keys(out).filter((key) => !ALLOWED_FIELDS.has(key));
  if (forbidden.length)
    return `hook emitted forbidden field(s): ${forbidden.join(", ")}`;
  return null;
}

/** The above plus silence on stderr — every case except the debug one. */
function contractViolation(res) {
  if (res.stderr !== "") return `expected empty stderr, got: ${res.stderr}`;
  return outputViolation(res);
}

function expectSilence(res) {
  const violation = contractViolation(res);
  if (violation) return violation;
  const out = parseStdout(res.stdout);
  if (out.systemMessage !== undefined)
    return `expected silence, got: ${out.systemMessage}`;
  return null;
}

/** A warning naming each rival, and never naming omc-slim as the rival. */
function expectWarningNaming(...names) {
  return (res) => {
    const violation = contractViolation(res);
    if (violation) return violation;
    const { systemMessage } = parseStdout(res.stdout);
    if (typeof systemMessage !== "string")
      return "expected a systemMessage, got none";
    for (const name of names) {
      if (!systemMessage.includes(name))
        return `systemMessage did not name ${name}: ${systemMessage}`;
    }
    // The warning exists to tell the user which OTHER plugin is competing.
    // Naming ourselves as the rival is the one wording that would send them
    // chasing the plugin that is working.
    if (/\bomc-slim \(/.test(systemMessage))
      return `systemMessage names omc-slim as a rival: ${systemMessage}`;
    return null;
  };
}

// --- cases --------------------------------------------------------------------

const RIVAL = { style: forcedStyle("Loud") };

const cases = [
  {
    name: "a rival plugin forcing a style is reported by name",
    run: () =>
      runHook((root) => {
        const { configDir, project } = buildWorld(root, {
          extraPlugins: { "loudplugin@market": RIVAL },
        });
        return { stdin: payload(project), configDir };
      }),
    check: expectWarningNaming("loudplugin", "Loud"),
  },
  {
    name: "omc-slim alone forcing a style stays silent",
    run: () =>
      runHook((root) => {
        const { configDir, project } = buildWorld(root);
        return { stdin: payload(project), configDir };
      }),
    check: expectSilence,
  },
  {
    name: "a rival that is installed but not enabled stays silent",
    run: () =>
      runHook((root) => {
        const { configDir, project } = buildWorld(root, {
          extraPlugins: { "loudplugin@market": RIVAL },
          enabled: { "omc-slim@omc-slim": true, "loudplugin@market": false },
        });
        return { stdin: payload(project), configDir };
      }),
    check: expectSilence,
  },
  {
    name: "a rival enabled with no install path stays silent",
    run: () =>
      runHook((root) => {
        const { configDir, project } = buildWorld(root, {
          extraPlugins: { "ghost@market": { ...RIVAL, uninstalled: true } },
        });
        return { stdin: payload(project), configDir };
      }),
    check: expectSilence,
  },
  {
    name: "no enabledPlugins anywhere reads as cannot-tell, not as none",
    run: () =>
      runHook((root) => {
        const { configDir, project } = buildWorld(root, {
          extraPlugins: { "loudplugin@market": RIVAL },
        });
        // Remove the settings file the world just wrote. A hook that treats a
        // missing map as "nothing enabled" is silent here for the wrong reason,
        // so this case only proves the contract alongside case 1.
        rmSync(join(configDir, "settings.json"), { force: true });
        return { stdin: payload(project), configDir };
      }),
    check: expectSilence,
  },
  {
    name: "malformed stdin does not crash the session",
    run: () =>
      runHook((root) => {
        const { configDir } = buildWorld(root, {
          extraPlugins: { "loudplugin@market": RIVAL },
        });
        return { stdin: "{not json", configDir };
      }),
    check: expectSilence,
  },
  {
    name: "a style without the flag is not a rival",
    run: () =>
      runHook((root) => {
        const { configDir, project } = buildWorld(root, {
          extraPlugins: { "quietplugin@market": { style: plainStyle("Quiet") } },
        });
        return { stdin: payload(project), configDir };
      }),
    check: expectSilence,
  },
  {
    name: "the flag in the body rather than the frontmatter is not a rival",
    run: () =>
      runHook((root) => {
        const { configDir, project } = buildWorld(root, {
          extraPlugins: {
            "docsplugin@market": {
              // The line must be a valid top-level key ON ITS OWN LINE, below
              // the frontmatter. An inline mention ("set force-for-plugin: true
              // to force it") is rejected by the line anchors alone, so it
              // passes whether the hook reads the frontmatter or the whole file
              // — and the mutation suite proved that fixture was passing for the
              // wrong reason.
              style:
                "---\nname: Docs\n---\n\nAdd this to your frontmatter:\n\nforce-for-plugin: true\n\nand Claude Code applies it.\n",
            },
          },
        });
        return { stdin: payload(project), configDir };
      }),
    check: expectSilence,
  },
  {
    name: "the flag indented under another key is not a top-level key",
    run: () =>
      runHook((root) => {
        const { configDir, project } = buildWorld(root, {
          extraPlugins: {
            "nestedplugin@market": {
              style: "---\nname: Nested\nmeta:\n  force-for-plugin: true\n---\n\n# Body\n",
            },
          },
        });
        return { stdin: payload(project), configDir };
      }),
    check: expectSilence,
  },
  {
    name: "a scan over its deadline abstains rather than guessing",
    run: () =>
      runHookWithNoBudget((root) => {
        const { configDir, project } = buildWorld(root, {
          extraPlugins: { "loudplugin@market": RIVAL },
        });
        return { stdin: payload(project), configDir };
      }),
    check: expectSilence,
  },
  {
    name: "a blank style budget reads as unset, not as zero",
    run: () =>
      runHookWithBlankBudget((root) => {
        const { configDir, project } = buildWorld(root, {
          extraPlugins: { "loudplugin@market": RIVAL },
        });
        return { stdin: payload(project), configDir };
      }),
    check: expectWarningNaming("loudplugin"),
  },
  {
    name: "a non-numeric style budget falls back to the default",
    run: () =>
      runHookWithJunkBudget((root) => {
        const { configDir, project } = buildWorld(root, {
          extraPlugins: { "loudplugin@market": RIVAL },
        });
        return { stdin: payload(project), configDir };
      }),
    check: expectWarningNaming("loudplugin"),
  },
  {
    name: "OMC_SLIM_DEBUG traces on stderr and leaves stdout valid JSON",
    run: () =>
      runHookWithDebug((root) => {
        const { configDir, project } = buildWorld(root, {
          extraPlugins: { "loudplugin@market": RIVAL },
        });
        return { stdin: payload(project), configDir };
      }),
    check: (res) => {
      const violation = outputViolation(res);
      if (violation) return violation;
      if (!res.stderr.includes("[omc-slim]"))
        return `expected a debug trace on stderr, got: ${res.stderr || "(empty)"}`;
      return null;
    },
  },
  {
    name: "project settings disabling a rival win over the user settings",
    run: () =>
      runHook((root) => {
        const { configDir, project } = buildWorld(root, {
          extraPlugins: { "loudplugin@market": RIVAL },
          projectEnabled: { "loudplugin@market": false },
        });
        return { stdin: payload(project), configDir };
      }),
    check: expectSilence,
  },
  {
    name: "a rival declaring a custom style directory is still found",
    run: () =>
      runHook((root) => {
        const { configDir, project } = buildWorld(root, {
          extraPlugins: {
            "customplugin@market": {
              style: forcedStyle("Custom"),
              options: {
                dir: "styles",
                manifest: { name: "customplugin", outputStyles: "./styles" },
              },
            },
          },
        });
        return { stdin: payload(project), configDir };
      }),
    check: expectWarningNaming("customplugin", "Custom"),
  },
  {
    name: "a plugin with no style directory at all does not crash the scan",
    run: () =>
      runHook((root) => {
        const { configDir, project } = buildWorld(root, {
          extraPlugins: { "bareplugin@market": { style: null } },
        });
        return { stdin: payload(project), configDir };
      }),
    check: expectSilence,
  },
  {
    name: "a compaction restart does not repeat the warning",
    run: () =>
      runHook((root) => {
        const { configDir, project } = buildWorld(root, {
          extraPlugins: { "loudplugin@market": RIVAL },
        });
        return {
          stdin: JSON.stringify({
            session_id: "test-session",
            cwd: project,
            hook_event_name: "SessionStart",
            source: "compact",
          }),
          configDir,
        };
      }),
    check: expectSilence,
  },
  {
    name: "two rivals are both named",
    run: () =>
      runHook((root) => {
        const { configDir, project } = buildWorld(root, {
          extraPlugins: {
            "loudplugin@market": RIVAL,
            "brashplugin@market": { style: forcedStyle("Brash") },
          },
        });
        return { stdin: payload(project), configDir };
      }),
    check: expectWarningNaming("loudplugin", "brashplugin"),
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
