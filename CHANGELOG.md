# Changelog

Notable releases. Full reasoning for each is in
[RESEARCH.md](./RESEARCH.md) and [MAINTAINERS.md](./MAINTAINERS.md).

## v0.9.0

Everything here traces to
[`docs/RESEARCH-2026-08-26.md`](./docs/RESEARCH-2026-08-26.md) — fourteen
research lanes, ~40 papers, ~90 repositories, Anthropic's docs and the 2.1.246
binary. Read section 4 first; it is built from other people's outages.

**Four published claims were wrong and are corrected.** The static-context figure
was overstated by **13.5%** on its own basis — 3,961, not 4,496 — and
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
access and not enabled on the account it was authored on. Six cases, twelve
graders, all scoring outcomes rather than triggers — under `--ablation
with-without` a `tool_used: Skill` grader is excluded from the score in both arms,
so a trigger-only suite reports a confident zero. Two cases are tagged
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
preempts a synchronous read on fd 0. 15 cases, 19 mutants, all killed — and the
first draft of the new test could not fail, which the mutation run caught.

**Honest cost.** Static context is unchanged; every addition landed in bodies.
But those bodies grew **~4,133 on-invoke tokens in one release (3,641 corrected)** — individually
justified, collectively unmeasured, which is the failure this project criticises
in others. `measure-context.sh` now reports on-invoke cost per component so the
next increase is visible while it happens. `review` is the heaviest at ~5,100
tokens, against a 5,000-token post-compaction re-injection cap.

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
