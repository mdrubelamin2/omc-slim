# Eval suite

Part of [omc-slim](../README.md). Six cases, twelve graders.

**This suite has never been executed.** `claude plugin eval` is early access and
is not enabled on the account it was authored on — it exits 1 with
*"`plugin eval` is currently in early access"*. So every case here is a
structural artefact, and its scores are unknown.

That is stated first because a suite nobody has run is exactly the kind of thing
this repository spends [`docs/LIMITATIONS.md`](../docs/LIMITATIONS.md) warning
about. It is committed anyway because the authoring is the slow part, the schema
is pinned against the CLI's own validator, and the day access arrives the answer
is one command away.

```bash
claude plugin eval . --ablation with-without --no-publish --max-cost-usd 5
```

`--no-publish` matters: the HTML report is published to claude.ai by default.

## What it measures

Not "does the skill fire". Under `--ablation with-without` the runner treats
`tool_used: Skill` as a **plugin-fired indicator and excludes it from the score
in both arms** — so a suite built from trigger checks reports a confident zero
delta. Every grader here scores an **outcome**: the shape of the answer, whether
a finding carries a location, whether the run stopped before writing code.

| Case | Asks | The claim under test |
|---|---|---|
| `where-is-it` | A locating question | The answer is a map, not an essay, and proposes no fix |
| `already-tried-fixing` | A bug that survived one fix | Three competing hypotheses of *different kinds*, with falsifying evidence — not a second confident guess |
| `ready-to-ship` | Review a function with an injection hole | Findings carry a location and a severity, and the hole is caught |
| `build-me-something` | An underspecified build request | **Stops for approval before code** |
| `explain-this-function` | Four lines of Python | A plain answer. No interview, no spec, no review, no delegation |
| `one-line-typo` | Fix one word | The fix, and nothing else |

The last two are tagged `should-not-fire`, and they are the half of the suite
most likely to find something. Claude Opus 5 is documented as **expanding task
scope** and **over-delegating to subagents**; a layer that adds ceremony to a
four-line question is paying cost for harm. A suite that only tests firing
cannot see that, so `check-evals.sh` fails if every negative case is removed.

`build-me-something` is the highest-stakes case. A control-armed,
twice-blind-judged comparison measured a requirement-approval gate at **+14.50
points for +0.60M tokens**, where the skills alone were worth **+1.50**
([source](https://github.com/luobosibing2/superpowers-workflow-evaluation)). If
one thing in this plugin is worth its tokens, the evidence says it is that stop.

## Its own check

```bash
./scripts/check-evals.sh
```

Asserts what the runner's authoring interview refuses to negotiate: every case
has `schema_version`, `runs` of at least 3, at least one grader, a declared type
on each, at least one `should-not-fire` case, and no absolute path — cases run
in a sandboxed cwd, where `/Users/...` cannot resolve.

It has been proved able to fail: dropping `runs` to 1, blanking a grader type,
untagging both negative cases, and pasting an absolute path each turn it red.

It proves the suite is well-formed. **It cannot tell you a single case passes.**
Only the runner can, and the runner is gated.

## What is deliberately not here

**Nothing that needs `--scaffold`.** That flag runs author-supplied bash as the
invoking user, and it is off by default for good reason. Every case is judged on
the response to a self-contained prompt, so the suite is safe to run on sight.

**No case for `deepwork`, `codemap` or `simplify`.** All three are invoked on
purpose rather than routed to, so a routing eval measures nothing about them.
`codemap` also mutates the repository, which a sandboxed case should not.

**No delegation-calibration case yet.** That is the design worth running next and
it needs roughly forty tasks stratified by decomposability — far past what six
cases can carry. It is specified in
[the research](../docs/RESEARCH-2026-08-26.md#83-five-task-shapes-that-actually-separate-delegating-from-not).
