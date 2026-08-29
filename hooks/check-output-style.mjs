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
 * So this hook reads the CAUSE off disk instead: another enabled plugin that also
 * sets `force-for-plugin`. That is a condition, not a verdict, so the message
 * says "may" and hands over the command that settles it.
 *
 * It does not read the EFFECT, and that is now a choice rather than a limit.
 * SessionStart still carries no output style — as of 2.1.251 the payload is
 * session_id, transcript_path, cwd, hook_event_name, source, plus agent_type,
 * model, session_title and four resume fields, and none of them is the style.
 * But two other surfaces do carry it: a StatusLine hook's stdin has
 * `output_style: {name}`, and the stream-json `system:init` frame and the
 * control-protocol `initialize` response carry `output_style` alongside
 * `available_output_styles` (all verified against 2.1.251, 2026-08-29).
 *
 * Adopting the StatusLine route would settle the question this hook can only
 * raise. It is not adopted here because a status line renders continuously
 * rather than once per session, and this plugin's cost pledge is about what runs
 * repeatedly. Recorded as an open decision rather than an impossibility, so no
 * later reader takes the silence for a dead end.
 *
 * Deliberately advisory, like the SubagentStop hook beside it: `systemMessage`
 * only, never `hookSpecificOutput.additionalContext`, and always exit 0. A guard
 * that can break a session is worse than the thing it guards against.
 *
 * Set OMC_SLIM_DEBUG=1 to trace on stderr.
 */

import { readFileSync, readdirSync, lstatSync, realpathSync } from "node:fs";
import { join, basename, dirname } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

/**
 * Our own plugin key, as it appears in `enabledPlugins` and
 * installed_plugins.json. Only the FALLBACK identity — see isSelf.
 */
const SELF = "omc-slim";

/**
 * Where this plugin is installed, symlink-resolved, or null if it cannot be told.
 *
 * The identity that matters is the path, not the name. A stale duplicate install
 * or a same-name fork from another marketplace is a genuine rival for the forced
 * style slot, and exempting it on its bare name let it take the slot in silence.
 *
 * This file's own location is the authority — hooks/<this file>, so the plugin
 * root is two levels up. That needs no environment and cannot be pointed at
 * another plugin, which `CLAUDE_PLUGIN_ROOT` could be: it is set by whichever
 * plugin's hook is running, and exempting the wrong install is precisely the
 * failure being fixed.
 *
 * OMC_SLIM_SELF_ROOT overrides it, the same seam OMC_SLIM_DEBUG and the budget
 * overrides use. The test needs it because the mutation runner executes a copy
 * of this file from a temp directory, where "two levels up" is the temp root.
 */
const SELF_ROOT = (() => {
  const override = process.env.OMC_SLIM_SELF_ROOT;
  const root =
    typeof override === "string" && override.trim() !== ""
      ? override
      : dirname(dirname(fileURLToPath(import.meta.url)));
  try {
    return realpathSync(root);
  } catch {
    return null;
  }
})();

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
 *
 * It records the expiry on the scan rather than only reporting it, so the two
 * call sites cannot end up disagreeing about whether the result is complete.
 * A partial result is still reportable — see forcedStyles — and it is only
 * reportable if something says it was partial.
 *
 * @param {{deadline: number, complete: boolean}} scan
 */
