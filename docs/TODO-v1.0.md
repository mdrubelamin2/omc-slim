# The road to v1.0: the complete backlog

Rebuilt 2026-08-29 from the full research series and hardened by a
seven-seat persona review: principal engineer, tech lead, Claude Code
engineer, harness engineer, AI/ML engineer, prompt engineer, system
engineer. It produced 34 findings, all remediated below. Sources:
[VIABILITY-2026-08-28.md](./VIABILITY-2026-08-28.md) (part I),
[VIABILITY-2026-08-28-II.md](./VIABILITY-2026-08-28-II.md) (part II),
[COMPRESSION-2026-08-28.md](./COMPRESSION-2026-08-28.md),
[RESEARCH-2026-08-26.md](./RESEARCH-2026-08-26.md) §9,
[LIMITATIONS.md](./LIMITATIONS.md).

There are no priority tiers in this file. Everything in it ships. Items
are ordered by dependency, not importance; a cosmetic item is scheduled,
not waived. DECIDE items need a ruling before their work can be specified,
and each carries an owner and a slot. The standing refusals are not skipped
work but decided non-features, each with its reopening trigger and the
mechanism that can observe the trigger firing.

Item tags (work types, not priorities): **FIX** · **DECIDE** (owner +
slot) · **ADOPT** · **COMPRESS** · **VERIFY** · **MEASURE** · **POSITION**
/ **DOCS** · **DO** (assigned new work, not a defect).

The M-ruling index, the oracle rulings of 2026-08-28, labelled here
because part II states them in prose without labels:
- **M1:** the default `--ablation with-without` yields one plugin-level
  delta and cannot decide component fates; component questions need
  component arms (part II §2 explorer/review positions and §4 item 3).
- **M2:** no publishable ablation on a build with known contradictions;
  the sequence is probe → fix → measure (part II §4 preamble).
- **M3:** review's kill criterion is FP-rate separation at
  equal-or-better true-positive yield, on seeded ground truth (part II
  §2).
- **M4:** gate ownership; deepwork owns the `Gate N — attempt N of M`
  marker and the per-gate budget; `review` gates writer phases, `oracle`
  gates decision phases; a mixed phase gets review plus at most one
  oracle escalation (part II §4 item 2).

House law binding every item: a roster or behaviour change is a release;
no claim without a basis; every prompt change re-runs the contradiction
sweep; the ratchet, which means static may not grow two releases running,
and **every wagon that touches a measured file states that file's token
net once, in its own release**; compression follows
COMPRESSION-2026-08-28.md Rules 0–5 including Rule 0b (pin retirement).

---

## v1.0 exit criteria (part I §8; each names the item that produces its evidence)

1. **Delegation pays, measured.** ≥1 multi-file task class, delegation
   verified from transcript, beats plain at equal correctness, n≥3,
   non-overlapping spreads. Name the primary metric and the correctness
   tolerance in `INSTRUMENTS-R4.md` **before the arms fire**, and report both
   cost and wall-clock whichever way they fall. This read "cost or wall-clock"
   until 2026-08-29, which let the winning metric be chosen after the data
   arrived. *Producing items: the R3 benchmark-construction item (the current
   harness is a single-file task that structurally cannot delegate, so a re-run
   alone cannot satisfy or falsify this) and the R4 run.*
2. **Out-of-box liveness.** A fresh default install on the current
   flagship produces one delegation on a natural prompt. The run happens either
   way and its outcome decides what the README's first screen says: a run that
   produces no delegation obliges that screen to say so and show the unlock.
   Writing the sentence without running is not the second branch, it is skipping
   the criterion, and until 2026-08-29 an "or" made a documentation edit
   sufficient. *Producing item: R4's fresh-install liveness runs.*
3. **Inertness is visible.** A stolen style slot **and** a gated Agent tool are
   each learned from the product within one session. Two independent ways to be
   silently inert, so satisfying one leaves the other invisible, which is the
   failure this is named for. The conjunction was an "or" until 2026-08-29.
   *Producing items: hook fixes C3/C4 (slot), the style's absent-Agent-tool line
   (gate), and R4's two adversarial-install sessions.*
4. **Native-parity ledger published.** Every overlapping component carries a
   measured win or a dated removal criterion, **and the count of overlaps
   carrying a measured win is stated** wherever the criterion is scored. The
   ledger is the deliverable; parity is not, and a row that rests on a date must
   not read as evidence of a win. Currently 0 of 4. *Producing item: R3's
   NATIVE.md.*
