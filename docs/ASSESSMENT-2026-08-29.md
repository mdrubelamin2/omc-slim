# What this plugin actually is, and whether anyone should install it

Written 2026-08-29, after four releases in one session and a full read of every
shipped file. Commissioned with an explicit instruction not to look only at the
good parts.

**This section is the orchestrator's own view.** Four research lanes ran
alongside it — competitive landscape, cross-ecosystem harvest, user-frustration
corpus, adversarial audit — and their findings are in the sections that follow.
Where they disagree with this one, they are the evidence and this is an opinion.

---

## 1. The verdict, first

**The product is good and the pitch is wrong, and the pitch being wrong is the
biggest risk it carries.**

omc-slim is named, described and architected as an orchestrator. Its own
benchmark produced its headline win — 18% cheaper at equal correctness — with
**zero subagent invocations in any arm**. The plugin's best-evidenced single
mechanism is a *stop*: `deep-interview`'s approval gate, measured at **+14.50
points** in a control-armed comparison, the largest published effect for a prompt
layer anywhere in this project's evidence. Its second-best is a *register*: the
terse output rules, which the benchmark showed as its most consistent signal
(251 LOC against plain's 434, six flags against sixteen).

Neither of those is orchestration. **The thing that works is a discipline layer,
and the thing on the label is an agent roster.**

That mismatch is not cosmetic. It sets what a new user expects in the first
session, and the first session is where retention is decided. A user who installs
"an orchestrator" and watches the main thread do the work itself concludes the
plugin is broken. A user who installs "a discipline layer that also has
specialists" and watches the main thread do the work tersely, check itself, and
stop before building the wrong thing, concludes it is working — because it is.

## 2. Five independent sources say the central bet is wrong

This is the part the project has documented honestly and then not acted on.

| Source | Finding |
|---|---|
| Anthropic, multi-agent research system | *"most coding tasks involve fewer truly parallelizable tasks than research, and LLM agents are not yet great at coordinating and delegating to other agents in real time"* — their +90.2% was breadth-first research, not code |
| Cognition, *Don't Build Multi-Agents* | *"running multiple agents in collaboration only results in fragile systems"* — and they reversed their own prior position to say it |
| MAST, arXiv 2503.13657 (NeurIPS 2025) | 1,600+ traces, 7 frameworks: *"performance gains on popular benchmarks are often minimal"* |
| Nature MI | every multi-agent arm lost on SWE-bench Verified |
| **This repository's own benchmark** | zero subagents ran in any arm; the measured win came from the prompt |

**Five against, zero for.** No source in this repository's evidence supports
delegation improving coding outcomes. The honest reading is that the roster is a
*context-isolation* device — which is a real and different benefit, worth having
for `explorer` and `librarian` specifically — and not a performance device.

The counter-argument the project makes, and it is a fair one: context collapses
96% → 14.7% from 8K to 256K, and isolation buys that back. That defends
`explorer` (return a map, not the search) and `librarian` (return a finding, not
the pages). It does not defend a six-agent roster.

## 3. The existential fact nobody in this repository has fully absorbed

**Dynamic Workflows went GA.** Not experimental — GA on all paid plans, Pro by
opt-in. A JavaScript script orchestrating dozens to hundreds of subagents through
`agent()`, `pipeline()`, `parallel()` and `phase()`, with resumable runs, a
progress UI, prompt-cache-aware staggering, and concurrency caps. **Plugins may
ship a `workflows/` directory.** The documentation addresses this project by
description: *"If you already have an orchestrator built another way, such as a
folder of subagent prompts or a skill that fans work out, you can point Claude at
it and ask for a workflow that does the same thing."*

omc-slim's orchestration is prose. Workflows are code, with state, resumability
and a UI. On the orchestration axis specifically, **this is not a competition
omc-slim can win**, and pretending otherwise is how a project spends two years
defending a position that fell.

The seam is real and it is narrow: workflows take **no mid-run user input** —
*"For sign-off between stages, run each stage as its own workflow."* A human gate
between dependent stages is exactly what `deepwork` is, and it is exactly what a
workflow structurally cannot hold. That is one true differentiator, and it is a
paragraph, not a product.

## 4. What the honest product is

Strip out what the evidence does not support and what the platform now does
better. What survives:

1. **The register.** Terse, senior, no preamble. Measured, and it addresses the
   single most saturated user complaint in the corpus — ~20 distinct threads,
   *"it is physically hurting me to read Opus 5's output"* — where the reported
   fix that *fails* is exactly the prompt layer: *"I have tried editing style
   config, a custom system prompt per project, and global as well as project
   level claude.md edits, to no avail."* An output style is not a CLAUDE.md rule;
   it is applied through `force-for-plugin`, which is why this one works where
   those did not.
2. **The stops.** `deep-interview`'s approval gate is the highest-value mechanism
   in the evidence. Anything else shaped like it is worth more than another agent.
3. **The self-certification rule.** *"The pass that produced a change cannot be
   the pass that clears it"* — the best-supported rule in the plugin (clean-context
   reviewer F1 28.6% against 24.6% for same-session self-review), and it answers
   the second-most-cited complaint: *"my problem with Claude wasn't writing code,
   it was that it graded its own homework and gave itself an A."*
