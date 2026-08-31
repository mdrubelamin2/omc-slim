# Brutal audit — 2026-08-31

## Standing after v0.9.9, same day

The body below is the morning's judgement and is kept as written. By evening
the tree had moved. §1: identity closed on all five surfaces. §2: the headline
hole is covered on the main thread by a Stop claim scan, a session-scoped
FileChanged ledger and argv0 matching. The scan tells the user, not the model.
That is the audit's option A with B's ledger beneath it. The caveat it asked to
verify is answered: `additionalContext` on Stop does re-inject and continue, so
it is not used. §2's sibling "read-only" hole is retracted in wording; Bash is
kept. §7: items 1 to 3 closed, item 4 reworded, the rest unchanged. Checkpoints
1, 11 and 14 pass. Checkpoints 8 to 10 still cost money and are unrun. The
figures in §3, §6, §9 and §13 are the morning's, as are the two "Today 4,662"
lines in §7 and §12. The current ones are in README and CHANGELOG. `.sota/` is
a local scan artefact, gitignored, and its numbers are also the morning's. The
release then went through a ten-lane review and an adversarial pass, with the
counts in CHANGELOG.

---

Mode: exhaustive SOTA scan (fan-out workflow unavailable; discovery and scoring ran inline). Baseline. No prior `.sota/last-scan.json`.

This is one document on purpose. The 2026-08-29 assessment already named document count as a slop tell. Twenty files already sit in `docs/`. This file supersedes the standing of that week's reports where they disagree. It does not replace LIMITATIONS, NATIVE, BENCHMARK, or ROUTING. Those stay the evidence. This is the judgement.

Commissioned as an all-around release-readiness audit from a principal engineer, system engineer, AI/ML engineer, harness engineer, prompt engineer, context engineer, Claude Code engineer, and tech lead. The user also asked to merge every agent, skill, and orchestrator from Claude Code, Codex, Cursor, Antigravity, Pi, and OpenCode into one plugin people would love. That desire is in the brief. The evidence says it is the product-killer. Both facts stay in this file.

---

## Verdict

**Not v1.0. Not adoptable yet. The craft is real. The product identity is still false, and the headline mechanism does not cover the path that actually does the work.**

omc-slim is a carefully built discipline layer with mutation-tested hooks, pinned provenance, and a published negative result about its own central bet. That is rare. It is also a 12-component roster named and described as an orchestrator, occupying ~4,662 real always-on tokens (measured 2026-08-31 by `./scripts/measure-context.sh`), with 1 GitHub star, 0 forks, 0 issues, 0 GitHub releases, and **no entry in the official plugin catalog** (291 plugins, fetched 2026-08-30). The author's own machine still has **0.9.7 cached** while the tree is **0.9.8**.

The thing that paid in the only committed benchmark is a terse register plus smaller, more consistent output. Zero subagents ran. The thing on the label is six specialists. The hook that is supposed to stop a fake "tests pass" only watches `fixer` and `designer` subagent stops. The main thread, which is where the benchmark win happened, is uncovered.

A user who installs "an orchestrator that will not let Claude lie about tests" will, on the common path, get a slightly stricter main-thread prompt and two advisory hooks that never see the work.

---

## SOTA standing — omc-slim · mode: exhaustive (inline)

**Verdict:** Behind the discipline-layer cluster on discoverability, idle cost, and a self-certification gate that actually covers the worker. Ahead of kitchen-sink frameworks on honesty apparatus. Not a peer of Dynamic Workflows on orchestration, and should stop competing there.

**Tier:** LAGGING (10 table-stakes gaps: 5 missing, 5 partial) · **Coverage** ░░░░░░░░░░ 0% (0/10 table-stakes fully met) · **Field scanned:** 40+ repos and the official catalog (291 plugins)

The honesty apparatus (negative result, committed harness, mutation-tested hooks) is real and is scored as a strength, not as a table-stakes met. Padding the bar with those would hide that every adoption bar is still open.

**Since last scan:** baseline. No prior `.sota/` run. The 2026-08-29 docs are a prior human pass, not this rubric.

### Field framing

Detected domain: Claude Code discipline layer (register, evidence gates, stop-before-build)
Detected cluster: `prompt-discipline-plugin` (confidence high). Methodology is always-on prompt plus advisory hooks, not a runtime orchestrator and not a kitchen-sink skill pack.
Clusters found: prompt-discipline-plugin, kitchen-sink-harness, persistence-on-disk, native-platform, cross-harness-session-UI, code-index/search, ai-slop-cleaner
Direct comparators: `obra/superpowers`, `JuliusBrussee/caveman`, `DietrichGebert/ponytail`, `mattpocock/skills` (wait-what), `anthropics` bundled `/code-review` and Concise, `OthmanAdi/planning-with-files` (adjacent: persistence)
Broader references: `Yeachan-Heo/oh-my-claudecode` [kitchen-sink], `affaan-m/everything-claude-code` [kitchen-sink], `sst/opencode` [other harness], `badlogic/pi-mono` [minimal harness], `Graphify-Labs/graphify` [code-index], `gabelul/slopbuster` [slop]
Adjacent considered: session UIs (Orca, T3 Code, Paseo, Conductor); excluded as a different product (they wrap Claude Code, they are not plugins inside it)
Excluded: model-vs-model lists, IDE forks sold as "which agent is smarter"
Benchmark assumption: we are scored as a discipline layer that claims to plan, delegate, and catch self-certification. Orchestration features that only exist in Dynamic Workflows or in 35-skill packs are optional ideas, not missing table-stakes.

