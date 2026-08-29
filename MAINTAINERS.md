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
The retired `council` agent originally used `tools: [Read]` for this reason;
every read-only agent now uses a denylist instead, which still forbids mutation
while leaving `Bash` available to settle a disputed citation.

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

### Removing a name must leave a reason, not a refusal

Seven descriptions dropped a third-party pointer in the same pass — eight names,
since `designer` carried two. Four of the seven were rewritten as capability
boundaries; two were left as bare refusals and a review caught them; `designer`
kept a boundary of its own shape.

`review` ended up saying *"Not for a report that touches no code"* with no
destination — while `"look over my PR"` sits three words earlier in the same
sentence as a positive trigger. The description then both claimed and disclaimed
the same request, and the failure mode is the gate not firing at all. `deepwork`
had the same shape at *"not a plan someone else runs"*.

The pattern that works: say what the component *does* that excludes the case.
`deep-interview`'s "this runs before there is a plan" is the model; `review` and
`deepwork` were repaired to match it. A boundary explains itself and survives the
neighbour being absent; a refusal needs the neighbour to make sense.

**Watch the repair, too.** `review`'s replacement — "a change has to exist first"
— excludes a *narrower* case than the sentence it replaced, which excluded
report-only work. That is a deliberate widening, not a restatement.

### Overlapping triggers orphan a component

`tracer` shipped with **zero inbound references**. Nothing in any prompt named
it, so nothing reached it except a direct request.

The cause was not an oversight. `oracle`'s description claimed *"escalation for a
bug that survived a first fix"* — `tracer`'s trigger, near-verbatim — while
`oracle`'s body is about design and architecture throughout. The description is
the always-loaded routing layer, so every sentence that needed a bug-escalation
target had a nearer, already-referenced candidate, and `tracer` was never the
answer to anything.

**The v0.9.0 contradiction sweep could not see this.** It compared rules, and
these rules did not conflict — the *triggers* overlapped. Two components can be
individually coherent and still collide, and the collision only shows up as an
absence: a component nobody routes to.

`check-coverage.sh` now asserts reachability. Every agent and skill must be named
by some other component's prompt, or be listed in `ENTRY_POINTS` with a reason.
The orchestrator roster does not count as an edge, because it lists everything by
definition. Two are exempt today: `codemap` runs before anything else does, and
`deep-interview` runs before there is a plan to route from.

Proved by renaming every `omc-slim:tracer` reference away, which reproduces the
original bug: `UNREACHABLE tracer is named by no other component`.

### A silent guard is set high, not tight

`maxTurns` shipped at 20-40 in v0.9.0. A user reported runs being cut off
mid-work, and it is now 100 for the read-only agents, 120 for `tracer`, 200 for
`fixer` and `designer`.

The reasoning, which applies to any guard whose failure the caller cannot see:
only a subagent's final message reaches its caller, so a run that ends on its
turn budget returns **nothing**, with no error and no partial output. A bound set
too low destroys work invisibly; a bound set too high costs one run, on the rare
case the guard exists for. Set it well above observed legitimate work.

**Do not overstate the evidence.** A user report is not a controlled observation,
and nothing here verifies the harness honours the key — the two claims sat 18
lines apart in `docs/LIMITATIONS.md` contradicting each other until a review
caught it. Raising the bound is cheap and correct whether or not the key is
enforced; that is the argument, not a measurement.

Observed, for whoever revisits this: subagent runs during one review of this repo
logged 13 to 63 tool uses. Tool calls are an upper bound on turns, not a count of
them, since a turn can carry several in parallel. So 100 is *somewhere above*
1.6× the largest observed run — not an order of magnitude, and it should not be
described as one. To settle it properly, build a throwaway agent with
`maxTurns: 2` and dispatch it in a **fresh session**; a project agent added
mid-session is invisible to the registry, which is why the first attempt failed.

### Shipped prompts name only `omc-slim:` components

The same rule as the vendor-name ban above, applied to agents and skills rather
than MCP servers, and it is now checked: `check-coverage.sh` fails on any
`plugin:component` reference in `agents/`, `skills/` or `output-styles/` whose
prefix is not `omc-slim`. `file:line` is allowlisted.

Naming another plugin's component is a **dead pointer that fails silently**.
"Not a first debugging pass — use someone-else:their-skill" reads fine here and
resolves to nothing on a machine that lacks it; the model then invents a
substitute or does nothing, and no error is raised anywhere. Eight such names
shipped in v0.9.0 across seven descriptions, which is the always-loaded layer.

The fix is not to go silent about neighbours. It is two-sided:

- **Internal edges are named, and namespaced.** `omc-slim:fixer`, never a bare
  `fixer`, which can resolve to another plugin's agent of the same name. These
  are guaranteed present wherever this plugin is installed.
  **One exemption, deliberate:** the roster in the output style writes the twelve
  names bare, because that block *defines* them — it is a menu, not a reference,
  and namespacing every entry would cost static tokens to restate a prefix the
  heading already establishes. Everything outside that block is namespaced. The
  gate cannot see the difference, so this is a convention the roster relies on a
  reader to keep.
- **External capability is discovered, never named.** Every agent and skill that
  would benefit says what *class* of tool would help — a structural search
  server, an observability server, a docs server for this stack — and reaches it
  by reading tool descriptions, with `ToolSearch` where tools are deferred. That
  is the same mechanism proven blind against a server called `kb`.

Boundaries in a description are therefore stated as capabilities: "not a first
debugging pass: reproduce it and localise it before escalating here."

After the rewrite the descriptions measured 15 tokens lighter — a net figure,
since two of them gained a clause while eight names left. Not the point, but the
direction.

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
| `^(.*:)?(fixer\|designer)$` | yes ← what we ship |

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

`verify-deliverables` (SubagentStop) and `check-output-style` (SessionStart) are
the only hooks that ship. Neither returns a `permissionDecision`, so neither can
block. Every error path exits 0 emitting nothing. A broken guard must never break
a session.

`systemMessage` goes to the **user**, not the model — so you cannot verify a hook
fired by asking the model whether it saw a warning. Run it with `OMC_SLIM_DEBUG=1`
and read stderr, which names which "cannot tell" path it took.

`node hooks/verify-deliverables.test.mjs` and `node hooks/check-output-style.test.mjs`
run each hook as a child process against isolated fixtures and assert its
observable contract, including the exact set of keys it may emit. Run the matching
one after any edit to a hook. Neither is wired into CI; `check-coverage.sh` runs
both.

The two `*.mutate.mjs` runners check those suites the only way that means
anything: they break each hook on purpose and require the harness to catch every
mutant. Run one after adding or weakening a case — a suite that still passes when
the hook is broken is worse than none, because it looks like evidence. Add a
mutant whenever you add a branch to a hook. Both share `hooks/mutate-runner.mjs`,
which writes mutants to a temp copy and asserts by sha256 that the tracked hook
was never touched.

**Do not paste the mutant count into prose here.** This section said "fifteen
ways" through eight releases that took it to twenty-three, because nothing checks
a number written in words in a maintainer document. `check-coverage.sh` derives
both totals and asserts the README carries them; the README is the place to quote
them.

### A silent third-party collision is the one failure the plugin cannot self-report

`check-output-style` exists because omc-slim *is* its output style. Claude Code
resolves the active style with `Object.values(...).filter(forceForPlugin)[0]` —
first match wins, ordered by plugin load. A second plugin that forces a style can
take the slot, and the loss is logged at WARN, which no user reads. Everything
still loads; nothing routes.

The hook cannot see which style won: the SessionStart payload carries
`session_id`, `transcript_path`, `cwd`, `hook_event_name` and `source`, and
nothing else. So it reads the *cause* off disk — `enabledPlugins` from the
settings layers, install paths from `installed_plugins.json`, then each plugin's
output-style frontmatter — and reports a condition rather than a verdict.

That inference direction matters more than the detection. Missing a real
collision confuses one user; a false alarm about a plugin that is disabled,
uninstalled or merely documents the flag costs the warning all its credibility.
Seven of the eighteen mutants exist to hold that line.

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
most users — while the plugin is active. Verified twice: with the setting unset,
and with a project pinned to `Explanatory`. Both give an effective style of
`omc-slim:omc-slim`.

That second case is the one that matters, and it was unverified until v0.9.1. The
resolver never reads the user's setting while any plugin forces a style — the
`outputStyle` branch is only reached when the forced-style filter comes back
empty. So a user changing their output style cannot disable this plugin, whatever
it looks like. A user installing a second style-forcing plugin can, silently, and
`check-output-style` is the answer to that. Expect this to be the most common "is it
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
still detects drift; only the diff baseline is local. `check-upstream.sh` reports
it as `unpublished` and stays green, because absence is the expected state
everywhere except this machine. It decides that by asking `git check-ignore`
rather than by holding a list, so the script and `.gitignore` cannot drift apart.
Outside a repository — a release tarball, a vendored copy — `check-ignore` cannot
answer at all, and that third case is also `unpublished`: an early version folded
it in with "not ignored" and made the script exit non-zero for everyone not
working from a clone. Anyone re-deriving the adoption can read `COVERAGE.tsv`,
which lists every rule taken and where it now lives.

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

**Know the ceiling on that check.** A fixed substring proves the phrase is still
in the file. It cannot see meaning, so three edits pass it while destroying the
rule: contradicting it in the next sentence, relocating it into an example or a
counter-example, and inverting the sentence around the matched span. This was
demonstrated, not assumed — appending "Ignore that: shipping at a good stopping
point is correct" after `no-early-stop` left the run reporting every row present.
`REINFORCEMENT.tsv` and `scripts/check-reinforcement.sh` are the second gate.
`COVERAGE.tsv` proves a rule's phrase is present; it cannot prove the phrase
still carries its rule. Two commits record that difference costing real
behaviour — `51dfbcc`, where compression dropped a reinforcing clause and all 87
rows still passed, and `9ee0438`, where collapsing three lane rows that each read
"always" stopped the tests lane reporting. A reinforcement row pins an anchor
plus the phrases that must sit in the **same paragraph** as it, and reports
`GUTTED` when a rule keeps its name and loses its reasoning.

