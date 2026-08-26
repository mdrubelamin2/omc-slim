---
name: deepwork
description: 'Runs a migration, rewrite or cross-cutting refactor as staged execution: competing approaches, a written stage map, parallel lanes, one failable check per stage, a review gate between stages, and a skeptical self-critique.'
when_to_use: '"this touches everything", "big refactor", "migrate X to Y", "rewrite this", "do not half-ship this", "do this properly". Work only correct once every layer lands together. Not routine multi-file edits, and not a plan someone else runs — use agent-skills:planning-and-task-breakdown.'
---

# Deepwork

A scheduler discipline for heavy sessions. You plan, delegate, verify and
reconcile; you are not the implementation worker.

## When NOT to use this

**Invoked on purpose? Then run.** The user typed the command, so the question is
settled. Answering a request for staged execution with a paragraph on why the
task is too small is the most annoying possible response to being asked for help.
Scale the work down if it deserves less — fewer stages, one option, a local
grounding pass — but run it.

This guard is for the case where nothing was invoked and you are deciding
yourself.

One obvious correct approach **and** a single pass — do it directly. **Both
conditions, not either.** Knowing what to do is not the same as doing it in one
pass. An obvious fix that must land correctly in four places is not one pass.
Touching several files is not by itself a reason. Ceremony on a trivial task
buries the answer, but skipping the stage map when it was needed costs more.

Use it when one shot would plausibly miss something. Dependent phases,
cross-cutting architectural change, an unsafe-to-partially-ship migration,
sustained coordination across specialist lanes. Or a fix that is only correct
once every affected layer lands together.

## How deep to go once you are using it

**Calibrate depth to consequence and reversibility, not to task size.** A one-line
change on a payment path outranks a fifty-file rename, because being wrong costs
more there.

**Cheap to reverse earns one pass — when the approach is already known.**
Revertable by a commit, a flag flip or a re-run, and the repository already shows
how this is done here. Take that approach and go. Ceremony on
reversible work buries the answer under process nobody reads.

**Reversibility is not the same as obviousness.** Cheap to undo and no precedent
in this repository still earns one competing option. The cost being avoided is
not the revert. It is building the wrong shape confidently, and everything that
gets layered on it before anyone notices.

**Expensive to reverse earns research and competing options.** A schema
migration, a published interface, a deletion, anything users have already seen —
spend a stage on evidence and a stage on alternatives first. One-pass confidence
on irreversible work ships the wrong answer with nothing left to undo it.

**Ask the undo question out loud before choosing depth:** how would we back this
out an hour after it ships? No concrete answer means the work is irreversible and
the depth is not optional.

**Depth scales; grounding does not.** Everything on this ladder decides how many
stages, options and gates the work earns. None of it decides whether you check what is
true first. That is the next section, and it always owes the cheap local pass. You cannot calibrate depth against facts you have not
checked, because the thing that makes work expensive is usually the thing you did
not know about it.

## Ground it before you plan

**Research is a stage, not a reflex.** A stage map built on recall plans the
wrong work in the right order, and every gate below it then passes. Nothing else
in this skill can catch that: the checks prove you did what you planned, never
that the plan was current.

Three questions. Each closes with a **named source**, or an explicit "checked,
found nothing" — silence is not an answer, and neither is your own memory.

1. **Is this still how it is done?** Route it to `librarian`, which reads the
   installed source before it reads anything about it and carries a dated
   open-web pass into the finding. Your training has a cutoff; the approach you
   are about to plan around may have moved, been deprecated, or been replaced by
   something the platform now does for you.
2. **What does the code on disk actually say?** The installed package's own types
   and an existing call site cannot be stale about this project. A doc page can.
   Where disk and documentation disagree, disk wins — you are planning against
   the code that will run.
3. **What has already been tried here?** `git log`, the issue tracker, a comment
   that explains itself. A dead end someone already walked is the cheapest
   evidence you will ever get, and re-walking it is the most common way a
   rewrite loses a week.

**Scale the pass, never skip it.** Reversible work with a precedent in this
repository still owes questions 2 and 3 — both are local, both are minutes. Only
question 1 scales with consequence, because an open-web pass costs real time. A
migration, a published interface or anything users have already seen owes all
three, in full.

**Research does not stop at the plan.** When a stage turns up a fact you assumed
rather than checked, that is a new question 1 — answer it before the stage
closes, not in the report afterwards.

## Diverge before you converge

