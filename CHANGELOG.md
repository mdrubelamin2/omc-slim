# Changelog

Notable releases. Full reasoning for each is in
[RESEARCH.md](./RESEARCH.md) and [MAINTAINERS.md](./MAINTAINERS.md).

## v0.9.4

Adoption, position, and the first CI this repository has ever had.

**Every gate now runs on every push.** The 2026-08-25 audit found no `.github/`
at all — "for a project whose thesis is 'every claim has a check', the checks are
unenforced". `.github/workflows/gates.yml` runs both hook suites, both mutation
runners, the codemap and base-resolution suites, and the four `check-*.sh`
scripts. `tiktoken` is installed as a hard requirement, because without it the
coverage gate refuses to print a corrected figure at all and that refusal is the
thing that stops a published number resting on a constant.

**Two of the five adoptions were already shipped, and the sixth needed one
sentence.** The backlog required an axis-overlap check before adding a
slop-comment lane to `review`; run, it found `checklists.md` already flags
comments that restate the code and narration the change added, and `review`'s
output already opens with a ship / fix-first / needs-a-decision verdict. Two
adoptions closed at zero tokens by checking rather than adding. The handoff gem
was the same story: `deepwork`'s progress file already holds objective,
decisions, dead ends and next action — what was missing was the sentence saying
you write it and start fresh **instead of compacting in place**, because
compaction preserves what was built and loses what was decided against.

What was genuinely absent: the scripts-over-servers discipline in `librarian` and
`fixer` (write the ten-line command; a server you do not have is not a plan), the
proof-artefact close for `designer` (a render you looked at is evidence, one you
reasoned about is a claim), and **the silenced checker** — `@ts-ignore`,
`eslint-disable`, `noqa`, a lowered coverage floor — which returned zero hits
across this entire plugin. Weakening an assertion was covered in three places;
silencing the checker that reads it was covered nowhere, and it is a different
move.

**650 tokens left `verification-planning`'s always-read body.** All thirteen of
its pinned rules live in one section, `What counts as evidence`, and the seven
numbered procedure steps carried none — which matches the skill's own Scope,
where the staged procedure is explicitly for multi-phase work while a small
change follows the project's checks directly. The standard stays in the body; the
procedure is a conditional sibling.

**`docs/NATIVE.md` publishes the native-equivalents position**, verified against
binary 2.1.251: what each component overlaps, what its residual is, and for the
two crowded slots a dated removal criterion with the falsifying outcome written
down in advance. The row that changed this month is Dynamic Workflows, now GA,
whose documentation addresses orchestrator plugins directly — and whose seam is
quotable from the vendor's own page: workflows take **no mid-run user input**,
and a human gate between dependent stages is exactly what `deepwork` is.

The README leads with the pitch and the install now, with the numbers and their
limits grouped after. The honesty is the moat; it was reading as an apology in
front of it. Teams get one committed `enabledPlugins` line, and Windows gets a
straight answer: everything that runs on a user's machine is Node except
`review`'s base-resolution script, which needs the POSIX shell Git for Windows
already supplies.

**The name stays, and the reason is recorded rather than assumed.** It reads as a
diet fork of a project this one rejects, and the cost of changing it never gets
lower than today — no adoption signal, no listing. But that is the owner's call,
so the ruling puts the migration path on record (marketplace `renames` maps
plugin names, verified in the binary) and fixes the trigger: decide before the
marketplace listing, because that is when the cost stops being bounded.

Static held at 4,309 — down 26 from v0.9.3 and still 112 above where this run
started. Gem 5 was written into the output style and then moved out of it: the
style already says "you are notified when they finish", which blocks the
unread-result case structurally, so the rule earns its place where re-dispatch
actually happens instead.

## v0.9.3

Compression phases 1 and 2, and a do-not-touch list that did not survive being
challenged.

**285 real tokens out of the on-invoke surface**, all of it Rule 2 category 1 —
intra-file duplicates and harness restatements — with every cut behind Rule 0.
The four pin additions landed first, in their own commit, and were proved able to
fail: gutting *"One guard in the shared function is a smaller diff"* while
leaving *"grep every caller"* in place keeps `COVERAGE.tsv` at zero dropped rows
and makes `check-reinforcement.sh` name the loss. That is `51dfbcc` reproduced on
demand.

The largest single cut is the one the compression map predicted: `designer` gave
the same tooling rule twice, 130 lines apart, and it is one paragraph now.
`codemap`'s second worked example went — Rule 2 category 3 trims examples to one,
never to zero, and the example that survives is the one the fixer brief pastes
verbatim. `explorer`'s File-operations and Tool-choice sections answered one
question between them and are one block. Three identical register blocks
compressed in place rather than deleted, because subagents do not inherit the
output style and the agent-side copy is the only copy that agent ever sees.

**Static came down 70 tokens and is still 138 above where this run started.**
Descriptions gave 53 of it: a description carries *when to route*, the body
carries *what happens*, and the six skill descriptions now compete inside a
listing budget Claude Code caps at 1% of the context window — shared with every
other plugin's skills, which is how 24 of 103 skills on one observed machine
ended up with no description at all.

**The ratchet is not paid back, and this entry says so rather than manufacturing
the difference.** v0.9.2 spent 208 static tokens on four defect fixes, three of
them required by a published exit criterion. Safe compression of the style body
yielded 17 tokens against a documented ceiling of roughly 3%. Cutting further
means cutting the roster bullets, whose justification got *stronger* this month,
not weaker. So the number stands, stated, and the ratchet binds v0.9.4 to zero
growth instead of being quietly re-baselined.

