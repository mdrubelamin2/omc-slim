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
was refused too — this plugin ships one hook and stays off the tool-call path. So was
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

The last three carry no commit to pin. Two ship with Claude Code and move with
it; `wait-what` was read from a local install. They are recorded here because
`COVERAGE.tsv` pins rules to them, and an origin with no provenance entry is how
an adoption becomes folklore.

None is named anywhere in the plugin's prompts — the behaviour is described
directly, so nothing depends on those packs being installed.

Benchmark figures come from [orcabot.com/benchmarks](https://orcabot.com/benchmarks),
July 2026 run, page last updated 2026-08-08.

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
would catch a later edit quietly dropping an adopted rule.
[`COVERAGE.tsv`](../COVERAGE.tsv) maps every load-bearing rule to where it now
lives — 244 rows, and growing with each release:

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
# 6/6 agents present in the orchestrator roster.
# 6/6 skills present in the orchestrator roster.
# 3/3 published figures quote the measured total.
# 2/2 plugin-internal paths resolve.
# 3/3 worded rosters match: six agents, six skills, one hook.
# 14 test cases and 17 mutants, both stated in README.
# 12/12 frontmatter blocks parse.
# 15/15 adopted origins classified, 14 external and all documented.
#
# 244/244 adopted behaviours present.
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