5. **Contradiction sweep is a release gate.** The sweep ran on this build, over
   the full prompt surface, and its finding count is in the release notes. Zero
   is a result only when it is the result of running. This read "zero open
   findings at tag time" until 2026-08-29, which a sweep that never runs
   satisfies perfectly, and did, for v0.9.5 and v0.9.6. *Producing item: R1
   institutes it; every wagon re-runs it.*
6. **The surface ratchet holds.** Static does not exceed the lowest figure any
   release has reached **on the real-tokeniser basis**, unless the increase is
   named, costed and accepted in the release notes with what it buys. The basis
   is part of the rule: figures published before 2026-08-29 rest on a chars/4
   estimate divided by a constant, and comparing across the two bases is the
   error that made a 298-token cap overrun read as a 44-token margin. Floor is
   4,197; nets re-derived per wagon, never
   extrapolated. This read "did not grow two releases running" until 2026-08-29,
   which alternating growth and shrinkage passes while the surface climbs. A
   ratchet that resets on any single decrease is a sawtooth. *Producing item: the
   per-wagon net statements plus `measure-context.sh`.*
7. **Every number re-derivable.** Benchmark re-run on the shipping
   build; the eval suite has executed at least once. *Producing items:
   R4; contingency in R0 if eval is server-gated.*

Every criterion above was audited against itself on 2026-08-29, in
[CRITERIA-AUDIT-2026-08-29.md](./CRITERIA-AUDIT-2026-08-29.md). Six of the seven
could be satisfied without doing the thing they name. Every amendment tightens,
and three criteria that had been scored met were met through the loophole.

## The release train (dependency order; every wagon ships)

- **R0: instrument probe.** `claude plugin eval` gating probe: one
  trivial case, minimal `--max-cost-usd`. Owner: the account holder.
  Blocks only R4's eval-based ablations and R5's harness-gated cuts.
  **Contingency, stated now:** if execution is server-gated, (a) the
  probe re-runs on a monthly cadence, dated in MAINTAINERS.md; (b) exit
  criterion 7's eval clause is satisfied by the alternative evidence
  path — `smoke-contracts.sh --execute` across all twelve components
  with committed transcripts — and the ablation items convert to
  `scripts/bench/` arms; (c) the conversion is recorded as a criterion
  amendment in this file, not silently absorbed.
- **R1: v0.9.2, the correctness release.** In order: (0) commit the
  governance set — this file, both viability reports, the compression
  report, the deepwork logs, the LIMITATIONS edits — which is currently
  **entirely untracked**; one `git clean` today deletes the release
  train (coordinate the uncommitted `check-coverage.sh` change with the
  session that authored it). (1) Re-verify each of the 19 audit findings
  not already orchestrator-verified against the current files. The
  audit predates v0.9.1's last commits; a finding whose line or symptom
  no longer reproduces closes as stale, with a note, instead of
  patching text that moved. (2) All surviving findings fixed: A-tier,
  B-tier, C-tier alike. (3) The type-prefix fix (cross-cutting 1). (4)
  The review file's complete R1 package (see review section): in-file
  reorder + the ~850-char offload + the A1/M4, B3, B7, B8 changes,
  landed together with one netted margin statement and the one
  real-tokenizer measurement. This wagon and only this wagon runs it.
  (5) Contradiction sweep over the full set as the release gate.
- **R2: compression, phases 1–2.** The safe band and pin-migration band
  (~5k chars), the three pin additions, Rule 0b recorded beside the
  gates. If R1's static net was positive (the type words), R2 nets it
  back, because the ratchet allows one release of growth, not two.
- **R3: adoption, position, and R4's instruments.** Gems 1–5; the gem 6
  ruling (cross-cutting 7); NATIVE.md; README legibility pass; the name
  ruling (cross-cutting 6), decided at R3 open, before NATIVE.md and
  README print the name; team/CI/Windows docs; verification-planning's
  conditional sibling; **and the R4/R5 instrument designs, built here so
  neither wagon arrives empty-handed**: the seeded-defect ground-truth
  set, the component-arm designs, the multi-file benchmark task class
  with its correctness fixture and transcript-based delegation detector
  (extends `scripts/bench/`), and the Rule 1 pressure-test harness that
  R5's Phase-4 cuts run behind. Verification-planning owns all four
  designs.