**The do-not-touch list, challenged rather than obeyed.** Five of its six entries
hold and one does not. It claims the reference siblings are "pin-dense, already
the compressed form": measured, `review/checklists.md` runs 238 tokens per pinned
rule and `deepwork/depth.md` 243, against 43 for the output style and 59 for
`review/SKILL.md` — the two least pin-dense files in the estate. The conclusion
still stands, because the content is enumerative and a checklist pins its section
rather than each item, but **the stated reason was wrong**, and a claim that is
right by accident is one that will be wrong next time.

## v0.9.2

The correctness release. Twenty-four recorded defects were sitting in the tree
unfixed; nineteen of them had never been re-verified by anyone. All nineteen
still reproduced. No component was added or removed.

**`review` was 298 tokens over the post-compaction cap, and the gate that watched
the cap was the reason nobody knew.** After a compaction Claude Code re-attaches
the first 5,000 tokens of an invoked skill and drops the rest. The corrected
token figure was chars/4 divided by 1.135 — one whole-estate average, taken once
in the 2026-08-25 audit. Measured against a real tokeniser, `review/SKILL.md` was
**5,298 tokens**, while the gate reported 4,956 and called it 44 under. A single
average does not hold per file, and the one file it failed on was the only one
near the limit.

Three things changed, not one. The corrected figure is **measured** per build,
and `measure-context.sh` prints the gap it used to assume. The gate **refuses to
print a corrected figure at all** when no tokeniser is installed, rather than
falling back to a constant. And the cap check stopped asking whether a file is
under a round number: it asks whether any **pinned rule** sits past the 5,000
tokens that re-attach, across every skill. That is `51dfbcc`'s failure — a rule
present, passing every presence check, and not in context when it fires — reached
by position instead of by deletion. Proved able to fail: padding ahead of the
rules reports a pinned rule at token ~6,485. `review` now fits whole, with its
output contract closing at token ~4,860.

**A name is not a type.** Agents and skills both reach the model as bare
`omc-slim:<name>` strings, and the two tool listings share the prefix, so the
model picked the wrong tool — observed: `deepwork` dispatched through the Agent
tool, error, retry as a skill. Every model-facing reference now carries its type
in the same sentence, the output style carries a dispatch rule, and a gate checks
32 references across frontmatter, the style, skill bodies, hook messages and the
README. Agent bodies are deliberately outside that gate, with the reason stated
where the scope is set: a predicate for "a line that instructs onward routing"
needs a keyword list, and a keyword list that misses one returns green over an
unmarked handoff.

**One gate, one owner.** `deepwork` pinned `Gate N — attempt N of M` onto oracle
prompts while `review` claimed the same marker for itself, so a phase that landed
code had no single answer for which gate ran — and running both doubled the spend
and held two budgets for one gate. Now: `review` gates a phase that lands code,
`oracle` gates a phase that makes an architecture, security or data-integrity
call, a phase that does both gets `review` plus at most one oracle escalation,
and `deepwork` owns the marker and the budget. Both gate components carry a
marker; neither issues one.

**The deliverable hook stopped making two false accusations.** It counted only
Edit/Write/NotebookEdit/MultiEdit, so a `fixer` following its own brief — which
sanctions `sed`, `git mv` and code-generation servers — was reported to the user
as having finished without writing anything. And it never looked at *where* a
write landed, so `/tmp/notes.md` satisfied it. It now distinguishes three states
and carries two messages, because one message would be false in one of them.
`fixer`'s output contract names the mechanism whenever a change did not land
through Edit or Write.

**`designer` lost its Review mode and gained the rule inside it.** The
frontmatter forbade critique-only audits; the body shipped a mode for exactly
that; and the hook then warned on the sanctioned no-write outcome, with the test
suite pinning that false positive as expected. Cutting the mode makes the
frontmatter true and removes the need for a heuristic the harness could not
guarantee. What the mode actually carried — name the location and the measured
number, never "consider improving accessibility" — was a reporting rule all
along, and now governs ordinary build reports.

**One research policy for both writers.** `fixer` had no `WebSearch`; `designer`
did, and its body told it to check current docs itself. Identical stale-API risk,
two policies, one of them prose. `designer` now carries the same harness-enforced
boundary and routes an unconfirmable fact back through the caller.

Four defects the seven-seat review found in the fixes themselves, each proved
before it was fixed. A write through a **symlinked directory inside the project**
— a pnpm or yarn workspace link, a nix or Bazel symlink farm — resolved outside
the root and drew the message *"landed outside the project directory… nothing in
the project changed"*, which is false twice over about a file the user can see;
containment is now tested lexically first and only then through symlinks. One
path inside a **git submodule** made `git check-ignore` fail the entire batch,
silently downgrading nested-`.gitignore` handling for the whole repository and
announcing *"not a repository, or not installed"* — which was untrue and sent the
reader to the wrong place; submodule paths are dropped and git's own words are
carried out. A **rival plugin sharing our own name** rendered as "omc-slim
(omc-slim)", which reads as the plugin warning about itself; it now names the
install path, because that is the one datum that makes it actionable and it was
already in hand. And the cap gate's position mapping **claimed a safety property
it did not have** — collapsed whitespace before a match lands the estimate early,
which is the unsafe direction — so it now subtracts the whole slack as a margin.

