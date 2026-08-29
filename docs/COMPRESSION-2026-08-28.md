# Compression without regression — analysis, evidence, protocol (2026-08-28)

Requested: a deep pass on compressing the output style, six agents and six
skills without behavioural loss. Method: full measurement
(`./scripts/measure-context.sh`), two adversarial compressibility maps run
in clean contexts (style+agents; skills+siblings), and a sourced external
research pass. Every external claim carries its source; candidate rows carry
file:line and pin status. This document decides the *protocol* and the
*bands*; the cuts themselves are releases, executed later under it.

The scar that governs everything here: `51dfbcc` — a compression pass where
all 88 presence rows stayed green and behaviour broke anyway, because the
reinforcing sentence that made a rule fire was cut while the rule's phrase
survived. The external record now corroborates that mechanism independently
(§2.5). This is the failure class the whole protocol is built against.

---

## 1. Ground truth (v0.9.1, chars/4 basis; corrected ≈ ÷1.135)

| Surface | chars | ~tokens | Share |
|---|---|---|---|
| Static total (paid every request) | 18,502 | 4,625 | — |
| — of which output style body | 14,210 | 3,552 | **77%** |
| On-invoke ceiling (all twelve fire) | 137,666 | 34,416 | — |
| — of which review + checklists | 36,010 | 9,002 | 26% |
| — deepwork | 18,644 | 4,661 | 14% |
| — simplify | 16,476 | 4,119 | 12% |

Two consequences fall straight out. **Static compression is a style-body
question, and the style body is nearly incompressible** — roughly 35
reinforcement rows and 45 coverage rows resolve into it, pins blanket ~70%
of its paragraphs, and its one large "duplication" (the roster bullets) is
self-justifying: line 19 records that descriptions get dropped on crowded
machines, so the duplication *is* the mechanism. Realistic ceiling ~3%.
**On-invoke compression is a review/deepwork/simplify question**, and that
is where the real pool sits.

## 2. What the evidence says (external pass, all sourced 2026-08-28)

1. **The enemy is instruction count, not word count.** IFScale
   (arXiv:2507.11538): best frontier models hold 68% compliance at 500
   concurrent instructions, with primacy bias — late instructions comply
   worst. Combined with the repo's §1.1 (collapse by N=80–160 rules):
   merging five rules into one judgment statement buys more compliance
   than shortening five rules' wording. Compression that lowers the count
   beats compression that lowers the bytes.
2. **Shorter-for-its-own-sake has no evidence.** No 2025–2026 study shows
   shortening alone improves compliance at constant instruction count; the
   repo's own null (25-line CLAUDE.md scored *lowest*, BF₁₀=0.096) still
   stands. Byte-count vanity is not a goal; count and position are.
3. **The one big receipt is restructuring, not deletion.** Anthropic
   removed ~80% of Claude Code's system prompt "with no measurable loss on
   our coding evaluations" (claude.com/blog, 2026-07-24) — via six shifts:
   rules→judgment, examples→interface design, upfront→progressive
   disclosure, repetition→tool descriptions. Validated by evals, not by
   diff review. That is the ceiling of what compression can be, and the
   price of admission is a harness.
4. **Official budgets are ceilings that exist:** SKILL.md under 500 lines;
   after compaction only each skill's **first 5,000 tokens** re-attach,
   inside a 25,000-token shared budget (code.claude.com/docs/en/skills) —
   so position is a *correctness* variable, not a style one. And the
   authoring guidance says build evals **before** writing extensive
   documentation.
5. **Rationale is the least-safe cut, and the scar is corroborated.**
   Anthropic's two pages split (skills doc: "state what to do rather than
   narrating how or why"; prompting doc: motivation "can help Claude
   better understand your goals"), and obra/superpowers supplies the
   resolving mechanism: counter-rationalization sentences are added one
   per documented baseline failure, so each is a passing test's fix —
   deleting one un-fixes a test no presence check can catch. That is
   `51dfbcc` stated from outside. Background narration is safe; measured
   evidence and rationalization-counters come out only behind a re-run
   pressure test. Superpowers' wording data adds a trap: prohibition
   phrasings underperformed even no guidance — never compress a recipe
   into a "don't".
6. **Automatic compression is out.** LLMLingua-class tools deliberately
   protect instruction text and have no published application to authored
   agent prompts; a 2025 follow-up reports drops and ungrounded output
   even in-domain (arXiv:2503.19114). Checked, found nothing applicable.

## 3. What the maps found (headline numbers, full rows in the lane records)

Both maps were run against both TSVs, so every row carries pin status.

