---
name: review
description: Reviews a diff across correctness, simplicity, security, tests, schema, API contract and performance at once, behind an evidence gate — every finding quotes file:line with severity and confidence — then FIXES what is mechanical.
when_to_use: '"review my changes", "check this diff", "is this ready to ship", "look over my PR", "did I break anything". The gate before merging. It reads a diff and fixes what is mechanical, so a change has to exist first.'
---

# Code review

Judge a change that exists. The goal is *correct, no heavier than it needs to be,
safe to ship* — not a change nobody could criticise.

**Clear it when it definitely improves the health of the codebase, even if it is
not perfect.** Never block because it is not how you would have written it.
Sycophancy is the other failure: never soften a real finding to keep the peace.

**Skip it** only when nothing changed since the last pass: re-reviewing an
unchanged tree finds nothing and costs everything.

**Size is never a reason to skip a lane.** Four lanes below run on every diff,
and "one line I already verified" fails twice over: it is a size test, and it is
the author clearing their own work. A one-line change to an auth check is the
most dangerous thing in the release. Size still decides *who* runs a lane — under
roughly 50 changed lines you run the triggered ones yourself rather than paying
for a dispatch — and it decides whether the orchestrator invokes this skill at
all. Once invoked, a triggered lane runs.

## 1. Scope

Get this wrong and every finding after it is noise.

```bash
git fetch -q origin 2>/dev/null   # stale base = phantom findings
B=$(git merge-base "$(git rev-parse -q --verify origin/HEAD >/dev/null && echo origin/HEAD || echo main)" HEAD)
git diff --numstat "$B" | awk '{n+=$1+$2} END{print "changed lines:", n+0}'
git diff --name-only "$B"; git diff "$B"
```

The **merge base**, not `HEAD` and not the base tip. It includes uncommitted work
— review runs before the commit — and excludes whatever landed on the base since.
Resolve the base as the branch's PR target, else the repository default, then
`origin/HEAD`, then `main`, then `master`; with no remote, drop the prefix. Print
which you used. On the base branch with an empty diff, say so and stop. Outside a
repository, review the named files and say so.

**Read the whole diff before flagging anything** — the commonest false positive is
a problem the same diff fixes three hunks later.

## 2. Intent, before quality

Was this what was asked for — nothing more, nothing less?

- **Scope creep** — changes tracing to no request. "While I was in there" widens
  the blast radius of the review and of the rollback.
- **Missing requirements** — asked for and quietly not delivered, or left at 80%.
  The enum handled in one place of three, the error path skipped.

Intent comes from this session's request, the plan, the issue, the commit
messages — whatever exists. **Code that handles a deliverable is not the
deliverable.**

**An intent gap is a finding, not a note.** It does not block on its own, and it
outranks every style finding below it. Section 6 gives it an action like every
other finding: it becomes an ask, because adding or cutting scope is the caller's
decision.

**Where the request covers a set — every page, all the endpoints, each consumer —
review the set, not the diff.** A missed member is absent from the diff by
definition, so the completeness lane is the only one that can reach it. Give that
lane the set, and account for every member the change did not touch.

## 3. Read the tests first

They state what the author believed the change should do, so the implementation
becomes a comparison rather than a guess. The gap between what they assert and
what the code does is itself a finding. **A test that had to change is a
behaviour change**, whatever the message says. Ask why.

## 4. Lanes

**First, predict.** Before reading closely, name the three to five places this
change is most likely to be wrong, then check each. The gap between what you
predicted and what you found shows where you were blind.

**Then find what judges this better than you can.** You have a cutoff; this
repository has law you have not read.

- **Read the project's own rules first** — `CLAUDE.md`/`AGENTS.md`,
  `.claude/rules/`, the lint, formatter and type config, a design system. They
  outrank your preferences wherever they speak, and a finding that contradicts a
  deliberate project decision is not a finding.
- **Survey the toolset, in both scopes** — the project's `.claude/` and the user's
  `~/.claude/`, which usually carries more. Other plugins ship security,
  performance and framework-specific reviewers built for this stack, and a
  documentation MCP is authoritative where you would be inferring. `ToolSearch`
  reaches deferred tools — an unsearched tool is invisible, not absent. Name what
  you found when you dispatch, and prefer a specialist built for this stack.

**Read `checklists.md` now, before judging anything.** It holds what each lane
looks for, and exists because the items worth catching are the ones that do not
come to mind unprompted. Skim past the lanes out of scope; do not skip the file. A
review that never opened it runs on recall, the failure this skill was built
against.