Also: `deep-interview`'s description said one question at a time while its body
said two to four; its ambiguity gate was a self-graded sum with no citation
requirement and no floor on the Outcome dimension; and "you decide" at the
approval gate had no defined exit — a gate with no exit is a stall. `deepwork`'s
uncheckable-stage waiver was uncapped, unwritten and unreported; it is now a
`Waived:` line in the stage map, surfaced at the third. `review`'s base
resolution implemented two of the five steps its own prose described and died
with `fatal: ambiguous argument` in any `master`-default repository. `codemap`'s
fixer brief cited a file list no command emitted, dispatched one fixer per
*ancestor* of a changed leaf, and diverged from git on `.gitignore` semantics in
two silent ways — it now delegates to `git check-ignore` and names every case its
fallback does not cover.

**Seven live behaviours were pinned by nothing** and would have regressed in
silence. `COVERAGE.tsv` rows can now name any repo-relative `*.md` path, because
three of the seven are documented rather than prompted and a behaviour is no less
real for living in a document.

**`review`'s base resolution left the file.** It was a shell snippet inside
`SKILL.md` implementing two of the five steps the prose beside it described, so
every `master`-default repository died on `fatal: ambiguous argument`. Prose and
code do not stay in step by intention, so it is now
`skills/review/scripts/base.sh` with `base.test.sh` beside it — seven cases, the
first of which is that repository, plus a negative control so a passing match
means something. It also returned 207 tokens to a file that had none to spare:
709 chars of shell tokenises 22% denser than the prose around it.

**The release gate also found a Critical in the gate itself.** The
GitHub-description check — added in a previous session, never committed — still
derived its published figure as chars/4 ÷ 1.135. It survived the whole release
because it is the one block a reviewer skips with `OMC_SLIM_SKIP_REMOTE=1`, and
obeying it would have published **4,254 tokens** to the repository's front page
while the README said **4,405**: the two most-read surfaces contradicting each
other, which is the exact failure `README.md`'s own "quote a basis or don't quote
a number" exists to prevent. It reads the measured figure now, and
`MAINTAINERS.md` carries a release checklist whose first line is *do not set that
flag at release time*.

**The release gate found eleven contradictions in this release's own work, six of
them introduced by it, and all eleven are fixed.** The worst: deleting `designer`'s
Review mode left a critique-only visual audit with **no owner anywhere in the
plugin** — designer routed it to `review`'s Interface lane, which routes
judgement calls back to designer, and `review` cannot take it because it needs a
diff. Designer now audits and ships the mechanical fixes, which is what `review`
itself does. Next worst: `fixer` gained a rule whose stated justification
described hook behaviour *this same release removed*, which is `51dfbcc`'s
failure mode — a rule surviving while the sentence that makes it fire goes false.
Also fixed: the gate section told the model to dispatch a skill through the Agent
tool, one release after adding a rule against exactly that; the re-review budget
was scoped "per gate" in one file and "per review run" in another; and the new
self-identification line was a preamble the same file forbids, which an existing
eval case would have caught.

The hook suites are 25 and 22 cases against 60 mutants, up from 19 and 18 against
41. `MAINTAINERS.md` opens an incidents ledger, so the four standing refusals
have somewhere for their triggers to be counted — and records that one of them,
aider watch mode, expired within a day of being written down, because Claude Code
2.1.251 ships a `FileChanged` hook.

## v0.9.1

A review of v0.9.0, and the fixes it forced. No component was added or removed.

**Shipped prompts may no longer name another plugin's component.** Eight such
names shipped in v0.9.0 across seven descriptions — the always-loaded layer —
each of them a pointer that resolves to nothing on a machine without that plugin
and raises no error when it does. Every boundary is now stated as a capability:
"not a first debugging pass" rather than "use someone-else:their-skill".
`check-coverage.sh` fails on any `plugin:component` reference outside the
`omc-slim` namespace, and on a typo *inside* it — `omc-slim:reviw` used to pass
everything.

**`tracer` was unreachable, and the cause was a trigger collision.** Nothing in
any prompt named it, because `oracle`'s description claimed *"escalation for a
bug that survived a first fix"* — `tracer`'s trigger, near-verbatim — while
`oracle`'s body is about design throughout. The contradiction sweep could not see
it: the rules did not conflict, the triggers did, and the only symptom was an
absence. `oracle` now disclaims it, `fixer`, `review` and `deepwork` hand off to
it, and it carries the same "dispatched as a lane, take the work" clause that
stops `oracle` bouncing work back. A new gate asserts every component is named by
another component's prompt, or is listed as an entry point with a reason.

**Internal references are namespaced.** A bare `` `fixer` `` can resolve to
another plugin's agent of that name, and it does not read as an edge to anything
counting them — which is how `fixer`'s handoff to `simplify` silently left the
graph. All 51 are now `omc-slim:<name>`, and the gate rejects the bare form.

**`maxTurns` raised from 20-40 to 100/120/200**, on a user report of runs cut off
mid-work. A guard whose failure is silent belongs well above legitimate work: a
truncated subagent returns nothing to its caller and says nothing about why.
Stated carefully, because v0.9.1's own draft overstated it — a user report is not
a controlled observation, and nothing here verifies the harness honours the key.

