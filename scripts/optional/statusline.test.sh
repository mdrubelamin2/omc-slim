#!/usr/bin/env bash
# The badge is the only evidence a user ever gets that the largest always-on
# component is applied. A wrong badge is worse than none: it retires a working
# plugin during the audit this script exists to survive.
set -uo pipefail
SL="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/statusline.sh"
pass=0; fail=0

check() { # name  payload  expected-substring
  local got
  got=$(printf '%s' "$2" | "$SL" 2>/dev/null)
  if [[ "$got" == *"$3"* ]]; then
    pass=$((pass + 1))
  else
    fail=$((fail + 1))
    printf '  FAIL  %s\n        want substring: %s\n        got:            %s\n' "$1" "$3" "$got"
  fi
}

check "plugin style in force"      '{"output_style":{"name":"omc-slim:omc-slim"}}'  'omc-slim ●'
check "named rival is decisive"    '{"output_style":{"name":"Concise"}}'            'omc-slim ✗ (Concise won)'
check "default is NOT decisive"    '{"output_style":{"name":"default"}}'            'omc-slim ?'
check "capitalised Default too"    '{"output_style":{"name":"Default"}}'            'omc-slim ?'
check "field absent"               '{"model":{"display_name":"Opus"}}'              'omc-slim ?'
check "malformed json survives"    'not json at all'                                'omc-slim ?'
check "empty stdin survives"       ''                                               'omc-slim ?'
check "model is appended"          '{"output_style":{"name":"omc-slim:x"},"model":{"display_name":"Opus 5"}}' 'Opus 5'
check "dir is appended"            '{"output_style":{"name":"omc-slim:x"},"workspace":{"current_dir":"/tmp/proj"}}' 'proj'

# The regression this file exists for: `default` must never render as a loss.
got=$(printf '%s' '{"output_style":{"name":"default"}}' | "$SL" 2>/dev/null)
if [[ "$got" == *"✗"* ]]; then
  fail=$((fail + 1))
  printf '  FAIL  default rendered as a loss: %s\n' "$got"
else
  pass=$((pass + 1))
fi

printf '%d/%d passed\n' "$pass" "$((pass + fail))"
[ "$fail" -eq 0 ]
