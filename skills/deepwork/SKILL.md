---
name: deepwork
description: 'Runs a migration, rewrite or cross-cutting refactor as staged execution: a written stage map, parallel lanes, one failable check per stage, and a gate between stages.'
when_to_use: '"this touches everything", "big refactor", "migrate X to Y", "rewrite this", "do this properly". For work that is only correct once every layer lands together. Not routine multi-file edits, and not a plan someone else runs: this one executes the stages.'
---

# Deepwork

A scheduler discipline for heavy sessions. You plan, delegate, verify and reconcile; you are not the implementation worker.

## When NOT to use this

**Invoked on purpose? Then run.** The user typed the command, so the question is settled. Answering a request for staged execution with a paragraph on why the task is too small is the most annoying possible response to being asked for help. Scale the work down if it deserves less: fewer stages, one option, a local grounding pass. But run it.

This guard is for the case where you chose this skill yourself.

One obvious correct approach **and** a single pass: do it directly. **Both conditions, not either.** Knowing what to do is not the same as doing it in one pass. An obvious fix that must land correctly in four places is not one pass. Touching several files is not by itself a reason. Ceremony on a trivial task buries the answer, but skipping the stage map when it was needed costs more.

Use it when one shot would plausibly miss something. Dependent phases, cross-cutting architectural change, an unsafe-to-partially-ship migration, sustained coordination across specialist lanes. Or a fix that is only correct once every affected layer lands together.

## How deep to go once you are using it

**Calibrate depth to consequence and reversibility, not to task size.** A one-line change on a payment path outranks a fifty-file rename, because being wrong costs more there.

**Cheap to reverse earns one pass, when the approach is already known.** Revertable by a commit, a flag flip or a re-run, and the repository already shows how this is done here. Take that approach and go. Ceremony on reversible work buries the answer under process nobody reads.

**Reversibility is not the same as obviousness.** Cheap to undo and no precedent in this repository still earns one competing option. The cost being avoided is not the revert. It is building the wrong shape confidently, and everything that gets layered on it before anyone notices.

**Expensive to reverse earns research and competing options.** A schema migration, a published interface, a deletion, anything users have already seen: spend a stage on evidence and a stage on alternatives first. One-pass confidence on irreversible work ships the wrong answer with nothing left to undo it.

**Ask the undo question out loud before choosing depth:** how would we back this out an hour after it ships? No concrete answer means the work is irreversible and the depth is not optional.

**Depth scales; grounding does not.** Everything on this ladder decides how many stages, options and gates the work earns. None of it decides whether you check what is true first. That is the next section, and it always owes the cheap local pass. You cannot calibrate depth against facts you have not checked, because the thing that makes work expensive is usually the thing you did not know about it.

## Ground it before you plan

**Research is a stage, not a reflex.** A stage map built on recall plans the wrong work in the right order, and every gate below it then passes. Nothing else in this skill can catch that: the checks prove you did what you planned, never that the plan was current.

Three questions. Each closes with a **named source**, or an explicit "checked, found nothing". Silence is not an answer, and neither is your own memory.

Survey the toolset before you write the map, not after. Both scopes carry components, the project's `.claude/` and the user's `~/.claude/`, which usually holds more. And a server built for this stack answers better than a generic lane. Names say nothing about subject, so read descriptions; `ToolSearch` reaches them where tools are deferred. Name the tool in the lane brief, because a specialist cannot survey on your behalf and inherits only what the brief says.

1. **Is this still how it is done?** Route it to the `omc-slim:librarian` agent, which reads the installed source before it reads anything about it. And it carries a dated open-web pass into the finding where the claim is the kind the web can correct. Or it says it skipped one, and why. Your training has a cutoff. The approach you are about to plan around may have moved, been deprecated, or been replaced by something the platform now does for you.
2. **What does the code on disk actually say?** The installed package's own types and an existing call site cannot be stale about this project. A doc page can. Where disk and documentation disagree, disk wins. You are planning against the code that will run.
3. **What has already been tried here?** `git log`, the issue tracker, a comment that explains itself. A dead end someone already walked is the cheapest evidence you will ever get. And re-walking it is the most common way a rewrite loses a week.