`scripts/bench/smoke-contracts.sh` is the behavioural gate. Every other check is
structural, and structural green missed a live mutant on disk and six agents
whose frontmatter failed to parse, both in one session. It runs
`claude -p --plugin-dir`, the only invocation that loads the working tree rather
than the installed cache, and asserts both that `subagent_stats` reports the
expected agent actually spawned and that its output still honours its contract.
All twelve components, one `claude -p` call each, dry run by default. The "about
$2" figure predates the expansion from three cases and has not been re-measured.

Deletion is what this catches. For meaning, the benchmark at `scripts/bench/` is
the instrument, and `obra/superpowers` measured a deletion costing 3/10 of a
behaviour with the file still reading correctly. Do not widen the patterns to
compensate; a longer substring fails the same three ways.

**Shell scripts are linted by `./scripts/check-shell.sh`** at
`--severity=warning`, which is where defects live rather than opinion. It finds
files by shebang as well as by `.sh`, and includes untracked files — a new script
is linted before it is committed, which is when it is most likely to be wrong. It
prints the file count beside the verdict and treats zero as unproven. A missing
`shellcheck` binary exits 0 with an explicit "this is not a pass", so the absence
of an optional tool never blocks a contributor and never reads as a green run.

When rewording an adopted rule, update its pattern in the same commit. When
deliberately dropping one, delete the row and say why in the commit message — a
silent drop is exactly the failure this prevents.

**The same script asserts the published static-context figure**, at three sites
enrolled by hand in its `published figures` block. Quote that number in a fourth
place and nothing will notice it going stale, so add the site to that list in the
same commit. Enrolment is deliberate: a pattern loose enough to find the figure
anywhere also matches the dated figures in `CHANGELOG.md` and `RESEARCH.md`,
which must never be updated.

**Adding an origin to `COVERAGE.tsv` means editing the checker too.** The
`adoption provenance` block holds a hand-written table classifying every origin
as `tracked` (pinned in `UPSTREAM.tsv`), `documented` (no commit exists to pin —
a local install, or something bundled with Claude Code), or `internal` (our own
review found it). An origin missing from that table fails the check by design, so
a new source cannot arrive without someone stating what it is and where a reader
can find it. Classification is by hand because the files legitimately use
different names for one source — `omc` in `COVERAGE.tsv`, `oh-my-claudecode` in
`UPSTREAM.tsv` — and matching across them loosely produced ten false positives.

**Do not turn the path check into a link checker.** The `internal references`
block resolves `${CLAUDE_PLUGIN_ROOT}` paths only. A general markdown link check
was written first and rejected: `skills/codemap/SKILL.md:168` shows sample output
containing `src/payments/codemap.md`, illustrating what codemap writes in the
user's repo, and a link checker calls all six of those broken on day one.

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
- **omc-slim adds 6 skills to a shared, apparently finite listing budget.** On a
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

Revisit if the parent-waits-for-child behaviour becomes reliable, and only with a
fixture large enough that delegation demonstrably pays.

---

## v0.6.0 — orchestrator audit

A line-by-line audit of the output style, all eleven agents and all five skills,
hunting vagueness, contradictions, overlap, loopholes and edge cases.

### The finding that mattered

`oracle`, `librarian`, `tracer` and the council never fired in real sessions. The
cause was already known and already fixed — for skills. v0.5.x added a skill
roster to the output style because skill descriptions get dropped on machines
with many plugins installed (24 of 103 bare across four plugins). **The same fix
was never applied to agents**, even though agent descriptions are delivered the
same way and fail the same way.

Measured on a 41k-LOC repository, before and after adding an agent roster:

| Prompt | v0.5.2 | v0.6.0 |
|---|---|---|
| "is the worker pool architecture sound?" | no agent, main thread reviewed | `oracle` on turn 1, $1.93 |
| "can we drop the JPEG fallback?" | — | `librarian` on turn 1 via `ToolSearch` → WebSearch, $0.89 |
| "add() subtracts, fix it" | handled directly | handled directly (no over-firing) |

Cost: **+647 tokens of static context, +24%**. That is the trade, and it is the
one number to re-examine if the plugin ever needs to shrink.

A fourth run ("what's the best way to add AVIF output?") returned *no* research
agent — correctly. AVIF was already fully implemented and the orchestrator found
it in the repo and refused to build it. The prompt had a false premise; the
result was right and the test was wrong. Third time a fixture's premise, not the
plugin, produced an apparent failure.

### Defects fixed

| Defect | Where | Fix |
|---|---|---|
| No rule against stale recall | output style | "Your recalled knowledge is stale" + prior-art-before-inventing |
| Sources dropped when relaying external facts | output style | carry the source through |
| `codemap` said "only use when explicitly asked"; the orchestrator said "do not wait to be asked" | codemap | may fire unprompted, must announce cost and writes first |
| "Never handle UI directly" vs "handle one isolated low-risk action" — opposite verdicts on a one-line CSS change | output style | routes on *visual judgement*, not on touching UI |
| Roster could suppress a project's own skills | output style | "a floor, not a ceiling" |
| "Survey what the project exposes" with no mechanism, in a deferred-tool session | output style, fixer, designer | `ToolSearch`; an unsearched tool is invisible, not absent |
| "Run only the validation assigned" + nothing assigned = ships unverified | output style, fixer, designer | never zero validation; run the cheapest existing check |
| Parallel lanes each verified their slice; nothing verified the union | output style | reconcile, then check the merged result |
| Nothing forbade weakening a test to go green | output style, fixer | a check is evidence only while it can fail |
| `fixer` barred from research but expected not to code from memory | fixer | confirm locally, else name the fact and stop |
| Hardcoded "prefer straightforward TypeScript" in a language-agnostic skill | simplify | language of the repository |
| `simplify` had no path to say "this needs restructuring, not tidying" | simplify | scope bounds unrequested work, not large work |
| One-level delegation stated as a choice; it is enforced by the denylists | deepwork | says enforced, and what to do instead |
| Duplicated rules inside the always-loaded style | output style | merged; funded part of the roster |
| `plugin.json` claimed two hooks; one exists | plugin.json | corrected |

### Adopted from upstream

`oh-my-opencode-slim` `282d5f26..6faaed28` reworked its deepwork skill. Three
ideas taken:

- **Parallel structure scan** — an `explorer` runs alongside each oracle gate
  over the phase's changed paths, reporting duplication and misplacement as
  evidence. Cheapest agent, runs concurrently, so the gate costs no extra time.
- **Oracle re-review budget** — one review plus at most two re-reviews, with the
  attempt stated in the prompt (`Gate 2 — review attempt 2 of 3`) and an explicit
  exhaustion path. Turns a guideline into a bound.
- **Phase checkpoint commits** — commit each validated phase so a later failure
  costs one phase, not the run. Adapted: the commit points go in the stage map so
  the user approves them with the plan, rather than committing unasked.

**Rejected:** "before each phase, replace the todo list with delivery todos for
that phase only." It contradicts the adopted `Todo continuity` rule — a new task
is appended, never substituted — which exists to stop earlier work vanishing from
the list. Ours is the better rule; the pin moved without taking this one.

`oh-my-claudecode` `7e38c1f9..5aa678c6` is 64k lines across 241 files of tmux
session management, worker launch acknowledgement and LSP plumbing. Nothing
prompt-level to adopt; it is the runtime-heavy approach this plugin exists to
avoid. Pin advanced, nothing taken.

### Check upgraded

The roster-drift check covered skills only, so an agent roster could rot
undetected — the exact failure it was written to prevent, one level up. It now
checks both, resolving the `councillor-alpha / -beta / -gamma` shorthand against
the files on disk. Proven to fail on a renamed agent, an unlisted new skill, and
a roster entry with no file behind it.

---

## v0.6.1 — observer removed

`observer` was a port artifact. oh-my-opencode-slim targets OpenCode; Claude
Code's `Read` handles images and PDFs natively in the main thread, so the agent
solved a problem this runtime does not have.

Measured on the same image (a rendered Python traceback):

| | direct read | via `observer` |
|---|---|---|
| Fires on "look at err.png and tell me what is failing" | **yes** | **no** |
| Traceback extracted verbatim | yes | yes |
| Cost | $0.35 | $0.33 |
| Cross-referenced the repo to prove the traceback was foreign | **yes** | structurally impossible |

Four reasons, in order of weight:

1. **It never auto-fired.** The main thread just read the image. An agent you
   only get by naming it is the failure the roster exists to prevent.
2. **Forced, it was equivalent — not better.** Same cost, and the relay was
   lossless. A hypothesis that delegation would introduce paraphrase drift was
   tested and **disproved**, so it is not recorded as a defect.
3. **It was strictly less capable.** The direct path also grepped the repo and
   established that the traceback came from a Python service absent from this
   TypeScript codebase. `observer` cannot: no Bash, and its contract says "you
   look; you do not investigate."
4. **Its own selling point did not hold.** The description argued "delegate here
   even if you can read images yourself... returns exact extracted text, never a
   paraphrase." Direct reading is also exact. Both sides were verified.

Corroborating: upstream ships `DEFAULT_DISABLED_AGENTS = ['observer']`
(`RESEARCH.md:100`) — off by default there too.

Recovered ~78 tokens of standing context (45-word description + 14-word roster
line). The 266-word body only ever loaded on invocation, so it cost nothing.

**Untested, and the reason to revert if it bites:** many or very large images,
where sonnet-tier processing and context isolation could pay against an opus
main thread. Nothing routed to it that way, so nothing measured it.

