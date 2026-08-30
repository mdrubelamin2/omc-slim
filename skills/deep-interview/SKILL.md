---
name: deep-interview
description: Interviews the user in rounds of two to four questions before anything is built, then writes a spec file (goal, out of scope, acceptance criteria, verification plan) and STOPS for approval before any code.
when_to_use: '"build me X" with no user or why, "I have an idea", "help me work out what I want". Runs before a plan exists, not to interrogate one that does.'
---

# Deep Interview

Vague requirements produce confidently wrong software. This skill refuses to start building until the ambiguity is low enough that building is safe.

## Invoked on purpose? Then run.

**An explicit invocation is a decision already made.** The user typed the command, so the question of whether to interview is settled — do not re-open it, and do not answer a request to be interviewed with a paragraph explaining that the request was clear. That is the most annoying possible response to being asked for help.

Score the ambiguity anyway. The score is cheap, it is the gate the rest of this skill runs on, and it answers the question better than a judgement call: a genuinely specific request scores at or below the threshold in one pass, and you proceed to the spec with the score shown. That is a two-line answer, not a refusal.

## When this is the wrong tool

This guard is for the case where nothing was invoked and you are deciding yourself. Stop and say so if the request is already specific. Interviewing someone who has already told you exactly what they want is not diligence, it is friction. A one-line bug fix does not need a spec.

## Procedure

### 1. Score the ambiguity before asking anything

Rate each dimension 0–3, where 0 is "fully specified" and 3 is "no information":

| Dimension | The question it answers |
|---|---|
| **Outcome** | What is true when this is done? |
| **Scope** | What is explicitly *not* included? |
| **Users** | Who uses this, and in what situation? |
| **Constraints** | What can't change — stack, API, schema, deadline, budget? |
| **Success** | How will we verify it, concretely? |
| **Failure** | What should happen when it goes wrong? |

Sum the scores. **Threshold: keep interviewing above 4.** Report the starting score to the user so the gate is visible, not implied.

**Every score cites what settled it** — the phrase in the request that answered the dimension, or "nothing in the request speaks to this". A number with no citation is a number chosen to make the gate pass, and this gate is scored by the same model it constrains.

**Outcome is not tradeable against the others.** Outcome at 3 keeps the interview open whatever the sum says. A request whose finished state is unknown cannot be specified, and five well-understood dimensions around an unknown outcome is five confident answers about the wrong thing.

**The score decides when to stop asking. It does not decide whether to build — the approval in step 5 does.** Four rounds can end above 4, and that is a supported outcome, not a failure: you write the spec anyway with the unresolved dimensions named. Written the other way round, as a hard gate the procedure routinely overrides, the score would teach itself to be ignored.

### 2. Ask, targeting the worst dimension first

Rules for questions:

- **Two to four at a time**, never a wall. An interview is a conversation.
- **Target the highest-scoring dimension.** Do not ask what you already know.
- **Prefer questions that expose hidden assumptions** over questions that gather facts. "What happens to in-flight orders during the migration?" beats "which database?".
- **Offer concrete options** when you can infer plausible ones. Choosing is easier than composing.
- **Say why you are asking** when it is not obvious. It converts interrogation into collaboration.

If the user answers vaguely, note the dimension is still open and ask once more with a sharper question. **Two asks per dimension, and that is the cap** — the original and the sharper one. A third is the interview arguing with the user: record the dimension as an accepted unknown and move on.

### 3. Rescore, and either loop or stop

After each round, rescore and show the movement:

```
Outcome     3 → 1
Scope       2 → 2   (still open)
Users       1 → 0
...
Total       11 → 4  — gate passed
```

Loop at most **four rounds**. If the total is still above 4 after four rounds, stop interviewing. Say plainly which dimensions remain unresolved and what the risk of proceeding is. An unresolvable ambiguity is a finding, not a failure — sometimes the honest answer is "nobody knows yet, let's prototype".

### 4. Write the spec

Write it to `docs/specs/<slug>.md` (or a path the user prefers). The spec is what the next component consumes: the `omc-slim:deepwork` skill when the work spans subsystems and must land together, the `omc-slim:fixer` agent when it is a specified change, and the `omc-slim:verification-planning` skill when the acceptance criteria need an evidence path before anyone builds. Hand over the file, not a summary of it.

```markdown
# <Title>

## Goal
One paragraph. What is true when this is done.

## Files and interfaces
Which files and modules this touches, and the interfaces it must not break. Named, not described — a spec whose reader has to go looking has not handed the work over.

## Out of scope
Explicit exclusions. This section prevents the most rework.

## Constraints
Stack, APIs, schemas, deadlines, anything that cannot move.

## Acceptance criteria
- [ ] Concrete, checkable statements. Not "works well".

## Verification plan
How each criterion gets checked. Name the command or the test.

## Open questions
Anything still unresolved, and the risk each one carries.

## Assumptions
What was assumed rather than confirmed. Wrong assumptions here are the likeliest cause of rework.
```

### 5. Stop and ask for approval

**Do not start implementing.** Present the spec path and a three-line summary, then wait for explicit approval.

This gate is the entire value of the skill. A spec written and then immediately acted on without confirmation is just a slower way to build the wrong thing.

**An answer that declines to choose is neither approval nor refusal, and it has an exit.** "You decide", "up to you", "whatever you think", silence on the question — the same move, however it is worded. Restate the single riskiest line in the spec, the one that costs most to get wrong, and ask once for an explicit yes to that line alone. Declined again, read it as a yes to the spec as written: say so **as the last line before you start**, so the user can object to the reading before any work rests on it, and record it in the spec's Assumptions. A gate with no exit is not a gate, it is a stall, and it costs the user their day.

**That is now measured, and it is the largest effect anyone has published for a prompt layer.** In a control-armed, twice-blind-judged comparison — five methods, one frozen underspecified task, same model and rubric — a four-skill pack scored **+1.50 over bare agent**, which is noise. Adding **this gate** took it from 83.17 to **97.67: +14.50 points for +0.60M tokens and about two minutes**. The full fourteen-skill framework did not beat that pack plus its loops, while spending 7.6× the control arm's tokens.
[Source](https://github.com/luobosibing2/superpowers-workflow-evaluation);
caveats in [the research](../../docs/RESEARCH-2026-08-26.md#119-a-control-armed-evaluation-exists-and-it-names-the-winning-mechanism).

**The gate survives the argument that the user already approved.** They approved *the interview*. They have not seen the spec, because it did not exist when they typed. Section 1's "an explicit invocation is a decision already made" licenses you to skip the *scoring debate*, never the stop. If those two ever seem to conflict, this one wins.

Once approved, plan the implementation lanes from the acceptance criteria. Give every lane the spec path as its brief.