### Why these benchmarks

Direct: same job (change how Claude Code behaves on every turn without becoming a framework).
Kitchen-sink: the death mode this project must not copy. SuperClaude 23,849 stars and four issues in ninety days. `agent-os` 5,350 stars. `ccpm` called dead in QUALITY-BAR. ECC (`affaan-m/everything-claude-code`) 244,663 stars and still the opposite of what retention data rewards.
Native platform: the baseline moves weekly. Dynamic Workflows are GA. Concise shipped in 2.1.237. `/code-review` is free and bundled.
Cross-harness UIs: what "orchestrator" means to buyers who do not live in `~/.claude/`. Not our cluster. Named so the merge-everything brief is answered, not ignored.

### Do this next

**Put the verification hook on the main thread, or stop claiming the plugin catches a test it never ran.** The UX to copy is "a machine check that does not need the model's cooperation" (already the charter of `hooks/verify-deliverables.mjs`). First step: decide among (A) a `Stop` hook on the parent session that scans the parent transcript the same way SubagentStop scans the child, (B) `FileChanged` plus a claim scan on the last assistant message, (C) drop the README sentence until A or B exists. Effort ~1–2d. gap: high. impl: medium. needs-verification: whether `Stop` on the parent re-injects the way oh-my-claudecode #2542 / #959 made fatal; this repo refused Stop for that reason.

Until that ships, the first screen is a claim the code does not keep.

---

## 1. Three pitches, one product, none of them match the evidence

Read today, in this order:

| Surface | What it says | File |
|---|---|---|
| GitHub description | "plans and delegates" and "will not claim a check it did not run" and "~4,413 tokens" | `gh repo view mdrubelamin2/omc-slim` |
| Output style frontmatter | "Workflow-manager orchestration. Plans work, delegates bounded tasks to specialist subagents" | `output-styles/omc-slim.md:3` |
| marketplace.json description | "A discipline layer for Claude Code, not an orchestrator" | `.claude-plugin/marketplace.json:13` |
| marketplace.json keywords | `orchestration`, `subagents`, `delegation` | same file, lines 16–19 |
| plugin.json | "discipline layer" plus keywords `subagents` | `.claude-plugin/plugin.json` |
| README first line | "makes the main thread plan and delegate" | `README.md:3` |
| MEASURE today | static **4662 real / 5286 chars/4** | `./scripts/measure-context.sh` |

Three live numbers for one cost: **4,413** (GitHub), **4,885** (README / LIMITATIONS), **4662** (the command, today). QUALITY-BAR checkpoint 1 is "every published number has a command that reproduces it". It does not, today. The 2026-08-29 QUALITY-BAR said omc-slim passes 1 through 7. That sentence is now false.

Checkpoint 2 is "no claim on the first screen contradicts the project's own evidence". The first screen still sells planning and delegation. The committed benchmark (`docs/BENCHMARK.md`) ran **zero subagents**. The dogfood receipts (`docs/DOGFOOD-2026-08-29.md`, `-II`) used **9 of 12 components zero times**, twice, and routed review-shaped work to `general-purpose`.

ASSESSMENT-2026-08-29 already said: the product is good and the pitch is wrong. v0.9.8 then added a size ladder to the orchestrator. It did not change the GitHub description, the output-style description, or the marketplace keywords. The identity split is not a leftover. It is load-bearing copy that nobody has been willing to kill.

---

## 2. The headline hole (this is the one that should stop a release)

README: "It cannot claim a test it never ran. A hook reads the agent's own transcript."

What the hook actually does (`hooks/hooks.json` matcher `^(omc-slim:)?(fixer|designer)$`, `hooks/verify-deliverables.mjs`):

1. It runs on **SubagentStop**, not on the main thread.
2. It only runs for **fixer** and **designer**.
3. It is **advisory**. Always exit 0. Never blocks.
4. A write through **Bash** (heredoc, sed, git mv) is "cannot tell". Auto mode tells the model to prefer the shell. LIMITATIONS.md already tested this and left it unfixed.
5. `CHECK_COMMAND_HINTS` matches the substring `test`. The file's own comment says `git log --oneline latest` contains "test" and **buys silence** on a fake pass. That is a documented loophole, not a hypothetical.
6. An MCP test runner is invisible. The advisory tells the user to ignore it.

The only committed cost win is a **plain session versus omc-slim, n=3, one single-file CLI, zero subagents**. On that path the hook never runs. The sentence a new user remembers is the one the common path does not keep.

This is not a nit. D3 in QUALITY-BAR is "must not make a claim its own evidence contradicts". The 45/45-complete / 19 false-positive story is true and well sourced. It is used to sell a guard that does not watch the worker who told that story.

