# Viability report, part II — the deep pass (2026-08-28)

Companion to [VIABILITY-2026-08-28.md](./VIABILITY-2026-08-28.md) (part I),
which delivered the verdict, the market table, the failure modes and the release
gates. This pass delivers what part I could not in one session: a line-level
adversarial audit of every component, a dated native-equivalents ledger and
position, and the cross-ecosystem gem harvest part I's §7 gestured at but did
not run.

Method: five parallel lanes — two adversarial audits (agents+hooks,
skills+style) briefed to exclude everything already in LIMITATIONS.md and
part I, a native-ledger pass against primary sources, a mechanism harvest
across seven non-Claude-Code ecosystems, and a dedup map of 119 prior findings.
The orchestrator re-verified the five highest findings against the files before
publishing. Part I was being extended by a concurrent session while this pass
ran (§1b, the pi/OpenCode census, appeared mid-run); this document cites it
rather than repeating it, and deliberately does not edit that file.

---

## 0. Three part-I claims that moved today

1. **`claude plugin eval` is no longer blocked.** Part I treats the ablation as
   waiting on early access. On the local 2.1.247 binary, `claude plugin eval
   --help` resolves with a full option set — `--ablation with-without` as the
   default when a plugin resolves, `--judge-model`, `--max-cost-usd`, mocks.
   The manifest hook is `experimental.evals`; there is zero official
   documentation and no changelog entry, so this is experimental, not GA, and
   a server-side gate on execution cannot be excluded from help text alone.
   But the single highest-leverage credibility artefact in the category — a
   with/without delta nobody else has (part I §0) — is plausibly one paid
   local run away, today.
2. **The output-style platform risk points the other way now.** Part I §3.3
   ranks "the surface was deprecated once" as a live failure mode. The dated
   record: deprecated ~v2.0.30, restored v2.0.32 on pushback, `/output-style`
   command removed v2.1.91 — and since then `keep-coding-instructions`
   (v2.1.94), a new built-in Concise style (v2.1.237, 2026-08-20), and a
   style-drift fix (v2.1.221). That is investment, not retreat. The risk entry
   now exists in LIMITATIONS.md (added by this pass) with the direction stated
   honestly both ways. The standing caveat that matters more day-to-day:
   *"styles don't change how subagents respond"* — the orchestration style
   governs only the main loop.
3. **Nomenclature: the native competitors are bundled slash commands, not
   skills.** Part I line 279 says plain CC carries "built-in `code-review` and
   `simplify` skills". Per primary sources they are bundled commands —
   `/simplify` and `/batch` shipped v2.1.63 (2026-02-28), `/simplify` split
   into `/code-review` + cleanup-only `/simplify` at v2.1.147–154, model-
   invocable via the Skill tool since ~v2.1.101. The distinction matters
   because commands auto-fire differently than skills do, which changes §2's
   comparison below.

---

## 1. The component audit: 24 undocumented defects

Two lanes, briefed to drop anything already in LIMITATIONS.md, part I, or
RESEARCH-2026-08-26 §9. Twenty-four findings survived the filter. The
orchestrator independently re-verified the five marked ✓ against the files;
the rest carry the lane's own file:line evidence and stated confidence. Both
hook test suites were run during the audit: 19/19 and 18/18 pass — the defects
below are in what the tests do not cover, not in what they do.

### High

| # | Finding | Where | ✓ |
|---|---|---|---|
| A1 | Deepwork's review gate is claimed by two components under the same marker: deepwork pins `Gate 2 — review attempt 2 of 3` to **oracle** prompts (SKILL.md:222, :253) while `review` claims the identical marker for itself (review/SKILL.md:363–365), and the style routes writer output to `review` while calling oracle "a decision, not a diff". A deepwork phase that lands code has no single answer for which gate runs, and running both doubles cost and holds two separate re-review budgets for one gate. | skills/deepwork/SKILL.md:222,253; skills/review/SKILL.md:363–365; output-styles/omc-slim.md:34,195 | ✓ |
| A2 | Codemap's fixer brief tells the model to paste "the file list codemap.mjs reported for this dir" — no command in codemap.mjs emits one (`cmdInit` prints only `Selected N files`, :385). The data exists only inside `.slim/codemap.json`, which the skill never says to read, so every run improvises the list. | skills/codemap/SKILL.md:135; skills/codemap/scripts/codemap.mjs:385 | ✓ |
| A3 | `verify-deliverables` counts only Edit/Write/NotebookEdit/MultiEdit (:74), but fixer's own brief sanctions `sed`/`git mv`/bulk shell changes (fixer.md:181–184) and prefers MCP code-generation servers (:88–95). A fixer that follows its instructions gets told to the user as "finished without editing or writing any file" — the false accusation the hook's own comment (:56–58) promises never to make. Same for designer. | hooks/verify-deliverables.mjs:74,237–240; agents/fixer.md:181–184 | ✓ |