- **R4: measurement.** Consumes R3's instruments. The multi-file
  benchmark run (criterion 1); whole-plugin ablation on the post-R1
  build (per M2, never earlier); component arms for explorer and review
  per M1, noting these are forked build variants, one paid eval run
  each, comparison math outside the tool, budgeted per run; review
  routing test; `smoke-contracts.sh --execute` cost re-measure;
  criterion 2's fresh-install liveness runs (n=3 natural prompts from
  ROUTING.md's table, default settings); criterion 3's two adversarial
  sessions (a second forced-style plugin installed; a default
  flagship-gated Agent tool session).
- **R5: restructuring.** Compression Phase 4 behind the harness; the
  upstream adopt-or-diverge ruling executed; the §9 residue sweep closed.
  Its check: `grep -c '^- \*\*VERIFY' docs/TODO-v1.0.md` returns
  zero (the pattern matches item rows only; the tag legend and the
  sweep item itself sit outside it).
- **R6: v1.0.** The seven criteria checked against their named
  producing items; distribution (marketplace listing,
  awesome-claude-code, the negative-result write-up); dogfood transcript
  published with the release.

---

---

## Execution status: 2026-08-29

Four releases shipped in one session on branch `v1.0-backlog`. **R0 half-answered,
R1–R3 and R5 complete, R4 built but deliberately unfired, R6 in progress.**

| Wagon | State |
|---|---|
| R0 instrument probe | `claude plugin eval --help` resolves on 2.1.251 with the full option set. **Whether execution is server-gated is unanswered and stays that way**: finding out costs money and the standing decision is no paid runs. |
| R1: v0.9.2 | All 24 audit findings fixed. Two release gates ran against the work and found 15 more, six introduced by the fixes; all remediated. |
| R2: v0.9.3 | Compression phases 1–2. 285 on-invoke tokens out, 70 static. **The ratchet is not paid back** — net +112 across the run — and that is stated rather than manufactured. |
| R3: v0.9.4 | Gems 1–6 (two already present, found by checking), `NATIVE.md`, `INSTRUMENTS-R4.md`, README pass, teams/CI/Windows, the first CI this repository has had, and 650 tokens into a conditional sibling. |
| R4: measurement | **Designed, not run.** Four instruments in `INSTRUMENTS-R4.md`, each ending in one command with a stated budget and a pre-registered falsifying outcome. |
| R5: restructuring | Upstream adopt-or-diverge executed (six pins advanced, one divergence recorded, one attribution re-sourced). §9 residue closed — zero VERIFY tags. **Compression Phase 4 remains blocked**, because Rule 1 needs eval execution and eval execution costs money. |
| R6: v1.0 | Criteria checked below; distribution drafted, not sent. |

Exit criteria, honestly:

1. **Delegation pays, measured** is **NOT MET, and not meetable without a paid
   run.** The instrument now exists; it did not before.
2. **Out-of-box liveness** is **NOT MET.** Needs three fresh-install sessions.
3. **Inertness is visible** is **MET in mechanism, unverified in practice.** The
   hook fixes landed and the style now reports an absent Agent tool; the two
   adversarial sessions that would prove it have not run.
4. **Native-parity ledger published** is **MET.** `docs/NATIVE.md`.
5. **Contradiction sweep is a release gate** is **MET, and it earned it**: on its
   first run as a gate it found eleven contradictions in the release being gated,
   six introduced by that release, every one of which passed every presence check.
6. **The surface ratchet holds** is **NOT MET.** +112 net. Stated, not hidden.
7. **Every number re-derivable** is **MET for every published figure**; the eval
   clause is unsatisfiable this run, and R6 records that as an amendment rather
   than absorbing it silently.

Three criteria of seven need a paid run. That is the honest gap, and no amount
of further prose closes it.

## Cross-cutting items

