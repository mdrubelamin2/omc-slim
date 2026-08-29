# Viability report — 2026-08-28

Part of [omc-slim](../README.md). Requested as an all-around brutal assessment:
adoption viability, competitive position, missing scope, hidden failure modes,
the "AI slop" question, and the bar the plugin must clear to matter.

Method: full repository read, an independent architecture review run in a clean
context, and three sourced research passes over the external ecosystem
(2026-08-28). Every external claim below carries its source. Where a claim is
opinion it says JUDGEMENT.

This report deliberately does not repeat
[RESEARCH-2026-08-26.md](./RESEARCH-2026-08-26.md) §9's action list. It builds
on it and adds what that document could not see: the market, the distribution
problem, and the contradiction between this plugin's evidence and its identity.

---

## Corrections, 2026-08-29

Three claims in this report did not survive a read of the diffs they rest on.
Recorded here rather than edited away, because §1b's own caveat says its
upstream-drift claims are commit-message-level, and this is what that caveat
cost.

1. **"~90 commits behind" is not reproducible.** Measured against
   `oh-my-opencode-slim` on 2026-08-29: 163 commits all, 118 non-merge, 58
   first-parent. No counting method yields ~90.
2. **"The reversal went further after that document closed" is false.**
   `src/skills/deepwork/SKILL.md` has exactly one commit since the pin —
   `80f3845`, 2026-08-14 — which is twelve days *before* RESEARCH-2026-08-26
   closed. That document was incomplete about a single commit, not outrun by
   later ones. It did miss two deletions in that commit, which
   `PROVENANCE.md`'s sweep section now records.
3. **`task_nudge` does not exist.** The supervision tools are `task_status`,
   `task_result`, `task_cancel`, `task_message` and `task_revive`, enumerated in
   the loop guard's own exempt list.