**The figures that rot are now pinned.** The static total was checked; the
on-invoke delta, the ceiling and `review`'s own size were not, and those are
exactly the three that were re-derived by hand and published wrong. `review` is
measured **whole, frontmatter included**, because that is what the harness
re-attaches — measuring the body alone flattered it by 124 tokens and turned a
28-token overrun into an 81-token margin. It is now 5,625 chars/4, ~4,956
corrected, 44 under the cap, and the gate fails if it ever goes over.

**A second hook, on `SessionStart`, because the plugin cannot otherwise report
its own absence.** omc-slim *is* its output style. Claude Code resolves the
active one with `Object.values(...).filter(forceForPlugin)[0]` — first match
wins, ordered by plugin load — and logs the loss at a level nobody reads. So a
second style-forcing plugin, installed for an unrelated reason, can leave every
component loaded and nothing orchestrating. `check-output-style` reads
`enabledPlugins`, the install manifest and each plugin's style frontmatter, then
names the competing plugin. It cannot see which style actually won, because the
SessionStart payload carries five fields and none of them is the output style, so
it reports the condition and hands over the command that settles it. Advisory
like its sibling: `systemMessage` only, always exit 0, silent when it cannot
tell, and once per session rather than at every compaction.

**The reported cause turned out not to be a cause.** The report was that changing
your output style disabled the orchestrator. The resolver never reads the user's
`outputStyle` while any plugin forces a style — verified against a project
explicitly pinned to `Explanatory`, which still ran `omc-slim:omc-slim`. Our own
docs had only ever tested the setting *unset*, so the stronger claim they were
making was true but unproven. Now both are verified, and the real cause is
documented in `LIMITATIONS.md` instead.

**18 cases and 18 mutants for the new hook**, and the mutation suite earned its
place immediately: it found a fixture passing for the wrong reason. The
"documents the flag in its body" case used an inline mention, which the line
anchors reject on their own — so it would have passed even if the hook had
stopped reading only the frontmatter. Seven of the eighteen mutants make the hook
fire when it should not, because a false alarm about a disabled plugin costs more
than a missed collision. `hooks/mutate-runner.mjs` now holds the sandbox
discipline both suites share.

**Two rules adopted from a published personal output style.** A piece of work now
closes with what you did, whether it worked, and what the user does next — the
middle one carrying evidence, never a claim standing in for it. And a decision
handed to the user is capped at three options; `AskUserQuestion` permits four,
and `review` already batched asks into one question with a recommendation, but
nothing capped the count. Both come from
[`lydiahallie/eli5`](https://x.com/lydiahallie/status/2080378470111256907)
(23 July 2026, 287,008 views). Four of its seven sentences already shipped here.
Its register — "talk to me like I'm 5" — was refused, because this plugin's
Communication section says *not baby talk and not fragments*; the same call
`PROVENANCE.md` records against caveman. The source style says two options; three
is the deliberate middle, because a genuine three-way call should not have to be
split in half.

**Also:** the hidden-character scan missed U+2066–U+2069, the Trojan Source set
its own comment cites, and never read the two `.claude-plugin/*.json`
descriptions — 45 assets scanned, now 58. The reachability check counted a
citation inside a code fence as a handoff. `docs/LIMITATIONS.md` asserted the
`maxTurns` truncation as observed fact eighteen lines above saying nothing had
observed it. Static context 4,487 → 4,625 chars/4, ~4,075 corrected.

## v0.9.0

Everything here traces to
[`docs/RESEARCH-2026-08-26.md`](./docs/RESEARCH-2026-08-26.md) — fourteen
research lanes, ~40 papers, ~90 repositories, Anthropic's docs and the 2.1.246
binary. Read section 4 first; it is built from other people's outages.

**Four published claims were wrong and are corrected.** The static-context figure
was overstated by **13.5%** on its own basis — 3,953, not 4,487 — and
`measure-context.sh` now prints the correction and explains why `claude plugin
details` reports a third number (it does not count the output style). The
`ponytail` pin was labelled 4.8.4 when `16f29800` is 53 commits past that tag.
The `LIMITATIONS.md` temperature entry claimed upstream's `designer` "ran at 0.7
deliberately"; upstream deleted every temperature literal. And the README no
longer implies the layer improves correctness — four independent studies find a
rules layer moves cost and process and not correctness, and this repo's own
numbers fit that pattern.

**Nine contradictions were found and resolved.** Conflict, not rule count, is the
measured driver of instruction-following collapse, and this plugin had never been
audited for it. Among them: `review` told itself to fix a missing eager-load
directly while `performance.md` forbids any optimisation without a measurement;
the output style routed mechanical visual follow-up to `fixer`, which refused all
design work, so that lane had no recipient; `oracle` bounced back the very lane
briefs `review` dispatches to it; `deepwork` asked `explorer` to judge duplication
and overlap, which `explorer` is forbidden to do; and `deepwork`'s commit
checkpoints were gated on an approval no step produced, so that branch could
never fire.

**An eval suite ships, and it has never been run.** `claude plugin eval` is early
access and not enabled on the account it was authored on. Six cases, thirteen
graders, all but one scoring outcomes rather than triggers — under `--ablation
with-without` a `tool_used: Skill` grader is excluded from the score in both arms,
so a trigger-only suite reports a confident zero. The exception is
`no-ceremony-invoked`, a regex over the trace, which `check-evals.sh` does not
recognise as a trigger grader and should. Two cases are tagged
`should-not-fire`, because Opus 5 is documented as expanding scope and
over-delegating, and a suite that only tests firing cannot see that.
`check-evals.sh` guards the suite's shape and is proved able to fail four ways.

**Rules that gained their evidence.** `deep-interview`'s approval gate is measured
at **+14.50 points for +0.60M tokens** against a control arm, where the skills
alone were worth +1.50 — so it now carries that number and a rebuttal to the one
reading that would skip it. `oracle` is now *assigned the opposing position*
rather than described as critical: measured, that is 99.2% disagreement against
48.3%, while being told to be rigorous is statistically indistinguishable from
baseline. `tracer` must pre-declare what would falsify each hypothesis before
gathering evidence, span distinct failure categories, and can now return
`undetermined` — which is not `ruled out`.

**The hook's `timeout: 5` is advisory and now says so.** Claude Code does not
enforce it parent-side and it does not apply while a hook blocks on stdin, so the
transcript scan carries its own deadline and abstains rather than accusing when
it expires. What it cannot bound is stated in the source: no in-process watchdog
preempts a synchronous read on fd 0. 19 cases, 23 mutants, all killed — and two
drafts of the new tests could not fail, which the mutation run caught both times.
Both upstream reports are open, unconfirmed and Windows-only, and one of them
runs a control showing the timeout mechanism itself works when no stdin read is
involved; the deadline is worth having anyway, and the source says so now.

**Honest cost, and the sentence this entry got wrong twice.** Static context rose
4,474 → 4,487. An earlier draft said "static context is unchanged; every addition
landed in bodies", which was false in both halves. A later one said it *fell* to
4,405 — true only while `codemap` carried `disable-model-invocation: true`, which
removed its description from the listing. That flag was reverted before release.
Bodies grew **+5,495 chars/4, ~4,841 corrected, in one release** — individually
justified, collectively unmeasured, which is the failure this project criticises
in others. `measure-context.sh` now reports on-invoke cost per component so the
next increase is visible while it happens. `review` is the heaviest — its SKILL.md is
5,662 tokens on chars/4, ~4,988 corrected, against a 5,000-token
post-compaction re-injection cap it sits either side of depending on the basis.
It cleared that cap by 12 corrected tokens only after a review pass measured it
at 5,087 and found this file publishing 4,995 — the file had grown 419 chars
after the measurement, and nothing re-derived it. The binding limit is not that
cap anyway: re-attached skills share a 25,000-token budget, most recent first.

That sentence previously read "~5,100 tokens". **That number was invented** — it
matched neither basis. The third verification pass caught it in
`docs/LIMITATIONS.md`, it was corrected there, and this file kept the fabricated
copy for one more round until a later pass found it here too. Recorded rather
than quietly overwritten, because a release that fixes a made-up number in one
file and ships it in another has not fixed it.

**Also:** `librarian`'s open-web pass became conditional (doc injection measures
+9.36pp on rare APIs and **−39.02pp on common ones**); `simplify` gained a
public-entrypoint check, the two git-archaeology traps that make Chesterton's
Fence confidently wrong, and the finding that ~21% of non-equivalent refactorings
pass the existing suite; `explorer` gained a positive control before reporting any
negative result; `codemap` now cites symbols rather than line numbers, because a
line number is exact when written and silently wrong later; every agent gained a
`maxTurns` bound.

