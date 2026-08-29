# Four instruments, designed before the wagon that consumes them

Written at R3 so R4 and R5 do not arrive empty-handed. Each design states the
claim, the evidence path, and — the part that is usually skipped — **what result
would falsify the thing we want to be true.** A measurement whose failing outcome
was not written down in advance is a measurement that will be reinterpreted.

None of these has been run. They spend real money and the standing decision
for this run is that nothing paid fires. Every one of them ends with a single
command and a stated budget, so firing them is a decision and not a project.

Instrument 1 is now **built**; see "The harness, as built" at the end of §1.
Built is not run: no arm has fired and no cost has been incurred. Instruments 2,
3 and 4 remain designs on paper.

House rule carried in from `verification-planning`: a check that cannot fail is
not a check, and a check that ran over nothing looks exactly like one that
passed. Every design below prints the number of inputs that reached the assertion
beside its verdict.

---

## 1. The multi-file benchmark task class: exit criterion 1

This is the important one. Criterion 1 says delegation must be shown to pay
on at least one multi-file task class, verified from transcript, beating plain on
cost or wall-clock at equal correctness, n≥3, non-overlapping spreads.

### Why the existing harness cannot satisfy it

`scripts/bench/run-arm.sh` runs one prompt: *"Build a command-line tool that
finds duplicate files in a directory tree and reports them."* That is a
**single-file greenfield task**. It has no independent sub-units, so there is
nothing to fan out to. All nine committed runs produced **zero subagent
invocations**. That is not a failure of the plugin, it is a property of the
task.

So the current harness cannot satisfy criterion 1 and **cannot falsify it
either**. A re-run produces the same null for the same structural reason. That is
the finding that makes this instrument necessary rather than optional.

### The task class

A task qualifies when it has **three or more genuinely independent units that
share one interface**. Independence is what delegation buys; a shared interface
is what makes the reconciliation real rather than three separate tasks in a
trenchcoat.

Proposed task, and the reasoning for it:

> A repository with four provider adapters — `stripe`, `paypal`, `adyen`,
> `braintree` — each implementing the same `charge(amount, currency, idempotency_key)`
> interface against a different mock API shape, plus one shared `ledger` module
> every adapter writes through. The task: add `refund(charge_id, amount)` to all
> four adapters and to the ledger, with the partial-refund case handled.

Why this shape:

- **Four independent units.** The adapters do not import each other.
- **One shared interface**: the ledger. A lane that changes it in isolation
  breaks the other three, so reconciliation is load-bearing rather than
  decorative. This is the part a single-file task cannot exercise at all.
- **A completeness trap.** Partial refunds behave differently in each mock API.
  An arm that handles it in one adapter and not the others has produced a
  plausible, compiling, **incomplete** answer. That is the failure the plugin's
  "account for the full set" rule exists to prevent, and exactly what a grader
  that only checks "does it run" would score as a pass.
- It is boring, mechanical, and has an unambiguous correct answer. Interesting
  tasks make bad benchmarks because correctness stops being decidable.

### The correctness fixture

Correctness is **not** a judge model. It is a committed test suite the arms never
see, run against each arm's output:

- 4 adapters × (full refund, partial refund, refund exceeding charge, double
  refund with the same idempotency key) = 16 cases.
- 4 ledger cases: a refund writes exactly one reversing row, in the same
  transaction, with the original charge referenced.
- **1 negative control**: a case that must FAIL against a deliberately broken
  reference implementation. If it passes there, the fixture is not measuring what
  it claims and the whole run is void.

Score is `passed / 20`, printed with the count of cases that actually executed.
Zero executed reads as unproven, never as passed.

### The delegation detector: read the transcript, never `modelUsage`

This is where the previous benchmark was weakest and where the criterion is
explicit: *"verified from transcript, not `modelUsage`"*.

```bash
# A delegation is a tool_use block naming the Agent tool with a resolved
# tool_result. Attempted-but-denied dispatches are NOT delegations — they are
# the symptom of a gated Agent tool, which is a different finding entirely and
# one criterion 3 cares about.
jq -c 'recurse | objects | select(.type=="tool_use" and (.name=="Agent" or .name=="Task"))' \
   "$TRANSCRIPT" > /tmp/dispatches.jsonl
```

Report three numbers per run, never one:

