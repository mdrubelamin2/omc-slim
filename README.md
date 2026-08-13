# omc-slim

A small pantheon of specialist agents for Claude Code.

Eleven agents, five skills, two hooks, two MCP servers. **~3,187 tokens of
static context** and **zero bytes injected on the tool-call path.**

Slim by construction, and it **adapts to whatever your project already has** —
every specialist inherits your MCP servers and skills.

Adapted from [oh-my-opencode-slim](https://github.com/alvinunreal/oh-my-opencode-slim),
rebuilt native-first rather than ported.

---

## Install

```
/plugin marketplace add /path/to/omc-slim
/plugin install omc-slim
```

Or load it without installing:

```
claude --plugin-dir /path/to/omc-slim
```

**No further setup.** The orchestration output style applies automatically while
the plugin is enabled (`force-for-plugin`), so the main thread starts planning
and delegating on first run rather than implementing everything itself.

That flag overrides your `outputStyle` setting — it is the one global thing this
plugin does. To opt out, `/plugin disable omc-slim`, or delete
`output-styles/omc-slim.md` from your copy. Because output style is part of the
system prompt, changes take effect after `/clear` or a new session.

## Known limitation: delegation needs one nudge per session

**Measured, and it affects the plugin's whole premise.** Some Claude Code builds
instruct every session *"Do not call the AgentTool unless the user requested
it"*. Where that default is active, the orchestrator **will not spawn
specialists on its own**, no matter what this plugin's prompt says — verified:
the model reads the standing authorisation in the output style and still defers,
reasoning that the session-level instruction is more specific.

Measured on an identical task and fixture:

| Prompt | Agent invocations |
|---|---|
| "Audit this codebase… document… fix the most serious one." | **0** |
| Same, prefixed *"Use your specialist subagents to do this."* | **2** |

**Workaround: say it once.** Any phrasing that asks for subagents unlocks
delegation for the session — after that the routing rules take over. If your
build has no such default, none of this applies and the orchestrator routes
unprompted.

Check yours:

```
claude -p "One line: are you instructed not to use the Agent tool unless the user requests it?"
```

Everything else in this plugin — the register, the ladder, root-cause fixing,
the hooks, the skills, MCP adaptivity — is unaffected and works regardless. Only
subagent routing is gated.

## What you get

### Agents

| Agent | Tier | For |
|---|---|---|
| `explorer` | haiku | "Where is X?" — returns a `file:line` map, capped at 40 lines |
| `librarian` | haiku | Docs and usage examples — prefers your project's own MCP servers over the open web |
| `oracle` | opus | Architecture, review, YAGNI scrutiny. Escalation, not a default step |
| `tracer` | opus | Causal investigation when a first fix already failed |
| `fixer` | sonnet | Bounded implementation from a spec |
| `designer` | sonnet | Anything a user looks at |
| `observer` | sonnet | Images, screenshots, PDFs — keeps the bytes out of your context |
| `council` + 3 `councillor-*` seats | mixed | High-stakes decisions needing independent reads |

### Skills

`deep-interview` · `deepwork` · `verification-planning` · `simplify` · `codemap`

### Hooks — both advisory, neither runs per tool call

| Hook | Event | Does |
|---|---|---|
| `spawn-preflight` | `PreToolUse` on `Agent\|Task` | Warns when you fan out above 75% context |
| `verify-deliverables` | `SubagentStop` | Flags a write-agent that finished without touching a file |

## It adapts to your project

Agents are scoped by **what they must not do**, never by a fixed list of tools:

```yaml
disallowedTools: [Edit, Write, NotebookEdit, Bash, Agent, Task]
```

So every specialist automatically inherits whatever MCP servers and skills your
project provides, while the role boundary still holds.

| Your project has | What happens |
|---|---|
| A documentation MCP for your stack | `librarian` becomes authoritative on it and stops reaching for web search |
| A code-generation or linting MCP | `fixer` and `designer` write current idioms instead of recalled ones |
| A browser-automation MCP | `designer` can verify what it built instead of guessing |
| Project-local skills in `.claude/skills/` | Every subagent sees them automatically — no configuration |

**No vendor is named anywhere in this plugin.** Agents discover servers by
reading tool *descriptions*, so this works for servers that did not exist when
the prompts were written.

Verified blind: a project whose only MCP server was named **`kb`** — nothing in
the name hinting at its subject — was found by `librarian`, correctly
identified, and queried three times for a Svelte question, with no web search.
`fixer` separately found and used that server's code-fixing tool to migrate a
component, while its own prompt named no framework at all.

The read-only guarantee survives this. A `librarian` instructed to write a file
could not: `Write`, `Edit` and `Bash` are absent from its schema, and an attempt
to escape laterally through another skill also failed.

**Why not an allowlist?** Because it cannot adapt. `tools: [Read, Grep]` is blind
to every server you add, and `mcp__*` wildcards silently expand to nothing —
both verified. An allowlist would make this plugin slim and useless in exactly
the projects that need it most.

The trade: an agent also inherits any *new* core tool. Role prompts and denied
capability classes are the guard, not an exhaustive list.

## Design

Three ideas, each of which cost something to learn.

**Delegation over accumulation.** The main thread plans and reconciles;
specialists do the work on cheaper tiers. The orchestrator prompt is ~1,788
tokens — 60% smaller than the one it derives from — because everything Claude
Code already provides was deleted rather than described.

**Nothing injects on the tool-call path.** The dominant cost in comparable
plugins is not startup context, it is per-tool-call and per-Stop injection.
There is no `Stop` hook here and no `PostToolUse` hook, deliberately.

**Subagents return structures, not prose.** No hook in Claude Code can truncate
what a subagent returns to its parent — `PostToolUse` is purely additive.
The only lever is the agent's own output contract, so `explorer`, `observer`,
`fixer` and `librarian` each have one, with hard caps.

## How it behaves

Not configurable, and deliberately so — a house style you can rely on rather
than a setting to tune.

**It writes like a busy senior engineer.** Answer first. No preamble, no
restating your question, no "great question", no narrating routine work. Errors
quote the shortest decisive line rather than dumping a log. Measured against the
same question with no plugin, replies run roughly half the length with no
loss of substance.

**It reaches for the smallest thing that works.** Does this need to exist? Is it
already in the codebase, the standard library, a native platform feature, or a
dependency you already have? Only then new code. No abstraction with one
implementation, no config for a value that never changes.

**It fixes causes, not symptoms.** Given a bug report naming one call site, it
greps every caller and fixes the shared function — one diff instead of three,
and no sibling left broken.

**It leaves a runnable check behind.** Non-trivial logic gets the smallest thing
that fails if the logic breaks — an assert-based check, no framework — and says
plainly when it could not run it rather than implying it passed.

**Laziness has floors.** Input validation at trust boundaries, error handling
that prevents data loss, security controls, accessibility basics and anything you
explicitly asked for are never simplified away.

**It owns the problem.** "Pre-existing", "not caused by my change", "known
limitation" and "future work" are descriptions, never exits. Given a file
carrying a comment that said *"known bug, nobody has fixed it"*, it investigated
rather than taking the exit — and found the comment itself was wrong.

**It reasons from the artefact, not the report.** Told `total()` returns NaN on
`'12.50'`, it read the code and corrected the premise: `parseInt('12.50')`
returns `12`, a silent-truncation bug worse than NaN because nothing signals
failure.

**It says when it did not verify.** "Looks right" is not a check. If a test could
not be run, it says so instead of implying a result.

## Replaces a global CLAUDE.md and a staged-work skill

The behavioural layer above is adopted from a personal `~/.claude/CLAUDE.md` and
a `fable-mode` staged-execution skill, so neither is needed alongside it:

| | Cost |
|---|---|
| `CLAUDE.md` | ~1,058 tok **every session, every project** |
| `fable-mode` | ~1,879 tok **each time it is invoked** |
| Combined, typical task | **~2,937 tok** |
| omc-slim's cost for the same behaviour | **+243 tok standing** |

**Net ~2,694 tokens saved per task.** The always-on layer carries only what
shapes every response; the staged-execution discipline — stage map, one failable
check per stage, backward re-runs, the warning threshold, the two self-critique
questions — folded into the existing `deepwork` skill, which occupies the same
niche and costs nothing until invoked.

One deliberate improvement over the originals: those two files disagreed with
each other. The `CLAUDE.md` made staged mode *mandatory for any multi-step task*;
the skill's own text said staging a trivial task "wastes effort and buries the
answer under ceremony". `deepwork` keeps the skill's trigger discipline, not the
blanket mandate.

## Honest limitations

**The council is weaker than it looks.** Its seats differ by model tier,
reasoning effort and analytical stance — not by model *provider*. They share a
training lineage, so correlated error is possible: they can be confidently wrong
together. Unanimous agreement here is weaker evidence than genuine cross-vendor
consensus. The `council` agent is instructed to say so.

**No per-agent temperature.** Claude Code agent frontmatter has no
`temperature`. The upstream `designer` ran at 0.7 deliberately; that is
compensated for in prose, which is not the same thing.

**No AST-aware search.** Upstream used `ast_grep_search` across 25 languages.
Claude Code has no equivalent, so structural queries fall back to `Grep`. The
`explorer` is weaker than its ancestor on "find every function shaped like this".

**It changes your output style.** Stated again because it is the only global
side effect: `force-for-plugin` overrides your `outputStyle` while omc-slim is
enabled. Disabling the plugin reverts it.

**Measured once, honestly.** Full method and caveats in
[`docs/BENCHMARK.md`](./docs/BENCHMARK.md). One prompt naming no technology
("build a CLI that finds duplicate files"), three arms, held-out grading fixture,
measures fixed before running. **n=1 — directional, not settled.**

| | Cost | Tests | Correct | Notes |
|---|---|---|---|---|
| plain session | **$0.82** | 17 | ✅ | silently skips unreadable dirs |
| **omc-slim** | $0.90 | **36** | ✅ | discloses skips; *identical CLI surface to plain* |
| CLAUDE.md + fable-mode | $4.52 | 63 | ✅ | 12 files, 64 turns, best hardlink handling |

**omc-slim cost 10% more than a plain session and shipped a structurally
identical tool** — same file count, near-identical LOC, the same flags. The 10%
bought 2.1× the tests and disclosure of an unreadable directory that plain
skipped in silence, which for a dedup tool is a correctness issue, not polish.

The large win is against the setup this replaces, not against plain: **5.0×
cheaper and 6.3× faster than CLAUDE.md + fable-mode**, at equal correctness.

So the honest claim is not "better than plain". It is *close to plain cost, with
materially more verification, at a fraction of a heavyweight discipline layer.*

What it does **not** show: the central bet. A single-file CLI is exactly where
"smallest thing that works" wins and delegation cannot pay — **no subagent ran in
any arm.** Whether routing work to cheaper tiers beats doing it all on the main
model is still untested, and needs a large multi-file task to settle.

For context on why that matters:

| | Static context | Independent benchmark |
|---|---|---|
| Karpathy Skills | ~589 tok | +0.96pp at identical cost |
| oh-my-claudecode | ~2,671 tok | +1.65pp at +43% cost |
| **omc-slim** | **~3,187 tok** | see above |
| Agent Skills | ~1,826 tok | −1.10pp |

Source for the outer rows: [orcabot.com/benchmarks](https://orcabot.com/benchmarks),
July 2026. In that dataset **sophistication correlates negatively with results** —
the smallest pack won on efficiency, the largest lost to doing nothing. Our own
result is consistent with it. If further measurement holds this direction, the
right response is to shrink toward Karpathy, not to add features.

## Provenance — what was adopted, pinned exactly

Every source is pinned so a future version can diff against what was actually
read, and adopt upstream changes deliberately rather than by memory.

| Source | Pin | What omc-slim took |
|---|---|---|
| [alvinunreal/oh-my-opencode-slim](https://github.com/alvinunreal/oh-my-opencode-slim) | `282d5f26` (2026-08-11) | The agent roster, routing heuristics, output contracts and most prompt content |
| [Yeachan-Heo/oh-my-claudecode](https://github.com/Yeachan-Heo/oh-my-claudecode) | `7e38c1f9` (2026-08-12), `package.json` 4.15.7, npm `oh-my-claude-sisyphus` 4.15.10 | The deliverable-verification idea, the `tracer` role, `deep-interview`, and six verified failure modes to design against |
| [multica-ai/andrej-karpathy-skills](https://github.com/multica-ai/andrej-karpathy-skills) | `2c606141` (2026-04-20) | "Surgical changes" outright; the whole file as a compression target |
| `~/.claude/CLAUDE.md` | sha256 `e1894ef55a06…` (4,230 B) | Ownership language bans, no early stopping, no permission-to-continue, evidence over plausibility |
| `~/.claude/skills/fable-mode/SKILL.md` | sha256 `c48cbc5cf0c9…` (7,516 B) | Stage map, one failable artefact per stage, backward re-runs, warning threshold, the two self-critique questions, find-and-replace safety |

Three further packs were read and deliberately **not** adopted wholesale — see
[`RESEARCH.md`](./RESEARCH.md) §6d for why. Their disciplines informed the
register and the two-hook budget:

| Pack | Pin | Informed |
|---|---|---|
| [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) | `7829ffd9` | Hook discipline — it registers exactly one. Its 24-skill surface is the counter-example, not the model |
| [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail) | 4.8.4, `16f29800` | The build ladder and laziness-with-floors stance |
| [JuliusBrussee/caveman](https://github.com/JuliusBrussee/caveman) | `ec83e5ba` | Compressed output contracts and the terse register |

Neither is named anywhere in the plugin's prompts — the behaviour is described
directly, so nothing depends on those packs being installed.

Benchmark figures come from [orcabot.com/benchmarks](https://orcabot.com/benchmarks),
July 2026 run, page last updated 2026-08-08.

### Safe to delete the sources this replaces

`~/.claude/CLAUDE.md` and the `fable-mode` skill are meant to be **deleted** once
this plugin is installed — that is the ~2,700 tokens per task it buys back. Two
checks make that safe.

**1. The pins survive deletion.** Those two entries are marked `archived` in
`UPSTREAM.tsv`: fully adopted, source retired on purpose. The verbatim copies in
[`docs/upstream/`](./docs/upstream) become the record, and the checker verifies
*those* rather than reporting a permanent false alarm:

```
CLAUDE.md            archived   e1894ef55a06 (source retired, snapshot intact)
fable-mode.SKILL.md  archived   c48cbc5cf0c9 (source retired, snapshot intact)
```

It also detects a tampered or missing snapshot, and — if you have not deleted the
original yet — tells you whether it drifted since adoption, so you can review
before deleting.

**2. Coverage is asserted, not assumed.** With the originals gone, nothing else
would catch a later edit quietly dropping an adopted rule.
[`COVERAGE.tsv`](./COVERAGE.tsv) maps all 31 adopted behaviours to where they now
live:

```bash
./scripts/check-coverage.sh
# 31/31 adopted behaviours present.
# Safe to delete the adopted sources; the plugin covers them.
```

Exits non-zero if any behaviour goes missing, so it works in CI or a pre-commit
hook. It has been verified to actually fail: rewording or deleting a rule turns
it red, and it earned its keep immediately — it caught that `surgical-edits` had
been lost from the output style during an earlier compression pass.

### Checking for upstream changes

```bash
./scripts/check-upstream.sh          # all sources
./scripts/check-upstream.sh karpathy # one
```

Read-only. It queries each remote and hashes each local file, then prints the
exact `git diff` or `diff -u` command for anything that moved.

Upstream moves fast — oh-my-claudecode ships roughly 35 npm versions a month, and
had already moved past its pin within hours of being audited. Expect the checker
to report movement; the point is to review it, not to chase it. Adopt only what
earns its tokens, then update the pin in
[`UPSTREAM.tsv`](./UPSTREAM.tsv) and refresh the snapshot.

## Credits

Everything this plugin borrows is listed with its exact pin in
[Provenance](#provenance--what-was-adopted-pinned-exactly) above. Particular
thanks to **oh-my-claudecode**, which contributed more by its scars than its
features: the reason `verify-deliverables` emits no `additionalContext` on
`SubagentStop` is a regression it hit and we inherited as a lesson rather than an
outage.

Full research — every decision, what was measured, and the three occasions a test
turned out to prove nothing — is in [`RESEARCH.md`](./RESEARCH.md). Undocumented
Claude Code runtime behaviour discovered along the way is in
[`MAINTAINERS.md`](./MAINTAINERS.md).

## License

MIT
