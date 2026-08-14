---
name: simplify
description: Simplifies code for clarity without changing behavior, and deletes what should never have been written — speculative abstraction, config nobody sets, hand-rolled equivalents of standard library or platform features. Use for readability, maintainability, complexity reduction, and anything described as over-engineered or bloated, once behavior is understood.
---

# Code Simplification

Cut complexity, preserve behaviour exactly. The goal is not fewer lines — it is
code that is faster to read, change and debug. One test: **would a new team
member understand this faster than the original?**

**Use it when** the implementation is heavier than the problem, review flags
complexity, or you meet deep nesting, long functions, unclear names, logic
scattered across files, or duplication left by a merge.

**Skip it when** the code is already clean, you do not yet understand it, it is
performance-critical and the simpler form is measurably slower, or the module is
about to be rewritten anyway. Skip any block carrying an explicit do-not-touch
marker (`simplify-ignore`, `@preserve`, a comment naming a reason) — honour it
and say you skipped it.

## The Five Principles

**1. Preserve behavior exactly.** Change how code expresses itself, never what it
does: inputs, outputs, side effects, error behaviour, ordering and edge cases stay
identical. Unsure it preserves behaviour? Do not make it.

- If a test has to change for your simplification to pass, **you changed
  behaviour** — revert. Editing the test destroys the only evidence you had.
- If nothing tested it, **a green suite proves nothing**. Before touching
  non-trivial logic with no coverage, write the smallest check that pins current
  behaviour, run it against the **original** to confirm it passes, then simplify.
  Without that check you are editing on faith.

**2. Follow project conventions.** Read `AGENTS.md` / `CLAUDE.md`, study how
neighbouring code solves the same problem, match its imports, naming, function
style, error handling and type depth. Simplification that breaks consistency is
churn. Conventions come from the repository, never from your preferred dialect.

**3. Clarity over cleverness.** Explicit beats compact whenever compact needs a
mental pause. Keep names that carry meaning even at a few extra lines. Delete
comments restating the code; **keep comments that explain why** — intent is the
one thing code cannot say for itself. **Comment volume is its own smell**: a
function needing a note every third line usually needs splitting or renaming
instead, and a comment that only survives because the name is bad should be
deleted *after* the rename, not before.

**4. Balance.** Over-simplification is real: do not inline away a meaningful
name, merge unrelated logic, or optimise for line count. And do not remove an
abstraction that earns its place — but **"serves extensibility" is not earning
it.** An abstraction pays rent when a second implementation exists *today*, or a
test really substitutes at that seam. One implementation and no substitution is
the `yagni:` case: inline it. Evidence now, not a story about later.

**5. Scope.** Default to recently modified code; avoid unrelated drive-by
refactors. The default bounds *unrequested* work, not large work — asked to
simplify a module, restructure a subsystem or rethink an approach, that **is**
the scope. And where the real problem is the design rather than its expression,
say so instead of polishing: name the restructure and let the caller decide.

## Principles by name

Cited in reviews, bounded so they do not fight each other.

- **KISS** — the simplest thing that fully solves the real problem, not the
  smallest thing that appears to.
- **YAGNI** — build for today. Speculative flexibility is complexity with no
  payer: read, tested and maintained forever for a case that never arrived.
- **DRY — of knowledge, not of characters.** Code that must change together for
  the same reason is duplicated knowledge; unify it. Code that merely looks alike
  is coincidence; leave it. **Where DRY and YAGNI appear to collide, the
  tiebreaker is the rule of three** — a wrong abstraction costs more than the
  duplication it replaced, because every later case bends to fit.
- **Single responsibility** — one reason to change. Can you name what it does
  without "and"?
- **Linear flow** — code should read top to bottom. Guard clauses over nesting, a
  straight sequence over callback pyramids and flag-driven branching. Every
  indent level is a branch the reader must hold.
- **Modularity** — narrow interfaces, dependencies pointing one way, a module you
  can understand without opening its neighbours. Watch for import cycles and the
  `utils` junk drawer.

## Be brave about size, never about safety

The default failure here is timidity: renaming a variable, straightening one
conditional, then calling a four-file tangle "already right-sized".

- **Refactor as many files as the problem actually spans.** This is Principle 5
  read correctly — the guard is on *unrequested* work, never *large* work.
  Following one problem across the files it occupies is the task; wandering into
  unrelated code is not.
- **Restructure, do not only rearrange.** Wrong seams, a god object, inheritance
  expressing one behaviour, state threaded through five layers — replace it.
  Careful patches over a wrong design is the expensive outcome, not the safe one.
- **Finish the deletion.** A wrapper that only forwards has moved complexity, not
  removed it. Internal: migrate callers and delete. Exported: **deleting it is an
  API change**, so collapse to a one-line alias, or migrate callers if this is not
  a public boundary. Either is fine — say which and why.
- **Do not grade timidity as taste.** "Already fine" about a nested ternary or a
  three-deep nest is the excuse this section exists to remove.

Never at the cost of: the pin-down check on untested code; a test weakened to go
green; validation at a trust boundary, an error path, a security control or an
accessibility affordance; or silence — a large restructure is named and its
**blast radius stated** before it starts, because spending it is the caller's
decision.