4. **Two context-isolating agents.** `explorer` and `librarian` return a map and
   a sourced finding instead of filling the caller's window. This is the one place
   delegation is defensible on the evidence.
5. **The honesty apparatus.** COVERAGE, REINFORCEMENT, the contradiction sweep,
   the measured figures, the published negative result. This is the actual moat:
   the external research pass found **no published head-to-head benchmark of any
   orchestrator plugin against stock Claude Code, anywhere** — including
   claude-flow at ~70k stars.

That is a product. It is a smaller product than the one on the label.

## 5. The cost, stated the way a sceptical user will state it

4,309 tokens of always-on context, plus on-invoke bodies up to 35,619 if
everything fires.

On a subscription the direct cost is not dollars, and that is the wrong frame
anyway. **The real cost is attention.** This repository's own LIMITATIONS cites
LongCodeBench: Claude 3.5 Sonnet falls **29% → 3%** from 32K to 256K, and
Anthropic's own guidance says recall degrades as the window fills. So 4,309
tokens is not free even when it is free — it is 4,309 tokens of the budget that
decides whether the model can still find the thing it needs at turn forty.

The user-facing question is therefore not "what does this cost" but **"what does
it have to be worth"**. The bar: it must save more attention than it spends. A
terse register that halves output length plausibly does. A six-agent roster that
never fires certainly does not.

**Startup tokens are under active suspicion in the community right now** —
*"you can remove tens of thousands of startup tokens just by disabling these
bloated schemas you don't use"*; *"At one point I made sure to remove all plugins
and skills"*; *"Is Superpowers still relevant?… do all the improvements in CC
negate the need for this set of skills?"* A 4,309-token plugin is judged against
that suspicion **before** it is judged on merit.

## 6. The AI-slop trap this project is standing in

Here is the uncomfortable one.

**This project's greatest strength and its worst surface signal are the same
thing.** Every claim is sourced. Every number is re-derivable. Every refusal
carries a trigger. The result is 144KB of research documentation, a README dense
with caveats, and prose full of em-dashes, tricolons and bolded lead-ins.

That is *precisely* the surface signature of AI slop — because slop imitates
thoroughness. A sceptical reader who lands on a repository with eleven markdown
files in `docs/`, a 144KB research document and a README that opens with three
paragraphs of statistical caveats does not think *"rigorous"*. They think
*"generated"*, and they close the tab. The honesty that is the moat is invisible
to the person who has not read it, and it is *actively suspicious* to the person
who has only skimmed it.

**The fix is not to write less honestly. It is to make the first screen carry
evidence a human can verify in ten seconds.** Concretely:

- **A negative result on the first screen.** *"We benchmarked our own plugin and
  here is what it can't do"* is something no generated README says, because
  generated READMEs sell. This project already has the negative result. It is
  three paragraphs down, framed as a caveat, when it is the single most
  differentiating sentence available.
- **One artefact a reader can run in one command** and see a real number come
  out. `./scripts/measure-context.sh` prints a table it derived; nothing about
  that is fakeable.
- **Dates and names on decisions.** A ruling with a date, a reason and a
  reopening trigger reads as human because a generator does not commit to a
  trigger it will be held to.
- **Fewer documents, not shorter ones.** Eleven files in `docs/` signals
  volume-as-value. The research is worth keeping; the *count* is the tell.

## 7. What I would do next, in order

1. **Reposition before distributing.** The listing, the description and the
   README's first line should say discipline layer, not orchestrator. Cost:
   words. Value: it stops the first session from disappointing.
2. **Run the delegation benchmark, or drop the claim.** `docs/INSTRUMENTS-R4.md`
   §1 specifies it: a four-adapter multi-file task where delegation can actually
   pay, a correctness fixture the arms never see, transcript-based delegation
   detection, and a third arm with `Agent` denied — which is the arm that settles
   whether the win is the prompt or the routing. 15 runs, ~$45–60. **Until it
   runs, the word "orchestrator" is unsupported.**
3. **Cut the roster to what the evidence defends**, or state plainly which agents
   are unmeasured. Five components survived the keep/cut audit as "cannot"; four
   are wagers. Shipping wagers is fine. Shipping them without saying so is not.
4. **Fix the surface-signal problem** in §6. It is cheap and it is the difference
   between being read and being closed.
5. **Decide the name before the listing.** The migration path exists
   (marketplace `renames` maps plugin names, verified in the binary) and the cost
   never gets lower than today.

## 8. The assumption nobody has tested

Every file in this repository rests on one unexamined premise: **that prompt text
changes behaviour enough to be worth its context cost, on the current model
generation.**

The project's own §10.1 records the tension and does not resolve it: *"the value
of any prompt layer appears to decay with each model generation"*, and omc-slim
targets Opus 5, the strongest tier, where three independent measurements say the
layer matters least. Anthropic removed 80% of Claude Code's own system prompt
with no measurable loss on their coding evals.

Nobody has run the one experiment that would settle it: **the plugin against no
plugin, on a task where its rules should obviously help**, with the rules
individually ablated. The eval suite for it is written and has never executed.

That is the honest state: a carefully built, carefully measured layer whose
central premise is untested, in a category where the platform is moving faster
than the layer.

**It is still worth shipping**, because the register and the stops are supported
by evidence the alternatives do not have, and because being the only project in
the category with a published negative result about itself is a real position.
But it should ship saying what it is.
