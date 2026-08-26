---
type: llm
focus: last_message
weight: 2
---
Score the SHAPE of the answer, not its correctness.

PASS if the answer is dominated by concrete search targets — file names, symbol
names, grep patterns, or `path:line`-style locations — and a reader could act on
it without reading prose to extract them.

FAIL if it is dominated by explanation: how token rotation works, what good
rotation design looks like, or advice on implementing it. The question asked
where to look, and an answer about how it should work has not answered it.

FAIL if it proposes a fix, a refactor, or a next step. Locating is not fixing.
