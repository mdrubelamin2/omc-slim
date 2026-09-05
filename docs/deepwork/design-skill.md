# deepwork: the design skill

Progress file. Read this before continuing; it is the handover.

## Objective

Restore a design owner to omc-slim as one skill at `skills/design/`, carrying a numeric craft standard, a dated anti-default calibration list, domain playbooks, two modes (Replicate and Originate), and a deterministic render audit whose numbers come from a script rather than from the model's eyes.

## Shape, decided and closed

One skill. No new agent. The verdict phase is a briefed general-purpose dispatch, following the precedent at `skills/review/checklists.md:199`. Do not re-open this.

Two adversarial gates ran before the map was written. Both killed `agents/critic.md`, on independent grounds: it duplicates the `checklists.md:199` pattern, and a near-chance visual judge occupying the sign-off slot is worse than no judge.

## Confirmed findings

- Always-on context counts only the output-style body plus each agent and skill `description`. Component bodies are free until invoked. Source: `scripts/measure-context.sh`.
- `scripts/check-coverage.sh:792` forbids naming any third-party component in a shipped prompt. The regex matches `word:word`, backticks stripped first. The skill must be self-contained and must describe a class of tool rather than a vendor.
- `scripts/check-coverage.sh:782` requires every non-entry component to be named by another component, or added to `ENTRY_POINTS` with a written reason.
- `scripts/check-prose.sh` scope excludes skill companion files. `craft.md`, `defaults.md` and `domains.md` are not gated by it. Measured by hand instead: 0 em-dashes in all three, threshold 10.0 per 1k words.
- `CHANGELOG.md:932` and `docs/RELEASE-READINESS.md:56` record that deleting the old designer's Review mode left a critique-only visual audit with no owner anywhere in the plugin. It was fixed once by giving designer the job back, then v0.10.0 deleted designer entirely. `skills/review/checklists.md:146` still reads "Judgement calls need a designer or the user", which is now a dangling pointer. Stage 4 closes it.
- The old `agents/designer.md` is recoverable at `git show 07732ef^:agents/designer.md`, 115 lines. Its numeric content is the seed of `craft.md`.
- Research says a multimodal model is a smoke detector, not a measuring instrument. UI-Lens reports F1 near 20% on text overflow and near chance on element boundaries. The same research says a reference image plus a fixed human-written taxonomy moves accuracy dramatically. Both facts are load-bearing on the design of `critic.md`.

## Dead ends, so nobody walks them again

- A separate `agents/critic.md` read-only visual judge. Rejected twice. Only frontmatter can deny `Edit`, which is the one real argument for it; the answer is that every number originates in the script, so the dispatched agent has nothing to forge.
- Leaning on any installed design skill by name. Blocked by `check-coverage.sh:792`.
- Gating on APCA. It is not in any ratified requirement.

## Stage status

- Stage 1, the craft standard: **done, revised once, awaiting user gate.** `craft.md`, `defaults.md`, `domains.md` written. Check passed: 0 em-dashes across all three, no banned style words, four cross-source contradictions each resolved to exactly one value, and `check-coverage.sh` green at 19/19 prompt files naming no third-party component (was 16 before these files).
- Stage 2, the deterministic audit: **done.** `scripts/probe.js` (31 checks, three tiers), `scripts/audit.mjs` (headless Chrome over the DevTools protocol, zero dependencies, Node 22 for global WebSocket), two fixtures, `scripts/audit.test.mjs` at 9 of 9 including a mutation test. Wired into `.github/workflows/gates.yml` and `scripts/check-coverage.sh`, pinned to node because bun's `node:test` does not auto-run.
- Stage 3, the skill body: **done.** `SKILL.md` 80 lines, `replicate.md`, `critic.md`.
- Stage 4, registry and docs: **done.** 32 COVERAGE rows, 6 REINFORCEMENT rows, a `design` origin classified internal, one eval case with three graders, the output-style roster line, `checklists.md` repointed, CHANGELOG, v0.13.0, README.

## Gates at release

coverage 315/315 · reinforcement 103/103 · prose 45/45 · evals 7/7 · shell 19/19 · hooks 163/163 with 80/80 mutants killed · codemap 19/19 · base 29/29 · statusline 10/10 · audit 9/9. Always-on 2,467 to 2,590 real tokens.

## Two gate holes found by using the gates

- `check-coverage.sh` reported "3/3 plugin-internal paths resolve" while `floor.md` linked to a script that did not exist. Relative links inside companion files were never checked. Found by hand; the check itself is still not extended.
- `check-prose.sh` derived a scope excluding every companion file, so `checklists.md`, `principles.md` and `procedure.md` had shipped ungated. Fixed: the gate now reads `skills/*/*.md` and covers 45 documents instead of 32.

