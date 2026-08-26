# omc-slim

**A small pantheon of specialist agents for Claude Code.**

Six agents, six skills, one hook. The main thread stops being the implementer and
becomes a planner that delegates, verifies and reconciles. It injects **zero
bytes on the tool-call path**, ships **no MCP servers**, and inherits whatever
MCP servers and skills your project already has. Three components write files
into your repository, and only when they run: `codemap` maps it, `deep-interview`
writes a spec, `deepwork` keeps a log. `codemap` says what it will write and
waits for a yes; the other two write one file each, under `docs/`.

Static context is **~3,981 tokens**. `./scripts/measure-context.sh` reports
**4,519 on a chars/4 basis** and prints that correction itself, because the
chars/4 method measured **+13.5% high** against a real tokeniser
([audit](./docs/AUDIT-2026-08-25.md)). `claude plugin details omc-slim` reports a
third, smaller number; it does not count the output style, which is the largest
item. Quote a basis or don't quote a number.

On one single-file CLI task, n=3 per arm, it averaged **18% less than a plain
session** ($1.01 vs $1.24) with non-overlapping spreads, and shipped the smallest
tool of the three setups tested. All nine runs graded equally correct — so the
grader could not separate them on quality, and no subagent ran in any arm.

**Treat that as a demonstration, not a measurement.** One task at n=3 cannot
detect an effect below roughly 30 percentage points, and task-level variance
dominates, so more repeats would not fix it
([evidence](./docs/RESEARCH-2026-08-26.md#8-measurement--how-to-settle-the-central-bet)).
The omc-slim arm also ran with two MCP servers no other arm had. It measured the
prompts as they were **before** the current restructure, so it describes an
earlier build than the one you install. Read
[BENCHMARK.md](./docs/BENCHMARK.md) before quoting it.

And the class of claim matters. Four independent studies find a rules layer moves
**cost, runtime and code size** and does **not** move correctness. This one's
numbers fit that pattern exactly, which is the honest thing to say about them —
so nothing here claims omc-slim makes Claude more correct.

```
/plugin marketplace add mdrubelamin2/omc-slim
/plugin install omc-slim@omc-slim
```

No configuration, no API keys, no dependencies, no bundled MCP servers.

---

## Setup

There isn't any. The orchestration output style applies automatically while the
plugin is enabled, so the main thread works as a planner rather than diving
straight into implementation.

One thing to know: the output-style flag takes precedence over your `outputStyle`
setting for as long as the plugin is enabled. It is the only global change this
plugin makes — it ships no MCP servers, writes no files and touches no settings.
To opt out, run `/plugin disable omc-slim`. Output style is part of the system
prompt, so changes take effect after `/clear` or in a new session.

**The plugin bundles no MCP servers, deliberately.** Up to v0.8.3 it shipped a
`.mcp.json` that started `context7` and `grep.app` automatically — two remote
third-party endpoints — while the README claimed the output style was the only
global change. That was wrong, and the fix was to remove them rather than to
document them. `librarian` discovers whatever documentation servers your project
or user config already provides, so if you want those two, add them yourself:

```
claude mcp add --transport http context7 https://mcp.context7.com/mcp
```

To try it without installing:

```
claude --plugin-dir /path/to/omc-slim
```

## Two settings worth knowing

Neither is a plugin change — both are yours, and both cost more than anything in
this repository does.

**`ENABLE_TOOL_SEARCH`.** MCP tool definitions load into every request. One
user's audit of 926 sessions took `/context` from **45k to 15.5k tokens** by
turning tool search on, which defers those definitions until something needs
them. If you run more than a couple of MCP servers, this is the largest single
saving available to you:

```json
{ "env": { "ENABLE_TOOL_SEARCH": "true" } }
```

**`subagentPromptCacheTtl`** (Claude Code 2.1.242+). The main conversation gets a
one-hour prompt cache on a subscription; **subagents, forks and compaction get
five minutes.** A plugin that delegates runs most of its tokens in that
five-minute bucket, so a specialist dispatched after a pause pays full price for
a prefix it could have read from cache:

```json
{ "subagentPromptCacheTtl": "1h" }
```

## Agents

Every agent inherits the model you are running. None pins its own tier, so the
roster costs what your session costs.

**Find things**

- **[explorer](./agents/explorer.md)** — *"Where is the retry logic?"* Returns a
  `file:line` map, not prose. The cheapest first call for any where/what/which
  question.
- **[librarian](./agents/librarian.md)** — *"Is this still the recommended API?"*
  Checks current docs and real usage instead of recalling training data, and
  prefers your MCP servers over the open web.

**Change things**

- **[fixer](./agents/fixer.md)** — *"Rename this across nine files."* Executes a
  spec you have already decided on. Not for research or architecture.
- **[designer](./agents/designer.md)** — *"This form looks wrong."* Owns layout,
  hierarchy, spacing, colour, motion and responsive behaviour.

**Judge things**

- **[oracle](./agents/oracle.md)** — *"Is this design going to hold up?"*
  Architecture, high-risk refactors, security and data-integrity calls.
  Escalation, not a default review step.
- **[tracer](./agents/tracer.md)** — *"I have fixed this twice and it keeps
  coming back."* Builds competing hypotheses and tries to falsify them.

## Skills

- **[review](./skills/review/SKILL.md)** — *"Is this ready to ship?"* Every axis
  at once, behind an evidence gate that keeps false positives out.
- **[deepwork](./skills/deepwork/SKILL.md)** — *"This is too big to get right in
  one pass."* Stage plan, parallel lanes, a failable check per stage.
  **Invoke it explicitly; it will not fire on its own.**
- **[deep-interview](./skills/deep-interview/SKILL.md)** — *"I want to build
  something, I am not sure what yet."* Stops for approval before any code.
- **[verification-planning](./skills/verification-planning/SKILL.md)** — *"How do
  I prove this did not break anything?"*
- **[simplify](./skills/simplify/SKILL.md)** — *"This is over-built."* Deletes
  speculative abstraction, config nobody sets, and hand-rolled standard library.
- **[codemap](./skills/codemap/SKILL.md)** — *"Nobody here has read this
  repository."* Writes a codemap per directory plus a root atlas. Expensive, and
  it says so before starting.

## The hook

One hook, on `SubagentStop`, for `fixer` and `designer` only. It checks that a
write-capable agent actually wrote something, and tells **you** when it did not.
It never blocks, always exits 0, and stays silent when it cannot tell.

Those are claims, so they have a check: `node hooks/verify-deliverables.test.mjs`
runs the hook as a child process against isolated fixtures — 19 cases asserting
the exact set of keys it may emit, which is what makes "never blocks" falsifiable.
And the check has a check: `verify-deliverables.mutate.mjs` breaks the hook
twenty-three ways and confirms the suite catches all twenty-three. `OMC_SLIM_DEBUG=1` prints
which path it took, on stderr.

There is no `Stop` hook, no `PostToolUse` hook, and nothing on the tool-call
path.

## The gates

`COVERAGE.tsv` pins every adopted rule to the file that must still carry it, and
`scripts/check-coverage.sh` fails if one disappears. That is presence, and
presence is not enough: `51dfbcc` records a compression pass where all 88 rows
passed and behaviour broke anyway, because the *reinforcing* sentence that made a
rule fire had been cut while the rule's own phrase survived.

So `REINFORCEMENT.tsv` pins the reinforcement too — an anchor plus the phrases
that must appear **in the same paragraph** as that anchor. `scripts/check-reinforcement.sh`
reports `GUTTED` when a rule keeps its name and loses its reasoning. Gutting one
rule as a test gives `0 DROPPED` from the coverage gate and a named failure from
this one. Run all three:

```
./scripts/check-coverage.sh && ./scripts/check-reinforcement.sh \
  && ./scripts/check-evals.sh
```

The third one covers the eval suite: `./scripts/check-evals.sh` asserts what the
runner's own authoring interview refuses to negotiate — three runs minimum, a
declared type on every grader, at least one `should-not-fire` case, and no
absolute paths. It is proved able to fail four ways, and it needs PyYAML — it
exits 1 rather than reporting a green line it cannot stand behind. **The suite itself has never
been executed**: `claude plugin eval` is early access and is not enabled on the
account it was written on. See [evals/README.md](./evals/README.md), which leads
with that.

All three are structural: they prove the text is there and still carries its rule.
None of them can tell you the agent still *behaves*. `scripts/bench/smoke-contracts.sh`
is the one that can — it runs `claude -p --plugin-dir` against the working tree
rather than the installed cache, and asserts both that the expected agent
actually spawned and that its output honours its contract. It covers all twelve
components, one `claude -p` call each, and dry-runs by default — a full
`--execute` run spends real money and the total has not been re-measured since
the suite grew from three cases.

## How it works

**Delegation over accumulation.** The main thread plans and reconciles;
specialists do the work. Everything Claude Code already provides was deleted from
the prompt rather than described.

**Three layers, and only one of them is prose.** The harness enforces
`disallowedTools`, the output-style flag and the hook matcher, with no model
cooperation involved — `disallowedTools: [Agent, Task]` is why one-level
delegation is a guarantee rather than a request. One hook is our own code, and it
has a test. Everything else — every agent body, every skill, the output style
itself — is prose, and holds exactly as well as a prompt holds.

**Nothing injects per tool call.** The dominant cost in comparable plugins is not
startup context, it is per-tool-call and per-`Stop` injection. There is none
here, and no context-window policing — that is the harness's job.

**Subagents return structures, not prose.** No hook can truncate what a subagent
returns to its parent, so the only lever is the agent's own output contract.
`explorer`, `fixer` and `librarian` each have one, with hard caps.

## It adapts to your project

Agents are scoped by **what they must not do**, never by a fixed tool list:

```yaml
disallowedTools: [Edit, Write, NotebookEdit, Bash, Agent, Task]
```

So every specialist inherits whatever your project provides, while the role
boundary still holds.

| Your project has | What happens |
|---|---|
| A documentation MCP for your stack | `librarian` becomes authoritative on it and stops reaching for web search |
| A code-generation or linting MCP | `fixer` and `designer` write current idioms instead of recalled ones |
| A browser-automation MCP | `designer` can verify what it built instead of guessing |
| Skills in `.claude/skills/` **or** `~/.claude/skills/` | Every subagent sees both automatically |

## What fires on its own

Most components have been observed firing on natural prompts naming no component
and no plugin. `deepwork` and `simplify` have never fired on their own, and
`review` has never been tested either way.

**These are notes, not an experiment.** No harness, dates or transcripts are
committed, unlike `scripts/bench/`. And on builds that gate the `Agent` tool —
Claude Code ships "do not call the AgentTool unless the user requested it" by
default for Opus 5 — none of it fires without an explicit request.

Full routing measurements, the `deepwork` workaround, and what to do if nothing
delegates: **[docs/ROUTING.md](./docs/ROUTING.md)**.

## Known limits

- `deepwork` will not auto-fire. Invoke it explicitly, or add one paragraph to
  your `CLAUDE.md` — see [routing](./docs/ROUTING.md).
- `simplify` does not fire on natural language. Use `/omc-slim:simplify <target>`.
- No agent may spawn subagents. Nesting is possible but unreliable in one-shot
  mode; that was tested rather than assumed.

The full list, with evidence for each:
**[docs/LIMITATIONS.md](./docs/LIMITATIONS.md)**.

## Documentation

| Document | What is in it |
|---|---|
| [BENCHMARK.md](./docs/BENCHMARK.md) | Three arms, n=3, committed harness. The numbers, and the four measurement bugs found before publishing them |
| [ROUTING.md](./docs/ROUTING.md) | What auto-invokes, what does not, and why |
| [LIMITATIONS.md](./docs/LIMITATIONS.md) | Everything known to be weak or unproven |
| [PROVENANCE.md](./docs/PROVENANCE.md) | What was adopted from where, pinned exactly |
| [CHANGELOG.md](./CHANGELOG.md) | Notable releases |
| [MAINTAINERS.md](./MAINTAINERS.md) | Undocumented Claude Code runtime behaviour found along the way |
| [RESEARCH.md](./RESEARCH.md) | Every decision, what was measured, and three tests that proved nothing |

Re-derive the context cost with `./scripts/measure-context.sh`. Re-run the
benchmark with `./scripts/bench/run-arm.sh`.

## Credits

Adapted from
[oh-my-opencode-slim](https://github.com/alvinunreal/oh-my-opencode-slim), rebuilt
native-first rather than ported. Every borrowing is pinned in
[PROVENANCE.md](./docs/PROVENANCE.md).

Particular thanks to **oh-my-claudecode**, which contributed more by its scars
than its features: `verify-deliverables` emits no `additionalContext` on
`SubagentStop` because that was a regression it hit, inherited here as a lesson
rather than an outage.

## License

MIT