| Number | Why it is separate |
|---|---|
| dispatches attempted | zero here means the style never tried |
| dispatches that returned a result | attempted-minus-this is the gated-tool signal |
| distinct `subagent_type` values | one lane four times is not fan-out |

A run with zero attempted dispatches does not count as an omc-slim arm. It is
a plain arm wearing a plugin, and averaging it in is how the last benchmark ended
up defending a prompt while claiming to defend an orchestrator. Report those runs
separately and say how many there were.

### Arms, n, and the decision rule

Three arms, `n=5` not `n=3`. The existing n=3 could not detect an effect below
roughly 30 percentage points, and the whole point of this instrument is to
measure an effect that may be smaller than that. Five is still underpowered and
the write-up must say so.

- `plain`: empty working directory.
- `omc-slim`: `--plugin-dir`, delegation available.
- `omc-slim-nodelegate`: the plugin with `Agent` denied at the top level. **This
  arm is the one that actually settles the question**, because it isolates the
  prompt from the orchestration. If it matches the full arm, the win is the
  prompt, and the honest product is a discipline layer rather than an
  orchestrator.

**Pre-registered decision rule.** Criterion 1 passes only if, at equal
correctness (within one fixture case): the `omc-slim` arm's cost or wall-clock
spread does **not overlap** `plain`'s, **and** it does not overlap
`omc-slim-nodelegate`'s, **and** the median run shows ≥2 distinct subagent types
with returned results. Overlap with `nodelegate` and separation from `plain`
means the prompt won and delegation did not, which is a **publishable negative
result and the honest headline**, not a failed experiment.

Budget: 15 runs. At the previously measured ~$1.01–1.24 per single-file run and a
task roughly 3× larger, plan **$45–60** and set `--max-cost-usd` per run.

### The harness, as built

Three scripts, all under `scripts/bench/`. The design above is unchanged; this
records the interface and the four places the implementation had to differ from
what §1 assumed.

| Script | What it is |
|---|---|
| `make-refund-fixture.sh` | Generates the repository, the held-out suite, and both reference implementations. Refuses to overwrite, like `make-fixture.sh`. |
| `grade-refunds.sh` | Runs the held-out suite against one candidate. `--self-test` is the negative control. |
| `run-delegation.sh` | The arms. Dry run by default; `--execute` required to spend. |

Start here, and stop early if it answers you. The cheapest decisive slice is
one arm, not fifteen runs:

```bash
./scripts/bench/run-delegation.sh --arms omc-slim --n 3 --execute   # $9.13
```

That answers the question that actually blocks release — *does the plugin
delegate at all on a task where delegation could pay* — for about a fifth of the
full design. **Zero dispatches across those three runs makes the full comparison
unnecessary**, and the harness says so in as many words rather than leaving the
reader to infer it. The full design remains one command away:

```bash
./scripts/bench/run-delegation.sh --execute                          # $48.99
```

Both figures are printed before anything is spent, derived from
[BENCHMARK.md](./BENCHMARK.md)'s measured per-run means scaled 3× as budgeted
above. The full-design estimate lands inside this section's own $45–60.

The generated task is `repo/`, 16 files. Four adapters provably do not import
each other, and the generator's self-check fails if one ever does. Four provider
mocks deliberately disagree about units, about whether failure raises or is
returned in the body, and about whether a refund is synchronous. One shared
`ledger.py` docstring states the two invariants: every write joins the caller's
transaction, and every key is deterministic in the operation it records. A
`smoke.py` proves the charge path green before the task starts, so no arm
inherits a broken tree and measures repair.

The correctness fixture is red before it is green, and that was watched.
`grade-refunds.sh --self-test` grades three trees whose scores are predicted in
`manifest.json` before they are run:

| Tree | Predicted | Observed |
|---|---|---|
| the untouched repo | 20 executed, 0 passed | 20 executed, 0 passed |
| the seeded-defect reference | 16 passed, red on 4 named cases | red on exactly `paypal.double`, `adyen.exceeds`, `ledger.references_charge`, `ledger.partial_amount_recorded` |
| the correct reference | 20 passed | 20 passed |