The guards §1b attributes are correctly placed — both belong to
`oh-my-opencode-slim`, not to `oh-my-claudecode`, and both were confirmed in the
diff: `tool-loop-guard` (issue #1071) and the duplicate-spawn block (#1070).

---

## 0. Verdict

**Not viable as "the orchestrator layer people adopt", on the repository's own
evidence. Viable — and differentiated — as the ecosystem's only honestly
measured discipline layer, if three things change: the delegation claim gets
tested on work where delegation can pay, the native-equivalents question gets
answered in writing, and inertness becomes visible at runtime.**

The independent review put it in one sentence: the two headline wins — 18%
cheaper than plain, and the most consistent deliverable of three arms
([BENCHMARK.md](./BENCHMARK.md)) — were both produced with **zero delegation**,
so they defend a *prompt*, not an *orchestrator*. The product's name, README
and architecture all say orchestrator. The evidence file says prompt. That
contradiction is the whole report in miniature; everything below is either a
consequence of it or a path out of it.

The second half of the verdict matters as much. The external research pass
found **no published head-to-head benchmark of any orchestrator plugin against
stock Claude Code, anywhere** — every performance claim in the ecosystem is
vendor-reported or anecdotal, including claude-flow's at ~70k stars
([rywalker.com/research/claude-flow](https://rywalker.com/research/claude-flow)
notes the absence of "quotable firsthand production reports"). omc-slim is the
only project in the category with a committed, re-runnable harness and a
published negative result about itself. In a market drowning in slop, that is
not a nice-to-have. It is the moat. It is also currently the *only* moat.

---

## 1. The market, measured (2026-08-28, GitHub API)

| Project | Stars | Mechanism | Relevance |
|---|---|---|---|
| mattpocock/skills | 238,988 | 21 small composable skills (caveman, wait-what, grill-me, tdd) | The shape that wins: tiny, lazy-loaded, one job each |
| anthropics/claude-code | 143,196 | The platform itself; first-party plugins incl. code-review, frontend-design | Ships native competitors to `review`, `simplify`, `explorer` |
| ponytail (DietrichGebert) | 113,909 | One skill: "lazy senior dev", ~6x less code | Went viral in 6 days as a single skill |
| claude-flow → Ruflo | 69,557 | Swarm orchestration, MCP, "84.8% SWE-bench" (self-reported) | The maximalist pole; also the slop reference point |
| awesome-claude-code | 53,094 | Curated list | The discovery channel |
| BMAD-METHOD | 52,387 | Agile role personas, tool-agnostic | Workflow-discipline competitor |
| oh-my-claudecode | 38,822 | 19 agents, execution modes, tmux workers | The namesake; philosophical opposite |
| Compound Engineering (Every) | 24,606 | ~50 agents / ~38 skills, knowledge capture, 14 hosts | The "learning loop" competitor |
| SuperClaude | 23,844 | 27 commands, ~19 personas, 43 skills | The bloat cautionary tale (its own tracker: ~8k-token framework could be ~3.2k) |
| Agent OS | 5,341 | Spec-driven, team standards | Stalling (last push 2026-05-05) |
| ELI5 | 602 | One 321-byte skill | Blog coverage ≠ adoption |
| **omc-slim** | **—** | 6 agents, 6 skills, 1 style, 2 advisory hooks | No adoption signal yet |

Sources and per-project detail: research pass of 2026-08-28; star counts pulled
live from the GitHub API. Full citations in the session that produced this
report; the load-bearing ones are inlined below.

Three structural facts fall out of the table:

1. **The distribution winners are small.** The largest repo in the entire
   ecosystem is 21 tiny skills. The second viral hit is one skill. Simon
   Willison's articulation of why is the canonical one: the winning shape costs
   "a few dozen extra tokens" until invoked
   ([simonwillison.net, 2025-10-16](https://simonwillison.net/2025/Oct/16/claude-skills/)).
   Adoption energy in mid-2026 flows toward *removal* — the "delete your
   CLAUDE.md" wave, token-reduction repos — not toward bigger harnesses.
2. **The orchestration platforms went native.** Codex shipped a plugin
   marketplace with hooks (2026-03); Cursor 2.4/3 shipped subagents, a skills
   marketplace and parallel agent windows; Antigravity 2.0 ships an Agent
   Manager with 16 specialized agents. A CC plugin's value is no longer "adds
   subagents" — everyone has subagents. It is opinionated workflow discipline.
   That is omc-slim's actual pitch, so the platform shift *helps* it — but only
   if the discipline is provably worth its cost.
3. **The name is a liability. JUDGEMENT.** "omc-slim" invites comparison with a
   38.8k-star project whose philosophy this plugin explicitly rejects, and
   reads as "a diet version of omc" rather than "the measured alternative to
   omc". The credits honestly say the lineage is oh-my-**opencode**-slim, but
   nobody reads credits before forming the association.

Attribution correction for the record, since the request that produced this
report mis-stated it: **caveman** and **wait-what** are Matt Pocock
(mattpocock/skills); **ponytail** is DietrichGebert; **eli5** is Andrew Ou
(DreambigOu/ELI5). None of the four is "matt padrock".

---

## 1b. The adjacent ecosystems: pi, OpenCode, and the oh-my-* lineage

Surveyed 2026-08-28, repo data read via the GitHub API, npm figures from the
npm downloads API. This section exists because omc-slim's lineage runs through
OpenCode, and because both adjacent ecosystems have already run experiments
this plugin has only planned.

### The lineage has moved, and the pin is stale

- **oh-my-opencode-slim** (alvinunreal) — the direct ancestor — is at v2.2.17,
  8,460 stars, pushed yesterday. omc-slim's `UPSTREAM.tsv` pin (`6faaed28`)
  dates to 2026-08-13; **~90 commits have landed since**. The load-bearing
  drift:
  - **The deepwork doctrine was simplified upstream one day after the pin** —
    research logging deleted, review gates consolidated (2026-08-14). omc-slim
    carries structure its own ancestor judged dead weight.
    RESEARCH-2026-08-26 §3.2 caught the start of this; the reversal went
    further after that document closed. Adopt-or-diverge is now an explicit
    decision to make, not a sync to run.
  - **Orchestrator supervision became first-class**: `task_status` /
    `task_nudge` tools, a duplicate-spawn guard for unreconciled jobs (#1070),
    and a `tool-loop-guard` hook that breaks repeated identical tool calls
    (#1071). Upstream treats "the orchestrator loses track of a child" and
    "the agent loops silently" as named failure classes. omc-slim has neither
    guard.
  - Distribution moved: upstream integrated with the herdr marketplace
    (herdrdev/herdr, 32.9k stars) — a channel omc-slim has no equivalent of.
- **oh-my-opencode** is now **oh-my-openagent** (code-yeongyu, 68,445 stars,
  npm 22k dl/wk) and pivoted to a "Multi-Harness Agent OS" targeting OpenCode,
  Codex, pi and its own runtime. The originator of the omc idea bet on
  harness-independence — which validates omc-slim's native-first port thesis
  from the opposite direction: both parties concluded the pattern must be
  rebuilt per harness, not ported literally.
- **oh-my-pi** (can1357, 27,909 stars, 121k dl/wk) is **not an extension
  layer — it is a hard fork of pi itself** with an ~80k-line Rust core. The
  actual "oh-my-zsh for pi" is **monopi** (ifiokjr), at 148 stars. That gap is
  a finding in itself: in an ecosystem with good native package UX
  (`pi install npm:...`), the curated-bundle layer barely registers while
  individual packages thrive. JUDGEMENT: the same force operates on Claude
  Code as its marketplace matures — it erodes bundles and rewards components
  that stand alone.

### Census, one line each

- **pi** (earendil-works/pi, ex badlogic): 98,279 stars, npm 2.41M dl/wk. No
  official registry; `pi install npm:|git:|path` convention.
  awesome-pi.site lists **~7,431 extensions** (site's own count). Top
  downloads are infrastructure, not orchestration: pi-mcp-adapter (454k/mo),
  pi-web-access (292k/mo). Orchestrator-class: nicobailon/pi-subagents
  (3,336 stars) — zero-config natural-language delegation, the ecosystem's
  omc-slim-shaped thing, onboarding-first where omc-slim is evidence-first.
- **OpenCode** (anomalyco/opencode, ex sst): npm 3.16M dl/wk. Plugins are npm
  packages in `opencode.json`; hook surface includes `tool.execute.before/
  after` — a per-tool-call interception CC plugins also have but omc-slim
  deliberately refuses. awesome-opencode: ~223 entries, ~136 plugins.
  Orchestrator-class beyond the lineage: swarm-tools (733), opencode-workspace
  (578), ZaxbyHub/opencode-swarm (455 — "verification-gated swarm", the
  closest philosophical cousin to omc-slim's evidence gates).

### Stealable mechanisms (mechanism → problem → evidence)

1. **tool-loop-guard** — break N identical tool calls with identical output,
   exempt polling tools, log the intervention → silent token-burning retry
   loops → shipped upstream 2026-08-23 (#1071). Portable as a CC hook; note it
   would be omc-slim's first tool-call-path component, which contradicts the
   "nothing injects per tool call" pledge — if adopted, as an *opt-in*.
2. **Duplicate-spawn guard** — refuse to re-dispatch a task whose last result
   was never read → orchestrator redoing finished work → upstream #1070.
   Adoptable as orchestrator prose + a reconciliation rule, no hook needed.
3. **Typed subagent yields** — schema-validated return objects instead of
   prose contracts → lossy handoffs → oh-my-pi's core mechanism. omc-slim's
   output contracts (explorer/fixer/librarian) are the prose version; a JSON
   schema in the contract is the halfway step CC allows.
4. **Advisor pattern** — a second, cheaper model reviews each turn and injects
   concerns → the doer rushing its own gate → oh-my-pi §06. CC-adoptable as a
   review lane; already philosophically present in "the pass that produced a
   change cannot be the pass that clears it".
5. **Single binding verdict line on review** — P0–P3 plus one ship/no-ship
   sentence → findings without a decision → oh-my-pi §10. `review` has
   severity and confidence; the one-line verdict is the missing piece and
   costs ~15 tokens.
6. **Post-mutation format gate** — formatter as a gate after mutating calls →
   style drift found only at review → oh-my-openagent beta-23. Same
   tool-call-path caveat as item 1.

Caveats: drift analysis is commit-message-level — read the actual upstream
`src/hooks/` implementations before porting anything; awesome-pi.site's count
is the site's own; oh-my-openagent's "Anthropic blocked OpenCode because of
us" is its own unverified claim.

---

## 2. Does the value proposition survive its own evidence?

Findings from the independent review, verified against the files:

1. **HIGH — The central bet has zero supporting evidence, by the repo's own
   admission.** BENCHMARK.md: "Nothing delegated, so the central claim is still
   untested" and "The 18% saving therefore comes from the orchestrator prompt,
   not from tier routing." What survives: an 18% cheaper, markedly more
   consistent single-file deliverable, and the deep-interview approval gate
   (+14.50 points in external measurement) — which belongs to *stopping*, not
   to delegation.
2. **HIGH — LIMITATIONS.md contradicts its own table.** The summary claim
   "close to plain cost, with **materially more verification**" sits two pages
   below a table showing 21 tests against plain's 39, and BENCHMARK.md's own
   "it writes fewer tests than plain, not more." The one sentence positioned as
   the defensible claim is falsified by the same document. Fix the sentence;
   the honest claim is *cheaper, smaller, more consistent* — not *more
   verified*.
3. **MED — The repo's own cited evidence argues against its category.**
   LIMITATIONS.md already concludes: sophistication correlates negatively with
   results, omc-slim is the most expensive row in its own comparison table, and
   "the right response is to shrink toward Karpathy." RESEARCH-2026-08-26 §1.3
   adds the Nature MI result: centralized-orchestrator architectures score
   −2.6% against a single agent on SWE-bench for frontier models. The honest
   reframe is already written in that document: the specialists are **context
   compression and independent judgement, not extra brains**. The README has
   not caught up with that framing, and should.

None of this says the plugin is worthless. It says the plugin's *identity* is
ahead of its *evidence*, and in this ecosystem — see §5 — that is precisely the
sin the audience punishes hardest.

---

## 3. Silent failure modes, ranked (likelihood × damage)

The worst property a tool can have is failing without a symptom. omc-slim has
four ways to be silently inert, and the top two need no second plugin and no
long session:

1. **The AgentTool gate.** Claude Code ships "do not call the AgentTool unless
   the user requested it" by default for Opus 5 (README.md already documents
   this; independently reported at
   [r/ClaudeCode](https://www.reddit.com/r/ClaudeCode/comments/1v6y5q2/) and HN
   49056022). On a default flagship install, **the entire delegation mechanism
   is inert out of the box**, and the workaround is a per-session incantation.
   Near-certain likelihood; total damage.
2. **The output-style slot.** One forced style, winner picked by plugin load
   order, loser logged where nobody reads. The `SessionStart` hook warns about
   the *condition*, not the *outcome* — it cannot see which style won. A user
   can run for weeks with every component loaded and nothing orchestrating.
3. **Platform risk on the same surface: output styles have already been
   deprecated once.** CC v2.0.30 deprecated them, restored ~4 days later after
   pushback; `/output-style` was then removed in v2.1.91
   ([changelog](https://code.claude.com/docs/en/changelog),
   [claude-blog.setec.rs](https://claude-blog.setec.rs/blog/output-styles-underrated-feature)).
   The plugin's core mechanism sits on a surface Anthropic has demonstrably
   considered removing. This belongs in LIMITATIONS.md and currently is not
   there. (`keep-coding-instructions: true` is set — that foot-gun, at least,
   is already avoided.)
4. **Compaction eviction.** The output style survives (re-sent every turn — a
   real structural advantage over CLAUDE.md layers). Invoked skill bodies,
   delegation briefs and mid-session corrections are in the measured
   ~30%-violation class after compaction, and twelve components share a
   25,000-token re-attach budget. Long sessions shed exactly the discipline the
   plugin sells, and nothing re-asserts it.

Plus the standing one the repo already names: everything except
`disallowedTools`, the style flag and the hook matcher is prose, and holds
exactly as well as a prompt holds. Ranked lowest because it degrades gracefully
where the four above fail totally.

**Loopholes found worth naming as such:**

- A user cannot distinguish "the orchestrator worked" from "I paid ~4,075
  static tokens for nothing" — delegation is no longer visible in `modelUsage`
  since per-agent model pinning was removed, and no runtime signal replaces it.
- Two of six skills (`deepwork`, `simplify`) never fire on natural language;
  out of the box they are slash-commands with extra steps, and the fix for the
  flagship one is a paragraph the plugin cannot ship (a `CLAUDE.md` edit).
- The eval suite has never executed; the behavioural smoke suite dry-runs by
  default; the benchmark describes a build that no longer ships. All three are
  disclosed — disclosure is the house virtue — but disclosed inertness is
  still inertness.

---

## 4. Gaps not already in LIMITATIONS.md

1. **HIGH — No stance on native equivalents.** Plain Claude Code now carries
   built-in `code-review` and `simplify` skills and an Explore agent; the
   benchmark's own baseline note says plain got stronger partly *because* of
   them. omc-slim ships competing `review`, `simplify` (which never
   auto-fires) and `explorer`, with no comparison, no deprecation criteria, no
   migration path. This is the existential adoption question — "why install
   yours?" — and no document answers it. The baseline improves faster than the
   layer (RESEARCH-2026-08-26 §4.6); a plugin with no shrink-plan against the
   baseline is a wasting asset.
2. **MED — No observability of orchestration.** Nothing tells the user what
   the orchestrator actually did this session: what was delegated, to whom,
   what it cost, what the contract was. Every silent failure in §3 shares this
   root. The cheapest fix is a first-response self-identification convention in
   the style; the fuller fix is a session-end delegation summary.
3. **MED — No standing-rule delivery, which is the exact itch the user request
   names.** The request behind this report asks for a system where nobody has
   to "remind and prompt LLM models whenever it hallucinates [or] misbehaves".
   LIMITATIONS.md already concedes omc-slim has no re-assertion mechanism and
   points at `CLAUDE.md`. Between "per-message injection hook" (rejected, with
   reasons) and "nothing" there is unexplored ground: a session-start
   recall of durable corrections, or a compaction-aware re-brief. This is the
   single most user-visible gap between the ambition and the artefact — and
   also the place where over-promising would be easiest and most punished.
   Whatever ships here must carry a measured violation-rate delta, or not ship.
4. **MED — No team story.** Install is per-user; the deepwork fix is a
   per-user file edit; nothing documents project-level pinning, versioning
   across a team, or repo-committed configuration.
5. **LOW — CI / non-interactive use undocumented.** `claude -p` with the style
   active, `review` as a CI gate — untested, unmentioned. This is also where
   an honest measured layer could shine, because CI is where evidence gates
   are native.
6. **LOW — Windows unmentioned.** Runtime hooks are Node and portable; every
   gate and bench script is bash/zsh. Contributor-side only, but unstated.

---

## 5. What the audience punishes, and what it rewards

From the sourced complaint corpus (all URLs in the research pass):

**Punished:**
- Token blowup: Anthropic's own number is ~15x tokens for multi-agent, viable
  only for high-value tasks
  ([anthropic.com/engineering](https://www.anthropic.com/engineering/built-multi-agent-research-system)).
  HN: "It consumed 35k tokens and then told me the thing I wanted was a
  checkbox" (item 47744670). "The actual code delta is smaller than the
  necessary prompt to convince the bot" (item 48565102).
- Harness skepticism: "I do not think the current models need as much harness"
  (top-voted r/ClaudeCode on Superpowers, June 2026, relayed). "I tried claude
  flow and some other orchestrators but they produced garbage" (HN 45387723).
- Slop markers, specifically: vendor multipliers with no independent evidence
  (claude-flow's "352x faster"), emoji-header walls, ten-badge rows,
  "production-ready" on alpha code, giant feature matrices. Canonical
  maintainer account: Stenberg's "Death by a thousand slops" — curl ended its
  bug bounty over it.

**Rewarded:**
- Small surface, one job, lazy-loaded, honest docs (Willison; the entire top of
  the star table in §1).
- Receipts. The strongest practitioner data points of 2026 are people who
  *measured and deleted* — Nisi's −95% skills with a commit hash, Wu's 124
  never-invoked skills, Cotellese's contradiction audit
  (RESEARCH-2026-08-26 §11). "Trust is a pass rate, a hash, a delta score. Not
  a feeling."

omc-slim's docs are already on the right side of every line above. The README
quotes bases, publishes reversals, and calls its own benchmark a demonstration.
**JUDGEMENT: the risk is not slop; it is the opposite failure — a wall of
hedged measurement so dense that a prospective user cannot find the one
sentence that says what the thing does for them.** The current README leads
with a token-counting methodology dispute in paragraph two. Honesty is the
moat; legibility is the gate fee. Both are needed, and only one is paid.

---

## 6. The "humanized, human-reviewed" question

What makes a tool read as human-made is not register — it is *evidence of use*.
Concretely, ranked by cost-effectiveness:

1. **Dogfooding receipts.** This repository was visibly built under its own
   plugin (the deepwork logs, the audit trail). Publish one real session
   transcript per release — what was delegated, what it cost, what failed.
   No competitor does this. It is the cheapest anti-slop artefact that exists.
2. **A maintained "what broke this month" note.** MAINTAINERS.md already is
   this; surface one line of it per release in the CHANGELOG. Scar tissue reads
   as human because it is.
3. **The ablation, when `plugin eval` access arrives.** A with/without delta on
   the committed suite is the first independent-style number in the category
   (§0 — nobody has one). One honest small number beats every feature matrix
   in §1's table.
4. **Human review as a stated gate, honestly scoped.** Do not claim "every
   release human-reviewed" as marketing. State what is true: every adopted
   rule pinned to provenance, every reversal published. That is already more
   review than the 70k-star end of the table performs.
5. **What not to do:** testimonial sections, star-history charts, "loved by
   developers", AI-generated hero images, and any adjective the evidence does
   not force. The audience in §5 has learned to read all of these as slop.

---

## 7. The mega-merge idea, rejected

The request asks for "the merged and combined version of all available agents,
skills, plugins, orchestrators available for claude code, codex, cursor,
antigravity and more." The evidence answer is no, and it is one of the
best-supported answers in this report:

- Sophistication correlates negatively with results across the one independent
  benchmark series that exists (LIMITATIONS.md's own table).
- Hand-adding authored sub-agents *lowered* scores in BOAD (49.8 → 47.4);
  optimal sub-agent count measured at two.
- The two largest personal skill-libraries audited in 2026 found 124 of 174
  skills never invoked, and active *contradictions* shipping as instructions —
  "a fixed instruction competing with the model's own judgment, and it wins."
- The most mature maximalist orchestrator (Gas Town) was destroyed by a point
  release; its author's own words. Exposure to a model release scales with how
  much of the layer is load-bearing.
- Stacked instructions collapse compliance through *conflict*, not count —
  and a merge of N frameworks is a conflict generator by construction.

What the request is actually reaching for — one layer that quietly does the
right thing without reminders — is served by the opposite move: fewer,
non-contradictory, individually measured components, plus adoption of single
*mechanisms* (not frameworks) where they carry evidence, which is exactly what
PROVENANCE.md already practices. The merged-everything plugin is the product
shape that the last eighteen months of receipts most decisively killed.
JUDGEMENT, but barely — nearly every clause above is a citation.

---

## 8. The bar: checkpoints a release must clear to claim its own name

The repository already runs presence, reinforcement, eval-structure and shell
gates. Those keep the text honest. The following keep the *product* honest —
each phrased so it can fail:

1. **Delegation pays, measured.** On at least one multi-file task class, the
   plugin arm delegates (verified from transcript, not `modelUsage`) and beats
   plain on cost or wall-clock at equal correctness, n≥3, non-overlapping
   spreads. Until this passes, the README may not use the word "orchestrator"
   in a sentence that implies benefit. This is the release gate that decides
   whether the product is what its name says.
2. **Out-of-box liveness.** A fresh default install on the current flagship
   model, given one natural prompt from ROUTING.md's table, produces at least
   one delegation without any incantation — or the README states in its first
   screen that it will not, and shows the one-line unlock.
3. **Inertness is visible.** A user whose style slot was stolen, or whose
   AgentTool is gated, learns it from the product within one session — not
   from a `claude -p` incantation they had to know to type.
4. **Native-parity ledger.** Every component that overlaps a built-in
   (`review`, `simplify`, `explorer`) carries either a measured win over the
   built-in or a dated removal criterion. Re-checked each minor CC release;
   the baseline moves faster than the layer.
5. **Contradiction sweep on every prompt change** — the measured driver of
   compliance collapse (RESEARCH-2026-08-26 §1.1), already listed as Must #7;
   promote it from action item to release gate.
6. **The always-on surface may not grow two releases in a row.** The repo's
   own trend line (2,774 → 4,625 tokens) is the omc failure arriving one
   defensible step at a time, and it says so itself. Make the ratchet a gate,
   not a regret.
7. **No claim without a basis, no number without a re-derivation path** —
   already house law; keep it. It is the moat.

---

## 9. What to do, in order

RESEARCH-2026-08-26 §9 already holds a correct, evidence-pinned backlog. This
report adds four items above it and re-ranks nothing else:

1. **Run the multi-file benchmark on the shipping build** with transcript-based
   delegation detection (§8 gate 1). Everything — the name, the pitch, the
   architecture — is downstream of this one measurement. If it fails, the
   honest product is a ~1,500-token discipline prompt plus `explorer`,
   `librarian`, `oracle`/`review` and `deep-interview` (the five components
   that survived the keep/cut audit as "cannot"), and that is a *good* product
   with a real market in §1's terms.
2. **Write the native-equivalents position** (§4 gap 1) and cut or justify the
   overlapping components. A roster change is a release: version bump,
   CHANGELOG, coverage gate re-run.
3. **Make inertness visible** (§8 gate 3): first-response self-identification
   in the style, and the LIMITATIONS entry for output-style platform risk.
4. **Fix the two document defects found today:** the "materially more
   verification" sentence in LIMITATIONS.md contradicts its own table; and the
   output-style deprecation history is absent from LIMITATIONS.md.
5. **Reconcile the stale upstream pin** (§1b): the ancestor is ~90 commits
   ahead, has reversed the deepwork doctrine omc-slim still carries, and has
   shipped two guards (loop, duplicate-spawn) for failure classes omc-slim
   does not name. Each is an adopt-or-diverge decision to record in
   UPSTREAM.tsv and PROVENANCE.md, not a blind sync.

Then, and only then, distribution: official marketplace listing,
awesome-claude-code submission, and one write-up whose headline is the thing
nobody else in the category has — *"we benchmarked our own plugin and here is
what it can't do."* In a market where the reference complaint is unverifiable
multipliers, the negative result is the marketing.

---

## 10. What this report could not verify

- Reddit-relayed quotes in §5 are secondhand (source blog named in the
  research pass); wording approximate.
- No adoption telemetry exists for omc-slim itself; "no adoption signal" in
  §1 means none was found, not none exists.
- The claude-swarm lineage is currently unresolvable (repo 404s; successor
  lives as Ruby gems).
- Cursor/Antigravity feature claims are community-press-sourced, consistent
  across independent outlets, vendor changelogs not fetched.
