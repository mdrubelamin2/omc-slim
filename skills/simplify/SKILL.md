---
name: simplify
description: Simplifies code for clarity without changing behavior, and deletes what should never have been written — speculative abstraction, config nobody sets, hand-rolled equivalents of standard library or platform features. Use for readability, maintainability, complexity reduction, and anything described as over-engineered or bloated, once behavior is understood.
---

# Code Simplification

## Overview

Simplify code by reducing complexity while preserving exact behavior. The goal is
not fewer lines — it is code that is easier to read, understand, modify and
debug. Every simplification must pass one test: **would a new team member
understand this faster than the original?**

## When to Use

- After a feature works and tests pass, but the implementation feels heavier than
  it needs to be
- During code review when readability or complexity is flagged
- Deeply nested logic, long functions, unclear names
- Refactoring code written under time pressure
- Consolidating related logic scattered across files
- After a merge that introduced duplication or inconsistency

**When NOT to use:**

- The code is already clean — do not simplify for the sake of it
- You do not yet understand what it does — comprehend before you simplify
- It is performance-critical and the simpler version is measurably slower
- You are about to rewrite the module entirely — simplifying throwaway code
  wastes the effort
- The block carries an explicit do-not-touch marker (`simplify-ignore`,
  `@preserve`, a comment naming a reason). Honour it and say you skipped it.

## The Five Principles

### 1. Preserve Behavior Exactly

Change how the code expresses itself, never what it does. Inputs, outputs, side
effects, error behaviour, ordering and edge cases must stay identical. If you are
not sure a simplification preserves behaviour, do not make it.

Before every change, ask:

- Does this produce the same output for every input?
- Does this maintain the same error behavior?
- Does this preserve the same side effects and ordering?
- What proportionate final-state verification will reveal a behavior change?

**If a test has to change for your simplification to pass, you changed
behaviour.** Revert it. Editing the test to match the new code destroys the only
evidence that behaviour was preserved.

**And if nothing tested it, a green suite proves nothing.** "Existing tests pass"
is vacuously true for code no test ever exercised. Before simplifying non-trivial
logic with no coverage, write the smallest check that pins current behaviour, run
it against the **original** to confirm it passes, then simplify. That check is
the deliverable that makes the rest of this skill safe; without it you are
editing on faith.

### 2. Follow Project Conventions

Simplification means making code more consistent with this codebase, not
imposing outside preferences.

1. Read `AGENTS.md` / `CLAUDE.md` and project conventions
2. Study how neighbouring code handles the same pattern
3. Match the project's imports, naming, function style, error handling and type
   annotation depth

Simplification that breaks project consistency is not simplification — it is
churn. Conventions come from the repository, never from your own preferred
dialect.

### 3. Prefer Clarity Over Cleverness

Explicit beats compact whenever the compact version needs a mental pause to
parse.

- Replace nested ternaries with readable control flow
- Replace dense inline transforms with named intermediate steps when they clarify
  intent
- Keep helpful names even when they cost a few lines
- Delete comments that restate the code (`// increment counter`); **keep comments
  that explain why** (`// retry — the API is flaky under load`). Intent is the one
  thing the code cannot say for itself.

### 4. Maintain Balance

Over-simplification is a real failure mode:

- Do not inline away a name that carries meaning
- Do not merge unrelated logic into one larger function
- Do not optimise for line count over comprehension
- Do not remove an abstraction that genuinely earns its place — but **"serves
  extensibility" is not earning it.** An abstraction pays rent when a second
  implementation exists *today*, or a test really does substitute at that seam.
  One implementation and no substitution is the `yagni:` case below: inline it.
  This is the same tiebreaker as DRY's rule of three — evidence now, not a story
  about later.

### 5. Scope to What Changed

Default to simplifying recently modified code. Avoid unrelated drive-by refactors
unless explicitly asked.

The default bounds *unrequested* work, not large work. Asked to simplify a whole
module, restructure a subsystem, or rethink an approach, that **is** the scope —
do it fully rather than trimming the edges of it.

And if the real problem is the design rather than its expression, say so instead
of polishing it. Simplification that preserves a wrong structure exactly is the
expensive kind of tidy. Name the restructure and let the caller decide.

## Principles by name

Named so a review can cite them, and bounded so they do not fight each other.

**KISS** — the simplest thing that fully solves the actual problem. Not the
smallest thing that appears to.

**YAGNI** — build for today's requirement. Speculative flexibility is complexity
with no payer: everyone reads, tests and maintains it forever, for a case that
has not arrived.