### Medium

| # | Finding | Where | ✓ |
|---|---|---|---|
| B1 | `deep-interview` frontmatter says "one question at a time"; the body says "**Two to four at a time**, never a wall". A model anchoring on the listing burns the four-round cap at a quarter of the intended bandwidth. | skills/deep-interview/SKILL.md:3 vs :61 | ✓ |
| B2 | The style's cheap/expensive agent tiers reference no mechanism: no agent pins a model, `maxTurns` does not differ the right way (librarian and oracle are both 100), so "prefer the cheapest specialist" selects on a difference that does not exist. Residue of the removed per-agent model pinning part I §3 documents from the other side. | output-styles/omc-slim.md:28–34,62; all six agents/*.md frontmatter | ✓ |
| B3 | `review`'s shipped base-resolution snippet tries only `origin/HEAD` then `main`; its own prose fallback chain (PR target → default → origin/HEAD → main → master) is not in the code, so a `master`-default repo errors with `fatal: ambiguous argument`. | skills/review/SKILL.md:33 vs :40–42 | |
| B4 | Codemap frontmatter says "On request only"; the body licenses unprompted proposal ("Reaching for it unprompted is correct", :22–23). Opposite answers to the same routing question. | skills/codemap/SKILL.md:4 vs :22–27 | |
| B5 | Loophole: deepwork's "one failable check per stage" has an uncapped waiver — declare "no failable check exists" per stage, mark unverified, disclose only in the roll-up; every gate satisfied by its letter. | skills/deepwork/SKILL.md:208–209,269 | |
| B6 | Loophole: deep-interview's ambiguity gate is a self-graded sum, so one fully-unknown dimension (Outcome = 3) passes if the others score low, and nothing requires citing what in the request settled each dimension. | skills/deep-interview/SKILL.md:22–24,48 | |
| B7 | Under ~50 changed lines, `review` tells the author-pass to run the lanes itself — no carve-out for when "yourself" wrote the diff, colliding with the style's "the pass that produced a change cannot be the pass that clears it". | skills/review/SKILL.md:122–124 vs output-styles/omc-slim.md:196–197 | |
| B8 | Loophole: review's fix-guided filter can launder any non-Critical finding — propose an anaemic fix, observe nothing changes, drop it legitimately; only the count survives to the reader. | skills/review/SKILL.md:222–224,376 | |
| B9 | Designer's frontmatter forbids critique-only audits; its body ships a Review mode for exactly that — and the deliverable hook then warns on the sanctioned no-write outcome (the test suite pins that false positive as *expected*: verify-deliverables.test.mjs:371–380). | agents/designer.md:3 vs :160–165; hooks.json:16 | |
| B10 | Tracer's frontmatter acceptance clause ("dispatched by another component") swallows its refusal — every subagent invocation is a dispatch, so the description alone licenses ordinary first debugging passes the body refuses. | agents/tracer.md:3 vs :13–17 | |

### Low

