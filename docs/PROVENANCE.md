# Provenance — what was adopted, pinned exactly

Part of [omc-slim](../README.md).

This page lists every external source omc-slim adopted from, pinned to an exact
commit or file hash. It also covers checking for upstream changes and safely
deleting the sources this plugin replaced.

Every source is pinned so a future version can diff against what was actually
read, and adopt upstream changes deliberately rather than by memory.

| Source | Pin | What omc-slim took |
|---|---|---|
| [alvinunreal/oh-my-opencode-slim](https://github.com/alvinunreal/oh-my-opencode-slim) | `282d5f26` (2026-08-11) | The agent roster, routing heuristics, output contracts and most prompt content |
| [Yeachan-Heo/oh-my-claudecode](https://github.com/Yeachan-Heo/oh-my-claudecode) | `7e38c1f9` (2026-08-12), `package.json` 4.15.7, npm `oh-my-claude-sisyphus` 4.15.10 | The deliverable-verification idea, the `tracer` role, `deep-interview`, and six verified failure modes to design against |
| [multica-ai/andrej-karpathy-skills](https://github.com/multica-ai/andrej-karpathy-skills) | `2c606141` (2026-04-20) | "Surgical changes" outright; the whole file as a compression target |
| `~/.claude/CLAUDE.md` | sha256 `e1894ef55a06…` (4,230 B) | Ownership language bans, no early stopping, no permission-to-continue, evidence over plausibility |
| `~/.claude/skills/fable-mode/SKILL.md` | sha256 `c48cbc5cf0c9…` (7,516 B) | Stage map, one failable artefact per stage, backward re-runs, warning threshold, the two self-critique questions, find-and-replace safety |
| [svy04/ballast](https://github.com/svy04/ballast) | `acdf495b` (2026-08-17), v0.8.0 | Constraints do not travel to a subagent; a passing check expires; the zero-context executor; dead ends and a next first action in the progress file; the hook-harness pattern and a debug env var |
| [aniruddha-adhikary/skills](https://github.com/aniruddha-adhikary/skills) | `43fe972a` (2026-08-17) | A check that ran over nothing is not a passing check; an empty search is proved against a known positive; "dead" is a claim about a search, not a property of code; published figures are derived, never hand-copied |

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

Three further packs were read and deliberately **not** adopted wholesale — see
[`RESEARCH.md`](../RESEARCH.md) §6d for why. Their disciplines informed the
register and the one-hook budget:

| Pack | Pin | Informed |
|---|---|---|
| [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) | `7829ffd9` | Hook discipline — it registers exactly one. Its 24-skill surface is the counter-example, not the model |
| [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail) | 4.8.4, `16f29800` | The build ladder and laziness-with-floors stance |
| [JuliusBrussee/caveman](https://github.com/JuliusBrussee/caveman) | `ec83e5ba` | Compressed output contracts and the terse register |

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
