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

These packs were read and deliberately **not** adopted wholesale — see
[`RESEARCH.md`](../RESEARCH.md) §6d for why. Individual rules from each are
pinned in [`COVERAGE.tsv`](../COVERAGE.tsv); it is the surface that was refused,
never the whole pack:

| Pack | Pin | What was taken |
|---|---|---|
| [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) | `7829ffd9` (2026-08-14), then `be42637c` (2026-08-14) | First read: Chesterton's Fence, `git blame` for intent, and `simplify`'s understand-first process. Second, and much the larger: 27 of the 35 pinned `addy` rules, most of them the five-axis review lanes. Its hook discipline — exactly one — against a 24-skill surface that is the counter-example |
| [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail) | 4.8.4, `16f29800` | The build ladder applied retroactively, the finding tags, and marking deliberate ceilings |
| [JuliusBrussee/caveman](https://github.com/JuliusBrussee/caveman) | `ec83e5ba` | Compressed output contracts and the terse register |
| `wait-what` skill | installed locally, unpinned | ASD-STE100 Simplified Technical English: one idea per sentence, active voice, a named actor |
| Claude Code's bundled `code-review` plugin | ships with the CLI | The confidence threshold that suppresses a finding outright |
| Claude Code's bundled simplification skill | ships with the CLI | Conventions come from the repository, never a preferred dialect |

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
lives — 227 rows, and growing with each release:

```bash
./scripts/check-coverage.sh
# 10/10 agents present in the orchestrator roster.
# 6/6 skills present in the orchestrator roster.
# 3/3 published figures quote the measured total.
#
# 227/227 adopted behaviours present.
# Safe to delete the adopted sources; the plugin covers them.
```

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
