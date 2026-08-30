# What this plugin actually is, and whether anyone should install it

Written 2026-08-29, after four releases in one session and a full read of every
shipped file. Commissioned with an explicit instruction not to look only at the
good parts.

**This section is the orchestrator's own view.** Four research lanes ran
alongside it (competitive landscape, cross-ecosystem harvest, user-frustration
corpus, adversarial audit) and their findings are in the sections that follow.
Where they disagree with this one, they are the evidence and this is an opinion.

---

## 1. The verdict, first

**The product is good and the pitch is wrong, and the pitch being wrong is the
biggest risk it carries.**

omc-slim is named, described and architected as an orchestrator. Its own
benchmark produced its headline win, 18% cheaper at equal correctness, with
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
stop before building the wrong thing, concludes it is working. Because it is.

## 2. Five independent sources say the central bet is wrong

This is the part the project has documented honestly and then not acted on.

| Source | Finding |
|---|---|
| Anthropic, multi-agent research system | *"most coding tasks involve fewer truly parallelizable tasks than research, and LLM agents are not yet great at coordinating and delegating to other agents in real time"* — their +90.2% was breadth-first research, not code |
| Cognition, *Don't Build Multi-Agents* | *"running multiple agents in collaboration only results in fragile systems"* — and they reversed their own prior position to say it |
| MAST, arXiv 2503.13657 (NeurIPS 2025) | 1,600+ traces, 7 frameworks: *"performance gains on popular benchmarks are often minimal"* |
| Nature MI | every multi-agent arm lost on SWE-bench Verified |
| **This repository's own benchmark** | zero subagents ran in any arm, with delegation available and never chosen. Tested on 2026-08-29, not inferred |

Five against, zero for. No source in this repository's evidence supports
delegation improving coding outcomes, and the one it cites hardest was attacked
twice in one day and survived: a mid-session correction claimed the benchmark's
allow-list excluded the `Agent` tool, and a review then tested that rather than
reading it. `--allowedTools` is an additive permission grant, so delegation was
available and simply not chosen. The correction is retracted in
[BENCHMARK.md](./BENCHMARK.md), where both versions stand. The honest reading is
that the roster is a
*context-isolation* device, which is a real and different benefit, worth having
for `explorer` and `librarian` specifically. It is not a performance device.

The counter-argument the project makes, and it is a fair one: context collapses
96% → 14.7% from 8K to 256K, and isolation buys that back. That defends
`explorer` (return a map, not the search) and `librarian` (return a finding, not
the pages). It does not defend a six-agent roster.

## 3. The existential fact nobody in this repository has fully absorbed

**Dynamic Workflows went GA.** Not experimental: GA on all paid plans, Pro by
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
   single most saturated user complaint in the corpus, ~20 distinct threads of
   *"it is physically hurting me to read Opus 5's output"*, where the reported
   fix that *fails* is exactly the prompt layer: *"I have tried editing style
   config, a custom system prompt per project, and global as well as project
   level claude.md edits, to no avail."* An output style is not a CLAUDE.md rule;
   it is applied through `force-for-plugin`, which is why this one works where
   those did not.
2. **The stops.** `deep-interview`'s approval gate is the highest-value mechanism
   in the evidence. Anything else shaped like it is worth more than another agent.
3. **The self-certification rule.** *"The pass that produced a change cannot be
   the pass that clears it"* is the best-supported rule in the plugin (clean-context
   reviewer F1 28.6% against 24.6% for same-session self-review), and it answers
   the second-most-cited complaint: *"my problem with Claude wasn't writing code,
   it was that it graded its own homework and gave itself an A."*
4. **Two context-isolating agents.** `explorer` and `librarian` return a map and
   a sourced finding instead of filling the caller's window. This is the one place
   delegation is defensible on the evidence.
5. **The honesty apparatus.** COVERAGE, REINFORCEMENT, the contradiction sweep,
   the measured figures, the published negative result. **This was described as
   the moat, and the description was false. See §8.** What survives is narrower:
   a committed re-runnable harness, and a published negative result about the
   project's own central mechanism.

That is a product. It is a smaller product than the one on the label.

## 5. The cost, stated the way a sceptical user will state it

