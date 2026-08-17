# omc-slim — research notes

> **Status: research current to v0.5.0, written 2026-08-13** —
> <https://github.com/mdrubelamin2/omc-slim>. The plugin has shipped well past
> this point; see `README.md` and `MAINTAINERS.md` for the current state. This
> file is an append-only research log: later sections correct earlier ones and
> the earlier text is left standing so the reasoning is auditable.
>
> **Read sections 16-19 first.** They contain the benchmark, the routing
> measurements, a regression audit and the delegation-pays question — and they
> overturn several conclusions in sections 2b, 6d and 10, including "delegation
> is gated" (wrong: most components route automatically). The static-context
> figures below stop at ~3,660 tokens for v0.6.0 and did not only rise after
> that; several later versions cut them. `README.md` carries the measured
> current figure.

Research date: **2026-08-13**. Everything below was verified on that date and will
rot; the upstream projects move fast (OMC ships ~35 npm versions/month).

Goal of this project: port the useful parts of
[`alvinunreal/oh-my-opencode-slim`](https://github.com/alvinunreal/oh-my-opencode-slim)
(omo-slim) to Claude Code, without reproducing the failure modes that
[`Yeachan-Heo/oh-my-claudecode`](https://github.com/Yeachan-Heo/oh-my-claudecode)
(OMC) hit at scale.

---

## 1. What omo-slim actually is

An OpenCode plugin. 337 TypeScript files, but most of that is OpenCode-specific
runtime plumbing that has no Claude Code equivalent and should not be ported.

The portable value is small:

- **7 agent prompts** — orchestrator, explorer, oracle, council, librarian,
  designer, fixer (plus observer). Stored as inline TypeScript template literals
  in `src/agents/*.ts`, e.g. `EXPLORER_PROMPT`. Extractable to markdown by hand.
- **9 skills** — `deepwork`, `reflect`, `simplify`, `codemap`,
  `verification-planning`, `worktrees`, `clonedeps`, `loop-engineering`,
  `oh-my-opencode-slim`. Already in `SKILL.md` format, but only 2 copy over
  verbatim — see section 2c. `codemap` bundles `scripts/codemap.mjs`, which
  Claude Code skills support.
- **2 MCP servers** — context7, grep-app.
- **A handful of hooks** — the two worth keeping are `phase-reminder` and
  `post-file-tool-nudge`.

### OpenCode plugin surface it uses

From the object returned at `src/index.ts:573`:

```
agent, tool, mcp, config, event, dispose,
tool.execute.before, tool.execute.after,
command.execute.before, chat.headers, chat.message,
experimental.chat.system.transform,
experimental.chat.messages.transform
```

---

## 2. Mapping to Claude Code

| omo-slim | Claude Code | Cost |
|---|---|---|
| `agent` (7 agents, inline TS prompts) | `agents/*.md`, frontmatter + body | free — copy the prompt text |
| `skills/*/SKILL.md` | `skills/*/SKILL.md` | free — identical format |
| `mcp` (context7, grep-app) | `.mcp.json` — both are **remote HTTP MCP servers**, verified live | free, verbatim |
| `tool` (ast_grep, webfetch, cancel_task, wait_for_user) | MCP server only — the CLI cannot register in-process tools | ast-grep via Bash + `sg` binary; webfetch is built in |
| `tool.execute.before` / `.after` | `PreToolUse` / `PostToolUse` hooks | direct; shell script, JSON on stdin |
| `command.execute.before`, `chat.message` | `UserPromptSubmit` hook | direct |
| `event` (session lifecycle) | `SessionStart` / `SessionEnd` / `SubagentStop` | direct |
| Background orchestration | `Agent` tool — parallel calls in one message, `run_in_background` | native, free |
| Council (N models on one question, then synthesize) | N parallel `Agent` calls + a synthesizer skill | direct |
| `/preset` runtime model swap | script rewriting the `model:` line in `agents/*.md` | small script; `permissions` and `hooks` hot-reload, agents need `/reload-plugins` |
| Multiplexer panes, Rust companion window | nothing native | skip |

### Hard gaps — no Claude Code equivalent

1. **`experimental.chat.messages.transform`** — message history cannot be
   rewritten before it is sent. This kills omo-slim's cache-safe-injection,
   system-collapse, and rewrite-based JSON error recovery.
2. **`experimental.chat.system.transform`** — output styles are init-only, not
   per-turn.
3. **`chat.headers`** — no custom HTTP headers on model requests.
4. **Cross-provider per-agent models** — Claude Code agents choose among
   `opus` / `sonnet` / `haiku` / `fable` only.

Gap 4 is less damaging than it first appears. `DEFAULT_MODELS` in
`src/config/constants.ts` sets **every agent to `undefined`** — omo-slim ships
with no per-agent model defaults at all, and every agent inherits the session
model. Cross-provider mixing is entirely user-configured via
`oh-my-opencode-slim.json`. So the defaults port cleanly; only a user's own
Frankenstein config is lost, and Claude Code's opus/sonnet/haiku tiering
substitutes for it.

A fifth gap, found later and easy to miss: **no `temperature` in Claude Code
agent frontmatter.** omo-slim tunes it per agent — explorer, oracle, librarian,
observer, council and orchestrator at `0.1`, fixer at `0.2`, and **designer at
`0.7`**. The designer's high temperature is deliberate (it is the one agent
asked to be creative). That knob does not exist in the port; compensate in
prose inside the prompt body.

Also note `DEFAULT_DISABLED_AGENTS = ['observer']` — observer ships off by
default and needs a vision-capable model.

> Source note: this mapping came from a docs-research pass that also claimed
> Claude Code subagents cannot run in parallel. **That claim is wrong.**
> Multiple `Agent` tool calls issued in one message run concurrently, and
> `run_in_background` defaults to true. Background orchestration is the one
> omo-slim feature that is free.

---

## 2b. The orchestrator dispatch protocol (read on 2026-08-13)

`src/agents/orchestrator.ts` — 343 lines. This was previously the one unread
file that the port depends on. It is now read; findings below.

Structure: `AGENT_DESCRIPTIONS` is a record of one block per specialist, each
with Lane / Role / Permissions / **Stats** / Capabilities / *Delegate when* /
*Don't delegate when* / *Rule of thumb*. `buildOrchestratorPrompt()` filters
those blocks by the disabled-agent set and assembles them into a single prompt
with `<Role>`, `<Agents>`, `<Workflow>` and `<Communication>` sections.

The Stats lines are relative and self-referential — "2x faster than
orchestrator, 1/2 cost of orchestrator", "5x better decision maker", "10x
better UI/UX", "3x slower and 3x cost". They only mean anything if the models
actually differ per agent. **In the port these must be rewritten as concrete
Anthropic tiers** (haiku/sonnet/opus) or deleted; left as-is they are a lie the
orchestrator will act on.

### Mechanics that must be translated

| omo-slim mechanic | Claude Code equivalent | Note |
|---|---|---|
| `task(..., background: true)` | `Agent(..., run_in_background: true)` | background is already the default |
| `task_id` to resume a specialist session | **`SendMessage` to the agent's ID or name** | genuine equivalent — resumes with context intact; a fresh `Agent` call starts clean |
| Background Job Board (`fix-1 / ses_abc / fixer`) | `TaskList` / `TaskGet` / `TaskOutput`, plus `ListAgents` | |
| Orchestrator wake scheduler | automatic — the harness re-invokes on subagent completion | no polling needed, which the prompt already forbids |
| `cancel_task` | `TaskStop` | |
| `question` tool | `AskUserQuestion` | |
| `wait_for_user` | **no equivalent** | closest is ending the turn after giving manual steps. The prompt already has a fallback branch for when `wait_for_user` is disabled — use that branch verbatim |
| "Reusable Sessions" vs "Active / Unreconciled" board sections | no such distinction exists | a running agent simply cannot be messaged mid-flight; drop the whole *Active Task Amendments* subsection |
| `ast_grep_search` (referenced throughout the prompts) | Bash + the `sg` binary | referenced in explorer, oracle, councillor and the shared rules constants — every mention needs rewriting |

### Sections that port unchanged

`<Role>`, Workflow steps 1-4 (Understand / Path Selection / Delegation Check /
Plan and Parallelize), Todo Continuity, Design Handoff Discipline, step 6
Verify, and the entire `<Communication>` block (Clarity Over Assumptions,
Concise Execution, No Flattery, Honest Pushback). That is most of the prompt.

The *Delegation Contract* — "every delegation names a validation owner and
allowed scope" — is the single best idea in the file and costs one line.

### Shared rule constants

`src/config/constants.ts` exports three blocks that every agent prompt
interpolates: `WRITABLE_FILE_OPERATIONS_RULES`,
`READONLY_FILE_OPERATIONS_RULES`, and `NO_SHELL_READONLY_FILE_OPERATIONS_RULES`
(councillor only). They all name OpenCode tools (`glob`/`grep`/`ast_grep_search`
/`read`/`edit`/`write`/`apply_patch`). Rewrite once into Claude Code tool names
and paste into each agent body — there is no include mechanism in agent
markdown.

Amusing note: the read-only rules say *"Do not use cat/head/tail/sed/awk only to
read code into context"* — the same instruction Claude Code's own Bash tool
description gives.

### Council mechanics

Two agents, not one. `councillor` is a read-only advisor with an explicit
deny-all-then-allow permission model, dispatched N times in parallel by the
orchestrator under seat names (`alpha`, `beta`, …) with the model overridden per
seat. `council` has **no tools at all** and only synthesizes the councillor
outputs the orchestrator pastes into it, emitting a fixed three-section report:
Council Response / Per-Councillor Details / Council Summary (with Consensus
Level: unanimous | majority | split).

This ports cleanly: N parallel `Agent` calls to a `councillor` agent, then one
`Agent` call to `council` carrying their outputs. Seat names survive; per-seat
*models* are limited to the Anthropic tiers, which weakens the point of a
council somewhat — diversity of model, not just of sample, is what makes
disagreement informative. Consider varying `effort` per seat as a partial
substitute.

### grep-app and context7 — resolved

Both are **remote HTTP MCP servers**, not in-process OpenCode tools. From
`src/mcp/`:

- `gh_grep` → `https://mcp.grep.app`, no OAuth, no key
- `context7` → `https://mcp.context7.com/mcp`, optional `CONTEXT7_API_KEY` header

Verified live on 2026-08-13: both return `200 text/event-stream` to a JSON-RPC
`initialize` POST. They drop straight into `.mcp.json` as `type: "http"`. This
is easier than earlier assumed — no Bash-script fallback needed.

### Measured static context budget

The number that matters, given section 4. Measured on 2026-08-13 by building the
real prompt and summing real files (chars ÷ 4):

| Component | Static cost |
|---|---|
| Orchestrator prompt, default set with observer off | **~4,525 tokens** (18,101 chars) |
| Orchestrator prompt with all 8 specialists enabled | ~4,825 tokens (19,299 chars) |
| 9 skill *frontmatter descriptions* | **~520 tokens** (2,083 chars) |
| 8 agent descriptions | ~350 tokens (estimate) |
| **Total** | **~5,400 tokens** |

For contrast: the 9 skill *bodies* total 62,896 chars (~15,700 tokens), but
Claude Code only loads a skill's frontmatter until it is invoked (confirmed, not
inferred — see section 4a).

### ⚠️ Correction: the "9x lighter than OMC" claim was wrong

An earlier draft of this document claimed ~5,400 tokens against OMC's ~48K,
"roughly a 9x difference", and called it the main argument for building this.
**Section 4a killed that.** The 48K figure is April 2026 data and OMC fixed it;
measured against a real install on 2026-08-13, OMC's startup context is
**~2,671 tokens**.

| | Startup static context |
|---|---|
| OMC today (38 skills, 19 agents, CLAUDE.md) | **~2,671 tokens** |
| omc-slim as proposed, orchestrator in main context | **~5,400 tokens** |
| omc-slim, orchestrator as a subagent | ~900 tokens |

**As designed, omc-slim would be twice as heavy at startup as the thing it is
supposed to be leaner than.** The whole ~4,525-token orchestrator prompt is the
cause; the 9 skills are nearly free at ~520 tokens.

This does not mean OMC is cheap — section 4b measures it spending +60% tokens
per problem, and section 4a shows why: the waste moved from startup to *runtime*
injection (uncapped rule bodies, uncapped prompt echo, unthrottled
post-tool-verifier, no cap on subagent results). OMC is lean at rest and
expensive in motion.

