# Maintainer notes

Non-obvious decisions, each one bought with a failed test. Everything here was
verified against a live Claude Code session on **2026-08-13**; re-verify before
trusting it, because most of it is undocumented runtime behaviour.

This file exists so the rationale does **not** live inside prompt bodies. It
originally did, and cost ~328 tokens of system prompt across three files —
12% of the plugin's entire static budget spent on notes to ourselves.

---

## Agent frontmatter

### `tools: []` grants ALL tools

An empty array is treated as unset, and the runtime advertises **All tools**. (Moot now that no agent uses `tools:`, but keep it in mind.)
`council` originally used `tools: [Read]` for this reason. It now uses a
denylist like every other agent: it still cannot mutate anything, and it can
settle one disputed citation rather than being blind to it.

Verified by building throwaway agents:

| frontmatter | resolved as |
|---|---|
| `tools: []` | `All tools` |
| `tools: [NoSuchToolXyz]` | `NoSuchToolXyz` (accepted; grants nothing) |
| `tools: [Read, mcp__a__x, mcp__plugin_p_a__x]` | all three, no error |

### Use `disallowedTools`, never `tools` — allowlists cannot adapt

**This is the most important rule in this file.** Every agent is scoped by what
it must not do:

```yaml
disallowedTools: [Edit, Write, NotebookEdit, Bash, Agent, Task]
```

resolving to `All tools except Edit, Write, NotebookEdit, Bash, Agent, Task`.

An allowlist would freeze each agent's capability at authoring time and make it
blind to every MCP server a user adds. Verified:

| frontmatter | result |
|---|---|
| `tools: [Read, Grep]` | exactly those two; project MCP servers invisible |
| `tools: [Read, "mcp__*"]` | **wildcard expands to nothing** — 0 tools invoked |
| `disallowedTools: [Edit, Write, Bash]` | everything else, **including project MCP** ✅ |
| `tools:` + `disallowedTools:` together | `tools` wins, denied entries removed from it |

End-to-end proof: with only a `cfdocs` server in the project's `.mcp.json`, the
`librarian` discovered it via `ToolSearch` and invoked
`mcp__cfdocs__search_cloudflare_documentation` — a server this plugin has never
heard of. The read-only guarantee still held: a librarian told to write a file
found `Write`/`Edit`/`Bash` absent from its schema and could not escape through
another skill.

**Trade-off, accepted deliberately:** an agent also inherits any *new* core tool.
Guarding is by denied capability class plus role prompt, not by exhaustive
enumeration.

### MCP tool names are namespaced by plugin

Still worth knowing even though no agent allowlists them any more. A
plugin-provided MCP server appears as:

```
mcp__plugin_<plugin-name>_<server>__<tool>
```

So `context7` bundled by this plugin is
`mcp__plugin_omc-slim_context7__query-docs`, **not**
`mcp__context7__query-docs`. The same server configured in a project-level
`.mcp.json` uses the bare form. This bit an earlier revision that allowlisted the
bare names, silently stripping the librarian of every MCP tool with no error
anywhere — one of the reasons the allowlist approach was abandoned.

### Discovery is description-driven — never deny `ToolSearch`

Agents find unfamiliar MCP servers by reading tool **descriptions**, not names,
and in environments where tools are deferred they use `ToolSearch` to do it.

Proven blind, with **zero vendor names anywhere in the plugin**: a project whose
only MCP server was called `kb` — nothing in the name hinting at its subject —
was found by `librarian`, correctly identified, and queried three times for a
Svelte question, with no web search. `fixer` independently found and used that
server's `svelte-autofixer` code tool while its own prompt named no vendor at
all.

**Consequence: do not add `ToolSearch` or `Skill` to any agent's
`disallowedTools`.** Denying either breaks discovery, and it breaks it silently —
the agent will simply fall back to WebSearch and look like it is working.