**DRY — of knowledge, not of characters.** Two pieces of code that must change
together for the same reason are one piece of knowledge duplicated; unify them.
Two that merely look alike today are coincidence; leave them alone. **This is
where DRY and YAGNI appear to collide, and the tiebreaker is the rule of three:**
wait for the third occurrence before extracting. A wrong abstraction costs more
than the duplication it replaced, because every later case bends itself to fit.

**Single responsibility** — one reason to change. The test is whether you can
name what a function or module does without using "and".

**Linear flow** — code should read top to bottom. Guard clauses and early returns
over nesting; a straight sequence over callback pyramids, flag-driven branching
and mutual recursion. Every level of indentation is a branch the reader has to
hold in their head.

**Modularity** — clear boundaries, narrow interfaces, dependencies pointing one
way. A module you can understand without opening its neighbours is a module you
can change safely. Watch for import cycles, and for the `utils` file that has
become a junk drawer.

## Be brave about size, never about safety

The default failure of this skill is timidity: renaming a variable, straightening
one conditional, then calling a four-file tangle "already right-sized". That is
not simplification, it is tidying around the problem.

- **Refactor as many files as the problem actually spans.** If the honest fix
  moves a responsibility across six modules, say so and do it. Size alone is
  never a reason to decline. This is Principle 5 read correctly: the guard is on
  *unrequested* work, never on *large* work. Following one problem across the
  files it actually occupies is the task; wandering into unrelated code is not.
- **Restructure, do not only rearrange.** Where the design is the problem — wrong
  seams, a god object, an inheritance chain expressing one behaviour, state
  threaded through five layers — replace it. Careful patches over a wrong design
  is the expensive outcome, not the safe one.
- **Finish the deletion.** Replacing a hand-rolled helper with the standard one
  and leaving a wrapper that only forwards has moved the complexity, not removed
  it. If the wrapper is internal, update its callers and delete it. If it is
  *exported*, deleting it is an API change, not a simplification — collapse it to
  a one-line alias, or remove it and migrate the callers if this module is not a
  public boundary. Either is fine; say which you chose and why.
- **Do not grade your own timidity as taste.** "Already fine" about a nested
  ternary or a three-deep nest is the excuse this section exists to remove.

Bravery never means:

- Skipping the pin-down check on code no test covers
- Weakening or rewriting a test so a refactor goes green
- Touching validation at a trust boundary, an error path, a security control or
  an accessibility affordance
- Doing it silently. A large restructure is named, and its blast radius stated,
  before it starts — the caller decides whether to spend it, and *that* decision
  is theirs, not the size of the diff.

## Process

### Step 1: Understand Before Touching

**Chesterton's Fence.** A fence across a road gets removed only after you know
why it was put there. Before changing or deleting anything, understand why it
exists.

- What is this code's responsibility?
- What calls it? What does it call?
- What are the edge cases and error paths?
- Are there tests that define expected behaviour?
- Why might it have been written this way — performance, a platform constraint, a
  past incident?
- **What does `git blame` / `git log` say?** The commit message is often the whole
  answer, and it costs one command.

If you cannot answer these, read more context first. Accumulated complexity often
has no reason and is just residue from iteration under pressure — but you find
that out by checking, not by assuming.

### Step 2: Find the Opportunities

Two questions, in this order. **Should this exist?** comes before **is this well
expressed?** — there is no point tidying a function the standard library already
ships.

#### First: the ladder, applied after the fact

Whoever wrote this was supposed to climb the ladder before adding code. When they
did not, you are the backstop — and this is the half of simplification that
deletes rather than rearranges. Stop at the first rung that holds.

1. **Does it need to exist at all?** Speculative need, an unused export, a config
   key nobody sets, a flag with one value, scaffolding "for later" that nothing
   extends. Delete it; re-add when something actually needs it.
2. **Is it already in this codebase?** A helper, util, type or pattern living a
   few files over. Re-implementing what already exists is the most common waste
   there is.
3. **Does the standard library do it?** A hand-rolled deep clone, debounce, date
   parse, UUID, group-by or argument parser is the highest-value deletion
   available — and the one a clarity-focused pass walks straight past, because
   the hand-rolled version is often perfectly *readable*.
4. **Does a native platform feature cover it?** CSS over JS, a DB constraint over
   application code, a built-in control over a widget library.
5. **Does an already-installed dependency solve it?** Use it. Never add a new one
   for what a few lines can do.

Tag each finding so the caller can triage:

| Tag | Means |
|---|---|
| `delete:` | dead code, unused flexibility, speculative feature. Replacement: nothing. |
| `stdlib:` | hand-rolled thing the standard library ships. Name the function. |
| `native:` | code or a dependency doing what the platform already does. Name the feature. |
| `yagni:` | abstraction with one implementation, config nobody sets, layer with one caller. |
| `shrink:` | same logic, fewer lines. Show the shorter form. |