The honest reframing: **omc-slim's advantage is not a smaller startup footprint,
it is the absence of runtime injection.** No Stop hook, no per-tool-call nudges,
no uncapped rule concatenation. That is a real advantage and it is what design
rules 2 and 5 already encode — but it has to be argued on runtime behaviour, not
on a static-context number that no longer favours us.

### Open design decision (now load-bearing)

Where the orchestrator prompt lives:

- **Main context** (`CLAUDE.md` or an output style): ~4,525 tokens, orchestrator
  stays primary and can coordinate the session. Total ~5,400 — heavier than OMC.
- **Subagent**: ~900 tokens total, but it is no longer primary and cannot
  coordinate.

In omo-slim the orchestrator **is** the primary agent, so the first option is
faithful and the second is a different product.

**A third path, now measured (2026-08-13).** The `<Agents>` block —
the `AGENT_DESCRIPTIONS` prose — is **7,315 chars / ~1,829 tokens, 40% of the
whole orchestrator prompt.** Claude Code already surfaces each subagent's
`description` to the model automatically, so most of that block is duplicated
work. Dropping it entirely:

| Variant | Prompt | Total startup |
|---|---|---|
| Full prompt as-is | 4,525 tok | ~5,400 tok |
| **Minus the `<Agents>` block** | **2,718 tok** | **~3,600 tok** |
| Minus `<Agents>`, keeping *Delegate when* lines only | ~3,100 tok (est.) | ~4,000 tok |

Even the aggressive cut lands at ~3,600 versus OMC's ~2,671 — still heavier.
Parity requires either the subagent layout or a genuinely rewritten, much
shorter orchestrator prompt.

The middle row is probably the right target: keep the *Delegate when / Don't
delegate when* heuristics (they encode real routing judgment that a one-line
`description` cannot), drop the Lane/Role/Permissions/Stats/Capabilities prose
(redundant with frontmatter, and the Stats numbers are fabricated relative
figures that need rewriting anyway — see the top of this section).

---

## 2c. The skills do NOT copy over verbatim

**Correction to an earlier claim in this document.** The `SKILL.md` *format* is
identical between OpenCode and Claude Code, so the files load — but the
*contents* name OpenCode tools, OpenCode itself, and omo-slim's own `@agent`
handles. Counted on 2026-08-13 by grepping each body for OpenCode-specific
tokens:

| Skill | OpenCode-specific references | Action |
|---|---|---|
| `loop-engineering` | none | **copy verbatim** |
| `simplify` | none | **copy verbatim** |
| `verification-planning` | 1 (`@librarian`) | one-line edit |
| `worktrees` | 7 (`oh-my-opencode`×4, `OpenCode`, `@fixer`, `@designer`) | small edit |
| `deepwork` | 10 (`@designer`×3, `@librarian`×2, `@fixer`×2, `@oracle`, `OpenCode`×2) | rewrite agent handles |
| `codemap` | 11 (`OpenCode`/`opencode`×8, `oh-my-opencode`×3) | rewrite references; also check `scripts/codemap.mjs` |
| `reflect` | 21 (`OpenCode`/`opencode`×15, `oh-my-opencode`×6) | substantial rewrite |
| `clonedeps` | 24 (`opencode`×17, `oh-my-opencode`×4, `@librarian`×3) | substantial rewrite |
| `oh-my-opencode-slim` | 57 | **drop it** — it is a self-configuration skill for the OpenCode plugin |

So: 2 free, 2 nearly free, 4 needing real edits, 1 deleted. The day-long
estimate in section 7 still holds, but the skills are not the freebie they were
described as. When rewriting, note that `@agent` mention syntax has no Claude
Code equivalent — the orchestrator invokes subagents through the `Agent` tool,
so those references become prose ("delegate to the librarian agent").

---

## 3. Existing ports — do not rebuild what exists

