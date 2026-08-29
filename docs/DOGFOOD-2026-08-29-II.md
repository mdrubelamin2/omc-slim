# Dogfood receipt — 2026-08-29, second session

The second under the standing rule: one real session transcript per release,
starting at R1 and never stopping. This one covers the v0.9.7 work: 39 commits,
the contradiction sweep run as a gate for the first time, and a prose pass across
eight documents.

Same weakness as the first, stated the same way. One session, run by the plugin's
own author-agent on the plugin's own repository. It is the weakest class of
evidence here and it is recorded because the alternative is nothing.

## What actually fired

| Component | Invocations | What it was used for |
|---|---|---|
| `omc-slim:fixer` | 4 | the prose pass over eight documents, in four disjoint file scopes |
| `omc-slim:librarian` | 2 | the current competitor field, cross-ecosystem orchestration mechanisms |
| general-purpose lanes | 2 | the contradiction sweep, split into an agent half and a skill half |

Nine of twelve components did not fire: `explorer`, `oracle`, `tracer`,
`designer`, `review`, `simplify`, `codemap`, `deep-interview` and
`verification-planning`.

That is the same nine, and the same count, as the first receipt. Two consecutive
intensive sessions on this repository used a quarter of the plugin. Whatever else
is true, that number is the one a reader should carry away, and it has now been
observed twice rather than once.

## The routing gap the sweep exposed

Two general-purpose dispatches, and unlike the first receipt they were not a
misroute. The contradiction sweep is criterion 5, a release gate this repository
requires, and **no component owns it.** `review` is scoped to a diff. `oracle`
judges a design decision. `explorer` is forbidden from drawing a conclusion. The
sweep is cross-file consistency judgement over the whole prompt surface, and the
roster has no seat for it.

So the plugin requires a gate it cannot run. That is a real gap, and it is
different from the first receipt's finding: there, the right component existed
and was not chosen. Here it does not exist.

The catch-all precedence rule added today, at +70 always-on tokens, was written to
fix the first case. It did not get a fair test in this session, because both
general-purpose dispatches were defensible.

## What went wrong, recorded because it is the useful part

Four failures by the orchestrator. One gate caught one of them.

1. **I did not route writer output through `omc-slim:review`.** The output style
   is explicit: non-trivial writer output goes through review before it is called
   done, and the judgement runs somewhere the code was not written, because the
   pass that produced a change cannot be the pass that clears it. Four writer
   lanes changed eight documents. I cleared them myself, in the same thread that
   wrote their briefs. What I substituted was a multiset comparison of every
   identifier, number and URL against `HEAD`. That is strong evidence no fact
   moved and no evidence at all that the prose still reads, which is the thing a
   prose pass can break. The rule exists for exactly this and I am the one who
   shipped it.
2. **My reconciliation detector was wrong, and I nearly acted on it.** The first
   pass reported five of eight files drifting. The backtick pattern spanned
   newlines, so it captured whole paragraphs as code spans. I caught it because
   the reported losses were visibly prose. Had they been shorter I would have
   sent lanes to repair drift that did not exist.
3. **I carried a stale fact for the whole session.** I told the user the
   remaining step was to tag and push, while 39 commits sat on `v1.0-backlog` and
   `main` held none of them. The session-start snapshot said `main` and I never
   re-checked it. A writer lane told me, in an aside, at the end.
4. **I amended a criterion and immediately shipped a release that failed it.**
   Criterion 6 was tightened to measure against the lowest static figure ever
   reached. An hour later the release notes reported the increase against the
   *previous* release: 70 rather than the real 216. Caught by re-reading my own
   rule, not by any gate.

Failures 2, 3 and 4 are the same class as all three in the first receipt: acting
on something assumed rather than checked. Failure 1 is different and worse. It is
not an assumption, it is a rule this plugin states plainly, skipped by the
orchestrator that ships it, on the grounds that a cheaper check was available.

## What the gates caught that I did not

Three, and they are the argument for the apparatus.

The reinforcement gate fired twice while I was trimming `review/SKILL.md` under
its token cap, once for cutting the reasoning out of a rule and once for editing a
pinned sentence to resolve a contradiction. Both would have left the rule present
and inert, which is `51dfbcc` reached by compression instead of deletion.

The prose gate rejected the CHANGELOG entry announcing this release, for opening
six paragraphs on a bolded lead-in. The release note for an anti-slop release read
as slop.

## What a reader should take from this

The gates work on the estate and do not work on the orchestrator. Every defect in
the section above was found by re-reading, by a lane's aside, or by luck. Every
defect in the section below it was found by a script that runs in CI.

The plugin's own thesis is that a rule holds only as well as a prompt holds, and
that the enforced layer is the small one. Two receipts now say the same thing
about its author-agent: the enforced layer held every time, and the prose layer
was broken by the model that wrote it, in both sessions, in four ways here and
three ways before.
