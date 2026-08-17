---
name: deepwork
description: Staged execution for work too big or too risky to get right in one pass — a written stage plan, parallel lanes, a failable check per stage, review gates, and a skeptical self-review. Use for migrations, rewrites, cross-cutting refactors, anything unsafe to half-ship, and any fix that is only correct once every affected layer lands together. Not for routine multi-file edits.
---

# Deepwork

A scheduler discipline for heavy sessions. You plan, delegate, verify and
reconcile; you are not the implementation worker.

## When NOT to use this

One obvious correct approach **and** a single pass — do it directly. **Both
conditions, not either:** knowing what to do is not the same as doing it in one
pass, and an obvious fix that must land correctly in four places is not one pass.
Touching several files is not by itself a reason. Ceremony on a trivial task
buries the answer, but skipping the stage map when it was needed costs more.

Use it when one shot would plausibly miss something: dependent phases,
cross-cutting architectural change, an unsafe-to-partially-ship migration,
sustained coordination across specialist lanes, or a fix that is only correct once
every affected layer lands together.

## 1. Write the stage map before touching anything

Numbered stages, each with an expected output — this is how you avoid finding at
stage 7 that stage 2 rested on a wrong assumption.

```
Stage 1: [name] → [expected artefact]
Stage 2: [name] → [expected artefact]
```

**Every stage produces one verifiable artefact.** If a stage produces nothing
checkable, merge it into the next.

The map is living, not a contract. Update it when what you learn invalidates the
plan — and say that you did.

**An assumption that shrinks the deliverable is a question, not an assumption.**
One that fills a gap is stated and worked past; one that removes work is a scope
cut made on the caller's behalf, so it is a gate — surface it before the map runs,
never in the report an hour later. Where the request names a set, that covers
every member you propose to leave out: "it looked different from the others" is
the reason to ask, not the reason to skip.

## 2. Delegate independent work

Stages that do not depend on each other: dispatch them in one message so they run
concurrently, each briefed with its task, its expected output, and the context it
needs from earlier stages. Good: "research X while Y is implemented", "process
these three files", "verify this independently". Bad: splitting one coherent
thought across lanes to use more agents.

**Keep delegation one level deep** — enforced, not advisory. Specialists cannot
spawn agents, so a stage needing its own fan-out must be split into parallel lanes
by you, before dispatch. A lane you expect to subdivide itself is a lane that runs
sequentially.

## 3. Verify each stage with a check that can fail

A test that runs; a file provably in the expected shape; a source actually fetched
and read; output diffed against the spec.

**"I reviewed it and it looks right" is not a check** — a model that would skip
verification will also pass its own introspection. No failable check exists? Say
so and mark its output unverified, so the gap is visible downstream.

The loop runs backward too: **if a fix invalidates an earlier stage, re-run that
stage's check before continuing.** An error caught at stage 3 is trivial; at stage
8 it is not.

**Set-shaped work closes by diffing the set.** Re-run the enumeration that defined
it and list every member you did not touch, each with a reason. "Already
conformant" is a reason; absence from the list is not. Derive the set from a
command and show it — one glob misses a whole subtree, and a second, differently
shaped search is what catches that.

### Review gates

Oracle reviews go after each phase, never after each edit. Take the phases from
the work's own dependencies and delivery boundaries; never split work to shrink a
review. Hand the oracle the confirmed findings and file references you already
have so it assesses the decision instead of redoing discovery. Batch its material
findings into one remediation pass and verify that. Once validation passes and no
material blocker remains, advance — do not keep refining because refinement is
possible.

**Scan structure in the same message.** Dispatch an explorer alongside the oracle
review, over the phase's changed paths and their immediate dependencies, hunting
duplication, dependency direction, responsibility overlap and misplaced files. It
reports evidence; you decide what warrants action. Cheapest agent, runs in
parallel, so the gate costs no extra wall time. Do not open a second oracle review
for what the scan found.

**Cap the re-reviews.** One review per gate and **at most two re-reviews**, with
every oracle prompt stating where it is: `Gate 2 — review attempt 2 of 3`. Spend
one only when remediation materially changed the decision, or the original concern
resisted focused evidence — never to re-confirm a mechanical change. Budget
exhausted with a material risk still open: record it and ask whether to accept it,
cut scope, or authorise another pass. Do not quietly loop.

**Checkpoint each passing phase.** Put the commit points in the stage map so the
user approves them with the plan; then commit once per phase, after it validates
and its findings reconcile. A phase that goes wrong later costs one phase, not the
run. No agreement to commit? Say the checkpoint is available and carry on.

## 4. Self-critique before delivery

Read the result as a skeptical reviewer would and answer both, as defect reports
on your own work rather than introspection:

1. **What are you least confident about?** The weakest claim, file, config, edge
   case or assumption. "Nothing" is not allowed.
2. **What is the biggest thing you are missing?** The unknown unknown: a false
   premise, a file left unread, live state you assumed instead of checked.

Honest checking turns up nothing? Say so — do not manufacture a weakness to
satisfy the ritual.

**Verify a problem before flagging it.** Grep it, diff it, run it, read the
source. A warning raised because evidence was *not found*, rather than because a
fault *was*, manufactures doubt and sends people chasing ghosts. Absence of
evidence is not the finding.

## Operational rules

**Warning threshold.** Minor concerns accumulate over a long run. Keep count. **At
three, stop and surface** them together — three small things pointing the same way
usually mean one real problem needing a decision.

**Find-and-replace safety.** Anchor on word boundaries — a bare `edge` also
mangles `Ledger`. Use `\bword\b`. After any bulk replace, grep for glued or
malformed compounds and re-read a sample in context: a mechanical rewrite can
leave text that is syntactically fine and semantically dead.

**Progress file.** Work spanning sessions keeps a log at
`docs/deepwork/<task-slug>.md` — current understanding, confirmed findings, phase
status, validation results, open questions, what was tried and failed, and the
next first action. Reference files by path, never paste contents. Update after
decisions, reviews, phase completions and scope changes; re-read it before
continuing.

A dead end nobody wrote down gets walked a second time by whoever picks the work
up next. One line each is enough. The next first action must be executable without
reading anything but this file: "carry on with the migration" fails that test,
"re-run the seed script against staging and compare row counts" passes.

**Designer handoff.** A phase including the designer delivers layout, spacing,
hierarchy, motion, colour and component feel as accepted intent. Record the
important decisions, route later visual changes back to the designer, and use the
fixer only for mechanical follow-up that preserves the design exactly.

## Domain variations

Only the artefact in step 3 changes.

- **Software** — read the whole relevant section before writing; plan the diff,
  then execute. Check: tests run, error paths exercised, not just the happy path.
- **Research** — gather sources before synthesising; do not write as you search.
  Distinguish confirmed fact from inference. Check: every load-bearing claim
  traces to a source actually read.
- **Data** — understand the shape first; state the hypothesis before computing,
  not after seeing the numbers. Check: quality assertions run against real data.
- **Multi-session** — define done criteria upfront, written and testable.

## What this does not do

It does not make the underlying reasoning better. It shapes procedure:
decomposition, delegation, verification habits. When a task is genuinely beyond
reach, say so rather than producing plausible-sounding wrong output.
