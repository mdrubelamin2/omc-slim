---
name: deepwork
description: Staged execution discipline for large, high-risk or multi-phase work — a written stage plan, parallel delegation, a failable check at every stage, review gates, and a skeptical self-review before delivery. Use when work spans several dependent phases, multiple sources, or a migration that is unsafe to half-ship. Not for routine multi-file changes.
---

# Deepwork

A scheduler discipline for heavy sessions. The orchestrator plans, delegates,
verifies and reconciles; it is not the implementation worker.

## When NOT to use this

If the task has one obvious correct approach and fits in a single pass, do it
directly. Staging a trivial task wastes effort and buries the answer under
ceremony. Touching several files is not by itself a reason.

Use it when a one-shot attempt would plausibly miss something: dependent phases,
cross-cutting architectural change, an unsafe-to-partially-ship migration, or
sustained coordination across several specialist lanes.

## 1. Write the stage map before touching anything

Number the stages. Give each an expected output. This is how you avoid
discovering at stage 7 that stage 2 was built on a wrong assumption.

```
Stage 1: [name] → [expected artefact]
Stage 2: [name] → [expected artefact]
```

**Every stage produces one verifiable artefact.** If a stage produces nothing
checkable, merge it into the next one.

The map is a living document, not a contract. Update it when what you learn
invalidates what you planned — and say that you did.

## 2. Delegate independent work

If stage N and stage M do not depend on each other, dispatch them in one message
so they run concurrently. Brief each specialist with its task, expected output,
and the relevant context from earlier stages.

Good: "research X while Y is implemented", "process these three files",
"verify this independently". Bad: splitting one coherent thought across lanes
just to use more agents.

Keep delegation one level deep. A specialist runs its stages sequentially rather
than fanning out again.

## 3. Verify each stage with a check that can fail

Acceptable: a test that runs; a file that provably exists in the expected shape;
a source actually fetched and read; output diffed against the stated spec.

**"I reviewed it and it looks right" is not a check.** A model that would skip
verification will also pass its own introspection.

If a stage genuinely has no failable check, say so explicitly and mark its output
unverified so the gap is visible downstream.

The loop runs backward as well as forward: **if a fix at stage N invalidates an
earlier stage, re-run that stage's check before continuing.** Catching an error at
stage 3 is trivial; at stage 8 it is not.

### Review gates

Ask the oracle agent to review after each phase, not after each edit. Decide the
phases from the work's own dependencies and delivery boundaries — never split
work merely to make a review smaller.

Before a review, hand the oracle the confirmed findings and file references
already gathered, so it assesses the decision instead of redoing discovery.
Batch its material findings into one bounded remediation pass, verify that, and
request a follow-up review only if the remediation changed the reviewed decision.

Do not keep refining because refinement is possible. Once validation passes and
no material blocker remains, advance.

## 4. Self-critique before delivery

Read the result as a skeptical reviewer would, then answer both — as defect
reports on your own work, not as introspection:

1. **What are you least confident about?** The weakest claim, file, config, edge
   case or assumption. "Nothing" is not an allowed answer.
2. **What is the biggest thing you are missing?** Hunt the unknown unknown: the
   false premise, the file left unread, the live state you assumed instead of
   checked.

If honest checking turns up nothing, say so plainly — do not manufacture a
weakness to satisfy the ritual.

**Verify a problem before flagging it.** Grep it, diff it, run it, read the
source. Never report a fault you have not confirmed present. An unverified
warning — raised because evidence was not found, rather than because a fault
was — manufactures doubt and sends people chasing ghosts. Absence of evidence is
not the finding.

## Operational rules

**Warning threshold.** Minor concerns accumulate across a long run. Keep count.
At three, stop and surface all of them together before continuing — three small
things pointing the same direction usually mean one real problem that needs a
decision.

**Find-and-replace safety.** Anchor on word boundaries: replacing a bare `edge`
also mangles `Ledger`. Use `\bword\b`. After any bulk replace, grep for glued or
malformed compounds before presenting the result, and re-read a sample in
context — a mechanical rewrite can leave text that is syntactically fine and
semantically dead.

**Progress file.** For work spanning sessions, keep a markdown log under
`docs/deepwork/<task-slug>.md`: current understanding, confirmed research
findings, phase status, validation results, open questions. Reference files by
path; do not paste their contents. Update it after decisions, reviews, phase
completions and scope changes. Re-read it before continuing a previous session.

**Designer handoff.** When a phase includes the designer agent, treat the
delivered layout, spacing, hierarchy, motion, colour and component feel as
accepted intent. Record important design decisions before continuing. Route
later visual changes back to the designer; use the fixer only for mechanical
follow-up that preserves the design exactly.

## Domain variations

Only the artefact in step 3 changes.

- **Software** — read the whole relevant section before writing; plan the diff,
  then execute. Check: tests run, error paths exercised, not just the happy path.
- **Research** — gather sources before synthesising; do not write as you search.
  Distinguish confirmed fact from inference. Check: every load-bearing claim
  traces to a source actually read.
- **Data** — understand the shape first; state the hypothesis before computing,
  not after seeing the numbers. Check: quality assertions run against the real
  data and pass.
- **Multi-session** — define done criteria upfront, written and testable.

## What this does not do

It does not make the underlying reasoning better. It shapes procedure:
decomposition, delegation, verification habits. When a task is genuinely beyond
reach, say so rather than producing plausible-sounding wrong output.