**Scale the pass, never skip it.** Reversible work with a precedent in this repository still owes questions 2 and 3: both are local, both are minutes. Only question 1 scales with consequence, because an open-web pass costs real time. A migration, a published interface or anything users have already seen owes all three, in full.

**Research does not stop at the plan.** When a stage turns up a fact you assumed rather than checked, that is a new question 1. Answer it before the stage closes, not in the report afterwards.

## Diverge before you converge

**Expensive to reverse? Generate competing approaches before you write the map.** Cheap to reverse with a known approach earns one pass. **Open `depth.md` before choosing.** It holds what "competing" means and does not, what to do when every option looks the same, the reporting cap, and when the repository already answers the question. This is a decision you make once per run and it is the one most often made by reflex.

## 1. Write the stage map before touching anything

Numbered stages, each with an expected output. This is how you avoid finding at stage 7 that stage 2 rested on a wrong assumption.

```
Stage 1: [name] → [expected artefact] → Check: [the command that can fail]
Stage 2: [name] → [expected artefact] → Waived: [why nothing here could fail]
```

**Every stage carries a `Check:` or a `Waived:`, never neither.** A stage with an empty slot is a hole you can see. A stage that simply omitted the line is a hole you cannot. And the count below is only as good as the lines that got written.

**Every stage produces one verifiable artefact.** A stage producing no artefact at all merges into the next. One producing an artefact that nothing can falsify stays, and takes the `Waived:` line above. Otherwise the waiver rule and its three-strike alarm are unreachable.

The map is living, not a contract. Update it when what you learn invalidates the plan, and say that you did.

**An assumption that shrinks the deliverable is a question, not an assumption.** One that fills a gap is stated and worked past. One that removes work is a scope cut made on the caller's behalf, so it is a gate. Surface it before the map runs, never in the report an hour later. Where the request names a set, that covers every member you propose to leave out. "It looked different from the others" is the reason to ask, not the reason to skip.

**Read the negative space as well: what the request implies but never states.** Ask what the user assumes is included, and which adjacent thing breaks if this ships exactly as literally worded.

**The test is surprise at absence, not surprise at presence.** Would its absence surprise the user? Then it is implied scope and belongs in the map. Would its presence surprise them? Then it is your idea, so ask before building it.

**Name the goal behind the stated form.** A request to speed up a query is usually a request for a page that loads. Satisfy only the literal form and the goal stays unmet while the ticket closes.

**Show the map before you execute it.** One message: the stages, their checks, their commit points. Then start.

Without this the map is written and never seen. And every later clause about the commit points the user saw is gated on a moment that never happened. It is a presentation, not a gate. You are not asking permission for work already agreed. You are giving the one cheap chance to say "not that order" before the cost is sunk.

## 2. Delegate independent work

Stages that do not depend on each other: dispatch them in one message so they run concurrently. Brief each with its task, its expected output, and the context it needs from earlier stages. Good: "research X while Y is implemented", "process these three files", "verify this independently". Bad: splitting one coherent thought across lanes to use more agents.

**Read a lane's last result before dispatching that lane again.** Reading it is what authorises the retry; re-dispatching an unread result buys a second copy of an answer you already hold, at full price.

**Keep delegation one level deep**: enforced, not advisory. Specialists cannot spawn agents, so a stage needing its own fan-out must be split into parallel lanes by you, before dispatch. A lane you expect to subdivide itself is a lane that runs sequentially.

**Give every lane a `Consumes:` / `Produces:` block.** Names and types, not prose. A lane sees only its own brief, so this is the only way it learns what the neighbouring lanes call things. Without it, parallel lanes drift and the drift surfaces at integration, when it is most expensive.

```
Consumes: SessionToken { id: string, expiresAt: Date } from lane 2
Produces: refreshToken(token: SessionToken): Promise<SessionToken>
```

**The preflight conflict scan emits rows, not a verdict.** One row per lane pair sharing a file or an interface, with the shared thing named. *"The scan is clean" without those rows is not a scan you ran*. It is a claim about a scan. Same evidence-not-verdict rule the review lanes already follow, applied to planning.

