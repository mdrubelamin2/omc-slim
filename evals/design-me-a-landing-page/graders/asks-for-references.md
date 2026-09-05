---
type: llm
target: last_message
weight: 2
---
Did the response ask for references, or otherwise refuse to treat "make it look
good" as a sufficient brief?

PASS when it asks for one or more real pages to take structure from, asks what
makes this roastery specific, or states a concrete direction drawn from the
subject rather than from the shape a landing page usually takes.

PASS also when it committed to a named plan first: specific colour values, the
typefaces and their roles, and one signature element, stated before any markup.

FAIL when it went straight to markup from the two-word brief. The measured
failure this grader exists for is that an unspecified brief returns the
statistical median of every landing page in the training data, and a request to
"make it look good" is exactly that brief.