| Lane | Runs when |
|---|---|
| Correctness | always |
| Completeness | always — the only lane that reads outside the diff |
| Simplicity | always |
| Tests | always |
| Security | auth, session, token, permission, secret or crypto in the diff — **at any size** — or backend and non-trivial |
| Data and schema | a migration, a schema change, raw SQL |
| API contract | a route, handler, published type, or a changed response shape |
| Interface | a component, template or stylesheet |
| Operations | CI, deploy or release config |
| Performance | a query, IO inside a loop, a bundle entry, a render path |

**Every lane triggers on the diff's content, never on its length.** The table
above is the whole rule: a migration is a schema change at 30 lines and at 3,000,
and a changed response shape breaks its consumers either way. "Too small to
review" is how it ships.

Size decides only **who runs the lane, not whether it runs.** Under roughly 50
changed lines, run the triggered lanes yourself rather than paying for a
dispatch. Above it, dispatch them **in parallel, in one message**, one subagent
each — give each **a path to a prepared diff file**, not the diff and not a
command to derive one, plus its lane text and the evidence gates in section 5.
Either way, a lane the table triggers gets run and reported.

Write it once before dispatching: commit list, `--stat`, `git diff -U10`. It
never enters your context, every lane reads the same bytes, and a lane needs
**one Read instead of the 40–67 tool calls** measured when reviewers reconstruct
the range themselves.

**Ask a lane only for what its agent can return.** `omc-slim:explorer` returns
locations and proposes nothing; `omc-slim:oracle` judges a decision and does
propose; `omc-slim:tracer` returns ranked hypotheses when the cause is unexplained
or a previous fix did not hold. None of them can dispatch another agent, so an
external claim comes back to you unresolved and you are the one who sends it on.
`checklists.md` holds what each returns and how to brief it.

**Brief a lane with evidence, never with a verdict.** Findings and `file:line`
locate the work, and that is the whole of what travels. A severity, a disposition,
or an aside that something is probably fine decides the review before it runs. A
lane handed the answer reports the answer. Suspect a finding will be a false
positive? Let it be raised and adjudicate it afterwards, where the reasoning is
visible.

Report which lanes ran and **which did not, with the reason**; a lane silently
skipped reads as a lane that found nothing. **An always-on lane that found nothing
says so.** "Tests: coverage adequate for the changed paths" is a result, and its
absence is indistinguishable from never having looked.

`performance.md` is not a lane, it is the discipline for *changing* something on
performance grounds. Reporting a hot-path finding needs only the lane. For an
optimisation applied or accepted, **open `performance.md`** first. A change that
does not beat the noise is reverted rather than kept, and that is not a call to
make from recall.

**Two lanes reading the same bytes and agreeing is not corroboration.** The table
above partitions by *topic*, and every topic reads the same diff. Where you
dispatch more than one lane, give at least two of them **different evidence** —
`checklists.md` names the four sources and why the git-history one is the cheap
win.

**Then one adversarial pass, always**, whatever the size. Line count is not a
proxy for risk, and a five-line auth change can be the worst thing in the release.

Run it **in a fresh context**: a subagent that did not write this code and holds
no checklist. It is told what the lanes already found, and asked for what they
missed. A
pass that both wrote a change and blesses it is not a review, however carefully it
reads. The reasoning that produced the bug is still resident, and still finds it
reasonable. This is the one step you cannot do to yourself.

Aim it at the seams. Ten times the load, a slow dependency, the first run with no
data, the double click, two requests hitting the same row. Where a checklist
partitions the work, the gaps between the partitions are where the real bug lives.
**Ask what is absent, explicitly** — the unhandled case, the untested branch, the
rollback that does not exist. And **do not stop at the first few findings**:
surface problems mask structural ones.

## 5. Gates every finding passes

**Filter at the end, never while looking.** Surface everything during discovery —
low severity, half-formed, uncertain. Filtering instructions are followed
faithfully, so a filter applied while reading suppresses the bug before it is ever
seen. Every gate here runs at *report* time, on a full list. "Only important
issues" and "don't nitpick" say what to rank first; they are **not permission to
look less hard**.

**Quote the code, or you do not have a finding.** Quote the `file:line` that
motivates it. Field does not exist? Quote the class where it would live. Value can
be null? Quote where it is initialised. Race? Quote both sides. Trying to quote
the absent thing is what reveals it was there all along. Frameworks declare away
from where things are used: an ORM base, a migration, a decorator, a generated
client. So **quote the construct that *creates* the symbol**. The bar is "I read
the source that defines this", not "I grepped and missed it". Cannot quote it, it
is speculation — do not report it, and **do not invent a higher confidence** to
get around the gate.

**Cite the source, or you do not have a claim.** The quote gate covers this
repository. Anything from outside it is checked against a current source,
**never recalled**. That covers an API signature, a default, a deprecation, a
"recommended way", whether an advisory is reachable. A reviewer citing an
argument that moved two versions ago is the most expensive false positive there
is: specific, and it sounds researched. **You** send it to `omc-slim:librarian` or the
documentation server for this stack; a dispatched lane cannot. Carry the source
into the finding — an unsourced external claim is indistinguishable from a
recalled one.