| Repo | Stars | Last push | Verdict |
|---|---|---|---|
| [Yeachan-Heo/oh-my-claudecode](https://github.com/Yeachan-Heo/oh-my-claudecode) | 38,527 | 2026-08-12 | Alive. Not a port of omo-slim — "inspired by" `code-yeongyu/oh-my-opencode`, the *original*. Sibling, not descendant. 19 agents, 42 skills. |
| [sangrokjung/claude-forge](https://github.com/sangrokjung/claude-forge) | 803 | 2026-07-16 | Adjacent. 11 agents, 36 commands, 15 skills. Not a port. |
| [2lab-ai/oh-my-claude](https://github.com/2lab-ai/oh-my-claude) | 36 | 2026-07-15 | Only ports the ralph-loop idea. |
| [stefandevo/oh-my-claude](https://github.com/stefandevo/oh-my-claude) | 7 | 2026-01-10 | Explicitly "Port of oh-my-opencode". **Archived. Dead.** |
| [cryptotavares/oh-my-claude-code](https://github.com/cryptotavares/oh-my-claude-code) | 0 | 2026-01-14 | "Simplistic setup". Abandoned. |

Both literal ports are dead. The two live options are re-implementations of the
original, not of the slim fork.

OMC does **not** contain omo-slim's pantheon (Explorer / Oracle / Council /
Librarian / Designer / Fixer) or its `deepwork` / `reflect` /
`verification-planning` skills. That is the remaining gap worth filling — as a
small plugin layered on top of OMC, not as a from-scratch orchestrator.

---

## 4. OMC's token-consumption problems

**This section is the reason this document exists.** These are the specific
failure modes to design against.

The advertised "30-50% token savings from smart model routing" is
**vendor-stated**. Every review blog repeats it verbatim. No published
benchmark, no methodology — and an independent one now measures the opposite
sign. **Read section 4b before this one.**

Two opposing forces are at work. Per-agent model tiering (explore → Haiku,
executor → Sonnet, architect/critic → Opus) genuinely saves. Everything else
costs.

### Measured failures, all filed by users with evidence

| Issue | Measured cost |
|---|---|
| [#2577](https://github.com/Yeachan-Heo/oh-my-claudecode/issues/2577) | **~48K tokens of static context before the user types anything.** 79 global skills with no stack filtering (~8K), rules duplication (~1.5K), `.claude/CLAUDE.md` written to both global and project scope (~900) |
| [#2652](https://github.com/Yeachan-Heo/oh-my-claudecode/issues/2652) | Stop-hook infinite loop from stale session state. Reporter: "4-5x more tokens than necessary, potential 10x+ in week-long loops." `state_clear` fired 51 times |
| [#2542](https://github.com/Yeachan-Heo/oh-my-claudecode/issues/2542) | Full task prompt re-injected uncapped on every Stop hook. A 50-iteration ultrawork run with a 3000-char prompt adds ~150KB of pure redundancy |
| [#959](https://github.com/Yeachan-Heo/oh-my-claudecode/issues/959) | Stop hooks block compaction while context is already full — deadlock. PreToolUse/PostToolUse injection alone adds 3,000-10,000+ tokens of overhead per session |
| [#1373](https://github.com/Yeachan-Heo/oh-my-claudecode/issues/1373) | Agent results flood the main context until `/compact` itself fails. "Session completely unrecoverable, only escape is `/clear`" |
| [#3095](https://github.com/Yeachan-Heo/oh-my-claudecode/issues/3095) | The routing doctrine was **text-only and unenforced**. Measured: 0 agents spawned across 35+ tool calls, 100% of work on main-context Opus. The advertised savings mechanism was simply not firing |

All are marked closed. **Section 4a re-verifies each against current source —
two are not actually fixed.**

Real-world datapoint: [sonim1](https://sonim1.com/en/blog/oh-my-claudecode) — 4
days of heavy use, `ccusage` reported ~$200 of token consumption, subscription
limit hit 5 times over one weekend.

Independent assessments:

- [ice-ice-bear](https://ice-ice-bear.github.io/posts/2026-03-20-oh-my-claudecode/):
  "The 5-stage pipeline consumes significantly more tokens than pure Claude
  Code."
- [ShipWithAI](https://shipwithai.io/toolkit/oh-my-claudecode/): "Token cost
  multiplied: parallel agents = multiplied burn rate."

**Net:** routing saves per task; static context, hook overhead, and parallel
fan-out cost more. Whether you come out ahead depends entirely on task size. For
small tasks, OMC is strictly worse than vanilla Claude Code.

---

## 4a. Re-verification against current source (2026-08-13)

Issue "closed" status and maintainer comments were **not** trusted. Current code
was cloned and read, hooks were fired with crafted stdin against a sandboxed
install, and the two load-bearing verdicts were re-checked by hand.

Inspected: git HEAD `7e38c1f9` (2026-08-12), `package.json` version **4.15.7**.
The npm `@latest` tarball is **4.15.10** and every decisive file is
byte-identical.

### Structural fact that explains half the results

OMC ships **two divergent copies of its hooks**, plus a third that is dead:

| Path | Used by | Note |
|---|---|---|
| `scripts/*.mjs` | plugin install (`hooks/hooks.json`) | 75,355 B persistent-mode |
| `templates/hooks/*.mjs` | standalone `omc setup` | 65,741 B — **missing guards the plugin has** |
| `src/hooks/**` → `dist/` | **nothing** | wired to no hook registration |

Verified: `hooks/hooks.json` references only `scripts/*.mjs`. Grepping for
`dist/hooks/persistent-mode` finds hits **only** in a build-artifact manifest,
never in a hook registration.

### Verdicts

| Issue | Verdict |
|---|---|
| #2577 static context | **CONFIRMED FIXED** — off by ~18× |
| #2652 stale-session Stop loop | **CONFIRMED FIXED** |
| #2542 uncapped prompt echo | **STILL PRESENT** |
| #959 compaction deadlock | **PARTIALLY FIXED** — detector yes, circuit breaker no |
| #1373 agent results flood | **PARTIALLY FIXED** — breaker exists, bypassed on `Agent` |
| #3095 routing unenforced | **PARTIALLY FIXED** — hook exists, ships inert |

### #2577 — fixed, and the 48K figure is obsolete

`src/installer/index.ts:53` — `export const CORE_COMMANDS: string[] = []` with
the comment *"Core commands - DISABLED for v3.0+ … The installer no longer
copies commands to ~/.claude/commands/"*. A live install printed *"Successfully
installed 19 agents, 0 commands, 38 skills"* and never created
`~/.claude/commands/`. Nothing writes `~/.claude/rules/`. The two CLAUDE.md
writes are mutually exclusive by construction (`index.ts:2249` writes global only
`if (!projectScoped)`).

Measured from the actual installed tree (`name:` + `description:` frontmatter
plus CLAUDE.md, chars ÷ 4):

| Source | Count | Bytes |
|---|---|---|
| skills name+desc | 38 | 4,034 |
| agents name+desc | 19 | 1,713 |
| commands | 0 | 0 |
| `~/.claude/CLAUDE.md` | 1 | 4,937 |
| **Total** | | **10,684 B ≈ 2,671 tokens** |

**~2,671 tokens, not ~48,000.** SessionStart injected 0 bytes in a fresh
project. Note there is still *no stack-detection filter* — the mitigation was a
240-char cap on every skill description (`index.ts:1446-1452`) with full bodies
archived to `skill-bodies/`. Different fix, same effect.

**The frontmatter-only assumption is confirmed, not inferred.** Claude Code
surfaces skills to the model as name + one-line description; a skill's body
loads only when it is invoked. This is directly observable in a live session's
skill listing. That resolves the worst case — the 498,828 B of uncompacted
standalone skill bodies never reaches startup context.

### #2542 — STILL PRESENT (verified by hand)

The fix was written and never reached the shipped hook. `src/lib/truncate-prompt.ts`
defines `DEFAULT_PROMPT_ECHO_MAX_CHARS = 150` and its docstring cites the issue
by URL. Its **only** importer is `src/hooks/persistent-mode/index.ts` — which
compiles to `dist/` and is wired to nothing.

Both executing copies interpolate raw. `scripts/persistent-mode.mjs:1370` and
`templates/hooks/persistent-mode.mjs:1140`:

```js
${ralph.state.prompt ? `Task: ${ralph.state.prompt}` : ""}
```

`grep -c truncatePromptForEcho` returns **0** in both. Live reproduction: a
5,009-char ralph prompt produced a 5,282-char `reason`, verbatim, re-emitted
every iteration up to `max_iterations || 100`.

Partial mitigation exists on the *write* side only — `keyword-detector.mjs:408`
caps stored prompts at 500 chars — so the magic-keyword path is bounded at 500,
but the Stop hook applies no cap at emit time and other writers are uncapped.

### #959 — detector fixed, no real circuit breaker

`isContextLimitStop()` exists and matches 9 patterns; live-tested with
`stop_reason: "conversation_too_long"`, compaction was correctly allowed.

But the proposed 5-blocks-in-60s breaker does not exist — only unbounded-in-time
counters. A live hammer test of 40 consecutive Stop events in under 60 seconds
**blocked 18 times** before permanently allowing, the cap being
`if (newCount <= 20)`. Ralph's own cap is `max_iterations || 100`.

Standalone installs are **missing two guards the plugin has** — `stop_hook_active`
re-entrancy and a 95% `CRITICAL_CONTEXT_STOP_PERCENT` fallback. A standalone hook
fed `stop_hook_active: true` still blocked. That is an infinite-loop surface, not
just token waste.

Per-tool-call injection is throttled but not eliminated: matchers are still `"*"`,
`pre-tool-enforcer.mjs` gained 5-minute content-hash dedup, but
`post-tool-verifier.mjs` has none — 188 B on every single Edit, ~7 KB per 100
edits.

### #1373 — breaker exists and is bypassed on today's CLI

No result truncation exists anywhere; nothing caps a subagent's returned text
before it lands in the parent transcript.

A pre-spawn context breaker does exist, and I confirmed the hole by hand.
`scripts/lib/pre-tool-enforcer-preflight.mjs:3`:

```js
const AGENT_HEAVY_TOOLS = new Set(['Task', 'TaskCreate', 'TaskUpdate']);
```

The call site at `pre-tool-enforcer.mjs:1592` guards
`if (toolName === 'Task' || toolName === 'Agent')` — so `Agent` reaches the
preflight, which then does not recognise it. Live at 90% context: `Task` →
blocked; **`Agent` → not blocked**. `Agent` is Claude Code's current fan-out
tool, so **on today's CLI the breaker is bypassed**. It also fails open —
`estimateContextPercent` reads only the last 4096 bytes and returns `0` on any
parse failure.

### #3095 — hook exists, ships inert

`scripts/lib/force-agent-delegation-preflight.mjs` is wired, but gated on a
config-file key with no env override:

```js
if (!cfg || cfg.enforce !== true || !Array.isArray(cfg.rules)) { return null; }
```

No shipped config sets `routing.forceDelegation.enforce`. **On a stock install
this code never executes**, so the out-of-the-box behaviour reported in #3095 is
unchanged. Telemetry counts `agents_spawned` but nothing computes a delegation
rate or consumes it.

### New risks not on the original list

1. **Uncapped rule-file injection on PostToolUse.** `src/hooks/rules-injector/index.ts:131-140`
   concatenates whole rule-file bodies with no size cap. Live: a 19,208-byte
   `.github/copilot-instructions.md` produced **19,394 bytes (~4,800 tokens)
   injected in a single PostToolUse.** Per-session content-hash dedup bounds it
   to once per unique file, but `.github/instructions/*`, `.cursor/rules/*` and
   `.claude/rules/*` compound with no total budget.
2. **Standalone installs lack two Stop-hook safety guards** the plugin has.
3. **4 node processes per tool call** in plugin mode (1 PreToolUse + 3
   PostToolUse, all `matcher: "*"`). Latency and CPU rather than tokens.

### Agent Teams gating is documentation-only

`isTeamEnabled()` is defined in two places and returns `false` unless
`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` is set — but it has **no non-test
caller**. The gating exists in the README and `skills/team/SKILL.md`, not in
code. Correct an earlier note in this document: OMC's *code* does not depend on
the experimental flag, though its documented team workflow does.

### What this changes

OMC **fixed its startup bloat and moved the cost to runtime injection.** Startup
is now genuinely lean at ~2,671 tokens. The remaining waste is per-tool-call and
per-Stop-event: uncapped rule bodies, uncapped prompt echo, unthrottled
post-tool-verifier, and no cap on subagent results. That is consistent with
section 4b, where OMC spends +60% tokens per problem while its *static* footprint
is small.

---

## 4b. Independent benchmark — the 30-50% savings claim is measurably false

**This is the strongest evidence in this document.** Rob Macrae runs a monthly,
reproducible benchmark of agent skill packs at
[orcabot.com/benchmarks](https://orcabot.com/benchmarks) (read 2026-08-13, page
last updated 2026-08-08). Full configs published, pinned commits per run, real
upstream repos mounted read-only rather than paraphrased prompts. Trajectories
confirm 730 of 731 OMC runs actually opened `oh-my-claudecode/AGENTS.md`.

### SWE-bench Pro, July 2026 (729 instances, single seed, 30-min cap)

| # | Arm | Resolve % | Tokens/prob | $/prob | Δ vs base |
|---|---|---|---|---|---|
| 1 | **Oh My ClaudeCode** | **57.20%** | **2.19M** | **$0.53** | **+1.65** |
| 2 | Superpowers v6 | 57.06% | 1.83M | $0.46 | +1.51 |
| 3 | Karpathy Skills | 56.52% | 1.37M | $0.37 | +0.96 |
| 4 | baseline (no skill) | 55.56% | 1.37M | $0.37 | — |
| 5 | Git Ship Done | 55.42% | 2.70M | $0.61 | −0.14 |
| 6 | Agent Skills | 54.46% | 2.07M | $0.52 | −1.10 |

OMC ranks **first on accuracy**. It also spends **2.19M tokens against the
baseline's 1.37M — +60% tokens, +43% cost — to buy +1.65 percentage points.**

Not a 30-50% saving. A measured **43% cost increase**.

The comparison that hurts most is Karpathy Skills: `$0.37/problem`, *identical*
to baseline, for +0.96pp. OMC pays 43% more than that for another 0.69pp. As the
author puts it: *"Every other pack buys its edge with 1.5-2× the tokens, and the
two most expensive arms are the two that now lose to baseline."*

### SlopCodeBench, July 2026 (36 problems, ≤3 seeds)

| # | Arm | Strict | Erosion | Verbosity | $/checkpoint |
|---|---|---|---|---|---|
| 1 | Superpowers v6 | 14.5 ± 2.3 | 0.46 | 0.897 | 1.71 |
| 2 | baseline Codex 5.5 | 13.9 ± 0.5 | 0.59 | 0.827 | 1.26 |
| 3 | Git Ship Done | 13.1 ± 0.5 | 0.53 | 0.895 | 2.02 |
| 4 | Karpathy Skills | 12.9 ± 1.7 | 0.58 | 0.915 | 1.25 |
| 5 | **Oh My ClaudeCode** | **12.1 ± 1.0** | 0.54 | 0.908 | **1.87** |
| 6 | Agent Skills | 11.7 ± 1.5 | 0.47 | 0.900 | 2.00 |

Here OMC is **5th of 6 and below baseline** — 12.1 Strict against 13.9 — while
costing **$1.87/checkpoint against $1.26, +48%**. Worse results, half again the
price.

### Direction of travel

Month over month, OMC's SWE-bench Pro edge **shrank from +2.19 (June) to +1.65
(July)**, and its SlopCodeBench Strict gained only +0.5 against a model-drift
baseline of roughly +1.75. The author's verdict: *"Git Ship Done (+1.2) and Oh My
ClaudeCode (+0.5) came in under drift, on both benchmarks. Their July updates
look net negative: they gave back some of what the model handed them."*

The single most important number on that page is the **baseline's +2.76** — the
underlying model improved more in one month than any pack's total advantage over
it. Skill-pack effects are small quantities riding on a much larger moving one.

Also relevant to design rule 5: in June every pack *restrained* output below
baseline verbosity (0.258-0.300 vs 0.311). By July every pack sat *above* it
(0.895-0.915 vs 0.827). Packs sold on imposing discipline now amplify verbosity
instead of damping it.

### The caveat, stated by the author

> *"Because Codex is a single agent, multi-agent frameworks (OMC, Superpowers)
> were applied as a single-agent sequential pass rather than orchestrated
> sub-agents; this is a faithful adaptation but may understate skills designed
> around native multi-agent tooling."*

So this measures OMC's **skills and rules as a prompt layer on Codex CLI v0.136.0
+ gpt-5.5** — *not* OMC's parallel orchestration on Claude Code, and not its
model routing, which is the mechanism the savings claim rests on. Treat the
accuracy numbers as understating OMC and the **cost numbers as a floor**: adding
sub-agent fan-out on top can only increase token spend, not reduce it.

Every gap is under two points on a single seed. Directional, not settled. But
the direction is unambiguous and it is the opposite of the marketing.

---

## 5. OMC reception

**Correction (2026-08-13): the earlier "near-zero English footprint" claim in
this document was FALSE.** The first search failed because it looked only for
the current repo name.

**The project was renamed.** `Yeachan-Heo/oh-my-claude-sisyphus` 301-redirects to
`Yeachan-Heo/oh-my-claudecode` (verified against the GitHub API). Anything
published under the Sisyphus name is invisible to a search for the current name.
Separately, `code-yeongyu/oh-my-opencode` was itself renamed to
`oh-my-openagent` (67.7K stars) — a different, larger project that OMC credits
as its inspiration. The two get conflated constantly; watch for it.

### The Hacker News thread

[news.ycombinator.com/item?id=46572032](https://news.ycombinator.com/item?id=46572032)
— *"Sisyphus Now Lives in Oh My Claude"*, 2026-01-11, 52 points, 38 comments.
Verified via the HN API and read in full.

Origin context worth knowing: the thread is largely about **Anthropic blocking
oh-my-opencode**. OMC exists because OpenCode's practice of presenting itself as
the Claude CLI to use subscription auth was shut down. OMC is the migration to a
sanctioned harness, not an unprompted greenfield project.

Sentiment is **skeptical to negative**, unusually so for a launch-adjacent post:

- **gbnwl**: *"multi-agent orchestration frameworks usually accomplish vague to
  unnoticable to straight up worse results compared just getting used to the
  vanilla tools before impulsively installing the daily flavor of 'I made Claude
  Code better'… Not a fan of wishfully creating 'expert' agents which amount to
  little more than prompts asking Claude to a good job at the task."*
- **agluszak**: *"Is there any proof that these multi agent orchestrators with
  fancy names actually do anything other than consuming more tokens?"* — as of
  section 4b, there now is, and the answer is roughly "+1.65pp for +43% cost".
- **John23832**: *"installing a bunch of prompt from an hackernews/github account
  with no history seems like something you shouldn't do. Especially with 'silent
  auto-upgrade'."*
- **CubsFan1060**: *"the Readme is far more interested in being angry with
  Anthropic than actually telling me what this is or why I care."*
- **hdra**: *"The readme (and probably most of the project) is likely generated
  by an LLM."*

Qualified praise, **LaurensBER**: *"Opus with an orchestra seems to be faster and
perhaps marginally better than with a more linear approach. Ofcourse this burns a
lot of tokens."*

The best pro-orchestration argument in the thread is **lsaferite**'s, and it is
worth keeping for the port: sub-agent workflows keep the *main* context free of
task-specific working context, so the main session survives longer before
compaction. That is a context-management argument, not a quality argument — and
it is exactly what OMC's own issue #1373 shows going wrong.

**Do not attribute** hdra's harsher hands-on complaint (*"It uses up way more
tokens than the default opencode, for worse results"*) to OMC — the comment
carries an explicit edit saying it referred to `code-yeongyu/oh-my-opencode`.

### Other independent signal

- **1,090 GitHub issues filed by non-owner users** (against 286 by the owner),
  125 contributors with real commit counts. Not a ghost repo.
- Korean dev blogs are genuine but tutorial-leaning. The critical ones:
  [ice-ice-bear](https://ice-ice-bear.github.io/posts/2026-03-20-oh-my-claudecode/)
  and [roboco.io](https://roboco.io/posts/everything-claude-code-vs-oh-my-claude-code/)
  (정도현) — the latter flags *"전체 토큰 소모가 크게 늘 수 있다"* (total token
  consumption can increase significantly) and *"문제 발생 시 원인 파악이 어렵다"*
  (hard to root-cause when problems arise).
- Chinese (juejin, v2ex) and Japanese (zenn, qiita): searched, nothing found.
- Four separate users independently requested **uninstall instructions**
  (#2726, #3368, PR #1655 by robconery). A recurring uninstall request is a soft
  churn signal.
- No thread was found in which an identified user says "I tried OMC and stopped
  using it." Churn evidence is circumstantial, not testimonial.

### Reddit: confirmed unreachable, not confirmed absent

Nine routes tried and failed: reddit JSON API (two hosts, browser UA), the
reddit MCP server, `r.jina.ai` proxy, three Redlib mirrors, DuckDuckGo HTML, and
`WebSearch`. The decisive one: `WebSearch` with `allowed_domains: reddit.com`
returns *"The following domains are not accessible to our user agent"* — a
standing Reddit/Anthropic crawler block, not a local failure. Exa's independent
index also returned zero Reddit results.

**No Reddit thread about OMC was found; whether one exists is unknown.** Do not
cite Reddit either way from this document.

### Usage is declining while stars are not

Measured from the npm registry API on 2026-08-13:

| Month | Downloads |
|---|---|
| 2026-01 | 17,342 |
| 2026-02 | 23,055 |
| 2026-03 | 31,033 |
| **2026-04** | **52,492 (peak)** |
| 2026-05 | 31,015 |
| 2026-06 | 27,654 |
| 2026-07 | 24,635 |
| 2026-08 (13 days) | 8,757 (~20,800 run rate) |

**Down 53% from the April peak, declining every month since.** Meanwhile stars
kept accruing to 38,528.

Supporting oddity: **38,528 stars against 130 watchers — a 296:1 ratio**, where
healthy repos typically run 30-60:1. Verified directly against the GitHub API.

No evidence of purchased or botted stars was found, and the divergence is fully
explained by ordinary "star it, try it, drift away" behaviour. But the shape is a
hype curve past its peak, and that is the relevant fact for deciding whether to
build on top of it.

### Positive, from people who actually ran it

- sonim1, 4 days of real use: model routing and the HUD are the genuine wins;
  only a handful of the 32 agents get used regularly.
- aicoolies: measured a 3-4× speedup on a large refactor via ultrawork mode.

### Critical, substantive

- **Bus factor of one.** Single maintainer. 248 npm versions in ~7 months.
  Breaking changes as a way of life: `swarm` removed in v4.1.7, Codex/Gemini MCP
  servers removed, `autoresearch` hard-deprecated.
- ~~**Depends on an experimental flag.**~~ **Corrected by section 4a.** The
  documented team workflow points at `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS`, but
  `isTeamEnabled()` has no non-test caller — the gating is documentation-only and
  OMC's *code* does not depend on the flag.
- **[#455](https://github.com/Yeachan-Heo/oh-my-claudecode/issues/455)** — the
  most-reacted issue found (10 reactions): "OMC running 6 agents in parallel
  frequently causes interruptions/crashes. Claude Code Agent Team: 16 agents in
  parallel, no interruptions." A user asking OMC to drop its custom
  orchestration in favour of the native one.
- Documentation described as massive and overwhelming; the 32 agents' boundaries
  (architect vs planner, critic vs qa-tester) are unverified as meaningfully
  distinct.
- Orchestration layers reduce traceability — hard to answer "why was this
  decision made".

**Issue-tracker caveat:** as of 2026-08-13 there are 17 open issues, and nearly
all were filed on 2026-08-12 by the maintainer's own bot as epic sub-tasks. The
tracker is maintainer-driven, not community-driven, so a low open-issue count is
**not** evidence of stability.

---

## 6. Design rules for omc-slim

Derived from sections 4, 4a and 4b. Each rule maps to a specific OMC failure
that was **verified present or verified fixed** in current source, not merely
reported in an issue.

**Rules 2, 3 and 5 are the ones that still matter.** OMC fixed its startup
bloat; what it did not fix is runtime injection, and that is where omc-slim's
actual advantage lives (see the correction in section 2b).

1. **No global rules file and no global CLAUDE.md block.** Project scope only,
   written once. OMC fixed this in v3.0+; do not reintroduce it.
2. **No Stop hook that forces continuation.** One design choice caused #2652,
   #2542 and #959. **#2542 is still broken today** — the truncation module was
   written, cites the issue by URL, and is imported only by a file wired to
   nothing, while both shipped hooks interpolate the raw prompt. If a persistent
   loop is ever built, it needs a hard iteration cap, a session-ID match, a
   time-windowed circuit breaker, **and a cap at emit time, not only at write
   time** — OMC has the write-side cap and still bleeds.
3. **Cap what subagents return — in the prompt, because no hook can do it.**
   **Verified 2026-08-13 against the hooks reference:** no hook event can shrink
   or rewrite anything already in the context window, and none can modify a
   subagent's output before it reaches the parent. `PostToolUse` is purely
   additive — *"the tool already ran"*. The only input-modification capability
   anywhere is `PreToolUse.updatedInput`, which acts before execution.

   So this rule is enforced in three places, none of them a post-hoc hook:
   - **Agent prompts**: every specialist gets an explicit output contract and a
     length budget. omo-slim already does this — explorer, fixer and observer
     have `<results>` / `<summary>` / `<changes>` / `<verification>` blocks. Keep
     them and add hard line caps.
   - **Orchestrator dispatch**: "reference paths and lines, don't paste files"
     is already in the prompt. Keep it.
   - **Pre-spawn guard** (rule 3b): since we cannot trim a return, the only other
     lever is not spawning when context is already tight. → #1373.
4. **Use the native `Agent` tool for parallelism.** Not tmux, not a custom
   orchestrator. #455: the native path handled 16 concurrent agents where OMC's
   crashed at 6. **Corollary from 4a:** if you ever write a guard keyed on tool
   names, include `Agent` — OMC's pre-spawn context breaker lists only
   `Task`/`TaskCreate`/`TaskUpdate` and is therefore bypassed on today's CLI.
5. **Do not inject on every tool call, and cap anything you do inject.** OMC's
   `post-tool-verifier` still emits 188 B on every Edit with no dedup, and its
   rules-injector concatenates *whole rule-file bodies* — measured at 19,394
   bytes (~4,800 tokens) in a single PostToolUse. Throttle, dedup, and impose a
   byte budget, or ship no hook at all.
6. **Keep the surface small — but know this is no longer a startup-context
   argument.** OMC ships 38 skills and 19 agents for ~2,671 tokens of startup
   context; omc-slim as designed would cost ~5,400. Small stays worth it for
   comprehensibility and for rule 5, not for a static-context win we do not have.
7. **If a routing doctrine is written down, enforce it or delete it.** #3095's
   enforcement hook now exists but ships gated behind a config key no shipped
   config sets, so stock behaviour is unchanged. A default-off enforcement hook
   is the same as no enforcement hook.
8. **A guard that cannot read its signal must be advisory, not blocking.**
   OMC's `estimateContextPercent` reads the last 4096 bytes of the transcript and
   returns `0` on any parse error, so its context guard silently disables itself.
   "Fail closed" is the wrong fix for a *blocking* guard — blocking every agent
   spawn whenever the signal is unreadable is worse than the bug. The right shape
   is: make the guard **advisory** (warn, never deny), and then failing open is
   harmless. Reserve blocking for guards whose signal is unambiguous.
9. **Ship one copy of each hook.** OMC maintains `scripts/*.mjs` and
   `templates/hooks/*.mjs` in parallel; the standalone copy is missing
   `stop_hook_active` re-entrancy protection and the 95% context fallback that
   the plugin copy has. Divergent duplicates are how a fix reaches half the users.

---

## 6b. Decisions taken (2026-08-13)

Three design questions were put to Rubel; his answers are binding for v1.

### D1 — Fidelity: **native-first redesign**

*Not* a faithful port. Keep omo-slim's agent roles, prompts and routing
judgment; delete every mechanic Claude Code provides natively.

Cut from the orchestrator prompt:

| Cut | Saving | Replaced by |
|---|---|---|
| `<Agents>` description blocks | −1,829 tok | Claude Code surfaces each subagent `description` automatically |
| Background Job Board protocol | ~−400 tok | automatic task-completion notifications |
| Session Reuse rules | ~−350 tok | `SendMessage` to an agent by ID or name |
| Active Task Amendments | ~−300 tok | no equivalent exists; the concept is meaningless here |

Keep: `<Role>`, Workflow 1-4, Todo Continuity, Delegation Contract, Design
Handoff Discipline, Verify, and all of `<Communication>`.

Target: orchestrator prompt **~2,700 tokens**, total startup **~3,600** against
OMC's ~2,671. Still slightly heavier; accepted, because the advantage is runtime
behaviour (section 2b correction), not startup size.

Also resolves **open question 5**: the orchestrator stays in main context as the
primary agent, trimmed rather than demoted to a subagent.

### D2 — Council: **vary effort and stance, same provider**

Cross-provider councillors are impossible (gap 4) and the MCP bridge route was
rejected as brittle — OMC users report exactly that path as *"rather brittle and
hard to get working out of the box"*.

Three seats, each a distinct agent file, differing on two axes that *do* exist in
frontmatter (`model` and `effort`, both confirmed in use locally) plus an
explicitly different analytical stance:

| Seat | model | effort | Stance |
|---|---|---|---|
| `councillor-alpha` | opus | high | risk and failure modes first |
| `councillor-beta` | sonnet | high | simplest thing that works |
| `councillor-gamma` | opus | medium | evidence from the codebase only |

`council` synthesises, holds no tools, and keeps omo-slim's three-section report
format verbatim.

**State the limitation in the README.** This is diversity of *sample and framing*,
not of *model*. It is weaker than omo-slim's multi-provider council and should
not be marketed as equivalent.

### D3 — Hooks: **judged on merit; two ship**

Rubel declined the preset options: *"port hooks that are must needed for a top
quality plugin."* The verification in rule 3 reshaped the answer.

**Decisive constraint:** no hook event can shrink or rewrite context, and none
can cap a subagent's return. `PostToolUse` is purely additive. That removes the
main reason to run anything on the tool-call path — and it *raises* the value of
the pre-spawn guard, because refusing to fan out is the only remaining lever on
subagent flooding.

**Ship two. Both fire on rare events; neither runs per tool call.**

| Hook | Event | Matcher | Behaviour |
|---|---|---|---|
| `verify-deliverables` | `SubagentStop` | `*` | Advisory. Checks the agent actually produced its claimed files. **Emits no `additionalContext`** — on SubagentStop that reinjects into the finishing subagent (OMC #3209/#3233). |
| `spawn-preflight` | `PreToolUse` | `Agent\|Task` | **Advisory warning, never denies.** At high context, tells the orchestrator to prefer sequential work or compact first. Includes `Agent`, which OMC's equivalent omits — the bug found in section 4a. Per rule 8, advisory means failing open is harmless. |

**Rejected, with reasons:**

| Hook | Why not |
|---|---|
| any `PostToolUse` | Cannot modify results, only add. Pure cost. This is where OMC's remaining waste lives. |
| `UserPromptSubmit` phase-reminder | Injects on every prompt. omo-slim had it; it does not earn its place. |
| any `Stop` hook | The ralph/ultrawork pattern. Three of OMC's six token bugs. Hard no. |
| `SessionStart` | Nothing to inject — the orchestrator prompt is already loaded. |
| `SessionEnd` | No persistent state to clean up, by design. |
| `PermissionRequest` | Well-scoped in OMC, but omc-slim has no use for it. |

Runtime injection on the tool-call path: **zero bytes**. That is the whole
runtime-behaviour advantage, made concrete.

---

## 6c. What to take from OMC, and what to leave

Read from OMC's source on 2026-08-13, not from its marketing.

### Take

| From OMC | Why it earns its place | Cost |
|---|---|---|
| **`verify-deliverables` (SubagentStop)** | Guards a real failure its own header names: *"A task can be marked 'completed' with zero output files."* Advisory, non-blocking. | 1 hook (D3) |
| **The bug fix baked into it** | It deliberately emits no `additionalContext`, because on SubagentStop that reinjects into the *finishing* subagent — their regression #3209/#3233. We inherit the lesson without the outage. | free |
| **`deep-interview`** | Socratic questioning with a scored ambiguity threshold, `handoff-policy: approval-required`, and a written spec handoff before any mutation. omo-slim has nothing comparable; `verification-planning` starts after the goal is already clear. | 1 skill |
| **`tracer` agent** | *"Evidence-driven causal tracing with competing hypotheses, evidence for/against, uncertainty."* Genuinely distinct from oracle, which advises rather than investigates. | 1 agent |
| **Model tier in the user-facing description** | OMC writes "(Opus, READ-ONLY)", "(Haiku)" into agent descriptions. Tells the *user* what a delegation costs, not just the router. Free honesty. | free |
| **Narrow matchers as the default** | Their `PermissionRequest` on matcher `Bash` is the one hook they scoped correctly. Copy the discipline, not the hook. | free |
| **Ecomode as a concept** | A one-command cost-tier switch. Ours can be a script rewriting `model:` lines across `agents/*.md`. Deferred past v1. | small |

### Leave

| Not taking | Reason |
|---|---|
| 19 agents, 38 skills | Surface area is the thing we are competing on. |
| ralph / ultrawork / persistent modes | Source of #2652, #2542 and #959 — three of six token bugs from one pattern. |
| tmux worker orchestration | Native `Agent` fan-out handled 16 concurrent where theirs crashed at 6 (#455). |
| HUD statusline | Praised by users, but caused 429 spirals (#1398) and multi-session polling stampedes. Revisit only if `ccusage` proves insufficient. |
| Two divergent hook copies | Section 4a: the standalone copy is missing two safety guards the plugin copy has. |
| Default-off enforcement hooks | #3095 ships inert. A guard nobody enables is not a guard. |
| `rules-injector` | Concatenates whole rule-file bodies uncapped — 19,394 bytes measured in one call. |

### Natives that OMC does not use at all

Checked its tree: **no `output-styles/`, no `.lsp.json`, no `monitors/`, no
themes.** It reimplements in hooks and tmux what the platform now provides. Ours
should reach for these first:

- **`isolation: worktree`** on agents — does natively most of what omo-slim's
  173-line `worktrees` skill describes in prose.
- **`context: fork`** on skills — isolated execution without a separate agent.
- **`effort`** in agent frontmatter — confirmed in local use; the substitute for
  omo-slim's per-agent `temperature`, and the mechanism behind D2.
- **`SendMessage`** — replaces the entire Session Reuse protocol.
- **`TaskList` / `TaskOutput`** — replace the Background Job Board.
- **`PreToolUse.updatedInput`** — the only hook capability that can change
  anything before it happens. Unused in v1, but it is the one real lever if a
  future need appears.

---

## 6d. Other packs worth raiding — and the number that should scare us

Requested: adapt the best of **Karpathy Skills** and **Agent Skills** without
regressions, and consider **ponytail**/**caveman**-style capabilities in v2. All
four were read on 2026-08-13; three are installed locally, Karpathy was cloned at
the benchmark's pinned commit.

### Karpathy Skills — read this before designing anything else

The efficiency standout in section 4b — matched baseline token spend and cost
*exactly* (1.37M, $0.37) while resolving ~1 point more — is
[multica-ai/andrej-karpathy-skills](https://github.com/multica-ai/andrej-karpathy-skills),
**201,865 stars**, cloned at `2c60614` (2026-04-20), the exact commit the
benchmark pinned. Unchanged since April, which is why it served as the control
arm.

Its entire payload:

| File | Bytes | ~tokens |
|---|---|---|
| `CLAUDE.md` | 2,357 | **~589** |
| `skills/karpathy-guidelines/SKILL.md` | 2,518 | ~630 (frontmatter only at rest) |

**~589 tokens of CLAUDE.md and one skill.** No agents. No hooks. No MCP. No
orchestrator. 65 lines and four headings: Think Before Coding / Simplicity First
/ Surgical Changes / Goal-Driven Execution.

Put that against the field:

| Pack | Static cost | SWE-bench Pro Δ vs baseline | SlopCodeBench |
|---|---|---|---|
| **Karpathy** | **~589 tok** | **+0.96 at zero extra cost** | 12.9 |
| OMC | ~2,671 tok | +1.65 at **+43% cost** | 12.1 (below baseline) |
| omc-slim as planned (D1) | ~3,600 tok | untested | untested |
| Agent Skills (24 skills) | 1,826 tok frontmatter alone | **−1.10** | 11.7 (last) |

**The uncomfortable reading: sophistication correlates negatively with results in
this dataset.** The smallest pack won on efficiency; the largest lost to doing
nothing. omc-slim is currently planned at six times Karpathy's static cost with
no evidence it buys anything.

Worse — or better, depending on how it is used — **omo-slim's orchestrator prompt
already contains most of Karpathy's content**, diluted across 4,525 tokens:

| Karpathy section | Already in omo-slim as |
|---|---|
| 1. Think Before Coding | `<Communication>` → Clarity Over Assumptions, Honest Pushback |
| 2. Simplicity First | oracle's YAGNI mandate; the `simplify` skill |
| 3. Surgical Changes | partially — Design Handoff Discipline only |
| 4. Goal-Driven Execution | Workflow step 6 Verify; `verification-planning` skill |

**Action for v1:** treat Karpathy's 65 lines as the *compression target* for the
trimmed orchestrator prompt. Where D1's cut leaves a section that Karpathy states
in two lines and omo-slim states in fifteen, take Karpathy's. Section 3, Surgical
Changes, is the one genuinely absent idea — *"every changed line should trace
directly to the user's request"* — and it is four lines. Steal it outright.

### Agent Skills (Addy Osmani) — take the discipline, not the volume

Installed locally at `~/.claude/plugins/marketplaces/addy-agent-skills`. 24
skills, 4 agents, and it measured **worst of every arm at −1.10**, with 1,826
tokens of frontmatter before anything runs. Its own volume is the counter-example,
not the model.

What is genuinely worth taking:

- **Hook discipline.** It registers **exactly one hook** — `SessionStart`. No
  `PostToolUse`, no `Stop`. Against OMC's 20 registrations across 11 events, this
  is the standard to match. D3's two-hook budget is already tighter; good.
- **`doubt-driven-development`** and **`context-engineering`** — concepts with no
  omo-slim equivalent. Read them before finalising the skill list; adopt at most
  one, as content folded into an existing skill rather than a new frontmatter
  entry.
- **`using-agent-skills`** — a meta-skill for skill discovery. Interesting, but
  it is exactly the kind of thing that adds frontmatter cost for indirect
  benefit. Note and skip.

**Regression to avoid:** its `evals/` directory shows it takes measurement
seriously and it *still* landed last. Adopting its skills wholesale would import
the exact profile that lost. Cherry-pick prose into existing skills; do not add
skill entries.

### ponytail — one mechanism is v1-critical, the rest is v2

Installed at `~/.claude/plugins/marketplaces/ponytail`. Skills: `ponytail`,
`ponytail-audit`, `ponytail-review`, `ponytail-debt`, `ponytail-gain`.

Three hooks, and **the scoping is exemplary** — compare D3:

```
SessionStart      matcher='startup|resume|clear|compact'
SubagentStart     (all)
UserPromptSubmit  (mode tracker)
```

**The non-obvious platform fact, worth more than the pack itself.** From
`hooks/ponytail-subagent.js`:

> *"SessionStart context is parent-thread only and never reaches subagents, so
> without this every Task-spawned agent runs ponytail-unaware (issue #252)."*

**Anything injected at `SessionStart` does not reach subagents.** Propagating it
requires a `SubagentStart` hook. This constrains any future omc-slim design that
assumes session-level context is universal — and it is a good argument for
keeping instructions in *agent files*, where each subagent gets them by
construction, rather than in a session hook. **Record this against D3:** it is a
reason our two hooks are enough, not a reason to add a third.

Ponytail also ships a statusline (`ponytail-statusline.sh`) — the OMC HUD idea
without the 429 spiral, because it reads local state instead of polling an API.
Better model if a statusline is ever wanted.

**v2 candidate:** the *content* — YAGNI laddering, "does this need to exist at
all" — overlaps heavily with Karpathy section 2 and omo-slim's `simplify`. Likely
redundant. The `ponytail-audit` whole-repo over-engineering scan is the
differentiated piece.

### caveman — one piece may belong in v1, not v2

Installed at `~/.claude/plugins/marketplaces/caveman`. **Zero hooks.** 3 agents,
7 skills.

Its thesis is output compression, and that lands directly on a problem section 6b
established we cannot otherwise solve. `agents/cavecrew-investigator.md`:

> *"caveman-compressed so the main thread eats ~60% fewer tokens than vanilla
> Explore"*

Recall design rule 3: **no hook can cap what a subagent returns.** The only
levers are the agent's own output contract and the orchestrator's dispatch
discipline. Caveman's cavecrew agents are exactly that lever, implemented — a
read-only investigator that returns a `file:line` table and refuses to suggest
fixes, so the parent never absorbs prose it did not need.

**Recommendation, against the stated v2 preference:** evaluate compressed output
contracts for `explorer` and `observer` in **v1**, not v2. Not caveman's prose
style — the *discipline* of a specialist returning a fixed dense structure. Both
agents already have `<results>` and structured output blocks; tightening them is
free and it is the only mechanism available for rule 3.

The prose-style transformation (caveman voice, ponytail voice) is genuinely v2
and genuinely optional. It is a preference layer, not an engineering one, and it
should never be on by default.

### What this section changes

1. **~589 tokens is the bar.** Every token in omc-slim's orchestrator prompt now
   has to justify itself against a 65-line file that beat every framework on
   efficiency. D1's ~2,700 target may still be too generous — re-examine after
   the first trim.
2. **Skill count is a measured liability**, not a neutral choice. 24 skills
   scored last. Fold ideas into existing skills; resist new frontmatter entries.
3. **Instructions belong in agent files, not session hooks** — `SessionStart`
   does not reach subagents.
4. **Compressed subagent output contracts move to v1** as the only available
   enforcement of design rule 3.

---

## 7. Proposed structure

Zero TypeScript. One plugin repo.

```
omc-slim/
  .claude-plugin/plugin.json
  agents/orchestrator.md           # trimmed to ~2,700 tok — D1
  agents/{explorer,oracle,librarian,designer,fixer,observer}.md
  agents/tracer.md                 # stolen from OMC — see 6c
  agents/{councillor-alpha,councillor-beta,councillor-gamma}.md   # D2
  agents/council.md                # no tools, synthesises only
  skills/{loop-engineering,simplify}/SKILL.md          # verbatim
  skills/{verification-planning,worktrees,deepwork,
          codemap,reflect,clonedeps}/SKILL.md          # edited — see 2c
  skills/deep-interview/SKILL.md   # stolen from OMC — see 6c
  .mcp.json                        # context7 + grep-app, both remote HTTP
  hooks/hooks.json                 # exactly two — D3
  hooks/verify-deliverables.mjs
  hooks/spawn-preflight.mjs
```

`oh-my-opencode-slim/SKILL.md` is dropped. A separate `skills/council/SKILL.md`
is **not** needed — council is agents, not a skill. Note `worktrees/SKILL.md` is
a candidate for deletion too: `isolation: worktree` in agent frontmatter does
natively most of what its 173 lines describe. Decide when editing it.

### Order of work

1. **Decide where the orchestrator prompt lives** (open question 5). Everything
   else depends on it.
2. Extract the 8 prompts from `src/agents/*.ts` template literals into agent
   markdown. Map models: opus for orchestrator and oracle, sonnet for fixer and
   designer, haiku for explorer and librarian. Rewrite the relative Stats lines
   into concrete tiers. Temperature has no frontmatter equivalent — drop it, and
   for designer (0.7) compensate with explicit "be bold, commit to a distinctive
   vision" prose, which its prompt already contains.
3. Copy the 2 clean `SKILL.md` files; edit the other 6 per section 2c.
4. Rewrite the orchestrator prompt's dispatch section: OpenCode's `task` tool
   and job board become Claude Code's `Agent` tool (multiple calls in one
   message, `run_in_background: true`) plus `TaskList` / `TaskOutput` for
   tracking, and `task_id` reuse becomes `SendMessage`. Cut the `<Agents>` block
   per section 2b and re-measure — the target is under ~2,700 tokens.
5. Write `.mcp.json` for context7 and grep-app.
6. **Hooks: default to shipping none.** Per design rule 5 and section 4a, this is
   where OMC's remaining waste lives. If `phase-reminder` or
   `post-file-tool-nudge` are ported at all, they need content-hash dedup, a byte
   budget, and a narrow matcher — never `"*"`. Ship one copy, not a plugin copy
   and a standalone copy.
7. Drop entirely: companion, multiplexer, TUI state, cache-safety harness, the
   preset engine, the interview server, ACP, v2 adapters, apply-patch,
   json-error-recovery.
8. **Measure before declaring done.** Record startup static context and
   tokens-per-task against a plain session. Section 4b is the format to copy; it
   is also the standard nobody else in this space meets.

Estimated effort: about a day for steps 2-7. Step 8 is the one that decides
whether the project was worth doing, and it is not a day.

### Deferred to v2 (recorded 2026-08-13)

Explicitly out of scope for v1, kept here so they are not silently dropped:

- **Prose-style layers** — caveman-style compression and ponytail-style laziness
  as *voice*. Preference features, never default-on. See 6d.
- **`ponytail-audit`-style whole-repo over-engineering scan** — the one
  differentiated piece of that pack; the rest overlaps `simplify`.
- **Ecomode** — one-command cost-tier switch rewriting `model:` lines across
  `agents/*.md`.
- **Statusline** — if ever wanted, copy ponytail's local-state model, not OMC's
  API-polling HUD (429 spirals, #1398).
- **`doubt-driven-development` / `context-engineering`** — adopt as prose folded
  into an existing skill if adopted at all. Never as new skill entries.

Promoted *out* of v2 into v1 by the 6d review: **compressed output contracts for
`explorer` and `observer`**, because they are the only available enforcement of
design rule 3.

**Skipped deliberately:** the Rust companion and tmux integration. Add them only
if watching live panes turns out to be something you actually miss.

---

## 8. Open questions — verify before relying on anything above

1. ~~Does `grep-app` have a real stdio MCP server?~~ **CLOSED 2026-08-13.** It is
   a remote HTTP MCP server at `https://mcp.grep.app`; endpoint verified live.
   See section 2b.
2. ~~The orchestrator prompt body was never read.~~ **CLOSED 2026-08-13.** Read
   in full; the dispatch-protocol translation table is in section 2b.
3. ~~Are OMC's closed token issues actually still fixed?~~ **CLOSED 2026-08-13**
   against git HEAD `7e38c1f9` / v4.15.7 (npm 4.15.10 byte-identical on every
   decisive file). Two of six are **not** fixed. See section 4a.
4. ~~Reddit sentiment is unverified.~~ **PARTLY CLOSED 2026-08-13.** Reddit
   itself is confirmed unreachable (standing crawler block, nine routes tried),
   but the underlying question — does independent critical discussion exist? —
   is now answered **yes**, and the earlier "near-zero footprint" claim was
   wrong. See section 5, and section 4b for the independent benchmark that
   settles the cost question.

Remaining, newly opened by the section 2b read:

5. ~~Where does the orchestrator prompt live, and how much of it survives?~~
   **DECIDED 2026-08-13 — see D1 in section 6b.** Main context, trimmed to
   ~2,700 tokens by cutting the `<Agents>` block and the three
   native-infrastructure protocols.
6. ~~The skill bodies were never read.~~ **CLOSED 2026-08-13, and the earlier
   "copy verbatim" claim was wrong** — see section 2c.
7. **Does omc-slim actually beat baseline?** Unknown and untested. Section 4b
   shows OMC buying +1.65pp for +43% cost and *losing* to baseline on
   SlopCodeBench, and shows Karpathy Skills matching baseline cost exactly while
   gaining +0.96pp. Nothing establishes that a pantheon of prompts beats a plain
   session. Do not assume this project is worth its own token cost until it is
   measured.
8. **Can omc-slim justify 6× Karpathy's static cost?** Sharpened by section 6d.
   The efficiency winner is ~589 tokens of CLAUDE.md with no agents, no hooks and
   no MCP; omc-slim is planned at ~3,600. The honest hypothesis under test is
   that *delegation* — moving work off the main context onto cheaper tiers — pays
   for a prompt Karpathy does not need. That is plausible and it is unproven.
   If the first measurement does not show it, the correct response is to shrink
   toward Karpathy, not to add features.

---

## 9. Recommendation

**Revised twice on 2026-08-13** — first after the independent benchmark (4b),
then again after re-verifying OMC's source (4a). Both revisions are recorded
rather than overwritten, because the reasoning matters more than the conclusion.

What changed: OMC buys +1.65pp on SWE-bench Pro for +43% cost, *loses* to
baseline on SlopCodeBench at +48% cost, and its edge is shrinking faster than the
model is drifting. Usage is down 53% from its April peak. But it also **fixed the
48K static-context problem** this document was largely built around — it now
starts at ~2,671 tokens, less than half what omc-slim would cost as designed.

The position, in order:

1. **A trial is still worth one week**, but treat it as a source of *design
   ideas*, not as a dependency to build on. Watch specifically whether the
   staged plan → verify → fix loop changes your outcomes; that is the part
   sub-agent context isolation genuinely helps with (lsaferite's argument in
   section 5).
2. **Do not layer omc-slim on top of OMC.** Not for the reason the earlier draft
   gave — the static-context tax is gone. The reasons that survive are runtime
   injection (section 4a), a single maintainer shipping ~35 versions a month with
   breaking changes as a way of life, and a declining user base.
3. **Build omc-slim standalone — but the thesis has changed.** The "~9x lighter"
   claim is dead; as designed omc-slim is *heavier* at startup than OMC. The
   surviving argument is runtime behaviour: no Stop hook, no per-tool-call
   injection, no uncapped rule concatenation, and a cap on what subagents return.
   That is a real and defensible advantage, and it is narrower than what this
   document originally claimed.
4. **Settle open question 5 first.** Trim the orchestrator prompt to under ~2,700
   tokens or accept being heavier than the alternative. This is now the gating
   decision, not a detail.
5. **Benchmark it.** Nobody publishes numbers for their own skill pack, which is
   precisely why the orcabot page is the most credible source in this document.
   `orcabot.com/benchmarks` re-runs monthly and publishes its configs — check
   whether omc-slim can be submitted as an arm, or reproduce the setup locally.
   A pack that measures its own cost delta would be unusual and would settle the
   question this whole document keeps circling.

To trial OMC:

```
/plugin marketplace add https://github.com/Yeachan-Heo/oh-my-claudecode
/plugin install oh-my-claudecode
```

Uninstall cleanly afterwards — note from section 5 that four separate users had
to open issues asking for uninstall instructions, so check what it wrote into
`~/.claude/` before and after.

---

## 10. Build log — v0.1.0 (2026-08-13)

Built after the decisions in 6b. What follows is what the build **proved,
disproved, or changed** about the sections above.

### Verified live, not assumed

| Check | Result |
|---|---|
| `claude plugin validate .` | passes clean |
| All 11 agents + 5 skills load in a live session | **confirmed** via `claude --plugin-dir … -p` — every component listed under `omc-slim:` |
| `explorer` subagent honours its output contract end to end | **confirmed** — returned `<files>`/`<answer>`, `file:line` only, no preamble, no fix suggestions |
| `verify-deliverables` hook | 5/5 cases pass, including fail-open on missing transcript and garbage stdin |
| `spawn-preflight` hook | 6/6 cases pass; warns on `Agent` *and* `Task`, silent below threshold |
| Large-transcript tail read | 31 ms on a >256 KB transcript, well inside the 5 s timeout |
| Both MCP endpoints | `200 text/event-stream`; tool names confirmed as `searchGitHub`, `resolve-library-id`, `query-docs` |
| `output-styles/` at plugin root | confirmed supported in the plugins reference |

### Correction to section 2b: omc-slim is **not** heavier than OMC

Section 2b warned that omc-slim as designed would cost ~5,400 tokens against
OMC's ~2,671 — twice as heavy. **The built artefact measures ~2,609 tokens**,
narrowly *under* OMC, with the whole pantheon present.

| Component | Bytes | ~tokens |
|---|---|---|
| output style (main context) | 5,161 | 1,290 |
| 11 agent frontmatters | 4,042 | 1,010 |
| 5 skill frontmatters | 1,233 | 308 |
| **Static total** | **10,436** | **~2,609** |
| skill bodies (load on invoke only) | 26,747 | 6,686 |

The orchestrator came in at **1,290 tokens against a 2,700 budget** — 71% below
omo-slim's 4,525. The D1 cuts were worth more than estimated, and compressing
toward Karpathy's density did the rest.

Still **4.4× Karpathy's 589 tokens.** Open question 8 stands unanswered.

### Correction to section 2c: `loop-engineering` was misjudged

2c listed it as one of two skills that "copy verbatim" because it contained zero
OpenCode-specific *strings*. Reading it revealed it is a client API for a runtime
that does not exist here — `onLoopComplete`, `resolveManualReview`,
`cancel(loopID)`, `BackgroundJobBoard`. **Dropped.** The lesson: grepping for
vendor names does not detect coupling to vendor *architecture*.

### Skill set cut from 9 to 5

Per 6d ("skill count is a measured liability"):

| Skill | Outcome |
|---|---|
| `simplify`, `verification-planning` | shipped, near-verbatim |
| `deepwork`, `codemap` | shipped, references rewritten |
| `deep-interview` | **new**, adapted from OMC |
| `loop-engineering` | dropped — dead runtime client |
| `worktrees` | dropped — `isolation: worktree` does it natively |
| `reflect` | dropped — 16 coupled lines, and it is a meta-skill about improving omo-slim |
| `clonedeps` | dropped — 18 coupled lines; context7 + `searchGitHub` cover most of the need |
| `oh-my-opencode-slim` | dropped as planned |

`reflect` and `clonedeps` are recoverable in v2 if their absence is felt. Both
would need real rewrites, not reference swaps.

Also fixed during the port: `codemap/SKILL.md` shipped two worked examples
describing **omo-slim's own TypeScript source tree**, which survive a
find-and-replace looking correct while being meaningless in a plugin that has no
`src/`. Replaced with a neutral example. Worth remembering — mechanical reference
rewriting leaves semantically dead content behind.

### Two OMC bugs avoided by construction

1. `spawn-preflight` matches `Agent|Task`. OMC's `AGENT_HEAVY_TOOLS` omits
   `Agent`, the current fan-out tool, so its guard never fires (§4a).
2. `verify-deliverables` emits `systemMessage`, never
   `hookSpecificOutput.additionalContext`. On `SubagentStop` the latter reinjects
   into the finishing subagent — OMC's #3209/#3233.

Both hooks are advisory and fail open, per design rule 8.

### Still open

- **Open question 7/8 — does this beat a plain session?** Untested. Nothing here
  measures accuracy or cost against baseline. The README states this plainly
  rather than claiming an improvement.
- **The output style is the single point of failure.** If the user does not
  enable it, the agents load but nothing orchestrates — the plugin degrades to a
  pile of subagents. Worth considering whether the orchestration prompt should
  also exist as an invocable skill for users who prefer their own output style.
- **Council correlated-error caveat is stated, not solved.** D2 accepted this.

---

## 11. Max-effort audit of the build (2026-08-13)

Section 10 reported v0.1.0 as verified. A skeptical re-audit found **seven real
defects**, five of which would have shipped silently. Recorded in full because
the pattern matters more than the fixes: *every one was in something section 10
claimed was working, and every one was found by instrumenting rather than
asking.*

### Defects found and fixed

| # | Defect | Severity | How found |
|---|---|---|---|
| 1 | `tools: []` on `council` granted **All tools** — empty array is treated as unset | high | asked a live session to quote the agent listing |
| 2 | Librarian's MCP tool names were un-namespaced, so **none of them resolved** | high | live session listed the real names |
| 3 | The output style **did not activate at all** — plugin installed inert | critical | live session had no orchestrator instructions |
| 4 | `spawn-preflight` hardcoded a 200K window — would warn at 16% usage on a 1M session | high | reasoning about the running environment |
| 5 | `SubagentStop` matcher `fixer\|designer` **never fired** | high | instrumented the hook and read the log |
| 6 | `verify-deliverables` read `transcript_path` — the **parent** session, not the subagent | high | dumped the real hook payload |
| 7 | An attempted-but-denied write counted as a deliverable | medium | live test where the write was permission-denied |

Plus one self-inflicted regression: **328 tokens of `<!-- -->` rationale comments
inside prompt bodies** — 12% of the static budget spent on notes to maintainers.
Moved to `MAINTAINERS.md`.

### What the audit changed methodologically

**Asking the model is not verification.** Defect 5 was invisible to the obvious
test — "did a warning appear?" — because `systemMessage` goes to the *user*, not
the model. The model answered "NONE" whether the hook fired or not. Only a
wrapper script teeing stdin to a log settled it.

**Section 10's "verified live" was too weak a claim.** It confirmed components
*loaded*. It did not confirm they *worked*. Loading is necessary and nowhere near
sufficient: every one of defects 1, 2, 3, 5, 6 and 7 was present in a plugin that
loaded cleanly and passed `claude plugin validate`.

### Undocumented runtime behaviour established

All of this is now in `MAINTAINERS.md`, and none of it is in the public docs:

- `tools: []` → all tools; a bogus tool name → grants nothing
- Plugin MCP servers namespace as `mcp__plugin_<plugin>_<server>__<tool>`
- Hook matchers are **anchored** — `fixer` does not match `omc-slim:fixer`;
  `(.*:)?(fixer|designer)` does, and survives a plugin rename
- `SubagentStop` payload carries `agent_transcript_path` separately from
  `transcript_path`, and includes `effort`, confirming it is a real agent field
- `force-for-plugin: true` is required for a plugin's output style to apply
- `tool_result.is_error` is the only way to distinguish an attempted write from a
  successful one

### Final verified state

Every claim below was produced by running the thing, not by reading the code.

| Check | Result |
|---|---|
| `claude plugin validate .` | passes |
| 11 agents + 5 skills load | confirmed |
| Output style **active**, orchestrator role in system prompt | confirmed |
| `council` resolves to `Tools: Read` | confirmed |
| `librarian` invoked `mcp__plugin_omc-slim_context7__*` and returned **real cited Context7 docs** | confirmed |
| `explorer` honoured its output contract | confirmed |
| `SubagentStop` fires for fixer only, gets `agent_transcript_path` | confirmed via instrumented log |
| Permission-denied write → **correctly warned** | confirmed live |
| Successful write → correctly silent | confirmed live |
| `verify-deliverables` unit cases | 8/8 |
| `spawn-preflight` window inference | 6/6, including the 1M-context case |
| Comments inside prompt bodies | 0 bytes |

**Static context: ~2,658 tokens** (1,296 output style + 1,054 agent frontmatter +
308 skill frontmatter) — still under OMC's ~2,671, still 4.5× Karpathy's ~589.

### Still unresolved

Open questions 7 and 8 are untouched by this audit. Nothing here measures whether
omc-slim beats a plain session on accuracy or cost. The audit made the plugin
*correct*; it did not make it *justified*.

---

## 12. Extensibility redesign (2026-08-13)

Rubel asked whether omc-slim would use a project's own MCP servers — a
Cloudflare docs server in one repo, a SvelteKit code-generation server in
another. **It would not have.** The question exposed a design flaw the audit in
section 11 had missed entirely.

### The flaw

Every agent used a `tools:` **allowlist**. `librarian` listed exactly six tools.
A Cloudflare MCP in the user's `.mcp.json` is not on that list, so it was
invisible — silently, with no error. The allowlist that made the plugin slim also
made it blind in exactly the projects with the richest tooling.

### What was tested

| frontmatter | result |
|---|---|
| `tools: [Read, Grep]` | exactly those two; project MCP invisible |
| `tools: [Read, "mcp__*"]` | **wildcard expands to nothing** — agent invoked 0 tools |
| `disallowedTools: [Edit, Write, Bash]` | `All tools except …`, **project MCP included** |
| both fields present | `tools` wins; denied entries removed from it |

Wildcards being inert is the decisive finding: there is no way to write an
allowlist that admits future MCP servers.

### The fix

All 11 agents converted from allowlists to denylists. Capability is now bounded
by **role**, not by an enumerated tool list:

| Agents | Denied |
|---|---|
| explorer, oracle, tracer | `Edit, Write, NotebookEdit, Agent, Task` (Bash kept for diagnostics, as upstream) |
| librarian, council, all councillors | `Edit, Write, NotebookEdit, Bash, Agent, Task` |
| fixer | `Agent, Task, WebSearch, WebFetch` |
| designer | `Agent, Task` |

Prompts updated so agents *seek out* project tooling: librarian now ranks a
domain-specific MCP above Context7 and both above WebSearch; fixer and designer
are told to prefer a framework's own server over writing idioms from memory. The
orchestrator gained six lines telling it to check what the project exposes and to
name the tool in the delegation.

### Proof it works

With only a `cfdocs` server in the project's `.mcp.json` — a server the plugin
has never heard of — `librarian` discovered it via `ToolSearch`, invoked
`mcp__cfdocs__search_cloudflare_documentation`, and returned correct sourced
wrangler KV-binding syntax.

**And the safety property survived.** A `librarian` explicitly instructed to
create a file reported `Write`, `Edit` and `Bash` absent from its schema, tried a
lateral escape through the `computer-use` skill, and failed. Read-only is
enforced at schema level, not by refusal.

Also confirmed: **subagents inherit every skill automatically**, including
project-local `.claude/skills/`. Nothing needed doing there — a project-only
`project-widget` skill appeared in a subagent's listing unprompted.

### Cost of adaptivity

| | tokens |
|---|---|
| before redesign | ~2,658 |
| after, first draft | ~2,865 |
| after compressing the new orchestrator section | **~2,748** |

**96 tokens above OMC's ~2,671**, and 4.7× Karpathy. That is the honest price of
adaptivity and it is stated in the README rather than buried.

### Accepted trade-off

A denylist admits any *new* core tool as well as any new MCP server. Guarding is
by denied capability class plus role prompt, not exhaustive enumeration. For a
plugin whose value proposition is adapting to the user's environment, that is the
correct side of the trade — but it is a real weakening versus an allowlist and
should not be described as free.

### Method note, again

Section 11 ran a seven-defect audit and still missed this, because it asked "is
what I built correct?" and never asked "is what I built *the right shape*?".
Correctness auditing does not surface architectural mismatch. The user's question
did.

---

## 13. Blind adaptivity test (2026-08-13)

Rubel's follow-up: the section 12 proof used a **Cloudflare** MCP, and Cloudflare
was named as an example inside `librarian.md`. So the agent may have found the
server because the prompt told it to. **The test proved nothing**, and the
criticism was correct.

### What the contamination was

`grep -ril cloudflare agents/ output-styles/` returned two files. Svelte, Apollo,
Prisma and Stripe returned nothing — so an untainted test was available.

### Blind tests run

| # | Setup | Result |
|---|---|---|
| 1 | Project MCP `sveltedocs`, never mentioned in the plugin. Librarian asked a Svelte 5 question. | Found and used `list-sections` + `get-documentation`. No web search. |
| 2 | Same server. **`fixer`** asked to migrate a component to runes. Fixer's prompt names **no vendor whatsoever**. | Found and used `svelte-autofixer` twice, iterating Edit → autofix → Edit. |
| 3 | Same server renamed **`kb`** — nothing in the name hints at its subject. | Librarian found it, correctly identified it as the Svelte server, queried it 3×. |
| 4 | All vendor names **removed** from the plugin, `kb` server, `$effect` question. | Found it, 3 documentation calls, no web search. |

Test 4 is the decisive one: zero hints anywhere in the plugin, an opaque server
name, and discovery still worked.

### The mechanism, now understood

Agents discover servers by reading tool **descriptions**, not names, and in
environments where tools are deferred they use `ToolSearch` to do it. That is why
an opaquely named `kb` server was still correctly identified.

**Consequence recorded in `MAINTAINERS.md`: never put `ToolSearch` or `Skill` in
an agent's `disallowedTools`.** Denying either breaks discovery silently — the
agent falls back to WebSearch and looks like it is working.

### Change made

Vendor examples removed from `librarian.md` and the orchestrator, replaced with
class-level phrasing ("any MCP server whose tools cover the subject of the
question"). The evidence shows examples were never load-bearing — `fixer` worked
with none — and naming one vendor is arbitrary, costs tokens, and invites exactly
the contaminated test that started this.

Static context after: **~2,774 tokens** (1,419 orchestrator + 1,047 agents + 308
skills).

### Method note

Two audits in a row missed a flaw the user caught in one sentence. Section 11
asked "is it correct?" and missed that the shape was wrong. Section 12 answered
"is it adaptive?" with a test that could not fail. **A test whose subject appears
in the thing being tested is not evidence.** The habit to keep: before believing
a capability test, grep the artefact for the test's own subject.

---

## 14. v0.2.0 — tone baked in (2026-08-13)

Requested: a default, non-configurable terse register plus lazy-engineering
discipline, adapted rather than referenced — no external tone plugin named
anywhere in the artefact.

### What was added

Distilled to behaviour, not branding:

- **Register**: answer first, no preamble or flattery, no decorative tables or
  emoji, shortest decisive error line, verbatim identifiers, no invented
  abbreviations, cut the explanation if it exceeds the code.
- **Build ladder**: exist at all? → already here? → stdlib? → native platform? →
  installed dependency? → one line? → minimum code.
- **Causes not symptoms**: grep every caller before editing the shared function.
- **Floors**: validation at trust boundaries, error handling preventing data
  loss, security, accessibility, anything requested — never simplified away.
- **One runnable check** behind non-trivial logic; name the ceiling and upgrade
  path when knowingly cutting a corner.

### It got *cheaper*

| | orchestrator | total |
|---|---|---|
| v0.1.0 | 1,419 tok | 2,774 |
| v0.2.0 first draft | 1,736 tok | 3,091 |
| **v0.2.0 shipped** | **1,448 tok** | **2,803** |

The draft was +317. Two moves recovered it: rewriting the prompt in the terse
register it is meant to produce (prompt register is imitated, so this both
demonstrates and enforces), and moving the detailed build procedure into
`fixer.md`, where it is paid on invoke rather than every turn. Net cost of the
whole tone layer: **+29 tokens**.

### Verified by running, ambient tone plugins disabled

Both `caveman` and `ponytail` were active in the test environment as SessionStart
hooks, so the first results were worthless — one run even emitted a literal
`// ponytail:` prefix this plugin never mentions. Re-run with
`CAVEMAN_DEFAULT_MODE=off PONYTAIL_DEFAULT_MODE=off`:

| Behaviour | Result |
|---|---|
| Register | baseline: preamble + bold headers + bullets. omc-slim: two direct paragraphs, ~half the length |
| Root cause | fixed `slugify` in the shared module, explicitly noting all three callers were fixed by one diff |
| Surgical | caller files untouched |
| Honest verification | *"I have not run them — `node` needs approval and the request was declined twice"* |
| Runnable check | `src/util.test.js`, 8 assertions incl. `../etc/passwd`, stdlib `node:assert`, **passes** |
| YAGNI | skipped Unicode transliteration, *"nothing in the repo indicated non-ASCII titles"* |

### A real gap the clean re-test exposed

The first clean run produced a correct root-cause fix and **no test file**. Cause:
the check-leaving rule had been moved into `fixer.md`, but the orchestrator
handles small fixes itself, so the rule never applied to its own work. Fixed by
restoring a compact version to the output style, explicitly scoped to "work you
do yourself, not only what you delegate". Re-tested: the check now appears, runs
and passes.

### Method note — same trap, third time

Section 12's adaptivity test was contaminated by naming the vendor. Section 13
fixed that. This section was contaminated by the *environment* already supplying
the behaviour under test. Generalised rule now in `MAINTAINERS.md`: **before
believing a capability test, check whether the environment already supplies the
capability** — not just whether the artefact hints at the answer.

---

## 15. v0.3.0 — adopting CLAUDE.md and fable-mode (2026-08-13)

Requested: fold a personal `~/.claude/CLAUDE.md` and the `fable-mode` skill into
the plugin so neither is needed, without regressions.

### The economics justified it

| | Measured |
|---|---|
| `CLAUDE.md` | 4,230 B ≈ **1,058 tok, every session, every project** |
| `fable-mode` body | 7,516 B ≈ **1,879 tok,per invocation** |
| Combined on a typical task | **~2,937 tok** |

More than the entire plugin. And `CLAUDE.md` made fable-mode *mandatory for any
multi-step task*, so the invocation cost was close to always-on in practice.

Result: **+243 tok standing** (2,803 → 3,046), net **~2,694 saved per task**.

### Placement was the whole design

Only response-shaping rules went into the output style. Procedure went into
skills, paid on invoke. Critically, **fable-mode was folded into the existing
`deepwork` skill** rather than added — same niche, zero new frontmatter, and it
allowed deepwork's OpenCode residue (`.slim/` state paths, "hook-driven
background completion") to be stripped in the same pass.

### Four conflicts, resolved rather than stacked

The sources contradicted each other and the plugin's ladder:

1. **YAGNI vs "every edge case, no phase 2".** Different axes: ladder governs
   surface, completeness governs depth.
2. **"Avoid permission-seeking" vs "ask when unclear".** Never ask permission to
   continue agreed work; do ask which reading applies, before starting.
3. **"Token cost never trims scope" vs the cost thesis.** Concision governs
   writing, not effort or verification.
4. **Mandatory staging vs fable-mode's own "when NOT to use this".** The two
   source files disagreed outright. Kept the skill's trigger discipline — an
   improvement on the original setup, not a faithful port.

### Two compression passes were needed

First draft put everything always-on: +447 tok. Merging eight overlapping
standards blocks into six, and moving procedure into skills, recovered 204 of it.
The redundancy was self-inflicted — three separate blocks were all describing
verification.

### Verified against deliberate bait

A file was planted carrying `// Pre-existing: this has a known bug with negative
numbers. Nobody has fixed it`, plus a bug report whose premise was false. Ambient
tone plugins disabled. The plugin:

- refused the pre-existing exit and investigated
- **corrected the user's premise** — `parseInt('12.50')` returns `12`, not NaN
- found the **planted comment was itself wrong** (negatives parse fine)
- grepped callers before proposing a fix, confirming a single call site
- flagged float drift on a money path and recommended integer minor units
- said plainly it could not run `node`, rather than implying a result
- asked which of two representations to use, with a recommendation

Every adopted discipline fired, including the one hardest to test for: refusing
an offered excuse.

### Standing cost now 5.2× Karpathy

3,046 vs 589, and ~375 above OMC. The behavioural layer is the largest single
reason. Whether it earns that is open question 8, still unanswered — but the
comparison is now against a *plain* session, not against a session already
carrying 2,937 tokens of CLAUDE.md and fable-mode. Against the setup it replaces,
the plugin is a large net saving.

---

## 16. Benchmark — the open question, answered (2026-08-13)

Open questions 7 and 8 asked whether omc-slim beats a plain session and whether
it justifies its static cost. Measured. Full method in `docs/BENCHMARK.md`.

**It does not beat plain on cost. It costs 10% more and shipped a structurally
identical tool.**

| | plain | omc-slim | CLAUDE.md + fable-mode |
|---|---|---|---|
| Cost | **$0.82** | $0.90 | $4.52 |
| Wall | **116 s** | 129 s | 810 s |
| Turns | 15 | **12** | 64 |
| Files | 2 | 2 | 12 |
| Tests | 17 pass | **36 pass** | 63 pass |
| Correctness | ✅ | ✅ | ✅ |
| CLI surface | `-h -m -x -a --json -q` | **identical** | 11 flags |

The identical CLI surface is the most informative single datum: on a task this
size the model's defaults dominate and the plugin barely moved the outcome.

What the 10% bought: 2.1× the tests, and disclosure of an unreadable directory
that plain skipped silently — for a dedup tool that is a correctness issue, not
polish.

The real win is against the setup omc-slim replaces: **5.0× cheaper and 6.3×
faster than CLAUDE.md + fable-mode at equal correctness.** That arm spent its
budget on a four-module package and 64 turns, though it did produce the best
hardlink handling of the three, and every verification claim it made was true.

### The central bet is still untested

**No subagent ran in any arm.** A single-file CLI is exactly the shape where
"smallest thing that works" wins and delegation cannot pay. The claim that
routing work to cheaper tiers beats doing it all on the main model needs a large
multi-file task to settle. This benchmark does not touch it.

### Three corrections during grading, all of which would have flattered us

1. The first "baseline" still had `~/.claude/CLAUDE.md` active — its exit-gate
   language fired in the output. Re-run with the file parked; the original became
   the third column.
2. "Its tests can't run, pytest isn't installed" — false. It used stdlib
   `unittest discover`; the *grader* assumed pytest. Checking the transcript also
   confirmed its venv claim was true.
3. Two "MISSED" correctness results were `zsh` word-splitting bugs in the grader.

Every one would have been a wrong finding in omc-slim's favour. This is the
fourth contamination or false-finding in this project caught by verifying before
reporting, and the second caused by the grader rather than the subject.

### What follows

Consistent with the orcabot dataset, where sophistication correlates negatively
with results. The defensible positioning is **not** "better than plain" — it is
"close to plain cost, materially more verification, a fraction of a heavyweight
discipline layer". If a multi-file benchmark does not show delegation paying, the
correct response is to shrink toward Karpathy, not to add features.

---

## 17. The orchestrator never delegated (2026-08-13)

Rubel asked whether the orchestrator knows its agents and how omo-slim invoked
them. Answering it uncovered the project's most serious defect.

### Answers to the question as asked

**Does it know them?** Yes. Verified by asking a live session to quote the
listing: it returns each agent's full description, cost tier and tool scope, and
sees project-local skills unprompted. The D1 cut of omo-slim's 1,829-token
`<Agents>` block was safe — Claude Code's built-in `Agent` tool description
carries routing guidance of its own ("delegate when answering would mean reading
across several files").

**How did omo-slim invoke?** OpenCode's **built-in** `task(subagent_type,
background: true)` — it shipped only `cancel-task` itself. Claude Code's built-in
`Agent` is the direct analogue, `SendMessage` covers `task_id` session reuse.

### The defect

Knowing is not invoking. **Three clean runs produced 0 Agent invocations** on a
task designed to demand them.

Cause: this build instructs every session *"Do not call the AgentTool unless the
user requested it."* Verified **not** from user settings, `CLAUDE.md`, project
settings, managed settings, `disableWorkflows`, or this plugin — present with and
without `--plugin-dir`.

A standing authorisation added to the output style **did not work**. The model
reads it and defers anyway: *"the session-level lines come last and are the more
specific, situational instruction."* Prompt-level authorisation loses to the CLI
default. The paragraph was trimmed to one line rather than kept as ~70 tokens of
proven-ineffective text.

| Prompt | Agent invocations |
|---|---|
| plain task | 0 |
| task + "use your specialist subagents" | **2** (`omc-slim:fixer`, plus a reviewer) |

So the pantheon is **gated, not broken**. One explicit request per session
unlocks it.

### Consequence for everything measured before this

The benchmark in §16 measured omc-slim's **prompt layer only**. Every result in
this document that involved subagents involved none. The §16 explanation — "no
subagent ran because a single-file CLI cannot benefit from delegation" — was
wrong; delegation was suppressed. Cost figures are unaffected; the interpretation
is corrected in `docs/BENCHMARK.md`.

The central bet is therefore **still** untested, now for a second and different
reason.

### One more thing worth noting

With delegation unlocked, the router picked `caveman:cavecrew-reviewer` — a
third-party agent from the environment — over this plugin's own `oracle` for the
review lane. Evidence the adaptivity works, and a hint that `oracle`'s
description may not signal "code review" as strongly as it should. Not yet
investigated.

---

## 18. Regression audit after the context-anxiety fix (2026-08-13)

Audited every change since v0.4.2. Four real defects found, three of them
self-inflicted by the fixes themselves.

### Defects found and fixed

| # | Defect | Origin |
|---|---|---|
| 1 | `observer` stopped auto-firing — its routing rationale was deleted along with the scarcity framing | **mine, this session** |
| 2 | `MAINTAINERS.md` still documented `spawn-preflight` as a shipping hook after it was removed | **mine** |
| 3 | The roster-drift check was appended *after* the script's `exit`, so it was unreachable dead code | **mine** |
| 4 | Observer's description was mangled ("even\neven if") by an overlapping string replace | **mine** |

Defect 1 is the instructive one. Removing "keeps large image and PDF bytes out of
the main context" also removed the *reason to delegate at all*, so the main
thread began reading PDFs directly. **The line to hold: telling the model why
delegating is the right call is routing logic and belongs; telling it that it is
running low on room is anxiety and does not.** The fix restores the routing
reason ("returns exact extracted text, never a paraphrase of an error") without
restoring the budget language.

### New guard

`check-coverage.sh` now also verifies the orchestrator's skill roster matches the
real skill set, catching both a renamed skill leaving a ghost name and a new
skill going unlisted. Proven to fail on both cases and to exit 1.

This guards a hazard **introduced by the roster fix itself**: hardcoding skill
names into the output style makes them a second source of truth that can drift.

### OMC issues re-audited after removing the pre-spawn hook

| Issue | Status |
|---|---|
| #2652, #2542, #959 (Stop-hook family) | safe — no Stop hook, and now no context policing at all |
| per-tool-call injection | **improved** — zero hooks on the tool-call path |
| two divergent hook copies | safe — one hook file |
| #3095 default-off enforcement | n/a |
| **#1373 agent results flood** | **guard removed** — accepted |
| **#2577 static-context bloat** | **trending wrong: 2,774 → 3,660 tok** |

**#1373:** the pre-spawn guard is gone. It only ever warned, and no hook can
truncate a subagent's return anyway, so the real mitigation was always the output
contracts — still present in `explorer`, `fixer` and `observer` with hard caps.
Accepted deliberately, but it is one fewer net.

**#2577 is the honest concern.** Standing context has risen every version since
v0.2.0: 2,774 → 2,803 → 3,046 → 3,187 → 3,471 → **3,660**, now 6.2× Karpathy and
~1,000 above OMC. Every increase was individually justified — adopted behaviours,
the anti-anxiety instruction, the skill roster — and they still sum. This is the
same failure mode OMC was criticised for, arrived at one defensible step at a
time.

---

## 19. Gap work: fixer routing, the central bet, and subagent nesting (2026-08-13)

### Gap 1 — `fixer` routing: not a defect

Four fixtures showed `fixer` never delegating. A fifth showed why the first four
were wrong tests.

| Fixture | Delegated? | Correct? |
|---|---|---|
| rename X to Y across the repo | no | yes — bulk edit beats briefing |
| money fix + 4 dependents | no | yes — an unmade design decision, which fixer's description excludes |
| 12 test files, 36 mechanical edits | no | yes — main thread did it for $0.37 |
| **3 independent packages, non-overlapping scopes** | **3 parallel `fixer` calls** | **yes** |

**The threshold is parallelism, not volume.** `fixer` fires when lanes can run
concurrently and declines when a bulk edit is cheaper. Gap closed as
working-as-designed; the earlier "defect" was four badly chosen fixtures.

### Gap 4 — the central bet, finally measured

Identical task and fixture, delegation permitted vs withheld. Output verified
equivalent: 3 loggers, 3 test files, 12 handlers migrated in both.

| | Delegated | Sequential |
|---|---|---|
| Cost | $1.67 | **$1.60** |
| Turns | **7** | 10 |
| Wall clock | **30 s** | 53 s |
| Main-thread output tokens | **2,043** | 3,516 |

**Delegation costs ~4% more, runs 1.8× faster, and keeps 42% more work out of the
main thread.** So the "cheaper tiers save money" thesis does **not** hold at this
size — briefing plus three subagent sessions offsets the sonnet-vs-opus saving.
What delegation buys is *latency* and *main-context cleanliness*, not spend.

n=1, and 4% is inside noise. The honest claim is cost-neutral, not cheaper.

### Subagent nesting — tested, and kept disabled

Every agent denies `Agent`/`Task`, inherited from both upstreams without
independent testing. Tested:

- **Nesting works** — a throwaway agent spawned a child and relayed its result.
- **It is unreliable one-shot** — the parent ended its turn after spawning
  rather than waiting, three times, needing nudges the `-p` path cannot supply.
- **No benefit demonstrable** — `Agent` was enabled on `oracle`; across three
  runs it never fired on a 15-file fixture, because reading 15 three-line files
  beats delegating. Reverted rather than shipped unverified.

Full reasoning, including the independent reasons `fixer`/`designer`/councillors
stay denied, is in `MAINTAINERS.md`.

### Gap status after this round

| Gap | Status |
|---|---|
| 1 `fixer` multi-file routing | **closed** — working as designed |
| 4 does delegation pay? | **answered** — latency and context, not cost |
| Subagent nesting | **decided** — stays off, with evidence |
| 2 `codemap` on a large repo | still untested |
| 3 static context 2,774 → 3,660 | **still open, still the biggest risk** |
| 5 skills dropped at scale | environment; we contribute 5 |
| 6 `council` synthesiser flakiness | 1 fire, 1 miss, unresolved |
