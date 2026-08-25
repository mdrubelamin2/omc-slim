---
name: deep-interview
description: Interviews the user one question at a time before anything is built, then writes a spec file (goal, out of scope, acceptance criteria, verification plan) and STOPS for approval before any code.
when_to_use: '"build me X" with no user or why, "I have an idea", "help me work out what I want". Not for interrogating an existing plan — use agent-skills:interview-me.'
---

# Deep Interview

Vague requirements produce confidently wrong software. This skill refuses to
start building until the ambiguity is low enough that building is safe.

## Invoked on purpose? Then run.

**An explicit invocation is a decision already made.** The user typed the command,
so the question of whether to interview is settled — do not re-open it, and do
not answer a request to be interviewed with a paragraph explaining that the
request was clear. That is the most annoying possible response to being asked
for help.

Score the ambiguity anyway. The score is cheap, it is the gate the rest of this
skill runs on, and it answers the question better than a judgement call: a
genuinely specific request scores at or below the threshold in one pass, and you
proceed to the spec with the score shown. That is a two-line answer, not a
refusal.

## When this is the wrong tool

This guard is for the case where nothing was invoked and you are deciding
yourself. Stop and say so if the request is already specific. Interviewing
someone who has already told you exactly what they want is not diligence, it is
friction. A one-line bug fix does not need a spec.

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

Sum the scores. **Threshold: proceed to build only at 4 or below.** Report the
starting score to the user so the gate is visible, not implied.

### 2. Ask, targeting the worst dimension first

Rules for questions:

- **Two to four at a time**, never a wall. An interview is a conversation.
- **Target the highest-scoring dimension.** Do not ask what you already know.
- **Prefer questions that expose hidden assumptions** over questions that
  gather facts. "What happens to in-flight orders during the migration?" beats
  "which database?".
- **Offer concrete options** when you can infer plausible ones. Choosing is
  easier than composing.
- **Say why you are asking** when it is not obvious. It converts interrogation
  into collaboration.

If the user answers vaguely, note the dimension is still open and ask once more
with a sharper question. Do not ask a fourth time — record it as an accepted
unknown and move on.

### 3. Rescore, and either loop or stop

After each round, rescore and show the movement:

```
Outcome     3 → 1
Scope       2 → 2   (still open)
Users       1 → 0
...
Total       11 → 4  — gate passed
```

Loop at most **four rounds**. If the total is still above 4 after four rounds,
stop interviewing. Say plainly which dimensions remain unresolved and what
the risk of proceeding is. An unresolvable ambiguity is a finding, not a failure
— sometimes the honest answer is "nobody knows yet, let's prototype".

### 4. Write the spec

Write it to `docs/specs/<slug>.md` (or a path the user prefers):

```markdown
# <Title>

## Goal
One paragraph. What is true when this is done.

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
What was assumed rather than confirmed. Wrong assumptions here are the
likeliest cause of rework.
```

### 5. Stop and ask for approval

**Do not start implementing.** Present the spec path and a three-line summary,
then wait for explicit approval.

This gate is the entire value of the skill. A spec written and then immediately
acted on without confirmation is just a slower way to build the wrong thing.

Once approved, plan the implementation lanes from the acceptance criteria. Give
every lane the spec path as its brief.

## Credit

Adapted from oh-my-claudecode's `deep-interview`, which in turn credits the
Ouroboros convergence-gate pattern.