1. **FIX: type-mark the component namespace (R1).** Agents and skills
   both reach the model as bare `omc-slim:<name>` strings. The Agent
   tool's subagent_type list and the Skill tool's list share the prefix
   with nothing marking type, and the model misroutes: observed
   failure, `deepwork` read as an agent, Agent-tool error, retry as a
   skill. **No component is renamed; this is deliberately not a roster
   change.** Three layers:
   - **Frontmatter first, because that is where today's violations live.** The
     type-less cross-references sit in agent `description` fields
     (`agents/explorer.md:3` "use omc-slim:review", `agents/oracle.md:3`
     "that is omc-slim:tracer", `agents/fixer.md:3` "goes to
     omc-slim:designer", `skills/verification-planning/SKILL.md:4`), the
     most model-facing strings on a crowded machine. Every agent
     description opens in a form unreadable as a skill and vice versa,
     and every cross-reference in a description carries its type word.
   - **Convention on model-facing prose:** the output style, SKILL.md
     bodies, hook `systemMessage` texts, and README carry the type at
     each reference — "the `omc-slim:deepwork` **skill**", "the
     `omc-slim:tracer` **agent**" — or the dispatch-shaped forms
     `Skill(omc-slim:x)` / `Agent(omc-slim:x)`. Agent *bodies* are
     exempt except where a line instructs onward routing (their
     handoff sentences): subagents cannot dispatch (`disallowedTools:
     [Agent, Task]`), so blanket marking there buys nothing and gates
     text compression cannot then touch. The style's roster additionally
     gets one dispatch rule: *agents go through the Agent tool, skills
     through the Skill tool; a name is not a type — check the roster
     header it sits under.*
   - **A gate:** a check over the model-facing set only: frontmatter
     descriptions, style, SKILL.md bodies, hook messages, README;
     `docs/` reports are frozen history and out of scope. Predicate: a
     type word in the same sentence as the reference, with the
     dispatch-shaped forms self-satisfying. Home:
     `check-coverage.sh`'s existing `omc-slim:` reference parser.
     Proved able to fail: seed one violation, watch it fire, remove it.
   Cost: funded by B2's rewrite (which shortens) plus the style's safe
   trims; R1 states the style net, and R2 nets back any growth.
2. **FIX (A1/M4): one gate, one owner.** As indexed above. Touches
   deepwork, review, oracle, and the style; each component section
   references this item.
3. **DOCS: dogfood receipts.** One real session transcript per release.
   Starts at R1, never stops.
4. **VERIFY: the §9 residue sweep.** Walk RESEARCH-2026-08-26 §9 Should
   8–26 on the current build; convert open ones into component items;
   closes in R5 at zero VERIFY tags.
5. **DOCS: repository hygiene.** Commit the governance set (R1 step 0);
   refresh `UPSTREAM.tsv` (~90 commits behind) and rule on each
   load-bearing drift; land the GitHub-description gate with its owning
   session; record Rule 0b beside the gates.
6. **DECIDE: the name (owner: maintainer; slot: R3 open).** "omc-slim"
   reads as a diet fork of a project whose philosophy it rejects (part I
   §1.3). Decided before NATIVE.md and the README pass print it; either
   outcome closes the item.
7. **DECIDE: gem 6, the handoff mechanism (owner: maintainer; slot:
   R3).** Amp's `/handoff` (shipped twice there, which is investment evidence):
   write a handover file (objective, decisions, dead ends, next action)
   and start fresh instead of compacting in place. The design question,
   carried from part II §3: extend deepwork's progress-file format, add
   a seventh skill, **or adopt neither** — "not at all" is a live
   outcome, since a seventh skill is a roster release and the
   progress-file extension may capture the value at zero static cost.
   The ruling names which, and the chosen work ships in the same wagon.
8. **DOCS: the incidents ledger (R1).** The standing refusals' triggers
   are countable but nothing counts them. A section in MAINTAINERS.md:
   the four named failure classes (idle abandonment, identical-tool-call
   loops, format drift, missed standing rules), one line per observed
   incident with its transcript path, counts accumulating across
   releases. The per-release dogfood transcript scan is a named step in
   the release checklist; the ledger is where its findings land. Without
   this, the refusals stand because nobody is positioned to see their
   triggers fire: falsifiable in principle must also be observable in
   practice.

## Output style: `output-styles/omc-slim.md`

- **POSITION:** the moat argument (agent teams experimental, off by default) is
re-checked each minor CC release, and NATIVE.md carries the expiry condition.
- **FIX (B2):** rewrite the cheap/expensive tiers as escalation-order
  semantics ("first call" vs "escalation, use sparingly"), because no
  mechanism produces a cost difference today. The mechanism that *would*
  (per-agent `model:` frontmatter) exists and was removed; its
  non-re-adoption is recorded in the standing refusals with a trigger, so
  this rewrite is a documented ruling, not an oversight.
- **FIX (B7, with review):** the style keeps "the pass that produced a
  change cannot be the pass that clears it"; review carries the
  carve-out.
- **FIX (C11):** one clause defining the three-part close as the
  deliverable, not a summary.
- **FIX (A1 share):** strip any implication oracle reviews diffs.
- **FIX (cross-cutting 1):** the dispatch rule and type-marked
  references.
- **ADOPT (gem 5), recipe form:** "read the last result of a task before
  dispatching that task again", stated as the action, not the
  prohibition, per the repo's own wording evidence (COMPRESSION §2.5:
  prohibitions underperformed no-guidance).
