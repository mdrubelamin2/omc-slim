---
name: council
description: Three independent oracle reads on one irreversible decision — risk-first, simplicity-first, evidence-first — reconciled into one verdict with a consensus level. Expensive; get a yes first.
when_to_use: '"more than one opinion before we commit", "give me a second and third opinion". A call you cannot undo cheaply. Never routine; for one read use omc-slim:oracle.'
---

# Council

One question, three independent stances, one synthesis. This exists for
decisions that are expensive to reverse, where a single confident answer is the
failure mode.

**Cost first.** Three `oracle` dispatches plus a synthesis pass. Say so and get a
yes before starting if the caller has not already accepted the cost. For anything
short of irreversible, one `oracle` is the right call and this skill is waste.

## 1. Frame the question

One question, stated once, in the same words for every seat. A seat given a
different framing is not an independent read — it is a different question.

Include the concrete context each seat needs: the files, the constraint, what has
already been tried, what the caller has ruled out. Reference `file.ts:line`,
never paste file bodies.

If the question has several readings, resolve that **before** dispatching. Three
seats answering three different questions produce a synthesis of nothing.

## 2. Dispatch three seats — in one message

All three in a single message so they run concurrently. Each is an `oracle`,
briefed with the same question and one differing stance.

Give every seat this shared brief:

> You are one seat of three answering the same question independently. You will
> not see the other answers and they will not see yours. Do not hedge toward an
> imagined consensus — your value is an independent read.
>
> Read the actual code before answering. Reference `file.ts:line` for every claim
> about the codebase. State assumptions explicitly and mark uncertainty as
> uncertainty.
>
> Lead with the answer. Do not write a report — write an opinion with evidence,
> and end with your confidence: high, medium or low.

Then exactly one of these stances per seat:

**Seat alpha — risk and failure modes first.** Approach the question by asking
what breaks. Before endorsing any option, enumerate how it fails: at scale, under
concurrency, on bad input, at the trust boundary, during partial failure. Ask it
again for six months from now, when someone else maintains it. Weigh data
integrity, security and reversibility above elegance and above speed of delivery.
This is a stance, not a mandate to be negative. If the risky-looking option is
genuinely right, say so, but show that you looked for the failure modes first.

**Seat beta — the simplest thing that could work.** Start from the smallest
possible answer and add only the complexity the question forces on you. Ask, in
order: does this need to exist at all? Does the language or standard library
already do it? Does a dependency already present do it? Can it be one function
instead of a layer? Name specific things to delete or not build — "keep it
simple" is not an answer. If the situation genuinely requires the complex answer,
say so plainly.

**Seat gamma — only what the codebase actually shows.** Answer from evidence in
this repository, not from general best practice. Where the other seats reason
from principle, you reason from what is on disk. Read existing patterns, how
similar problems were already solved here, what the tests assert, and what the
git history reveals about past attempts. Your characteristic contribution is
catching where a principled answer would be right in general and wrong *here*.
If the codebase does not settle the question, say that explicitly rather than
substituting general knowledge. "The repo does not answer this; here is what I
checked" is a valuable contribution. A seat that quietly switches to opinion is
this role's failure mode.

## 3. Synthesise

Work from the three replies. Do not repeat the seats' reading wholesale — they
have done it, and re-reading everything costs tokens for no new information.

**But check what all three assumed.** A contradiction between seats is visible
and gets settled below. A premise every seat shared is invisible, and it is the
correlated error this pattern is most exposed to — three seats of one lineage
agreeing is agreement about training, not about the codebase. So before you
synthesise, name the assumption common to all three answers and go test that one
thing against the repository. Say what you checked and what it showed.

Also open a file where two seats make directly contradictory claims about a
specific line. Settle it, and say that you did.

If the replies are insufficient to answer, say so rather than investigating your
way to an answer they did not give you.

In order:

1. Re-read the original question.
2. Note each seat's key insight, by seat name.
3. Separate genuine agreements from genuine contradictions. A difference in
   emphasis is not a contradiction.
4. Resolve each contradiction with explicit reasoning — say why you chose one
   over the other.
5. Produce the best answer available, which may be better than any single seat's.

**Do not average the seats.** Choose the strongest position and improve it. Do
not collapse the output into a single answer either — the per-seat detail is what
the caller asked for.

## 4. The caveat you must state when it applies

These seats differ by analytical stance — not by model *provider*. They share a
common training lineage, so **correlated error is possible**: they can be
confidently wrong in the same direction. When all three agree, that is weaker
evidence than genuine cross-vendor consensus would be.

If consensus is unanimous on a high-stakes question, note this limitation
explicitly in Remaining Uncertainty. Do not present agreement among three related
models as independent confirmation.

## 5. Required output format

### Council Response

The synthesised answer. Integrate the strongest reasoning, resolve the
disagreements, give a clear recommendation. Concrete and actionable.

### Per-Seat Details

For each of **alpha**, **beta** and **gamma**, by that seat name:

- Key insight or recommendation
- Stated confidence, if given
- Where it agreed or disagreed with the others
- If a seat failed or returned nothing, say so — do not silently omit it

### Council Summary

- **Consensus level**: unanimous | majority | split
- **Agreed points**: what all seats converged on
- **Disagreements**: where they differed, and how you resolved it
- **Remaining uncertainty**: open questions the council could not settle
- **Recommended action**: what to do next

## Why the seats are not agent files

**It replaced four agent files in v0.8.4.** The seats differed only by a stance
paragraph — the rest was duplicated boilerplate, and a stance travels perfectly
well in a dispatch brief. Same parallelism, same independence, four fewer entries
competing in the roster.
