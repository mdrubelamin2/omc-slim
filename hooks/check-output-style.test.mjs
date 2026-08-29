#!/usr/bin/env node
/**
 * omc-slim — check-output-style harness
 *
 * Runs check-output-style.mjs as a child process against twenty-four cases and
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
 *  10. budget expires before any rival    -> silent; nothing was established
 *  11. blank OMC_SLIM_STYLE_BUDGET_MS    -> reads as unset, still warns
 *  12. non-numeric budget                -> falls back to the default, warns
 *  13. OMC_SLIM_DEBUG=1                  -> traces on stderr, stdout stays JSON
 *  14. project settings disable the rival -> silent; the nearest layer wins
 *  15. rival declares a custom style dir  -> still found
 *  16. the style dir is missing entirely  -> silent, no crash
 *  17. SessionStart source is "compact"   -> silent; one warning per session
 *  18. two rivals                         -> both named
 *  19. a same-name plugin at another path -> reported; self-ID is by path
 *  20. self path unresolvable             -> falls back to the bare name, silent
 *  21. deadline expires holding a rival   -> reports it, and says it was cut short
 *  22. per-file deadline inside one plugin -> stops it running the budget out
 *  23. a symlinked settings.json          -> followed, not read as cannot-tell
 *  24. a rival's style file is a symlink   -> still found
 *
 * Every case builds a whole fake Claude home — settings, installed_plugins.json
 * and plugin trees — under a temp dir, and points the hook at it with
 * CLAUDE_CONFIG_DIR. `OMC_SLIM_SELF_ROOT` points at the fake omc-slim's install
 * path — the hook identifies itself by install path now, and in a real session
 * derives that from its own file location. Nothing reads the developer's real
 * configuration, so the result does not depend on which plugins happen to be
 * installed here.
 *
 * Self-contained: no dependencies beyond node built-ins.
 *
 * Run: node hooks/check-output-style.test.mjs
 */

import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  renameSync,
  symlinkSync,
  rmSync,
} from "node:fs";
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
 *
 * `alsoDir` / `alsoStyle` plant a SECOND style file in another directory. The
 * hook searches the default directory before any the manifest declares, so a
 * plugin built this way is scanned in a known order — which is what makes the
 * per-file deadline testable without depending on readdir order.
 *
 * `symlinkStyle` puts the style's contents outside the plugin and links to
 * them, which is what a plugin checked out through a symlinked worktree looks
 * like. `lstat` calls that link "not a file"; `stat` reads it.
 */
