# Maintainer notes

Undocumented Claude Code runtime behaviour discovered while building this, plus
the design decisions that are not obvious from the code. Each entry cost a failed
test. Verified against a live session on **2026-08-13**; re-verify before
trusting any of it, because most is not in the public docs.


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

### Do not police the context window (spawn-preflight, removed)

A `spawn-preflight` PreToolUse hook used to warn before fanning out at high
context. **Removed.** Capacity is the harness's job; a plugin that narrates it
causes the model to truncate real work over an imagined limit.

Kept here because the failure mode generalises: it originally hardcoded a 200K
window, so on a 1M-context session 160K read as 80% used rather than 16% and it
would have warned on a nearly empty context every time. If anything like it is
ever reintroduced, infer the window rather than assuming one, and stay silent
when the signal is unreadable instead of guessing.

The same reasoning removed scarcity framing from agent prompts ("keeps bytes out
of the main context", "your caller pays for every token"). Note the line: telling
the model *why delegating is the right call* is routing logic and belongs;
telling it *you are running low on room* is anxiety and does not. Over-correcting
past that line broke `observer` routing once — its reason to exist disappeared
along with the framing.

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

**It does not write the `outputStyle` setting.** `force-for-plugin` overrides at
runtime only, so `/config` keeps displaying whatever was stored — `default` for
most users — while the plugin is active. Verified: setting unset, plugin enabled,
effective style `omc-slim:omc-slim`. Expect this to be the most common "is it
even working?" report; the README answers it with a one-line check.

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

---

## Tone (v0.2.0)

A terse-senior-engineer register and a laziness-with-floors engineering stance
are baked into the output style and agent bodies. **Not configurable**, and no
external tone plugin is named or required — the behaviour is described directly.

Placement matters and got it wrong once. The build ladder went into `fixer.md`
on the reasoning that the orchestrator delegates building. But the orchestrator
also handles small fixes *itself*, so "leave one runnable check behind" never
fired for its own work — caught by a live test that produced a correct fix with
no test file. A compact version now lives in the output style too, marked
"applies to work you do yourself, not only to what you delegate."

### Testing tone is contamination-prone

The first tone tests were run in a session with the `caveman` and `ponytail`
plugins active as SessionStart hooks. Output was terse — but that proved nothing,
and one run leaked a literal `// ponytail:` comment prefix that this plugin never
mentions.

**Disable ambient tone plugins before testing register:**

```
CAVEMAN_DEFAULT_MODE=off PONYTAIL_DEFAULT_MODE=off claude --plugin-dir . -p "..."
```

Then run the same prompt with and without `--plugin-dir` and compare. With the
ambient plugins off, the same question produced a preamble, bold headers and a
bulleted list at baseline, versus two direct paragraphs with omc-slim — roughly
half the length.

This is the second contamination of the same kind (the first was testing
adaptivity with a vendor the prompt named). The rule generalises: **before
believing a capability test, check whether the environment already supplies the
capability.**

---

## Adopted behavioural layer (v0.3.0)

Replaces a personal `~/.claude/CLAUDE.md` (~1,058 tok always-on) and a
`fable-mode` staged-execution skill (~1,879 tok per invocation) for **+243 tok
standing** — roughly 2,700 saved per task.

### Placement rule

Only what shapes *every* response goes in the output style. Everything
procedural goes in a skill, where it is paid on invoke.

| Adopted | Lives in |
|---|---|
| Ownership language bans, no-early-stop, no-permission-to-continue | output style |
| "Looks right is not a check", read the artefact not memory | output style |
| Small surface / finished completely | output style |
| Stage map, one failable artefact per stage, backward re-run | `deepwork` |
| Warning threshold, find-and-replace safety, domain variations | `deepwork` |
| Two self-critique questions | `deepwork` |
| Evidence definition, verify-before-flagging | `verification-planning` |
| Bulk-edit word-boundary safety | `fixer` |
| Verify-before-flagging | `oracle`, `tracer` |

`deepwork` absorbed fable-mode rather than a new skill being added — same niche,
zero new frontmatter cost, and it let the OpenCode residue in the old deepwork
(`.slim/` paths, "hook-driven background completion") be stripped at the same
time.

### Conflicts resolved, not stacked

The two source documents contradicted each other and the plugin's own ladder.
Resolutions, all deliberate:

- **YAGNI vs "full solution, every edge case".** Different axes. The ladder
  governs *surface* — what to build. Completeness governs *depth* — once agreed,
  it ships whole. "Cutting a feature is a decision to state; cutting error
  handling is a defect to hide."
- **"Avoid permission-seeking" vs "ask when unclear".** Never ask permission to
  continue work already agreed. Do ask *which* of two readings applies, before
  starting. Encoded as one sentence covering both.
- **"Token cost is never a reason to trim scope" vs the cost thesis.**
  "Concision governs how you write, never what you do or how hard you work."
- **Staged mode mandatory vs the skill's own "when NOT to use this".** The
  source `CLAUDE.md` mandated it for any multi-step task; the skill said staging
  a trivial task "wastes effort and buries the answer under ceremony". Kept the
  skill's trigger discipline. This is an improvement on the original setup, not
  a faithful port of it.

### Verified against bait

A file was planted with the comment *"Pre-existing: this has a known bug with
negative numbers. Nobody has fixed it"* and a report that was itself wrong. With
ambient tone plugins disabled, the plugin: refused the pre-existing exit,
corrected the user's premise from the code, found the planted comment was
factually wrong, grepped callers before proposing a fix, flagged float drift on a
money path, stated plainly that it could not run `node`, and asked which of two
representations to use with a recommendation.

---

## Upstream pins

`UPSTREAM.tsv` records every adopted source with an exact pin: a commit SHA for
git sources, a sha256 for unversioned local files. `./scripts/check-upstream.sh`
queries each remote and hashes each local file, then prints the exact diff
command for anything that moved. Read-only.

`docs/upstream/` holds verbatim snapshots of sources with no upstream to fetch.
A hash proves something changed; the snapshot shows what.

**`CLAUDE.md.snapshot` is gitignored on purpose.** It is a copy of a personal
`~/.claude/CLAUDE.md`, and this repo is public. The sha256 pin in `UPSTREAM.tsv`
still detects drift; only the diff baseline is local. `check-upstream.sh` handles
its absence — it reports `SNAPSHOT LOST` rather than failing, which on a fresh
clone is expected, not a fault. Anyone re-deriving the adoption can read
`COVERAGE.tsv`, which lists every rule taken and where it now lives.

**Updating a pin is a decision, not maintenance.** Review the diff, adopt only
what earns its tokens against the standing-cost budget, then update the pin and
refresh the snapshot in the same commit as the adoption. A pin bumped without a
corresponding change to the plugin is a lie about what was reviewed.

Expect movement. oh-my-claudecode ships roughly 35 npm versions a month and had
already passed its pin within hours of the audit that produced it.

## Coverage of deleted sources

`~/.claude/CLAUDE.md` and `fable-mode/SKILL.md` are adopted **and then deleted** —
that deletion is the point, and it removes the only reference that could prove
the plugin still carries what they provided.

Two mechanisms close that:

- `UPSTREAM.tsv` marks them `kind=archived`. The checker verifies the snapshot in
  `docs/upstream/` instead of the retired path, so deletion reads as `archived`
  rather than `GONE`. It still flags a tampered or missing snapshot, and warns if
  the original is still present but has drifted since adoption.
- `COVERAGE.tsv` maps every adopted behaviour to the file that now carries it,
  asserted by `./scripts/check-coverage.sh` (exit 1 on any miss, so it is
  CI-usable).

**Patterns in `COVERAGE.tsv` are fixed substrings, not regex** — `grep -F`.
Whitespace is normalised first so line-wrapped prose still matches; without that
normalisation a rule that happens to wrap across two lines reads as absent, which
produced a false alarm the first time this was checked by hand.

When rewording an adopted rule, update its pattern in the same commit. When
deliberately dropping one, delete the row and say why in the commit message — a
silent drop is exactly the failure this prevents.

The check earned its place on first use: it caught that `surgical-edits`, adopted
from `CLAUDE.md`, had been lost from the output style during the v0.3.0
eight-blocks-into-six compression. It survived only in `fixer.md`, so the
orchestrator's own edits were unguarded — the same class of gap as the
check-behind rule in v0.2.0. Compression passes drop rules; assume they will.

## Scope: restraint about whose, ambition about the

`CLAUDE.md` said "prefer making surgical edits instead of rewriting whole files
or doing large, sweeping changes". Adopted literally, that suppressed legitimate
rewriting — and contradicted the plugin's own "causes, not symptoms", since
sometimes the cause *is* the structure.

The rule's real job is guarding against **unrequested** work, not **large** work.
Both halves are now explicit in the output style and in `fixer.md`: leave what
nobody asked about, but when asked to rewrite or redesign, that is the scope, and
when a symptom's true cause is the design, say so instead of patching around it.

Verified: given a global mutable store and "rethink the approach — I'm open to a
real redesign", it proposed deleting the module for a domain-scoped API with a
migration table, offered a throwing-shim alternative with the tradeoff named, and
still flagged that it had designed against the mechanism rather than a
reproduction. Restraint and ambition together, not traded off.

## Skill descriptions are dropped at scale — not a plugin bug

On a machine with **103 skills installed, 24 had no description at all** in the
model's listing, across four plugins: `agent-skills`, `chrome-devtools-mcp`,
`ui-ux-pro-max`, and omc-slim (`codemap`, `verification-planning`). Corroborated
by two independent sessions naming overlapping sets.

A skill with no description cannot be matched, so it never auto-invokes. That is
the real reason `verification-planning` and `codemap` did not fire — **not** the
wording. Two description rewrites were spent on the wrong cause before checking
whether other plugins were affected. Verified it is not format, length or the
folded-YAML form: a 183-char single-line description was dropped while a 349-char
one rendered, and a short rewrite changed nothing.

Consequences worth holding onto:

- **Do not tune a skill description to fix non-invocation until you have
  confirmed the description is actually reaching the model.** Ask a session to
  print it back.
- **omc-slim adds 5 skills to a shared, apparently finite listing budget.** On a
  saturated machine it marginally worsens the problem for every installed plugin,
  including itself. That is a real cost of the skill count, separate from token
  cost.
- It also explains an apparent interference result: our `designer` won a
  "design a pricing page" prompt over `ui-ux-pro-max`. That pack's `design`
  skill is one of the bare 24 — it was invisible, not out-competed.

---

## Reading the test history

Six measurement errors were caught in this project, and it is worth knowing the
shape of them before adding a test:

| Error | Cause |
|---|---|
| "adaptivity works" | test used a vendor the prompt itself named |
| "the terse register is ours" | ambient tone plugins were active in the session |
| "delegation never fires" | three build-shaped tasks generalised into a blanket claim |
| "its tests can't run" | the grader assumed pytest; the arm used stdlib unittest |
| "designer/deepwork don't fire" | fixture contained no login form and no migration |
| "the roster check passes" | the check was appended after the script's `exit` |

Three came from the measuring instrument rather than the subject. The habit that
caught all six: **when a result confirms what you already believe, check the
instrument before writing it down.**

## Why no agent may spawn subagents

Every agent denies `Agent` and `Task`. That was inherited from both upstreams —
omo-slim's fixer says "NO spawning subagents", fable-mode says "keep delegation
one level deep, nesting multiplies cost and scatters context" — and adopted
without independent testing. Tested properly on 2026-08-13:

**Nesting is possible.** A throwaway `nester` agent with `Agent` allowed
successfully spawned a `leaf` child and relayed its output. So the denial is a
real capability decision, not a no-op.

**Nesting is unreliable in one-shot mode.** In that same test the parent *ended
its turn after spawning* rather than waiting for the child, three times. Only
repeated nudging from the main thread produced the answer. In a `-p` run nobody
nudges, so a nested spawn returns a silently incomplete result — the exact
failure class this plugin exists to prevent.

**An attempt to justify lifting it failed.** `Agent` was enabled on `oracle` on
the theory that opus review should offload recon to haiku explorers. Across three
runs — implicit, explicitly named, and with the proven unlock phrasing — `oracle`
never fired on a 15-file fixture, because reading 15 three-line files directly is
cheaper than delegating. No benefit could be demonstrated, so the change was
reverted rather than shipped unverified.

Independent reasons to keep it denied elsewhere, regardless of the above:

- `fixer`, `designer` — a writer spawning writers is a runaway-edit risk the
  orchestrator cannot see or reconcile.
- `councillor-*` — nesting would let seats consult each other and destroy the
  independence that makes a council worth more than one opinion.

Revisit if the parent-waits-for-child behaviour becomes reliable, and only with a
fixture large enough that delegation demonstrably pays.
