# The native-equivalents ledger

**Every component that overlaps something Claude Code already ships carries
either a measured win or a dated removal criterion.** That is release gate 4 in
[VIABILITY-2026-08-28.md](./VIABILITY-2026-08-28.md) §8, and this file is where
it is discharged.

The reason this file exists rather than a paragraph in the README: **the baseline
moves faster than the layer.** In the three days between 2026-08-26 and 2026-08-29,
Claude Code shipped a filesystem-change hook that retired one of this plugin's
standing refusals, added a fifth built-in output style with no changelog entry,
grew the `SubagentStop` payload, and reversed the semantics of an environment
variable this project reasons about. A plugin that does not re-check its own
overlap every minor release is describing a build that no longer exists.

Verified against the installed binary 2.1.251 on 2026-08-29, build
`2026-08-28T14:51:38Z`. Where the binary and the documentation disagree, the
binary wins and the row says so. Every row is re-checked at each minor Claude
Code release; a row whose date is more than one minor release old is stale and
should be read as unverified.

---

## The four with no native equivalent worth the name

These plus the output style are the product. Nothing here needs a removal
criterion, because there is nothing to be removed in favour of.

| Component | What native has | What it does not have |
|---|---|---|
| `librarian` | `WebSearch`, `WebFetch`, and whatever documentation MCP you installed | The **discipline**: read the installed source on disk before anything written about it, and gate the open-web pass on rarity rather than running it every time. That gate is not a preference — injecting documentation measured **+9.36pp on rare APIs and −39.02pp on common ones**, so an unconditional web pass makes common answers worse. Native ships the tools and no policy for when to use them. |
| `tracer` | Nothing default-on. The analogue is an adversarial second agent, which needs agent teams — still experimental and env-gated 205 days after introduction (see below) | Three competing hypotheses that must differ **in kind**, falsifiers written before evidence is gathered, and an `undetermined` verdict distinct from `ruled out`. |
| `verification-planning` | Nothing. Checked directly against the binary's command and skill tables, and found nothing that plans an evidence path | The whole thing. Note the honest counter-argument, which this project has not resolved: Anthropic's own Opus 5 guidance names *"legacy harness scaffolding that adds separate verification steps"* for removal, and that description fits. This is the component to put through an ablation first, not the one to cut on a vendor sentence. |
| `deep-interview` | Plan mode plans the **change** | Nothing native elicits requirements from an underspecified request and then **hard-stops for approval**. The stop is the mechanism, and it is the largest measured effect anywhere in this project's evidence: **+14.50 points for +0.60M tokens** against a control arm. |

## The two crowded slots — removal candidates, with dates

### `explorer` vs the built-in `Explore` agent

Position: candidate for removal, decided by a component ablation rather than by
this document.

Native `Explore` is real and auto-invoked. From the binary:
`{agentType:"Explore", disallowedTools:[…], source:"built-in", model:"inherit", omitClaudeMd:true}`,
with a breadth argument (`quick` / `medium` / `very thorough`) and the docs saying
Claude delegates to it "when it needs to search or understand a codebase without
making changes".

Three residuals, and the second is newly material:

1. **Measured discipline, not just a format contract.** `explorer.md` carries the
   `-l`-before-`-n` search-cost ladder with its measured 29×/69× figures, a
   negative-control protocol, and two named `ast-grep` cautions. Native ships a
   breadth knob.
2. **`Explore` inherits the session model but is capped at Opus.**
   `CLAUDE_CODE_DISABLE_EXPLORE_INHERIT_CAP` escapes it. On a Fable session,
   native `Explore` runs on Opus while `explorer` inherits uncapped. Before
   `fable` existed this was a footnote; it is now a real behavioural difference.
3. **The migration path has a structural cost.** An agent file is re-sent on
   every dispatch. A delegation brief handed to native `Explore` lives in the
   measured ~30%-post-compaction-violation class ([LIMITATIONS.md](./LIMITATIONS.md)),
   so retiring the component trades an enforced surface for a degradable one.

Removal criterion, dated. A component ablation, full build against
build-minus-explorer — scoring **downstream-consumer success** (can the
orchestrator act on the returned locations?) plus token cost. The ablated arm's
native `Explore` receives the map contract as a delegation brief, because that
*is* the migration path under test, compaction cost included. Neither arm is
scored on `explorer`'s own contract text, which the ablated arm loses by
construction. **If that arm has not run by the second minor release after v1.0,
`explorer` is removed on the argument that an unmeasured overlap is an
unjustified one.**

### `review` vs three native tiers

Position: keep, reposition, and measure. The honest comparison target is the free
local `/code-review`, not the paid tiers.