- **FIX (part I §8.3 + criterion 3):** first-response
  self-identification — one line that the orchestration style is active
  — **plus its twin:** "if the Agent tool is absent from your tool list,
  say so in the same first reply." The second line is the only surface
  in the plugin that can make a gated Agent tool visible (no hook
  payload carries permission state, and the tool-call path is refused),
  and it is what criterion 3's second half rests on. The R3 session-end
  delegation roll-up (one line: what was delegated, to whom) ships with
  its token cost measured and stated.
- **COMPRESS (R2):** safe rows 14/21 (~310 chars) and the pin-migrated
  fold of row 28; roster bullets and the R27 neighbourhood are
  do-not-touch.

## Agents

### explorer: `agents/explorer.md`

- **MEASURE (R4, instrument from R3):** component ablation,
  build-minus-explorer, **with the format target defined
  build-independently**, or the arm decides nothing: the ablated arm's
  native Explore receives the map contract as a delegation brief (which
  *is* the migration path under test, compaction cost included), and
  both arms are scored on downstream-consumer success (can the
  orchestrator act on the returned locations?) plus token cost, never
  on explorer's own contract text, which the ablated arm loses by
  construction. Keep or retire executes either way.
- **FIX:** reach for `ast-grep` when installed, with the two measured
  caveats.
- **FIX (cross-cutting 1):** frontmatter description reference gets its
  type word.
- **COMPRESS (R2 safe rows; rationale waits for Rule 1 in R5).**
- **CLOSED (§9 Should 13, verified 2026-08-29):** the positive-control rule is at
  `agents/explorer.md` § *Prove the instrument before you report a negative*, and
  `maxTurns: 100` is in frontmatter. Both were unpinned; both are pinned now.

### librarian: `agents/librarian.md`

- **POSITION:** a NATIVE.md row, since there is no native equivalent.
- **ADOPT (gem 3):** scripts-over-MCP sentence, recipe form ("write the
  ten-line script" as the action).
- **FIX (cross-cutting 1):** type-marked references.
- **COMPRESS (R2):** safe trims; register compresses in place, never
  deleted (styleless-agent rule).
- **CLOSED (§9 Should 23, verified 2026-08-29):** `agents/librarian.md` states the
  condition, the four cases that require the pass, and the licence to skip it,
  with the −39.02pp figure that makes it a condition rather than a ritual.

### fixer: `agents/fixer.md`

- **FIX (A3 share):** name the write mechanism in the final report.
- **FIX (C7), recipe form:** "a search-engine or aggregator URL is
  research — hand it back to the orchestrator for the librarian"; states
  the action and the route, not a bare refusal.
- **FIX (C6, with designer):** one research policy for both writers;
  see designer for the mechanism question.
- **ADOPT (gem 3):** as librarian.
- **FIX (cross-cutting 1):** frontmatter description reference typed.
- **COMPRESS (R2):** safe rows; pin-migration rows with anchors kept.
  Pin additions FIRST (Rule 0): grep-every-caller (:56–59),
  both-scopes/ToolSearch, **and the "unsearched tool is invisible" line,
  the third of the three pin additions, here and in designer.**
- **COMPRESS (R5, behind Rule 1):** the three-examples bullet trims to
  one.

### designer: `agents/designer.md`

- **DECIDE → FIX (B9; owner: maintainer; slot: R1):** Review mode vs
  frontmatter: keep-and-declare or cut-and-route. Either outcome
  executes in R1, and the hook's expectation (currently a pinned false
  positive in `verify-deliverables.test.mjs:371–380`) updates with it.
- **FIX (C9):** motion numbers as base cap plus named exceptions.
- **FIX (C6):** the librarian-first ruling **puts the harness key on the
  table**: fixer enforces this boundary with `disallowedTools:
  [WebSearch]`; designer's carries only `[Agent, Task]`. Adding the key
  is the one-line mechanical fix; if the ruling instead keeps designer's
  self-research, that is a recorded rejection of the key with its
  reason, not an oversight.
- **ADOPT (gem 4):** proof-artifact close.
- **FIX (cross-cutting 1):** frontmatter description reference typed.
- **COMPRESS (R2):** the doubled tooling paragraph (safest cut in the
  estate) + harness restatements; **pin addition: the "unsearched tool
  is invisible" line (third of three).** The axe-57% rationale waits for
  Rule 1 (R5).
