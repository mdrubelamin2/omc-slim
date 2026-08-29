# v1.0 readiness, checked against the criteria rather than against the work

Dated 2026-08-29. Each of the seven exit criteria in
[TODO-v1.0.md](./TODO-v1.0.md) is checked against the item that was supposed to
produce its evidence, not against how much was done near it.

**Verdict: not v1.0. Four criteria met, three need a run that spends money, and
one of the four was met by discovering the criterion rested on a false premise.**

The version stands at **v0.9.4**. Calling it v1.0 would require either running
the measurements or quietly weakening the criteria, and the second is the failure
this project's whole apparatus exists to prevent.

| # | Criterion | State | Evidence, or what is missing |
|---|---|---|---|
| 1 | Delegation pays, measured | **NOT MET** | The instrument now exists — [INSTRUMENTS-R4.md](./INSTRUMENTS-R4.md) §1: a four-adapter task where delegation can pay, a correctness fixture the arms never see, transcript-based detection, and a third arm with `Agent` denied. 15 runs, ~$45–60. Unrun. |
| 2 | Out-of-box liveness | **NOT MET** | Needs three fresh-install sessions on natural prompts. Unrun. |
| 3 | Inertness is visible | **Half MET and verified, half unrun** | `scripts/check-adversarial.sh` installs a real rival plugin — real manifest, real `installed_plugins.json`, real hook binary, nothing stubbed — and passes 9/9 including CRLF frontmatter, a style declared outside `output-styles/`, `force-for-plugin: yes` rather than `true`, and a **stale duplicate of omc-slim itself**, which the hook exempted by name until v0.9.2. The other half, a session whose `Agent` tool is gated, needs a live run. |
| 4 | Native-parity ledger published | **MET** | [NATIVE.md](./NATIVE.md), verified against binary 2.1.251, with a dated removal criterion and a pre-registered falsifying outcome for each crowded slot. |
| 5 | Contradiction sweep is a release gate | **MET, and it earned it** | On its first run as a gate it found eleven contradictions in the release being gated, six introduced by that release. Every one passed every presence check. |
| 6 | The surface ratchet holds | **NOT MET** | Static went 4,197 → 4,405 → 4,309. Net +112 across the run, stated rather than re-baselined. Three of the four additions are required by criterion 3. |
| 7 | Every number re-derivable | **MET for every published figure**; the eval clause is amended below | Six figures pinned to a real tokeniser, and the gate refuses to print a corrected number without one. |

## The criterion-7 amendment, recorded rather than absorbed

The backlog's R0 contingency said that if `claude plugin eval` execution turned
out to be server-gated, criterion 7's eval clause would be satisfied instead by
`smoke-contracts.sh --execute` across all twelve components with committed
transcripts.

**Neither path ran, and the reason is the same for both: they spend money, and
the standing decision for this run was that nothing paid fires.** So the clause
is unsatisfied by either route. Recorded here as an amendment, in the open, per
the contingency's own instruction that the conversion must not be silently
absorbed.

What did run, at zero cost, is worth stating beside it: `smoke-contracts.sh
--self-test` passes 33/33, which proves every behavioural checker can still fail
and every fixture still builds. That is not evidence the components behave. It is
evidence the instrument that would measure them is sound.

## What changed the shape of criterion 5

Criterion 5 asked for the contradiction sweep to be promoted from action item to
release gate. It was, and the first run justified the promotion more than the
argument for it did. Eleven contradictions, six of them introduced by the very
release being gated — including one that left a critique-only visual audit with
**no owner anywhere in the plugin**, because deleting `designer`'s Review mode
routed that work to `review`'s Interface lane, which routes judgement calls back
to `designer`.

A closed loop, created while fixing a different defect, invisible to every
presence check. That is what the gate is for.

## The criterion that turned out to rest on a false premise

Not one of the seven, but it governed all of them.
[VIABILITY-2026-08-28.md](./VIABILITY-2026-08-28.md) §0 called an absence of
competing benchmarks "the moat. It is also currently the only moat." There are at
least five, one at n=500 with significance testing, and one published four months
earlier reporting this project's two headline findings on a competitor.

That correction is worth more than any criterion it disturbs, and it points the
same way they do: **the remaining honest claim is that the harness is committed
and re-runnable, and the negative result is about the central mechanism rather
than an edge case.**

## What v1.0 needs, in one list

1. The multi-file delegation benchmark. ~$45–60, instrument ready, decision rule
   pre-registered including the outcome that falsifies the plugin's own name.
2. Three fresh-install liveness sessions.
3. Two adversarial-install sessions — a rival forced style, and a gated Agent tool.
4. A release that does not grow static, to close the ratchet.
5. The GitHub description updated, which is one command and is the maintainer's
   to run because it publishes.

Items 1–3 are the same blocker wearing three hats: **nobody has spent the money
yet.** No further prose closes any of them, and writing more would be the exact
substitution this project refuses.