| Tier | What it is | Cost |
|---|---|---|
| `/code-review` | Bundled command, background subagent at every effort level since 2.1.232, `--fix`, effort `low`…`max`, model-invocable via the Skill tool, aliased to `/review` since 2.1.223 | free |
| `ultrareview` | Research preview; also a top-level `claude ultrareview` subcommand. Requires claude.ai auth; unavailable on Bedrock/Vertex/Foundry/ZDR | paid |
| Code Review service | Research preview, Team/Enterprise only, not under Zero Data Retention | **$15–25 per review**, billed as usage credits |

The residual is the **evidence gate**: every finding quoting `file:line` with
severity *and* confidence, seven named lanes including schema and API contract,
and fixing only what is mechanical where native `--fix` applies everything. Two
native facts sharpen the pitch rather than blunt it: `/code-review` does not read
a `REVIEW.md`, and `--fix` edits from a background review land **outside session
checkpoints**, so `/rewind` will not undo them.

The cost side belongs in the position: `review` is the heaviest component in this
plugin, and it sat 298 tokens **over** the post-compaction re-attach cap until
v0.9.2 — against a native tier that costs nothing.

Removal criterion, pre-registered before the run. Seeded-defect diffs with
ground truth, both tools, n≥3, precision *and* recall reported. The judge model
only matches reported findings to seeds; it does not rule on validity, because a
haiku judge is too weak to adjudicate that unaided. `review` survives if its
false-positive-rate spread and the native tool's **do not overlap** across the
seeded sets **AND** its true-positive yield is equal or better. FP rate alone is
not enough: a gate that suppresses findings indiscriminately lowers FP by
lowering recall, and is worse than no gate. Spreads overlap → one enlarged re-run
at doubled n. Still overlap → **the component retires, and the tie goes to the
free native tool**, because a paid layer that cannot demonstrate separation from
a free one has failed its own pitch.

## The complementary slot, and the one that changed this week

### `deepwork` vs `/batch` — different failure classes

`/batch` (v2.1.63, unchanged in shape) fans out 5–30 workers across **isolated
worktrees**, each opening a PR, over units that are *independent* — its own
whenToUse says "sweeping, mechanical change across many files (migrations,
refactors, bulk renames) that can be decomposed into **independent parallel
units**". It is not model-invocable: `disableModelInvocation: true`.

`deepwork` exists for **dependent stages that are only correct when every layer
lands together**. Opposite premise. The README should say so rather than leaving
a reader to assume overlap.

### `deepwork` vs Dynamic Workflows — **the serious one**

This is the row that moved, and it is the strongest native competitor to this
plugin's central claim. Dynamic Workflows are **GA on all paid plans** (Pro
opt-in), not experimental: a JavaScript script orchestrating dozens to hundreds
of subagents through `agent()`, `pipeline()`, `parallel()` and `phase()`, with
resumable runs, a `/workflows` progress UI, prompt-cache-aware staggering, and
concurrency caps. **Plugins can ship a `workflows/` directory.** The
documentation addresses projects like this one directly: *"If you already have an
orchestrator built another way, such as a folder of subagent prompts or a skill
that fans work out, you can point Claude at it and ask for a workflow that does
the same thing."*

The seam is real, and it is quotable from the vendor's own page: workflows have
**no mid-run user input** — *"For sign-off between stages, run each stage as its
own workflow."* A human gate between dependent stages is precisely what
`deepwork` is, and it is what a workflow structurally cannot hold.

The honest risk is not obsolescence, it is reimplementation. A plugin that
shipped `workflows/` would get progress UI, resumability and cache-aware
staggering for free. `deepwork` reimplements none of those and does not try to.
Whether to ship a workflow *alongside* the skill is an open decision, recorded
here so it is not mistaken for an oversight.

## Partial overlaps with a nameable residual

| Component | Native | The residual |
|---|---|---|
| `fixer` | The general-purpose agent | A **constrained** executor: no web search, no subagents, a read-every-caller rule, and one runnable check left behind. Constraint is the product. |
| `designer` | A first-party frontend-design skill | A bounded **writer agent** rather than guidance. Same taste injection, different mechanism — and this is the component the project's own keep/cut audit rated "Yet", meaning it compensates for timidity rather than incapability. |
| `oracle` | `/security-review` covers the security slice (native since Aug 2025 — carried forward from the 2026-08-28 pass and **not re-verified against 2.1.251**; treat as dated) | The **architecture** slice is uncovered, and the assigned-opposing-position mechanism is not a native behaviour. Measured: assigning the opposing position produced 99.2% disagreement against a 48.3% baseline, while merely instructing dissent was statistically indistinguishable from baseline. |
| `simplify` | `/simplify` — *"Review the changed code for reuse, simplification, efficiency, and altitude cleanups, then apply the fixes. Quality only — it does not hunt for bugs"*, model-invocable | Deliberate **Chesterton-fence deletion**: the introducing commit cited, the citation refused on a shallow clone or a move commit, and a declared-public-entrypoint check that runs before anything else. Native does post-change cleanup; this deletes what should never have been written. |
| `codemap` | One `CLAUDE.md`/`AGENTS.md` | Hierarchical per-directory maps. Weakest row in this table, and the project says so — see below. |

