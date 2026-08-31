---
name: simplify
description: 'DELETES code that should never have been written — speculative abstraction, config nobody sets, hand-rolled standard library — and simplifies the rest with behaviour preserved exactly. Nothing comes out until it is known why it went in.'
when_to_use: '"make this simpler", "why is this so complicated", "clean this up", "this is over-engineered", "too much boilerplate", "we do not need this abstraction". Not for renaming or formatting tidy-ups, which change no structure.'
---

# Code Simplification

Cut complexity, preserve behaviour exactly. The goal is not fewer lines. It is code faster to read, change and debug. One test: **would a new team member understand this faster than the original?**

**Use it when** the implementation is heavier than the problem, or review flags complexity. Use it when you meet deep nesting, long functions, unclear names, logic scattered across files, or duplication left by a merge.

**Skip it when** you do not yet understand the code, or the module is about to be rewritten. Skip it too when the code is performance-critical and the simpler form is measurably slower. **"Already clean" is not on that list unless you can show it.** It holds only when nothing in the tables below fires. A nested ternary or a three-deep nest refutes it, so it never outranks *Be brave about size*. Skip any block with an explicit do-not-touch marker (`simplify-ignore`, `@preserve`, a comment naming a reason). Honour it and say you skipped it.

## The Five Principles

**1. Preserve behavior exactly.** Inputs, outputs, side effects, error behaviour, ordering and edge cases stay identical. Unsure? Do not make the change.

- **A test is the evidence, so the test decides.** A test that has to change for your simplification to pass means **you changed behaviour**. Revert. Editing the test destroys the only evidence you had. Nothing tested it? **A green suite proves nothing.** Before touching non-trivial logic with no coverage, write the smallest check that pins current behaviour. Run it against the **original** to confirm it passes, then simplify. Without that check you are editing on faith.

**2. Follow project conventions.** Read `AGENTS.md` / `CLAUDE.md`, and study how neighbouring code solves the same problem. Match its imports, naming, function style, error handling and type depth. Simplification that breaks consistency is churn. Conventions come from the repository, never from your preferred dialect.

**3. Clarity over cleverness.** Explicit beats compact whenever compact needs a mental pause; keep a name that carries meaning even at a few extra lines. Delete comments restating the code, **keep comments that explain why**. Intent is the one thing code cannot say for itself. **Comment volume is its own smell.** A function needing a note every third line needs splitting or renaming instead. A comment surviving only because the name is bad goes *after* the rename.

**4. Balance.** Over-simplification is real: do not inline away a meaningful name, merge unrelated logic, or optimise for line count. Do not remove an abstraction that earns its place, but **"serves extensibility" is not earning it.** One **pays rent when a second** implementation exists *today*, or a test really substitutes at that seam. One implementation and no substitution is the `yagni:` case: inline it. Evidence now, not a story about later.

**5. Scope: unrequested, not small.** Default to recently modified code and avoid drive-by refactors. But the guard is on *unrequested* work: asked to simplify a module, restructure a subsystem or rethink an approach, that **is** the scope. Follow one problem across every file it occupies. Where the real problem is the design rather than its expression, say so instead of polishing: name the restructure and let the caller decide.

## Be brave about size, never about safety

The default failure is timidity: renaming a variable, straightening one conditional, then calling a four-file tangle "already right-sized". Principle 5 already licenses the size: **refactor as many files as the problem actually spans.** **Do not grade timidity as taste.** "Already fine" about a nested ternary or a three-deep nest is the excuse this section exists to remove.

- **Restructure, do not only rearrange.** Wrong seams, a god object, inheritance expressing one behaviour, state threaded through five layers: replace it. Careful patches over a wrong design is the expensive outcome, not the safe one.
- **Finish the deletion.** A wrapper that only forwards moved complexity rather than removing it. Internal: migrate callers and delete. Exported: **deleting it is an API change**, so collapse to a one-line alias, or migrate callers if this is not a public boundary. Either is fine. Say which and why.
- **An argument that defends a rule moves; it does not vanish.** In text that shapes behaviour, the passage answering "why bother" reads as padding and often is not. Cut it and the rule stops firing under pressure, while the file still reads correctly, so nothing catches it. Relocate each rebuttal to where the excuse gets made: a rationalization row, or the step it guards.

Never at the cost of the always-on floor the main thread already holds: see *Never simplified away* in the output style. Never at the cost of this skill's own two: the pin-down check on untested code, and a test weakened to go green. And never at the cost of silence: a large restructure is named and its **blast radius stated** before it starts. Spending it is the caller's decision.

## Reach and handoff