Predicting the red set case by case is what makes this a control rather than a
shrug: a broken tree that fails on the *wrong* cases would pass a bare
"something went red" check while measuring nothing. `run-delegation.sh --execute`
runs this self-test as a hard gate and refuses to spend if it fails, because an
arm's score means nothing behind a fixture nobody watched fail.

**Four deviations from §1 as written**, each a correction rather than a shortcut:

1. **`--max-cost-usd` does not exist on the CLI.** That flag is `claude plugin
   eval`'s. The session equivalent is `--max-budget-usd`, verified against 2.1.251
   by arg-parse probe, and is set to `$8.00` per run.
2. **`Agent` and `Task` are in `--allowedTools` for every arm**, and the reason
   recorded here on 2026-08-29 was wrong. It said `run-arm.sh`'s allow-list
   omitted them and was therefore a second sufficient explanation for the nine
   zero-delegation runs. Tested since: `--allowedTools` is an **additive
   permission grant**, not an exclusive tool set, and under `run-arm.sh`'s exact
   allow-list a subagent launches and returns. The nine runs had delegation
   available and did not use it, which is the stronger reading and the original
   one. They are added here for explicitness, not to fix a confound that never
   existed.

3. **The transcript is this harness's own `stream-json` capture**, not the
   session file under `~/.claude/projects`. Two reasons: the session file also
   carries sidechain entries for the subagents' own turns, which would inflate a
   top-level dispatch count into something that looks like more fan-out than
   happened; and a run killed by the wall-clock guard still leaves a usable
   partial stream, where a whole-file parse leaves nothing. Counts are therefore
   **top-level dispatches**. A subagent dispatching a further subagent is not
   counted, and the write-up must say so.
4. **The `nodelegate` arm denies `Agent` with `--disallowedTools`, not by
   omitting it from the allow-list.** Deny beats allow, so the arm differs from
   the full one by exactly one flag; and a denied attempt still appears in the
   transcript, which is what makes attempted-minus-returned readable as the
   gated-tool signal criterion 3 wants rather than as silence.

---

## 2. The seeded-defect ground-truth set: `review`'s kill criterion

Serves the removal criterion in [NATIVE.md](./NATIVE.md): `review` retires unless
its false-positive-rate spread separates from free `/code-review`'s at
equal-or-better true-positive yield.

### Construction

Twelve diffs against real repository history, not synthetic files. Take
twelve commits from this repository and from two unrelated open-source projects,
revert each, and seed exactly one known defect into the reverted state. Real
surrounding code is essential: a synthetic diff has no plausible distractors, and
false-positive rate is precisely a measure of how a reviewer behaves among
distractors.

Seed classes, one diff each, chosen because each has an unambiguous ground truth:

| # | Class | Ground truth |
|---|---|---|
| 1 | Off-by-one in a slice bound | the index |
| 2 | Missing `await` on a promise-returning call | the call site |
| 3 | Enum member handled in 2 of 3 switch sites | the unhandled site |
| 4 | SQL built by string interpolation | the interpolation |
| 5 | Null deref on a nullable field | the deref |
| 6 | Migration with no rollback path | the migration |
| 7 | Changed response shape, one consumer unupdated | the consumer |
| 8 | Race: read-modify-write without a lock | both sides |
| 9 | Secret in a committed config default | the line |
| 10 | Test asserting on the mock rather than the behaviour | the assertion |
| 11 | **Clean diff — no defect seeded** | nothing |
| 12 | **Clean diff — no defect seeded** | nothing |

Rows 11 and 12 are the point. **Without clean diffs there is no false-positive
rate**, and FP rate is the whole kill criterion. A set of ten defective diffs
measures recall only, which is the mistake the first draft of this criterion
made.

### Adjudication

The judge model **only matches reported findings to seeds**. It never rules on
whether an unmatched finding is valid. A haiku judge is too weak for that, and
delegating validity to it would make the criterion measure the judge.

- **True positive**: a reported finding whose `file:line` is within ±3 lines of
  the seed and whose description names the seeded class.
- **False positive**: any other reported finding at Required or above. Optional
  findings and nits are counted separately and excluded from the FP rate, because
  both tools are entitled to opinions.
- **False negative**: a seed no finding matched.

Both tools run n=3 per diff (36 runs each) to get a spread rather than a point.

### The falsifier, stated plainly

