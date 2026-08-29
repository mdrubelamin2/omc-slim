# Provenance — what was adopted, pinned exactly

Part of [omc-slim](../README.md).

This page lists every external source omc-slim adopted from, pinned to an exact
commit or file hash. It also covers checking for upstream changes and safely
deleting the sources this plugin replaced.

Every source is pinned so a future version can diff against what was actually
read, and adopt upstream changes deliberately rather than by memory.

**A source read twice carries both pins.** The later one is what
[`UPSTREAM.tsv`](../UPSTREAM.tsv) tracks, and `scripts/check-coverage.sh` asserts
this table names it. That check was added after three rows here were found citing
only the first read: the row for `agent-skills` credited a commit that produced
eight of its rules while twenty-seven more came from the pin actually tracked.

| Source | Pin | What omc-slim took |
|---|---|---|
| [alvinunreal/oh-my-opencode-slim](https://github.com/alvinunreal/oh-my-opencode-slim) | `282d5f26` (2026-08-11), then `6faaed28` (2026-08-14) | First read: the agent roster, routing heuristics, output contracts and most prompt content. Second: `deepwork`'s parallel structure scan, its re-review budget and phase checkpoint commits |
| [Yeachan-Heo/oh-my-claudecode](https://github.com/Yeachan-Heo/oh-my-claudecode) | `7e38c1f9` (2026-08-12), then `5aa678c6` (2026-08-14), `package.json` 4.15.7, npm `oh-my-claude-sisyphus` 4.15.10 | First read: the deliverable-verification idea, the `tracer` role, `deep-interview`, and six verified failure modes to design against. Second: its reviewer, verifier and critic agents, merged into `review` |
| [multica-ai/andrej-karpathy-skills](https://github.com/multica-ai/andrej-karpathy-skills) | `2c606141` (2026-04-20) | "Surgical changes" outright; the whole file as a compression target |
| `~/.claude/CLAUDE.md` | sha256 `e1894ef55a06…` (4,230 B) | Ownership language bans, no early stopping, no permission-to-continue, evidence over plausibility |
| `~/.claude/skills/fable-mode/SKILL.md` | sha256 `c48cbc5cf0c9…` (7,516 B) | Stage map, one failable artefact per stage, backward re-runs, warning threshold, the two self-critique questions, find-and-replace safety |
| [garrytan/gstack](https://github.com/garrytan/gstack) | `d078622b` | The largest single source for `review` — diffing against the merge base, the quote-the-code gate, confidence thresholds, lane triggers and the suppression list |
| [svy04/ballast](https://github.com/svy04/ballast) | `acdf495b` (2026-08-17), v0.8.0 | Constraints do not travel to a subagent; a passing check expires; the zero-context executor; dead ends and a next first action in the progress file; the hook-harness pattern and a debug env var |
| [aniruddha-adhikary/skills](https://github.com/aniruddha-adhikary/skills) | `43fe972a` (2026-08-17) | A check that ran over nothing is not a passing check; an empty search is proved against a known positive; "dead" is a claim about a search, not a property of code; published figures are derived, never hand-copied |
| [tim-hub/powerball-harness](https://github.com/tim-hub/powerball-harness) | `cf086c6a` (2026-08-05) | An implementation fakes a pass as readily as a test does; whatever grades the code is as protected as the code; a bugfix ships the reproduction that failed first; a check tolerated red is a check nobody reads; a new guard is proved against a known-bad state |
| [obra/superpowers](https://github.com/obra/superpowers) | `b36e0829` (2026-08-12) | Brief a review lane with evidence and never a verdict; a read-only agent does not move git state; deleting a config key selects the default rather than off; an argument defending a rule is relocated, never deleted; a change is not live in the session that made it |

ballast was read whole and mostly refused: its `memory/` tree writes into the
user's project and duplicates native memory, `skill-forge` generates surface, and
its five-label claim taxonomy restates rules already in `verification-planning`.
Its `UserPromptSubmit` rule hook is deliberately not adopted — see
[LIMITATIONS.md](./LIMITATIONS.md).

aniruddha-adhikary/skills is a Joern/CPG static-analysis pack, so almost all of it
is a different domain and was refused: three skills of graph-query mechanics, eight
scripts, and a `traps.md` cataloguing one tool's quirks. Its `PreToolUse` guard hook
was refused too — this plugin ships two hooks and stays off the tool-call path. So was
its publication boundary, which git-ignores `research/` and `docs/`; the same figures
are published here instead, with the script that re-derives them. What transferred was
its central discipline, stated eight times across the pack: a result that is empty
proves nothing until a known positive shows the search works.

powerball-harness is a Go Plan/Work/Review harness wrapped in a plugin, and its
own benchmark is why so little of it transferred. That study compares two
`CLAUDE.md` files differing by two lines, and the report concedes the result
measures "the effect of explicit validation instructions" rather than the effect
of the harness. A search for prompt text across all 180 Go files returned one
comment. So the doctrine came over and 46,000 lines of Go did not, together with
the `PreToolUse` guardrail engine, the 850-line residue manifest whose own
changelog records it running green and blind, the write-only `memory/` tree that
upstream has since deleted, and a `.claude/state/` directory written into the
user's own project.

superpowers is the largest pack read so far and the closest in kind — a skills
framework rather than a binary. Its own history is why no surface came over: the
roster has held at 14 skills since 2025-12-09 across 681 commits, while the bytes
under `skills/` grew from 211 KB to 370 KB. The consolidation commit that set that
number, `5845b52`, moved three standalone skills into "progressive disclosure
supporting files" — this plugin's cost model, reached independently. Its stated
*reason* was wrong, and worth recording: it blamed
`SLASH_COMMAND_TOOL_CHAR_BUDGET` for silently hiding skills, where the
[documentation](https://code.claude.com/docs/en/skills) says names are always kept
and only descriptions are evicted, least-invoked first.

One superpowers result is load-bearing for [`simplify`](../skills/simplify/SKILL.md)
and is theirs, not ours: deleting a section of rebuttals from their test-first
skill moved compliance from **8/10 to 5/10**, corroborated on two models
(`RELEASE-NOTES.md:56` at the pin). They restored the arguments by relocating them
to the point of use rather than by reverting. That is the evidence behind "an
argument that defends a rule moves; it does not vanish".

Refused: the `.superpowers/sdd/` scratch tree, which writes into the user's own
project; `pre-commit`, whose three hooks there target a gitignored directory and
can never fire; the behavioural eval, which runs every case with the plugin loaded
and so has no control arm; eight platform manifests carrying six different
descriptions; and the persuasion and social-proof register, which they themselves
stripped from eleven skills on 2026-07-05.

These packs were read and deliberately **not** adopted wholesale — see
[`RESEARCH.md`](../RESEARCH.md) §6d for why. Individual rules from each are
pinned in [`COVERAGE.tsv`](../COVERAGE.tsv); it is the surface that was refused,
never the whole pack:

| Pack | Pin | What was taken |
|---|---|---|
| [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) | `7829ffd9` (2026-08-14), then `be42637c` (2026-08-14) | First read: Chesterton's Fence, `git blame` for intent, and `simplify`'s understand-first process. Second, and much the larger: 27 of the 35 pinned `addy` rules, most of them the five-axis review lanes. Its hook discipline — exactly one — against a 24-skill surface that is the counter-example |
| [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail) | `16f29800` — **v4.9.0 minus one commit**, not 4.8.4 (see below) | The build ladder applied retroactively, the finding tags, and marking deliberate ceilings |
| [JuliusBrussee/caveman](https://github.com/JuliusBrussee/caveman) | `ec83e5ba` | Compressed output contracts and the terse register. **The upstream premise is dead — see below** |
| `wait-what` skill | installed locally, unpinned | ASD-STE100 Simplified Technical English: one idea per sentence, active voice, a named actor |
| `lydiahallie/eli5` — a personal output style, [published as a screenshot](https://x.com/lydiahallie/status/2080378470111256907) (23 July 2026, 2,240 likes, 287,008 views) | no repository, so no commit; the post URL is the pin | The three-part close — what you did, whether it worked, what the user does next — and the two-option ceiling on a decision. **Its register was refused — see below** |
| Claude Code's bundled `code-review` plugin | ships with the CLI | The confidence threshold that suppresses a finding outright |
| Claude Code's bundled simplification skill | ships with the CLI | Conventions come from the repository, never a preferred dialect |

**Two corrections to this table, from the 2026-08-26 sweep**
([research](./RESEARCH-2026-08-26.md#3-previously-adopted-now-known-wrong-or-superseded)).

**The ponytail pin was mislabelled.** `16f29800` is **53 commits ahead of tag
v4.8.4** and **one commit behind v4.9.0**. Nothing adopted from it is wrong; the
record of what was read was. Corrected above rather than silently re-pinned,
because a provenance file that misstates a version is the failure it exists to
prevent.

**caveman's cost premise has been retracted by its own author.** Its published
"65% token reduction" is now `docs/HONEST-NUMBERS.md` → *"Not published"*; the
repo's own eval reproduces roughly 50% against a **terse control**; an
independent 300-runs-per-arm measurement on `claude-opus-4-8` found output down
44.1% and **total cost up 0.06%**; and a 409-session, 3,239-message study on
Opus 5 measured its first and largest rule — article-stripping — **not firing at
all**, decaying further with session depth.

What omc-slim took from caveman is the **grammar**, pinned in `COVERAGE.tsv` as
`lite-keeps-grammar`: *terseness is fewer sentences, never broken ones*. No cost
claim anywhere in this repository rests on it, and none should be added. Do not
move this pin: past it lie a BSL-1.1 licence split, five skills requiring a
vendor API key, telemetry on by default, and a manifest current Claude Code
rejects.

The caveman result worth carrying is not about caveman. **A register instruction
measurably failed to fire on Opus 5, and decayed with session depth.** omc-slim's
own Communication section is the same kind of instruction, and is unmeasured.

**The `eli5` register was refused, and its mechanics kept.** The published style
asks to be talked to "like I'm 5", which contradicts this plugin's own line —
*not baby talk and not fragments*. Four of its seven sentences already shipped
here, so what was left worth taking was two rules that are not about a mood: end
a piece of work by saying what you did, whether it worked and what the user does
next; and cap a decision at three options rather than four. This is the same call
made against caveman one row up — take the grammar, refuse the voice.

The last four carry no commit to pin. Two ship with Claude Code and move with
it; `wait-what` was read from a local install, and `eli5` exists only as a
screenshot in a post. They are recorded here because `COVERAGE.tsv` pins rules to
them, and an origin with no provenance entry is how an adoption becomes folklore.

None is named anywhere in the plugin's prompts — the behaviour is described
directly, so nothing depends on those packs being installed.

Benchmark figures come from [orcabot.com/benchmarks](https://orcabot.com/benchmarks),
July 2026 run, page last updated 2026-08-08.

## The `research` origin

`COVERAGE.tsv` rows tagged `research` come from the 2026-08-26 external sweep,
recorded in [`RESEARCH-2026-08-26.md`](./RESEARCH-2026-08-26.md). They are
classified `internal` by `check-coverage.sh` because **there is no upstream
repository to pin** — the sources are papers, vendor documentation and measured
results, not a pack that was read and adopted.

That is a weaker provenance than a commit SHA and it is labelled as such. Each
rule traces to a section of the research document, and each of those sections
carries its own URLs and confidence tier. Where a claim there could not be
verified, it says so; where a lane retracted something, that is recorded too.

Three rules in that document were **wrong and are struck through rather than
deleted** — two assumed a defect without checking the repository first, and one
over-generalised a harness feature. Keeping the strikethroughs is the point: a
research record that only shows its hits is not a record.

## Safe to delete the sources this replaces

`~/.claude/CLAUDE.md` and the `fable-mode` skill are meant to be **deleted** once
this plugin is installed — that is the ~2,700 tokens per task it buys back. Two
checks make that safe.

**1. The pins survive deletion.** Those two entries are marked `archived` in
`UPSTREAM.tsv`: fully adopted, source retired on purpose. The verbatim copies in
[`docs/upstream/`](./upstream) become the record, and the checker verifies
*those* rather than reporting a permanent false alarm:

```
CLAUDE.md            archived   e1894ef55a06 (source retired, snapshot intact)
fable-mode.SKILL.md  archived   c48cbc5cf0c9 (source retired, snapshot intact)
```

It also detects a tampered or missing snapshot, and — if you have not deleted the
original yet — tells you whether it drifted since adoption, so you can review
before deleting.

**2. Coverage is asserted, not assumed.** With the originals gone, nothing else
would catch a later edit quietly dropping an adopted rule. A row's `where` is a
component name, or any repo-relative `*.md` path — the second form was added on
2026-08-29, after a sweep found three live behaviours pinned by nothing because
they are documented rather than prompted.
[`COVERAGE.tsv`](../COVERAGE.tsv) maps every load-bearing rule to where it now
lives — 297 rows, and growing with each release:

The roster it asserts is **six agents, six skills, two hooks** — stated here in
prose because the check requires this file to carry it, and a sentence survives a
compression pass better than a pasted line does.

The itemised lines used to be pasted here in full. They went stale three times —
`CHANGELOG.md` records correcting two of those rounds — because only two of the
nine literals were ever enrolled in the check, and this checker's own source
predicts exactly that: *"A doc that quotes a checker and is not checked by it
will always drift."* The fix was to stop quoting what is not checked, rather than
to patch it a fourth time.

`COVERAGE.tsv` proves a rule's phrase survived. It cannot prove the phrase still
carries its rule: `51dfbcc` and `9ee0438` each record a compression pass where
every row passed and measured behaviour broke, because the sentence that made the
rule fire had been cut while its name survived.
[`REINFORCEMENT.tsv`](../REINFORCEMENT.tsv) closes that — an anchor plus the
phrases that must appear in the **same paragraph**, checked by
`./scripts/check-reinforcement.sh`, which reports `GUTTED` when a rule keeps its
name and loses its reasoning. Run both.

```bash
./scripts/check-coverage.sh
# ... assertions, one line each: rosters, published figures, internal paths,
# worded rosters, hook cases and mutants, frontmatter, invisible characters,
# component reachability, third-party names, type-marked references, adopted
# origins. Run it to see them; they are not pasted here — that is the point.
#
# 297/297 adopted behaviours present.
# Safe to delete the adopted sources; the plugin covers them.
```

**What a green run does and does not prove.** It proves no pinned phrase was
*deleted*. It does not prove the surrounding text still means what it meant. The
match is a fixed substring against the whole file, so a rule can be contradicted
by a later sentence, moved into a counter-example, or inverted, and the row still
passes — demonstrated by appending "Ignore that" after a rule and watching the
check report every row present. Deletion is the regression this catches; meaning
is the benchmark's job, not this script's.

Exits non-zero if any behaviour goes missing, so it works in CI or a pre-commit
hook. It has been verified to actually fail: rewording or deleting a rule turns
it red, and it earned its keep immediately — it caught that `surgical-edits` had
been lost from the output style during an earlier compression pass.

## Checking for upstream changes

```bash
./scripts/check-upstream.sh          # all sources
./scripts/check-upstream.sh karpathy # one
```

Read-only. It queries each remote and hashes each local file, then prints the
exact `git diff` or `diff -u` command for anything that moved.

Upstream moves fast — oh-my-claudecode ships roughly 35 npm versions a month, and
had already moved past its pin within hours of being audited. Expect the checker
to report movement; the point is to review it, not to chase it. Adopt only what
earns its tokens, then update the pin in
[`UPSTREAM.tsv`](../UPSTREAM.tsv) and refresh the snapshot.

## The 2026-08-29 upstream sweep — six pins advanced, each after its diff was read

`check-upstream.sh` had reported **6 of 11 sources moved** and nobody had read
the diffs. A pin nobody reads is folklore, which is the thing this file exists to
prevent. All six were cloned and diffed at **content** level — concatenated and
whitespace-normalised, not file level, because two of them had carved large files
into directories and a diffstat reads as deletion when nothing was deleted.

| Source | Advanced to | Verdict |
|---|---|---|
| `oh-my-opencode-slim` | `c518d6ce0515` | **adopt**, with one divergence recorded |
| `oh-my-claudecode` | `adf4bf3280c8` | no change worth making |
| `gstack` | `b5a951e62398` | no change worth making on doctrine |
| `agent-skills` | `d2c37ef6225d` | **adopt** two prose rules; refuse the skill |
| `ballast` | `fea4b4afc93c` | no change worth making |
| `ani-skills` | `035e4d8de282` | no change worth making |

No source is dead: none archived, none 404, all six pushed within six days.

**One divergence, recorded rather than silently kept.** `oh-my-opencode-slim`'s
`80f3845` deleted the sentence behind `omo-slim no-polish-for-its-own-sake` —
`RESEARCH-2026-08-26.md` §3.2 recorded the `impact × confidence ÷ cost` half of
that deletion and missed that the anti-polish clause went with it. **omc-slim
keeps the rule and diverges.** Upstream did not abandon the intent; it replaced a
prose exhortation with a structural bound, and omc-slim's `review` is not
phase-gated the same way, so the prose still does work here that the structure
does not do for us.

**`oh-my-claudecode` is the clean no-op, and the evidence is unusually strong.**
824 commits since the pin, and every agent omc-slim adopted from is **byte
identical** — tree hashes compared directly. The whole `agents/` diff touches one
file this plugin took nothing from.

**One attribution did not survive its own source.** `COVERAGE.tsv` carried
`bisect-on-failure` as `omo-slim`, and `git grep -in bisect` returns nothing
across that repository's entire tree at either revision. The rule is real and
live in `skills/simplify/SKILL.md`; only the origin was wrong. Re-tagged `audit`,
which is what an unsourceable rule found in our own review is. This is the fourth
mis-sourced row this file has had to correct, and the pattern is always the same:
a rule adopted in the same session as a source, and attributed by proximity.

**Two adoptions scheduled rather than taken here**, because both are behaviour
changes and a behaviour change is a release: the duplicate-dispatch rule with its
"retrieval authorizes the retry" escape hatch, and the silenced-checker move —
`ts-ignore`, `eslint-disable`, `noqa` return **zero hits across this entire
plugin**, which is a genuine gap rather than a duplicate.

**One adoption was taken immediately, because it was a defect rather than an
addition.** `agent-skills` states that *"a guard that reads only `git diff`
misses new files"*. `review`'s scope step read only `git diff` and claimed to
include uncommitted work — true for tracked edits, **false for untracked new
files**, and review runs before the commit, which is exactly when new files
exist. Reproduced in a scratch repository, fixed in
`skills/review/scripts/base.sh`, and pinned by two cases in its suite.
