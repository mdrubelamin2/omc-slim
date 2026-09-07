# Review lanes: always on

What the four always-on lanes look for, plus the briefs and the report-time
suppression list. Every item is a *candidate*: nothing is reportable until it
clears the gates in `SKILL.md`.

**The six conditional lanes are one file each in [`lanes/`](./lanes/)** —
`security.md`, `data-and-schema.md`, `api-contract.md`, `interface.md`,
`operations.md`, `performance.md`. Open the ones the lane table in `SKILL.md`
triggers and leave the rest shut: one file per trigger, so a diff that fires one
lane pays for one lane.

---

## What each specialist returns, and how to brief it

Ask for what the agent can give you. A brief that asks for the wrong shape gets an answer in the wrong shape, and you cannot tell from the output.

- **`omc-slim:explorer`**: locations. Every consumer of an enum, every caller of a changed function, whether code is genuinely dead. It is forbidden to propose a fix or a next step, so brief it for the map and write the remedy yourself. Its 150-line cap binds a *survey* and yields to a complete enumeration. Ask for all of something and you get all of it, with the count on the first line. Or a partial set labelled with what it did not reach. **Read that label before judging completeness against the set**, because a truncated set reads like a whole one.
- **`omc-slim:oracle`**: a judgement on a decision, and it does propose. Use it where the question is architecture, security or data integrity, not where the question is what the diff says.
- **`omc-slim:tracer`**: ranked competing hypotheses, for a failure whose cause you cannot explain or one a previous fix did not hold against. Not a lane: the lane table triggers on the diff, and this triggers on a finding you could not explain once you had one. It diagnoses and does not patch, and it may return `undetermined`, which is not `ruled out`.
- **`omc-slim:librarian`**: anything true outside this repository, carried back with its source. You send it; a lane cannot.

None of them can dispatch another agent. An external claim therefore comes back to you unresolved, and you are the one who sends it on.

## Correctness

- Off-by-one, boundary, empty, null, single element, maximum size
- The first run ever, with no data
- The button clicked twice in 100ms
- A branch that logs and continues where it should stop
- An operation that can half-complete, three of five processed then a crash, leaving records inconsistent
- A catch-all that swallows
- A background job that fails with nobody watching
- A default returned where an error was the honest answer

**Conditional side effects**: one branch updates the related record and the other forgets. A log line claiming an action that was conditionally skipped. An event that fires only on the happy path.

**Read-check-write races**: `find` then `create` with no unique index. A status transition that is not an atomic `WHERE old_status = ?`. Concurrent callers double-applying or skipping.

**Boundary coercion**: a value crossing serialisation where numeric becomes string, so digest inputs must normalise first (`{cores: 8}` and `{cores: "8"}` hash differently). A "today" key covering only midnight-to-now. Two features bucketing the same data hourly and daily.

## Completeness

**The one lane that reads outside the diff.** A member the change forgot is not in the diff, and no other lane can reach it.

- **A new enum value, status, tier or type constant**: grep its *siblings*. Read every file that switches on, filters by, persists or displays them. Check allowlist arrays and `case` chains for the new value falling through to a wrong default. The classic miss is adding it to the dropdown while the backend never persists it.
- **A change that covers a set**: every page, all the endpoints, each consumer. Enumerate the set **from the goal, not from the old implementation**: "everything importing the helper being replaced" cannot find the file that never imported it. Resolve every route or caller to its code and test membership, then name each member the diff did not touch.
- **A new required field, a renamed export, a removed parameter**: every construction site, every importer, every override.

## Simplicity

The `omc-slim:simplify` skill's scope, applied as review: detect here, hand the fix over when it runs past a line or two.

- An abstraction with one implementation and no test substituting at the seam
- A wrapper that only forwards
- Hand-rolled code the standard library, the platform or an installed dependency already ships
- A config key nobody sets, or a flag with one value
- Nesting three deep, or a nested ternary
- A function past ~50 lines doing more than one thing
- `data`/`temp`/`result` naming
- **A promise whose rejection becomes a default.** `await x().catch(() => ({}))`, `?? []`, `|| {}` on something that can fail. The call site then cannot tell a successful empty result from a failure. And the bug surfaces three layers away as missing data rather than as an error
- **A generic status envelope.** `{ success: true, data }` or `{ ok, error }` wrapped around something that already throws. It converts an error the caller must handle into a field the caller may forget. And every consumer now needs a branch that the language was doing for free
- A comment restating the code, or contradicting it
- **A silenced checker**: `@ts-ignore`, `@ts-nocheck`, `eslint-disable`, `noqa`, a lowered coverage floor, a relaxed compiler rule. The assertion still passes; the checker stopped looking, which is a different move and an easier one to miss. Tightening is silent, loosening is loud: only a change that lowers the bar is a finding
- Comments the change added that narrate, address the reader, or record history: "as requested", "changed from X", a dated note, a banner divider. Delete them; git owns history
- A `TODO` naming work this change finished
- Dead code, unreachable branches, imports the change orphaned
- Duplicated *knowledge* that must change together