If `review`'s FP-rate spread overlaps `/code-review`'s after one enlarged re-run,
**`review` is removed in the next release**. Not softened, not repositioned:
removed, with the numbers published. That is the whole value of pre-registering.

Budget: 72 review runs. `/code-review` is free; `review` runs on the session
model. Plan **$25–40**.

---

## 3. Component arms: why the default ablation cannot decide anything

`claude plugin eval --ablation with-without` produces **one plugin-level delta**.
It answers "is this plugin worth installing" and cannot answer "is this component
worth keeping", because removing the whole plugin removes twelve things at once.

Component fates therefore need **component arms**, and each is a forked build:

```
build A: the shipping tree
build B: A, minus agents/explorer.md, with explorer's map contract moved
         into the delegation brief the orchestrator writes for native Explore
build C: A, minus skills/review/, with `/code-review` as the gate
```

Three separate paid eval runs, one per build, comparison arithmetic done outside
the tool because the tool compares a plugin against its own absence, not against
another build.

**The trap this design exists to avoid.** Scoring build B on explorer's own
output-contract compliance guarantees the answer, because build B loses that
contract by construction. Both arms are scored on **downstream-consumer
success** — can the orchestrator act on what came back? — plus token cost. That
is the only comparison that is not rigged.

`disableBundledSkills` is the clean lever for holding native components constant
across arms; without it, build C's `/code-review` availability differs by
account tier and the comparison silently changes basis.

Budget: 3 eval runs with `--max-cost-usd` set per run. Plan **$30** and stop at
the first surprise.

---

## 4. The Rule 1 pressure test: the gate R5's cuts run behind

[COMPRESSION-2026-08-28.md](./COMPRESSION-2026-08-28.md) Rule 1 says a
measured-evidence or counter-rationalization sentence comes out only after
reconstructing the failure it answers, running that scenario without the
sentence, and getting a green baseline. **Until this harness exists the entire
high-risk band is frozen**, which means Phase 4 — the only route past ~7%
compression — cannot start.

The scar it defends against is `51dfbcc`: a compression pass where all 88
presence rows stayed green and behaviour broke anyway, because the reinforcing
sentence that made a rule fire was cut while the rule's phrase survived.

### The mechanism

For a candidate sentence S in component C:

1. **Find the failure S answers.** `git log -S '<a distinctive phrase from S>' --reverse`
   names the commit that added it; the message, `RESEARCH.md` or `MAINTAINERS.md`
   usually names the observed failure. **No reconstructable failure → S does not
   come out.** Not "cut it cautiously": it stays, because an un-reconstructable
   rationale is one whose test cannot be run, and Rule 1 is a test.
2. **Write the scenario as an eval case** under `evals/pressure/<rule-slug>/`,
   reusing the existing eval structure so `check-evals.sh` already validates its
   shape. The grader asserts the *behaviour* the sentence produces, never the
   sentence's presence. A presence assertion would pass on the uncut build for
   the wrong reason and is exactly the blindness `51dfbcc` exposed.
3. **RED first.** Run the case against a build with S **removed**. It must fail.
   A case that passes without S is not testing S, and the correct conclusion is
   that S was already dead text, which is a finding worth recording and a
   licence to cut on different grounds.
4. **GREEN.** Run against the shipping build. It must pass.
5. Only a RED-then-GREEN pair licenses the cut, and the pair is committed beside
   it.

### The bootstrapping problem, named

Step 3 needs eval **execution**, which is the thing R0 could not confirm works.
If execution is server-gated, this harness degrades to `smoke-contracts.sh
--execute` with a hand-written assertion per rule: cheaper per rule, far weaker,
and n=1. **Say which mode ran in the commit that makes the cut.** A Phase 4 cut
made behind the degraded mode is a weaker claim than one made behind the eval
mode, and the difference must be visible to whoever reads it later, not buried.

Budget: 2 runs per candidate sentence. Roughly 15 candidates in the high-risk
band, so **~30 runs**; batch them rather than firing one at a time.

---

## What all four have in common

Each ends in a single command and a stated budget. Each names the outcome that
would falsify the thing this project wants to be true: delegation paying,
`review` earning its place, `explorer` earning its place, a rationale sentence
being load-bearing. **The negative results are the publishable ones**, and they
are the only reason a measurement this project runs on itself is worth anything
to a reader.