function plantPlugin(
  root,
  key,
  style,
  { dir = "output-styles", manifest, alsoDir, alsoStyle, symlinkStyle } = {},
) {
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
    const stylePath = join(installPath, dir, "style.md");
    if (symlinkStyle) {
      const source = join(root, `${key}-style-source.md`);
      writeFileSync(source, style);
      symlinkSync(source, stylePath);
    } else {
      writeFileSync(stylePath, style);
    }
  }
  if (alsoDir !== undefined) {
    mkdirSync(join(installPath, alsoDir), { recursive: true });
    writeFileSync(join(installPath, alsoDir, "style.md"), alsoStyle);
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
 * Returns the config dir, the project cwd, and where the fake omc-slim is
 * installed — `selfRoot`, which the runner hands the hook as
 * CLAUDE_PLUGIN_ROOT. The hook identifies itself by install path now, so
 * without that it would see the planted omc-slim as a same-name rival and warn
 * about it in every case.
 */
function buildWorld(root, { extraPlugins = {}, enabled, projectEnabled } = {}) {
  const configDir = join(root, "config");
  const project = join(root, "project");
  mkdirSync(project, { recursive: true });

  const selfRoot = plantPlugin(root, "omc-slim", forcedStyle("omc-slim"));
  const paths = { "omc-slim@omc-slim": selfRoot };
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
  return { configDir, project, selfRoot };
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
    const { stdin, configDir, selfRoot } = build(root);
    const res = spawnSync(process.execPath, [HOOK], {
      input: stdin,
      encoding: "utf8",
      // The production budget: `timeout: 5` seconds in hooks.json.
      timeout: 5_000,
      env: {
        ...process.env,
        OMC_SLIM_DEBUG: debugFlag,
        CLAUDE_CONFIG_DIR: configDir,
        // Where THIS plugin is installed. Without it the hook falls back to
        // its own file location, which under the mutation runner is a temp
        // sandbox — so the fake omc-slim would look like a same-name rival.
        OMC_SLIM_SELF_ROOT: selfRoot,
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

/**
 * The same, without the never-name-omc-slim guard.
 *
 * Exactly one case needs that guard lifted: a second plugin ALSO called
 * omc-slim, installed somewhere else. Naming it is the whole point there, so the
 * guard would reject the correct output.
 */
function expectWarningNamingAnyOf(...phrases) {
  return (res) => {
    const violation = contractViolation(res);
    if (violation) return violation;
    const { systemMessage } = parseStdout(res.stdout);
    if (typeof systemMessage !== "string")
      return "expected a systemMessage, got none";
    for (const phrase of phrases) {
      if (!systemMessage.includes(phrase))
        return `systemMessage did not say "${phrase}": ${systemMessage}`;
    }
    return null;
  };
}

/** The sentence the hook adds when the deadline stopped the scan early. */
const CUT_SHORT_PHRASE = "cut short by its time budget";

// --- cases --------------------------------------------------------------------

const RIVAL = { style: forcedStyle("Loud") };

const cases = [
  {
    name: "a rival plugin forcing a style is reported by name",
    run: () =>
      runHook((root) => {
        const { configDir, project, selfRoot } = buildWorld(root, {
          extraPlugins: { "loudplugin@market": RIVAL },
        });
        return { stdin: payload(project), configDir, selfRoot };
      }),
    check: expectWarningNaming("loudplugin", "Loud"),
  },
  {
    name: "omc-slim alone forcing a style stays silent",
    run: () =>
      runHook((root) => {
        const { configDir, project, selfRoot } = buildWorld(root);
        return { stdin: payload(project), configDir, selfRoot };
      }),
    check: expectSilence,
  },
  {
    name: "a rival that is installed but not enabled stays silent",
    run: () =>
      runHook((root) => {
        const { configDir, project, selfRoot } = buildWorld(root, {
          extraPlugins: { "loudplugin@market": RIVAL },
          enabled: { "omc-slim@omc-slim": true, "loudplugin@market": false },
        });
        return { stdin: payload(project), configDir, selfRoot };
      }),
    check: expectSilence,
  },
  {
    name: "a rival enabled with no install path stays silent",
    run: () =>
      runHook((root) => {
        const { configDir, project, selfRoot } = buildWorld(root, {
          extraPlugins: { "ghost@market": { ...RIVAL, uninstalled: true } },
        });
        return { stdin: payload(project), configDir, selfRoot };
      }),
    check: expectSilence,
  },
  {
    name: "no enabledPlugins anywhere reads as cannot-tell, not as none",
    run: () =>
      runHook((root) => {
        const { configDir, project, selfRoot } = buildWorld(root, {
          extraPlugins: { "loudplugin@market": RIVAL },
        });
        // Remove the settings file the world just wrote. A hook that treats a
        // missing map as "nothing enabled" is silent here for the wrong reason,
        // so this case only proves the contract alongside case 1.
        rmSync(join(configDir, "settings.json"), { force: true });
        return { stdin: payload(project), configDir, selfRoot };
      }),
    check: expectSilence,
  },
  {
    name: "malformed stdin does not crash the session",
    run: () =>
      runHook((root) => {
        const { configDir, selfRoot } = buildWorld(root, {
          extraPlugins: { "loudplugin@market": RIVAL },
        });
        return { stdin: "{not json", configDir, selfRoot };
      }),
    check: expectSilence,
  },
  {
    name: "a style without the flag is not a rival",
    run: () =>
      runHook((root) => {
        const { configDir, project, selfRoot } = buildWorld(root, {
          extraPlugins: { "quietplugin@market": { style: plainStyle("Quiet") } },
        });
        return { stdin: payload(project), configDir, selfRoot };
      }),
    check: expectSilence,
  },
  {
    name: "the flag in the body rather than the frontmatter is not a rival",
    run: () =>
      runHook((root) => {
        const { configDir, project, selfRoot } = buildWorld(root, {
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
        return { stdin: payload(project), configDir, selfRoot };
      }),
    check: expectSilence,
  },
  {
    name: "the flag indented under another key is not a top-level key",
    run: () =>
      runHook((root) => {
        const { configDir, project, selfRoot } = buildWorld(root, {
          extraPlugins: {
            "nestedplugin@market": {
              style: "---\nname: Nested\nmeta:\n  force-for-plugin: true\n---\n\n# Body\n",
            },
          },
        });
        return { stdin: payload(project), configDir, selfRoot };
      }),
    check: expectSilence,
  },
  {
    // The deadline fires after the first plugin, which here is omc-slim itself,
    // so the rival is never reached. Nothing found, nothing established, nothing
    // said. Its opposite number — a deadline that fires holding a rival — is the
    // last case in this file.
    name: "a scan whose deadline expires before any rival stays silent",
    run: () =>
      runHookWithNoBudget((root) => {
        const { configDir, project, selfRoot } = buildWorld(root, {
          extraPlugins: { "loudplugin@market": RIVAL },
        });
        return { stdin: payload(project), configDir, selfRoot };
      }),
    check: expectSilence,
  },
  {
    name: "a blank style budget reads as unset, not as zero",
    run: () =>
      runHookWithBlankBudget((root) => {
        const { configDir, project, selfRoot } = buildWorld(root, {
          extraPlugins: { "loudplugin@market": RIVAL },
        });
        return { stdin: payload(project), configDir, selfRoot };
      }),
    check: expectWarningNaming("loudplugin"),
  },
  {
    name: "a non-numeric style budget falls back to the default",
    run: () =>
      runHookWithJunkBudget((root) => {
        const { configDir, project, selfRoot } = buildWorld(root, {
          extraPlugins: { "loudplugin@market": RIVAL },
        });
        return { stdin: payload(project), configDir, selfRoot };
      }),
    check: expectWarningNaming("loudplugin"),
  },
  {
    name: "OMC_SLIM_DEBUG traces on stderr and leaves stdout valid JSON",
    run: () =>
      runHookWithDebug((root) => {
        const { configDir, project, selfRoot } = buildWorld(root, {
          extraPlugins: { "loudplugin@market": RIVAL },
        });
        return { stdin: payload(project), configDir, selfRoot };
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
        const { configDir, project, selfRoot } = buildWorld(root, {
          extraPlugins: { "loudplugin@market": RIVAL },
          projectEnabled: { "loudplugin@market": false },
        });
        return { stdin: payload(project), configDir, selfRoot };
      }),
    check: expectSilence,
  },
  {
    name: "a rival declaring a custom style directory is still found",
    run: () =>
      runHook((root) => {
        const { configDir, project, selfRoot } = buildWorld(root, {
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
        return { stdin: payload(project), configDir, selfRoot };
      }),
    check: expectWarningNaming("customplugin", "Custom"),
  },
  {
    name: "a plugin with no style directory at all does not crash the scan",
    run: () =>
      runHook((root) => {
        const { configDir, project, selfRoot } = buildWorld(root, {
          extraPlugins: { "bareplugin@market": { style: null } },
        });
        return { stdin: payload(project), configDir, selfRoot };
      }),
    check: expectSilence,
  },
  {
    name: "a compaction restart does not repeat the warning",
    run: () =>
      runHook((root) => {
        const { configDir, project, selfRoot } = buildWorld(root, {
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
          selfRoot,
        };
      }),
    check: expectSilence,
  },
  {
    name: "two rivals are both named",
    run: () =>
      runHook((root) => {
        const { configDir, project, selfRoot } = buildWorld(root, {
          extraPlugins: {
            "loudplugin@market": RIVAL,
            "brashplugin@market": { style: forcedStyle("Brash") },
          },
        });
        return { stdin: payload(project), configDir, selfRoot };
      }),
    check: expectWarningNaming("loudplugin", "brashplugin"),
  },
  {
    // C3. A stale duplicate install, or a same-name fork from another
    // marketplace, is a real competitor for the one forced-style slot. The
    // bare-name exemption let it take that slot in silence — the plugin that
    // stopped working and the plugin blamed for it were the same name, so
    // nothing was ever reported. Self-identification is by install path now, and
    // CLAUDE_PLUGIN_ROOT points at the OTHER one.
    name: "a same-name plugin installed elsewhere is still a rival",
    run: () =>
      runHook((root) => {
        const { configDir, project, selfRoot } = buildWorld(root, {
          extraPlugins: { "omc-slim@othermarket": { style: forcedStyle("Fork") } },
        });
        return { stdin: payload(project), configDir, selfRoot };
      }),
    check: expectWarningNamingAnyOf("omc-slim (Fork)"),
  },
  {
    // Where the running plugin's own path cannot be resolved there is nothing to
    // compare against, and the bare name is the fallback. Dropping the exemption
    // instead would make every healthy install warn about itself at startup,
    // which is a worse failure than the over-exemption being fixed. The rival
    // must still be named, so this cannot pass by going silent.
    name: "an unresolvable self path falls back to the bare-name exemption",
    run: () =>
      runHook((root) => {
        const { configDir, project } = buildWorld(root, {
          extraPlugins: { "loudplugin@market": RIVAL },
        });
        return {
          stdin: payload(project),
          configDir,
          selfRoot: join(root, "no-such-install-path"),
        };
      }),
    check: expectWarningNaming("loudplugin"),
  },
  {
    // C4. The scan used to throw away everything it had found the moment the
    // budget ran out — the debug line even printed the size of what it was
    // discarding. Silence with the evidence in hand.
    //
    // The rival is listed FIRST so it is the plugin scanned before the deadline
    // fires, and the budget is 0 so the deadline fires after exactly one plugin.
    // Deterministic, not timing-dependent. Two assertions, because the case has
    // to fail in both directions: the rival must be named (or the partial result
    // was discarded) AND the message must admit the scan was cut short (or the
    // deadline was never wired at all).
    name: "a deadline that expires holding a rival still reports it",
    run: () =>
      runHookWithNoBudget((root) => {
        const { configDir, project, selfRoot } = buildWorld(root, {
          extraPlugins: { "loudplugin@market": RIVAL },
          enabled: { "loudplugin@market": true, "omc-slim@omc-slim": true },
        });
        return { stdin: payload(project), configDir, selfRoot };
      }),
    check: expectWarningNaming("loudplugin", "Loud", CUT_SHORT_PHRASE),
  },
  {
    // The budget is checked in two places — per plugin and per style file — and
    // the outer one alone leaves a single plugin shipping many styles free to
    // run past the whole budget on its own. Only the inner check stops that, and
    // until this case existed nothing could tell whether it was wired.
    //
    // The plugin's forcing style sits in a manifest-declared directory, which
    // the hook searches AFTER the default one, so the plain style is always read
    // first. That ordering is the fixture's whole mechanism: with the inner
    // check in place the deadline fires between the two files and the plugin
    // yields nothing; without it, the second file is read and the rival is found.
    name: "the per-style-file deadline stops one plugin running the budget out",
    run: () =>
      runHookWithNoBudget((root) => {
        const { configDir, project, selfRoot } = buildWorld(root, {
          extraPlugins: {
            "slowplugin@market": {
              style: plainStyle("Quiet"),
              options: {
                manifest: { name: "slowplugin", outputStyles: "./styles" },
                alsoDir: "styles",
                alsoStyle: forcedStyle("Slow"),
              },
            },
          },
          enabled: { "slowplugin@market": true, "omc-slim@omc-slim": true },
        });
        return { stdin: payload(project), configDir, selfRoot };
      }),
    check: expectSilence,
  },
  {
    // The hook used to `lstat` every file it read, which reports the LINK
    // rather than its target — so a symlinked ~/.claude/settings.json, which is
    // what every dotfiles manager produces, failed `isFile()`, the enabled map
    // came back empty, and the hook decided it could not tell. Silent forever,
    // in the population most likely to be running several plugins at once.
    name: "a symlinked settings.json is followed, not read as 'cannot tell'",
    run: () =>
      runHook((root) => {
        const { configDir, project, selfRoot } = buildWorld(root, {
          extraPlugins: { "loudplugin@market": RIVAL },
        });
        const real = join(root, "dotfiles-settings.json");
        renameSync(join(configDir, "settings.json"), real);
        symlinkSync(real, join(configDir, "settings.json"));
        return { stdin: payload(project), configDir, selfRoot };
      }),
    check: expectWarningNaming("loudplugin", "Loud"),
  },
  {
    // The same fail-open one level down: a rival's style file reached through a
    // symlink was unreadable, so the rival was reported as not forcing a style
    // — the exact collision this hook exists to name, missed in silence.
    name: "a rival whose style file is a symlink is still found",
    run: () =>
      runHook((root) => {
        const { configDir, project, selfRoot } = buildWorld(root, {
          extraPlugins: {
            "loudplugin@market": { ...RIVAL, options: { symlinkStyle: true } },
          },
        });
        return { stdin: payload(project), configDir, selfRoot };
      }),
    check: expectWarningNaming("loudplugin", "Loud"),
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