**A conditional bolted onto an unrelated flow is a design finding, not a nit**: push it into its own helper, state or policy. Repeated conditionals on the same shape mean a missing model, and the "temporary" branch is usually permanent.

**Does the refactor reduce complexity or relocate it?** Count the concepts a reader must hold. If the cleaner version leaves that count unchanged, it is not cleaner. Prefer the restructuring that makes whole branches, modes or layers disappear over one that re-centralises the same logic. Prefer deleting an abstraction to polishing it. **Do not normalise drift**: "the file already does this" is how a bad pattern becomes the convention.

## Tests

- **Negative paths**: a guard clause, an error branch, a permission check asserted in code and never tested for the denied case
- **Edge coverage** mirroring the happy-path tests that exist: zero, empty, boundary, single element, unicode
- **Isolation**: shared mutable state, order dependence, reliance on the clock, timezone or locale, real network calls
- **Flake sources**: sleeps and tight timeouts, assertions on the order of unordered results, unseeded random data

**Coverage of *this* change.** A changed method whose tests only cover the old behaviour is untested, whatever the coverage number says. A test edited to make the change pass is a behaviour change, and has to be named as one.

## Decorrelating lanes by evidence source

The lane table in `SKILL.md` partitions by *topic*, and every topic reads the same diff, so agreement between them measures consistency, not truth. Where you dispatch more than one lane, give at least two of them **different evidence**, not different questions:

| Source | What only it can see |
|---|---|
| The diff alone, no other context | What the change says on its face, unbiased by intent |
| `CLAUDE.md`/`AGENTS.md`, lint and type config | Whether this repository already forbade it |
| **`git log -S` and blame on the touched lines** | **Whether this change re-opens a bug someone already fixed** |
| Prior review comments on the same files | What humans here have objected to before |

**The history lane is the cheap one worth adding.** A line introduced by a commit whose message says *fix* is a scar, and a diff that removes it is a regression being re-committed. Invisible to every lane that reads only the current tree, and high-precision when it hits.

## Refuse these

| Excuse | Reality |
|---|---|
| "Pre-existing, not caused by this change" | True, and still in the blast radius. Report it; let the author decide. |
| "I'll clean it up later" | File it now, owned and dated. An unowned intention is not a plan. |
| "It's out of scope" | Only if genuinely unrelated — never cover for an edge case that was skipped. |
| "Tests pass, so it works" | They pass on the paths that have tests. Check which those are. |
| "The author must have had a reason" | Maybe. `git log -S '<symbol>' --reverse` finds the commit that introduced it — `git blame` finds whoever last reflowed it. |

## Briefing the adversarial pass

The one step that cannot be done in the context that produced the change, and the one with no component behind it. Every agent this plugin ships is wrong for it by construction: `omc-slim:explorer` returns locations and proposes nothing, `omc-slim:librarian` researches outside the repository, `omc-slim:tracer` diagnoses a named failure, and `omc-slim:oracle` judges a decision rather than a diff and says so in its own description. So it is a general-purpose agent with the brief below. And the brief lives here rather than in the orchestrator's head because an improvised one drifts toward confirming what the lanes already found.

Give it four things and withhold a fifth.

1. **The diff, as a path to a prepared file.** Not the diff inline, not a command to derive one.
2. **What the lanes already found**, as findings with `file:line`, and nothing else. No severity, no disposition, no aside that something is probably fine. A lane handed the answer reports the answer.
3. **The question, which is what they missed**, not "review this". The lanes already reviewed it; this pass exists for the gaps between their partitions.
4. **The seams to aim at**: ten times the load, the first run with no data, the double click, two requests hitting the same row, the rollback that does not exist.

Withhold the checklist. It holds what to look for, and handing it over turns an adversarial pass into a second run of the lanes that already ran.

Ask it to quote `file:line` for every finding and to say plainly when it found nothing. A silent pass and a clean pass are indistinguishable to you otherwise, and only one of them is a result.

## Do not flag

- Harmless redundancy that aids reading
- "Add a comment explaining this threshold", when thresholds move and comments rot
- An assertion that already covers the behaviour
- Consistency-only changes
- An edge case the input constraints make unreachable
- A test exercising several guards at once
- Anything the diff already addresses
- Anything the project's own config, style guide or design system blesses
- A framework-specific fix for a framework this project does not use

Codebase consistency is a legitimate answer to a style finding. An author with full context who disagrees ends the thread: comment on code, not on people.