The test that retired it generalises: **does it auto-fire, and is it better than
the direct path?** `explorer`, `librarian`, `oracle`, `codemap` and `fixer` pass
on measurement. `tracer`, `council`, `designer` and the five skills have not been
re-measured since v0.6.0.

---

## v0.6.2 — deepwork does not auto-invoke, and four wording fixes

Reported: deepwork never fires. The suspicion was that `opus` at medium effort
was too low to reach for a heavyweight planning skill.

### What was ruled out

| Hypothesis | Result |
|---|---|
| Medium effort is too low | **No.** Medium and high both fail. Medium delegated *more* (`explorer` + `oracle` vs nothing). n=1 each, so the difference is probably noise — but it rules out medium as the blocker. |
| A session suppression blocks skills | **No.** Probed directly: "neither restriction exists in my instructions." |
| The skill is not visible | **No.** It appears as `omc-slim:deepwork` among 105 installed skills. |
| Writes were blocked, so it never reached execution | **No.** With `Edit,Write` allowed it still did not fire. |
| The trigger was too narrow | **Recognition works, invocation does not.** See below. |

### What is actually happening

Asked point-blank whether deepwork applies to a four-subsystem cancellation bug,
the orchestrator answers **yes** and quotes the new trigger almost verbatim:
"spans several subsystems at once... fixing only one layer leaves the bug
intact... that's exactly deepwork's case."

Given the same task to *do*, it made **14 edits across 3 files** and hit the turn
cap mid-work, with no stage map — the exact failure the skill prevents. The gap
is recognition to action.

Four rounds of prompt change did not move it. The likely reason: the only skill
that reliably self-invokes is `codemap`, which matches an unmistakable task
*shape*. `deepwork` requires a judgement about whether work is hard enough to
stage, and that judgement resolves toward "I can handle this."

**Documented as manual rather than patched further.** The README previously
listed it as auto-firing on the strength of one prompt — "migrate five services,
**in phases**" — which contains the trigger word. That was measuring the prompt,
not the skill.

### The four fixes, kept on their own merits

1. **Cross-cutting trigger** in the roster and the skill description — a fix that
   must land across several subsystems at once because correcting one layer alone
   leaves the system just as broken. Verified to work for recognition.
2. **"Both conditions, not either"** — the gate read "one obvious correct approach
   **and** fits in a single pass", and runs were treating the `and` as an `or`.
3. **Restored "invoking the right one beats improvising the same procedure
   worse".** The v0.6.0 rewrite weakened this to apply only when a skill *cannot
   be seen*, which is a strictly narrower claim. Same regression class as the
   observer routing rationale: rewriting a section silently dropped the sentence
   that carried its reason.
4. **"Plan before the first edit, not after it"** in workflow step 3.
   Measurably changed behaviour — the same prompt then delegated recon to
   `explorer` instead of opening with edits.

None of the four made deepwork auto-invoke, and the commit does not claim they
did.

### Method note

Four test prompts this session had false premises — AVIF already implemented,
WebCodecs has no still-image encoder, persistence and TS strict mode both already
present. Each time the plugin correctly refused rather than building the wrong
thing. Two harness bugs also produced false negatives: `--max-turns 6` killed
runs mid-orientation, and omitting `Edit,Write` stopped runs at the permission
prompt before execution. **Verify the fixture before believing the result.**

---

## v0.6.3 — discovery language said "project", meant "everywhere"

Every place the plugin told an agent to survey its environment said *project*:

| File | Said |
|---|---|
| `output-styles/omc-slim.md` | "this project's own skills and its MCP servers… Survey what the project exposes" |
| `agents/librarian.md` | "survey what this project has… Projects expose their own MCP servers" |
| `agents/fixer.md` | "Your toolset adapts to the project. If it exposes an MCP server…" |
| `agents/designer.md` | "Your toolset adapts to the project." |
| `README.md` | "Project-local skills in `.claude/skills/`" |

Claude Code resolves agents, skills and MCP servers from **two scopes**: the
project's `.claude/` and the user's `~/.claude/`. The prompts named only the
first, which undercuts the adaptivity claim that is this plugin's headline
feature.

On the machine this was found on, the under-inclusion was total:

- **14 of 14 installed plugins are `scope: user`.** Zero project-scope.
- ~70 skills in `~/.claude/skills/`; none in any project `.claude/skills/`.
- 3 global MCP servers in `~/.claude.json` (`exa`, `headroom`,
  `reddit-mcp-buddy`).

Asked to enumerate what it could reach, a `librarian` subagent returned **14 MCP
servers, every one of them user-scope**. So inheritance itself works — the README
claim was accurate — but everything it inherits lives at the scope the prompts
told it to skip.

Fixed by naming both scopes explicitly wherever discovery is described, and
adding the reason: most machines carry far more at the user level, so surveying
only the repository misses nearly everything.

**Left alone deliberately:** "run the cheapest check the project already has" and
"run the project's own check once against the merged result". Those are correctly
project-scoped — a build or test suite belongs to the repository, not the user.

---

## v0.6.4 — simplify, merged from four sources

The four are one lineage, not four opinions: the official `code-simplifier`
agent → addyosmani's `code-simplification` skill (which credits it) →
oh-my-opencode-slim's `simplify` → ours. Most content already overlapped. Only
what was genuinely absent was taken.

### Adopted

| From | What | Why it earned space |
|---|---|---|
| addy | **A test had to change ⇒ you changed behaviour** | The sharpest rule in any of the four, and we had nothing like it. Editing the test destroys the only evidence behaviour was preserved. |
| addy | **Chesterton's Fence**, named, plus `git blame` | We said "understand why it exists" without saying how. The commit message is often the whole answer and costs one command. |
| addy | **Pattern tables** — structure, naming, redundancy | Replaced a flat list of nine words ("Deep nesting", "Dead code"…) with Pattern → Simplification rows. Same coverage, actionable instead of evocative. |
| addy | **Rule of 500** | Above ~500 lines, hand-editing is the wrong tool; use a codemod and verify it on a sample. Nothing else said this. |
| addy | **Comments: delete "what", keep "why"** | We only implied comment removal, which risks deleting the intent comments that matter most. |
| addy | **Red flags** and **Rationalizations to refuse** | The anti-laziness half. Condensed from 7+7 rows to 7+5, dropping the weak ones. |
| addy | **Separate refactor commits from feature commits** | Ours said "whenever possible". Made unconditional. |
| official | Conventions come from the repository | Kept the *principle* while rejecting its hardcoded dialect (below). |
| ours | **Bisect on failure** | Resolves a genuine contradiction — see below. |
| new | **Honour an explicit do-not-touch marker** | The one idea worth keeping from addy's `simplify-ignore` hook, at zero runtime cost. |

### The one real contradiction

addy runs the **full test suite after every single simplification**. omo-slim
and ours use **proportionate final-state verification** instead. These conflict
directly.

Neither is simply right. Per-change testing buys *attribution* — knowing which
change broke it — and pays a full suite run per edit. Final-state verification is
cheap and loses attribution.

Resolved by naming what per-change testing was actually for: **batch only what you
can attribute, and bisect when a batch fails.** That keeps attribution without
paying for it on every edit.

### Rejected, with reasons