**Generate competing approaches before you write the map.** The first plausible
approach becomes the plan by default, and nothing downstream ever reconsiders it.

**Competing means different in kind, not in detail.** Three variants of one design
are one option. Change what carries the load: a different layer, a different
owner, buying instead of building, doing less, or doing nothing.

**When every option looks the same, attack the premise instead.** The first idea
constrains the next three, so move the constraint rather than the design. Run
these against the brief, in order, and keep whatever survives:

- **Invert it.** What if the opposite were true — the data flowed the other way,
  the caller owned this, the check ran at write time instead of read time?
- **Delete the requirement.** Which constraint, removed, makes the problem
  trivial? Then ask who actually imposed it. Often nobody currently alive.
- **Move it in time.** Build-time instead of runtime, migration instead of
  compatibility shim, one-off script instead of a permanent feature.
- **Let something else own it.** The platform, the database, the type system, the
  framework, an installed dependency. Code you do not write cannot rot.
- **Solve the general case, or refuse to.** Either this is one instance of a
  named problem with a known answer, or it is genuinely specific and the general
  solution is the over-build.

**The honest output of this is sometimes "the first idea was right".** Say that,
and say what you tried against it. An alternative you generated and killed is
evidence; an alternative you never had is a blind spot you cannot see.

**Kill each rejected option in writing, with its reason.** "Rejected: needs a
schema change we cannot reverse" is an artefact — it stops the next session
walking the same dead end.

**Generate freely; report at most three, one paragraph each.** The cap is on what
you write down, never on what you consider — a generation cap is how the second
idea never gets had. Say how many you discarded.

**Skip divergence only where the repository already answers the question.** A
precedent you can point at is a decision already made; re-deriving it is the
ceremony this section warns about. No precedent means at least one alternative,
however cheap the work is to undo.

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
One that fills a gap is stated and worked past. One that removes work is a scope
cut made on the caller's behalf, so it is a gate. Surface it before the map runs,
never in the report an hour later. Where the request names a set, that covers
every member you propose to leave out: "it looked different from the others" is
the reason to ask, not the reason to skip.

**Read the negative space as well — what the request implies but never states.**
Ask what the user assumes is included, and which adjacent thing breaks if this
ships exactly as literally worded.

**The test is surprise at absence, not surprise at presence.** Would its absence
surprise the user? Then it is implied scope and belongs in the map. Would its
presence surprise them? Then it is your idea, so ask before building it.

**Name the goal behind the stated form.** A request to speed up a query is
usually a request for a page that loads. Satisfy only the literal form and the
goal stays unmet while the ticket closes.

**Show the map before you execute it.** One message: the stages, their checks,
their commit points. Then start.

Without this the map is written and never seen, and every later clause about
the commit points the user saw is gated on a moment that never happened.
It is a presentation, not a gate — you are not asking permission for work already
agreed, you are giving the one cheap chance to say "not that order" before the
cost is sunk.

## 2. Delegate independent work

Stages that do not depend on each other: dispatch them in one message so they run
concurrently. Brief each with its task, its expected output, and the context it
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

**Set-shaped work closes by diffing the set.** Re-run the enumeration that
defined it and list every member you did not touch, each with a reason. "Already
conformant" is a reason; absence from the list is not. Derive the set from a
command and show it. One glob misses a whole subtree, and a second, differently
shaped search is what catches that.

### Review gates

Oracle reviews go after each phase, never after each edit. Take the phases from
the work's own dependencies and delivery boundaries; never split work to shrink
a review. Hand the oracle the confirmed findings and file references you already
have, so it assesses the decision instead of redoing discovery. Give it
evidence, never a verdict: naming a severity or a concern to skip decides the
review before it runs. Batch its material findings into one remediation pass and
verify that. Once validation passes and no material blocker remains, advance —
do not keep refining because refinement is possible.

**Scan structure in the same message — when the phase moved structure.** Dispatch
an explorer alongside the oracle review, over the phase's changed paths and their
immediate dependencies, **if that phase changed module boundaries, dependency
direction, or where files live.** A phase that only changed behaviour inside
existing files has no structure to scan, and the scan returns a map of what you
already knew.

Cheapest agent, runs in parallel, so when it does run the gate costs no extra
wall time. Do not open a second oracle review for
what the scan found.