4,885 tokens of always-on context, plus on-invoke bodies up to 35,868 if
everything fires.

On a subscription the direct cost is not dollars, and that is the wrong frame
anyway. **The real cost is attention.** This repository's own LIMITATIONS cites
LongCodeBench: Claude 3.5 Sonnet falls **29% → 3%** from 32K to 256K, and
Anthropic's own guidance says recall degrades as the window fills. So 4,885
tokens is not free even when it is free. It is 4,885 tokens of the budget that
decides whether the model can still find the thing it needs at turn forty.

The user-facing question is therefore not "what does this cost" but **"what does
it have to be worth"**. The bar: it must save more attention than it spends. A
terse register that halves output length plausibly does. A six-agent roster that
never fires certainly does not.

**Startup tokens are under active suspicion in the community right now.**
*"You can remove tens of thousands of startup tokens just by disabling these
bloated schemas you don't use"*; *"At one point I made sure to remove all plugins
and skills"*; *"Is Superpowers still relevant?… do all the improvements in CC
negate the need for this set of skills?"* A 4,885-token plugin is judged against
that suspicion **before** it is judged on merit.

## 6. The AI-slop trap this project is standing in

Here is the uncomfortable one.

**This project's greatest strength and its worst surface signal are the same
thing.** Every claim is sourced. Every number is re-derivable. Every refusal
carries a trigger. The result is 144KB of research documentation, a README dense
with caveats, and prose full of em-dashes, tricolons and bolded lead-ins.

That is *precisely* the surface signature of AI slop — because slop imitates
thoroughness. A sceptical reader who lands on a repository with thirteen markdown
files in `docs/`, a 144,673-byte `RESEARCH-2026-08-26.md`, and a README opening on
three paragraphs of statistical caveats does not think *"rigorous"*. They think
*"generated"*, and they close the tab.

*(That count said eleven when this paragraph was first written. It was wrong, in
the paragraph arguing this project's numbers are checkable, and a research lane
caught it with `ls`. Corrected in place, with the error left visible, because the
mistake is more useful to a reader than the correction is.)* The honesty that is the moat is invisible
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

**Revised after the competitive sweep landed.** The original list assumed
measurement was uncontested ground. It is not, and that changes the order.

0. **Correct the moat claim everywhere it appears, first.** A project whose
   stated virtue is honest measurement cannot survive being wrong about who else
   measured. Done in `VIABILITY-2026-08-28.md` and here; anything downstream that
   repeats it needs the same treatment.
1. **Reposition before distributing.** The listing, the description and the
   README's first line should say discipline layer, not orchestrator. Cost:
   words. Value: it stops the first session from disappointing — and the n=500
   study makes the reposition *more* honest, not less, because it measured a
   discipline layer and found exactly what this project already publishes about
   itself.
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
5. **Take one of the six unclaimed scopes in §9, or take drift detection.** The
   field's shape is now clear: one skill with one number is what gets installed,
   and `caveman` (101,699 stars, one skill) and `ponytail` (115,938, one skill)
   are the proof. This repository ships twelve components and zero stars. The
   two scopes nobody has taken — *does the agent still follow the rule forty
   turns in*, and *onboarding quality* — are both measurable, both unclaimed, and
   both closer to what this project is actually good at than orchestration is.
6. **Decide the name before the listing.** The migration path exists
   (marketplace `renames` maps plugin names, verified in the binary) and the cost
   never gets lower than today.

## 8. The moat was not a moat, and finding that out is the most useful thing here

A competitive sweep on 2026-08-29 falsified the sentence the strategy rested on.
[VIABILITY-2026-08-28.md](./VIABILITY-2026-08-28.md) §0 claimed **no published
head-to-head benchmark of any orchestrator plugin against stock Claude Code
exists anywhere**, and called that the only moat. There are at least five, and
the two that matter are worse news than the count.

**Laszlo, 2026-06-11 — 500 tasks, with significance testing.** Codex against
Codex plus Superpowers, across 59 repositories and 8 languages. Pass rate 45.6%
→ 47.8%: **+2.2pp, not statistically significant**. Tokens 1.56M → 2.18M:
**+625k, significant**. The author's summary is the finding — the framework
*"changed the failure surface"* rather than improving correctness, solving 41
tasks the baseline missed while missing 30 the baseline solved.

