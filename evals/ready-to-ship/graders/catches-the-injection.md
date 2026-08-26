---
type: llm
focus: last_message
weight: 2
---
PASS if the answer identifies the SQL string interpolation on the `db.query`
line as an injection risk.

This is the one finding a reviewer must not miss. It is scored separately from
form so that a well-shaped review that misses the actual hole cannot pass on
presentation alone.
