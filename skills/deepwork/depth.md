# deepwork — depth, divergence, risk and domain rules

Opened from [`SKILL.md`](./SKILL.md), not read by default. Everything here is conditional: it applies to a decision you are actually facing, and reading it when you are not is cost with no return.

## Calculated risk, and its ceiling

**A risk is worth taking when the downside is bounded, detectable and reversible.** All three, not two — an unbounded or invisible downside is not a calculated risk, it is a guess wearing the word.

**Taking it requires naming the instrument that will detect the damage, before you start.** Not "we will notice": the test, the query, the log line, the diff that goes red. Undetected damage is found by the user, weeks later.

**No such instrument exists? Building it is part of the work, not a follow-up.** The follow-up lands after the damage has already shipped, which is the one moment the instrument was for. This binds on the irreversible rung above, never on work a commit undoes — there, the revert is the instrument.

**Match the instrument to the damage you actually fear — presence is not function.** `51dfbcc` records the failure: a compression pass kept every pinned phrase, the checker stayed green, and three behaviours stopped firing. Its own words: "a green coverage run proves no rule was deleted. It does not prove the remaining rules still fire."

## Domain variations

Only the artefact in step 3 changes.

- **Software** — read the whole relevant section before writing; plan the diff, then execute. Check: tests run, error paths exercised, not just the happy path.
- **Research** — gather sources before synthesising; do not write as you search. Distinguish confirmed fact from inference. Check: every load-bearing claim traces to a source actually read.
- **Data** — understand the shape first; state the hypothesis before computing, not after seeing the numbers. Check: quality assertions run against real data.
- **Multi-session** — define done criteria upfront, written and testable.

## Diverge before you converge

**Generate competing approaches before you write the map.** The first plausible approach becomes the plan by default, and nothing downstream ever reconsiders it.

**Competing means different in kind, not in detail.** Three variants of one design are one option. Change what carries the load: a different layer, a different owner, buying instead of building, doing less, or doing nothing.

**When every option looks the same, attack the premise instead.** The first idea constrains the next three, so move the constraint rather than the design. Run these against the brief, in order, and keep whatever survives:
- **Invert it.** What if the opposite were true — the data flowed the other way, the caller owned this, the check ran at write time instead of read time?
- **Delete the requirement.** Which constraint, removed, makes the problem trivial? Then ask who actually imposed it. Often nobody currently alive.
- **Move it in time.** Build-time instead of runtime, migration instead of compatibility shim, one-off script instead of a permanent feature.
- **Let something else own it.** The platform, the database, the type system, the framework, an installed dependency. Code you do not write cannot rot.
- **Solve the general case, or refuse to.** Either this is one instance of a named problem with a known answer, or it is genuinely specific and the general solution is the over-build.

**The honest output of this is sometimes "the first idea was right".** Say that, and say what you tried against it. An alternative you generated and killed is evidence; an alternative you never had is a blind spot you cannot see.

**Kill each rejected option in writing, with its reason.** "Rejected: needs a schema change we cannot reverse" is an artefact — it stops the next session walking the same dead end.

**Generate freely; report at most three, one paragraph each.** The cap is on what you write down, never on what you consider — a generation cap is how the second idea never gets had. Say how many you discarded.

**Skip divergence only where the repository already answers the question.** A precedent you can point at is a decision already made; re-deriving it is the ceremony this section warns about. No precedent means at least one alternative,
however cheap the work is to undo.