## The output style, and the argument with an expiry date

The style is the largest single item in this plugin's static context and, on the
benchmark evidence, the thing that produced its measured win. Its position rests
on one fact:

The only default-on native coordination is subagent auto-delegation, and agent
teams remain experimental and off by default. Verified in the binary:

```
if (!env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS && !argv.includes("--agent-teams")) return false;
```

and in the docs: *"Agent teams are experimental and disabled by default… Without
that variable, no team is set up at session start, no team directories are
written, and Claude does not spawn or propose teammates."* Introduced v2.1.32
(2026-02-05); every changelog entry since is a bug fix, thirteen of them, the
most recent in 2.1.251 fixing *"a teammate's final answer not reaching the team
lead"*. That is not a GA trajectory.

**The expiry condition, stated so it can fire:** the day agent teams go GA and
default-on, this argument is void and the style's position must be re-derived
from scratch. Not weakened — re-derived.

Two further style-slot facts that belong here rather than in a footnote:

- **A fifth built-in style, `Proactive`**, ships in 2.1.251 with no changelog
  entry — *"Claude executes immediately, minimizes interruptions, and prefers
  action over planning"*. It competes for the same job from the opposite
  direction.
- **`context: fork` inherits the parent's full system prompt.** So the standing
  caveat *"styles don't change how subagents respond"* is **too strong**: a
  fork-shaped skill does run under the orchestration style. Earlier statements in
  this repository that the style governs only the main loop are corrected by this
  row.

## Two native surfaces that are not documented, and one that went GA

Recorded because the ledger's job is to be right about the baseline, and the
baseline moved under it twice this week.

**`observer:` is the advisor pattern, shipping and unannounced.** Read from the
2.1.251 binary, gated behind `CLAUDE_CODE_EXPERIMENTAL_OBSERVER_AGENTS`, absent
from the documentation and from a 6,060-line changelog. The frontmatter key
auto-spawns a background agent whenever its parent runs; the observer receives
read-only activity digests and reports through a dedicated `ObserverReport` tool,
never to the worker. Its own framing prompt, verbatim from the binary:

> If — and only if — you notice something genuinely useful (a mistake about to
> compound, a missed constraint, **prior art**), report it with the ObserverReport
> tool — it delivers to \[the coordinator], NOT to the worker… The expected steady
> state is silence.

That is `oracle`'s second opinion and `librarian`'s prior-art role, as a runtime
primitive, with `observeSubagents` and `observerMessage` beside it. It is
experimental, env-gated and undocumented, so nothing here is built on it. It is
also the clearest signal available about where the platform is going, and the
answer is: into this plugin's territory.

**Per-subagent model control went native in August 2026.** The aider
architect/editor split — a strong model plans, a cheap one emits the diff,
reported to roughly halve spend with no measurable quality drop — is now
expressible in agent frontmatter. This plugin's six specialists are the natural
consumers and none of them uses it. `LIMITATIONS.md` records that as an open
choice rather than an oversight.

**Dynamic Workflows are GA**, and the row above states the seam. One number
belongs with it: `ultracode` fires only from a prompt a human typed. It does not
fire from `-p`, an SDK prompt, a scheduled task, a webhook or a PR comment. A
prose layer is re-sent every turn; a workflow is a thing you remember to invoke,
and the failure this plugin exists for happens on turn one.

## Six problem classes this plugin does not name

Each has a working project behind it. Listed so the gap is a decision rather than
an omission.

| Class | Who owns it | Why it is not here |
|---|---|---|
| Crash and compaction survival | `planning-with-files` — plan, findings and progress on disk, re-injected each turn | `LIMITATIONS.md` names compaction eviction as a top failure mode and ships no mechanism for it |
| Cost attribution per rule | `token-warden` — every rule pays rent against a frozen benchmark or is evicted | This plugin ships ~4,300 always-on tokens with no per-component accounting |
| Session resumption as an artefact | native `SessionStart` resume payload, `claude agents` | one hook that reports a condition |
| Codebase indexing as a token strategy | `Graphify` — a queryable graph | `codemap` writes markdown |
| Security posture | ECC's `agentshield`, native `--restricted` | there is no security section in this repository |
| Team conventions and multi-repo | the project that owned this is dying, so the slot is open | flagged as a gap and never taken |

