# The bar: what a plugin in this category has to be true of

Derived 2026-08-29 from five research lanes — the competitive field measured
through the GitHub API, a cross-ecosystem mechanism harvest, the user-complaint
corpus, an adversarial audit, and a sweep of the tools people use to detect
AI-generated work. Every criterion below is either measurable or falsifiable. A
criterion that is neither is a preference, and preferences do not belong here.

This is written for anyone building in this space, not only for this project.
Where omc-slim fails a criterion, it says so.

---

## Part 1 — the four disqualifiers

Fail any of these and nothing else matters.

### D1. It must survive the first session

Retention in this category is decided immediately. The complaint
corpus is full of *"I removed all my plugins"* and *"is X still worth it"*, and
the pattern in the dead projects is that nobody announces leaving. `ccpm` (8,354 stars),
`agent-os` (5,346) and `SuperClaude` (23,848) are all dead without archive
banners, the last with four people filing an issue in ninety days.

The check: install on a clean machine. In the first session, does a user who
knows nothing see the plugin do something they would not otherwise have got? If
the honest answer is "eventually, on the right kind of task", the plugin is
already lost. **omc-slim: unverified.** The three liveness sessions that would
answer it have never run.

### D2. Its cost must be visible and defensible before it is asked for

*"You can remove tens of thousands of startup tokens just by
disabling these bloated schemas you don't use."* Startup context is under active
suspicion, and a plugin is judged against that suspicion **before** it is judged
on merit.

The real cost is not money. It is attention: LongCodeBench records a model
falling 29% to 3% between 32K and 256K, so always-on tokens come out of the
budget that decides whether the model can still find what it needs at turn forty.

The check: can a user learn the always-on cost in one command, and is the
number the whole number? omc-slim: yes, and it was wrong until today. The published figure counted
description text and not the ~42 tokens per component of framing the harness
charges on top. It is stated as a floor now.

### D3. It must not make a claim its own evidence contradicts

This is the category's signature failure. Vendor multipliers with
no control arm, benchmark tables with no method, "30–50% fewer tokens" with
nothing behind it. A reader who catches one unfounded claim discards the rest,
correctly.

The check: take every claim on the first screen and ask what would falsify
it. omc-slim failed this twice this week. Its published description led with
"delegation over accumulation" while its own benchmark ran zero subagents, and
its strategy document claimed to be the only project in the category with a
head-to-head benchmark when there are at least five. Both corrected.

### D4. It must not read as generated

A Bynder-sourced figure cited by practitioners has **52% of
consumers stopping reading the moment they suspect AI**. Heavy LLM users — the
exact audience here — identify machine text at roughly 90%, where the general population is at chance.

And there is no scanner to pass. Weber-Wulff et al. tested fourteen
detectors: none reached 80% accuracy. Liang et al. found seven flagging **61% of
supervised TOEFL essays** as machine-written. Technical, heavily-revised, short
sections: every condition that breaks a detector describes this kind of
repository. So the defence is craft, and craft is measurable even where detection
is not. `scripts/check-prose.sh` measures it here.

---

## Part 2 — the five things that make it worth keeping

### K1. One thing, done measurably