**The remedy gets the same rigour as the finding.** Reviewers are audited on the
bug and trusted on the fix, which is backwards. Check whether the platform, the
framework or a newer dependency version already solves it. Before anything
bespoke, **look for prior art** — a named algorithm, a standard, an RFC, a widely
used implementation. "Add a retry loop with jitter" is worse than naming the
backoff the ecosystem already settled on.

**Write the fix, and let it test the finding.** Before reporting, name the change
that would resolve it — then ask what input behaves differently before and after.
If you cannot name one, or the "fix" changes nothing observable, **the finding
was a false positive — drop it from the list and carry the count.** "3 candidates
dropped: the proposed fix changed nothing observable" is one line, and it is the
difference between a filter and a disappearance. The mechanism is published — a
fix-guided verification filter, which runs the proposed fix and drops the finding
when nothing observable changes
([arXiv:2603.00539](https://arxiv.org/abs/2603.00539)). **It never drops a
Critical.** One you cannot yet cost out goes to Open questions, per the
confidence rule below.

**Clearance needs evidence too.** "Handled elsewhere" cites the handling code;
"tests cover this" names the test. *Likely handled* and *probably tested* are not
review outputs — verify, or record it unverified. "Looks fine" is not a finding
*and not a clearance*.

**Severity**, by consequence: **Critical** — a security hole, data loss or broken
behaviour, do not ship · **Required** — fix before merge · **Optional** — a real
improvement, the author's call. For security it is a product, consequence × **exploitability** × blast
radius: a dramatic hole nothing can reach ranks below a dull one on the public
path.

**Pre-existing is a flag, not a level.** It stacks on a severity rather than
replacing one, so a real hole this diff did not introduce is a
`CRITICAL · PRE-EXISTING` — full severity, and not a blocker. Labelling it beats
arguing about it: report it, rank it below everything the diff introduced, and
let the author decide.

**Confidence** 1–10, independent of severity: 8+ report; 6–7 report and say it
needs confirming; **3 to 5 goes to Open questions, not to the findings list** —
phrased as the question you could not settle and what would settle it. Below 3
you have a hunch, not a finding, and hunches are noise. A Critical **survives at
any confidence** as an open question, never a blocker, because the cost of
missing it is asymmetric — suppressing a low-confidence **Critical** entirely is
how a real one gets deleted before anyone sees it. That exemption is the
carve-out; it is not a general licence to keep hunches, which the sub-3 cut above
still refuses. **The verdict is set by the worst finding you
are confident about**, not the worst you can imagine — **counting only what this
diff introduced.** A Pre-existing Critical is reported at full severity and does
not set the verdict: "ship it; there is a Critical here that predates you."

**Check yourself once, before writing anything down.**

- Could the author **refute this in one sentence** with context you lack? Then it
  is a question, not a finding.
- Flaw, or preference? A preference is a nit or it is nothing.
- Rating it high because it is bad, or because you **found momentum and are now
  hunting**? Use the realistic worst case, not the theoretical maximum. Count
  what already mitigates it — an existing test, a flag, a deploy gate, how fast it
  would show.
- **Every downgrade names what mitigates it.** A quiet re-rating is how a real
  finding disappears. Data loss, a security breach and money **never get
  downgraded**.

**Inventing a problem to look thorough** costs more than missing one. A clean
review is only worth something because it can happen.

**Propose the move, not just the problem.** "This is complex" leaves the author
guessing. Name it. Typed dispatch for the conditional chain, collapse the
duplicate branches, split orchestration from logic. Move feature code out of the
shared module, reuse the canonical helper, delete the pass-through wrapper. Make
the type boundary explicit so the downstream branching disappears. Prefer the
remedy that **removes moving pieces** over one that spreads the same complexity
around. Correct is only the floor: where a meaningfully better approach existed,
that is a finding too — *Optional*, unless the chosen one carries real risk.

**Report at most five nits, then a count.** "…and 6 further minor points, say the
word" is a complete disposition. List every small thing and the reader skims all
of it, structural finding included.

**One structural problem beats ten nits.** If you have both, the structural
problem *is* the review. Correctness and security are **read before style**, the
algorithm before the pattern it is written in. Twenty smells catalogued over a
wrong core is the classic way to review nothing.

**Machine-written code gets more scrutiny, not less.** Fluent and plausible
exactly where it is wrong: the empty catch, the `return await`, the memo around
everything, the test that asserts the mock. And the abstraction built for a
second caller that never came.

### Do not flag

- Harmless redundancy that aids reading
- "Add a comment explaining this threshold", when thresholds move and comments rot
- An assertion that already covers the behaviour
- Consistency-only changes
- An edge case the input constraints make unreachable
- A test exercising several guards at once
- Anything the diff already addresses
- Anything the project's own config, style guide or design system blesses
- A framework-specific fix for a framework this project does not use

Codebase consistency is a legitimate answer to a style finding. An author with
full context who disagrees ends the thread — comment on code, not on people.

## 6. Act

Every finding gets an action; there is no informational graveyard.

**Fix directly** what is mechanical and a senior engineer would apply without
discussion. An import or variable *this diff* orphaned, a stale comment, a magic
number, a version mismatch.

Two things are deliberately not on that list. **Pre-existing dead code** is
reported, never deleted — `omc-slim:simplify` treats "dead" as an unproven claim
about your search rather than a property of the code. And **a performance fix is
never mechanical**: `performance.md` requires a before-and-after measurement,
which a review pass has no baseline to produce. A missing eager-load is a
finding, not an edit. **Ask** where reasonable engineers could
disagree, or where it changes user-visible behaviour, removes functionality,
touches security or concurrency, or runs past a handful of lines. **Critical
findings lean towards asking**; small mechanical ones lean towards fixing.

Severity and mechanicalness are separate questions though: **severity decides
whether the *decision* is yours**, mechanicalness whether the *edit* is. A
Critical with one unambiguous fix gets fixed: the missing enum branch, the
interpolated query. Name the judgement that remains — "added the branch; confirm
the wording". A Critical with two defensible fixes gets asked about, however
small the diff.

Batch every ask into **one** question with a recommendation across the set. No
asks, no question.

More than a line or two of simplicity work, **hand it to `omc-slim:simplify`**. It has the
pin-down check for untested code and this does not. Missing coverage goes to
`omc-slim:verification-planning`.

**Never commit, push or open a PR** from a review. Reviewing and publishing are
different decisions.

## 7. Close

Re-run the project's own checks whose inputs the review changed, not every check.
Report what they said, failures included; a skipped check is named with its
reason.

**Evidence has a shelf life** — output from before the last edit describes a tree
that no longer exists. A green build **says the code compiles, not that it does
what was asked**. "All tests pass" with no output, or a conclusion carried by
*should*, *seems to* or *probably*, is a claim, not a result.

Then stop. **This budget is per review run.** One review and **at most two
re-reviews — three while a Critical is still open**, each stating where it is
(`review attempt 2 of 3`). The extra pass is for an unresolved Critical only,
never to re-confirm a mechanical fix. Under
`omc-slim:deepwork` one run is one gate, so the marker carries the gate: `Gate 2 — review
attempt 2 of 3`. A re-review covers what was unresolved and what the remediation
broke; it **does not reopen concerns already accepted**. Spend one only when
remediation changed the picture, or the concern survived focused evidence —
never to re-confirm a mechanical fix. Budget gone with real risk still open:
name it and ask whether to accept it, cut scope, or authorise another pass.
Never quietly loop, and never keep **polishing because polishing is possible**.

## Output

```
Review: <ship | fix first | needs a decision> — N findings (X critical, Y required, Z optional; P of them pre-existing)
Dropped: N candidates whose proposed fix changed nothing observable
Lanes: <ran> · skipped: <lane (reason)>

FIXED
- file:line — problem → what you did

NEEDS A DECISION
- [CRITICAL] (8/10) file:line — problem
  Fix: the specific change
- [CRITICAL · PRE-EXISTING] (8/10) file:line — problem, not introduced here

OPEN QUESTIONS
- file:line — what you could not confirm, and the check that would settle it
```

Clean is `Review: ship — no findings.` in one line — plus the `Dropped:` line if
any candidates were filtered — then stop. A review that dropped everything it
considered is not a review that found nothing, and the difference is the reader's
to judge.

One line for the problem, one for the fix. Name the user-visible consequence, not
the smell, and quantify where you can. "Returns undefined when the session cookie
expires, so the user gets a white screen" beats "missing null check". Every
finding carries `file:line`; a claim about code without a location is a guess. A
dispatched lane returns its findings **in its final message**. A lane that signs
off with "done" has returned nothing, because nothing else reaches the caller.

## Refuse these

| Excuse | Reality |
|---|---|
| "Pre-existing, not caused by this change" | True, and still in the blast radius. Report it; let the author decide. |
| "I'll clean it up later" | File it now, owned and dated. An unowned intention is not a plan. |
| "It's out of scope" | Only if genuinely unrelated — never cover for an edge case that was skipped. |
| "Tests pass, so it works" | They pass on the paths that have tests. Check which those are. |
| "The author must have had a reason" | Maybe. `git log -S '<symbol>' --reverse` finds the commit that introduced it — `git blame` finds whoever last reflowed it. |