Two classes are genuinely unclaimed, and both are closer to what this plugin is
good at than orchestration is: **drift detection** — does the agent still follow
the rule forty turns in? — and **onboarding quality**.

## `codemap`, and why a mitigation is not a fix

The most-cited artefact complaint in the current corpus, dated 2026-08-27:
*"I spent months blaming the model. The bugs were in my markdown: 50+ pointers to
files that don't exist, 70% dead docs."* `codemap` manufactures exactly that
artefact class, in every mapped directory, plus a section in root `AGENTS.md`
that Claude Code auto-loads into every session.

v0.9.5 made the artefacts state their own freshness: a provenance header on every
generated map carrying the commit and date, a `stale` subcommand that reports per
directory whether the map still describes the tree and exits non-zero when it
does not, and an `AGENTS.md` block that teaches the check instead of commanding
blind trust. It handles the cases that occur — a shallow clone never prints a
distance it cannot compute, which matters because a shallow clone is what CI
checks out and *"0 commits behind"* would be wrong in the reassuring direction.

**It is a real improvement and it does not move `codemap` off the wrong side of
that complaint.** Three reasons, from the pass that built it:

1. **Nothing runs the check.** The only artefact loaded automatically is the
   `AGENTS.md` block, and all it can do is ask an agent to run a command before
   trusting a map. Agents skip instructions — that is the premise this whole
   repository is built on. The failure mode survives: an agent reads a stale map,
   never runs `stale`, acts on it. What changed is that it went from *silently
   wrong* to *wrong unless someone remembers*.
2. **`stale` can prove a map is outdated and never that it was right.** It
   compares hashes. A map whose Flow section was hallucinated on day one reports
   `FRESH` forever — now with a commit SHA beside it, which looks *more*
   authoritative than the unverified map it replaced. No amount of provenance
   metadata reaches that; only reading the code does.
3. **The `AGENTS.md` write remains the most damaging thing the skill does.** It
   is a permanent per-session context tax on every future session in the user's
   repository, for an artefact most of those sessions will not use. It is seven
   lines now and phrased as *verify before relying*, which is the right
   direction. It should probably not be a default step at all.

Underneath all three is the thing the fix cannot touch. **`codemap`'s cost model
is what makes its output rot.** One agent per directory is expensive enough that
nobody regenerates casually, so the artefact has to persist — and persisting is
precisely what makes it go stale. The version of this component that is
unambiguously on the right side of the complaint is a map generated *into the
session* and never committed: an artefact that cannot outlive the tree it
describes cannot lie about it. That is a different component, not a patch to this
one, and it is the open question this row carries into v1.0.

**The obvious next step is deliberately not taken.** Wiring `stale` into the
`SessionStart` hook would make the check fire without anyone remembering, which
is the one thing that would move `codemap` further off the wrong side. It is
small, and it is not being built, because building infrastructure to prop up a
component whose architecture is under question is how a project ends up unable to
cut anything. **Decide whether `codemap` ships in its current form first.** If it
does, the hook is an afternoon; if it does not, the hook was work spent on a
component that left.

Recorded as a decision rather than a gap, because the difference matters: the
work was identified, costed and declined, not overlooked.

## What is not a gap

Recorded so nobody re-opens them as oversights.

- **`Task` vs `Agent`.** `Agent` is canonical and documented; `Task` is an
  undocumented legacy alias that still resolves. Both stay in `disallowedTools`:
  one-level delegation is this plugin's only harness-enforced guarantee, and
  the alias layer is host-configurable. Traced in 2.1.251: `toolAliases` is
  "applied before name resolution", so an aliased call arrives under the mapped
  name; the same build refuses a spawn when a host remap makes a name-bound
  constraint unenforceable, and it validates the deny list, reporting an entry
  that "matches no" tool. A deny list is name-bound, so denying one name and not
  the other bets on a table the host owns. It also costs zero static context. The 2026-08-25 audit called `Task` "a
  dead entry"; it is not dead, and that is the correction.
- **`observer:` / `observerMessage:` / `observeSubagents:`** exist in shipping
  code and in no documentation — a first-party supervisory-critic pattern.
  Attractive, unstable, undocumented, and therefore not built on.
- **`disableBundledSkills`** is the clean lever for A/B-ing this plugin's
  components against their native counterparts. It belongs to the measurement
  wagon, not to this ledger.