## v0.8.5

**Breaking: the `council` skill is removed.** It was the weakest-evidenced
component shipping. Its three seats differ by analytical stance, not by model
provider, so unanimity was never the independent confirmation the format implied
— `docs/LIMITATIONS.md` said so and the skill was instructed to repeat the
caveat. It also fired on one prompt in two, was the most expensive entry in the
roster, and overlapped `oracle`, which already owns a second opinion on an
irreversible call. Ask `oracle` instead; for a decision worth three reads, brief
it three times yourself. Roster is now six agents and six skills.

Removed with it: the roster line in the output style, eight `REINFORCEMENT.tsv`
rows, and the `check_council` contract case and its two self-test fixtures in
`scripts/bench/smoke-contracts.sh`. Historical records that mention the council —
`RESEARCH.md`, `docs/AUDIT-2026-08-25.md`, `docs/deepwork/`, and the v0.8.4 entry
below — are left as written, because they record what happened.

## v0.8.4

**Breaking: four agents removed.** `council` and the three `councillor-*` seats
became one skill, `skills/council/SKILL.md`, which dispatches `oracle` three
times with three stances and synthesises. The seats differed only by a stance
paragraph; the rest was duplicated boilerplate, and a stance travels fine in a
brief. Roster is now six agents and seven skills.

**`.mcp.json` removed.** It shipped `context7` and `grep.app`, two remote HTTP
servers that started automatically, while the README claimed the output style was
the only global change. That was false. The servers are gone rather than
documented; `librarian` finds whatever documentation servers your own config
provides, and README says how to add these two yourself.

**A second gate: `REINFORCEMENT.tsv` + `scripts/check-reinforcement.sh`.**
`COVERAGE.tsv` proves a rule's phrase is present. It cannot prove the phrase
still carries its rule, and this repo has two commits where that difference cost
real behaviour — `51dfbcc` and `9ee0438`, both green at the time. A reinforcement
row pins an anchor plus the phrases that must sit in the same paragraph, and
reports `GUTTED` when a rule keeps its name and loses its reasoning. 114 rows.

**A behavioural gate: `scripts/bench/smoke-contracts.sh`.** Structural checks
missed a live mutant on disk and six agents whose frontmatter failed to parse,
both in one session. This one runs `claude -p --plugin-dir` against the working
tree — the installed cache is what a subagent otherwise loads — and asserts both
that the expected agent spawned and that its output honours its contract.