| # | Finding | Where |
|---|---|---|
| C1 | Codemap incremental runs dispatch one fixer per *ancestor* of a changed leaf — one modified file → four fixers, three rewriting unchanged maps. | codemap.mjs:476–482; SKILL.md:83 |
| C2 | codemap.mjs reads only the root `.gitignore` and anchors slash-containing patterns at any depth — two silent divergences from git. | codemap.mjs:65–69,83–105 |
| C3 | Any plugin whose bare name is `omc-slim` is exempt from the rival-style warning — a stale duplicate install or same-name fork steals the slot silently. | hooks/check-output-style.mjs:54,297 |
| C4 | On deadline expiry the style scan returns `null` even when it already holds a confirmed rival — silence with the evidence in hand. | check-output-style.mjs:198–201,246–249 |
| C5 | The SubagentStop matcher `^(.*:)?(fixer\|designer)$` governs *other plugins'* agents with those names. | hooks/hooks.json:16 |
| C6 | The research boundary is enforced on fixer (no WebSearch) and waived for designer, which is told to check current docs itself — identical stale-API risk, two policies. | agents/fixer.md:5 vs agents/designer.md:5,150–154 |
| C7 | Fixer's one frontmatter research guard is reconstructable through WebFetch of a search-engine URL; only prose stands in the way. | agents/fixer.md:5,16 |
| C8 | A scratch write (`/tmp/notes.md`) satisfies the deliverable check — no path test against the repo, so "reported success having written nothing that matters" passes. | verify-deliverables.mjs:104–171 |
| C9 | Designer's motion numbers self-contradict: "overlays 300–500ms; UI stays under 300ms" — an overlay is UI. | agents/designer.md:108–109 |
| C10 | deep-interview's retry rule caps at two asks *and* forbids a fourth — the third is neither licensed nor forbidden; and a "you decide" answer at the approval gate has no defined exit. | skills/deep-interview/SKILL.md:71–73,133 |
| C11 | Compliance load: "no summary unless asked" three lines above the mandatory three-part close, with nothing defining the close as not-a-summary. | output-styles/omc-slim.md:229–233 |

Categories that came up empty, stated because absence was checked: no
escalation cycles between skills (the obvious ones are explicitly broken in
text); no numeric constants disagreeing between files; no dead text beyond B9;
CRLF-authored rival styles do **not** defeat the style-scan regex (verified by
execution); the `installed_plugins.json` shape matches the live machine.

What this audit says in one sentence: **the harness-enforced layer is sound
and tested; every defect found lives in prose contradicting prose — which is
exactly the failure class RESEARCH-2026-08-26 §1.1 measured as the compliance
killer, and exactly what the reinforcement gate cannot see, because each
sentence individually still carries its rule.** Must #7 (the contradiction
sweep) stops being an action item and becomes the release gate part I §8.5
asked for; these 24 rows are its first work queue.

---

## 2. The native-equivalents position

The ledger was built against the local 2.1.247 binary, official docs, and
GitHub release notes (primary; pre-v2.1.6x releases are pruned, so the oldest
dates rest on mirrors and one dated docs issue). Full ledger with sources in
the session log; the position it forces:

**Two slots are genuinely crowded, and they are the two the README leads
with.**

- **`explorer` vs the built-in Explore agent** (native since v2.0.17,
  auto-invoked, main-model since v2.1.198). Position: **candidate for
  removal, decided by a component ablation, not by this document.** Two
  corrections from the oracle gate that reviewed this call: the residual is
  not thin — explorer.md is ~60 lines of *measured* discipline (the
  `-l`-before-`-n` search-cost ladder with its 29×/69× numbers, the
  negative-control protocol, the ast-grep cautions), not just a format
  contract. And the migration path has a structural cost: an agent file is
  re-sent on every dispatch, while a delegation brief for native Explore
  lives in the measured ~30%-post-compaction-violation class
  (LIMITATIONS.md) — retiring the component trades an enforced surface for
  a degradable one. The removal criterion stands, dated per part I §8.4,
  but the deciding run must be a *component* arm (full build vs
  build-minus-explorer, scoring map-format compliance and downstream token
  cost) — see §4 on why the default ablation cannot decide this.
- **`review` vs three native tiers** — free local `/code-review` (background
  subagent since v2.1.218, `--fix`, effort levels), ultrareview (paid research
  preview), Code Review service (paid, Team/Enterprise). The residual is the
  evidence gate: every finding quoting file:line with severity *and
  confidence*, seven named lanes including schema and API contract, and
  fixing only what is mechanical where native `--fix` applies everything.
  Position: **keep, but reposition and measure.** The honest comparison
  target is the free local `/code-review`; the pitch is not "a review skill"
  but "an evidence gate on review output". The kill criterion, amended at
  the oracle gate because the first draft was gameable: retire unless the
  false-positive rate separates **at equal-or-better true-positive yield**
  — FP rate alone is defeated by the B8 laundering path, since a gate that
  suppresses findings indiscriminately lowers FP by lowering recall and is
  worse than no gate. The deciding evidence is seeded-defect diffs with
  ground truth, both tools at n≥3, precision *and* recall reported; a
  haiku judge is too weak to adjudicate finding validity unaided. The cost
  side belongs in the position too: `review` is the heaviest component,
  44 corrected tokens under the 5,000-token re-injection cap, against a
  native tier that costs nothing.

