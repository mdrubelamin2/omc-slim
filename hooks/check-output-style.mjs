#!/usr/bin/env node
/**
 * omc-slim — SessionStart forced-output-style collision check.
 *
 * omc-slim is an output style. Everything the orchestrator does — the roster,
 * the delegation contract, the register — lives in `output-styles/omc-slim.md`
 * and reaches the model only because `force-for-plugin: true` makes Claude Code
 * apply it. Lose that, and the plugin installs inert: the agents still load and
 * nothing routes work to them.
 *
 * Claude Code resolves it like this (read out of the 2.1.246 binary, same shape
 * in 2.1.239, 2.1.243 and 2.1.245):
 *
 *   let t = Object.values(e).filter(s => s.source === "plugin" && s.forceForPlugin === true);
 *   let n = t[0];
 *   if (n) { ...; return n; }
 *   let o = al()?.outputStyle || U8;
 *   return e[o] ?? null;
 *
 * Two things follow, and this hook exists because of the second.
 *
 * FIRST: the user's own `outputStyle` setting is never consulted while any
 * plugin forces a style. Verified directly — a project pinned to `Explanatory`,
 * omc-slim enabled, effective style `omc-slim:omc-slim`. So "I changed my
 * output style" cannot be what disabled the orchestrator, and this hook does
 * not check for it.
 *
 * SECOND: `t[0]`. When two plugins both force a style, one wins on plugin load
 * order and the other loses in silence. Claude Code logs
 * `Multiple plugins have forced output styles: … Using: X` at WARN level, which
 * no user sees. That is the whole failure: a plugin installed for an unrelated
 * reason takes the slot, omc-slim's prompt never loads, and the only symptom is
 * that the orchestrator stops orchestrating.
 *
 * So the hook does not try to learn which style won — the SessionStart payload
 * carries five fields and none of them is the output style (session_id,
 * transcript_path, cwd, hook_event_name, source; captured from a live run).
 * It reads the CAUSE off disk instead: another enabled plugin that also sets
 * `force-for-plugin`. That is a condition, not a verdict, so the message says
 * "may" and hands over the command that settles it.
 *
 * Deliberately advisory, like the SubagentStop hook beside it: `systemMessage`
 * only, never `hookSpecificOutput.additionalContext`, and always exit 0. A guard
 * that can break a session is worse than the thing it guards against.
 *
 * Set OMC_SLIM_DEBUG=1 to trace on stderr.
 */

import { readFileSync, readdirSync, lstatSync } from "node:fs";
import { join, basename } from "node:path";
import { homedir } from "node:os";

/** Our own plugin key, as it appears in `enabledPlugins` and installed_plugins.json. */
const SELF = "omc-slim";

/**
 * Wall-clock budget for the whole disk scan, well inside the 5 s declared in
 * hooks.json. A SessionStart hook runs before the user's first turn, so a slow
 * one is felt directly — this is the one hook where the budget is about the
 * person waiting, not about a pathological input.
 *
 * OMC_SLIM_STYLE_BUDGET_MS overrides it, so the test can set 0 and prove the
 * deadline is wired. Blank reads as unset: `Number("")` is 0, and an
 * exported-but-empty variable would otherwise expire the deadline before the
 * first read and mute the hook permanently. That exact bug shipped in the
 * sibling hook once; it is not going to ship twice.
 */
const BUDGET_MS = (() => {
  const raw = process.env.OMC_SLIM_STYLE_BUDGET_MS;
  if (raw === undefined || raw.trim() === "") return 1500;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : 1500;
})();

/** Cap on a single output-style file. Claude Code's own limit is 1 MiB. */
const MAX_STYLE_BYTES = 1024 * 1024;

/** Cap on style files inspected per plugin. A plugin shipping more is not our problem. */
const MAX_STYLES_PER_PLUGIN = 20;