**Read-only is the sibling hole.** `MAINTAINERS.md` still shows the example `disallowedTools: [Edit, Write, NotebookEdit, Bash, Agent, Task]`. Shipped `explorer`, `librarian`, `oracle`, and `tracer` deny Edit/Write/NotebookEdit/Agent/Task. **They allow Bash.** Mutation is a prompt. `kimi-plugin-cc` enforces read-only at PreToolUse. We have the scars that say PreToolUse deny is a bad security control (RESEARCH-2026-08-26, v2.1.210 deny now ends the turn). That does not make Bash-capable "read-only" agents honest. It makes the honest sentence: read-only for Edit/Write, not for the shell.

---

## 3. Cost versus value, stated the way a sceptic will

Always-on, this morning:

- 4662 real tokens (cl100k), 5286 chars/4
- Output style body is **4234 of 5286** chars/4. The roster descriptions are 1052. The expensive thing is the essay, not the specialists.
- On-invoke ceiling if every component fires once: 38085 chars/4 (~35k corrected in LIMITATIONS; the two bases still drift)
- `review` + checklists: 9656 chars/4. Native `/code-review` is free, bundled, 464,923 unique installs, 25 always-on tokens in the official catalog.

Official catalog, unique installs, always-on tokens (catalog fetched 2026-08-30):

| Plugin | Installs | always_on | What it is |
|---|---|---|---|
| frontend-design | 1,211,610 | 83 | one skill |
| superpowers | 1,081,334 | 693 | 14 skills, 1 hook |
| code-review | 464,923 | 25 | one command |
| code-simplifier | 364,099 | 69 | one agent |
| security-guidance | 257,481 | 0 | 4 hooks, no prompt tax |
| ralph-loop | 201,849 | 89 | one loop |
| hookify | 62,944 | 297 | user-authored hooks |
| remember | 57,044 | 78 | standing memory |
| mattpocock-skills | 33,070 | 1614 | 25 skills, user-invoked |
| omc-slim | **not in catalog** | ~4662 | 12 components |

The prune rule from ASSESSMENT still holds. People delete what they cannot name. An output style never emits `skill_activated`. The largest always-on component cannot appear in the telemetry used to decide whether to keep it. Native Concise (v2.1.237) now does the register job inside the harness. `force-for-plugin` takes the user's style slot. That is a hostage design: the plugin only works if it wins a silent load-order fight, and it disables Concise, Explanatory, and Learning while it is on.

Two settings the README already names (`ENABLE_TOOL_SEARCH`, `subagentPromptCacheTtl`) save more than this plugin costs. A plugin that is honest about that is rare. A plugin that still costs 4.6k tokens after saying it is still asking the user to pay for a roster that dogfood did not use.

Laszlo 2026-06-11 (n=500, Superpowers): +2.2pp pass rate, not significant; **+625k tokens, significant**. The category leader made people spend more to fail at different things. Our n=3 says we are cheaper on one toy CLI. We have not run the task where delegation could pay. Until that run exists, "18% cheaper" is a fact about one shape, and "orchestrator" is unsupported.

---

## 4. The merge-everything brief, refused

The user asked for the combined version of all agents, skills, and orchestrators across Claude Code, Codex, Cursor, Antigravity, Pi, OpenCode, and unknown gems.

That product already exists. It is called Everything Claude Code (244,663 stars), oh-my-claudecode (38,899 stars, still shipping ~35 npm versions a month), gstack (130,469), SuperClaude (23,849, effectively dead), agent-os (5,350), claude-code-flow (69,826). Four of five successors of dead orchestrators are *smaller* than what they replaced. SkillsBench: focused skills with at most three modules outperform exhaustive bundles. Retention: inventories fall to about half, survivors are the ones the owner can point at.

Pi (`badlogic/pi-mono`, 99,395 stars) is the opposite thesis: ~1,000-token system prompt, four tools, **no subagent tool**, because Claude Code subagents are "a black box within a black box". Mario Zechner's write-up is the best argument against this plugin's roster that is not Anthropic's own multi-agent paper.

Matt Pocock's `wait-what` is **three lines**, `disable-model-invocation: true`. His commit message: "The name is the mechanism. Concision skills fail by growing." omc-slim baked ASD-STE100 into an always-on 4k-token essay. That is the failure wait-what was designed against. We took the grammar. We refused the size.

**The right merge is mechanisms, not rosters.**

Take:

- wait-what's user-invoked reset (do not grow the style)
- eli5's three-part close (already taken; keep refusing the "like I'm 5" voice)
- caveman's grammar, not its retracted cost claim, not its BSL split, not its telemetry
- planning-with-files' disk plan + PreCompact flush (compose; do not reimplement 60-agent support)
- fable5's *admission control* on spawn (PreToolUse on Agent), not its whole plugin
- kimi's hook-layer read-only (or deny Bash on read-only agents, which is free)
- Codex `/codex:review` as the *idea* of a different vendor's model, not a stale 32,561-star plugin last pushed 2026-07-08
- slopbuster's 79 *code* patterns (comments, naming, mock-heavy tests), not another prose detector
- token-warden's rent (13 stars, more rigorous than our ratchet)
- native `FileChanged` for the headline hole
- native Dynamic Workflows for fan-out we should not reimplement
- native Concise as the register we should not fight
- hookify (62,944) as the user-authored hook layer we should stay compatible with, not replace

