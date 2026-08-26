#!/usr/bin/env bash
# Structural check on the eval suite in evals/.
#
# Why this exists: `claude plugin eval` is early access and is NOT enabled on
# every account — it exits 1 with "currently in early access". So the suite can
# be authored and cannot be executed here. An eval suite nobody has run is
# exactly the kind of artefact this repository warns about, so it gets the
# strongest check available short of running it: the invariants the runner's own
# authoring interview refuses to negotiate away.
#
# What this proves: the suite parses, is shaped the way the runner expects, and
# cannot silently degenerate into a trigger-only suite that measures nothing.
# What it does NOT prove: that any case passes, or that the plugin helps. Only
# `claude plugin eval --ablation with-without` can say that.
#
#   ./scripts/check-evals.sh
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

python3 - "$ROOT" <<'PY' || exit 1
import glob, os, sys
try:
    import yaml
except ImportError:
    print('  SKIPPED       PyYAML not installed; eval suite unparsed')
    raise SystemExit(0)

root = sys.argv[1]
evaldir = os.path.join(root, 'evals')
if not os.path.isdir(evaldir):
    print('  NO SUITE      evals/ does not exist')
    raise SystemExit(1)

def front(path):
    text = open(path).read()
    if not text.startswith('---'):
        return None, 'no frontmatter'
    try:
        return yaml.safe_load(text.split('---', 2)[1]), None
    except Exception as exc:
        return None, str(exc).splitlines()[0][:80]

bad = 0
cases = sorted(glob.glob(os.path.join(evaldir, '*', 'prompt.md')))
if not cases:
    print('  NO CASES      evals/*/prompt.md matched nothing')
    raise SystemExit(1)

# A grader that only asserts the plugin fired cannot move the ablation delta:
# under --ablation with-without the runner treats `tool_used: Skill` as a
# plugin-fired INDICATOR, excluded from the score in both arms. A suite built
# only from those measures nothing while looking green.
TRIGGER_ONLY = {'tool_used'}
should_not_fire = 0

for case in cases:
    name = os.path.basename(os.path.dirname(case))
    meta, err = front(case)
    if err or not isinstance(meta, dict):
        print(f'  UNPARSEABLE   evals/{name}/prompt.md — {err}')
        bad += 1
        continue

    if 'schema_version' not in meta:
        print(f'  NO SCHEMA     evals/{name} is missing schema_version')
        bad += 1

    # The runner defaults to 3 and its authoring interview will not go lower.
    # Single-run agentic evals vary 2.2-6.0pp by luck alone.
    runs = meta.get('runs', 3)
    if not isinstance(runs, int) or runs < 3:
        print(f'  RUNS<3        evals/{name} sets runs={runs}')
        bad += 1

    tags = meta.get('tags') or []
    if 'should-not-fire' in tags:
        should_not_fire += 1

    body = open(case).read().split('---', 2)[-1]
    graders = sorted(glob.glob(os.path.join(os.path.dirname(case), 'graders', '*.md')))
    if not graders:
        print(f'  NO GRADER     evals/{name} has no graders/*.md')
        bad += 1
        continue

    types = []
    for g in graders:
        gm, gerr = front(g)
        rel = os.path.relpath(g, root)
        if gerr or not isinstance(gm, dict):
            print(f'  UNPARSEABLE   {rel} — {gerr}')
            bad += 1
            continue
        if 'type' not in gm:
            print(f'  NO TYPE       {rel} declares no grader type')
            bad += 1
            continue
        types.append(gm['type'])

    if types and set(types) <= TRIGGER_ONLY:
        print(f'  TRIGGER ONLY  evals/{name} scores only on {sorted(set(types))}')
        print('                  excluded from the score in both ablation arms')
        bad += 1

    # Cases run in a sandboxed cwd. An absolute path or ~ cannot resolve there,
    # and the runner rejects case-authored paths that escape their root.
    for path in [case] + graders:
        text = open(path).read()
        for needle in (os.path.expanduser('~'), '/Users/', '/home/'):
            if needle in text:
                print(f'  ABSOLUTE PATH {os.path.relpath(path, root)} contains {needle!r}')
                bad += 1
                break

if should_not_fire == 0:
    print('  NO NEGATIVE   no case is tagged should-not-fire')
    print('                  a suite that only tests firing cannot catch over-triggering')
    bad += 1

if bad:
    print(f'\n{bad} problem(s). The suite would not measure what it claims.')
    raise SystemExit(1)

graders_n = len(glob.glob(os.path.join(evaldir, '*', 'graders', '*.md')))
print(f'{len(cases)}/{len(cases)} eval cases well-formed '
      f'({graders_n} graders, {should_not_fire} should-not-fire).')
print('Not executed: `claude plugin eval` is early access. Structure only.')
PY