That is the study this project's roadmap wanted to run, already run, at n=500, on
the category leader, with a null result on quality and a significant cost
increase. It is the strongest evidence in existence about what a discipline layer
does, and it says: changes what you fail at, costs more, does not make you more
correct.

**Ahmed, 2026-04-13 — omc-slim's two headline findings, four months earlier, on
someone else's plugin.** Twelve automated sessions, six per arm, identical
prompts, zero human intervention: **9% cheaper, ~14% fewer tokens**, and *"token
usage clustered 2–3× tighter than baseline"*. Cheaper and more consistent — the
same two results `BENCHMARK.md` reports at n=3 on one task shape, published on a
279,227-star competitor by someone who ran n=6 across three complexity tiers.

**And `caveman` — one skill, 101,699 stars — publishes a better benchmark than
this repository does.** 54 runs, 18 paired, six immutable fixtures, an
exact-semantic oracle, a 10,000-resample bootstrap CI, a publication gate, and a
regression it found in itself and published anyway (−9.9% on HTML).

**What this costs and what it leaves.** It costs the claim of being alone. It
leaves something smaller and still true: the harness is committed and
re-runnable, and the negative result is about the project's own central
mechanism rather than about an edge case. Two of the five are also reproducible.
So: one of a handful, not the largest, not the most careful.

**It also validates §1 from an unexpected direction.** The n=500 study measured a
discipline layer and found the cost significant and the correctness null — which
is exactly what four independent studies already told this project about rules
layers, and exactly what its own benchmark showed. Every serious measurement in
this space now agrees: **the layer moves cost and process, not correctness.** A
project that says so on its first screen is telling the truth in a category where
nobody else does. That is a smaller claim than "the only measured one", and it is
one nobody can falsify next month.

## 9. Six problems the field has and this project does not name

Found by the same sweep, each with a working project behind it and none of them
mentioned anywhere in these documents.

1. **Crash and compaction survival.** `planning-with-files` keeps plan, findings
   and progress on disk and re-injects them every turn. This project identifies
   compaction eviction as a top failure mode and ships no mechanism for it.
2. **Cost attribution per rule.** `token-warden` charges every rule rent against
   a frozen benchmark and evicts the ones that do not pay. Thirteen stars, and it
   has built this project's stated moat more rigorously than this project has —
   Neyman-optimal allocation, three estimators built, measured and **deleted with
   the reasons published**, and a stated signal-to-noise ratio of roughly 1:100.
3. **Session resumption as a first-class artefact.**
4. **Codebase indexing as a token strategy**, where `codemap` writes markdown and
   the competition builds a queryable graph.
5. **Security posture.** There is no security section in this repository.
6. **Team conventions and multi-repo.** The project that owned this slot is
   dying, so the slot is open.

Two things the sweep looked for and did not find, which are therefore genuinely
unclaimed: **drift detection** — does the agent still follow the rule forty turns
in? — and **onboarding quality**.

## 10. How the dead ones died

Six archived orchestrators, and **none of them died of being unused**.

They died of becoming products. Four of five successor projects are *smaller*
than the thing they replaced, three by 60–75%. Markdown in a repository is what
people install; `npm install -g` breaks the curve.

The more common shape is worse: dying without an obituary. `ccpm` has 8,354
stars, no commit since 2026-03-18, and stranger-filed bug reports from March and
May still unanswered. `agent-os` has 5,346 stars and one issue in ninety days,
its top open request being *"support Claude Code skills format"* — the platform
moved and the framework did not. `SuperClaude` has 23,848 stars and **four**
people who filed an issue in ninety days. None of the three is archived. All
three are dead. **The absence of an archive banner is not a life sign.**

The best document in that whole set is the README of a dead project. Overstory's
`STEELMAN.md` measured its own thesis and refuted it: *"A 20-agent swarm
completing 15 tasks over 6 hours consumed 8M tokens... A single agent completing
the same tasks sequentially over 8 hours consumed 1.2M. The 2-hour speedup cost
$51 in additional coordination overhead."* Its author published eight named
failure classes for the delegation architecture, then archived the tool. That is
a complete pre-mortem for the bet this project has still not tested.