**One slot is complementary, not competing, and the README should say so:**
`deepwork` vs `/batch` (v2.1.63). `/batch` fans out 5–30 workers on
*independent* units in worktrees; deepwork exists for *dependent* stages that
are only correct when every layer lands together. Different failure classes.
Same story for the orchestration style itself: agent teams remain experimental
and off by default (v2.1.178 docs), so the only default-on native
coordination is subagent auto-delegation — which the style directs rather
than duplicates. That is the strongest current argument for the style's
existence, and it is time-limited: it expires the day agent teams go GA.

**Four components have no native equivalent worth the name:** `librarian`
(the installed-source-before-web discipline; native has tools, not the
discipline), `tracer` (default-on hypothesis-ranking; the native analog needs
experimental teams), `verification-planning` (checked, found nothing native
that plans evidence paths), and `deep-interview` (plan mode plans the change;
nothing native elicits requirements and hard-stops for approval). These four
plus the style are the product. Note the alignment: part I §9.1's keep/cut
survivors were exactly these, derived independently.

**The rest are PARTIAL with a nameable residual:** `fixer` (a constrained
executor vs the unconstrained general-purpose agent), `designer` (a bounded
writer agent vs a first-party guidance skill), `oracle` (architecture slice
uncovered; the security slice is native since Aug 2025 — `oracle`'s brief
should say "for security-only reviews, native `/security-review` exists"),
`simplify` (deliberate Chesterton-fence deletion vs native post-change
cleanup), `codemap` (hierarchical maps vs one CLAUDE.md).

---

## 3. The gem harvest: what to adopt, and what to refuse with reasons

Twelve mechanisms surveyed across aider, oh-my-opencode, Cline, Amp, pi,
opencode, goose, Cursor, Antigravity, beads, plus part I §1b's six from the
upstream lineage. Codex was surveyed and yielded nothing portable — its 2026
surface converged with CC's own, and the one distinctive piece (execpolicy)
is permission machinery CC covers natively. Every claim below carries a source
in the lane records; adoption follows house law: a roster change is a release.

**Adopt — prose-only, one release, cheapest first:**

1. **One-line binding verdict on review** (oh-my-pi, via part I §1b.5).
   `review` has severity and confidence; it lacks the single ship/no-ship
   sentence. ~15 tokens.
2. **AI-slop comment lane in `review`** (oh-my-opencode's Comment Checker,
   which survived into their trimmed edition — it earned its portability).
   One sentence: flag comments that narrate the change or restate the code.
   Check the existing axes first; they may partially imply it.
3. **Scripts-over-MCP discipline** (Amp toolboxes + pi, converging
   independently: *"Bash and code are composable"*). One sentence in
   librarian/fixer: prefer writing a ten-line script over wishing for a
   server. The plugin already ships no MCP; the discipline is the unshipped
   half.
4. **Proof-artifact close for designer** (Antigravity walkthroughs): when a
   browser tool is present, close with a screenshot of the built state. The
   adapts-to-your-project table already gestures at this; make it an
   instruction.
