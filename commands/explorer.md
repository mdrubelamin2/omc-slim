---
description: Dispatch the explorer agent — a file:line map of where things live, read-only
argument-hint: [what to locate, e.g. "every caller of session.refresh"]
---

Dispatch the `omc-slim:explorer` agent with the Agent tool, passing the task below verbatim as its prompt.

It returns a compressed `file:line` map, capped at 150 lines on a survey, and proposes no fixes. Relay the map in your reply, because the user cannot see the agent's output. If the task below is empty, ask what to locate instead of dispatching.

Task: $ARGUMENTS