Before deciding code is dead, use the strongest search this machine has. A structural or AST-aware server answers "every caller" exactly where a regex approximates it. And a linter or type checker for this stack may already name the hand-rolled helper. These come from the project's `.claude/` and the user's `~/.claude/`, their names say nothing useful, and `ToolSearch` reaches them where tools are deferred. Where nothing is installed, the project's own tools are the answer, and you say which you used.

Two components carry work this skill should not do itself. Deciding what would pin untested code, where that is not obvious, is the `omc-slim:verification-planning` skill (writing the check is yours, principle 1). And enumerating every consumer of a symbol is the `omc-slim:explorer` agent, which returns locations and proposes nothing.

## Process

### 1. Understand first

**Is it a declared public entrypoint? If yes, it does not come out.** Not on a repo-local unused verdict, not on a clean tool run, not on green tests. Removing it is an API change, which is a product decision and not yours: report it and stop.

Ask it first, before any other question, because it is one command and it catches the failure mode that costs most. Read `exports` in `package.json`, `__all__`, the docs tree, whatever this project uses to say what it promises outsiders.

Every dead-code tool means *unused inside this repository*, and for a library that is the inverse of the truth. Reproduced on two widely used packages: `vulture` flagged `requests`' documented `HTTPDigestAuth` as an unused class, and **its highest confidence tier was 100% false positives**. All four 90%-confidence findings were re-export shims in a file whose own comment says to keep them for backwards compatibility. `knip` made the mirror error on another package, flagging types the manifest declares as entrypoints.

**And the test suite will not save you.** That repository's own tests never reference the symbols in question, so deleting them keeps CI **green** and breaks every downstream consumer silently.

**Bias to false negatives, deliberately.** Meta deleted over 100M lines with a static graph plus runtime hit counts. And it kept a plain textual fallback specifically to catch `eval` and string-keyed references. Their rule: *"This approach can cause false negatives, but avoids false positives. When automating the removal of dead code, those are a more serious problem."* The cheap version of that: **even with a clean tool verdict, grep the bare symbol name**. That is what finds string dispatch, reflection, config keys and templates.

**Chesterton's Fence**: a fence comes down only once you know why it went up. Before changing anything, answer four questions. What is this responsible for, and what calls it? What are its edge and error paths, and do tests define its behaviour? Might it exist for performance, a platform constraint or a past incident? Check the history: for one command the commit message is often the whole answer. Cannot answer? Read more. Accumulated complexity often has no reason and is just residue from pressure, but you learn that by checking.

**Blame the *introducing* commit, not the last toucher.** `git blame` answers "who touched this most recently", which for an old fence is almost never the person who built it. `git log -S '<symbol>' --reverse` answers the question you actually asked, and it is fast. It returned a 2012 origin on a 6,500-commit repository in 0.03 seconds.

**Two traps make that archaeology confidently wrong, and both are silent.**

- **A shallow clone.** On `--depth 1`, `git rev-list --count HEAD` is 1 and the pickaxe returns exactly one commit, which reads like a definitive origin. Check the depth before trusting the result.
- **A rename or a move.** Scoped to the current path, the first result is whichever commit relocated the file, *"Move to src directory"*. And that reads as "no real reason, safe to delete". Drop the pathspec, or follow the old path, before concluding anything.

**Refuse the citation** if the repository is shallow or the commit you found is a move, a reformat or a bulk rename. An origin you cannot establish is an unknown fence, and an unknown fence stays up.

**A comment is a fence too.** Delete one that restates the code freely. One you do not *understand* gets `git log -S` on its own text first, because the cryptic line about ordering is usually the scar from an outage. And you want the commit that wrote it, not the one that last reflowed it.

### 2. Find the opportunities

**Should this exist?** before **is this well expressed?** No point tidying a function the standard library already ships.

#### First: the ladder, applied after the fact

Whoever wrote this was meant to climb it beforehand; you are the backstop. Stop at the first rung that holds.

1. **Need to exist at all?** Speculative need, an export unused *and not declared public*, a config key nobody sets, a flag with one value, scaffolding nothing extends. Delete it, and re-add when something needs it.
2. **Already in this codebase?** Re-implementing what lives a few files over is the commonest waste there is.
3. **Does the standard library do it?** A hand-rolled deep clone, debounce, date parse, UUID or group-by is the highest-value deletion available. A clarity-focused pass walks past it, because hand-rolled code is often perfectly *readable*.
4. **Native platform feature?** CSS over JS, a DB constraint over app code, a built-in control over a widget library.
5. **An already-installed dependency?** Use it. Never add one for what a few lines do.

Tag each finding. `delete:` dead code or speculative feature, replacement nothing · `stdlib:` name the function · `native:` name the platform feature. `yagni:` one implementation, config nobody sets, layer with one caller · `shrink:` same logic, fewer lines, show the shorter form.

