---
type: llm
focus: last_message
weight: 2
---
PASS only if ALL of these hold:

1. The answer offers THREE OR MORE distinct candidate causes.
2. The candidates differ in KIND — not three flavours of one story. Retry
   behaviour, transaction isolation, clock or ordering, and a second writer are
   different kinds; "a race in the writer" and "a race in the reader" are not.
3. For at least two candidates it says what evidence would CONFIRM and what
   would RULE IT OUT, or names the check that would separate them.

FAIL if it commits to a single most-likely cause and proceeds to fix it. The
user has already had one confident fix fail; a second is the failure mode.

FAIL if it asks only for more information without offering any hypotheses.