## Process

### 1. Understand first

**Chesterton's Fence** — a fence comes down only once you know why it went up.
Before changing anything: what is this responsible for, what calls it, what are
its edge and error paths, do tests define its behaviour, and might it exist for
performance, a platform constraint or a past incident? Check `git blame` — the
commit message is often the whole answer for one command.

Cannot answer? Read more. Accumulated complexity often has no reason and is just
residue from pressure — but you learn that by checking, not assuming.

**A comment is a fence too.** Delete one that restates the code freely; a comment
you do not *understand* gets `git blame` first, because the cryptic one-liner
about ordering is usually the scar from an outage.

### 2. Find the opportunities

**Should this exist?** before **is this well expressed?** — no point tidying a
function the standard library already ships.

#### First: the ladder, applied after the fact

Whoever wrote this was meant to climb it beforehand; you are the backstop. Stop
at the first rung that holds.

1. **Need to exist at all?** Speculative need, an unused export, a config key
   nobody sets, a flag with one value, scaffolding nothing extends — delete, and
   re-add when something needs it.
2. **Already in this codebase?** Re-implementing what lives a few files over is
   the commonest waste there is.
3. **Does the standard library do it?** A hand-rolled deep clone, debounce, date
   parse, UUID or group-by is the highest-value deletion available — and the one a
   clarity-focused pass walks past, because hand-rolled code is often perfectly
   *readable*.
4. **Native platform feature?** CSS over JS, a DB constraint over app code, a
   built-in control over a widget library.
5. **An already-installed dependency?** Use it. Never add one for what a few
   lines do.

Tag each finding: `delete:` dead code or speculative feature, replacement
nothing · `stdlib:` name the function · `native:` name the platform feature ·
`yagni:` one implementation, config nobody sets, layer with one caller ·
`shrink:` same logic, fewer lines, show the shorter form.

**The line not to cross.** These rungs remove *implementation*, never
*behaviour*. Removing a feature someone uses **is a product decision and not
yours** — name it and let the caller decide.

**Swapping in a standard implementation is where "simplification" silently
changes behaviour.** Check the edges match: sort stability, `null` and empty
input, precision, whether the standard version accepts what the hand-rolled one
rejected or throws where it returned a default.

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
| Banner dividers, attribution, dated changelog notes | Delete — git owns history |
| `TODO`/`FIXME` naming work already done | Delete. Keep live ones that name an owner |

| Redundancy | Fix |
|---|---|
| Same 5+ lines in several places | Extract a shared function |
| Dead code, unreachable branches, commented-out blocks | Remove once confirmed dead |
| A wrapper that adds nothing | Inline it |
| Factory for one product, strategy with one strategy | Call it directly |
| Redundant cast to an inferred type | Remove |

### 3. Apply incrementally

One at a time: make the change, then check preservation with evidence
proportionate to the risk — the pinned check for logic you touched, plus whatever
the repository's release instructions require for the diff. Keep it only when
that evidence holds.

- Batch only what you can attribute. **If verification fails after several
  simplifications, bisect them rather than guessing.**
- Keep refactoring commits **separate from feature and bug-fix commits**. Mixed
  history is harder to review and revert.
- **Mark any ceiling you deliberately leave** — a global lock, an O(n²) scan over
  a list you know stays small, a naive heuristic — naming the limit and the
  upgrade path in a comment. Unmarked ceilings get rediscovered the hard way.
- Above roughly 500 lines, **stop hand-editing**: use a codemod or AST transform,
  and verify it on a sample before trusting the whole run.

### 4. Verify

- [ ] Existing tests pass **without being modified**
- [ ] Build clean, no new warnings; linter and formatter pass
- [ ] No behavior, error handling or side effects changed
- [ ] Project conventions still match
- [ ] Diff is clean — nothing unrelated mixed in
- [ ] No dead code left: unused imports, orphaned helpers
- [ ] Checks required by the repository's release instructions have run
- [ ] The result is genuinely easier to understand

Harder to follow or harder to review? Revert. Not every attempt succeeds, and
saying so is a result.

## Red flags

A test had to change · the result is longer or harder to follow · renaming toward
your taste rather than the project's · error handling removed to "clean it up" ·
simplifying code you do not fully understand · one batch nobody can review or
bisect · refactoring code *unrelated* to the task · a nested ternary or
three-deep nest left as "already fine" · a full forwarding function kept where an
alias or caller migration would do · stopping at one file when the *same* problem
continues into others.

## Rationalizations to refuse

| Excuse | Reality |
|---|---|
| "Fewer lines is always simpler" | A one-line nested ternary is not simpler than a five-line if/else. Comprehension speed, not line count. |
| "I'll simplify this unrelated code while I'm here" | Noisy diffs, and regressions in code you never meant to touch. |
| "This abstraction might be useful later" | Complexity with no payer. Remove it; re-add when something needs it. |
| "I'll refactor while adding the feature" | Two changes. Split them. |
| "The original author must have had a reason" | Maybe — check `git blame`. Often it is just residue. Check, then decide. |
