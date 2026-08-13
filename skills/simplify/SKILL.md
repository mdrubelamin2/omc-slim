---
name: simplify
description: Simplifies code for clarity without changing behavior. Use for readability, maintainability, and complexity reduction after behavior is understood.
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
- Do not remove abstractions serving testability or extensibility
- Do not optimise for line count over comprehension

### 5. Scope to What Changed

Default to simplifying recently modified code. Avoid unrelated drive-by refactors
unless explicitly asked.

The default bounds *unrequested* work, not large work. Asked to simplify a whole
module, restructure a subsystem, or rethink an approach, that **is** the scope —
do it fully rather than trimming the edges of it.

And if the real problem is the design rather than its expression, say so instead
of polishing it. Simplification that preserves a wrong structure exactly is the
expensive kind of tidy. Name the restructure and let the caller decide.

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

Concrete signals, not vague smells.

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
2. Use the proportionate final-state verification plan to check preservation
3. Keep it only when the evidence supports preservation

Batch only what you can attribute. **If verification fails after several
simplifications, bisect them rather than guessing** — the reason to work in small
steps is knowing which step broke it, and a batch you cannot bisect has given
that up.

Keep refactoring commits separate from feature and bug-fix commits. A change that
refactors *and* adds behaviour is two changes; mixed history is harder to review,
revert and understand later.

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

If the simplified version is harder to follow or harder to review, revert it. Not
every attempt succeeds, and saying so is a result.

## Red flags

- A test had to change for it to pass — you changed behaviour
- The "simplified" version is longer or harder to follow
- Renaming toward your preference rather than the project's convention
- Error handling removed because it "made the code cleaner"
- Simplifying code you do not fully understand
- One large batch nobody can review or bisect
- Refactoring outside the task's scope without being asked

## Rationalizations to refuse

| Excuse | Reality |
|---|---|
| "Fewer lines is always simpler" | A one-line nested ternary is not simpler than a five-line if/else. Simplicity is comprehension speed, not line count. |
| "I'll simplify this unrelated code while I'm here" | Unscoped edits create noisy diffs and risk regressions in code you never meant to touch. |
| "This abstraction might be useful later" | Speculative abstraction is complexity with no payer. Remove it; re-add when something needs it. |
| "I'll refactor while adding the feature" | Two changes. Split them. |
| "The original author must have had a reason" | Maybe — check `git blame`. But often it is just residue. Check, then decide. |

## Defaults

- Prefer the straightforward form in whatever language this repository uses over
  clever compression
- Preserve existing runtime behavior, tests, and hooks
- Favor explicit names and smaller focused helpers when they improve readability
- Keep refactors tightly scoped to the task or review feedback

## Final-state verification

Use a proportionate final-state verification plan for the final diff. Run checks
required by repository and release instructions; add or repeat evidence only
when the changed scope or a stated uncertainty warrants it.