- **Language-specific example blocks** (TS/JS, Python, React — roughly a third of
  addy's skill). v0.6.0 removed a hardcoded "prefer straightforward TypeScript"
  from this very file because it is wrong on a Python repo. Re-adding three
  languages of examples reintroduces that bias and triples the length. The
  underlying patterns are kept, language-neutral, in the tables.
- **Hardcoded project standards** from the official agent and OMC — "use ES
  modules", "prefer `function` over arrow functions", "explicit return type
  annotations", "`.js` extensions". These describe *one* repository. Shipping them
  as universal makes the skill fight every project that disagrees, which is the
  churn the skill's own second principle forbids.
- **The `simplify-ignore` PreToolUse hook.** It rewrites file contents on every
  `Read` to blank out protected blocks. That is runtime injection on the tool-call
  path — the specific OMC failure this plugin was built to avoid, and it would
  break every other consumer of `Read` in the session. The intent is kept as a
  prompt rule instead.
- **"Operate autonomously and proactively, refining code immediately after it is
  written"** (official agent). Directly contradicts *Surgical scope, not timid
  scope*: changes must trace to the request. An agent that refactors unrequested
  after every edit is the definition of unrequested work.
- **`level: 3` and XML prompt structure** (OMC). Formatting, no content.
- **"Work ALONE. Do not spawn sub-agents."** (OMC). Already enforced by the
  denylists; a prompt sentence would be weaker and redundant.

### Regression check

Diffed old against new line by line. Every dropped line is a rewording or a
strengthening — the five principles, all four process steps, the verification
list, `Defaults` and `Final-state verification` all survive, as do the v0.6.0
additions ("that **is** the scope", "name the restructure"). Static context is
unchanged at 3,568 tokens because the skill's description did not move; the body
grew 821 → 1,523 words and loads only on invocation.

---

## v0.6.5 — ponytail merged into simplify; principles named; bravery added

The skill covered *expression* — is this well written — and never asked whether
the code should exist. Ponytail is the missing half, so it was merged in as a
retroactive backstop: when the orchestrator, fixer or designer over-builds,
simplify is the last pass that can catch it.

### Added

- **The ladder, applied after the fact** — five rungs, deletion-first, before the
  expression tables. Ordering matters: there is no point tidying a function the
  standard library already ships.
- **The five tags** from `ponytail-review` — `delete:`, `stdlib:`, `native:`,
  `yagni:`, `shrink:`. Non-overlapping with our tables, which classify *how* code
  reads rather than *whether* it should be there.
- **Principles by name** — KISS, YAGNI, DRY, single responsibility, linear flow,
  modularity — each with the specific failure it prevents rather than as a slogan.
- **Be brave about size, never about safety** — refactor as many files as the
  problem spans, restructure rather than rearrange, finish the deletion; but never
  skip the pin-down check, weaken a test, touch a trust boundary, or restructure
  silently.

### Contradiction resolved: DRY vs YAGNI

DRY says extract duplication; YAGNI says do not build abstraction you do not
need. Shipping both unqualified would have the skill argue with itself. Bounded
as **DRY of knowledge, not of characters** — code that must change together for
the same reason is duplicated knowledge; code that merely looks alike is
coincidence — with the **rule of three** as the explicit tiebreaker, because a
wrong abstraction costs more than the duplication it replaced.

### Measured

Fixture: two files, a hand-rolled deep clone, a single-implementation formatter
hierarchy, a config nobody sets, a nested ternary, and a trust-boundary validator
that must survive. Prompt: "src/util.js feels over-engineered. Clean it up."

| | before this change | after |
|---|---|---|
| Skill invoked | **no** — output style did it | **`omc-slim:simplify` fired** |
| `stdlib:` hand-rolled clone | `structuredClone` ✔ | `structuredClone` ✔ |
| `yagni:` formatter hierarchy | collapsed ✔ | collapsed ✔ |
| `delete:` unused config | removed ✔ | removed ✔ |
| Trust-boundary validator | untouched ✔ | untouched ✔ |
| Nested ternary | **left as "already right-sized"** | **guard clauses** ✔ |
| Callers in a second file | n/a | **migrated** ✔ |
| Forwarding wrapper left behind | kept ✘ | **still kept** ✘ |

This is the first judgement-call skill invocation measured in this project;
`codemap` only ever fired on an unmistakable task shape. The broader description
— naming "over-engineered or bloated" — is the plausible cause.

**Still open:** `deepClone` survives as `{ return structuredClone(obj) }`, a
wrapper whose whole body forwards. "Finish the deletion" and the redundancy table
both say inline it. Arguable — a named one-line seam is cheap — but by the
skill's own rules it should have gone, and a fourth round of wording was not
attempted after the deepwork experience showed those returning little.

---

## v0.6.6 — audit of the merged simplify

Six edits were stacked onto `simplify` across v0.6.4 and v0.6.5. Stacking is how
contradictions arrive, so the merged file was audited rather than declared done.
Five were real.

| # | Contradiction | Resolution |
|---|---|---|
| 1 | Principle 4 defended "abstractions serving testability or extensibility"; the `yagni:` tag says delete an abstraction with one implementation. Those are the same object. | An abstraction pays rent when a second implementation exists **today**, or a test really substitutes at that seam. Otherwise it is the `yagni:` case. Same shape as DRY's rule of three: evidence now, not a story about later. |
| 2 | Two adjacent red flags pulled opposite ways: "refactoring outside the task's scope" and "one file touched when the problem spans several". | Reframed as *unrelated* code versus the *same* problem continuing into other files. |
| 3 | Principle 5 ("avoid drive-by refactors") versus the new bravery section ("as many files as the problem spans"). | Bravery now cites Principle 5 explicitly: the guard is on unrequested work, never on large work. |
| 4 | `Defaults` ended with "keep refactors tightly scoped", flatly undercutting the bravery section. | Section deleted — its other three bullets already duplicated Principles 1–3. |
| 5 | Verification stated three times: Step 3, the Step 4 checklist, and a trailing `Final-state verification` section. | Trailing section deleted; its one unique idea (run the repository's own required release checks) folded into the checklist. |

Also: "proportionate final-state verification plan" was referenced three times and
never defined. Now defined inline where it is used.

### A rule that was wrong, not weak

`Finish the deletion` said: replacing a hand-rolled helper and keeping a
forwarding wrapper means updating callers and deleting the wrapper. Across three
runs on the same fixture the model declined three times, ending at
`export const deepClone = structuredClone`.

That is not timidity. **Deleting an exported symbol is an API change, not a
simplification** — the model was right and the rule was overbroad. Refined to
distinguish internal wrappers (delete, migrate callers) from exported ones
(collapse to an alias, or migrate if the module is not a public boundary), and
say which was chosen.

Worth recording as a method point: three consistent "failures" against a rule are
evidence about the rule, not about the model. The earlier instinct — a fourth
round of wording — would have been wrong here.

### Regression check

Fixture re-run after the fixes. `omc-slim:simplify` fired; the nested ternary
became guard clauses; the formatter hierarchy collapsed and callers in the second
file migrated; unused config deleted; the trust-boundary validator untouched.
87/87 coverage rows pass. Static context unchanged at 3,629 tokens.

---

## v0.6.7 — simplify compressed 28%, and it got better

`simplify` had grown to 2,746 words across six stacked edits. Compressed to
**1,978 words (−28%)** with all 87 coverage rows still passing.

Method: say each thing once. The prose had accumulated three layers of the same
idea — YAGNI appeared in rung 1, the `yagni:` tag, Principle 4's tiebreaker, the
named-principles list and a rationalization row. Bullet lists that restated
adjacent prose were folded into it; `Red flags` became one dense middot-separated
line; the two `When to use` lists became two sentences; each named principle went
from a paragraph to one or two lines. No rule was dropped — the coverage manifest
is the proof, and it is why that manifest exists.

### Compression improved behaviour

Same fixture, same prompt, before and after:

| | v0.6.6 (2,746 words) | v0.6.7 (1,978 words) |
|---|---|---|
| Skill fired | yes | yes |
| Nested ternary | guard clauses ✔ | guard clauses ✔ |
| Formatter hierarchy | collapsed ✔ | collapsed ✔ |
| Unused config | deleted ✔ | deleted ✔ |
| Trust-boundary validator | untouched ✔ | untouched ✔ |
| Forwarding wrapper | kept as an alias | **deleted, caller migrated to `structuredClone`** ✔ |
| Cost | $0.71 | **$0.39** |

The wrapper is the interesting one. Three runs on the verbose version declined to
remove it; the compressed version deleted it and migrated the caller — which is
what `Finish the deletion` asks for. Two things changed together: the rule gained
its internal-versus-exported branch in v0.6.6, and the surrounding prose thinned.
Not separable from one run each, but the direction is clear enough to record:
**more words diluted the instruction rather than reinforcing it.**

Worth carrying to the rest of the plugin. `deepwork` absorbed four rounds of added
wording and never fired once; nobody tried removing words.

---

## v0.6.8 — deepwork compressed

Same treatment as `simplify`. Much less to gain: `deepwork` was already tight, so
the body went **1,376 → 1,234 words (−10%)** against simplify's −28%. All 87
coverage rows pass.

The body only loads on invocation, so that cut buys sharpness, not standing
tokens. The part that *is* always loaded is the description, and it was doing
half its job:

> ~~Staged execution discipline for large, high-risk or multi-phase work — a
> written stage plan, parallel delegation, a failable check at every stage,
> review gates, and a skeptical self-review before delivery. Use when…~~

The first sentence described the *mechanism*, which cannot match anything a user
types. Rewritten around vocabulary people actually use — "migrations", "rewrites",
"cross-cutting refactors", "unsafe to half-ship" — and shortened. Static context
3,629 → **3,612**.

### It still does not auto-fire

Sixth attempt, same 41k-LOC cancellation task. Neither the compression nor the
retargeted description changed it. The `simplify` result had suggested trigger
vocabulary was the lever; that does not transfer here.

Standing conclusion is unchanged and already in the README: **deepwork is
invoked, not inferred.** The plausible reason remains that `codemap` and
`simplify` match unmistakable task *shapes* — "map this repo", "this is
over-engineered" — while deepwork asks for a judgement about whether work is hard
enough to stage, and that judgement resolves toward "I can handle this".

### Not verified

Whether the compressed skill runs correctly end to end when invoked explicitly.
The run fired `omc-slim:deepwork`, dispatched an `explorer`, and was still working
when it hit a `--max-turns 13` cap in the harness. That is a test-harness limit,
not a skill failure, and it is the third time in this session that a turn cap has
produced a false negative. Content preservation is covered by the manifest;
end-to-end behaviour on a large repo is not.

---

## v0.6.9 — orchestrator compressed, and one clause proved load-bearing

The orchestrator is the only file loaded on **every** request, so it is where
compression actually pays. Body **2,052 → ~1,860 words**; static context
**3,612 → 3,362 tokens (−250, −6.9%)**.

### The manifest earned its keep twice

First it caught a dropped rule: rewriting the `deepwork` roster line lost the
pinned phrase "across several subsystems at once". Restored.

Then it failed to catch something, which is the more useful finding.

### Compression has a floor, and reinforcement is invisible to the manifest

`COVERAGE.tsv` pins *rules*. It cannot pin **reinforcement** — the sentences that
make a rule actually fire. Compression dropped this clause as redundant:

> On a crowded machine yours compete with dozens of near-synonyms: pick by what
> the work needs, not by what surfaces first.

All 87 rows still passed. The measured behaviour did not:

| Same fixture | v0.6.7 | compressed | clause restored |
|---|---|---|---|
| `simplify` fired | yes | **no** | **yes** |
| Nested ternary | guard clauses | **untouched** | guard clauses |
| `deepClone` wrapper | deleted, caller migrated | alias only | deleted, caller migrated |

~25 tokens bought one skill invocation and two quality behaviours. Now pinned so
a later pass cannot repeat this.

**The general lesson:** a green coverage run proves no rule was *deleted*. It does
not prove the remaining rules still *fire*. Behavioural tests are the only thing
that shows the difference, and this is the second time this session that words
which looked redundant were carrying the load — the first was
"invoking the right one beats improvising the same procedure worse", weakened in
v0.6.0 and restored in v0.6.2.

### Regression check

| Behaviour | Before | After |
|---|---|---|
| `oracle` on an architecture question | fires turn 1 | **fires turn 2** ✔ |
| `simplify` on an over-engineered fixture | fires, full quality | **fires, full quality** ✔ |
| Trivial one-line fix | handled directly | **handled directly** ✔ |
| External-fact question | delegated to `librarian`, $0.89 | **not delegated** — main thread used `ToolSearch` → `WebSearch`, current sourced answer, $0.51 |

The last row is a routing change, not a quality failure: the anti-staleness rule
held, the answer was current and sourced, and it cost 43% less. n=1 either way,
so variance is not excluded.

### Method note

One test in this round was invalid because the fixture was shrunk while a
different variable was under test — the apparent `simplify` regression vanished
under a like-for-like rerun, then reappeared for the real reason above. Rebuild
the fixture exactly, or the comparison means nothing.

---

## v0.7.0 — `review`, merged from six sources

The gap `simplify` left. `simplify` makes code lighter; nothing judged whether a
change was *correct, safe and worth shipping*. Sources merged: gstack's `/review`
(the largest, ~14.4k words), the official `code-review` plugin, a five-axis
review command with its performance and security skills, oh-my-claudecode's
reviewer/verifier/critic agents, oh-my-opencode-slim's deepwork gates and
`verification-planning`, and ponytail's audit posture. `gstack` and
`agent-skills` are now pinned in `UPSTREAM.tsv`; both are MIT.

### Three files, because a checklist you always load is a checklist you dilute

`SKILL.md` is the process and the gates. `checklists.md` is what each lane looks
for. `performance.md` is the whole performance lane plus the keep/revert
discipline. This is the first skill in the plugin with reference files, so
`scripts/check-coverage.sh` grew a resolver case for `skill/file.md` — a rule in
a reference file is no less droppable by a later edit. Proved failable on both
new arms before trusting it.

### A reference file is opened far less often than its skill assumes

Run 1 produced an excellent review — and **never opened either reference file**.
Every finding came from model competence. Meanwhile `COVERAGE.tsv` reported
165/165, because the rules were all *present*.

The wording that failed was descriptive:

> Lanes and their contents are in `checklists.md`. Read only the ones in scope.

Replacing it with an unconditional imperative plus a named cost of skipping —
"**Read `checklists.md` now, before judging anything.** ... A review that never
opened it is a review running on recall" — moved the read rate from **0/1 to
3/4**. A conditional pointer at `performance.md` scored **1/2** over the same
runs.

**What this does *not* establish.** Run 5 opened neither file and produced the
strongest review of the five: twelve findings, three criticals, including one no
other run found. So the honest claim is narrow — imperative framing changes
whether a sibling file is opened; on this fixture it did **not** measurably change
what the review found. Every planted defect was within reach of model competence
alone, which is a limitation of the fixture, not evidence the checklists are
inert. Something harder would be needed to separate the two, and that test has not
been run.

The restructure below is therefore justified on dependency grounds — do not put a
lane's only checklist behind a coin flip — not on a measured quality gain.

### Conflicts the sources did not agree on, and how they were resolved

| Conflict | Resolution |
|---|---|
| Five severity vocabularies across the sources | Three, defined by consequence: **Critical / Required / Optional** |
| Confidence: a 1–10 scale, a HIGH/MED/LOW scale, or none | 1–10, controlling *display*: 8+ report, 6–7 report with a caveat, ≤5 suppress |
| "Never pre-filter, recall is the reviewer's job" vs "self-audit and downgrade in-agent" | Both, staged: **do not filter while looking; filter hard at report time** |
| Low-confidence Critical: block, or suppress? | Reported as an open question; the verdict is set by the worst finding you are *confident* about |
| Severity vs mechanicalness for auto-fix | Separate axes — severity decides whose *decision* it is, mechanicalness whether the *edit* is safe to apply |

### Measured, same fixture both runs

Fixture: a 4-file JS branch with six planted defects and two false-positive
baits. Rebuilt byte-identical between runs.

| | Run 1 | Run 2 | Run 3 | Run 4 | Run 5 |
|---|---|---|---|---|---|
| Fired unprompted on "review my changes" | turn 1 | turn 1 | turn 1 | turn 1 | turn 1 |
| Scoped via `merge-base` | yes | yes | yes | yes | yes |
| Planted defects found | **6/6** | **6/6** | **6/6** | **6/6** | **6/6** |
| False-positive baits avoided | **2/2** | **2/2** | **2/2** | **2/2** | **2/2** |
| False positives emitted | **0** | **0** | **0** | **0** | **0** |
| Criticals | 2 | 2 | 1 | 3 | 3 |
| Extra real bugs beyond the planted six | 5 | 6 | 3 | 6 | 7 |
| `checklists.md` opened | no | yes | yes | yes | **no** |
| `performance.md` opened | no | no | yes | no | no |
| Fresh-context adversarial pass | `oracle` | `oracle` | **blocked** | `oracle` | `oracle` |
| Auto-fixed anything | 1 edit | 3 edits | 2 edits | 2 edits | **0 — deliberately** |
| Cost | $1.55 | $1.32 | $0.78 | $1.27 | $1.01 |

Run 3's adversarial pass did not dispatch: `claude -p` launched from inside a
session inherits `CLAUDE_CODE_CHILD_SESSION=1`, which carries an instruction
against the Agent tool. Runs 1, 2, 4 and 5 disregarded it; run 3 obeyed. **A test
artefact, not a property of an ordinary interactive session** — but what it
accidentally measured is worth keeping. Without the fresh-context pass, run 3 lost
the double-refund accumulation bug (Critical in every other run) and the revenue
overstatement: exactly the seam findings the step exists for. It also *disclosed*
the degradation unprompted — "the adversarial pass ran inline rather than in a
fresh subagent ... that step is weaker than the skill intends" — which is the
scope-reduction disclosure rule working under real degradation.

Run 5 found a critical none of the others did: the `applyRefund` guard **fails
open**. `types.js:9` attaches `total` via the hydrator, so an `Order` built through
the public constructor has `total === undefined`, and `500 > undefined` is `false`
— the only protection in the function approves everything. That is the
"quote the construct that *creates* the symbol" rule not merely avoiding the
false positive but converting it into the most severe finding in the run.

Run 4 held one finding at 6/10 *with a stated reason* — "nothing persists
`applyRefund`'s output yet, so I could not confirm refunded rows reach
`findOrders`" — which is the confidence axis used as designed rather than as
decoration.

**Remaining variance, not fixed:** whether a Critical with one obvious mechanical
fix gets applied or asked about. Three runs parameterised the SQL themselves; run
5 left the tree untouched and said so ("every finding needs a decision from you").
Both are defensible and both were disclosed, so this is logged rather than tuned.

### The fix for an unreliable read is to move the content, not to shout louder

The `performance.md` precondition got the file read in run 3 and not in run 4 —
1 of 2. A lane whose entire checklist is behind a coin flip is not a lane, so the
structure changed instead of the wording: **the review-time half of
`performance.md` (symptom table, anti-pattern catalogue, "never state a number you
did not observe") moved into `checklists.md`, which is read reliably.**

What is left in `performance.md` is only the discipline for *changing* something
on performance grounds — the keep/revert table, the noise gate, the ledger. That
file is now read at the moment a decision needs it, not as a lookup a reviewer can
talk themselves out of. It also removed a real duplication the move had created.

The general shape: reference material splits by *when it is needed*, not by
*topic*. Anything needed to reach a finding belongs where findings are made.

### Still unverified

- Whether `simplify` gets invoked from a review whose simplicity findings are
  substantial; across five runs they were always small enough to handle inline.
- The interface, data/schema, API contract and operations lanes have never fired
  — the fixture has no migration, route or UI.
- Parallel multi-lane dispatch: every run stayed under the size where the skill
  fans out, so the one-message fan-out has never actually executed.
- Whether the checklists change outcomes on a change that is beyond model recall.
  On this fixture they demonstrably did not.

---

## v0.7.1 — review checks the world, not its memory

`review` judged code against recall. Two gates added, mirroring the two already
there:

- **Before the lanes:** read the project's own rules, then survey the installed
  toolset in *both* scopes. Other plugins ship reviewers built for this exact
  stack, and a documentation MCP is authoritative where recall is inference.
  `ToolSearch` reaches deferred tools.
- **At report time:** "**Cite the source, or you do not have a claim.**" The quote
  gate covers what is true inside the repository; anything from outside it — an
  API signature, a default, a deprecation, whether a library still behaves that
  way — is checked against a current source and the source travels into the
  finding. Plus: **the remedy gets the same rigour as the finding**, so check
  whether the platform already solves it, and look for prior art before proposing
  anything bespoke.

### Measured on a fixture built to discriminate

A branch whose defects need a *live* source, plus two false positives that only
the project's own rules can prevent. `.claude/rules/conventions.md` declared the
fixed-1s retry policy and `snake_case` field names deliberate, and both had been
"proposed twice and rejected twice".

The chain fired end to end: **`librarian` → `ToolSearch` → context7 (a different
plugin, at user scope) → four live doc queries.** Then `oracle` for the
adversarial pass.

| Test | Result |
|---|---|
| Stale-recall trap (`crypto.createCipher`) | **Caught**, and over-delivered: verified against the *installed* runtime (`node -v` → v24.19.0, `typeof createCipher` → `undefined`) **and** cited DEP0106 with a URL |
| Source carried into the finding | **yes** — the live link is in the output, not just in the reasoning |
| Rule-blessed FP: exponential backoff | **avoided**, twice explicitly: "Not a challenge to the fixed-retry policy" |
| Rule-blessed FP: rename to camelCase | **avoided** — and inverted into a finding, that numeric IDs coerced to `"1001"` *contradict* the byte-for-byte vendor-spec goal the rule states |
| False positives emitted | **0** |
| Findings | 11 (2 critical), every one quoted, executed or sourced |

The remedy gate showed up where I had not planted it: asked to replace a
hand-rolled grouping, it proposed `Map` rather than a plain object — correctly,
because that fixes key coercion, ordering *and* the `__proto__` crash it had just
demonstrated by running the function.

Two findings came from running the code, not reading it: a vendor `204` makes
`res.json()` throw *after* a successful POST, so the retry loop triple-posts the
batch (measured: "vendor POSTs on 204: 3"), and the loop sleeps three times for
three attempts — 3023ms — which does not implement the "three attempts, 1s apart"
the project rule specifies. **Using the project's own stated policy as the
standard to judge the code against is the behaviour this release was aiming at.**

---

## v0.7.2 — review compressed

`SKILL.md` **3,344 → 2,794 words** (−16.4%), `checklists.md` **1,927 → 1,748**,
the skill as a whole **5,971 → 5,339 (−10.6%)**. All 178 pins intact.

**More automated, not just shorter.** Scope is now one bash block that prints the
merge base, the changed-line count and the file list, and lane selection is a
path/content trigger table (`migration|schema|.sql` → data lane; `auth|session|
token|secret|crypto` → security at any size; and so on) instead of prose asking
for a judgement call. Replacing description with detection is what paid for most
of the reduction.

### The manifest caught one, then missed one — again

Caught: re-wrapping the ask-batching rule moved a bold, turning `**one**` into
`one`. A pinned substring is literal, and that is the point.

Missed: on the same fixture that produced a tests finding in all five earlier
runs, the compressed version produced none. Everything else held — 2/2 baits,
0 false positives, and the strongest set of findings yet, including one the
remedy-rigour rule improved ("this supersedes deleting the pass-through wrapper —
it's the right place for the check"). But the tests lane went quiet.

The likely cause was mine: compressing the lane table had collapsed three rows
each reading `always` into a single `Correctness · Simplicity · Tests | always`.
Three reminders became one. **Grouping rows in a table is compression of
reinforcement, not of content** — the same class as the near-synonyms clause in
v0.6.9.

Two changes, one structural and one that makes the failure impossible to repeat
silently:

- the three always-on lanes get their own rows again;
- **an always-on lane that found nothing says so.** "Tests: coverage adequate for
  the changed paths" is a result, and its absence from a report is
  indistinguishable from never having looked.

The second is the more valuable of the two, because it converts a silent miss
into a visible one regardless of what a future compression does to the table.

**Verified on a byte-identical rebuild:** the tests finding came back, and the run
scored 6/6 planted, 2/2 baits, 0 false positives. That run also happened to lose
its adversarial subagent again, and again the findings it dropped were the seam
ones — the fail-open guard and the double-refund idempotency, both of which the
delegated pass had found an hour earlier on the same fixture. Second independent
observation of the same effect, so it is worth stating plainly: **the fresh-context
pass is not a formality, it is where the concurrency and trust-boundary findings
come from.**

### Fixture B improved under compression

Same fixture, post-compression, best run of the three: both rule-blessed false
positives avoided, five distinct documentation URLs carried into findings, and a
security finding no earlier run reached — `tenant_id` is not bound to the
ciphertext, so a batch can be relabelled to another tenant and still decrypt.

It also used the project's rule to *choose between remedies* rather than merely to
avoid a false positive: `Object.create(null)` over a `Map`, "chosen deliberately:
keys stay string-coerced, so the envelope payload is byte-identical" — that is
`conventions.md`'s byte-for-byte requirement deciding the fix. And it closed with
its own suppression report: "Not flagged, per `.claude/rules/conventions.md`: the
fixed 3×1s retry cadence and the `snake_case` field names." Disclosed suppression
beats silent suppression, and nothing in the skill asked for that line.

---

## v0.7.3 — the compression floor, measured

A second compression pass over all three review files returned **5,339 → 5,203
words (−2.5%)**, against −10.6% the round before. Worth recording *why*, so nobody
spends another pass looking for the same win.

| File | v0.7.1 | v0.7.2 | v0.7.3 |
|---|---|---|---|
| `SKILL.md` | 3,344 | 2,794 | **2,799** |
| `checklists.md` | 1,927 | 1,748 | **1,712** |
| `performance.md` | 797 | 797 | **692** |

`SKILL.md` was rewritten end to end and came out **five words longer**. That is
the finding. v0.7.2's 16% came from replacing *description* with *detection* — a
scope script that prints the merge base and changed-line count, a path/content
trigger table instead of prose asking for a judgement call. Once that lever is
spent, what remains is rule plus concrete trigger with almost no connective tissue
between them, and prose editing returns nothing.

Only `performance.md` had slack, because it had never been compressed. It gave up
13% on its first pass, matching what the other two gave on theirs.

**The rule:** compression of a rules file is a one-time structural win, not a
recurring prose win. Look for description that can become detection. When there is
none left, further reduction is a content decision — dropping lanes or rules — and
that belongs to whoever owns the capability, not to a compression pass.

Rejected: moving rarely-triggered lanes into a third reference file. Reference
files are opened about three times in four (v0.7.0 measurements), so that trades
reliability for tokens, and the lanes it would move are the ones already skipped
cheaply by their triggers.

### Verified, byte-identical rebuild

6/6 planted defects, 2/2 false-positive baits avoided, 0 false positives — and the
run did something no earlier one had: after fixing `statusLabel`, it **added the
assertion pinning the fix** to the existing test file. Fix-first and the always-on
tests lane compounding, not instructed anywhere as a pair.

`performance.md`'s compression is behaviourally unverified: neither fixture reaches
that file, and building one that does would mean a change where an optimisation is
proposed and has to survive re-measurement.

---

## v0.7.4 — default register: Simplified Technical English

The output style's Communication section now merges two things: caveman-lite's
grammar floor (no filler, keep articles, keep whole sentences) with the discipline
of ASD-STE100 Simplified Technical English, which is what the `wait-what` skill
asks for when a message fails to land.

Rules added: one idea per sentence · active voice with a named actor · one word
for one meaning, using the project's own vocabulary · plain word over elaborate ·
no noun stacks · one line of orientation before a conclusion the reader cannot
place.

### Soft numbers do not fire; a ceiling with a repair action does

Measured on one prompt, three configurations, same repository:

| | before | + tone rules | + hard ceiling |
|---|---|---|---|
| mean words/sentence | 20.8 | 18.0 | **13.7** |
| longest sentence | 52 | **52** | **29** |
| sentences over 25 words | 5/21 | 7/25 | **1/31** |
| total words | 499 | 469 | 443 |

The middle column is the finding. "One idea per sentence, around twenty words"
moved the *mean* by 13% and left the *ceiling* untouched — the fifty-word sentence
survived verbatim, and the share of long sentences did not improve.

Reading both outputs showed the long sentences had one shape: a parenthetical
enumeration jammed mid-clause, `(a → b, c → d, e → f)`. So the fix targeted the
observed cause rather than restating the rule louder:

- a hard limit, "never past twenty-five", with the repair named — split at the
  conjunction;
- **a parenthetical list becomes its own sentence or a real list**, because that
  construction "is what pushes a sentence to fifty words, every time".

That took the ceiling from 52 to 29 and long sentences from 28% to 3%, while the
answer got *shorter* and clearer. Same shape as the `performance.md` read-rate
finding in v0.7.0: a soft instruction is one the model can talk itself out of; a
precondition plus a named failure mode is not.

### No cost to review quality

Same fixture, byte-identical, under the tightened register: 6/6 planted defects,
`oracle` dispatched, 2 criticals, 4 fixed. Prose in the review itself came out at
**12.8 mean words per sentence, longest 32, two of forty-three over the limit** —
so the register applies to a structured deliverable, not only to conversational
answers, and carries the same findings in fewer words.

### Cost

+241 tokens of static context, on the only file loaded every request. Paid
knowingly, because it is a default-register change and there is nowhere cheaper to
put it. The first draft cost +300 and was cut back before shipping.

### Found by the test, not by me

The tone run was asked to explain the coverage manifest and reported, unprompted,
that `README.md:442` still claimed "all 31 adopted behaviours" when the real count
is 186. The header also still said "five skills" after `review` shipped. Both
fixed. A register test that audits its own subject matter is a better test than
one that only counts words.

---

## v0.7.5 — comment smells, and a routing fix that did not work

### The gap

`simplify` carried three comment rules: delete comments that restate the code,
keep comments that explain why, remove commented-out blocks. Nothing covered the
smells that actually accumulate. Added, as table rows so each has a named fix:

a comment that **contradicts** the code (read both, fix whichever is wrong, never
leave the pair) · narration — "first we validate", "now return the result" · a
docstring repeating the signature and nothing else · banner dividers, attribution
and dated changelog notes · a `TODO` naming work already done. Plus two
principles: **comment volume is its own smell**, and **a comment is a fence too** —
delete a restating comment freely, but `git blame` one you do not understand,
because the cryptic line about ordering is usually the scar from an outage.

`review`'s simplicity lane gained the detection half: a comment contradicting the
code, narration the change added, a `TODO` the change finished.

### Measured

Fixture: one function carrying eight comment smells, one `FIXME` with an owner
that must survive, and one cryptic comment recording a 2023-11 billing incident.

**8/8 smells handled. The `FIXME` kept.** The incident comment was deleted — but
only after `git log -p`, with the commit SHA cited, the reason given (the file has
never contained a `sort`) and a restore path offered. That is the fence rule
working, not bypassed.

It also found a **second** contradiction that was not planted: `// Round down to
two decimal places` is wrong, because `Math.round` rounds half-up.

### The routing miss, and the fix that failed

`simplify` **did not fire** on the prompt `simplify src/pricing.js`. The
orchestrator handled a 38-line file directly, which its own rule permits: "handle
it directly when it is one isolated, low-risk action **and** briefing a specialist
would cost more than doing it."

That exemption was written for *agents*, which need a briefing. A skill costs one
file read, so it should never have applied. I added a clause saying exactly that,
re-ran the identical prompt — **and the skill still did not fire.**

So the clause was reverted. It cost ~55 tokens of static context on every request
and produced no measured change, which is the "neutral is a revert" rule from our
own `performance.md` applied to our own work. Keeping it would have been
unmeasured complexity.

**Known limitation, documented rather than fixed:** naming the operation a skill
is named for does not reliably invoke it. Same shape as `deepwork` — a skill fires
on unmistakable task *shape*, and "simplify one small file" resolves to "I can
just do this". Workaround is the explicit form, `/omc-slim:simplify <target>`.

Practical impact is small: across three runs on this fixture — two without the
skill, one with — all three produced good comment handling, because the
orchestrator's own standards carry most of it. But **only the forced run is
evidence that these new rules work**, and the first run I looked at was not, which
is worth remembering before crediting a rule for behaviour the model would have
produced anyway.

---

## v0.7.6 — simplify and the orchestrator hit the same floor

| File | before | after |
|---|---|---|
| `skills/simplify/SKILL.md` | 2,149 words | **2,101** (−2.2%) |
| `output-styles/omc-slim.md` | 3,579 tokens | **3,531** (−1.3%) |

Third file pair to land in the same place, so the pattern is now established
rather than suspected. `review` returned 10.6% on its first compression and 2.5%
on its second. `simplify` was cut 28% back in v0.6.5 and returns 2.2% now. The
orchestrator was cut 7% in v0.6.9 and returns 1.3%.

**A rules file compresses once, structurally, and never again.** The first pass
finds description that can become detection, or two sections saying one thing.
After that every remaining word is a rule or a concrete trigger, and prose editing
returns noise.

### The one structural duplicate left in simplify

"Be brave about size" opened by restating Principle 5 in full, and said so out
loud: *"This is Principle 5 read correctly."* One rule written twice, ~40 words.
Now a single clause pointing back at the principle. That was the last duplicate of
its kind I could find in the file.

The orchestrator's slack was all in material added the same day — the ASD-STE100
register block, which had never been through a pass. Tightening it plus the
design-handoff and context-window paragraphs bought 48 tokens.

### What was rejected, and why

Pushing the orchestrator's `Standards` section into the skills that also state
those rules. It looks like ~700 words of duplication. It is not: skills only load
when invoked, and the standards have to apply to direct work too. Same trap as the
reference-file read rate measured at three in four in v0.7.0 — moving a rule
somewhere it might not be read is not compression, it is a reliability trade
wearing compression's clothes.

### Verified, both fixtures rebuilt byte-identical

`simplify` on the comment fixture: 8/8 smells handled, the `FIXME` kept, both
contradictions caught including the one that was never planted (`// Round down to
two decimal places` against `Math.round`), and the incident comment removed only
after `git log -p`, with the commit cited and an offer to relocate it.

`review` on the refunds fixture: 6/6 planted defects, `oracle` dispatched, and the
register held at **13.4 mean words per sentence, longest 29**. It also produced
the sharpest finding any run has made on that fixture — `hydrate` builds `total`
with `s + i.price`, and node-postgres returns `NUMERIC` as a *string*, so the
total silently concatenates and the refund cap compares against it.

---

## v0.7.7 — a scope cut is not an assumption

Reported from a real run: `deepwork` on "unify **all** of the pages header part"
worked for an hour and left every route under `settings/` untouched.

### My first diagnosis was wrong

I listed four discovery-failure hypotheses — glob depth, a nested layout hiding
the header, lane assignment, a self-consistent subtree reading as uniform. All
four were wrong. The transcript showed the run had **found** the settings pages,
decided they were out of scope, recorded that as a stated assumption, and carried
on. It was not a discovery miss. It was a silent scope cut.

Worth keeping as a method note: for a "why did it miss X" question, the transcript
settles it and hypotheses do not. I should have asked for it before enumerating
causes.

### The defect

`deepwork` said the stage map is "living, not a contract — update it when what you
learn invalidates the plan, and say that you did." Nothing distinguished two
different kinds of assumption:

- **fills a gap** — "the vendor spec is unavailable, assuming JSON" → state it,
  proceed;
- **removes work** — "treating settings as out of scope" → a cut made on the
  caller's behalf.

The second was handled like the first, so the user learned about it in the report,
an hour late. Every gate downstream passed, faithfully, against a narrowed set.

### Two rules

**Before the map runs.** *An assumption that shrinks the deliverable is a
question, not an assumption.* Where the request names a set, this applies to each
member proposed for exclusion, and "it looked different from the others" is the
reason to ask rather than the reason to skip.

**At the end.** *Set-shaped work closes by diffing the set* — re-run the
enumeration and list every member not touched, each with a reason. "Already
conformant" is a reason; absence from the list is not. This one is a check that
can fail, which is deepwork's currency, so it catches the miss even when the first
rule is talked past.

### Verified on a reproduction

Ten routes, five behind a shared `SettingsPage` rendering `Typography.Title
level={4}` with optional descriptions, a dashboard to exclude, a tabbed documents
page. Same prompt, verbatim.

All five settings routes changed plus the shared component; dashboard correctly
untouched. The closing gate fired in the report: "re-enumerated the route set with
`find` — 10 pages, 9 route through `PageHeader`, dashboard is the only miss and
that's intended."

Two unasked-for behaviours worth noting. It stated its verification ceiling rather
than implying more ("no `package.json`, no build, typecheck or dev server, and I
never saw this render"). And it **rejected** an oracle suggestion to restore the
deleted subtitles behind a `subtitle` prop, because removing them was the request —
scope fidelity holding in the direction that usually fails quietly.

---

## v0.7.8 — review the set, not the diff

Second set-completeness failure reported in two days, and a different mechanism
from v0.7.7. Worth stating together, because set-shaped work fails in exactly two
ways and both are now gated:

| | Mechanism | Gate |
|---|---|---|
| v0.7.7 `deepwork` | The set was known and a member was **silently excluded** | A scope cut is a question, not an assumption |
| v0.7.8 `review` | The member was **never in the set**, so no lane could see it | Review the set, not the diff |

### The mechanism

A header-unification branch migrated every page that imported
`getPageShellStyle`. One route imported neither helper, so it never entered the
inventory — and it is absent from the diff by construction, which makes it
invisible to every review lane, since each is dispatched with the diff command.

The user's own diagnosis is the rule: *"a page absent from the diff is invisible
to a diff review."* Their fix is the sharper half — enumerate every authenticated
route, resolve each to its component, and test whether it reaches `PageHeader`.

**Deriving the set from the old implementation reproduces the change's blind spot
exactly.** "Everything importing the helper we are replacing" cannot, by
construction, find the file that never imported it — and that file is the one most
likely to have been forgotten. The set has to come from the goal.

### What changed

`SKILL.md` step 2 gained both halves: review the set rather than the diff when the
request covers one, and derive it from the goal rather than from the code being
replaced.

`checklists.md` generalised its enum rule. That lane was already the **only** one
licensed to read outside the diff, but it was scoped to enum values, statuses and
type constants. It is now a **Completeness** lane covering three shapes — a new
enum value, a change covering a set, and a new required field or renamed export —
opening with the reason it exists: a member the change forgot is not in the diff,
so only this lane can find it.

### Verified on a reproduction

Five routes in a router, four importing the helper being deleted, one
(`project-list.tsx`) importing neither and therefore absent from the diff.

Review's **first** finding, at 10/10 confidence: "`src/router.tsx:12` routes
`ProjectList` alongside the other four, but it never imported `styles.ts`, so
enumerating 'who uses the helper we are deleting' cannot see it." The rule fired
and the reviewer named the derivation trap itself.

It also caught three consequences the migration created and the diff alone would
have justified: `PageHeader` hardcodes `<h2>` so no document has an `h1`; the old
`getPageShellStyle` padding was deleted with no `children` slot to replace it; and
the new breadcrumb renders plain text with no `/` route to link to.

---

## v0.7.9 — the compression pass that paid structurally instead

`deepwork` 1,388 → 1,356 words. `review` 5,426 → 5,386 across its three files.
**−1.1% overall**, the fourth file set to land on the same floor, so this is now
settled: a rules file compresses once, structurally, and prose passes after that
return noise.

The pass earned its keep by finding something else.

### I had duplicated a rule and then referenced a lane that did not exist

v0.7.8 added the set-completeness rule in two places — `SKILL.md` step 2 and the
`checklists.md` lane — with both stating "absent from the diff" and both stating
"derive from the goal". About 90 duplicated words, written a day earlier by me.

Worse: step 2 said *"the completeness lane"*, and there was no such lane.
Completeness was a **subsection of Correctness**. Two consequences neither the
manifest nor a read-through catches:

- on a diff over the fan-out threshold, lanes are dispatched one subagent each
  from the lane table — a subsection is never dispatched;
- *"an always-on lane that found nothing says so"* applies to lanes, so the one
  lane whose whole purpose is finding an omission had no obligation to report
  finding none.

Completeness is now its own always-on row. Step 2 keeps the principle in one
sentence and points at the lane; the lane keeps the three concrete shapes, so a
dispatched subagent receives them.

One `COVERAGE.tsv` row was deleted deliberately — `derive-set-from-goal`, whose
rule now lives wholly in the lane under `enumerate-from-goal-not-old-impl`. Rows
go away with a reason in the commit message, never silently.

### Verified, both fixtures rebuilt byte-identical

`review` on the set-gap fixture: `completeness` appears by name in the lane list,
and `project-list.tsx` is reported at 8/10 — "the fifth authenticated page
(`src/router.tsx:11`) was not migrated", cited to the router rather than to the
diff. It ranked second behind the deleted page shell this time rather than first,
which is defensible: the shell finding breaks all four pages that *were* migrated.
It also caught a new one — the breadcrumb reads `Home / Teams` above a heading
reading `Team`.

`deepwork` on the header fixture: nine of ten pages unified including all five
settings routes, dashboard untouched, and the closing enumeration present in the
report. The scope-cut gate survived rewording, which was the risk worth testing —
v0.6.9 is the precedent for a proven rule quietly ceasing to fire after a
compression pass touched its wording. It also caught six defects across two review
rounds: breadcrumbs linking to `/` and `/settings`, neither of which exists;
a raw `<a>` full-reloading the page; every page dropped to `<h3>` with no `h1`
above it; and a lost `<header>` landmark.

---

## v0.8.0 — fixer writes to the same standard the reviewers hold

`fixer` had the ponytail ladder, cause-not-symptom, the installed-toolset rule and
a verification floor. It had nothing about the **shape** of what it writes, and
nothing stopping it re-introducing a fixed bug. Both are now closed.

### Four disciplines it was missing

**The project's rules outrank your habits.** Read `CLAUDE.md`/`AGENTS.md`,
`.claude/rules/` and the lint and type configuration before the first edit, then
find the nearest existing implementation of the pattern — that file is the
specification. *A second dialect of an established pattern is a regression even
when the code is correct.*

**Do not re-open a closed bug.** Code that looks wrong is sometimes a scar. Before
deleting a guard, an ordering constraint, a retry or an odd comment, run
`git blame`: a line introduced by a commit that says *fix* is a regression waiting
to be re-introduced. This is `simplify`'s Chesterton's Fence, which the writer
lane never had.

**Prior art applies to the approach, not only the signature.** `fixer` has no web
access by design, so before hand-writing backoff, rate limiting, diffing, parsing
or anything cryptographic it names the problem for the caller to route.

**The shape of what you write** — linear, one reason to change, modular pointing
one way, DRY of knowledge rather than of characters, self-explanatory names, no
boolean flag parameters. Closing line: a function past ~50 lines, a nested ternary
or a mutating `get*` are review findings, so *do not ship them and leave `simplify`
to clean up after you.* The writer should not rely on the backstop.

Comments were widened past narration to cover thinking out loud in the file —
"we need to handle the case where…", "I went with X because it felt cleaner". That
is a conversation, not a comment.

### Measured, four traps in one fixture

A project rule requiring `Result<T>` and forbidding exponential backoff, a
canonical `syncClients` to match, a hand-roll temptation, and a `!Number.isFinite`
guard added by `fix: NaN from the vendor feed was corrupting invoice totals` — with
the prompt explicitly inviting a tidy-up of that file.

All four held. The refusal is the one worth quoting, because the invitation to
delete was explicit:

> The one line that reads as redundant is the `Number.isFinite` guard from
> `e426d54`. TypeScript says `amount` is a `number`; the vendor feed says otherwise
> and sends `""`, which arrives as `NaN`. Deleting that guard reintroduces the
> invoice-total corruption you fixed yesterday. I left the file alone.

It matched the sibling line for line, kept the fixed 3×1s retry, threw nothing,
and reported honestly that nothing was compiled because the repo has no toolchain
— then proposed the test that would pin the retry count and spacing.

**Caveat on that run:** it predates the shape rules, and the output was clean partly
because a canonical sibling existed to copy.

### The shape rules, tested with nothing to copy

Second fixture: an empty repo, one `Row` type, and a task naming **three optional
behaviours** — csv or json, exclude archived, group by client, plus a total line.
That is an invitation to `formatReport(rows, true, false, true)`.

110 lines, **zero comment lines**, and none needed:

| Rule | Result |
|---|---|
| No boolean flag parameters | a `ReportOptions` object, unprompted |
| One reason to change | seven functions, each nameable without "and" |
| DRY of knowledge | `sumAmounts` and `groupByClient` shared by both formatters |
| Self-explanatory | `filteredRows`, `csvRowLine`, `groupPayload` — no `data`/`temp` |
| Linear | `formatReport` is six lines, top to bottom |
| No thinking out loud | zero comments in a file that reads without them |

It also exceeded the one-check-behind floor — wrote 14 tests, ran them, and
disclosed the real ceiling: "the tests run under Node 24's type stripping, which
erases annotations without checking them. Types are unverified."

---

## v0.8.1 — deepwork auto-invocation solved: it was the injection point

Eight attempts across several releases tried to make `deepwork` self-invoke by
rewording its trigger inside `output-styles/omc-slim.md`. Every one failed. The
answer came from re-reading the archived `CLAUDE.md` snapshot, where the rule that
made `fable-mode` fire almost every time was sitting in plain sight:

> For any task that spans multiple files, multiple sources, or multiple steps …
> you MUST invoke the **fable-mode** skill (Skill tool, `skill: fable-mode`)
> BEFORE any other tool call or substantive output. Do not skip, defer, or work
> around it.

I first read that as four wording techniques — mandatory rather than descriptive,
the exact tool call named, an ordering constraint, escapes closed by name — and
shipped it into the output style. **It still did not fire**, and went straight to
`Write` on call 4.

The variable was never the wording. It was the file.

| Identical wording, identical fixture and prompt | Result |
|---|---|
| in `output-styles/omc-slim.md` | never fires |
| in `CLAUDE.md` | **fires as tool call 1** |

An output style shapes *how* the model works; it does not compel a skill
invocation the way project or user instructions do. Eight rounds of rewording held
the one variable that mattered constant, which is a method failure worth naming:
when several attempts at the same fix all fail, stop varying the parameter and
question the frame.

This very likely explains the `simplify` non-invocation logged in v0.7.5 as well —
the same class, the same file, and the routing clause I added there also measured
zero and was reverted.

**Shipped as documentation, not code.** A plugin cannot write a user's
`CLAUDE.md`, so `README.md` now carries the paragraph to paste and the measurement
behind it. The output style is unchanged and the +117 tokens of failed mandate were
reverted.

## The incidents ledger (opened v0.9.2, 2026-08-29)

Four failure classes are declined features rather than gaps. Each declined with a
falsifiable reopening trigger, and until now nothing counted the trigger. A
refusal that is falsifiable in principle and unobservable in practice is a
refusal nobody can ever overturn, which is a worse position than having no
refusal at all.

So this is where observations land. **The per-release dogfood transcript scan is
a step in the release checklist**, and its findings come here. Counts accumulate
across releases; they do not reset.

| Class | Reopens at | Observed |
|---|---|---|
| Idle abandonment — the agent stops mid-task and waits | 3 incidents | 0 |
| Identical-tool-call loop — the same call repeated with no new information | 1 incident | 0 |
| Format drift after a mutation — output that no longer matches its contract | 1 review finding | 0 |
| A standing rule missed after it left the context window | measurement exists | not measured |

One line per incident, appended under the table: the date, the class, the
transcript path, and one sentence on what happened. Nothing is entered from
memory — an incident without a transcript path is not an incident, it is a
recollection, and the whole point of the ledger is that the refusals turn on
evidence rather than on impression.

### Incidents

*(none recorded yet — this section is deliberately empty rather than absent, so
that "no incidents" is distinguishable from "nobody looked")*

## A refusal that expired: aider watch mode

Recorded 2026-08-28 as impossibility-class — *"no filesystem-change hook
exists"*. **That was false by 2026-08-29.** Claude Code 2.1.251 ships a
`FileChanged` hook event, payload
`{session_id, transcript_path, cwd, prompt_id?, hook_event_name, file_path, event}`
where `event` is `change`, `add` or `unlink`, backed by chokidar with
`awaitWriteFinish`. `SessionStart`, `CwdChanged` and `FileChanged` hooks may all
return `hookSpecificOutput.watchPaths`, so a plugin can register watches at
session start and extend them as it goes.

The refusal's own trigger — *"reopens only if the platform ships the missing
capability"* — has therefore fired. It is reopened as an open question, not as
adopted work: `FileChanged` is off the tool-call path, but it fires per write,
and "nothing injects per tool call" is a pledge about what runs repeatedly rather
than about which event name carries it. The question is spend, and it belongs to
the same argument the Todo Enforcer lost.

The lesson is about the record rather than the feature. **An impossibility claim
is the shortest-lived kind of claim a plugin can publish**, because it is a
statement about someone else's roadmap. This one lasted a day. Every remaining
impossibility-class refusal carries a re-check date for that reason.

## The release checklist

Ordered, because two of these are only correct in this order.

1. `./scripts/check-coverage.sh` — **without** `OMC_SLIM_SKIP_REMOTE=1`. That
   flag exists for contributors on an aeroplane; using it at release time skips
   the one published figure no other check can see, and v0.9.2 shipped a Critical
   defect that survived precisely because a reviewer was told to set it.
2. `./scripts/check-reinforcement.sh`, `./scripts/check-shell.sh`,
   `./scripts/check-evals.sh`.
3. Both hook suites and both mutation runners; `skills/codemap/scripts/codemap.test.mjs`;
   `skills/review/scripts/base.test.sh`.
4. **The contradiction sweep**, over the shipped prompt surface. It is a release
   gate, not an action item. On its first run as a gate it found eleven
   contradictions in the release that had just been written, six of them
   introduced by that release — every one of which passed every presence check.
5. **Scan the release's dogfood transcript** for the four failure classes in the
   incidents ledger above, and record what you find there.
6. Bump `.claude-plugin/plugin.json`, write the `CHANGELOG.md` entry, commit.
7. **Update the GitHub repository description last**, after the tag, with the
   command `check-coverage.sh` prints. It describes what is published, so doing
   it earlier makes it describe something that does not exist yet.

Between releases the description check will report stale. That is correct and it
is not a red build: the tree has moved and the published description has not.