/**
 * One predicate for both scan loops, deliberately.
 *
 * The budget is checked in two places — once per plugin and once per style file
 * — and a separate `Date.now() >= deadline` in each meant no single mutation
 * could disable the deadline, so the mutation suite could not prove it was
 * wired at all. One function is one thing to break, and therefore one thing the
 * harness can catch.
 */
function expired(deadline) {
  return Date.now() >= deadline;
}

function debug(...args) {
  if (process.env.OMC_SLIM_DEBUG === "1") console.error("[omc-slim]", ...args);
}

/** Root of the user's Claude configuration. Overridable so the test can sandbox it. */
function claudeHome() {
  return process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude");
}

function readJson(path) {
  try {
    const st = lstatSync(path);
    if (!st.isFile() || st.size > MAX_STYLE_BYTES) return null;
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

/**
 * Which plugins are enabled, as `plugin@marketplace` keys.
 *
 * Merged across the settings files that can carry `enabledPlugins`, nearest
 * last, matching how Claude Code layers them. A plugin explicitly set to false
 * anywhere later wins, so disabling one locally suppresses the warning rather
 * than leaving a false alarm the user cannot silence.
 *
 * Returns null when no settings file names any plugin. That is "cannot tell",
 * not "none enabled" — the caller stays silent, because a startup warning built
 * on a guess is worse than no warning at all.
 */
function enabledPlugins(cwd) {
  const files = [
    join(claudeHome(), "settings.json"),
    join(cwd, ".claude", "settings.json"),
    join(cwd, ".claude", "settings.local.json"),
  ];
  const merged = new Map();
  let sawAny = false;
  for (const file of files) {
    const data = readJson(file);
    const map = data && data.enabledPlugins;
    if (!map || typeof map !== "object") continue;
    sawAny = true;
    for (const [key, value] of Object.entries(map)) merged.set(key, value === true);
  }
  if (!sawAny) return null;
  return new Set([...merged].filter(([, on]) => on).map(([key]) => key));
}

/** `plugin@marketplace` -> install path, from the manifest Claude Code maintains. */
function installPaths() {
  const data = readJson(join(claudeHome(), "plugins", "installed_plugins.json"));
  const plugins = data && data.plugins;
  const out = new Map();
  if (!plugins || typeof plugins !== "object") return out;
  for (const [key, entries] of Object.entries(plugins)) {
    // The value is an array — one entry per scope. Any of them is enough to
    // locate the output styles, and they carry the same plugin content.
    const list = Array.isArray(entries) ? entries : [entries];
    for (const entry of list) {
      if (entry && typeof entry.installPath === "string") {
        out.set(key, entry.installPath);
        break;
      }
    }
  }
  return out;
}

/**
 * Does this plugin ship an output style with `force-for-plugin` set?
 *
 * Returns the style's declared name, or null. Only the frontmatter is parsed,
 * and only far enough to answer — this runs before the user's first turn.
 */
function forcedStyleName(pluginRoot, deadline) {
  // A plugin may point `outputStyles` somewhere other than the default
  // directory, exactly as it may for agents and skills, and the manifest accepts
  // one path or a list — Claude Code carries both an `outputStylesPath` and an
  // `outputStylesPaths`. Reading it costs one stat and avoids missing the case
  // entirely. The default directory is always searched too: a manifest that
  // names an extra location adds to it rather than replacing it.
  const manifest = readJson(join(pluginRoot, ".claude-plugin", "plugin.json"));
  const declared = manifest ? manifest.outputStyles : undefined;
  const dirs = ["output-styles"];
  for (const entry of Array.isArray(declared) ? declared : [declared]) {
    if (typeof entry === "string" && entry.trim()) dirs.push(entry.replace(/^\.\//, ""));
  }

  const files = [];
  for (const rel of dirs) {
    const dir = join(pluginRoot, rel);
    let names;
    try {
      names = readdirSync(dir).filter((n) => n.endsWith(".md"));
    } catch {
      continue;
    }
    for (const name of names) files.push(join(dir, name));
  }
  if (files.length === 0) return null;

  for (const file of files.slice(0, MAX_STYLES_PER_PLUGIN)) {
    if (expired(deadline)) {
      debug("budget exhausted while scanning", pluginRoot);
      return null;
    }
    let text;
    try {
      const st = lstatSync(file);
      if (!st.isFile() || st.size > MAX_STYLE_BYTES) continue;
      text = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    if (!text.startsWith("---")) continue;
    const end = text.indexOf("\n---", 3);
    if (end === -1) continue;
    const frontmatter = text.slice(3, end);
    // Match the key only at the start of a line. Nested inside another block it
    // is not the key Claude Code reads, and matching it anywhere would report a
    // plugin that merely mentions the flag in a description.
    if (!/^force-for-plugin[ \t]*:[ \t]*(true|yes|on|1)[ \t]*$/im.test(frontmatter)) {
      continue;
    }
    // Claude Code names the style from `name:`, falling back to the basename.
    // Mirroring that keeps the warning quoting a string the user can actually
    // find in `/config`.
    const declaredName = /^name[ \t]*:[ \t]*(.+?)[ \t]*$/im.exec(frontmatter);
    if (declaredName) return declaredName[1].replace(/^["']|["']$/g, "");
    return basename(file, ".md");
  }
  return null;
}

/** Plugin key -> forced style name, for every enabled plugin that forces one. */
function forcedStyles(cwd) {
  const enabled = enabledPlugins(cwd);
  if (enabled === null || enabled.size === 0) {
    debug("cannot tell: no enabledPlugins map found");
    return null;
  }
  const paths = installPaths();
  if (paths.size === 0) {
    debug("cannot tell: no install paths");
    return null;
  }

  const deadline = Date.now() + BUDGET_MS;
  const found = new Map();
  for (const key of enabled) {
    if (expired(deadline)) {
      debug("cannot tell: budget exhausted", found.size, "scanned");
      return null;
    }
    const root = paths.get(key);
    if (!root) continue;
    const style = forcedStyleName(root, deadline);
    if (style) found.set(key, style);
  }
  return found;
}

/** The plugin key's bare name — `omc-slim@omc-slim` is `omc-slim`. */
function bareName(key) {
  const at = key.indexOf("@");
  return at === -1 ? key : key.slice(0, at);
}

function readStdin() {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function main() {
  const input = readStdin();
  let data = {};
  if (input.trim()) {
    try {
      data = JSON.parse(input);
    } catch {
      return emit(null);
    }
  }

  // SessionStart also fires on `clear` and `compact`, which are the same session
  // continuing. The collision it reports cannot change without a restart, so
  // firing on those would repeat one warning at every compaction — and a warning
  // people learn to scroll past is worse than no warning.
  const source = typeof data.source === "string" ? data.source : "startup";
  if (source !== "startup" && source !== "resume") {
    debug("not a fresh session:", source);
    return emit(null);
  }

  const cwd = typeof data.cwd === "string" ? data.cwd : process.cwd();
  const found = forcedStyles(cwd);
  if (found === null) return emit(null);

  const rivals = [...found].filter(([key]) => bareName(key) !== SELF);
  debug("forced styles:", [...found.keys()].join(", ") || "(none)");

  // omc-slim itself missing from the map is NOT reported. It is the normal state
  // when the plugin runs from --plugin-dir during development, where there is no
  // cache entry to find, and a hook that cries wolf every dev session is a hook
  // people turn off.
  if (rivals.length === 0) return emit(null);

  const names = rivals.map(([key, style]) => `${bareName(key)} (${style})`).join(", ");
  return emit(
    `omc-slim: ${names} also forces an output style. Claude Code applies only one, ` +
      `picks it by plugin load order, and reports the loss at a log level you never see. ` +
      `If the orchestrator is not routing work to specialists, check which style won: ` +
      `claude -p "One line: which output style is active?"`,
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