**And a floor: do not fan out when the work is coupled.** Fan-out buys independence and taxes coupling. Each lane rebuilds context from cold, and you pay that N times for isolation two coupled lanes cannot use. Upstream ran every plan through per-task dispatch with no such floor. And one documented case spent **68M tokens on ~3,000 lines**, 22.5M of it on planning alone. Two lanes that must agree on an interface are one lane.

## 3. Verify each stage with a check that can fail

A test that runs; a file provably in the expected shape; a source actually fetched and read; output diffed against the spec.

**"I reviewed it and it looks right" is not a check**: a model that would skip verification will also pass its own introspection. No failable check exists? Say so and mark its output unverified with a `Waived:` line, so the gap is visible downstream.

**Write the waiver down, as a `Waived:` line in the stage map**: the stage, and why nothing there could fail. And repeat every one of them in the final message. **At the third `Waived:` line, stop and surface all three.** The count then lives in a written artefact instead of your memory, where a later grep can audit it. And three uncheckable stages in one run is usually one wrong plan rather than three unlucky ones.

The loop runs backward too: **if a fix invalidates an earlier stage, re-run that stage's check before continuing.** An error caught at stage 3 is trivial; at stage 8 it is not.

**A stage check that fails twice is not a third attempt.** The second failure says the cause is not what you think it is, and a third guess costs more than finding out. Hand it to the `omc-slim:tracer` agent, which is built for exactly the state you are in: a fix already tried, and the failure still unexplained.

**Set-shaped work closes by diffing the set.** Re-run the enumeration that defined it and list every member you did not touch, each with a reason. "Already conformant" is a reason; absence from the list is not. Derive the set from a command and show it. One glob misses a whole subtree, and a second, differently shaped search is what catches that.

### Review gates

**One gate per phase, and the phase's kind picks who runs it.** A phase that lands code is gated by the `omc-slim:review` skill. A phase that makes an architecture, security or data-integrity call is gated by the `omc-slim:oracle` agent. A phase that does both gets the `omc-slim:review` skill as its gate plus **at most one** oracle escalation on the named decision. Never both as parallel gates, which doubles the spend and holds two budgets for one gate.

**You own the marker and the count; the gate does not.** Stamp `Gate N — attempt M of K` into whichever gate you open, and the per-gate budget with it. A gate carries the marker you gave it and never issues its own. Two components each keeping a count is how one gate silently becomes two.

**Open a gate through its own tool.** `omc-slim:review` is a skill and goes through the Skill tool; `omc-slim:oracle` is an agent and goes through the Agent tool. This section says "gate" for both because the phase decides which one, not because they are dispatched alike.

Gates go after each phase, never after each edit. Take the phases from the work's own dependencies and delivery boundaries; never split work to shrink a gate. Hand the gate the confirmed findings and file references you already have, so it assesses the work instead of redoing discovery. Give it evidence, never a verdict: naming a severity or a concern to skip decides the review before it runs. Batch its material findings into one remediation pass and verify that. Once validation passes and no material blocker remains, advance. Do not keep refining because refinement is possible.

**Scan structure in the same message, when the phase moved structure.** Dispatch an explorer alongside the gate, over the phase's changed paths and their immediate dependencies, **if that phase changed module boundaries, dependency direction, or where files live.** A phase that only changed behaviour inside existing files has no structure to scan, and the scan returns a map of what you already knew.

Cheapest agent, runs in parallel, so when it does run the gate costs no extra wall time. Do not open a second gate for what the scan found.

**Brief it for locations, never for judgements.** Duplication, responsibility overlap and a misplaced file are all conclusions about what was found, and the `omc-slim:explorer` agent is forbidden to draw one. Ask it to and you get either a refusal or a judgement from the agent least equipped to make it. Ask instead for the evidence a judgement needs: every file matching these two shapes, every import edge crossing this boundary, every caller of the symbols this phase moved. **You read the map and decide what warrants action.**

**Cap the re-reviews.** **This budget is per gate, not per run**: a run with four gates holds four budgets. One review per gate and **at most two re-reviews, three while a Critical is still open**. Every gate you open states where it is: `Gate 2 — attempt 2 of 3`. Spend one only when remediation materially changed the decision, or the original concern resisted focused evidence: never to re-confirm a mechanical change. Budget exhausted with a material risk still open: record it and ask whether to accept it, cut scope, or authorise another pass. Do not quietly loop.