Do not take:

- ECC's 35+ skills
- OMC's autopilot / ralph / ultrawork / team
- gstack's 35 skills
- Antigravity's nested subagents to depth 10
- Cline checkpoints (harness-level, cannot transfer)
- A `workflows/` directory that turns this plugin into a worse Dynamic Workflows
- Amp's Oracle and Librarian *names* (name collision, already recorded in PROVENANCE, still unaddressed in the product)

If this plugin becomes the union of those packs, it dies the way they die: slowly, without an archive banner, when `/doctor` asks the owner what each component did.

---

## 5. Hidden gems people actually use (and what they imply)

Not in the Aug 29 competitor file, or under-weighted there:

1. **frontend-design, 1.21M installs, 83 tokens.** The winning "designer" is one official skill, not a 200-turn writer agent. Our `designer` is the keep/cut "Yet": it compensates for timidity. Official already owns the slot.
2. **security-guidance, 257k, 0 always-on, 4 hooks.** Security as hooks, not as oracle prose. We have no security section. NATIVE.md already said so.
3. **ralph-loop, 202k.** Completion as a loop with a Stop-shaped gate. We refused Stop (correct, given OMC #2652). We also have no completion gate. planning-with-files owns the gated Stop. The slot is taken.
4. **hookify, 63k.** Users want to *write* hooks, not install ours. Stay off the tool-call path (good) and document how to compose.
5. **remember, 57k.** Standing rules that survive sessions. We refused ballast's UserPromptSubmit injection. The user-visible gap remains: a correction in session N is gone in session N+1.
6. **mattpocock-skills, 33k official installs, 241,783 GitHub stars.** User-invoked engineering skills (tdd, triage, wayfinder, grill-with-docs). He ships a router (`ask-matt`) instead of an always-on orchestrator. That is the grown-up version of "you should not need to name any of them".
7. **planning-with-files, 26,449 stars, 60+ agents.** Compaction survival. PreCompact. Session catchup after `/clear`. We named this gap and shipped nothing. `codemap` writes the *other* kind of disk artefact: hierarchical markdown that goes stale and is auto-loaded via AGENTS.md.
8. **Graphify, 112,624 stars.** Queryable graph. Our maps are markdown. NATIVE.md already called this the weakest row.
9. **semble, 5,969.** "98–99% fewer tokens than grep". explorer's entire reason to exist, with a number. We have a format contract and 29×/69× grep-ladder measurements. We do not have 98%.
10. **slopbuster, 37 stars, 152 patterns, 79 of them code.** Two-pass rewrite because stripping tells without adding voice produces a second detectable sludge. Our `check-prose.sh` fails only on em-dash density and bolded lead-ins, and only on user-facing docs. It does not scan generated code. The author's v0.9.8 complaint was generated comments. That is slopbuster's comment table. We added prompt rules. We did not add a code-pattern check.
11. **Pi.** Minimal harness, observability of the one agent, no nested black boxes. The users who leave Claude Code for Pi are not asking for more specialists.
12. **Native Concise, Proactive, observer:, FileChanged, TaskCreated, Dynamic Workflows.** The platform is the competitor. A plugin that does not re-read the binary every minor release is describing a dead build. NATIVE.md is the right artefact. It is dated 2026-08-29 against 2.1.251. Today's date is 2026-08-31. Two days is already a stale row by that file's own rule ("more than one minor release old").

---

## 6. Capability matrix (direct cluster)

| Capability | Us | SOTA | Gap? | Reference |
|---|---|---|---|---|
| Re-derivable cost number that matches the first screen | ⚠️ 4662 vs 4885 vs 4413 | caveman HONEST-NUMBERS; we invented the genre and then drifted | table-stakes | `./scripts/measure-context.sh` vs README vs `gh repo view` |
| Published negative result | ✅ README "zero subagents" | caveman −9.9% HTML; Overstory STEELMAN | | README, BENCHMARK.md |
| Self-cert gate on the worker that does the work | ❌ main thread uncovered | kimi Stop-gate review; planning-with-files Stop completion | table-stakes | `hooks/hooks.json`, verify-deliverables.mjs |
| Harness-enforced read-only (including shell) | ⚠️ Edit/Write denied, Bash allowed | kimi PreToolUse; MAINTAINERS example denies Bash | table-stakes | agents/explorer.md:5 vs MAINTAINERS.md example |
| First-session visible effect | ❌ unrun | frontend-design, Concise, wait-what | table-stakes | RELEASE-READINESS criterion 2 |
| Idle cost in the same band as official single-purpose plugins | ❌ ~4662 vs 25–693 | frontend-design 83, code-review 25, superpowers 693 | table-stakes | official catalog always_on |
| Human stop before building the wrong thing | ✅ deep-interview (evals unrun) | Superpowers +14.50 gate study | | evals/build-me-something, never executed |
| Compaction / `/clear` survival | ❌ named, not built | planning-with-files UserPromptSubmit + PreCompact | table-stakes for long sessions | OthmanAdi/planning-with-files |
| Official marketplace presence | ❌ not in 291-plugin catalog | superpowers, code-review, mattpocock-skills | table-stakes for adoption | plugin-catalog-cache.json 2026-08-30 |
| Native overlap measured, not only dated | ⚠️ 0 of 4 measured | NATIVE.md is the ledger | table-stakes | docs/NATIVE.md |
| Attributable invocation for the always-on layer | ❌ output style emits nothing | skills emit skill_activated | table-stakes for retention | LIMITATIONS.md |
| User-invoked concision reset | ❌ baked into 4k style | wait-what, 3 lines, disable-model-invocation | edge | mattpocock/skills wait-what |
| Different-vendor review | ❌ same model, new context | openai/codex-plugin-cc (stale) | edge | openai/codex-plugin-cc |
| Per-rule token rent | ❌ ratchet is a human note | token-warden | edge | vukkt/token-warden |
| Cross-agent SKILL.md distribution | ❌ Claude Code plugin only | planning-with-files 60+; npx skills | optional / other cluster | OthmanAdi/planning-with-files |

**What we already match:** fail-open advisory hooks; mutation suites (56+25); COVERAGE + REINFORCEMENT; one-level `disallowedTools: [Agent, Task]`; no plugin MCP; provenance pins; committed bench harness; contradiction sweep as a gate (when it actually runs); size ladder in v0.9.8; comment-default-zero in v0.9.8; "no tooling is a question" in v0.9.8.

---

## 7. Loopholes and edge cases (the ones still live)

Numbered so they can be closed or accepted. File:line is the quote gate.

1. **Main-thread self-certification.** `hooks/hooks.json:14-24` SubagentStop only. README sells a general guard.
2. **Bash writes.** `WRITE_TOOLS` is Edit/Write/NotebookEdit/MultiEdit. Auto mode prefers shell. LIMITATIONS.md, tested 2026-08-29, unfixed. `FileChanged` exists in 2.1.251 and is unused.
3. **`test` substring silence.** `verify-deliverables.mjs` CHECK_COMMAND_HINTS. Documented. A claim plus `git log --oneline latest` is a clean bill.
4. **Read-only agents have Bash.** explorer.md:5, librarian.md:5, oracle.md:5, tracer.md:5. Prompt says never checkout/stash/reset. Harness does not.
5. **`maxTurns` unverified.** LIMITATIONS.md: the key may be ignored. Silent truncation returns nothing.
6. **Output style cannot prove it ran.** No skill_activated. Statusline is opt-in. `force-for-plugin` vs `default` still an open state. Another plugin can take the slot; SessionStart warns about the condition, not the winner.
7. **`force-for-plugin` hostage.** User's Concise/Explanatory/Learning cannot coexist. Team install via `enabledPlugins` changes every teammate's voice. README says tell them first. The mechanism still traps.
8. **deepwork and simplify do not auto-fire.** ROUTING.md. Output style cannot compel Skill the way CLAUDE.md can. The "you should not need to name any of them" claim is false for the two skills the README says to invoke by name, and unmeasured for review.
9. **review never fired in two dogfood sessions.** The output style says non-trivial writer output goes through review. The orchestrator sent general-purpose instead. v0.9.7 added catch-all precedence (+70 tokens) to stop explorer work going to general-purpose. Dogfood-II still used general-purpose for the contradiction sweep because **no component owns it**. The plugin requires a gate it cannot run.
10. **Nine of twelve idle, twice.** explorer, oracle, tracer, designer, review, simplify, codemap, deep-interview, verification-planning. A roster that does not fire is a context tax.
11. **Evals never executed.** `evals/README.md` first sentence. `claude plugin eval` early-access gated. Criterion 7's eval clause is unsatisfied. The suite is a well-formed artefact, not a result.
12. **Delegation instrument unrun.** INSTRUMENTS-R4.md, ~$45–60. Criterion 1 NOT MET. The name "orchestrator" is unsupported until this run or the word is dropped.
13. **Liveness unrun.** Criterion 2. D1 unverified. The first session is where retention is decided.
14. **Agent-gated inertness unrun.** Criterion 3 half-unrun. The style's "say if Agent is missing" is prose. Some builds append "do not call AgentTool unless the user requested it". ROUTING.md has the unlock sentence. A plugin that needs an incantation is not out of the box.
15. **codemap stale-but-authoritative.** Hash freshness cannot catch a hallucinated Flow section. AGENTS.md write is a permanent tax. NATIVE.md declined the SessionStart stale hook until the component's fate is decided. The decision is still open. Shipping the skill while the decision is open is the gap.
16. **Contradiction sweep skipped two releases.** v0.9.5 and v0.9.6. Eleven findings when it finally ran. The gate is only a gate if the human runs it. No CI step for the sweep (it costs a model). CI runs presence checks. Presence is not behaviour.
17. **Static ratchet NOT MET.** Floor 4,197. Today 4,662. v0.9.8 bought a ladder and comment rules with ~10% static growth. Each addition was justified. The sum is the oh-my-claudecode failure mode, named in LIMITATIONS, still happening.
18. **review cap margin.** LIMITATIONS: 29 tokens of margin on the 5,000 re-attach cap, last time it was measured. review is 9656 chars/4 including checklists, which is a sibling read on every review. Combined 25,000 skill budget across twelve components. Long sessions drop old skills. No re-assertion.
19. **Windows.** review `base.sh` needs POSIX shell. PreToolUse never fires on Windows (#88896). We do not depend on PreToolUse (good). review still does depend on bash.
20. **Name collision.** Amp Oracle and Librarian. PROVENANCE recorded it 2026-08-29. No rename, no disambiguation in descriptions.
21. **Installed 0.9.7 vs tree 0.9.8.** The maintainer's session is not the shipping tree unless someone copies. Marketplace lastUpdated 2026-08-29. Tree is ahead 2 on origin/main. No GitHub Release object (`latestRelease: null`).
22. **Observer, model:, effort: unused.** Per-subagent model control is native. Mixed-model roster is an open choice. Six specialists on one model is one perspective billed up to six times (Anthropic multi-agent, 2026-08-16).
23. **No Stop, no PreCompact, no FileChanged, no TaskCreated, no workflows/.** Each is a recorded decision or an untested event. The platform moved. The plugin did not, on purpose, except where it grew the prompt instead.
24. **Hook timeouts are advisory.** Comments in both hooks cite #85250 and #87289. Fail-open is correct. A hung hook can still stall a session. In-process budget cannot preempt stdin read.
25. **Content-overrides-size ladder vs review's "size never skips a lane".** v0.9.8 narrowed when the orchestrator *invokes* review. Once invoked, review still runs every triggered lane. Two different "size" rules, both live. Easy to "fix" by making them the same, which would restore the author's original complaint (review on a rename).

---

## 8. AI slop, and how to look like a human made this

The 2026-08-29 assessment was right: thoroughness is what slop imitates. This repository is the extreme of that. Twenty dated research files. A 144k-byte research dump. Em-dashes, tricolons, bolded lead-ins. `check-prose.sh` exists and is better than nothing. Weber-Wulff and Liang still apply: there is no scanner to pass.

What people who actually clean slop do (slopbuster, and the detectors it cites):

- **Two passes.** Strip tells, then put voice back. One pass produces sterile text a different classifier flags.
- **Do not invent specifics** to sound human. Flag gaps. The human fills numbers.
- **Code has its own 79 patterns.** Tautological comments, Manager/Handler names, mock-heavy tests, boolean flag parameters, commented-out alternatives, section banners. v0.9.8 started this in prompts. It is not a check on the output.
- **Voice sample.** Deep mode calibrates to a writer. This project has a register. It does not have a "this is how Rubel writes when he is tired" sample. The CHANGELOG voice (complaint, then cause, then the cost) is the closest thing to a human tell in the repo. That voice should be the README, not only the log.
- **Dates, names, commands, negative results.** Already the house style. Keep them. Stop writing new essays that restate them.
- **Fewer files.** Do not add a 21st overlapping viability report next week. Update this standing. Delete or archive lab notebooks that have been absorbed (VIABILITY I/II, COMPRESSION working record, RESEARCH-2026-08-26 once every live rule is in COVERAGE).
- **Human review of every prompt change.** The contradiction sweep is that review. It has to run. A human has to read the eleven findings. A model proposing the sweep is not a human review.
- **eli5 was refused correctly.** "Like I'm 5" fights "not baby talk". The three-part close stayed. Native Concise now exists. If the register cannot beat Concise in a side-by-side, the style is the wrong always-on bet.
- **wait-what is the humanization people love.** You type it when *you* are lost. The agent does not decide you are confused. That is respect. An always-on STE100 essay is the agent deciding you cannot handle a long sentence.

`check-prose.sh` should grow a **code** mode (comment banners, "we" in comments, `// Increment counter`) or this project should depend on slopbuster rather than reimplementing it. Do not add 152 patterns to the always-on style. That is how you become slop while fighting slop.

---

## 9. Persona verdicts (short, because one structural problem beats ten nits)

**Principal engineer.** The architecture is a prompt-shaped orchestrator on a platform that just shipped a code-shaped orchestrator (Dynamic Workflows, GA, `workflows/` in plugins, no mid-run input). Competing on orchestration is a strategy error. The residual (human gate, evidence quote, fail-open hooks) is a product. Twelve components is not. Cut to what dogfood used plus the stop: style, librarian, fixer, deep-interview, verify-deliverables. Put dates on the rest.

**Tech lead.** v1.0 criteria 1, 2, 6 are NOT MET. Criterion 3 is half. Criterion 4 is a ledger with 0 measured wins. Criterion 5 is MET only when someone remembers. Criterion 7 is MET for scripts and false for GitHub/README drift as of this morning. Ship is a distribution act. There is no GitHub Release. The listing is not in the official catalog. No post was sent (DISTRIBUTION-DRAFT). The next "release" that only changes prompts is not a release.

**System / harness engineer.** Two hooks, fail-open, mutation-tested, namespace-pinned, budget-capped: this is the best-engineered plugin machinery in the set we read. It is also aimed at the wrong events. SubagentStop cannot see Auto-mode Bash or the main thread. FileChanged and parent Stop were recorded and not built. `disallowedTools` without Bash is not read-only. `maxTurns` is faith. Windows is a footnote that will become a bug report.

**AI/ML engineer.** Prompt layers move cost and process, not correctness. Four external studies plus our n=3 plus Laszlo n=500 agree. Ablation of individual rules has never run. The eval suite is structural. Delegation as a performance bet is unsupported. Context isolation for explorer/librarian is the remaining ML-shaped claim (LongCodeBench, compaction 0%→30% violations). Measure that, or stop paying 4k tokens to host four other agents.

**Prompt / context engineer.** wait-what: concision skills fail by growing. This style grew. Caveman's article-stripping failed to fire on Opus 5 and decayed with depth. Our Communication section is the same class of instruction, still unmeasured. Descriptions are the routing layer; bodies are the behaviour. Dogfood shows routing still misses. Adding more description text (+70 catch-all) is the tax we keep paying to compensate for a roster the model will not use.

**Claude Code engineer.** Native Explore, `/code-review`, `/simplify`, frontend-design, Concise, Proactive, security-guidance, ralph-loop, Dynamic Workflows, observer: (experimental). Every month the residual shrinks. The plugin's only structural advantages that the platform cannot copy next quarter are: (1) a human stop workflows cannot hold, (2) an evidence gate native `--fix` does not use, (3) published negative results. Everything else is a race the vendor wins by shipping.

**Tech lead (adoption).** 1 star. Not in the catalog. GitHub description stale. Keywords say orchestration while the marketplace blurb says not an orchestrator. Superpowers has 1.08M installs at 693 tokens. That is the existence proof that a discipline pack can distribute. They got there by being the default recommendation, by being in the official marketplace, and by being a skill pack you invoke, not a forced style. Copy the distribution path. Do not copy the 14-skill surface.

---

## 10. Checkpoints (QUALITY-BAR Part 3, restated and extended)

The 2026-08-29 table said we pass 1–7. Today's run fails 1 and 2. Additions in **bold** are new. Standing is as of 2026-08-31.

| # | Checkpoint | Standing now |
|---|---|---|
| 1 | Published numbers match `./scripts/measure-context.sh` and `gh repo view` | **FAIL** (4662 / 4885 / 4413) |
| 2 | First screen does not contradict own evidence | **FAIL** (delegates / zero subagents; will not claim / main thread uncovered) |
| 3 | Prose style gate | pass until the next essay; this file will be scored |
| 4 | Contradiction sweep ran on this build | last full run v0.9.7; v0.9.8 added ladder text, sweep status not in that entry as a count |
| 5 | Every rule can fire | **FAIL** (Bash mutation; review unmeasured; deepwork needs CLAUDE.md) |
| 6 | Gates proved able to fail | pass for hook suites; fail for the advertised main-thread claim (no gate there to fail) |
| 7 | Always-on cost is the whole cost | pass as a floor-with-caveat; GitHub still quotes a superseded floor |
| 8 | Fresh-install liveness | unrun |
| 9 | Adversarial install (style + gated Agent) | half (style fixture 9/9; live Agent-gated session unrun) |
| 10 | Delegation measured or dropped | unrun / copy not dropped |
| 11 | **Self-cert hook covers the worker that writes** | **FAIL** |
| 12 | **Official catalog listing, or a written reason we stay off it** | **FAIL** (absent, no reason) |
| 13 | **Dogfood: unused components named as wagers or removed** | **FAIL** (9/12 idle, still shipping) |
| 14 | **Identity: one sentence, same on GitHub, marketplace, style, README** | **FAIL** |

Release means 1, 2, 11, and either 10's run or the word "orchestrator" gone from every surface. 8 and 9 still cost money. Skipping them is how D1 stays a story.

---

## 11. What "super awesome useful loving" actually is, for this plugin

Not a feeling. Observable.

- Install. First prompt: a typo. One-line fix. No interview, no review, no subagent. (evals/one-line-typo exists. Never run.)
- Second prompt: "build me an on-call tool". Stop. Spec. Wait. (evals/build-me-something. Never run.)
- Third: "where is retry?" A map, not an essay. (evals/where-is-it. Never run.)
- Fourth: a real multi-file change. One failable check the project already had. If the model says tests pass, either a command is in the transcript **of that worker** or the user sees a warning. Today this fails on the main thread.
- Fifth: forty turns in, after a compact. The stage map is still true. We have no mechanism. planning-with-files does.
- Sixth: `/plugin disable`. Style returns. Nothing left in AGENTS.md unless the user ran codemap and said yes. Honest uninstall.

Love, in this category, is: it saved me from a lie, it shut up, it did not make me learn twelve names, and when I audited `/context` I could point at a hook and a stop. That is caveman (one skill), wait-what (three lines), security-guidance (hooks, 0 tokens), Concise (vendor). It is not a merged cosmos of agents.

---

## 12. Gaps ranked for a builder who will only do five things

1. **Tell the truth on the first screen.** One sentence. Discipline layer. Stop, register, evidence. Not orchestrator. Update GitHub description (the command RELEASE-READINESS already named), marketplace keywords, output-style `description:`. Align README. Cost figure from `measure-context.sh` the same day.
2. **Cover the worker or retract the sentence.** Main-thread claim scan, or FileChanged, or delete "cannot claim a test it never ran".
3. **Run the three paid sessions.** Liveness ×3, Agent-gated inertness, delegation instrument. ~$60 plus pride. No prose substitutes.
4. **Cut or label the idle eight.** Dogfood named them. Shipping them without "unmeasured wager" on the first screen is the framework death, slow.
5. **Stop growing static.** Floor 4,197. Today 4,662. Next release shrinks or it is not a release. Native Concise is the shrink path for the register. A 3-line wait-what skill is the shrink path for "I got lost". The 4k essay is the problem.

Optional, after those, not instead:

- Compose with planning-with-files rather than building PreCompact.
- Deny Bash on read-only agents, or say "read-only except shell diagnostics" in the README.
- Code-pattern slop check (slopbuster or a small sibling of check-prose).
- Rename oracle/librarian, or add "not Amp" in the description. Cheap, avoids a confusing comparison.
- Official marketplace. Superpowers did not get 1.08M from GitHub README craft alone.

**Refuse:** merging ECC/OMC/gstack; shipping `workflows/` as the product; UserPromptSubmit injection of the whole plan every turn (that is planning-with-files, and it is their cost model); a 20th research file next week.

---

## 13. What the Aug 29 docs got right, and what they missed

Right: pitch vs evidence; Dynamic Workflows as the orchestration ceiling; output style unattributable; Laszlo killing the "only benchmark" moat; dogfood 9/12; Auto-mode Bash; wait-what/caveman/eli5 adoption notes; D1–D4.

Missed or stale by this morning:

- Official catalog numbers. Installs, not GitHub stars, decide Claude Code adoption. caveman 101,869 GitHub stars is not the same axis as frontend-design 1.21M unique installs. We used GitHub stars as the market. The market is the catalog. We are not in it.
- Native Concise as a register killer.
- wait-what's *size* as the actual lesson (three lines, user-invoked), not only STE100.
- slopbuster code patterns.
- Pi's no-subagent thesis.
- The verification hook vs the benchmark path (the headline hole was described as Auto-mode Bash; the worse hole is that the win path never hits SubagentStop).
- GitHub description still 4,413 after v0.9.7/v0.9.8.
- marketplace keywords vs "not an orchestrator".
- Maintainer cache 0.9.7 vs tree 0.9.8.
- measure-context today 4662 vs README 4885. Checkpoint 1 broke *after* they claimed it passed.

---

## 14. Improved research prompt (use this next time, not the wall)

The original brief asked for every persona, every ecosystem, every gem, every loophole, and a merge of all tools. That prompt produces another 20th document and a roster. Use this:

```
You are auditing omc-slim for release. Be hostile.

Constraints:
- Score us as a discipline layer, not as an orchestrator, unless the tree's
  own first screen still claims orchestration. If it does, that is finding #1.
- Do not recommend adding components. Recommend cuts, retractions, or
  measurements. A merge of other packs is how SuperClaude died.
- Every finding: file:line or a command you ran today. No README-only claims
  about competitors; open their hooks.json or skip the row.
- Re-run ./scripts/measure-context.sh, gh repo view, and the official catalog
  unique_installs. If three numbers disagree, checkpoint 1 fails.
- Name the worker the headline hook actually watches. If it is not the
  worker in BENCHMARK.md, the headline is a lie.
- Check native surfaces that shipped since NATIVE.md's binary date.
- AI slop: run check-prose.sh; also say whether generated CODE would pass
  slopbuster's code table. Do not add docs to look thorough.
- Paid gaps (liveness, delegation, evals): if unrun, say NOT MET. Do not
  design more instruments.
- End with five actions, ordered. Refuse a sixth.

Personas: one paragraph each, after the evidence, not instead of it.
```

That prompt is smaller than the style's Communication section. It would have found the headline hole faster.

---

## 15. Standing, one screen

omc-slim is the most self-critical plugin in a category that usually lies. That is an actual position. It is not a product people wait for, yet.

People wait for: a model that does not grade its own homework; a voice they can read at 1 a.m.; a stop before a week of the wrong feature; a session that survives compact. Native is moving on the first two. planning-with-files owns the fourth. The stop is ours if we keep it small.

The merged cosmos of agents is not what they wait for. It is what they install once, cannot name, and delete in the six-month ablation Boris Cherny told them to run.

**Releasable by the personas in this file:** no. **Worth keeping and shrinking:** yes. **Next honest version:** a discipline layer whose first screen, GitHub description, and hooks describe the same three mechanisms, with numbers the command still prints, and a self-cert check on the thread that writes the code.