## 11. What the retention data says, and it is not what I assumed

The complaint sweep answered the question I had been answering by intuition, and
corrected me on it.

**People do not abandon a plugin. They stop noticing it, and delete it months
later during an audit triggered by something else.** Two events, a long gap
between them, and everything written about churn conflates the two. The decision
is made in session one; the deletion happens when `/context` reads 51,400 and its
owner spends an afternoon removing everything he cannot point at. One documented
inventory went from **235 components to 87**; others cut 44%, 79%, and 20 global
skills down to 6. Nothing survived above about half in any class.

So a plugin is not uninstalled because it failed. It is uninstalled because, at
audit time, its owner cannot name anything it did. Survivors are not the useful
ones. They are the *legible* ones.

The deletion cadence is published, by the person who built Claude Code: *"for
people that aren't building agentic products but you're using Claude Code, every
6 months delete your CLAUDE.md, delete your skills, delete your hooks. See what
the model does and it might surprise you."* The vendor also ships `/doctor` to
find what to prune. This is not a hostile audience — it is the platform owner
recommending ablation on a schedule that resets every model release.

Three properties predict survival, and "single-purpose" was only one of them.
My earlier reading — that the field rewards one skill with one number — is right
and under-specified in a way that kills plugins:

1. **Narrow scope**, and this is now measured. SkillsBench across 87 tasks and 18
   configurations: *"focused Skills with at most three modules outperform larger
   or exhaustive bundles."* This plugin ships twelve.
2. **Cheap when idle.** Prune pressure tracks how often something loads, not how
   useful it is. Hooks are deterministic and cost zero attention, so they are not
   on the axis at all.
3. **Attributable.** The owner must be able to name what it did — and since
   2026-08-17 that is mechanically enforceable, because Claude Code emits a
   `skill_activated` telemetry event per invocation with name, trigger and source.

**The structural problem that follows, and it is the sharpest finding in the
sweep: an output style never emits an invocation event.** It is applied, not
invoked. So the largest, most expensive, always-on component in this plugin is
also the only one that can never appear in the telemetry its owner will use to
decide what to keep. It carries the highest prune pressure in the repository and
produces the least evidence of having earned it.

That is the field's pricing mechanism arriving at the same answer two audit lanes
already gave, from the opposite direction.

And a claim of mine narrowed. Someone benchmarked a terse plugin against the
literal instruction *"be brief."* across 24 prompts: **indistinguishable on
tokens and on quality**. Compression is not what a register buys. What it buys is
consistency of output shape across runs — which is exactly what this project's
own benchmark measured and a single-shot comparison structurally cannot. The
honest claim is narrower than "terse output is the most valuable thing this
ships", and it is still a real claim.

## 12. Six agents on one model is one perspective billed six times

Anthropic's own multi-agent research, published 2026-08-16, is the strongest
argument against this plugin's architecture that exists, and it is not from a
competitor:

- Swarms building a game: *"In all three versions the resulting games were
  (perhaps predictably) bad."*
- **18 of 30 agents** independently created a git branch named `mvp-game-loop`.
- Multiple agents, across multiple runs, titled a piece of fiction *"The
  Cartographer's Last Commission"* with no subject guidance.
- *"We consistently saw a multiagent turf war… they sabotaged others with
  increasingly aggressive, self-replicating malware."*
- *"Individual agents are 'low variance': they often act the same in situations
  where different people might take a much more diverse range of actions."*

A roster of six specialists running on one model does not buy six perspectives.
**It buys one perspective, billed six times.** The defensible exception is
context isolation — `explorer` and `librarian` return a map and a sourced
finding instead of filling the caller's window — and that argument does not
extend to the other four.

The field agrees from experience rather than from research. *"Sub-agents make
more sense in cases where the agent is dumb to begin with."* *"You would have
been better off handling it serially with yourself in the loop."* And the one
positive delegation report in the whole corpus uses **three** agents and claims
token efficiency, not correctness.

## 13. The assumption nobody has tested

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
