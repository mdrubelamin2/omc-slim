# v1.0 readiness, checked against the criteria rather than against the work

Dated 2026-08-29. Each of the seven exit criteria in
[TODO-v1.0.md](./TODO-v1.0.md) is checked against the item that was supposed to
produce its evidence, not against how much was done near it.

**Verdict: not v1.0. Three criteria still need a run that spends money, and the
four that do not are now harder to pass than they were this morning.**

The criteria themselves were audited for the first time, in
[CRITERIA-AUDIT-2026-08-29.md](./CRITERIA-AUDIT-2026-08-29.md). Six of the seven
could be satisfied without doing the thing they name, and three of the criteria
scored MET were met through the loophole rather than the requirement. Every
change that audit made tightens the bar, and the standing below is worse for it.
That is the correct direction: a criterion you can pass by writing a sentence is
one that will be passed by writing a sentence.

The version stands at **v0.10.1**. Calling it v1.0 would require either running
the measurements or quietly weakening the criteria, and the second is the failure
this project's whole apparatus exists to prevent.

| # | Criterion | State | Evidence, or what is missing |
|---|---|---|---|
| 1 | Delegation pays, measured | **NOT MET** | The instrument now exists — [INSTRUMENTS-R4.md](./INSTRUMENTS-R4.md) §1: a four-adapter task where delegation can pay, a correctness fixture the arms never see, transcript-based detection, and a third arm with `Agent` denied. 15 runs, ~$45–60. Unrun. |
| 2 | Out-of-box liveness | **NOT MET** | Needs three fresh-install sessions on natural prompts. Unrun. The criterion's second branch — "or the README says it will not and shows the unlock" — was an escape hatch a documentation edit could satisfy, so it no longer sits behind an "or": the run happens either way and its outcome decides which branch applies. See [CRITERIA-AUDIT-2026-08-29.md](./CRITERIA-AUDIT-2026-08-29.md) §4. |
| 3 | Inertness is visible | **Half MET and verified, half unrun** | `scripts/check-adversarial.sh` installs a real rival plugin — real manifest, real `installed_plugins.json`, real hook binary, nothing stubbed — and passes 9/9 including CRLF frontmatter, a style declared outside `output-styles/`, `force-for-plugin: yes` rather than `true`, and a **stale duplicate of omc-slim itself**, which the hook exempted by name until v0.9.2. The other half, a session whose `Agent` tool is gated, needs a live run. |
| 4 | Native-parity ledger published | **MET as a ledger. 0 of 4 overlaps carry a measured win.** | [NATIVE.md](./NATIVE.md), verified against binary 2.1.251, with a dated removal criterion and a pre-registered falsifying outcome for each crowded slot. The criterion says "a measured win **or** a dated removal criterion", and all four rest on the second branch, because the benchmark that would measure a win is unrun. The ledger is the deliverable; parity is not established, and the row now says so. See [CRITERIA-AUDIT-2026-08-29.md](./CRITERIA-AUDIT-2026-08-29.md) §3. |
| 5 | Contradiction sweep is a release gate | **MET for v0.9.7. Retroactively NOT MET for v0.9.5 and v0.9.6.** | It skipped v0.9.5 and v0.9.6, and that is exactly where a gate-policy contradiction, a false pin count and a stale scope claim landed — all found later by a seven-seat review rather than by the sweep. It ran on v0.9.7, in two lanes over all eighteen prompt files, and found **eleven** contradictions: four output contracts with no slot for what their own rule demands, three words carrying two meanings, two wiring claims the harness contradicts, two skills disagreeing with their own siblings. All eleven closed. Two runs, two double-digit hauls, and both releases it skipped shipped defects: the evidence says this gate earns its cost and that skipping it is what costs. The criterion read "zero open findings at tag time", which a sweep that never runs satisfies perfectly — and did, twice. It now requires the sweep to have run on this build with its finding count in the release notes. See [CRITERIA-AUDIT-2026-08-29.md](./CRITERIA-AUDIT-2026-08-29.md) §2. It ran on v0.9.9 as two lanes plus a hook review: 127 findings, counts in the release notes. A ten-lane review under the `review` skill and a fresh-context adversarial pass then found 103 more (2 critical, 43 required, 58 optional); all six critical across both rounds are closed, and the required items still open are named in the release notes. |
| 6 | The surface ratchet holds | **NOT MET** | Static went 4,197 → 4,405 → 4,309 → 4,413. Net +216 across the run, stated rather than re-baselined. Three of the four earlier additions are required by criterion 3; the v0.9.7 addition of +70 is the catch-all precedence rule, taken because a router that sends explorer work to `general-purpose` wastes the whole 4,413 rather than saving 70. The criterion said "did not grow two releases running", which this run passes on its wording: it never grew twice consecutively and still grew 5.1%. A ratchet that resets on any single decrease is a sawtooth. It now measures against the lowest figure any release has reached on the real-tokeniser basis, which is 4,197. v0.10.1 is 2,061, -2,136 above that floor: the teardown release, and the new floor. Scored NOT MET rather than met-with-an-accepted-excess, because the earlier increases in this run were never put to that test. See [CRITERIA-AUDIT-2026-08-29.md](./CRITERIA-AUDIT-2026-08-29.md) §1. |
| 7 | Every number re-derivable | **MET for every published figure**; the eval clause is amended below | Fifteen sites pinned to a real tokeniser, and the gate refuses to print a corrected number without one. v0.9.7 found the pin LIST was the weak part rather than the measurement: seven sites were enrolled and every other present-tense use of the same number was not, so three sentences kept quoting a superseded total. Also corrected the on-invoke ceiling, which was scaled from the static set's ratio and understated by 997 tokens. |

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

## The one that failed by not being run

Criterion 5 is the sharpest lesson in this file, and it is not about the plugin.
The sweep was promoted to a release gate, justified itself immediately, and then
**I stopped running it** for two releases while continuing to mark the criterion
met. Three of the four findings a later review returned would have been caught by
it, because all three are one shipped sentence contradicting another:

- `check-coverage.sh` states that `CHANGELOG.md` is deliberately not enrolled,
  *"because pinning a current figure into it forces rewriting what an earlier
  release actually shipped"* — and `check-prose.sh` enrolled it, and did exactly
  that to 355 lines of shipped history.
- A comment reading *"Fenced blocks are deliberately NOT stripped"* sitting forty
  lines from one reading *"Commented-out and fenced text is removed first."*
- `CHANGELOG.md` claiming thirteen pinned rules where there are eleven.

None is a correctness defect and none moved a fact. All three are the failure
class this project measured as the compliance killer, shipped by the person who
built the gate against it. **The checklist in `MAINTAINERS.md` has the step; what
was missing was running it when the release felt small.**

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
