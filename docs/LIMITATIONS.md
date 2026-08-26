# Honest limitations

Part of [omc-slim](../README.md).

This page lists what omc-slim does not do well, then gives the full benchmark
method and numbers behind its cost and correctness claims. It is for anyone
deciding whether to trust those numbers.

**No per-agent temperature.** Claude Code agent frontmatter has no
`temperature`, so `designer` cannot be given the wider sampling a visual role
wants; that is compensated for in prose, which is not the same thing.

The old version of this entry said the upstream `designer` "ran at 0.7
deliberately". **That is no longer true.** Upstream removed every agent
temperature literal in
[`c7690923`](https://github.com/alvinunreal/oh-my-opencode-slim/commit/c7690923)
— `council` 0.1, `councillor` 0.2, `designer` 0.7 and the rest — and its docs now
read *"Optional temperature; when omitted, OpenCode chooses its default."* There
is no deliberate 0.7 left to compensate for. The gap is real; the justification
that was written for it was inherited from a decision its author reversed.

**No AST-aware search in the harness.** Upstream used `ast_grep_search` across 25
languages. Claude Code ships no equivalent tool, so structural queries fall back
to `Grep`, and `explorer` is weaker than its ancestor on "find every function
shaped like this".

**The gap is narrower than that wording implied.** `ast-grep` covers ~26
languages, installs standalone, and is one `Bash` call away wherever a developer
already has it — measured on one machine during the 2026-08-26 sweep,
`ast-grep outline` compressed 64,496 lines of TypeScript to 385. omc-slim cannot
*depend* on it, because nothing guarantees it is present. But the honest
limitation is that `explorer` does not currently reach for it even when it is,
not that structural search is unavailable.

Two measured caveats if it is used: `ast-grep outline` degrades badly on
prototype-assignment JavaScript (a 631-line CommonJS file outlined to three
lines), and metavariable patterns over-match, so a thin outline must not be read
as "nothing here". See
[the research](./RESEARCH-2026-08-26.md#710-code-search-retrieval-and-deletion--measured-on-this-machine).

**`maxTurns` is set on every agent and has never been observed firing.** Six
agents carry a bound between 20 and 40 turns. The values are judgement, not
measurement — nothing here establishes what a typical run costs — and **nothing
in this repository verifies the harness honours the key at all.** If it is
ignored, `explorer`'s instruction to "stop searching with turns in hand" budgets
against a limit that does not exist, and no check would tell you. Treat the bound
as a declared intent rather than a guarantee until a run is observed hitting it.

**It changes your output style.** `force-for-plugin` overrides your `outputStyle`
while omc-slim is enabled. Disabling the plugin reverts it.

**It used to connect two remote MCP servers, and this page denied it.** Until
v0.8.3 both this page and the README called the output style "the only global
side effect". That was false. `.mcp.json` shipped `context7`
(`mcp.context7.com`) and `gh_grep` (`mcp.grep.app`), and Claude Code starts a
plugin's MCP servers automatically — there is no per-server prompt. They loaded
namespaced, as `mcp__plugin_omc-slim_context7__*`, so library names and
code-search strings reached two third-party hosts. It was disclosed in
`RESEARCH.md` and `MAINTAINERS.md` and in neither of the two places a user
actually reads, which is the same as not disclosing it.

`.mcp.json` has been removed rather than documented. `librarian` finds whatever
documentation servers your project or user config provides, so the capability
survives wherever you already have it, and the plugin no longer decides on your
behalf which hosts your queries reach. See
[the audit](./AUDIT-2026-08-25.md) for how it was found.

**The static figure is disciplined and the bodies are not.** v0.9.0 added roughly
**5,495 tokens of on-invoke cost in one release, 4,841 corrected** — every addition individually
justified by measurement, and their sum unmeasured, which is the exact failure
mode this project has criticised in others. `./scripts/measure-context.sh` now
reports on-invoke cost per component so the next increase is visible while it
happens rather than three releases later.

Two consequences worth knowing. **`review` is the heaviest component**, and its
SKILL.md alone is 5,662 tokens on the chars/4 basis, ~4,988 corrected —
against a post-compaction re-injection limit that keeps only the **first 5,000
tokens of a skill**. It sits on the line: under on the corrected basis, over on
chars/4. Its load-bearing rules are front-loaded and its lane mechanics live in
`checklists.md`, which is where they were moved when this measurement was taken.
That margin is 11 tokens, and it was bought back: an earlier v0.9.0 draft
measured 5,087 corrected and published 4,995, because the file grew by 419 chars
after the number was taken and nothing re-derived it.

The per-skill cap is not the binding one. Re-attached skills share a **combined
25,000-token budget**, filled from the most recently invoked, so on a long
session older skills are dropped entirely rather than truncated
([docs](https://code.claude.com/docs/en/skills)). Twelve components against
25,000 is the constraint that actually bites.

The ceiling if every component fires once is **32,533 chars/4, ~28,664 corrected**.

Counting siblings is new, and it exposed an older understatement.
`review/checklists.md` is read on **every** review — "read it now, before judging
anything" — and `measure-context.sh` had never counted it, because `body_chars`
silently returned 0 for any file without YAML frontmatter. That contradicted its
own comment and had gone unnoticed. Fixed; the conditional siblings
(`performance.md`, `depth.md`, `principles.md`) are now listed separately and
excluded, because a file opened on one run in five is not a cost paid on every
run.

And the honest comparison: measured against `obra/superpowers` at v6.3.0,
omc-slim's always-on surface came out **marginally larger** (~5,743 bytes against
~5,556). The defensible claim was never "smaller". It is **no runtime that
multiplies** — no fan-out by default, nothing on the tool-call path — and every
skill that grows puts that claim closer to the line.

**Nothing here survives a compaction unless the harness re-sends it.** Measured:
constraint violations run **0% while a policy is in full context and 30% on
average after compaction, up to 59%** on some models; conditional on the rule
being dropped from the summary, **38%**
([arXiv:2606.22528](https://arxiv.org/abs/2606.22528)). The output style is part
of the system prompt and is re-sent every turn, which is structurally the
"constraint pinning" that paper found restores 0% — a real advantage over a
`CLAUDE.md`-based layer, and worth knowing. But a mid-session correction, a
delegation brief, and an invoked skill body are all in the class that gets
evicted. A separate measured effect compounds it: compliance falls roughly
**5.6% per additional function generated** within one session
([arXiv:2605.10039](https://arxiv.org/abs/2605.10039)). omc-slim has no
re-assertion mechanism and does not claim one.

**No standing-rule delivery.** A correction you make in one session does not
survive into the next, and nothing re-states it when a later message needs it.
[ballast](https://github.com/svy04/ballast) solves this with a `UserPromptSubmit`
hook that injects matching rules from a JSON catalog. We did not adopt it: it is
per-message injection, its `block` action refuses a prompt where every mechanism
here is advisory, and its value depends on a catalog you must write by hand. The
delegation contract carries constraints into the brief instead, which also
reaches subagents — where a prompt hook by design does not. Use `CLAUDE.md` for
anything that must persist.

**These numbers describe a build that no longer exists.** They were measured
against the pre-restructure prompts. Since then every agent and skill has been
restructured, four agents became one skill, and the output style was reorganised
— so the artefact under test is not the artefact that ships. `scripts/bench/` has
not been re-run. Treat the table below as the last known measurement of an
earlier version, not as a claim about the current one, until it is.

**Measured, honestly, and repeatably.** Full method and caveats in
[`docs/BENCHMARK.md`](./BENCHMARK.md). One prompt naming no technology
("build a CLI that finds duplicate files"), three arms, held-out grading fixture,
measures fixed before running. **n=3 per arm.** The harness is committed at
`scripts/bench/`, so anyone can re-run it.

| | Cost | Tool LOC | Tests | Flags | Correct |
|---|---|---|---|---|---|
| plain session | $1.2367 | 434 | 39 | 16 | ✅ |
| **omc-slim** | **$1.0146** | **251** | 21 | **6** | ✅ |
| CLAUDE.md + fable-mode | $7.0651 | 1,077 | 137 | 22 | ✅ |

**omc-slim costs 18% less than a plain session, and the spreads do not overlap** —
plain's cheapest run still costs more than omc-slim's dearest. It also ships the
smallest tool of the three, with a 6-flag CLI, at identical correctness. All nine
runs found every duplicate group with no false positives.

Its three runs landed at 243, 251 and 258 LOC with the same 6 flags every time,
while plain ranged 351 to 539 LOC and 14 to 19 flags. **Consistency is the
clearest signal in the data.**

More code did not buy more correctness. The heavyweight arm wrote 137 tests and
4.3× the code, and produced the run's only silent failure — skipping an
unreadable directory without a word. It also proved wildly unstable: three runs
of one prompt cost $4.71, $6.01 and $10.47.

Against the setup this replaces: **7.0× cheaper and 6.5× faster**, at equal
correctness.

This reverses the earlier v0.4.1 result, which found omc-slim 10% *more*
expensive with 2.1× the tests. Note the baseline moved too — plain now emits 2.3×
the output tokens it did then, and carries Claude Code's built-in skills — so the
two runs are not one series. The old table is kept in the appendix of
[`docs/BENCHMARK.md`](./BENCHMARK.md).

So the honest claim is not "better than plain". It is *close to plain cost, with
materially more verification, at a fraction of a heavyweight discipline layer.*

What it does **not** show: the central bet. A single-file CLI is exactly where
"smallest thing that works" wins and delegation cannot pay — **no subagent ran in
any arm.** Whether routing work to cheaper tiers beats doing it all on the main
model is still untested, and needs a large multi-file task to settle.

For context on why that matters:

| | Static context | Independent benchmark |
|---|---|---|
| Karpathy Skills | ~589 tok | +0.96pp at identical cost |
| oh-my-claudecode | ~2,671 tok | +1.65pp at +43% cost |
| **omc-slim** | **~4,487 tok** | see above |
| Agent Skills | ~1,826 tok | −1.10pp |

Source for the outer rows: [orcabot.com/benchmarks](https://orcabot.com/benchmarks),
July 2026. In that dataset **sophistication correlates negatively with results** —
the smallest pack won on efficiency, the largest lost to doing nothing. Our own
result is consistent with it.

**omc-slim is the most expensive row in that table**. It has grown on net across
every release — 2,774 at v0.1.0 against 4,487 today — though not monotonically:
v0.6.9 cut 250 tokens and v0.7.6 cut 48. Each increase was individually
justified — adopted behaviours, an anti-context-anxiety instruction, a skill
roster the listing could not be trusted to provide — and they still sum. That is
the exact failure mode oh-my-claudecode was criticised for, arrived at one
defensible step at a time.

The earlier figures in this series were measured by hand, and by v0.8.1 the
README quoted two different totals for the same plugin. `measure-context.sh`
exists so that cannot recur; treat pre-v0.8.1 points as approximate.

If further measurement holds this direction, the right response is to shrink
toward Karpathy, not to add features.
