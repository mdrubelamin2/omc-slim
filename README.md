# omc-slim

A small pantheon of specialist agents for Claude Code.

Eleven agents, five skills, two hooks, two MCP servers. **~2,774 tokens of
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
specialists do the work on cheaper tiers. The orchestrator prompt is ~1,420
tokens — 69% smaller than the one it derives from — because everything Claude
Code already provides was deleted rather than described.

**Nothing injects on the tool-call path.** The dominant cost in comparable
plugins is not startup context, it is per-tool-call and per-Stop injection.
There is no `Stop` hook here and no `PostToolUse` hook, deliberately.

**Subagents return structures, not prose.** No hook in Claude Code can truncate
what a subagent returns to its parent — `PostToolUse` is purely additive.
The only lever is the agent's own output contract, so `explorer`, `observer`,
`fixer` and `librarian` each have one, with hard caps.

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

**This is not measured yet.** The honest state of the evidence:

| | Static context | Measured vs baseline |
|---|---|---|
| Karpathy Skills | ~589 tok | +0.96pp at **identical cost** |
| oh-my-claudecode | ~2,671 tok | +1.65pp at **+43% cost** |
| **omc-slim** |  **~2,774 tok** | **untested** |
| Agent Skills (24 skills) | ~1,826 tok | **−1.10pp** |

Source: [orcabot.com/benchmarks](https://orcabot.com/benchmarks), July 2026.

In that dataset **sophistication correlates negatively with results.** The
smallest pack won on efficiency; the largest lost to doing nothing at all.
omc-slim costs 4.7× Karpathy's static footprint — and ~100 tokens more than
oh-my-claudecode, which is the price of the adaptivity described above — and has
not yet shown it buys anything. The hypothesis under test is that delegation to
cheaper tiers pays for a prompt Karpathy does not need. That is plausible and
unproven.

If measurement does not support it, the correct response is to shrink toward
Karpathy — not to add features.

## Credits

- [oh-my-opencode-slim](https://github.com/alvinunreal/oh-my-opencode-slim) — the
  agent roster, routing heuristics and most prompt content.
- [oh-my-claudecode](https://github.com/Yeachan-Heo/oh-my-claudecode) — the
  deliverable-verification idea, the `tracer` role, and `deep-interview`. Also
  the bug that its SubagentStop hook must not emit `additionalContext`, which we
  inherited as a lesson rather than an outage.
- [andrej-karpathy-skills](https://github.com/multica-ai/andrej-karpathy-skills) —
  the compression target, and the "Surgical Changes" principle taken outright.

Full research, including why each of these decisions was made and what was
measured, is in [`RESEARCH.md`](./RESEARCH.md).

## License

MIT
