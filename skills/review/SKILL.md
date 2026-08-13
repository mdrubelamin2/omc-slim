---
name: review
description: Reviews a set of code changes across every axis at once — correctness, simplicity, security, tests, data and schema, API contract, interface and performance — behind an evidence gate that keeps false positives out, then fixes what is mechanical and asks about what is not. Use for "review my changes", "check this diff", "is this ready to ship", auditing a branch or PR, and as the gate after any non-trivial implementation lands.
---

# Code review

Judge a change that already exists. The goal is a change that is *correct, no
heavier than it needs to be, and safe to ship* — not a change nobody could
criticise.

**Clear it when it definitely improves the health of the codebase, even if it is
not perfect.** Do not block because it is not how you would have written it.
Sycophancy is the other failure: do not soften a real finding to keep the peace.

**Use it when** an implementation lands, before shipping or merging, when asked
to check a diff or branch, or as the gate after a phase of larger work.

**Skip it when** the change is a one-line edit you already verified, or nothing
has changed since the last review. Re-reviewing an unchanged tree finds nothing
and costs everything.

## 1. Scope the change

Get this wrong and every finding after it is noise.

```bash
git fetch origin <base> --quiet                 # stale base = phantom findings
BASE=$(git merge-base origin/<base> HEAD)
git diff --stat "$BASE"; git diff "$BASE"
```

Diffing against the **merge base** — not `HEAD`, not the base tip — includes
uncommitted work, which is usually the point since review runs *before* the
commit, and excludes commits that landed on the base after this branch started.

Resolve `<base>` in order: the branch's actual PR target, then the repository's
default branch, then `origin/HEAD`, then `main`, then `master`. No remote? Drop
the `origin/` prefix and use the local branch. Print which base you used. On the
base branch with an empty diff, say so and stop. Outside a repository, review the
named files or the working tree and say which.

**Read the whole diff before flagging anything.** The commonest false positive is
reporting a problem the same diff already fixes three hunks later.

## 2. Intent before quality

Before judging *how* it was built, judge *whether it is what was asked for* —
nothing more, nothing less.

- **Scope creep** — changes that trace to no request. "While I was in there"
  expands the blast radius of a review and of a rollback.
- **Missing requirements** — something asked for and quietly not delivered, or
  started and left at 80%. Look for the partial implementation, the enum handled
  in one place of three, the error path that was skipped.

Take intent from whatever exists: the request in this session, the plan, the
issue, the commit messages. **Code that handles a deliverable is not the
deliverable** — shipping the extractor is not shipping the file. This step is
informational; it does not block, but a gap here outranks every style finding
below it.

## 3. Read the tests first

Tests state what the author believed the change should do. Read them first and
the implementation becomes a comparison rather than a guess — and the gap between
what the tests assert and what the change actually does is itself a finding.

**A test that had to change is a behaviour change**, whatever the description
says. Ask why. A change with no test where the logic is non-trivial is a finding
in the tests lane, not a footnote.

## 4. Run the lanes

**First, predict.** Before reading closely, name the three to five places this
change is most likely to be wrong, and write them down. Then go and check each
one. Prediction turns passive reading into deliberate search, and at the end the
gap between what you predicted and what you found tells you where you were blind.

**Read `checklists.md` now, before judging anything.** It holds what each lane
actually looks for, and it exists because the items worth catching are the ones
that do not come to mind unprompted. Skim past the lanes that are out of scope;
do not skip the file. A review that never opened it is a review running on
recall, which is the failure mode this skill was built against.

| Lane | Runs when |
|---|---|
| Correctness | always |
| Simplicity | always |
| Tests | always |
| Security | auth, permissions or secrets touched — **at any size** — or backend and non-trivial |
| Data and schema | a migration or schema change is in the diff |
| API contract | a public interface, route or response shape changed |
| Interface | the change is user-facing |
| Operations | CI, release or deploy config changed |
| Performance | a hot path, query, loop, bundle or render path changed |

Under roughly 50 changed lines, run the always-on lanes yourself and skip the
rest. Above that, **dispatch the triggered lanes in parallel, in one message**,
one subagent per lane, each with its lane text and the evidence gate below. Use
the cheapest agent that can do the lane: `explorer` for anything that is pure
location — every consumer of an enum, every caller of a changed function,
confirming code is genuinely dead — and `oracle` for the architecture and
security judgement on a high-risk change. Give each lane the diff command above
rather than the diff itself.

`performance.md` is the exception to that file: it is not a lane, it is the
discipline for *changing* something on performance grounds. Reporting a hot-path
finding needs only the lane. **Proposing, applying or accepting an optimisation
is a precondition — read `performance.md` first**, because a change that does not
beat the run-to-run noise is reverted rather than kept, and that is not a call to
make from recall.

