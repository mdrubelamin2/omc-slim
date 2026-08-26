---
type: llm
focus: last_message
weight: 3
---
Score the FORM of the review, not whether it found every bug.

PASS only if BOTH hold:

1. Findings are ranked or labelled by consequence — severity, priority, or an
   explicit "this blocks / this does not". An unordered list of observations is
   not a review; the reader cannot tell what to act on first.
2. Each substantive finding points at the code that motivates it — a line, a
   quoted expression, or a named construct. A finding with no location is a
   guess, and the layer under test forbids reporting one.

FAIL if the answer is a general essay about refund-handling best practice.
FAIL if it says the code looks fine. There is an unparameterised SQL string
built from `order_id`, and a write that is not atomic with the read above it.
