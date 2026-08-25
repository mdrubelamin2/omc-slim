# Deepwork — output-style restructure

Task: restructure `output-styles/omc-slim.md` so it is linear, unambiguous,
contradiction-free, compressed, and more effective — not merely smaller.

Started 2026-08-25. Follows `docs/AUDIT-2026-08-25.md`.

## Stage map

```
Stage 1: Constraint set          → docs/deepwork/style-restructure.constraints.txt   DONE
Stage 2: Council on structure    → three oracle seats + synthesis                    DONE
Stage 3: Rewrite                 → new output-styles/omc-slim.md
Stage 4: Mechanical verification → check-coverage rc=0, measure-context, self-scan
Stage 5: Review gate             → oracle review + explorer structure scan, parallel
Stage 6: Self-critique           → recorded below, then report
```

Commit point: after Stage 4 passes. One commit for the whole restructure — it is
not safe to half-ship a system prompt.

## Current understanding

The file is 2,995 tokens of body across five sections, holding 35 behaviours
pinned by `COVERAGE.tsv`. A checker fails the build if any pinned pattern
disappears, so the pins are the floor of any compression.

Section inventory, measured:

| Section | chars | ~tok |
|---|---|---|
| Role | 125 | 31 |
| Your specialists | 2,378 | 594 |
| Standards you hold every lane to | 3,723 | 930 |
| Workflow | 3,360 | 840 |
| Communication | 2,397 | 599 |

## Confirmed findings

1. **The file never reaches subagents.** Output styles apply to the main
   conversation only; a subagent runs its own system prompt. So every rule here
   governs one thread, while `fixer`, `designer` and `explorer` carry no register
   block of their own at all.
2. **It is additive, not replacing.** `keep-coding-instructions: true` stacks
   these rules on top of Claude Code's defaults — every duplicated rule is also a
   collision.
3. **The Communication section exempts itself five times** (`:188-212`), most
   broadly with "Explanation the user asked for ... is given in full". That is
   why the register appears to be ignored: requested explanation escapes the
   whole section, correctly.
4. **Self-compliance is better than assumed.** 10 of 148 sentences exceed the
   file's own 25-word cap; mean 12 words. Self-demonstration is a minor factor.
   An earlier claim that the file "breaks its own cap constantly" was wrong.
5. **Anthropic cut >80% of Claude Code's system prompt** for Claude 5 models with
   no measurable loss, naming "several conflicting messages in a single request"
   as the damage mechanism.

## Open questions

- Which pins are load-bearing safety rules and which are TSV bookkeeping from an
  upstream adoption? Retiring a row is legitimate but is a decision, not a
  side effect of compression.
- Does the measured benchmark win depend on sections a reorganisation would
  destroy? Gamma is checking git history for rules bought with a real incident.
- Should the five exemptions be closed, scoped, or left? Closing them changes
  behaviour the user has asked for repeatedly in this very session.

## Tried and failed

- Reaching ~2,150 tokens by prose tightening alone. Floor is ~3,000 with all 35
  pins intact; further cuts require retiring pinned rules.

## Council verdict (Stage 2) — DO NOT RESTRUCTURE

Split 2-1, resolved for gamma on direct repository evidence.

- **alpha (risk)** — the gate is `grep -qiF` substring presence, so it cannot
  tell an enforced rule from a decorative phrase. Compression can keep the pin
  and gut the rule, silently. Pin the unpinned safety text first.
- **beta (simplicity)** — delete the 930-token Standards section as duplicated in
  `agents/fixer.md`. Content duplication is real. **Overruled:** `042ff74`
  already rejected this exact move, and `agents/fixer.md` loads only when the
  fixer is dispatched — which the harness now suppresses by default on Opus 5.
- **gamma (evidence)** — `51dfbcc` records this precise failure: compression
  dropped a reinforcement clause, all 87 coverage rows passed, and behaviour
  broke. "A green coverage run proves no rule was deleted. It does not prove the
  remaining rules still fire." Also: `v0.8.1..HEAD` on this file is 9 insertions
  and 5 deletions, so the benchmarked artefact IS the committed file. A
  restructure invalidates the only measured claim the project has.

