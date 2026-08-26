---
name: verification-planning
description: 'Plans how to prove a change works or broke nothing: frames the claim, designs an evidence path from the system itself, and requires every check to be able to fail.'
when_to_use: '"how do I prove this did not break anything", "how do I know this works", "what should I test". Not for writing the tests — use agent-skills:test-driven-development.'
---

# Verification Planning

## Scope

Use this skill proportionately. Small mechanical changes can follow ordinary
project checks directly. For larger multi-phase work, let this skill establish
the evidence path that later work follows.

## Build an evidence path

Before changing a non-trivial system, build an **evidence path**. That is a
project-specific route from the claim being made to evidence that can establish,
limit, or refute it.

The purpose is not to select a familiar technique. The purpose is to decide how
this system can reveal the truth of this particular change.

## What counts as evidence

This standard applies at every step below, not only at the end.

A check must be able to fail. "I reviewed it and it looks right" is not a check —
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

## 1. Frame the claim

State the behavior that needs to become true and the conditions that could make
a confident conclusion wrong.

Consider what must change, what must remain true, where the behavior crosses a
boundary, and which failure would matter most.

**Complete when:** the claim, its meaningful uncertainty, and its important
failure modes are concrete enough to investigate.

## 2. Design the evidence path

Derive possible evidence paths from the system itself. Look at its controllable
inputs, observable effects, state transitions, invariants, boundaries,
artifacts, and ability to repeat or reverse a scenario.

Generate alternatives before choosing. Prefer the path that produces a
trustworthy conclusion with proportionate cost, safety, and effort.

**Complete when:** there is a preferred path, its limitations are understood,
and a weaker or stronger alternative is available if circumstances change.

## 3. Research when the path is unknown

Some evidence paths depend on something you cannot check from here: an unfamiliar
dependency, a framework, an external service, a fast-moving capability. Ask the
librarian for focused research before you commit to an approach.

Ask for official or project-specific facilities, constraints, and trade-offs
that affect this exact verification problem. Use existing project evidence
directly when it already resolves the choice.

**Complete when:** the chosen path rests on known capabilities and real
constraints rather than assumption.

## 4. Set a verification budget

At the final state, state the distinct claims and assign one owner to establish
or refute each. Choose the minimum non-duplicative evidence that covers the
claims and important boundaries. Reuse evidence only while its relevant code,
inputs, environment, and state remain valid. Required repository and release
checks still apply. Scale the budget to consequence: minimality is right for
work a commit undoes, and wrong for a migration, a published interface or a
deletion, where the cheapest check that could have caught it is the one you
skipped. Broaden or repeat verification when a stated condition
justifies it.

## 5. Create a verification affordance when needed

When the existing system leaves the decisive truth too indirect or ambiguous,
extend the evidence path with a **verification affordance**. An affordance is
the smallest capability that makes the relevant state controllable, observable,
repeatable, and diagnosable for an agent.

Ask what capability would let an agent establish the claim directly, repeat the
scenario from a known state, and explain a failure without inference. Prefer an
affordance that strengthens directness, determinism, agent-legibility,
isolation, resetability, or future reuse.

Treat the affordance as part of the evidence path, not an automatic product
feature. Decide deliberately whether it is temporary or durable before building
it.

**Complete when:** the chosen path can establish the claim directly enough for
its stakes, and any needed affordance has a defined lifecycle.

## 6. Make the path runnable

Prepare only the support needed to follow the evidence path reliably. Keep the
support narrow, repeatable, and safe to inspect.

Decide whether that support has recurring value or exists only to resolve the
current uncertainty. Retain durable value deliberately; remove temporary
support once it has served its purpose.

Ask before introducing dependencies, persistent diagnostic surfaces, or
structural changes whose sole purpose is evidence gathering.

**Complete when:** the path can be followed without guessing about setup,
state, or interpretation.

## 7. Close the evidence path

After implementation, follow the planned path and interpret the resulting
evidence against the original claim.

Report whether the claim was established, limited, or refuted; distinguish
known facts from remaining uncertainty.

**Complete when:** a future reader can see what supports the conclusion and
what remains outside its reach.
