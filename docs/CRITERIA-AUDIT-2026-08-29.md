# The exit criteria, audited against themselves

Dated 2026-08-29. Every other document here checks the plugin against the seven
v1.0 exit criteria. Nothing had checked the criteria.

They were written to be a bar. Read as an adversary would read them, six of the
seven can be satisfied without doing the thing they name, and three of the
criteria currently scored MET are met through the loophole rather than the
requirement. This audit makes the bar harder and the current standing worse.
That direction is the point: a criterion you can pass by writing a sentence is a
criterion that will be passed by writing a sentence.

## The rule this audit enforces

A criterion has to be falsifiable by the product, not by the prose about the
product. Where a criterion offers a choice between doing the work and describing
why the work was not done, the description wins every time under deadline, and
the bar quietly becomes a writing exercise.

## Findings

### 1. Criterion 6 does not ratchet, and this run walked through it

> "static did not grow two releases running"

Static went 4,197 → 4,405 → 4,309 → 4,413 across this run. No two consecutive
growths, so the criterion passes on its own wording. The surface still grew
216 tokens, 5.1%, and it can grow without limit as long as every second
release gives a little back.

A ratchet that resets on any single decrease is not a ratchet. It is a
sawtooth with an upward trend.

Tightened to: static must not exceed the lowest figure any release has
reached, unless the increase is named, costed and accepted in the release notes
with what it buys. `measure-context.sh` prints the number; the floor is a
recorded fact rather than a memory.

Effect on the score: was NOT MET, stays NOT MET, now for the honest reason.
The old reason was a net figure nobody had turned into a rule.

### 2. Criterion 5 is satisfied by not running the sweep

> "zero open findings at tag time"

A sweep that never runs has zero open findings. The criterion is satisfied most
completely by skipping the work.

This is not hypothetical and it is not a near miss. it already fired twice.
v0.9.5 and v0.9.6 were both tagged with the criterion technically satisfied,
because the sweep did not run on either. A gate-policy contradiction, a false pin
count and a stale scope claim shipped in those two releases, and a seven-seat
review found them afterwards. When the sweep finally ran on v0.9.7 it returned
eleven contradictions.

Tightened to: the sweep ran on this build, over the full prompt surface, and
its finding count is recorded in the release notes — zero is a result only when
it is a result of running. A release whose notes carry no sweep count has not met
this criterion.

Effect on the score: MET for v0.9.7, which recorded eleven. Retroactively NOT
MET for v0.9.5 and v0.9.6, which is what actually happened.

### 3. Criterion 4 is satisfied by writing dates

> "every overlapping component carries a measured win **or** a dated removal
> criterion"

NATIVE.md covers four overlaps. None carries a measured win. Every one rests
on a dated removal criterion, because the benchmark that would measure a win is
unrun. The criterion is scored MET and is met entirely through its escape hatch.

The escape hatch is defensible on its own: an unmeasured overlap with a dated
removal date is honest, and better than a claimed win with nothing behind it.
What is not defensible is a criterion named "native-parity ledger published"
reading as a quality bar when zero parity has been established.

Tightened to: the criterion is met by the ledger existing with a dated
criterion per overlap, and the score must state **how many overlaps carry a
measured win** — currently 0 of 4. The ledger is the deliverable; parity is not,
and the document must stop implying otherwise.

Effect on the score: stays MET as a published ledger, now annotated 0/4
measured. The reader can no longer mistake it for evidence of parity.

### 4. Criterion 2 is satisfiable by a documentation edit

> "produces one delegation on a natural prompt, **or** the README's first screen
> says it will not and shows the unlock"

A liveness criterion that a README edit satisfies measures nothing about
liveness. Under any deadline, the sentence gets written.

The escape hatch has a real purpose — telling the user the truth beats shipping
a plugin that silently does nothing. But it cannot sit behind the word "or" as an
equal branch, because it is strictly cheaper than the alternative.

Tightened to: the fresh-install run happens either way. Its outcome decides
which branch applies. Writing the README sentence without running is not the
second branch; it is skipping the criterion. The unlock text is what the run's
result requires, not what stands in for the run.

Effect on the score: NOT MET, unchanged, and now unmeetable by writing.

### 5. Criterion 3's "or" permits claiming the whole on half the evidence

> "a stolen style slot **or** a gated Agent tool is learned from the product
> within one session"

Two independent ways the plugin can be silently inert. Satisfying one leaves the
other invisible, which is the exact failure the criterion is named for.
RELEASE-READINESS already scores it conjunctively at "half MET" — the correct
reading — but the wording permits the weaker one and a later reader will take it.

Tightened to: "and", not "or". Both surfaces, or the criterion is unmet.

Effect on the score: half MET, unchanged in substance, now unambiguous. The
stolen slot is proved by `check-adversarial.sh` 9/9 against a real rival plugin.
The gated Agent tool has its mechanism shipped at `output-styles/omc-slim.md:14`
and no live run behind it.

### 6. Criterion 1 lets the winning metric be chosen after the run

> "beats plain on cost **or** wall-clock at equal correctness"

Two metrics, either sufficient, selected after the data is in. That is a forking
path, and with n=3 it is a generous one. "Equal correctness" is also undefined:
equal on the held-out fixture, equal on grader score, equal within what tolerance.

Tightened to: name the primary metric and the correctness tolerance in
`INSTRUMENTS-R4.md` **before** the arms fire, and report both metrics whichever
way they fall. A pre-registered loss is a result worth having and this repository
has published one before.

Effect on the score: NOT MET, unchanged. The instrument gains a
pre-registration line it did not have.

### 7. Criterion 7 survives the audit

> "benchmark re-run on the shipping build; the eval suite has executed at least
> once"

No hatch, no disjunction, no metric to choose after the fact. Blocked on spend,
not on wording.

## What this changes about the release

Nothing gets easier. Two criteria that read as passes are re-annotated to show
what they actually rest on, one becomes retroactively unmet for two shipped
releases, and three gain requirements they did not have.

The bar was seven criteria, of which three were unmeetable without spending
money. It is still seven criteria, three still need money, and the other four are
now hard to pass by writing.