Report which lanes ran and **which did not, with the reason**. A lane silently
skipped reads as a lane that found nothing.

**Then one adversarial pass, always, whatever the size.** Line count is not a
proxy for risk; a five-line auth change can be the worst thing in the release.

Run it **in a fresh context** — a subagent that did not write this code, holding
no checklist, told what the lanes already found and asked for what they missed.
A pass that both wrote the change and blesses it is not a review, however
carefully it reads; the reasoning that produced the bug is still resident and
still finds it reasonable. This is the one step you cannot do to yourself.

Aim it at the seams: what breaks under ten times the load, under a slow
dependency, on the first run with no data, on the double click, when two requests
hit the same row. Where a checklist partitions the work, the gaps between the
partitions are where the real bug lives.

**Ask what is absent, explicitly.** Missing things are not noticed, they are
searched for — the unhandled case, the untested branch, the rollback that does
not exist, the config nobody set. And **do not stop at the first few findings**:
surface problems mask structural ones, and the review that quits early reports
the easy layer.

## 5. Every finding earns its place

**Filter at the end, never while looking.** During discovery, surface everything
— low severity, half-formed, uncertain. Filtering instructions are followed
faithfully, which means a filter applied while reading suppresses the bug before
it is ever seen. All the gates below run at *report* time, on a full list. And if
the request said "only important issues" or "don't nitpick", that is guidance on
what to rank first, not permission to look less hard.

**Quote the code, or you do not have a finding.** Before reporting anything,
quote the specific `file:line` that motivates it. Claiming a field does not
exist? Quote the class where it would live. Claiming a value can be null? Quote
where it is initialised. Claiming a race? Quote both sides. The act of trying to
quote the absent thing is what reveals it was there all along.

Frameworks declare things away from where they are used — an ORM base class, a
migration, a decorator, a generated client. For those, quote the construct that
*creates* the symbol. The bar is "I read the source that defines this", not "I
grepped and did not find it".

Cannot quote it? It is speculation. **Do not report it, and do not invent a
higher confidence to get around this gate.**

**The same burden applies to saying something is fine.** "This is handled
elsewhere" needs the handling code cited. "Tests cover this" needs the test named.
"Likely handled" and "probably tested" are not review outputs — verify, or record
it as unverified. `"Looks fine"` is not a finding *and not a clearance*.

**Severity** — by consequence, not by feeling:

- **Critical** — security hole, data loss, or broken behaviour. Do not ship.
- **Required** — fix before this merges.
- **Optional** — a real improvement; the author's call.

Security severity is a product, not a label: **consequence × exploitability ×
blast radius**. A dramatic hole nothing can reach ranks below a dull one on the
public path.

**Confidence**, 1–10, is the second axis and is independent of severity. 8+
report normally; 6–7 report and say it needs confirming; 5 or below do not report
at all — with one override: a *Critical* finding survives at low confidence, as
an open question rather than a blocker, because the cost of missing it is
asymmetric. **The verdict is set by the worst finding you are confident about**,
not by the worst thing you can imagine.

**Then check yourself, once, before writing anything down.**

- Could the author refute this in one sentence with context you do not have? Then
  it is a question, not a finding.
- Is this a flaw or a preference? A preference is a nit or it is nothing.
- Are you rating this high because it is bad, or because you found momentum and
  are now hunting? Use the realistic worst case, not the theoretical maximum, and
  count what already mitigates it — an existing test, a feature flag, a
  deployment gate, how fast it would be noticed.
- **Every downgrade names what mitigates it.** "Reduced to Required, mitigated by
  the retry upstream" is auditable; a quiet re-rating is how a real finding
  disappears. And **data loss, a security breach and money never get downgraded**
  — those earn their severity.

Inventing a problem to look thorough costs more than missing one. If the code is
correct, it is correct; the value of a clean review is that it means something.

**Propose the move, not just the problem.** "This is complex" leaves the author
guessing. Name the restructure: replace the conditional chain with a typed
dispatch, collapse the duplicate branches, separate orchestration from logic,
move the feature-specific code out of the shared module, reuse the canonical
helper, make the type boundary explicit so the downstream branching disappears,
delete the pass-through wrapper. Prefer the remedy that removes moving pieces
over one that spreads the same complexity around.

Correct is the floor, not the bar. Where a meaningfully better approach was
available — simpler, or the thing the platform already does — that is a finding
too, sized as *Optional* unless the chosen approach carries real risk.

**One structural problem beats ten nits.** If you have both, the structural
problem *is* the review. A long list of small findings buries the one that
mattered, and a review nobody can act on is a review that did not happen.
Correctness and security are read before style, and the algorithm before the
pattern it is written in — cataloguing twenty smells while the core logic is
wrong is the classic way to review nothing.

