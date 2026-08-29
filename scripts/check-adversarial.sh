#!/usr/bin/env bash
# Exit criterion 3, the half that can be checked without spending money.
#
# "Inertness is visible: a user whose style slot was stolen learns it from the
# product within one session." The hook suite proves that against FIXTURES. This
# proves it against a real second plugin — a real plugin.json, a real
# installed_plugins.json, a real enabledPlugins map, and the real hook binary,
# with nothing stubbed.
#
# The distinction earns its own script because the two failed differently in
# practice. A fixture asserts the shape the author imagined. This asserts the
# shape the filesystem actually produces: CRLF frontmatter, a style declared
# outside output-styles/, `force-for-plugin: yes` rather than `true`, and a stale
# duplicate install of omc-slim ITSELF, which is a rival the hook exempted by
# name until v0.9.2.
#
# What it cannot reach: the other half of criterion 3, a session whose Agent tool
# is gated. That needs a live run, and a live run costs money.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SB="$(mktemp -d)"
trap 'rm -rf "$SB"' EXIT
pass=0; fail=0

mkdir -p "$SB/cfg/plugins" "$SB/rival/output-styles" "$SB/rival/.claude-plugin" \
         "$SB/rival/custom" "$SB/dup/output-styles" "$SB/dup/.claude-plugin" "$SB/proj"
printf '{"name":"focus-mode","version":"1.0.0"}' > "$SB/rival/.claude-plugin/plugin.json"
printf '{"name":"omc-slim","version":"0.0.1"}'   > "$SB/dup/.claude-plugin/plugin.json"
cp "$ROOT/output-styles/omc-slim.md" "$SB/dup/output-styles/"

settings() { printf '{ "enabledPlugins": { "omc-slim@omc-slim": true, %s } }' "$1" > "$SB/cfg/settings.json"; }
installed() { printf '{ "plugins": { "omc-slim@omc-slim": [{"installPath":"%s"}], %s } }' "$ROOT" "$1" \
    > "$SB/cfg/plugins/installed_plugins.json"; }
hook() {
  printf '{"source":"startup","cwd":"%s"}' "$SB/proj" \
    | CLAUDE_CONFIG_DIR="$SB/cfg" node "$ROOT/hooks/check-output-style.mjs" \
    | python3 -c 'import json,sys; print(json.load(sys.stdin).get("systemMessage",""))'
}
check() {
  local name="$1" expect="$2" got; got="$(hook)"
  if [ "$expect" = "SILENT" ]; then
    [ -z "$got" ] && { printf 'PASS  %s\n' "$name"; pass=$((pass+1)); return; }
    printf 'FAIL  %s\n        expected silence, got: %s\n' "$name" "${got:0:90}"; fail=$((fail+1)); return
  fi
  if printf '%s' "$got" | grep -qF -- "$expect"; then
    printf 'PASS  %s\n' "$name"; pass=$((pass+1))
  else
    printf 'FAIL  %s\n        expected to contain: %s\n        got: %s\n' "$name" "$expect" "${got:0:90}"
    fail=$((fail+1))
  fi
}

installed '"focus-mode@third-party": [{"installPath":"'"$SB"'/rival"}]'
settings '"focus-mode@third-party": true'

printf -- '---\nname: focus-mode\ndescription: x\nforce-for-plugin: yes\n---\nbrief.\n' > "$SB/rival/output-styles/f.md"
check "a real rival forcing a style is named" "focus-mode"
check "'force-for-plugin: yes' counts, not only 'true'" "focus-mode (focus-mode)"

printf -- '---\r\nname: crlf-style\r\ndescription: x\r\nforce-for-plugin: true\r\n---\r\nx\r\n' > "$SB/rival/output-styles/f.md"
check "CRLF frontmatter does not defeat the scan" "crlf-style"

rm -f "$SB/rival/output-styles/f.md"
printf -- '---\nname: custom-loc\ndescription: x\nforce-for-plugin: TRUE\n---\nx\n' > "$SB/rival/custom/s.md"
python3 -c "
import json,sys
p=sys.argv[1]; d=json.load(open(p)); d['outputStyles']='./custom'; json.dump(d,open(p,'w'))
" "$SB/rival/.claude-plugin/plugin.json"
check "a style declared outside output-styles/ is still found" "custom-loc"

settings '"focus-mode@third-party": false'
check "a rival disabled locally goes quiet" "SILENT"

installed '"omc-slim@other-market": [{"installPath":"'"$SB"'/dup"}]'
settings '"omc-slim@other-market": true'
check "a stale duplicate of omc-slim itself is reported" "omc-slim (omc-slim)"
check "and it names WHICH install, or the warning is unactionable" "$SB/dup"

mv "$SB/cfg/settings.json" "$SB/cfg/off"
check "no settings file: abstain rather than guess" "SILENT"
mv "$SB/cfg/off" "$SB/cfg/settings.json"

# The negative control. Every check above uses grep -qF, so without this the
# whole suite could be passing on an incidental match and could not tell.
if printf '%s' "focus-mode" | grep -qF -- "nonesuch"; then
  printf 'FAIL  negative control matched a string that is not there\n'; fail=$((fail+1))
else
  printf 'PASS  negative control did not match, so a match means something\n'; pass=$((pass+1))
fi

printf '\n%d/%d passed\n' "$pass" "$((pass+fail))"
[ "$fail" -eq 0 ]