- **ACCEPTED LIMIT:** no per-agent temperature, documented, closed.

### oracle: `agents/oracle.md`

- **FIX (A1/M4 share):** marker caller-supplied; decision-phase charter.
- **FIX:** the security-slice pointer to native `/security-review`.
- **FIX (cross-cutting 1):** frontmatter description reference typed
  (the "that is omc-slim:tracer" clause).
- **COMPRESS (R2):** escalation merge (merge, not delete), tool-motif
  and register compress-in-place; study evidence waits for Rule 1 (R5).
- **CLOSED (§9 Should 10, verified 2026-08-29):** `agents/oracle.md` § *Argue the
  other side, as an assignment*, with the 99.2%-against-48.3% measurement and the
  finding that instructing dissent alone is indistinguishable from baseline.

### tracer: `agents/tracer.md`

- **POSITION:** a NATIVE.md row.
- **FIX (B10):** description boundary rewritten to the work's state, not
  the arrival path.
- **FIX (cross-cutting 1):** type-marked references, the second-most
  misroute-prone name.
- **COMPRESS (R2):** dispatch-list merge (pin-migrated) + the one safe
  row; otherwise pinned wall-to-wall.
- **CLOSED (§9 Should 11, verified 2026-08-29):** all three present in
  `agents/tracer.md`: falsifiers written before evidence, hypotheses that must
  differ in kind, and `undetermined` distinguished from `ruled out`.

## Skills

### review: `skills/review/SKILL.md` (+ checklists.md, performance.md)

The R1 package lands as one unit with one netted margin statement: the
in-file reorder (every pinned rule before char 20,000), the ~850-char
checklists-canonical offload, the A1/M4 marker change, B3, B7, B8, and
**the one real-tokenizer measurement**, which lives in this wagon only
(it was previously double-booked into R4; it is not there).
Landing additions and cuts in the same wagon is what the recorded pool
collision (COMPRESSION §5 Phase 3) demanded.

- **FIX (A1/M4):** marker-carrying, not marker-claiming; caller's
  per-gate budget supersedes.
- **FIX (B3):** full base-resolution fallback chain in the shipped
  snippet.
- **FIX (B7):** orchestrator-authored diffs: the fresh-context
  adversarial pass is mandatory; the self-run covers lanes, never the
  verdict.
- **FIX (B8):** one line per dropped candidate.
- **ADOPT (gem 1, R3):** the ship/no-ship verdict line (~15 tokens; the
  R3 net statement pays it from the R1 margin gained).
- **ADOPT (gem 2, R3):** slop-comment lane, after the scheduled
  axis-overlap check.
- **COMPRESS (R5, behind Rule 1):** the rationale rows.
- **MEASURE (R4, instrument from R3, decision rule pre-registered):**
  vs free `/code-review` on the seeded-defect set. Adjudication is the
  seeded ground truth itself: the judge model only matches reported
  findings to seeds, it does not rule on validity. Decision rule,
  registered before the run: review survives if its FP-rate spread and
  the native tool's do not overlap across the seeded sets AND its
  true-positive yield is equal or better (M3); if spreads overlap, one
  enlarged re-run (n doubled) is budgeted; if they still overlap, the
  component retires — **the tie goes to the free native tool**, because
  a paid layer that cannot demonstrate separation from a free one has
  failed its own pitch. Plus the routing test: one natural "is this
  ready to ship" prompt, fresh session.

### deepwork: `skills/deepwork/SKILL.md` (+ depth.md)

- **POSITION:** complementary to `/batch`, which earns a NATIVE.md row and one
README sentence.
- **FIX (A1/M4, the owner):** writer/decision/mixed-phase gate rules;
  marker + budget stamped into dispatched gate agents.
- **FIX (B5), recipe form + greppable:** "record each
  no-failable-check waiver as a `Waived:` line in the stage map; at the
  third `Waived:` line, stop and surface all three." The count lives in
  the written stage-map artefact, not in the model's memory — a
  post-hoc grep can audit it, which is what turns a prose cap into a
  checkable one.
- **DECIDE → executed (owner: maintainer; slot: R5):** upstream
  adopt-or-diverge, ruled by reading the upstream commits, recorded in
  PROVENANCE.md, and executed either way.
- **FIX (cross-cutting 1):** type-marked references, the observed
  misroute case.
