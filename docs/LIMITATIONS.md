# Honest limitations

Part of [omc-slim](../README.md).

This page lists what omc-slim does not do well, then gives the full benchmark
method and numbers behind its cost and correctness claims. It is for anyone
deciding whether to trust those numbers.

**The council is weaker than it looks.** Its seats differ by model tier,
reasoning effort and analytical stance — not by model *provider*. They share a
training lineage, so correlated error is possible: they can be confidently wrong
together. Unanimous agreement here is weaker evidence than genuine cross-vendor
consensus. The `council` agent is instructed to say so.

**No per-agent temperature.** Claude Code agent frontmatter has no
`temperature`. The upstream `designer` ran at 0.7 deliberately; that is
compensated for in prose, which is not the same thing.

**No AST-aware search.** Upstream used `ast_grep_search` across 25 languages.
Claude Code has no equivalent, so structural queries fall back to `Grep`. The
`explorer` is weaker than its ancestor on "find every function shaped like this".

**It changes your output style.** Stated again because it is the only global
side effect: `force-for-plugin` overrides your `outputStyle` while omc-slim is
enabled. Disabling the plugin reverts it.

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
5.4× the code, and produced the run's only silent failure — skipping an
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
| **omc-slim** | **~4,406 tok** | see above |
| Agent Skills | ~1,826 tok | −1.10pp |

Source for the outer rows: [orcabot.com/benchmarks](https://orcabot.com/benchmarks),
July 2026. In that dataset **sophistication correlates negatively with results** —
the smallest pack won on efficiency, the largest lost to doing nothing. Our own
result is consistent with it.

**omc-slim is the most expensive row in that table**, at 7.5× Karpathy and ~1,740
tokens above oh-my-claudecode. It has grown on net across every release —
2,774 at v0.1.0 against 4,406 today — though not monotonically: v0.6.9 cut 250
tokens and v0.7.6 cut 48. Each increase was individually justified — adopted
behaviours, an anti-context-anxiety instruction, a skill roster the listing could
not be trusted to provide — and they still sum. That is the exact failure mode
oh-my-claudecode was criticised for, arrived at one defensible step at a time.

The earlier figures in this series were measured by hand, and by v0.8.1 the
README quoted two different totals for the same plugin. `measure-context.sh`
exists so that cannot recur; treat pre-v0.8.1 points as approximate.

If further measurement holds this direction, the right response is to shrink
toward Karpathy, not to add features.