Prompts deliberately describe the *class* of tool ("any MCP server whose tools
cover the subject") rather than naming vendors. An earlier revision named
Cloudflare as an example, which made the first adaptivity test worthless: the
agent may have found the Cloudflare server because the prompt told it to. Test
adaptivity with a server the plugin has never heard of, or the test proves
nothing.

### Subagents inherit all skills automatically

No configuration needed: a subagent sees user skills, plugin skills, and
project-local `.claude/skills/` — verified with a project-only skill appearing in
a subagent's listing. The `skills:` frontmatter field exists if you ever need to
*narrow* that; nothing here does.

---

## Hooks

### Matchers are anchored — a bare name does not match a namespaced agent

For `SubagentStop`, the matcher is tested against `agent_type`, which for a
plugin agent is `omc-slim:fixer`.

| matcher | fires? |
|---|---|
| `fixer\|designer` | **no** |
| `omc-slim:fixer\|omc-slim:designer` | yes |
| `(.*:)?(fixer\|designer)` | yes ← what we ship |

We ship the third form because it survives the plugin being installed under a
different name. The second form works today and breaks silently on a rename —
and silent non-firing is the failure mode this project exists to avoid.

### `transcript_path` is the PARENT session, not the subagent

The `SubagentStop` payload carries both:

```
transcript_path         → the main session transcript
agent_transcript_path   → the subagent's own transcript   ← use this one
```

`verify-deliverables` originally read `transcript_path`. That scans the whole
parent session, so any edit the main thread ever made would be counted as this
subagent's work. Always `agent_transcript_path`.

Full observed payload keys:

```
agent_id, agent_transcript_path, agent_type, background_tasks, cwd, effort,
hook_event_name, last_assistant_message, permission_mode, prompt_id,
session_crons, session_id, stop_hook_active, transcript_path
```

(`effort` appearing here confirms it is a real, plumbed agent field.)

### An attempted write is not a write

A permission-denied `Edit` still produces a `tool_use` block. Matching on
`tool_use` alone reports success for an agent that was blocked and produced
nothing — precisely the case most worth flagging.

`verify-deliverables` correlates ids: a write counts only when a write-tool
`tool_use` has a matching `tool_result` whose `is_error` is not `true`. A
`tool_use` with no result at all (agent died mid-call) also counts as no write.

### Context window must be inferred, not assumed

`spawn-preflight` originally hardcoded a 200K window. On a 1M-context session,
160K tokens is 16% used, not 80% — it would have warned on a nearly empty
context every single time an agent was spawned. A guard that cries wolf gets
ignored, which is the same as not shipping it.

It now picks the smallest of `[200_000, 1_000_000]` that could hold the observed
token count, with `OMC_SLIM_CONTEXT_WINDOW` as an override. When the transcript
records no usage figure at all it returns **null and stays silent** rather than
falling back to a transcript-size guess, which cannot distinguish window sizes.

### Both hooks are advisory and fail open

Neither returns a `permissionDecision`; neither can block. Every error path exits
0 emitting nothing. A broken guard must never break a session.

`systemMessage` goes to the **user**, not the model — so you cannot verify a hook
fired by asking the model whether it saw a warning. Instrument the hook and read
the log.

---

## Output style

`force-for-plugin: true` applies the style automatically while the plugin is
enabled and overrides the user's `outputStyle` setting.

This is the one global thing the plugin does, and it is deliberate: without it
the plugin installs **inert** — agents load, nothing orchestrates them. Verified
that the style does not activate on its own without this flag.

`keep-coding-instructions: true` means it adds to Claude Code's built-in
software-engineering instructions rather than replacing them, keeping the blast
radius small.

Output styles apply to the **main conversation only** — subagents run their own
system prompt. That is correct here, since the orchestrator *is* the main thread.

---

## Things that are fine, checked anyway

- `${CLAUDE_PLUGIN_ROOT}` in a `SKILL.md` body is the established convention —
  37 uses across installed third-party plugin skills.
- `output-styles/` at plugin root is the documented default location; declaring
  `outputStyles` in `plugin.json` is only needed to override it.
- Listing MCP tool names that do not resolve causes no error.

## Known gaps

- **No AST-aware search.** Upstream omo-slim used `ast_grep_search`; Claude Code
  has no equivalent, so those references map to `Grep`. Structural queries are
  weaker than upstream.
- **No per-agent `temperature`.** Upstream ran `designer` at 0.7 deliberately.
  Compensated for in prose, which is not the same thing.
- **Council seats share a provider.** See the caveat in `README.md`.
