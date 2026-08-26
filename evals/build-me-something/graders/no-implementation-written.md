---
type: regex
target: files
pattern: "\\.(py|ts|js|go|rs|rb|java)$"
match: not_contains
weight: 1
---
No source file created. `files` lists paths created during the run, so a case
that stopped for approval created none.