**Confirmed against the repo:** the earlier compression pass in this session had
already repeated the documented mistake, deleting three incident-bought clauses
while the gate stayed green — the `51dfbcc` tail, the `0ea4013` user-scope
clause, and Todo continuity. All three restored.

## Done under the verdict (Stage 3, reduced scope)

- Restored the three incident-bought clauses.
- Scoped the Communication exemption to length only: "In full exempts length, and
  nothing else." This is the ambiguity fix, and it needed no restructure.
- Added 6 COVERAGE.tsv rows for previously unpinned incident rules, so the next
  compression pass cannot take them silently. 240 -> 246.

## Stage 4 result

coverage rc=0 (246/246), shell rc=0, hook 14/14, mutants 17/17.
Static context 4,485 -> 4,264. Self-compliance 12 of 156 sentences over 25 words.

## Owner override, and what was built because of it

The owner read the council verdict and directed the restructure anyway, asking
for the risk to be taken. That is recorded here so the next reader does not
conclude the change was made behind its own gate.

The override was taken with a mitigation the council's own reasoning demanded:
`scripts/check-reinforcement.sh` and `REINFORCEMENT.tsv` were built FIRST, so the
51dfbcc failure mode is instrumented before the edit rather than after it.
Verified contrast — gutting `Surgical scope` yields `0 DROPPED` from
check-coverage and a named `GUTTED` from check-reinforcement.

## What landed

`# Standards you hold every lane to` dissolved. Every paragraph RELOCATED intact
to the moment it fires, under a six-step `# How you work`. Nothing deleted.
Rules stated once; reinforcement tails preserved.

Evidence that shaped it: section reordering measures d=-0.29 (CI includes zero)
on Claude Sonnet 4.6 (arXiv 2606.26356), so the reorder itself buys ~nothing.
Instruction COUNT is the lever — steep decline by N=40 (arXiv 2607.19257). So the
target became rule count and conflict removal, with the reorder as the means.

- atomic rules 41 -> 38, under the N=40 threshold
- static context 4,485 -> 4,382
- reinforcement rows 0 -> 40; coverage rows 240 -> 246
- gates: coverage rc=0, reinforcement 40/40, shell rc=0, hook 14/14, mutants 17/17

Gate 1 review (attempt 1 of 3) found three regressions I introduced, all fixed:
the delegation contract had silently narrowed to the literal `# Standing rules`
section; "Six moments, in order" was false because step 2 needs a lane chosen at
step 3; and "Only then write code" had drifted into reading as the manager's
normal next move. The structure scan found stale ROUTING.md rows, dead
councillor-shorthand code in check-coverage.sh, and a duplicated designer-handoff
paragraph. All remediated in one pass.

## Self-critique

**Least confident:** that no relocated rule stopped firing. Both gates are
structural. Neither can detect behavioural regression.

**Falsifier, checked:** if the restructure damaged something it damaged a
relocated paragraph, so I diffed the snapshot against the new file and asked
which relocated paragraphs no CHECK watches. Thirteen of twenty-eight were
unwatched, including `Search before you write`. Eight rows added; the gap is
closed. That check found a real hole rather than confirming the plan.

**Biggest thing missing:** `scripts/bench/` has not been re-run. `README.md:10`
publishes an 18% cost claim measured against the PRE-restructure artefact, and
that claim is now unbacked by what ships. The benchmark gates the release tag,
not this commit — the work reverts from
`docs/deepwork/style-v0.8.3.snapshot` plus `.sha`.

## Next first action

Run `./scripts/bench/run-arm.sh` on the omc-slim arm, n=3, before tagging a
release. Compare against BENCHMARK.md's $1.0146 mean and the 243/251/258 LOC
spread. If cost or consistency regresses, revert from the snapshot above.