function expired(scan) {
  if (Date.now() < scan.deadline) return false;
  scan.complete = false;
  return true;
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
 * The style name this file declares if it forces itself on the session, else null.
 *
 * Only the frontmatter is parsed, and only far enough to answer — this runs
 * before the user's first turn.
 */
function forcedNameIn(file) {
  let text;
  try {
    const st = lstatSync(file);
    if (!st.isFile() || st.size > MAX_STYLE_BYTES) return null;
    text = readFileSync(file, "utf8");
  } catch {
    return null;
  }
  if (!text.startsWith("---")) return null;
  const end = text.indexOf("\n---", 3);
  if (end === -1) return null;
  const frontmatter = text.slice(3, end);
  // Match the key only at the start of a line. Nested inside another block it
  // is not the key Claude Code reads, and matching it anywhere would report a
  // plugin that merely mentions the flag in a description.
  if (!/^force-for-plugin[ \t]*:[ \t]*(true|yes|on|1)[ \t]*$/im.test(frontmatter)) {
    return null;
  }
  // Claude Code names the style from `name:`, falling back to the basename.
  // Mirroring that keeps the warning quoting a string the user can actually
  // find in `/config`.
  const declaredName = /^name[ \t]*:[ \t]*(.+?)[ \t]*$/im.exec(frontmatter);
  if (declaredName) return declaredName[1].replace(/^["']|["']$/g, "");
  return basename(file, ".md");
}

/**
 * Does this plugin ship an output style with `force-for-plugin` set?
 *
 * Returns the style's declared name, or null.
 */
function forcedStyleName(pluginRoot, scan) {
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
    const name = forcedNameIn(file);
    if (name !== null) return name;
    // Checked AFTER the file, not before it. A check at the top of the loop
    // fires having read nothing, so it can never hold evidence to hand back —
    // and handing back the evidence already in hand is the whole point of the
    // partial result. The cost is a bounded overrun: one more style file, itself
    // capped at MAX_STYLE_BYTES.
    if (expired(scan)) {
      debug("budget exhausted while scanning", pluginRoot);
      return null;
    }
  }
  return null;
}

/**
 * Every enabled plugin that forces an output style, with where it is installed.
 *
 * Returns `{ found, complete }`, or null when the world cannot be read at all.
 * `complete` is false when the time budget cut the scan short — the caller still
 * reports whatever rival is already in `found`, and says the list may be short.
 * Discarding it was silence with the evidence in hand.
 */
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

  const scan = { deadline: Date.now() + BUDGET_MS, complete: true };
  const found = new Map();
  for (const key of enabled) {
    const root = paths.get(key);
    if (root) {
      const style = forcedStyleName(root, scan);
      if (style) found.set(key, { style, root });
    }
    // After the plugin rather than before it, for the same reason as the inner
    // loop: a check that fires before any work has nothing to report.
    if (expired(scan)) {
      debug("budget exhausted after", found.size, "found");
      break;
    }
  }
  return { found, complete: scan.complete };
}

/** The plugin key's bare name — `omc-slim@omc-slim` is `omc-slim`. */
function bareName(key) {
  const at = key.indexOf("@");
  return at === -1 ? key : key.slice(0, at);
}

/**
 * Is this entry the plugin these hooks are running from?
 *
 * By install path, so a stale duplicate or a same-name fork at another path is
 * reported rather than exempted. Where either path cannot be resolved the bare
 * name is the fallback: dropping the exemption there would make every healthy
 * install warn about itself at startup, which is a worse failure than the
 * over-exemption being fixed here.
 */
function isSelf(key, installPath) {
  if (SELF_ROOT !== null) {
    try {
      return realpathSync(installPath) === SELF_ROOT;
    } catch {
      // fall through to the name
    }
  }
  return bareName(key) === SELF;
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
  const scanned = forcedStyles(cwd);
  if (scanned === null) return emit(null);

  const { found, complete } = scanned;
  const rivals = [...found].filter(([key, { root }]) => !isSelf(key, root));
  debug("forced styles:", [...found.keys()].join(", ") || "(none)");

  // omc-slim itself missing from the map is NOT reported. It is the normal state
  // when the plugin runs from --plugin-dir during development, where there is no
  // cache entry to find, and a hook that cries wolf every dev session is a hook
  // people turn off. A scan cut short before it found any rival is silent for
  // the same reason: nothing established, nothing to say.
  //
  // What a --plugin-dir session DOES now report is the INSTALLED omc-slim, when
  // one is enabled alongside the working tree. That is not the self-warning this
  // paragraph guards against — it is two distinct installs, both forcing a
  // style, one of which really does lose. Verified here: launched from the cache
  // path the hook is silent, launched from the working tree it names the cache
  // copy. Disable the installed plugin for the session to silence it, which is
  // the same remedy any other rival has.
  if (rivals.length === 0) return emit(null);

  // A rival sharing our own bare name — a stale duplicate install, or the cache
  // copy seen from a --plugin-dir session — renders as "omc-slim (omc-slim)",
  // which reads as the plugin warning about itself and gives the user nothing to
  // act on. The one datum that makes it actionable is already in hand: which
  // install. Only same-name rivals carry it, so the ordinary case stays short.
  const names = rivals
    .map(([key, { style, root }]) =>
      bareName(key) === SELF && root
        ? `${bareName(key)} (${style}) installed at ${root}`
        : `${bareName(key)} (${style})`,
    )
    .join(", ");
  const cutShort = complete
    ? ""
    : " That scan was cut short by its time budget, so there may be others it never reached.";
  return emit(
    `omc-slim: ${names} also forces an output style. Claude Code applies only one, ` +
      `picks it by plugin load order, and does not tell you which.` +
      cutShort +
      ` If the orchestrator is not routing work to specialists, check which style won: ` +
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