5. **Duplicate-spawn guard as orchestrator prose** (upstream #1070, via §1b):
   never re-dispatch a task whose last result was not read. No hook needed.
6. **A handoff skill** (Amp `/handoff`, shipped twice there — investment
   evidence): write a handover file (objective, decisions, dead ends, next
   action) and start fresh, instead of compacting in place. Largest of the
   six; it is deepwork's progress-file discipline generalised to any session,
   so consider extending that file's format rather than adding a seventh
   skill. **This one goes through the roster-release process or not at all.**

**Refuse, with the reason on record:**

- **Todo Enforcer** (oh-my-opencode: "Agent goes idle? System yanks it
  back") — the highest-evidence mechanism this plugin has deliberately
  declined. The oracle gate upheld the refusal and tightened its ground:
  a `Stop` hook is **not** on the tool-call path — it fires once per
  turn-end at bounded cost — so the "nothing injects per tool call" pledge
  is not what this violates. What it violates is spend: forcing an idle
  agent onward is un-asked-for token burn, the exact behaviour part I §5's
  complaint corpus shows the audience punishing, while the pledge-keeping
  small surface is what the same corpus rewards. The refusal stands on
  spend, and it carries a falsifiable revisit trigger: three documented
  idle-abandonment incidents in dogfood transcripts reopen it.
- **tool-loop-guard / post-mutation format gate** (§1b.1, §1b.6) — these
  two *do* live on the tool-call path, and "nothing injects per tool call"
  is a published pledge and the plugin's main cost differentiator. Opt-in
  at most, and an opt-in hook that ships disabled is dead weight; the same
  trigger discipline applies — a documented identical-tool-call loop in a
  dogfood transcript reopens the first, a review finding of format drift
  the second.
- **LSP diagnostics feedback** (opencode) — same surface, same refusal; the
  weak prose analog (run the typechecker after an edit batch) already lives
  in deepwork's failable-check rule.
- **Aider repo map** — already ported in the only form CC permits (`codemap`
  is the static, consent-gated analog); the dynamic per-call version needs
  harness support a plugin cannot add. **Aider watch mode** (`AI!` comments)
  — genuinely loved, impossible-in-CC without an external daemon.
- **Cline Memory Bank / beads** — covered by CC auto-memory and the ballast-
  derived progress file; both were prior refusals and nothing new changes
  them. **Cursor glob rules, goose recipes** — the loved half of each needs
  attachment or transcript machinery a plugin does not get.

---

## 4. What to do, in order (supersedes nothing in part I §9; re-sequences it)

The first draft of this section put the publishable ablation first. The
oracle gate blocked that sequencing on two grounds, and the block is
accepted: the default `--ablation with-without` produces one plugin-level
delta, which cannot decide the per-component fates §2 hangs on it; and a
credibility number measured on a build with 24 documented
prose-contradiction defects is contaminated by this repo's own theory of
failure (contradictions are the measured compliance killer), would be
uninterpretable if null, and re-creates the "these numbers describe a build
that no longer exists" scar knowingly. So:

1. **Run the eval gating probe now, not the ablation.** One trivial case,
   minimal `--max-cost-usd`, answering only "does execution work or is it
   server-gated". Near-free, and every later step's design depends on the
   answer.
2. **Fix the audit's A-tier and the frontmatter/body splits (A1–A3, B1, B4,
   B9, B10) as v0.9.2**, with the contradiction sweep run as a release gate
   over all 24 rows. A1's fix, as settled at the oracle gate: `review`
   gates writer phases, `oracle` gates decision phases; the
   `Gate N — attempt N of M` marker and the per-gate re-review budget
   belong to **deepwork**, which stamps the marker into whichever gate
   agent it dispatches; review/SKILL.md:363–365 changes from claiming the
   marker to carrying a caller-supplied one; and a mixed phase (lands code
   *and* makes an architectural call) gets `review` as its gate with at
   most one oracle escalation on the named decision — never both as
   parallel gates.
3. **Then the publishable ablation, on the fixed build.** Whole-plugin
   delta for the headline number; component arms (build-minus-explorer,
   build-minus-review) only if §2's kill criteria are actually being
   invoked, because those are separate, dearer runs.
4. **Publish §2 as the native-equivalents position** — README section or
   `docs/NATIVE.md` — including the two removal-candidate declarations with
   dates. Part I §8.4 becomes satisfiable the day this lands.
5. **Adopt gems 1–5** (one release, all prose, net token delta stated —
   checked specifically against `review`'s 44-token re-injection margin,
   where gems 1–2 land; gem 2's precondition, the axis-overlap check §5
   names, runs first), and decide 6 through the roster process.
6. Then part I §9's distribution steps, unchanged.

---

## 5. What this pass could not verify

- Nineteen of 24 audit findings rest on lane evidence (file:line quoted, two
  independent contexts) but were not re-derived by the orchestrator; the five
  ✓ rows were.
- `claude plugin eval` was not executed — it spends real money and writes
  results directories; "resolves and parses" is the whole claim.
- The pre-v2.1.6x native dates (Explore's v2.0.17, the v2.0.30–32 style
  episode) are mirror-sourced; GitHub releases that old are pruned.
- The Amp "top five favourite features" user writeup returned 403; title
  verified via search snippets only.
- Whether `review`'s existing axes already cover slop comments (gem 2) was
  not checked line-by-line.
- Part I §1b landed from a concurrent session while this pass ran; its
  upstream-drift claims are commit-message-level by its own caveat and were
  not re-verified here.