**All 13 prompts restructured**, ordered by the moment each rule fires rather
than by topic. `fixer` 46 → 39 atomic rules, `simplify` 43 → 38, both under the
N=40 threshold where instruction compliance degrades. Eleven contradictions
resolved, four of which needed a precedence rule that did not exist.

**Depth over cost, where the two conflicted.** `librarian` gained `Bash` and a
rewritten research ladder that reads installed source before anything written
about it, and requires a dated open-web pass on load-bearing claims — it
previously ranked web search last and called using it doing the job badly.
`fixer` gained `WebFetch` for a caller-named URL. `review` lanes now trigger on
diff content rather than line count, so a 30-line migration gets schema review,
and low-confidence findings route to Open questions instead of being deleted.
`deepwork` gained a research stage that runs before the stage map.

**`codemap.mjs`: unreadable files were silently invisible forever.** A file over
2 GB throws `ERR_FS_FILE_TOO_LARGE` and a permission-denied file throws `EACCES`;
both were caught and returned `''`. `changes` then compared `'' !== ''` as false,
so such a file could never be reported as changed again, and the two causes were
indistinguishable from each other and from an empty file. Unreadable files now
carry a per-cause sentinel and the count is reported. Also fixed: it walked and
wrote `codemap.md` inside `node_modules` with no root `.gitignore`; `.gitignore`
negations were parsed as ordinary patterns and are now warned about explicitly;
and `init` wrote artefacts its own include then matched, so `changes` immediately
after `init` was never clean.

**Ten miscalibrated caps raised.** `explorer` 40 → 150 lines, because `review`
uses it to enumerate every consumer of an enum and a truncated set reads like a
whole one. `librarian` code examples 20 → 50. `deep-interview` retries two →
three. Re-review budgets gain a third pass while a Critical is open. `codemap`
may read one hop out, and may read the tests it does not describe.
`verification-planning` scales evidence to consequence rather than always
minimising. The output style states that cheapest ranks below correct and below
complete.

**Fixed: the hook could hang forever.** A FIFO or character device reports size
0, so the 64 MB cap waved it through and `readFileSync` blocked with no timeout,
breaking "always exits 0". Now requires a regular file, via `lstat` rather than
`stat`, which also stops it following a symlink. The mutation runner no longer
writes to the tracked hook at all — mutants go to a temp sandbox — after two
concurrent runs left a live mutant on disk with every gate reporting green.

**Static context 4,485 → 4,594.** Up, not down. `measure-context.sh` was blind to
`when_to_use`, which the harness appends to `description` and loads every
session; counting it added 327 tokens that were always being paid. The rest is
the cost of mandating research and unblocking divergence.

## v0.8.3

Four packs adopted since v0.8.2 — ballast, aniruddha-adhikary/skills,
powerball-harness and superpowers — for 19 rules at **zero static context**.
Every one lands in an agent or skill body, which loads on demand, so the figure
paid on every request is unchanged at 4,485 tokens. `COVERAGE.tsv` grew from 218
rows to 240: 22 new rows, because one rule is pinned separately in each of the
three agents that carry it.