- **Agents + style (58,964 chars):** ~1,340 safe, ~1,780
  compress-with-pin-care, ~1,840 high-risk — **about 5% at acceptable
  risk**. Nearly incompressible: the style body, librarian, tracer. The
  cheap unpinned mass is almost entirely the measured-evidence sentences
  (oracle's 99.2%-vs-48.3%, explorer's 29×/69×, designer's axe-57%) —
  exactly the §2.5 class.
- **Skills + siblings (110,412 chars):** ~7,600 chars safe
  (~1,900 chars/4 tokens), concentrated in three places:
  verification-planning's conditional back half (~2,300 chars → a new
  conditional sibling, zero pins in span — the cleanest large win in the
  entire estate), deepwork's style-duplicates and merge candidates
  (~1,800, all overlapping the standing upstream adopt-or-diverge
  DECIDE), and codemap (~1,185 incl. the never-pasted atlas example).
  The two biggest-looking offloads (deepwork's depth ladder,
  deep-interview's spec template) are *illusory*: both run on every
  invocation, so their sibling would be always-read — repositioning, not
  saving.
- **The structural fact that dominates both maps: subagents do not
  inherit the output style.** Every cross-file "duplicate" whose canonical
  copy is the style is a **false duplicate at runtime** — the agent-side
  copy is the only copy that agent ever sees. These rows are
  compress-in-place candidates, never delete-and-point-at-canonical. Three
  unpinned agent-side copies are load-bearing enough to need *pins added*,
  not cuts: fixer's grep-every-caller (fixer.md:56–59), fixer's
  both-scopes/ToolSearch block, and the "unsearched tool is invisible"
  line in both writers.
- **The review cap finding — margin fragility, not a live defect, and
  the first fix drafted here was arithmetically wrong.** The oracle gate
  re-derived it: the chars/4 5,000-token line falls at char 20,000 ≈ line
  363, the re-review budget paragraph straddles it (:361 → char 19,806),
  and the final-message pin (:400 → char 21,709) and Refuse-these table
  (:403 → char 21,870) sit well past it. Offloading ~850 chars of
  checklists-canonical text (rows at :134–139, :129–133 elaboration,
  :159–164) moves :400 only to ~20,859 — **still past the line** — and
  making it true by deletion alone needs ~1,900+ chars the duplicate pool
  does not hold. On the corrected basis (÷1.135) nothing truncates today;
  the exposure is the 44-token margin plus any future growth. The correct
  fix is Rule 4's own mechanism: **reorder within the file** so every
  pinned rule sits before char 20,000 (the output contract and
  Refuse-these move above less-critical §6/§7 prose; the gates resolve the
  re-pointed pin rows), *and* offload the 850 chars for margin. And
  retire the two-estimates ambiguity: measure this one file once with a
  real tokenizer, since chars/4 and corrected disagree across the line.
  One caveat binds every sibling move: **sibling text is never
  re-injected after compaction — only SKILL.md's first 5,000 tokens
  are** — so offload trades compaction survival for position, and is only
  correct where the canonical copy already lives in the always-read
  sibling or the text is genuinely conditional.

**The honest total:** ~9–10k chars (~2.3–2.7k chars/4 tokens) at
acceptable risk, all of it on-invoke, roughly 7% of the ceiling — plus a
correctness fix in review's cap margin. The static surface does not move.
Anything bigger comes only from §5's restructuring tier, which needs the
harness first. The repo has already been compressed hard; that is what the
5% agent figure means.

## 4. The protocol — how a cut ships without a regression

House law throughout: one component per commit; both gates
(`check-coverage.sh`, `check-reinforcement.sh`) green after every commit —
remembering their own caveat that they prove presence, not fire;
`measure-context.sh` re-derived in the same commit that changes any number
it reports; every phase is a release (version bump, CHANGELOG); the ratchet
(surface may not grow two releases running) keeps holding on the way down.

**Rule 0 — pin before cut.** Text about to be compressed gets its
reinforcement pinned *first*, in a separate commit, so the gate can see
gutting during the compression itself. A cut that would require deleting a
pin row is not a cut; it is a behaviour change and takes the full process.

**Rule 0b — pins retire on the same evidence bar that removes text.** Pin
inflation is Rule 0's own failure mode: pins blanket ~70% of the style
already, Phase 2 adds more, and a ratchet with no downward pawl makes the
TSVs the repo's largest incompressible surface within ten releases. A pin
retires when (a) its provenance commit is read and the documented failure
it answers no longer reproduces under the Rule 1 pressure test, or (b) its
upstream justification is documented reversed — the pattern LIMITATIONS.md
already records for the designer-temperature entry (`c7690923`). Same
evidence to remove a pin as to cut pinned text; never less.

**Rule 1 — the pressure test, for anything rationale-shaped.** Before a
measured-evidence or counter-rationalization sentence comes out:
reconstruct the failure it answers (git log usually names it), run the
scenario without the sentence, and only cut on a green baseline — the
superpowers RED step, which is `51dfbcc` turned into procedure. Designing
the minimal harness for this is verification-planning work; until it
exists, the high-risk band is frozen. No failable check possible → the
sentence stays.

**Rule 2 — cut by category, in evidence order:** (1) pure
harness-restatements and intra-file duplicates, (2) frontmatter bloat and
provenance relocations, (3) worked examples where the output contract
already shows the shape — trim to one, never to zero, (4) cross-file
copies, compressed in place with an anchor kept (styleless agents), (5)
rationale — behind Rule 1 only.

**Rule 3 — prefer count-reduction to byte-reduction.** A merge of two
paragraphs carrying one rule outranks shortening both. Never convert a
recipe into a prohibition.

**Rule 4 — position is part of the cut.** Any change to review/SKILL.md
re-derives the cap margin in the same commit; load-bearing text lands in
the first 5,000 tokens or in the always-read sibling, never past the line.

**Rule 5 — behavioural gate at each release boundary.**
`smoke-contracts.sh --execute` for the touched component minimum; the eval
suite once the gating probe clears; and after the harness exists, the
Anthropic standard applies — a compression release ships with a measured
no-loss delta or it does not ship.

## 5. The phased plan

Sequencing rule the oracle gate added: **Phase 0 blocks only Phase 4 and
Rule 1 cuts.** Phases 1–3 need nothing new — the standing gates plus
`smoke-contracts.sh --execute` for the touched component — and do not wait
on the paid probe or the harness. Read strictly-sequential, this plan would
park its own safe band behind machinery it does not need; it is not
sequential.

- **Phase 0 — instrument.** verification-planning designs the per-cut
  pressure-test harness; run the `plugin eval` gating probe (already TODO
  step 1). Nothing high-risk moves before this exists.
- **Phase 1 — bookkeeping (safe band, ~2.5k chars).** Harness
  restatements (the cat/head/tail lines, tool-list restatements),
  intra-file merges (designer's doubled tooling paragraph — the single
  safest cut in the estate), frontmatter bloat, provenance relocations,
  codemap's atlas example and legacy-state note (deprecation window).
- **Phase 2 — pin-migration compressions (~2.5k chars).** The
  compress-in-place of styleless-agent copies (register blocks, ladders),
  with TSV updates in the same commits, plus the three pin-*additions*
  the map flagged. This phase adds pins net — that is correct, and cheap.
- **Phase 3 — repositioning (margin restoration, ~1k chars net).** The
  review in-file reorder plus the 850-char offload (§3, as corrected), and
  verification-planning's conditional sibling (the one large clean win).
  **Collision, recorded:** TODO-v1.0.md's v0.9.2 and gems releases both
  *add* prose to review (B7's carve-out, B8's per-drop lines, the A1/M4
  marker text, gem 1's verdict line) and pay for it from the same
  checklists offload pool. Fold this phase's review work into v0.9.2 —
  same file, same pool, margin re-derived once — or Phase 3 arrives to
  find its 850 chars already spent.
- **Phase 4 — restructuring (the only route past ~7%).** Rules→judgment
  merges per component, each behind the harness and a component check;
  deepwork's share waits on the standing upstream adopt-or-diverge
  DECIDE (TODO-v1.0.md) so the work is not done twice.

**Do-not-touch, restated so no later pass relitigates it:** the
deep-interview approval gate (quadruple-pinned), codemap's announce gate,
everything under the style's "Never simplified away", the roster bullets
(self-justifying duplication), the depth/principles/performance siblings
(pin-dense, already the compressed form), and — without a Rule 1 pass —
every measured-evidence sentence, including deepwork's own `51dfbcc`
paragraph, which a compression pass deleting it would be re-enacting.

## 6. What this analysis could not verify

- All char estimates are the lanes' reading, cross-checked against the
  TSVs but not re-derived line-by-line by the orchestrator; the two maps
  ran in independent contexts and their overlapping rows agree.
- "Safe" means no pin overlap and no identified behaviour — it is a risk
  band, not a guarantee; Rule 5's behavioural gate is what turns it into
  one.
- The Anthropic 80% receipt rests on internal unpublished evals; the
  superpowers wording tests are practitioner receipts without raw data.
- Everything is per-model-generation evidence and re-measures at each
  model release.
