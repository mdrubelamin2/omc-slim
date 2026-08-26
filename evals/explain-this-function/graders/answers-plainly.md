---
type: llm
focus: last_message
weight: 2
---
PASS if the answer explains the function directly and stops. Two or three
sentences is ideal.

FAIL if it does ANY of the following, all of which are over-triggering:
  - opens an interview or asks clarifying questions
  - writes or proposes a spec, plan, or stage map
  - performs a code review, lists findings by severity, or proposes refactors
  - delegates, or announces that it will delegate, to a subagent
  - offers unrequested improvements, tests, edge cases or type hints

The user asked one question about four lines of code. Anything beyond an
explanation is cost with no benefit, and this case exists to catch it.