**Machine-written code gets more scrutiny, not less.** It is fluent and plausible
in exactly the places it is wrong: the empty catch, the `return await`, the
abstraction built for a second caller that never came, the memo wrapped around
everything, the test that asserts the mock.

### Do not flag

Redundancy that is harmless and aids reading · "add a comment explaining this
threshold", when thresholds move and comments rot · an assertion that already
covers the behaviour but could be tighter · consistency-only changes · an edge
case the input constraints make unreachable · a test exercising several guards at
once · anything the diff already addresses · anything the project's own
configuration, style guide or design system explicitly blesses · a
framework-specific fix for a framework this project does not use.

Codebase consistency is a legitimate answer to a style finding. If the author has
the full context and disagrees, that ends the thread — comment on code, not on
people.

## 6. Act on the findings

Every finding gets an action. There is no informational graveyard.

**Fix directly** what is mechanical and a senior engineer would apply without
discussion: dead code, an orphaned import, a stale comment, a magic number, a
missing eager-load, a version or path mismatch.

**Ask** where reasonable engineers could disagree, and about anything that
changes user-visible behaviour, removes functionality, touches security or
concurrency, or runs to more than a handful of lines. **Critical findings lean
towards asking; small mechanical ones lean towards fixing** — the severe items
are exactly the ones not to touch silently.

Severity and mechanicalness are separate questions, so answer both: severity
decides whether the *decision* is yours, mechanicalness whether the *edit* is. A
Critical with one unambiguous fix — the missing enum branch, the interpolated
query — gets fixed, with the judgement that remains named out loud ("added the
branch; confirm the wording"). A Critical with two defensible fixes gets asked
about, however small the diff would be.

Batch every ask into **one** question with a recommendation across the set, not a
question per finding. No asks, no question.

Where the simplicity lane found more than a line or two, hand it to `simplify`
rather than doing it inline — that skill has the pin-down check for untested
code, and this one does not. Where the gap is missing coverage, hand it to
`verification-planning`. Where an optimisation is about to be applied or
accepted, **open `performance.md` and let it decide** — reporting the finding was
the lane's job, but keeping a change on performance grounds is that file's.

**Never commit, push or open a PR from a review.** Reviewing and publishing are
different decisions.

## 7. Close the loop

Re-run the project's own checks against the *fixed* tree — the ones the review
changed the inputs to, not every check. Report what they said, including
failures. Skipped a check? Say which and why.

**Evidence has a shelf life.** Output from before the last edit is not evidence
of the current tree; run it again. A build that succeeds says the code compiles,
not that it does what was asked. And "all tests pass" without the output, or a
conclusion carried by *should*, *seems to* or *probably*, is a claim, not a
result — treat it the same way you treat an unquoted finding.

Then stop. **One review, and at most two re-reviews**, each stating where it is
(`review attempt 2 of 3`). A re-review looks at what was unresolved and at what
the remediation newly broke; it does not reopen concerns already accepted or
settled. Spend one only when the remediation materially changed the picture or
the original concern survived focused evidence — never to re-confirm a mechanical
fix. Budget gone with a real risk still open: name it and ask whether to accept
it, cut scope, or authorise another pass. Do not quietly loop, and do not keep
polishing because polishing is possible.

## Output

```
Review: <ship | fix first | needs a decision> — N findings (X critical, Y required, Z optional)
Lanes: <ran> · skipped: <lane (reason)>

FIXED
- file:line — problem → what you did

NEEDS A DECISION
- [CRITICAL] (8/10) file:line — problem
  Fix: the specific change

OPEN QUESTIONS
- file:line — what you could not confirm, and the check that would settle it
```

Clean is `Review: ship — no findings.` — say it in one line and stop.

A dispatched lane returns its findings **in its final message**; a lane that
signs off with "done" or "looks good" has returned nothing, because nothing else
reaches the caller.

Terse: one line for the problem, one for the fix. Name the user-visible
consequence, not the smell — "returns undefined when the session cookie expires,
so the user gets a white screen" beats "missing null check". Quantify where you
can: "adds roughly one query per row" beats "may be slow". Every finding carries
`file:line`; a claim about code without a location is a guess.

## Refuse these

| Excuse | Reality |
|---|---|
| "Pre-existing, not caused by this change" | True, and still in the blast radius. Report it; let the author decide. |
| "I'll clean it up later" | Then file it now, assigned, with a date. An unowned intention is not a plan. |
| "It's out of scope" | Only if genuinely unrelated. Never as cover for an edge case that was skipped. |
| "It looks fine" | Not a finding and not a clearance. Cite the evidence it is fine, or mark it unverified. |
| "Tests pass, so it works" | The tests pass on the paths that have tests. Check which paths those are. |
| "The author must have had a reason" | Maybe. `git blame` is one command. Check, then decide. |
