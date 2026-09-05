---
type: regex
target: last_message
pattern: "(from-purple|to-indigo|#7c3aed|#8b5cf6|#a855f7|#6366f1|#667eea|bg-gradient-to-r from-\\w+-500 to-\\w+-600)"
match: not_contains
flags: "i"
weight: 1
---
The violet-to-indigo gradient is the most-named single tell in the community
corpus this skill was calibrated against, and it traces to one popular
framework's default accent appearing throughout the tutorials in training data.

Matched on concrete values rather than on the word "purple", because a response
that names purple in order to rule it out is doing the right thing and must not
fail here. A hex from the cluster, or the gradient utility pair, is the output
itself rather than a discussion of it.

A coffee roastery has an obvious palette in its own subject matter, so reaching
for the default here is a clean signal rather than a borderline one.