The strongest signal in the competitive data: the projects that win
distribution in this ecosystem are single-purpose: `caveman` (101,699 stars, one
skill, publishes a bootstrap CI and a regression it found in itself), `ponytail`
(115,938, one skill), `planning-with-files` (26,412, one mechanism, 30 objective
assertions under Anthropic's own eval framework).

The projects that died were frameworks. And the successors of the dead ones are
smaller than what they replaced: four of five, three by 60–75%, because they
became products. Markdown in a repository is what people install. The moment it
is `npm install -g`, the curve breaks.

omc-slim ships twelve components and has zero stars. That is the single
clearest strategic fact available.

### K2. A mechanism that makes the model stop

**The largest measured effect in any evidence this project holds: +14.50 points
for +0.60M tokens**, in a control-armed, twice-blind-judged comparison. Not a gate that exists. *A human stops and decides.*

It is also the one thing the platform cannot take. Native Dynamic Workflows are
GA and better at orchestration in every respect, and their documentation states
the limit outright: **"No mid-run user input. Only agent permission prompts can
pause a run."**

The design detail that makes a stop survive contact with users, taken from an incident
report: gate on "can this be undone?", never on "is this important".
The importance question fires on everything and gets ignored. The reversibility
question fires rarely and gets respected.

### K3. A mechanism that catches the model certifying itself

The second-most-cited complaint, verbatim: *"my problem with Claude wasn't
writing code, it was that it graded its own homework and gave itself an A."*

And it is measured. On one 45-task benchmark an agent reported 45/45
complete; 26 passed held-out tests. **19 false positives, 42%**, on a transcript
reading `5/5 tests pass` about a suite of eight. The same 19 failed identically
on two vendors' models, so this is the agent loop's shape rather than one model's
defect.

Prose alone does not close it, because the prose is already there and the failure
happens anyway. The machine-checkable half, *asserted a pass and ran nothing*, needs no
cooperation from the model at all.

### K4. It must degrade honestly when it is inert

A plugin can install and do nothing: another plugin takes the output-style slot,
the Agent tool is gated by default, a skill never matches. **The user must learn
this from the product within one session**, not from an incantation they had to
know to type.

The subtlety that makes this hard: a presence-only signal cannot report its own
absence. If the layer is not loaded, the instruction to announce itself is not
loaded either. So the README must teach the user to read the **silence**.

### K5. Every number must be re-derivable by the reader

Not "we measured it" — the command, in the repository, that produces the number
again today. This is the only claim in the category that cannot be faked, and it
is worth more than any performance figure, because performance figures in this
space are uniformly unverifiable.

The corollary that hurts: publish the negative result. omc-slim's is that its
headline win came with zero delegation. `caveman` publishes a case where it made
things 9.9% worse. Overstory's author measured his own thesis (*"the 2-hour speedup
cost $51 in additional coordination overhead"*), published eight failure classes,
and archived the tool. That document is the best thing in the category
and it is the README of a dead project.

---

## Part 3 — the checkpoints, in order

Run these in sequence. Each is falsifiable and most cost nothing.

| # | Checkpoint | How it fails |
|---|---|---|
| 1 | Every published number has a command in the repository that reproduces it | Run the commands. Any figure that only exists in prose is a defect |
| 2 | No claim on the first screen contradicts the project's own evidence | Take each claim, name what would falsify it, check whether that already happened |
| 3 | The prose passes the style thresholds a hostile reader applies | `check-prose.sh`, or the equivalent. Em-dash density and bolded lead-ins are the two visible in ten seconds |
| 4 | Contradiction sweep over the whole prompt surface | Two shipped sentences giving different answers to one question. On this project's first run as a gate it found **eleven, six introduced by the release being gated** |
| 5 | Every rule can fire | An instruction depending on a tool the agent is denied; a handoff to a component that would refuse it; text past the 5,000-token re-attach boundary |
| 6 | Every gate proved able to fail | Seed the violation, watch it fire, remove it. A gate never seen red is a claim |
| 7 | The always-on cost stated as the whole cost | Including per-component framing the harness adds and a text measurement cannot see |
| 8 | One fresh-install session on a clean machine | If nothing visible happens, D1 has failed |
| 9 | One adversarial-install session | Another plugin forcing a style; a gated Agent tool. Does the user find out? |
| 10 | The delegation claim measured, or dropped | Transcript-verified, against a task where delegation could pay, with an arm that has delegation denied. Without that arm you cannot tell the prompt from the routing |
| 11 | The self-cert hook covers the worker that writes | v0.9.9: Stop on the main thread tells the user, argv0 matching through wrappers, a session-scoped FileChanged ledger. Paid eval B1 unrun. |
| 12 | Official catalog listing, or a dated reason to stay off it | 291 plugins in the 2026-08-30 catalog. omc-slim is not one. Superpowers has 1,081,334 unique installs |
| 13 | Unused components are labelled wagers or removed | Two dogfood sessions used 3 of 12. The other nine still load descriptions every turn |
| 14 | One identity sentence on GitHub, marketplace, output-style description, and README | v0.9.9: style, marketplace, plugin.json, README, and GitHub description agree on discipline layer. |

Standing 2026-08-29: claimed pass on 1–7, 8–10 unrun.

Standing 2026-08-31, after v0.9.9: checkpoint 1 matches the measured figure
in-repo (2,061 real / 2,334 chars/4). The GitHub description is the
maintainer's to update after the tag. Checkpoint 11 is implemented, unpaid.
Checkpoints 2, 8, 9, 10 still unrun. Checkpoint 12: still not in the official
catalog. Checkpoint 14: identity agrees across style, marketplace, plugin.json,
README, and GitHub. The contradiction sweep ran on this build: 127 findings, 4
critical, 44 required, 79 optional. A ten-lane review under the `review` skill
and a fresh-context adversarial pass then found 103 more: 2 critical, 43
required, 58 optional. All six critical are closed; the required items still
open are named in the CHANGELOG. Not v1.0. The merge-everything
refusal stands. Headline-hole cover is in the tree. Worker JSON fences and paid
evals from [ARCH-SPEC-2026-08-31.md](./ARCH-SPEC-2026-08-31.md) are not. Full
restatement: [BRUTAL-AUDIT-2026-08-31.md](./BRUTAL-AUDIT-2026-08-31.md).

---

## Part 4 — what nobody has built

Two problem classes, both real, both unclaimed, and both closer to a discipline
layer than orchestration is.

Drift detection. Does the agent still follow the rule forty turns in? The
evidence says no — multi-turn instruction adherence drops **39% on average**
across 200k+ simulated conversations, and constraint violations run 0% while a
policy is in full context against **30% after compaction, up to 59%**. Every
plugin in this category ships rules and none of them measures whether the rules
are still firing. The measurement is not hard: a canary rule with an observable
consequence, checked at intervals.

Onboarding quality. The first session decides retention, and nothing measures
it.

Four more classes have owners and are worth knowing about rather than building:
crash and compaction survival, cost attribution per rule, codebase indexing as a
token strategy, and security posture.

---

## The shortest version

A plugin in this category earns its place if it stops the model at the right moment,
catches it certifying its own work, costs less attention than it saves, and can
prove all three with a command anyone can run. Everything else, the roster and
the orchestration and the architecture diagram, is either downstream of those or
decoration.

The uncomfortable corollary, from the only n=500 study in existence: a discipline
layer changes what you fail at and what it costs, and does not measurably change
whether you succeed. A project that says so on its first screen is
telling the truth in a category where nobody else does, and that is a smaller
claim than most of them make and the only one that survives being checked.
