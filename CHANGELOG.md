# Changelog

Notable releases. Full reasoning for each is in
[RESEARCH.md](./RESEARCH.md) and [MAINTAINERS.md](./MAINTAINERS.md).

## v0.8.1

Re-benchmarked at n=3, with the harness committed at `scripts/bench/` so the
numbers are re-derivable rather than asserted. omc-slim costs **18% less than a
plain session** at equal correctness, reversing the v0.4.1 finding of 10% more.
See [BENCHMARK.md](./docs/BENCHMARK.md), including the four measurement bugs
found before publishing.

Per-agent `model:` and `effort:` pinning removed. Every agent now inherits the
caller's model, so the roster costs what your session costs.

`deepwork` auto-invocation solved: the cause was the injection point, not the
wording. Eight rewrites inside the output style changed nothing; the same
sentences in a `CLAUDE.md` fire it on the first tool call.

## v0.8.0

`fixer` writes to the same standard the reviewers hold it to.

## v0.7.4 – v0.7.8

Simplified Technical English became the default register. `simplify` learned to
spot comment smells. `review` now judges the whole change set rather than the
diff.

Three separate files hit the same compression floor at ~2%, so that pattern is
established rather than suspected.

## v0.7.0 – v0.7.3

Added `review`, the all-axis code-review skill, behind an evidence gate. It
checks current sources and installed tooling rather than recalled knowledge.

## v0.6.4 – v0.6.9

`simplify` merged from all four upstream sources, then audited and compressed
28%. The orchestrator lost 250 tokens with no behaviour change.

## v0.6.0 – v0.6.1

The output style now names every agent and skill, because the descriptions
Claude Code shows get dropped once enough plugins are installed. On a 41k-LOC
repository that turned `oracle` and `librarian` from never firing into firing on
turn one.

The same pass removed the `observer` agent. Claude Code reads images and PDFs
natively, so it never auto-fired; forced, it matched the direct path while being
unable to cross-reference the repo.
