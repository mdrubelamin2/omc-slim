# Deepwork log — compression without regression (2026-08-28)

## Task
Deep analysis + research: compress the output style, six agents and six
skills without behavioural regression. Deliverable is a research/plan
document (docs/COMPRESSION-2026-08-28.md), not the cuts themselves.

## Ground truth (measure-context.sh, v0.9.1, chars/4 basis)
- Static 4,625 tok (~4,075 corrected); style body is 3,552 of it (77%).
- On-invoke ceiling 34,416 tok; review+checklists 9,002 (26%),
  deepwork 4,661, simplify 4,119, fixer 3,044, codemap 2,297.
- Conditional siblings excluded: performance.md 1,004, depth.md 1,090,
  principles.md 669.

## Standing constraints
- Scar 51dfbcc: presence gate green, behaviour broke — reinforcement cut.
- REINFORCEMENT.tsv (116 rules) + COVERAGE.tsv (290 behaviours) pin text.
- review/SKILL.md sits ~44 corrected tokens under the 5,000-token
  re-injection cap; 25,000-token shared re-attach budget.
- Gate 6 ratchet: surface may not grow two releases running; direction is
  "shrink toward Karpathy" (LIMITATIONS.md).

## Stage status
- Stage 1: DONE. Librarian: cut-safety order is examples > obsolete rules >
  repetition > rationale-last-and-only-behind-a-pressure-test (superpowers
  corroborates 51dfbcc); instruction COUNT beats byte count (IFScale);
  Anthropic 80% receipt = restructuring behind evals; LLMLingua N/A.
  Maps: agents+style pool ~5% acceptable risk (style/librarian/tracer near
  incompressible); skills safe pool ~7,600 chars, verification-planning
  back half the cleanest win; KEY: subagents don't inherit the style, so
  style-canonical "duplicates" are false duplicates — compress in place,
  never delete-and-point. Review cap defect: pinned rules sit past the
  5,000-token line; ~850-char offload to checklists.md fixes it.
- Stage 2: DONE — docs/COMPRESSION-2026-08-28.md (protocol Rules 0–5,
  Phases 0–4, do-not-touch list).
- Stage 3: DONE. Oracle agreed on 4 of 5; one MATERIAL blocker — the
  review-cap arithmetic (850-char offload leaves :400/:403 past the
  chars/4 line; nothing truncates on the corrected basis). Remediated:
  §3 restated as margin restoration + in-file reorder + one
  real-tokenizer measurement; Rule 0b (pin retirement) added; Phase 1–3
  explicitly do not wait on Phase 0; Phase 3 / v0.9.2 offload-pool
  collision recorded with the fold-into-v0.9.2 recommendation.
- Stage 4: DONE. Gates green after all edits. Weakest point on record:
  lane char estimates not re-derived row-by-row (disclosed in doc §6);
  the review-file tokenizer measurement is the named residual ambiguity.

## Next first action
Execution starts with Phase 1 (safe band, no new machinery needed) or by
folding Phase 3's review reorder into the v0.9.2 release per the recorded
collision. Both are releases; user triggers.