**Brief it for locations, never for judgements.** Duplication, responsibility
overlap and a misplaced file are all conclusions about what was found, and
`explorer` is forbidden to draw one — ask it to and you get either a refusal or
a judgement from the agent least equipped to make it. Ask instead for the
evidence a judgement needs: every file matching these two shapes, every import
edge crossing this boundary, every caller of the symbols this phase moved. **You
read the map and decide what warrants action.**

**Cap the re-reviews.** **This budget is per gate, not per run** — a run with four
gates holds four budgets. One review per gate and **at most two re-reviews — three while a Critical is still open**, with
every oracle prompt stating where it is: `Gate 2 — review attempt 2 of 3`. Spend
one only when remediation materially changed the decision, or the original concern
resisted focused evidence — never to re-confirm a mechanical change. Budget
exhausted with a material risk still open: record it and ask whether to accept it,
cut scope, or authorise another pass. Do not quietly loop.

**Checkpoint at a delivery boundary, not after every phase.** A commit point
belongs where the phase leaves the tree in a state someone could ship, revert to,
or hand over — not wherever a stage happened to end. Phases that only make sense
together get one checkpoint, at the end of the group. Those points were in the
map the user saw before execution started (§1). Commit once per checkpoint, after
the phase — or the group — validates and its findings reconcile. Work that goes
wrong later costs back to the last boundary, not the run. Asked not to commit? Say the checkpoint is available and carry on.

## 4. Self-critique before delivery

Read the result as a skeptical reviewer would and answer both, as defect reports
on your own work rather than introspection:

1. **What are you least confident about?** The weakest claim, file, config, edge
   case or assumption. "Nothing" is not allowed.
2. **What is the biggest thing you are missing?** The unknown unknown: a false
   premise, a file left unread, live state you assumed instead of checked.

Honest checking turns up nothing? Say so — do not manufacture a weakness to
satisfy the ritual.

**Then state what would have to be true for the plan to be wrong, and go check
that exact thing.** Asking what you are least confident about invites
introspection; asking what would falsify you sends you to evidence.

**Check it against the world, not against your memory.** Read the file, run the
command, search the history that would show the falsifier. A review shaped to
confirm the plan confirms it, every time, and tells you nothing.

This repo has the case on record. Three independent seats were dispatched on one
restructure question and two agreed with each other. The third read git history,
found `51dfbcc`, and overturned both — a confirmation-shaped review would have
shipped the wrong answer.

**Verify a problem before flagging it** — `verification-planning` holds the
procedure. Absence of evidence is not the finding.

## Calculated risk, and its ceiling

**A risk is worth taking when the downside is bounded, detectable and
reversible.** All three, not two — an unbounded or invisible downside is not a
calculated risk, it is a guess wearing the word.

**Taking it requires naming the instrument that will detect the damage, before
you start.** Not "we will notice": the test, the query, the log line, the diff
that goes red. Undetected damage is found by the user, weeks later.

**No such instrument exists? Building it is part of the work, not a follow-up.**
The follow-up lands after the damage has already shipped, which is the one moment
the instrument was for. This binds on the irreversible rung above, never on work
a commit undoes — there, the revert is the instrument.

**Match the instrument to the damage you actually fear — presence is not
function.** `51dfbcc` records the failure: a compression pass kept every pinned
phrase, the checker stayed green, and three behaviours stopped firing. Its own
words: "a green coverage run proves no rule was deleted. It does not prove the
remaining rules still fire."

## Operational rules

**Warning threshold.** Minor concerns accumulate over a long run. Keep count. **At
three, stop and surface** them together — three small things pointing the same way
usually mean one real problem needing a decision.

**Find-and-replace safety.** Anchor on word boundaries, and check the result —
`fixer` runs the bulk edits and holds that procedure.

**Progress file.** Work spanning sessions keeps a log at
`docs/deepwork/<task-slug>.md`. It holds current understanding, confirmed
findings, phase status, validation results, open questions, what was tried and
failed, and the next first action. Reference files by path, never paste
contents. Update after decisions, reviews, phase completions and scope changes;
re-read it before continuing.

A dead end nobody wrote down gets walked a second time by whoever picks the work
up next. One line each is enough. The next first action must be executable without
reading anything but this file: "carry on with the migration" fails that test,
"re-run the seed script against staging and compare row counts" passes.

**Designer handoff.** The standing design-handoff rule already governs what
survives; a phase adds one thing to it. Record the important visual decisions in
the progress file, because the next phase reads that file and not the transcript
where the designer explained itself.

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
