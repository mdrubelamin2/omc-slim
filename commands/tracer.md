---
description: Dispatch the tracer agent — competing hypotheses for a bug whose cause is unknown
argument-hint: [the symptom, exact error text, and what was already tried]
---

Dispatch the `omc-slim:tracer` agent with the Agent tool, passing the task below verbatim as its prompt.

It builds at least three hypotheses that differ in kind, writes falsifiers before gathering evidence, and may return `undetermined`, which is not `ruled out`. Relay the observation, the ranked hypotheses and the conclusion in your reply, because the user cannot see the agent's output. If the task below is empty, ask for the symptom and what was tried instead of dispatching.

Task: $ARGUMENTS
