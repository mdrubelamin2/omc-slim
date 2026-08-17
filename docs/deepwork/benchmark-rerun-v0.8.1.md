# Benchmark re-run at v0.8.1

Rebuild the benchmark harness, then re-run all three arms at n=3.

## Why this exists

`docs/BENCHMARK.md` records a run from 2026-08-13 against **v0.4.1**. Twenty
releases have shipped since. The harness that produced it — fixture generator
and grader — was never committed, so the run was not repeatable and the numbers
went stale unchallenged. Committing the harness is half the point of this work.

## Done criteria

1. `scripts/bench/` regenerates the fixture and grades a candidate, committed.
2. Three arms run at n=3 in a config-isolated way that never mutates user config.
3. `docs/BENCHMARK.md` carries a v0.8.1 section with a spread, not a point.
4. The v0.4.1 section stays, stamped, as the historical record.

## Confirmed findings

**`CLAUDE_CONFIG_DIR` isolation does not work.** A fresh config directory has no
credentials — `"Not logged in · Please run /login"`. Auth lives in the macOS
Keychain, not in the config directory, and copying credentials around is not an
acceptable way to run a benchmark.

**`--setting-sources` is the correct isolation.** It drops user settings,
user-level plugins and `~/.claude/CLAUDE.md` while leaving Keychain auth intact.
All three arms use the **same** flag, `--setting-sources "project"`, so the only
difference between them is working-directory contents and one `--plugin-dir`.
A differing flag would be exactly the confound that invalidated the original
plain arm. Every row below was probed live:

| Arm | Working directory | Probe reports |
|---|---|---|
| plain | empty | default style, no CLAUDE.md |
| omc-slim | empty, `--plugin-dir <repo>` | `omc-slim:omc-slim` |
| fable | `CLAUDE.md` + `.claude/skills/fable-mode/` | both loaded |

The plain arm does carry Claude Code's built-in skills — `code-review`,
`simplify`, `security-review` and others. That is correct for a plain session
and identical across all three arms, so it is not a confound.

`--bare` was rejected: it skips keychain reads and demands `ANTHROPIC_API_KEY`.

Probe spend to reach this point: **$0.62**.

**Arm-3 sources were never lost.** Commit `51073c5` moved them into
`docs/upstream/`; it did not delete them.

## Stage status

| Stage | State | Check |
|---|---|---|
| 1. Run mechanism | **done** | all three arms probed live, uniform flag |
| 2. Fixture generator | **done** | independently re-verified, see below |
| 3. Grader | **done** | reproduced the known grid, re-checked independently |
| 3b. Artefact measures | in progress | tests and CLI flags, missing from `grade.sh` |
| 4. Arm runner | **done** | dry runs diff-identical except `--plugin-dir` |
| 5. Nine paid runs | **done** | all nine completed, none capped |
| 6. Aggregate and publish | blocked | grading fixes in flight |

## Stage 5 — results, cost only

| Arm | Mean | Spread | Delta |
|---|---|---|---|
| **omc-slim** | **$1.0146** | $0.9677 - $1.1058 | 14% |
| plain | $1.2367 | $1.2002 - $1.2550 | 4.5% |
| fable | $7.0651 | $4.7087 - $10.4739 | **122%** |

Total spend **$28.90** — $27.95 of runs plus $0.945 of probes.

**omc-slim is 18% cheaper than plain and the spreads do not overlap.** Plain's
cheapest run costs more than omc-slim's dearest. At v0.4.1 the finding was "10%
more expensive"; it has reversed.

**The heavyweight arm is unstable, which n=1 hid.** Three runs of one prompt cost
$4.71, $6.01 and $10.47. Run 3 took 30 minutes, 98 turns and produced 68 files;
run 2 produced 13. The historical $4.52 was not a typical run, it was the
cheapest kind of run.

## Four measurement bugs found while grading

Every one of these would have produced a wrong published number.

1. **My summary script, not the grader.** I reported `rc != 0` as a crash.
   `grade.sh` only ever flagged signal-kills. The wrong column was mine, and I
   corrected the attribution rather than letting the grader take the blame.
2. **Crash detection was genuinely too weak**, in the opposite direction. An
   uncaught Python exception exits `rc=1`, indistinguishable from a status code,
   so a crashed tool scored "survived". Now detected via traceback signature.
3. **Disclosure was binary when reality is three-way.** `1 path(s) could not be
   read` scored as *silent*. Now `specific` / `generic` / `silent`, and only
   silent fails.
4. **`files_produced` counts harness output.** `result.json`, `stderr.log` and
   `artifacts.json` were counted as arm deliverables. Validation could not catch
   it: `docs/bench-samples-*` hold no harness files, so both samples scored a
   correct 2.

Bug 4 generalises. **A measure validated only against clean directories will not
catch contamination from the directory it runs in.** I also caused a version of
it myself, by writing grading output into the run directories I was measuring.