**The line not to cross.** These rungs remove *implementation*, never *behaviour*. Removing a feature someone uses **is a product decision and not yours**: name it and let the caller decide.

**Swapping in a standard implementation is where "simplification" silently changes behaviour.** Check the edges match: sort stability, `null` and empty input, precision. Check whether the standard version accepts what the hand-rolled one rejected, or throws where it returned a default.

**Deleting a config key selects the default, never `off`.** Rung 1 invites you to drop a key nobody sets, and the consumer then falls back. That is often the opposite of what the key was holding. Read what the consumer does when the key is absent before removing it. An absent key, an empty list and an empty object are frequently three different answers, and only one of them is the one you meant.

#### Then: expression

| Structure | Fix |
|---|---|
| Nesting 3+ deep | Guard clauses, early returns, extracted helpers |
| Functions over ~50 lines | Split by responsibility, name each part |
| Nested ternaries | if/else, switch, or a lookup table |
| Boolean flags — `doThing(true, false)` | Options object, or separate functions |
| Same conditional repeated | Extract a named predicate |

| Naming and comments | Fix |
|---|---|
| `data`, `result`, `temp`, `val` | Name the content: `validationErrors` |
| `usr`, `cfg`, `btn`, `evt` | Full words, unless universal (`id`, `url`, `api`) |
| A `get*` that also mutates | Rename to what it does |
| Comment restating the code | Delete |
| Comment explaining *why* — intent, a constraint, a past incident | Keep |
| **Comment that contradicts the code** | Read both. Fix whichever is wrong; never leave the pair |
| Narration — "first we validate", "now return the result" | Delete. The tell of generated code |
| Docstring repeating the signature and nothing else | Delete. Keep one that names units, ranges or failure modes |
| Comment addressed to a person — "as requested", "I went with X because" | Delete. A conversation, not a comment |
| Recording a change — "changed from X", a dated note, banner dividers, attribution | Delete — git owns history |
| `TODO`/`FIXME` naming work already done | Delete. Keep live ones that name an owner |

| Redundancy | Fix |
|---|---|
| Same 5+ lines that must change together, in 3+ places | Extract a shared function |
| Dead code, unreachable branches, commented-out blocks | Orphaned by your own change: remove. Pre-existing: "dead" is a claim about your search, so say what you searched and what it cannot reach — dynamic dispatch, string-keyed lookup, callers outside the repo |
| A wrapper that adds nothing | Inline it |
| Factory for one product, strategy with one strategy | Call it directly |
| Redundant cast to an inferred type | Remove |

### 3. Apply incrementally

**Batch size is a ladder; take the lowest rung that fits the work.** One change at a time is the default: make the change, then check preservation with evidence proportionate to the risk. That is the pinned check for logic you touched, plus whatever the repository's release instructions require. Keep the change only while that evidence holds. Batch beyond one only what you can attribute: **if verification fails after several simplifications, bisect them rather than guessing.** Above roughly 500 lines, **stop hand-editing**: use a codemod or AST transform, verified on a sample before you trust the whole run. That top rung replaces the two below it, because a mechanical rewrite is attributed by its rule rather than by its edits.

- Keep refactoring commits **separate from feature and bug-fix commits**. Mixed history is harder to review and revert.
- **Mark any ceiling you deliberately leave**: a global lock, an O(n²) scan over a list you know stays small, a naive heuristic. Name the limit and the upgrade path in a comment. Unmarked ceilings get rediscovered the hard way.

### 4. Verify

- [ ] Existing tests pass **without being modified**
- [ ] Build clean, no new warnings; linter and formatter pass
- [ ] No behavior, error handling or side effects changed
- [ ] Project conventions still match
- [ ] Diff is clean: nothing unrelated mixed in
- [ ] No dead code left: unused imports, orphaned helpers
- [ ] Checks required by the repository's release instructions have run
- [ ] The result is genuinely easier to understand

Harder to follow or harder to review? Revert. Not every attempt succeeds, and saying so is a result.

**That first checkbox is necessary and it is not sufficient.** Measured: **19–35% of LLM-generated refactorings are functionally non-equivalent, and roughly 21% of those are not caught by the existing test suite.** A green run means the change survived the paths that have tests, which is a smaller claim than the checkbox looks like. And for anything you deleted, the tests that would have caught you are the ones nobody wrote.

So for a deletion, add one question the checklist cannot ask for you: **what would have failed if this had mattered?** If the answer is "nothing in this suite", you have not verified the deletion, you have only observed that nothing objected. Say that, or go find a check that could have objected.

## Reference

`principles.md` holds the named principles, the red flags that mean stop, and the rationalizations this skill refuses. **Open it when you are about to justify a change to yourself.** That is the moment the rationalization list exists for, and the moment it is never consulted.
