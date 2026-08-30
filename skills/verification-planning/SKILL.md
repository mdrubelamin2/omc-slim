---
name: verification-planning
description: 'Plans how to prove a change works or broke nothing: frames the claim, designs an evidence path from the system itself, and requires every check to be able to fail.'
when_to_use: '"how do I prove this did not break anything", "how do I know this works", "what should I test". Decides what would prove it; does not write the tests. Judging a change that exists is the omc-slim:review skill.'
---

# Verification Planning

## Scope

Use this skill proportionately. Small mechanical changes can follow ordinary
project checks directly. For larger multi-phase work, let this skill establish
the evidence path that later work follows.

## Who runs it, and with what

This skill plans; other components execute. **Everything below is what the plan
specifies, not what you personally perform**: the revert-and-re-run ritual, the
runnable path, the closing interpretation. You write them into the plan and name
their owner. Send the locating work to the
`omc-slim:explorer` agent — which checks already exist, what they cover — and the
resulting edits to the `omc-slim:fixer` agent. Where the plan is one stage of a
larger migration, the `omc-slim:deepwork` skill owns the sequencing and this owns
each stage's failable check — and if you are already inside `omc-slim:deepwork`,
this *is* that stage's check. Do not re-enter the sequencing skill to plan one
stage of the plan you are already running.

The evidence path uses whatever this machine actually has. A test runner, a
browser or devtools server, a database or API client, a coverage tool: any of
them turns an assertion into an observation. They arrive from the project's
`.claude/` and the user's `~/.claude/`, their names say nothing about their
subject, and `ToolSearch` reaches them where tools are deferred. Read the
descriptions, prefer a tool built for this stack over a generic one, and name the
route in the plan. Where nothing is installed, the project's own commands are the
evidence path. Where the project has no commands either, the plan says so and
asks; it never specifies a runner the user has not chosen.

## Build an evidence path

Before changing a non-trivial system, build an **evidence path**. That is a
project-specific route from the claim being made to evidence that can establish,
limit, or refute it.

The purpose is not to select a familiar technique. The purpose is to decide how
this system can reveal the truth of this particular change.

## What counts as evidence

This standard applies at every step below, not only at the end.

A check must be able to fail. "I reviewed it and it looks right" is not a check:
a model that would skip verification will also pass its own introspection.

Acceptable:

- a test that runs
- a request or query whose response you read
- a file that provably exists in the expected shape
- output diffed against the stated spec
- a source actually fetched

Some deliverables must work without you: a README, a runbook, a setup guide. For
those, the check is a fresh agent that receives it and nothing else. It
**executes** the deliverable rather than reviewing it, and reports every place it
stalled. Its own context cannot paper over a gap it was never given, which is
what makes the stalls trustworthy.

Report skips honestly. If a check could not be run, say so and say why — never
imply a result you did not observe.

**A check that ran over nothing looks exactly like a check that passed.** A suite
whose glob matched no file exits green, and so does an assertion behind a
condition nothing satisfied. Print the number of inputs that reached the
assertion beside the verdict, and read zero as unproven rather than passed. Where
the result is an empty search rather than a green test, run that same search for
something you know is there. A guard you just wrote earns the same treatment: run
it against a state where the fault existed and confirm it fires. If neither finds
what you planted, the check is broken and proves nothing about the code.

**Prove the arranged input, not only the assertion.** A check can be able to fail
and still be vacuous, because the *setup* silently did not do what it claimed. A
real case: a test asserted that a byte-order mark was stripped, and the helper
that was supposed to write one never emitted it — so the assertion compared
unstripped text to itself, **deleting the entire implementation kept it green**,
and it cleared every gate before a human found it weeks later.

So for any check whose fixture has to *construct* a condition — a malformed
input, a race, an expired token, a corrupted file — assert that the condition is
actually present before asserting what the code does about it. One extra line,
and it is the difference between testing your code and testing your test.

**Revert and re-run: the ritual that settles it.** Where the change and its check
land together, undo the source change, run the check, and confirm it goes **red**
— then restore. It costs one run. It is the only direct evidence that the check
can fail for the reason you think, and it is what mutation testing approximates
expensively. A check written after the fix passes on both versions, so it proves
the bug is gone only by assertion.

**Red for the right reason.** A test that fails with `X is not exported from Y`
satisfies "it failed before the fix" while proving only that an import resolves.
Structural red is not behavioural red. Read the failure message and confirm it
names the behaviour, not the plumbing.

**Some changes are not live in the session that made them.** Prompt text, output
styles, hooks, plugin manifests and harness settings load when a session starts.
So the session you edited them in still holds the old copy. A check run there
measures what you replaced, and passes or fails for the wrong reason. Start a
fresh session before believing the result, or record it as unverified.

**A check you tolerate failing is a check you have stopped reading.** A known-red
result teaches everyone to skip that output, so the next real failure arrives
already hidden. Repair it, narrow its scope to what it can honestly assert, or
delete it — leaving it red and explained is none of those. That is a choice about
a check this work owns; one already red when you arrived gets named to the caller
rather than deleted.

**Verify a fault before reporting it.** Grep it, diff it, run it, read the
source. A warning raised because evidence was not found, rather than because a
fault was found, is itself an error. It manufactures doubt and sends people
chasing ghosts. Absence of evidence is not the finding.

## The staged procedure

Seven steps, in `procedure.md`: frame the claim · design the evidence path ·
research where the path is unknown · set a budget · create a verification
affordance · make the path runnable · close it against the original claim. Each
carries its own **Complete when** so a step cannot be declared done by feel.

**Open it when the work is multi-phase**, which is the case § Scope reserves this
skill for. A small mechanical change does not need seven steps and should follow
the project's own checks directly. But the standard above applies either way,
and it is the half that must never be skipped.
