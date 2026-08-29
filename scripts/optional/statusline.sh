#!/usr/bin/env bash
# Optional. Shows whether omc-slim's output style is actually the one in force.
#
# WHY THIS EXISTS, and why it is not part of the plugin.
#
# A plugin cannot ship a status line: `statusLine` is a settings key, and the
# plugin manifest carries agents, skills, commands, workflows, hooks and output
# styles — not this. So it is here as a snippet you install yourself, or ignore.
#
# It answers a structural problem nothing else can. An output style is APPLIED,
# never INVOKED, so it emits no `skill_activated` telemetry and appears in no
# transcript as a thing that fired. That matters because of how people actually
# delete plugins: not when one fails, but months later during an audit, when they
# remove everything they cannot point at. The largest, most expensive, always-on
# component in this plugin is the only one that can never show up in the evidence
# its owner will use to decide whether to keep it.
#
# The status line is the one surface that carries the answer. Its stdin payload
# includes `output_style.name`, so it can report which style actually won the
# `force-for-plugin` race — the exact question `check-output-style.mjs` can only
# raise and never settle, because the SessionStart payload does not carry it.
#
# It costs zero model tokens. A status line is UI: nothing it prints enters the
# model's context, so "nothing injects on the tool-call path" is untouched.
#
# Install by adding to ~/.claude/settings.json:
#
#   { "statusLine": { "type": "command",
#                     "command": "/path/to/omc-slim/scripts/optional/statusline.sh" } }
set -uo pipefail

payload=$(cat)

field() {
  printf '%s' "$payload" | python3 -c "
import json,sys
try:
    d = json.load(sys.stdin)
except Exception:
    raise SystemExit(0)
cur = d
for key in sys.argv[1].split('.'):
    if not isinstance(cur, dict):
        raise SystemExit(0)
    cur = cur.get(key)
    if cur is None:
        raise SystemExit(0)
print(cur)
" "$1" 2>/dev/null
}

style=$(field output_style.name)
model=$(field model.display_name)
dir=$(basename "$(field workspace.current_dir)" 2>/dev/null)

# The whole point: distinguish "active" from "installed but not in force". A
# plugin that is enabled and NOT applied looks exactly like one that is working,
# and that silence is what this line breaks.
case "$style" in
  *omc-slim*) badge="omc-slim ●" ;;
  "")         badge="omc-slim ?" ;;   # no style field: an older build, or not reported
  *)          badge="omc-slim ✗ ($style won)" ;;
esac

printf '%s' "$badge"
[ -n "$model" ] && printf '  %s' "$model"
[ -n "$dir" ] && printf '  %s' "$dir"