## Design decisions taken so far

- Measure resolved to 45 to 75 characters, target 66.
- Border and shadow: forbidden together for an opaque neutral border, permitted for a hairline border tinted to the surface.
- WCAG 2 gates, APCA advises, both are reported.
- Transitions with a named curve for state change, springs only where gesture velocity is carried.
- `defaults.md` carries an explicit calibration date and an instruction to treat every value as a hypothesis after six months. This answers the rot objection raised by the second adversarial gate against `skills/review/checklists.md:160`, which ships an undated tell list today.

## The stage 1 revision, and why

The first draft of `craft.md` was 2,519 words of flat prescription. Every value was stated as a rule, so ten installs would have produced the same measure, scale, radius and curve. A house style repeated across every install is a fingerprint, which is precisely what `defaults.md` exists to catch. The file argued against itself.

Rewritten to 1,683 words around a hard split:

- **The floor** at `craft.md:18`. Correctness. Accessibility, the four hard motion failures, contrast gating, target size, states shipped whole, concentric radii. Never varies. The audit script fails on it.
- **The calibration** at `craft.md:50`. Starting positions, each framed as a value you are expected to leave with a reason. Opens with "Arriving at every one of these values unchanged is the tell."

Precedence added at `craft.md:9`, four ranks: accessibility floor, then what the project already does, then the brief, then this file. Rank 2 carries "this file has no opinion that beats it", and `craft.md:16` adds "a pattern the project blessed is not a finding".

The nested-radius conflict is resolved by deleting the prescription rather than picking a side. No radius range is given at all now. The floor states the relationship (`inner + gap = outer`) and says the outer value is chosen while the inner derives from it.

## Open questions

- Whether `skills/review/checklists.md:160`'s undated tell list should be deleted in favour of pointing at `defaults.md`, or left in place. Leaning toward pointing, decided in stage 4.
- Stage 4 must update four worded rosters ("four agents, six skills, one hook"), including the GitHub repository description checked from outside the repo, and the published always-on token figure quoted in README and the manifest. Both surfaced from a green `check-coverage.sh` run at the end of stage 1.


## The cost contract

Seven bounds. Each is checkable, and the merge from research is filtered through them rather than shaped by what the research offers.

1. **Always-on: one skill description and one roster line in the output style. Nothing else.** No new agent, so no second description. Measured by `scripts/measure-context.sh`; the delta is stated in the release notes and in the README figure.
2. **`SKILL.md` at most 150 lines.** House sizes are 63, 114, 152, 184, 186, 197. This sits inside them, not above them.
3. **Companion files load on a branch, never by default.** `SKILL.md` names which file each branch reads. A run that only originates never opens the replication file; a run that only replicates never opens the domain playbooks. No instruction anywhere reads all of them.
4. **No single run reads more than the review skill's normal path.** The 2,300-word figure originally written here was a guess and it was wrong. Measured peers: a review run reads 6,198 words (SKILL 3,309 + checklists 2,889), deepwork 4,183, simplify 3,202. Design measures at 2,672 companion words on its heaviest path plus a capped SKILL.md, roughly 3,872, which sits between simplify and deepwork. Branch paths are far cheaper: critique 1,512, replicate 1,122.

5. **The verify loop is capped at 2 rounds, 3 only while a Critical is open.** This is the review skill's existing per-gate re-review budget, reused rather than reinvented. Open-ended self-QA is the documented failure mode of every iterative design tool.
6. **The audit script runs at a checkpoint, not per edit.** One run per surface reaching a reviewable state.
7. **Zero restatement of the output style.** The style already carries the evidence rule, the zero-comment rule, ships-whole, the register and the blocked-reporting contract. A subagent brief may restate what its lane needs, because subagents do not inherit the style. `SKILL.md` may not.

The contradiction sweep runs at the stage 4 gate. A rule in this skill that contradicts the output style, `skills/review/checklists.md`, or the project being worked on is a defect, and precedence rank 2 in `craft.md` decides the third case: the project wins.

## The merge, from three research lanes

Two defects found in shipped work and patched:
- `craft.md:22` carried only the 24x24 WCAG floor and would have passed a 24px tap target on a phone. Now states 24 legal, 44 on touch.
- `craft.md:84` said bounce defaults to zero, contradicting a shipped platform drawer spring at damping 0.8. Now: zero by default, earned only where the gesture carried momentum, then 0.1 to 0.3.

