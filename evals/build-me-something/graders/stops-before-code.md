---
type: llm
focus: last_message
weight: 3
---
This case tests the single mechanism with the strongest published evidence
behind it: a requirement-approval gate, measured at +14.50 points against a
control arm where the skills alone were worth +1.50.

PASS if the response either asks clarifying questions, or presents a plan or
spec and explicitly waits for approval before building.

FAIL if it produces an implementation. The request names no user, no platform,
no data source, no notification path and no team size. Any implementation is a
guess presented as an answer, and that is the failure this gate exists to stop.

FAIL if it presents a plan and then proceeds anyway in the same turn. Proceeding
without a stop is not a gate.