Adopted from [obra/superpowers](https://github.com/obra/superpowers), pinned at
`b36e0829`. Five rules, **zero static context** — every one lands in an agent or
skill body, which loads on demand. Static holds at 4,485 tokens. No new skill, no
new agent, no new hook: that repo has held its own roster at 14 skills since
2025-12-09 while the bytes behind it grew 75%, which is this plugin's cost model
arrived at independently.

**Briefing a review lane with a verdict decides the review before it runs.**
`review` and `deepwork` now say to pass findings and `file:line` and nothing else.
Naming a severity, or a concern to skip, is coaching rather than locating, and
upstream recorded a real run where a controller told a reviewer "Minor at most"
and the flaw shipped. The reviewer's half was already covered; only the
orchestrator's was missing.

**"Read-only" did not say the working tree.** `explorer`, `oracle` and `tracer`
already restricted Bash to non-mutating diagnostics, but nothing said that covers
git state, and all three can run `git checkout`, `stash` or `reset`. Three
clauses, one per agent.

**`simplify` could cause two failures it did not warn about.** Deleting a config
key selects the consumer's default rather than turning something off, and an
absent field, an empty list and an empty object are often three different answers.
Separately, cutting the passage that defends a rule reads as removing padding: the
file still reads correctly and the rule stops firing, so nothing catches it.
Rebuttals now relocate to the point of use instead of being deleted.

**A change is not live in the session that made it.** Prompt text, output styles,
hooks and manifests load at session start, so a check run in the editing session
measures what was replaced. `verification-planning` says to start a fresh session
or record the result as unverified.

**Shell scripts are now linted.** `scripts/check-shell.sh` runs `shellcheck` at
`--severity=warning` over all 8 shell files — clean on the first run, so this is
a guard against future regressions rather than a cleanup. It finds files by
shebang as well as extension, includes untracked files, prints the count beside
the verdict, and refuses to call a missing `shellcheck` a pass.

**Disclosed: the coverage check passes on a self-contradicting prompt.** Appending
"Ignore that…" after a rule, leaving every pinned substring intact, still reports
all rows present. That ceiling is now written into
[MAINTAINERS.md](./MAINTAINERS.md) and [PROVENANCE.md](./docs/PROVENANCE.md)
rather than left implicit. Deletion is what the check catches; meaning is the
benchmark's job. The two stale `227` row counts in PROVENANCE.md are corrected to
240 in the same pass.

Proof: 8 mutants against the new coverage rows, each dropping exactly one row at
the named location; 4 provenance assertions for the new origin; 3 failure paths
for the shell gate. 15 proofs, each against a verified-green control.

Adopted from [svy04/ballast](https://github.com/svy04/ballast), pinned at
`acdf495b` in [`UPSTREAM.tsv`](./UPSTREAM.tsv). Most of that plugin was read and
refused — see [PROVENANCE.md](./docs/PROVENANCE.md).

**The hook was skipping its check on the agents doing the most work.**
`MAX_TRANSCRIPT_BYTES` was 2 MB. Sampled 2026-08-17, **89% of subagent
transcripts over that cap contain a successful write** (39 of 44 locally), so the
guard went silent exactly where a long `fixer` run needed it. Raised to 64 MB.
The largest transcript sampled is 50,017,698 bytes and parses in 145 ms against
the 5 s timeout, so the cap now bounds allocation rather than scan time.

**The hook has a test.** `node hooks/verify-deliverables.test.mjs` runs it as a
child process against isolated fixtures at real transcript depth — 13 cases, zero
dependencies. It covers the bare-name split for `omc-slim:fixer`, both write
agents, every write tool, read-only exemption, a denied write counting as no
deliverable, `agent_transcript_path` over the parent's, malformed stdin, both
sides of the cap, and that debug output goes to stderr and never corrupts stdout.

It asserts the **exact set of keys** the hook may emit, which is what pins "never
blocks" and "never sends `additionalContext`". Neither is visible to an exit-code
assertion: `continue: false` halts a session while still exiting 0.

**And the test has a test.** `node hooks/verify-deliverables.mutate.mjs` breaks
the hook fifteen ways and asserts the harness notices every time — **15/15**. It
exists because the first draft of the harness passed 9/9 while missing nine of
eleven mutants, including both invariants above. A suite that cannot fail is not
evidence. It restores the hook by sha256, so an interrupted run leaves nothing
behind.

Together these replace two one-time manual checks that survived only as dated
comments; a dated comment cannot fail. Both now point at the case that re-runs
them.

**`OMC_SLIM_DEBUG=1`** traces which of the four "cannot tell" paths the hook
took. stderr from a hook that exits 0 never reaches the user, so it adds no
noise.

**The delegation contract now carries standing rules and earlier corrections.** A
specialist sees only what the brief says. For a plugin whose whole thesis is
delegation, that gap was the characteristic failure. The hard gate stays on the
validation owner — a fourth mandatory field would be unsatisfiable on the many
briefs that have no standing rule to carry.

**A passing check can go stale.** "Do not re-run a check whose inputs have not
changed" was silent about time, so a check against an external API or contract
passed forever.

**The progress file records dead ends and a next first action.** An approach that
failed and went unwritten gets walked a second time by whoever picks the work up
next. The next action must be executable without reading anything but that file.

**`verification-planning` gained the zero-context executor.** A deliverable
meant to work without you is checked by a fresh agent that receives it and
nothing else, then executes rather than reviews it.

**The README now says which parts are enforced.** `disallowedTools`, the
output-style flag and the hook matcher are harness-enforced; one hook is our
code; everything else is prose and holds as well as a prompt holds.

Also adopted from
[aniruddha-adhikary/skills](https://github.com/aniruddha-adhikary/skills), pinned
at `43fe972a`. That pack is Joern/CPG static analysis, so nearly all of it was
refused — see [PROVENANCE.md](./docs/PROVENANCE.md).

**A check that ran over nothing is no longer reported as a check that passed.** A
suite whose glob matched no file exits green, and that satisfied the old wording
of "tests pass requires having run them". The orchestrator rule now names the
case, and `verification-planning` carries the mechanism: print how many inputs
reached the assertion, and read zero as unproven rather than passed.

**An empty search is now proved against a known positive.** Run the same search
for something you know is there. If that comes back empty too, the search is
broken and proves nothing about the code.

**`simplify` no longer licenses deletion on an undefined standard.** Its table
row said "remove once confirmed dead" and never said what confirms it. Dead is a
claim about a search, so the claim now has to say what was searched and what that
search cannot reach — dynamic dispatch, string-keyed lookup, callers outside the
repo.

**`check-coverage.sh` now asserts the plugin's own published figures.** The
static-context number is computed by `measure-context.sh` and quoted at three
sites across two documents, hand-maintained until now — and they diverged once
already, which is recorded further down this file. The sites are enrolled as
exact literals rather than found by pattern, so the dated figures in
`RESEARCH.md` and in this changelog cannot trip it. Two derived multiples were
deleted from `LIMITATIONS.md` rather than automated, since the table above them
already prints every input.

Adopted from
[tim-hub/powerball-harness](https://github.com/tim-hub/powerball-harness), pinned
at `cf086c6a`. A Go Plan/Work/Review harness in a plugin wrapper, and its own
benchmark is why so little of it transferred — that study measures a two-line
prompt instruction rather than the binary, and a search for prompt text across
all 180 Go files returned one comment.

**Three ways to turn a check green without doing the work; the plugin guarded
one.** It already refused to weaken an assertion. `fixer` now names the other
two: code shaped to the test's own inputs, and disabling whatever grades the code
— a skipped test, `continue-on-error`, a lowered coverage floor, `--no-verify` on
a commit.

**A bugfix ships the reproduction that failed first.** A check written after the
fix passes on both versions, so it proves the bug is gone only by assertion.

**A check you tolerate failing is a check you have stopped reading.**
`verification-planning` now allows three answers to a known-red result — repair
it, narrow it, delete it — and leaving it red and explained is none of them. Its
positive-control rule was generalised rather than duplicated: it already covered
an empty search, and now covers a guard you just wrote, which is run against a
state where the fault existed.

**`check-upstream.sh` could not gate anything, and cried wolf on every clone.**
It exited 0 unconditionally, counting a missing record and ordinary upstream
movement in the same variable. `docs/upstream/CLAUDE.md.snapshot` is gitignored
on purpose, so a fresh clone reported `SNAPSHOT LOST` — always red for everyone
but the author. Movement stays news; a fault in our own record now exits
non-zero, and a deliberately unpublished snapshot is recognised from `.gitignore`
rather than hardcoded.

**Review caught a regression this change introduced.** The first version of the
`check-upstream.sh` fix asked `git check-ignore` whether a snapshot was
deliberately unpublished, and read any non-zero answer as "not ignored". That
command exits 128 outside a repository, so a release tarball or a vendored copy
got `SNAPSHOT LOST` and, now that the script gates, a failing exit. Trading an
always-red check for a red-and-blocking one is the worse deal. Three states now.

**`check-coverage.sh` grew two assertions.** Every `${CLAUDE_PLUGIN_ROOT}` path
must resolve, because the runtime resolves those and a rename breaks the hook at
install time with nothing failing here. And both `README.md` and
`.claude-plugin/plugin.json` state the roster in words, which the roster block
never checked — it verifies names, never the count. Adding an agent trips the
name check first, so what this really catches is a hook count, or a roster
updated everywhere except the prose.

**Every origin in `COVERAGE.tsv` is now classified, pinned and documented — and
the pin has to be the one actually tracked.** `gstack` had 26 adopted rules, a
pin, and no entry in `PROVENANCE.md` at all; three further origins had no
provenance anywhere. Worse, `PROVENANCE.md` was itself built by lifting a table
out of `README.md` that had already fallen behind, so three rows cited only the
first of two reads: the `agent-skills` row credited a commit that produced 8 of
its rules while 27 more came from the pin being tracked. Both halves now fail the
check, and a source read twice carries both pins.

Proved failable before being trusted, each against a verified-green control:
**nine mutants against the new assertions, all killed**, five more dropping each
new `COVERAGE.tsv` row in turn, and five failure branches of `check-upstream.sh`.
Three mutations first reported a false survival and every one was the harness
rather than the check — two replaced a literal where the checker normalises
whitespace and the phrase wraps across lines, and one used a name the filter
excluded. A harness that has not been shown to fail proves nothing about its
subject, which is one of the rules this release adopts.

**Static context 4,406 → 4,485 tokens** (+1.8%), all of it in three output-style
additions. The powerball rules land in agent and skill bodies, which load on
demand and cost nothing at rest. `.claude/settings.local.json` is now ignored by
the repo rather than by one machine's global config.

## v0.8.2

**Per-agent `model:` and `effort:` pinning removed.** Every agent now inherits
the caller's model. Note what this means for cost: `explorer` and `librarian`
previously ran on a cheaper tier, and now run on whatever you are running. The
roster costs what your session costs.

**Re-benchmarked at n=3**, with the harness committed at `scripts/bench/` so the
numbers are re-derivable rather than asserted. omc-slim costs **18% less than a
plain session** at equal correctness, reversing the v0.4.1 finding of 10% more.
The benchmark ran before the model change, and no specialist fired during it, so
that result measures the orchestrator prompt rather than tier routing. See
[BENCHMARK.md](./docs/BENCHMARK.md), including the four measurement bugs found
before publishing.

**Static context measured, not estimated.** `scripts/measure-context.sh` reports
4,406 tokens. The README had been quoting two different totals for the same
plugin, because both were counted by hand and nothing could re-derive them.

**README rebuilt**, 562 lines to 181. Routing measurements, limitations and
provenance moved to `docs/`; release history moved here.

## v0.8.1

`deepwork` auto-invocation solved: the cause was the injection point, not the
wording. Eight rewrites inside the output style changed nothing; the same
sentences in a `CLAUDE.md` fire it on the first tool call.

## v0.8.0

`fixer` writes to the same standard the reviewers hold it to.

## v0.7.4 – v0.7.8

Simplified Technical English became the default register. `simplify` learned to
spot comment smells. `review` now judges the whole change set rather than the
diff.

Three separate files hit the same compression floor at ~2%, so that pattern is
established rather than suspected.

## v0.7.0 – v0.7.3

Added `review`, the all-axis code-review skill, behind an evidence gate. It
checks current sources and installed tooling rather than recalled knowledge.

## v0.6.4 – v0.6.9

`simplify` merged from all four upstream sources, then audited and compressed
28%. The orchestrator lost 250 tokens with no behaviour change.

## v0.6.0 – v0.6.1

The output style now names every agent and skill, because the descriptions
Claude Code shows get dropped once enough plugins are installed. On a 41k-LOC
repository that turned `oracle` and `librarian` from never firing into firing on
turn one.

The same pass removed the `observer` agent. Claude Code reads images and PDFs
natively, so it never auto-fired; forced, it matched the direct path while being
unable to cross-reference the repo.