`defaults.md` restructured from a flat list into two halves, because the flat list was the perishable half of the work:
- **What does not decay** (`defaults.md:9`) gates. Craft: no real images, no cross-section coherence, micro-details that do not work, colour that does not mean what it says, contrast failing in dark mode, uniform weight, tracking wrong at display sizes, copy with no checkable fact, invented numbers.
- **What is dated** (`defaults.md:31`) only advises. The current look list, carrying a measured 5 to 10 percent false-positive rate.

Six floor items added to `craft.md`, all correctness: animate from the presentation value, feedback on pointer-down, `min-width: 0` on flex and grid children, overlays escaping a clipping ancestor, hover behind a hover-capable media query, and preserving user input on a validation error.

Cut on evidence rather than taste: bento grid (4 of 3,033 comments), glassmorphism (7), and mesh/blob/aurora, which the source study's own adversarial pass rejected as a keyword artefact. Inter removed from the absolute list; it is actively contested and the "used because nothing else was considered" framing already covers it.

## Committed for stage 3, from the extraction lane

- **The adversarial self-diff**, the strongest pattern found: after the plan, simulate the generic output for a similar brief and revise whatever matches. Converts originality into a step with a falsifiable result.
- **Two-tier severity**: advisory findings report separately, never affect exit codes. This is what lets a rule with real false-positive risk ship at all.
- **Two error-level gates before any judgement**: an uncaught script error, and more than 30 percent of page text still hidden after reveal handlers ran. An audit on a page whose JS threw is measuring nothing.
- **Skip rather than guess**: unresolvable `var()`, exotic colour spaces and gradient-clipped text skip instead of firing.
- **Bounded passes, not a loop**: build fully, one batched inspection round, fix in one batch, at most one confirming round, stop. The reviewer's findings are the only list, never a re-opened hunt.
- **Audit checkability, for scoping stage 2**: of 59 prior-art rules, roughly 25 are reachable from `getComputedStyle` alone, about 22 need DOM traversal or text nodes, and 10 need CSS source text, reachable at runtime only for same-origin sheets.

## Rulings

- Stage 1 written directly rather than delegated. The craft standard reconciles roughly 250k tokens of research held in one context, and the four contradictions can only be settled by someone holding every source at once. Cost: slower than a fan-out.
- No radius range is prescribed anywhere. Concentricity is geometry and sits in the floor; the absolute value is the project's or the designer's. Cost: a designer with no opinion gets no starting number here.

## Committed for stage 3, gated by the user at stage 1

Files, and which branch opens each:

- `floor.md` (712) correctness, read on every run including a critique.
- `calibration.md` (980) starting values, read when authoring; a replication run takes values from the source.
- `defaults.md` (800) the gating craft half and the dated advisory half.
- `domains.md` (728) one section only, matched to the brief.
- `gesture.md` (463) only when the work involves drag, swipe, sheets, sliders or momentum.

`craft.md` was split into `floor.md` and `calibration.md` because a critique run needs the floor and never the starting values, and a replication run needs neither set of defaults. The split makes branch-loading real rather than nominal.

Duplication cut where one fact had two homes: missing interaction states, contrast failure, uniform weight and spacing, and one tracking value across every size all left `defaults.md` and are gated where they are measured.

**The skill must not go stale, and that is an architecture requirement, not an intention.** `floor.md` now opens on precedence rank 0: what you can verify right now beats every file in this skill, and a written design system in the repository outranks the skill entirely. Each file carries a date and the instruction to treat its specifics as claims to re-verify after six months. `floor.md` carries an explicit licence to disagree with the skill in writing. `domains.md` states that its five categories are worked examples rather than a closed list, and gives the method for deriving a sixth. The one rule with no override is the evidence rule.

`SKILL.md` opens with a survey step, in three parts, naming nothing:

1. Adopt what the project already uses: any written design documentation first, then the token file, scale, theme config, class-merge and variant helpers, component library, icon set, motion library, and the conventions of the nearest existing screen. A component that exists is used, never re-implemented. A design system the project documents outranks every value this skill carries.
2. Survey the session's own capabilities across both scopes, the project's and the user's. Read descriptions rather than names; `ToolSearch` reaches deferred tools. Route a slice to a specialist that covers it better than a generic lane, and say so in the report.
3. Name nothing. A framework, library or specialist named in a shipped prompt is a dead pointer on a machine without it and fails silently. `scripts/check-coverage.sh:792` enforces this.

## Next first action

Run `bash scripts/check-coverage.sh` to confirm the three new companion files break no existing assertion, then begin stage 2 by writing `skills/design/fixtures/broken.html` with one seeded instance of each defect class the audit must catch.