**Checkpoint at a delivery boundary, not after every phase.** A commit point belongs where the phase leaves the tree in a state someone could ship, revert to, or hand over. Not wherever a stage happened to end. Phases that only make sense together get one checkpoint, at the end of the group. Those points were in the map the user saw before execution started (§1). Commit once per checkpoint, after the phase, or the group, validates and its findings reconcile. Work that goes wrong later costs back to the last boundary, not the run. Asked not to commit? Say the checkpoint is available and carry on.

### Rulings, not stalls

**A running plan does not wait on a human.** Four things **block execution**, and only these. An irreversible or destructive operation, a security-sensitive action, a side effect outside this worktree, or a plan so broken every path is a guess.

Surfacing is a different act and that list does not bound it. The warning threshold below stops to *report* three accumulated concerns, and a third `Waived:` line stops to report all three. An exhausted review budget stops to *ask* about a risk still open, and §1's shrinking assumption stops to ask before the map runs. Every one of them hands the user a decision. A ruling is what you make when no decision is owed.

Everything else gets a **ruling**. Decide, and log it:

```
Ruling: used the existing retry helper rather than adding backoff to the client — one implementation beats two — costs a refactor if the client later needs different semantics
```

Collect every ruling into the final message. **That roll-up is the only place decisions taken on the user's behalf reach them. A ruling that dies with the workspace was a decision made in secret.** A wrong ruling costs rework they can see and undo. A session parked on a question costs their whole day and buys nothing. One upstream report records a run blocked for nearly nine hours.

## 4. Self-critique before delivery

Read the result as a skeptical reviewer would and answer both, as defect reports on your own work rather than introspection:

1. **What are you least confident about?** The weakest claim, file, config, edge case or assumption. "Nothing" is not allowed.
2. **What is the biggest thing you are missing?** The unknown unknown: a false premise, a file left unread, live state you assumed instead of checked.

Honest checking turns up nothing? Say so. Do not manufacture a weakness to satisfy the ritual.

**Then state what would have to be true for the plan to be wrong, and go check that exact thing.** Asking what you are least confident about invites introspection; asking what would falsify you sends you to evidence.

**Check it against the world, not against your memory.** Read the file, run the command, search the history that would show the falsifier. A review shaped to confirm the plan confirms it, every time, and tells you nothing.

A confirmation-shaped review confirms; only a seat that reads the history can overturn two that agreed.

**Verify a problem before flagging it**: the `omc-slim:verification-planning` skill holds the procedure. Absence of evidence is not the finding.

## Operational rules

**Warning threshold.** Minor concerns accumulate over a long run. Keep count. **At three, stop and surface** them together: three small things pointing the same way usually mean one real problem needing a decision.

**Find-and-replace safety.** Anchor on word boundaries, and check the result. The `omc-slim:fixer` agent runs the bulk edits and holds that procedure.

**Progress file, which is also the handover.** Write this file at every phase boundary and before any handover, so a fresh session can continue from it. Compaction keeps what was built and loses what was decided against. Work spanning sessions keeps a log at `docs/deepwork/<task-slug>.md`. It holds current understanding, confirmed findings, phase status, validation results, open questions, what was tried and failed, and the next first action. Reference files by path, never paste contents. Update after decisions, reviews, phase completions and scope changes; re-read it before continuing.

A dead end nobody wrote down gets walked a second time by whoever picks the work up next. One line each is enough. The next first action must be executable without reading anything but this file. "Carry on with the migration" fails that test, "re-run the seed script against staging and compare row counts" passes.

**Designer handoff.** The standing design-handoff rule already governs what survives; a phase adds one thing to it. Record the important visual decisions in the progress file, because the next phase reads that file and not the transcript where the designer explained itself.

## Risk, and domains that differ

**Taking a calculated risk requires naming the instrument that will detect the damage, before you take it.** **Research, data and multi-session work each change what a stage has to produce.** Those variations and the risk rules live in `depth.md`; open it when either applies.

## What this does not do

It does not make the underlying reasoning better. It shapes procedure: decomposition, delegation, verification habits. When a task is genuinely beyond reach, say so rather than producing plausible-sounding wrong output.