- **COMPRESS (R2, rows clear of the DECIDE; evidence rows wait for Rule
  1 in R5; the `51dfbcc` paragraph is do-not-touch).**

### deep-interview: `skills/deep-interview/SKILL.md`

- **POSITION:** a NATIVE.md row, and the +14.50 measurement stays quotable.
- **FIX (B1):** description follows the body (two to four questions).
- **FIX (B6):** scores cite what settled them; Outcome=3 keeps the
  interview open regardless of sum.
- **FIX (C10):** retry arithmetic reconciled; "you decide" at the
  approval gate defined (restate the riskiest line, ask once for an
  explicit yes).
- **FIX (cross-cutting 1):** type-marked references.
- **COMPRESS (R2):** provenance note relocates; template stays in-file;
  gate do-not-touch.
- **CLOSED (Must 8 + §9 Should 16, verified 2026-08-29):** the approval gate is
  pinned four times across both TSVs; the spec template carries
  `## Files and interfaces` with the named-not-described rule.

### verification-planning: `skills/verification-planning/SKILL.md`

- **POSITION:** a NATIVE.md row; it was checked, and nothing native was found.
- **DO (R3, moved from the ambiguous R0/R5 slot so R4 does not consume
  unbuilt artifacts):** the four instrument designs: the Rule 1
  pressure-test harness (consumed by R5's Phase-4 cuts), the
  seeded-defect ground-truth set, the component-arm designs, and the
  multi-file benchmark task class (criterion 1's missing instrument: a
  task where delegation can pay, its correctness fixture, and
  transcript-based delegation detection, extending `scripts/bench/`).
- **COMPRESS (R3):** the conditional back half (~2,300 chars, zero pins)
  to a conditional sibling; the two abstract-prose merges.
- **FIX (cross-cutting 1):** frontmatter description reference typed.

### simplify: `skills/simplify/SKILL.md` (+ principles.md)

- **POSITION:** the native split, which earns a NATIVE.md row.
- **FIX:** consolidate the does-not-auto-fire disclosure to one place.
- **FIX (cross-cutting 1):** type-marked references.
- **COMPRESS (R2):** the two-scopes/explorer-routing duplicate; evidence
  rows wait for Rule 1 (R5).
- **CLOSED (§9 Should 21–22, verified 2026-08-29):** the declared-public-entrypoint
  check runs first in § *Understand first*, and the introducing-commit rule
  carries both refusals: shallow clone and move commit.

### codemap: `skills/codemap/SKILL.md` (+ scripts/codemap.mjs)

- **FIX (A2):** the script emits the per-directory file list; test
  extended in the same commit.
- **FIX (B4):** frontmatter and body agree: proposes itself, never runs
  without a yes. Recorded beside it: `disable-model-invocation: true`
  is the native key for the road not taken ("on request only"), so the
  ruling is visible and no later pass re-litigates it.
- **FIX (C1):** ancestor maps regenerate only on their own changed
  inputs, or the chain batches into one fixer.
- **FIX (C2):** gitignore handling matches git or prints its divergence.
- **FIX (cross-cutting 1):** type-marked references.
- **COMPRESS (R2):** atlas example, frontmatter restatements; the
  legacy-state note gets a dated deprecation window with its removing
  release named in CHANGELOG; stale-citations evidence waits for Rule 1.
- **CLOSED (§9 Should 17, verified 2026-08-29):** `skills/codemap/SKILL.md` § *Cite
  symbols, never line numbers*, with `omc-slim:review` named as the deliberate
  exception and the reason it is one.

## Hooks: `hooks/`

Every change updates the paired test suite and the mutate runner in the
same commit; "never blocks, always exit 0" stays load-bearing.

- **FIX (A3 + C8, verify-deliverables.mjs), two messages for two
  states:** the current single check conflates them, and one message
  would be false in one state. State 1, no write-family tool use at all:
  "no Edit/Write-family tool use was seen — if the work landed via shell
  or an MCP server, ignore this." State 2, write-family use seen but
  every path outside the project: "the only writes landed outside the
  project (e.g. /tmp)." Path resolution against the project root decides
  which fires; neither accuses.
- **FIX (B9 interplay, verify-deliverables.mjs, not hooks.json):** a
  SubagentStop matcher sees only the agent-type string and cannot know a
  designer ran in Review mode. If the B9 ruling is keep-and-declare, the
  suppression is a heuristic scan of the dispatch prompt in the
  subagent transcript (the payload's `agent_transcript_path` carries
  it) — **heuristic, and documented as such**: this is the one R1 item
  whose false-positive elimination the harness cannot guarantee, and its
  test asserts the heuristic's behaviour, not a guarantee.
- **CLOSED (v0.9.9):** the matcher is pinned to the namespace as
  `^omc-slim:(fixer|designer)$`, `ownAgentName` requires the same prefix, and a
  `--plugin-dir` session presents it (RESEARCH.md:1318). The original item:
  **FIX (C5, hooks.json AND verify-deliverables.mjs):** pin the matcher
  to this plugin's namespace *and* update the `.mjs` last-segment
  normalization (`:218–221`) that deliberately strips any prefix. Two
  layers must agree on what they cover. The fix first checks which
  agent-type string a `--plugin-dir` dev session presents, so the pin
  does not silence the hook in development.
- **FIX (C3, check-output-style.mjs), with self-identification:**
  replace the bare-name exemption with path-based self-ID (the installed
  plugin's path vs this script's own location), so the running self
  stays exempt, while a same-name fork or stale duplicate is reported.
  Dropping the exemption alone would make every healthy install warn
  about itself at startup.
- **FIX (C4):** on deadline expiry, report rivals already found.
- **FIX (cross-cutting 1):** `systemMessage` texts use type-marked
  references.
- **CLOSED (Must 6, verified 2026-08-29):** the two scanning hooks carry an
  in-process deadline (`SCAN_BUDGET_MS`, `BUDGET_MS`), each overridable so a test
  can set 0 and prove it is wired, and each covered by a mutant the suite kills.
  `file-ledger` and `seed-watch-paths` do one bounded read each and carry none.
  What it cannot cover is stated in the file: a blocking read on fd 0, which no
  in-process timer can preempt.

## Standing refusals (decided non-features; triggers observed via the incidents ledger, cross-cutting 8)

- **No mega-merge of frameworks** (part I §7). It reopens on independent
  benchmark evidence reversing the sophistication-vs-results
  correlation.
- **No Stop-as-enforcer / Todo Enforcer** (part II §3, oracle-upheld on spend).
  `decision: "block"` is still refused (oh-my-claudecode #959 / #2542). v0.9.9
  reads Stop for a claim scan and emits `systemMessage` only: on Stop,
  `additionalContext` is a continue (2.1.251), so it is refused with
  `decision: "block"`. The refusal reopens at three ledger-recorded
  idle-abandonment incidents, and only then as a continue.
- **Nothing on the tool-call path** (tool-loop-guard, format gate, LSP
  feedback). It reopens on one ledger-recorded occurrence of the failure
  class, as opt-in only.
- **No per-agent model pinning** (removed in part I's era; B2's tier
  rewrite depends on this staying decided). It reopens if R4's ablations
  show a delegation cost win that tier routing would multiply; the
  mechanism (`model:` frontmatter) is native and one line, so the
  refusal is of the policy, not the capability.
- **No automatic prompt compression** (LLMLingua class). It reopens on a
  published application to authored agent prompts with behaviour evals.
- **Impossibility-class refusals, recorded so they are not re-litigated**
  (part II §3): aider watch mode (expired: `FileChanged` shipped in 2.1.251 and
  is consumed in v0.9.9 as a 0-token ledger),
  Cline Memory Bank / beads (covered by CC auto-memory and the progress
  file, both prior refusals, per part II §3), Cursor glob rules / goose
  session-to-recipe (need attachment/transcript machinery a plugin does
  not get). Each reopens only if the platform ships the missing
  capability.
- **No approval delegation to a reviewer model** (Codex `auto_review`, and the
  same thing built on `PreToolUse` now that a hook's `ask` floors the decision at
  a prompt). Refused on three grounds, in order of weight. It **inverts the one
  thing this project has measured**: the +14.50 result is not "a gate exists", it
  is *a human stops and decides*, and auto-review's entire purpose is to remove
  the human from that position. It is **on the tool-call path**, not a
  borderline case like `Stop`, the definitional one. And it is **unbounded spend
  of the class already refused**, a reviewer model per gated call, forever.
  Reopens if Claude Code ships a first-party approval-delegation surface with a
  bounded cost model, at which point the third ground dies and the first two get
  re-argued on their own merits. The portable residue was taken: a denied action
  is information, so take a different path or stop — never re-issue the same call.
- **No testimonials, star charts, unverifiable multipliers, or
  adjectives the evidence does not force**: no trigger; identity.
- **Standing-rule delivery** ships only with a measured violation-rate
  delta; the trigger is that measurement existing.
