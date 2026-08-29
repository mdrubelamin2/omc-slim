# omc-slim

Six agents, six skills, two hooks and an output style. The main thread stops
being the implementer and becomes a planner that delegates, verifies and
reconciles. Nothing is injected on the tool-call path, no MCP servers ship with
it, and it inherits whatever servers and skills your project already has.

```
/plugin marketplace add mdrubelamin2/omc-slim
/plugin install omc-slim@omc-slim
```

Benchmarked against a plain session on 2026-08-22, n=3 per arm: 18% cheaper, all
nine runs graded equally correct, and **zero subagents ran in any arm**. So the
measured win came from the prompt, not from the roster this plugin is named for.
That is the least flattering true sentence available and it is the first one,
because the alternative is you finding out in week two.

One more, since the first screen is where it belongs. Someone benchmarked a terse
plugin against the literal instruction *"be brief."* across 24 prompts and found
them **indistinguishable on both tokens and quality**. Compression is not what a
register buys you. What it buys, and what the two-word version cannot, is
consistency of output shape across runs — which is the one thing the 18% run
measured that a single-shot comparison cannot see.

---

## The numbers, and what they do not say

This is the only plugin in its category with a committed, re-runnable harness and
a published negative result about itself. So the numbers come with their limits
attached instead of a footnote.

Static context is **~4,309 tokens**, measured with a real tokeniser.
`./scripts/measure-context.sh` also reports **4,735 on a chars/4 basis**, the
estimate this project's version series is tracked on, and prints the gap between
them every run. That gap used to be a hard-coded 13.5% taken as one average
across the whole repository. A single average does not hold per file, which is
how a 298-token overrun in `review` published itself as a 44-token margin.
`claude plugin details omc-slim` reports a third, smaller number, because it does
not count the output style at all and it does count about 42 tokens per component
of framing that no text measurement can see. So the figure above is a floor, not
the whole charge. Both are in
[LIMITATIONS.md](./docs/LIMITATIONS.md). Quote a basis or don't quote a number.

On one single-file CLI task, n=3 per arm, it averaged **18% less than a plain
session** ($1.01 vs $1.24) with non-overlapping spreads, and shipped the smallest
tool of the three setups tested. The grader could not separate the arms on
quality.

