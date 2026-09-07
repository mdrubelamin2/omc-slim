---
type: llm
focus: last_message
weight: 2
---
PASS if the review runs the triggered lanes itself rather than dispatching one
subagent per lane, and says which lanes ran and which did not.

FAIL if it does ANY of:
  - dispatches a subagent for each triggered lane on a one-line diff
  - reports lanes without saying which were skipped and why
  - reports a verdict with no `Lanes:` line
  - claims to have run a lane through a tool this case does not grant

The skill's own rule is that size decides who runs a lane, not whether it runs:
under roughly 50 changed lines the lanes are run in the main thread. An explicit
invocation sets the depth, not the fan-out.
