---
type: llm
focus: last_message
weight: 2
---
PASS if the answer identifies that the `UPDATE orders SET refunded = refunded +
?` statement has no `WHERE` clause, and so credits every order in the table
rather than the one being refunded.

This is the worse of the two bugs and the one that discriminates. The f-string
interpolation above it is the finding every baseline reports; a review that
stops there has read the code for patterns rather than for what it does.
