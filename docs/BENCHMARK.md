# Benchmark: omc-slim vs a plain session

Run 2026-08-13. **n=1 per arm — directional, not settled.**

## Method

Three arms, identical except the layer under test. Same one-shot prompt, same
`--allowedTools`, same model, no follow-up. Ambient tone plugins disabled in all
three (`CAVEMAN_DEFAULT_MODE=off PONYTAIL_DEFAULT_MODE=off`).

Prompt, deliberately naming no technology:

> Build a command-line tool that finds duplicate files in a directory tree and
> reports them.

Measures were fixed **before** any arm ran: cost, wall time, turns, files, LOC,
does it run, correctness against a held-out fixture, tests present and passing,
edge-case handling, and whether any arm claimed verification it did not perform.

Grading fixture, never seen by any arm: 13 files across 4 directories with a
3-way text duplicate, a binary pair, two empty files, a 200 KB duplicate, a
symlink pointing at a duplicate, a hardlink sharing an inode, and two unique
files to catch false positives. A second hostile tree added a FIFO, a broken
symlink, a symlink loop, and a `chmod 000` directory.

## Results

| | **plain** | **omc-slim** | **CLAUDE.md + fable-mode** |
|---|---|---|---|
| Cost | **$0.82** | $0.90 | $4.52 |
| Wall | **116 s** | 129 s | 810 s |
| Turns | 15 | **12** | 64 |
| Output tokens | **9,781** | 11,042 | 52,566 |
| Files produced | 2 | 2 | 12 |
| Tool LOC | 197 | 208 | ~600 (4 modules) |
| Tests | 17, pass | 36, pass | 63, pass |
| All 3 dup groups | ✅ | ✅ | ✅ |
| False positives | none | none | none |
| Survives hostile tree | ✅ | ✅ | ✅ |
| Discloses unreadable dir | ✗ silent | ✅ stderr | ✅ stderr + count |
| Discloses hardlink | ✗ | ✗ | ✅ `(hardlink)` annotation |
| CLI flags | `-h -m -x -a --json -q` | **identical** | 11 flags incl. `--separate-hardlinks` |

## What this actually shows

**omc-slim costs 10% more than a plain session and produced a structurally
identical deliverable.** Same file count, near-identical LOC, and — strikingly —
*the same CLI surface, flag for flag*. On a task this size the model's default
instincts dominate; the plugin's influence was marginal.

What the 10% bought, concretely: **2.1× the tests** (36 vs 17) and disclosure of
an unreadable directory that plain silently skipped. For a deduplication tool
that second one is not cosmetic — a silently skipped directory means a file
reported unique may have an unseen twin.

**The large win is against the setup omc-slim replaces, not against plain.**
CLAUDE.md + fable-mode cost **5.0× the plugin** and took **6.3× as long** for the
same correctness, spending it on a 4-module package, 12 files and 64 turns. It
did produce the best hardlink handling of the three, and its verification claims
were all true — it really did build a venv and run the installed console script.

So the honest positioning is not "better than plain". It is: **close to plain
cost, with materially more verification, and a fraction of the cost of a
heavyweight discipline layer.**

## What this does not show

- **n=1.** One sample per arm. Real variance exists; treat every gap under ~20%
  as noise.
- **One task, and a small one.** A single-file CLI is precisely the shape where
  "smallest thing that works" wins and delegation cannot pay. The plugin's
  central claim — that routing work to cheaper tiers beats doing it all on the
  main model — is *untested here*, because nothing was delegated. A large
  multi-file task is where that claim lives or dies.
- **No subagent was used by any arm.** The pantheon did not participate.
- Karpathy Skills was not run as a fourth arm. It remains the efficiency
  benchmark to beat, and on this evidence a plain session already matches it.

## Corrections made during grading

Recorded because they nearly became published findings:

1. **"Baseline" arm was not plain.** `~/.claude/CLAUDE.md` was still active in
   the first control, and its exit-gate language fired in the output. Re-run with
   the file parked to produce a true plain arm. The first control became the
   third column.
2. **"Its tests can't run — pytest isn't installed."** False. The arm used stdlib
   `unittest discover`; the grader assumed pytest. Checking the transcript before
   publishing also confirmed its venv claim was true.
3. **Two "MISSED" correctness results** were `zsh` word-splitting bugs in the
   grader, not real misses.

All three would have been wrong findings that flattered the plugin. The rule
holds: verify a fault before reporting it.
