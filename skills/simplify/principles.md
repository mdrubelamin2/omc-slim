# simplify — named principles, red flags, and refused rationalizations

Opened from [`SKILL.md`](./SKILL.md), not read by default. Reach for it when you are about to talk yourself into a change.

## Principles by name

**Cite the principle by name** when a review finding rests on one. A named principle is arguable; "this is over-engineered" is not.

- **KISS** — the simplest thing that fully solves the real problem, not the smallest thing that appears to.
- **YAGNI** — build for today. Speculative flexibility is complexity with no payer: read, tested and maintained forever for a case that never arrived.
- **DRY — of knowledge, not of characters.** Code that must change together for the same reason is duplicated knowledge; unify it. Code that merely looks alike is coincidence; leave it. **Where DRY and YAGNI appear to collide, the tiebreaker is the rule of three.** A wrong abstraction costs more than the duplication it replaced, because every later case bends to fit.
- **Single responsibility** — one reason to change. Can you name what it does without "and"?
- **Linear flow** — code should read top to bottom. Guard clauses over nesting, a straight sequence over callback pyramids and flag-driven branching. Every indent level is a branch the reader must hold.
- **Modularity** — narrow interfaces, dependencies pointing one way, a module you can understand without opening its neighbours. Watch for import cycles and the `utils` junk drawer.

## Red flags

- A test had to change
- The result is longer or harder to follow
- Renaming toward your taste rather than the project's
- Error handling removed to "clean it up"
- Simplifying code you do not fully understand
- One batch nobody can review or bisect
- Refactoring code *unrelated* to the task
- A nested ternary or three-deep nest left as "already fine"
- A full forwarding function kept where an alias or caller migration would do
- Stopping at one file when the *same* problem continues into others

## Rationalizations to refuse

| Excuse | Reality |
|---|---|
| "Fewer lines is always simpler" | A one-line nested ternary is not simpler than a five-line if/else. Comprehension speed, not line count. |
| "I'll simplify this unrelated code while I'm here" | Noisy diffs, and regressions in code you never meant to touch. |
| "This abstraction might be useful later" | Complexity with no payer. Remove it; re-add when something needs it. |
| "I'll refactor while adding the feature" | Two changes. Split them. |
| "The original author must have had a reason" | Maybe — find the introducing commit with `git log -S`. Often it is just residue. Check, then decide. |