Treat that as a demonstration, not a measurement. One task at n=3 cannot detect
an effect below roughly 30 percentage points, and task-level variance dominates,
so more repeats would not fix it
([evidence](./docs/RESEARCH-2026-08-26.md#8-measurement--how-to-settle-the-central-bet)).
The omc-slim arm also ran with two MCP servers no other arm had. It measured the
prompts as they were **before** the current restructure, so it describes an
earlier build than the one you install. Read
[BENCHMARK.md](./docs/BENCHMARK.md) before quoting it.

The class of claim matters too. Four independent studies find that a *behavioural*
rules layer moves cost, runtime and code size and does not move correctness, and
these numbers fit that pattern exactly. Nothing here claims omc-slim makes Claude
more correct.

That claim is scoped deliberately, because one study cuts the other way and it
would be dishonest to leave it out. SkillsBench (87 tasks, 8 domains, 18
model-harness configurations) found **curated, task-matched skills raising pass
rate from 33.9% to 50.5%** — and, in the same result, that *"focused Skills with
at most three modules outperform larger or exhaustive bundles"*. Expertise a task
needs is not the same thing as discipline applied to every task, and this plugin
is the second kind. The finding that should worry a reader of this page is the
second half: **this plugin ships twelve components, and the measured optimum in
that study is three.**

Where every component stands against what Claude Code already ships, with a
measured win or a dated removal criterion for each:
[docs/NATIVE.md](./docs/NATIVE.md).

Three components write files into your repository, and only when they run:
`codemap` maps it, `deep-interview` writes a spec, `deepwork` keeps a log.
`codemap` says what it will write and waits for a yes; the other two write one
file each, under `docs/`.

## Setup

There isn't any. The orchestration output style applies automatically while the
plugin is enabled, so the main thread works as a planner rather than diving
straight into implementation.

**What a working install looks like.** The first reply that plans or delegates
names the orchestration style. If the `Agent` tool is unavailable in your
session, the first reply says that too. Those two lines are the only evidence
that reaches you, so their **absence** is the signal worth knowing: a session
that plans work and never mentions the style is a session where something else
took the output-style slot. `/plugin disable` the other plugin, or check with
`claude -p "One line: which output style is active?"`.

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

## Teams, CI and Windows

**A team gets it by committing one file.** `enabledPlugins` in
`.claude/settings.json` at the repository root turns the plugin on for everyone
who works in that repository, with no per-machine step:

```json
{ "enabledPlugins": { "omc-slim@omc-slim": true } }
```

Two consequences worth stating before you do it. The output style applies to
every teammate's main thread — that is the point, and it is also a change to how
their sessions read, so tell them. And a teammate who disables it locally in
`.claude/settings.local.json` wins, which is the right precedence and means
nobody is trapped.

**CI runs every gate this repository claims.** `.github/workflows/gates.yml`
executes both hook suites, both mutation runners, the codemap and base-resolution
suites, and the four `check-*.sh` scripts on every push. It installs `tiktoken`
as a hard requirement rather than a nicety: without it the coverage gate refuses
to print a corrected token figure at all, and that refusal is what stops a
published number resting on a constant.

**Windows.** Everything the plugin runs on your machine is Node — both hooks and
`codemap.mjs` — with one exception: the `review` skill invokes
`skills/review/scripts/base.sh` to resolve the diff base. That needs a POSIX
shell, which Git for Windows supplies and which you almost certainly already have
if `git` works. Where it does not, the skill states the five-step resolution
chain in prose beside the command and says to run it by hand. The `scripts/`
directory is maintainer tooling and never runs on a user's machine.

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

## The hooks, first, because they are the part that lasts

The engineer who built Claude Code recommends deleting your skills, hooks and
`CLAUDE.md` every six months to see whether the model still needs them. That is
the right test, and prose loses it more often than machinery does: a rule that
compensates for a model's weakness expires when the weakness does, while a check
that reads a transcript does not.

Two hooks, and neither can block anything. Both emit `systemMessage` only, always exit
0, and stay silent when they cannot tell.

`SubagentStop`, for `fixer` and `designer` only, reports three states to you: no
write-family tool use at all, writes that all landed outside the project, and the
one that matters most — the agent asserted a verification result and no test,
build or typecheck command appears in its transcript. That last one exists
because of a measured failure: on one 45-task benchmark an agent reported every
task complete while **19 of 45** failed held-out tests, on a transcript reading
`5/5 tests pass` about a suite of eight. The hook never accuses; it names the
state and says to ignore it if the work landed another way.

**`SessionStart`** checks whether another enabled plugin also sets
`force-for-plugin` on an output style. Claude Code applies exactly one, picks it
by plugin load order, and reports the loss at a log level nobody sees — so the
orchestrator can go missing with no symptom except that work stops being
delegated. The hook names the competing plugin and hands you the command that
settles which style won. It reads plugin manifests off disk; it never reads your
transcript, and it fires once per session, not on every compaction.

Those are claims, so each has a check. `node hooks/verify-deliverables.test.mjs`
runs 38 cases and `node hooks/check-output-style.test.mjs` runs 22, both against
isolated fixtures, both asserting the exact set of keys the hook may emit — which
is what makes "never blocks" falsifiable. And the checks have checks: the two
`*.mutate.mjs` runners break the hooks 56 and 24 ways and confirm the suites
catch all 80. `OMC_SLIM_DEBUG=1` prints which path either took,
on stderr.

There is no `Stop` hook, no `PostToolUse` hook, and nothing on the tool-call
path.

## Agents

Every agent inherits the model you are running. None pins its own tier, so the
roster costs what your session costs.

**Find things**

| Agent | Ask it | What comes back |
|---|---|---|
| [explorer](./agents/explorer.md) | *"Where is the retry logic?"* | A `file:line` map, not prose. The first call for any where/what/which question |
| [librarian](./agents/librarian.md) | *"Is this still the recommended API?"* | Current docs and real usage, read off disk before anything written about it |
| [fixer](./agents/fixer.md) | *"Rename this across nine files."* | A spec you already decided on, executed. Not research, not architecture |
| [designer](./agents/designer.md) | *"This form looks wrong."* | Layout, hierarchy, spacing, colour, motion, responsive behaviour |
| [oracle](./agents/oracle.md) | *"Is this design going to hold up?"* | A second opinion on an architecture or security call. Escalation, not a default step |
| [tracer](./agents/tracer.md) | *"I have fixed this twice and it keeps coming back."* | Three competing hypotheses, ranked by what would falsify them |

## Skills

| Skill | Ask it | What it does |
|---|---|---|
| [review](./skills/review/SKILL.md) | *"Is this ready to ship?"* | Every axis at once, behind an evidence gate that keeps false positives out |
| [deepwork](./skills/deepwork/SKILL.md) | *"This is too big to get right in one pass."* | Stage plan, parallel lanes, a failable check per stage |
| [deep-interview](./skills/deep-interview/SKILL.md) | *"I want to build something, I am not sure what yet."* | Interviews you, writes a spec, and stops for approval before any code |
| [verification-planning](./skills/verification-planning/SKILL.md) | *"How do I prove this did not break anything?"* | Designs the evidence path. Does not write the tests |
| [simplify](./skills/simplify/SKILL.md) | *"This is over-built."* | Deletes speculative abstraction, config nobody sets, hand-rolled standard library |
| [codemap](./skills/codemap/SKILL.md) | *"Nobody here has read this repository."* | A codemap per directory plus a root atlas. Expensive, and it says so first |

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

The first one also checks the **GitHub repository description**, which is the
fifth site quoting the roster and the token figure and the only one no other
check can see. It has drifted twice. That check needs `gh` and the network, so it
skips itself when it cannot run — and `OMC_SLIM_SKIP_REMOTE=1` skips it
deliberately, which is the right flag for a contributor and the wrong one for a
release. Updating the description is a release step, not a working-tree step: a
clean tree between releases will report it stale, because it describes what is
published rather than what is committed.

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
delegation is a guarantee rather than a request. `Agent` is the canonical name
and carries that guarantee; `Task` is its legacy alias, still resolving as of
2.1.251, kept because the alias path through permission resolution has not been
traced and a redundant guard on the one enforced promise is worth its zero
cost. One hook is our own code, and it
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
and no plugin. **Two never have: `deepwork` and `simplify`.** Invoke those two by
name — `/omc-slim:deepwork`, `/omc-slim:simplify <target>` — or add one paragraph
to your `CLAUDE.md`, which [routing](./docs/ROUTING.md) supplies. `review` has
never been tested either way.

That is the whole disclosure, stated once. It used to appear in four places on
this page, which is how a reader ends up unsure whether they are four separate
limitations. `ROUTING.md` states it twice more, and keeps doing so: those two are
the measurement records behind it, not repetitions of the warning.

**These are notes, not an experiment.** No harness, dates or transcripts are
committed, unlike `scripts/bench/`. And on builds that gate the `Agent` tool —
Claude Code ships "do not call the AgentTool unless the user requested it" by
default for Opus 5 — none of it fires without an explicit request.

Full routing measurements and what to do if nothing delegates:
**[docs/ROUTING.md](./docs/ROUTING.md)**.

## Known limits

- `deepwork` and `simplify` do not auto-fire. Invoke them by name.
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
| [NATIVE.md](./docs/NATIVE.md) | Every component against what Claude Code already ships, with a dated removal criterion for each crowded slot |
| [ASSESSMENT-2026-08-29.md](./docs/ASSESSMENT-2026-08-29.md) | What this plugin actually is, written with an instruction not to look only at the good parts |
| [QUALITY-BAR.md](./docs/QUALITY-BAR.md) | The checkpoints any plugin in this category has to clear, and the two nobody has built |
| [RELEASE-READINESS.md](./docs/RELEASE-READINESS.md) | The v1.0 criteria, four met and three blocked on a run that spends money |

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