## Entry-point discovery failed on the fable arm

`measure-artifacts.sh` picked "largest executable or source file", which selected
`tests/test_finder.py` for two fable runs and a 6-line `bin/dupefind` wrapper for
the third. Grading then refused to run. All three fable runs build a real
package with `<pkg>/__main__.py` and a `pyproject.toml`, so the entry point is
`python3 -m <pkg>` — never a single file. Fix in flight.

## Stage 3 — the money gate, cleared

`docs/bench-samples-plain/` and `docs/bench-samples-omc-slim/` are the tools the
original arms actually produced, and `docs/BENCHMARK.md:37-42` records how each
scored. `grade.sh` re-derives that grid exactly, confirmed by a second pass:

| | plain | omc-slim | recorded |
|---|---|---|---|
| groups_found | 3/3 | 3/3 | ✅ both |
| false_positives | 0 | 0 | none both |
| hostile_survived | yes | yes | ✅ both |
| discloses_unreadable | silent | disclosed | ✗ silent / ✅ stderr |

The asymmetric row is the one that matters — it is hard to reproduce by accident.

`grade.sh` does not cover two rows the published table carries: test count
(`docs/BENCHMARK.md:36`) and CLI flags (`:42`). The "2.1x the tests" headline at
`:51` rests on the first, so `measure-artifacts.sh` was added to close the gap.
Without it the new table cannot be compared to the old one on its own headline.

## Stage 2 — fixture, verified independently

`scripts/bench/make-fixture.sh` builds 13 non-directory entries across 4
directories, plus a hostile tree and `manifest.json`. Re-checked by a second
pass, not by its author: all three scored groups byte-identical (65 B, 256 B,
204800 B), hardlink shares an inode, symlink resolves to a 3-way member, both
empty files 0 B, unique files distinct, FIFO and broken symlink present.

The spec I wrote was wrong on one point. It demanded `find tree -mindepth 1`
return 13, which is impossible alongside "4 directories" — a bare `find` counts
directories too, giving 17. The lane caught the contradiction and resolved it as
13 **non-directory** entries, which is what `docs/BENCHMARK.md` means by "13
files across 4 directories". Its reading is right.

## Stage 5 — cost calibration, answered

One plain run before committing to nine: **$0.876, 14 turns, 185 s**, producing
`dupefind.py`, `test_dupefind.py` and a README. The v0.4.1 plain arm cost $0.82,
so per-run cost has moved about **+7%** — the ~$18.72 projection holds and the
run proceeded without a second decision point.

Runs are sequential, never parallel. Wall time is one of the measures, and
concurrent arms would contend for the same API and corrupt it.

Spend before the nine runs: **$0.945** — $0.62 in isolation probes, $0.325 in a
`--max-turns` check by the runner lane.

## Three errors found in the v0.4.1 published table

All three are checkable today, because the artefacts still exist in
`docs/bench-samples-*`. These are factual errors in a record, not stale
measurements, so they get corrected rather than preserved.

1. **`docs/BENCHMARK.md:35` "Tool LOC 197 / 208" is a raw `wc -l`.** Confirmed:
   `wc -l` gives exactly 197 and 208. Counting non-blank, non-comment lines
   gives 161 and 168. The row is a total line count and should say so.

2. **`docs/BENCHMARK.md:48` omits `-L`.** Both tools advertise
   `-L/--follow-symlinks`. The recorded list has six flags; there are seven.

3. **"the same CLI surface, flag for flag" (`:47`) is an overstatement.** The
   short flags match — `-h -m -x -a -L -q` plus `--json`. Two things differ:
   `-a` is `--all` in plain and `--hidden` in omc-slim, and `-q` means different
   things — plain suppresses unreadable-file warnings, omc-slim suppresses
   headers and summary. Same shape, not the same surface.

Finding 3 also explains the disclosure fault precisely. Plain owns warning
machinery for unreadable *files* and a flag to silence it, yet still says
nothing about an unreadable *directory*. The gap is not missing capability; it
is capability never applied to the directory case.

**Limitation of `measure-artifacts.sh`:** it de-duplicates flags to short forms,
so it reports both arms as an identical 7-flag set and cannot see finding 3.
Read `cli_flag_list` as the short-flag surface, not the full interface.

## Open questions

- **Model differs from the original run.** All three arms share one model, so
  relative comparison holds; absolute costs are not comparable to 2026-08-13.
  This must be stated in the published section.
- **`run-arm.sh` counts `__pycache__` in `files_produced`.** `measure-artifacts.sh`
  excludes it. The latter is authoritative for the published table; the former's
  count is a progress indicator only. Do not mix them.
- **"Plain" is a stronger baseline than it was.** It now carries Claude Code's
  built-in skills, including `code-review` and `simplify`. Any narrowing against
  v0.4.1 may reflect a better baseline rather than a worse plugin.
