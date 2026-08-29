# The staged procedure

The seven steps `SKILL.md` names. Open this when the work is multi-phase; a small
mechanical change follows the project's own checks instead.

**Everything here is what the plan specifies, not what you personally perform.**
The skill plans; other components execute. Write each step's outcome into the
plan and name its owner.

Every step closes on a **Complete when**, and that is the point of writing them
down: a step declared finished by feel is the failure this skill exists against.

## 1. Frame the claim

State the behavior that needs to become true and the conditions that could make
a confident conclusion wrong.

Consider what must change, what must remain true, where the behavior crosses a
boundary, and which failure would matter most.

**Complete when:** the claim, its meaningful uncertainty, and its important
failure modes are concrete enough to investigate.

## 2. Design the evidence path

Derive possible evidence paths from the system itself. Look at its controllable
inputs, observable effects, state transitions, invariants, boundaries,
artifacts, and ability to repeat or reverse a scenario.

Generate alternatives before choosing. Prefer the path that produces a
trustworthy conclusion with proportionate cost, safety, and effort.

**Complete when:** there is a preferred path, its limitations are understood,
and a weaker or stronger alternative is available if circumstances change.

## 3. Research when the path is unknown

Some evidence paths depend on something you cannot check from here: an unfamiliar
dependency, a framework, an external service, a fast-moving capability. Ask the
librarian for focused research before you commit to an approach.

Ask for official or project-specific facilities, constraints, and trade-offs
that affect this exact verification problem. Use existing project evidence
directly when it already resolves the choice.

**Complete when:** the chosen path rests on known capabilities and real
constraints rather than assumption.

## 4. Set a verification budget

At the final state, state the distinct claims and assign one owner to establish
or refute each. Choose the minimum non-duplicative evidence that covers the
claims and important boundaries. Reuse evidence only while its relevant code,
inputs, environment, and state remain valid. Required repository and release
checks still apply. Scale the budget to consequence: minimality is right for
work a commit undoes, and wrong for a migration, a published interface or a
deletion, where the cheapest check that could have caught it is the one you
skipped. Broaden or repeat verification when a stated condition
justifies it.

**Complete when:** every distinct claim has one named owner and one piece of
non-duplicative evidence, sized to what being wrong about it would cost.

## 5. Create a verification affordance when needed

When the existing system leaves the decisive truth too indirect or ambiguous,
extend the evidence path with a **verification affordance**. An affordance is
the smallest capability that makes the relevant state controllable, observable,
repeatable, and diagnosable for an agent.

Ask what capability would let an agent establish the claim directly, repeat the
scenario from a known state, and explain a failure without inference. Prefer an
affordance that strengthens directness, determinism, agent-legibility,
isolation, resetability, or future reuse.

Treat the affordance as part of the evidence path, not an automatic product
feature. Decide deliberately whether it is temporary or durable before building
it.

**Complete when:** the chosen path can establish the claim directly enough for
its stakes, and any needed affordance has a defined lifecycle.

## 6. Make the path runnable

Prepare only the support needed to follow the evidence path reliably. Keep the
support narrow, repeatable, and safe to inspect.

Decide whether that support has recurring value or exists only to resolve the
current uncertainty. Retain durable value deliberately; remove temporary
support once it has served its purpose.

Ask before introducing dependencies, persistent diagnostic surfaces, or
structural changes whose sole purpose is evidence gathering.

**Complete when:** the path can be followed without guessing about setup,
state, or interpretation.

## 7. Close the evidence path

After implementation, follow the planned path and interpret the resulting
evidence against the original claim.

Report whether the claim was established, limited, or refuted; distinguish
known facts from remaining uncertainty.

**Complete when:** a future reader can see what supports the conclusion and
what remains outside its reach.