**The line this must not cross.** These rungs remove *implementation*, never
*behaviour*. Dropping an unused abstraction, an unreachable branch or a
hand-rolled equivalent of something standard leaves observable behaviour
identical — Principle 1 intact. Removing a **feature someone uses** is a product
decision and not yours: name it and let the caller decide.

**Swapping in a standard implementation is where "simplification" silently
changes behaviour.** Check the edge cases match before you trust the swap — sort
stability, `null` and empty-input handling, precision, whether the standard
version accepts input the hand-rolled one rejected or throws where it returned a
default.

#### Then: expression

**Structure**

| Pattern | Simplification |
|---|---|
| Nesting 3+ deep | Guard clauses, early returns, extracted helpers |
| Functions over ~50 lines | Split by responsibility, name each part |
| Nested ternaries | if/else chain, switch, or a lookup table |
| Boolean flag arguments — `doThing(true, false)` | Options object, or separate functions |
| The same conditional repeated | Extract a named predicate |

**Naming and comments**

| Pattern | Simplification |
|---|---|
| `data`, `result`, `temp`, `val` | Name the content: `userProfile`, `validationErrors` |
| `usr`, `cfg`, `btn`, `evt` | Full words, unless universal (`id`, `url`, `api`) |
| A `get*` that also mutates | Rename to what it actually does |
| Comment restating the code | Delete |
| Comment explaining why | Keep |

**Redundancy**

| Pattern | Simplification |
|---|---|
| The same 5+ lines in several places | Extract a shared function |
| Dead code, unreachable branches, commented-out blocks | Remove once confirmed dead |
| A wrapper that adds nothing | Inline it |
| Factory for one product, strategy with one strategy | Replace with the direct call |
| Redundant cast to an already-inferred type | Remove |

### Step 3: Apply Changes Incrementally

One simplification at a time.

1. Make the change
2. Check preservation with evidence proportionate to the risk: the pinned check
   for logic you touched, plus whatever the repository's own release instructions
   require for the diff as a whole. Add or repeat more only where the change, or
   a stated uncertainty, warrants it.
3. Keep it only when that evidence holds

Batch only what you can attribute. **If verification fails after several
simplifications, bisect them rather than guessing** — the reason to work in small
steps is knowing which step broke it, and a batch you cannot bisect has given
that up.

Keep refactoring commits separate from feature and bug-fix commits. A change that
refactors *and* adds behaviour is two changes; mixed history is harder to review,
revert and understand later.

**Mark any ceiling you deliberately leave.** Where the simple form carries a real
limit you are choosing to accept — a global lock, an O(n²) scan over a list you
know stays small, a naive heuristic — say so in a comment naming the ceiling and
the upgrade path. An unmarked ceiling is rediscovered the hard way.

**Above roughly 500 lines, stop hand-editing.** A refactor at that scale wants a
codemod, an AST transform or a scripted rewrite — manual edits there are
error-prone and exhausting to review. Then verify the transform on a sample before
trusting the whole run.

### Step 4: Verify the Result

- [ ] Existing tests pass **without being modified**
- [ ] Build succeeds with no new warnings; linter and formatter clean
- [ ] No behavior, error handling or side effects changed
- [ ] Project conventions still match
- [ ] The diff is clean — nothing unrelated mixed in
- [ ] No dead code left behind: unused imports, orphaned helpers
- [ ] The result is genuinely easier to understand than the original
- [ ] Checks required by the repository's own release instructions have run

If the simplified version is harder to follow or harder to review, revert it. Not
every attempt succeeds, and saying so is a result.

## Red flags

- A test had to change for it to pass — you changed behaviour
- The "simplified" version is longer or harder to follow
- Renaming toward your preference rather than the project's convention
- Error handling removed because it "made the code cleaner"
- Simplifying code you do not fully understand
- One large batch nobody can review or bisect
- Refactoring code *unrelated* to the task, without being asked
- A nested ternary or a three-deep nest left in place as "already fine"
- A hand-rolled helper replaced by the standard one, but a full forwarding
  function kept where an alias or a caller migration would do
- Stopping at one file when the *same* problem plainly continues into others

## Rationalizations to refuse

| Excuse | Reality |
|---|---|
| "Fewer lines is always simpler" | A one-line nested ternary is not simpler than a five-line if/else. Simplicity is comprehension speed, not line count. |
| "I'll simplify this unrelated code while I'm here" | Unscoped edits create noisy diffs and risk regressions in code you never meant to touch. |
| "This abstraction might be useful later" | Speculative abstraction is complexity with no payer. Remove it; re-add when something needs it. |
| "I'll refactor while adding the feature" | Two changes. Split them. |
| "The original author must have had a reason" | Maybe — check `git blame`. But often it is just residue. Check, then decide. |
