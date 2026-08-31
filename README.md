# omc-slim

Claude Code plugin. A discipline layer: it keeps a terse principal-engineer register,
it stops the model claiming a test it never ran, and it stops before building
the wrong thing.

```
/plugin marketplace add mdrubelamin2/omc-slim
/plugin install omc-slim@omc-slim
```

That is the whole setup: six agents, six skills, five hooks and an output style
turn on together.

Or try it without installing:

```
git clone https://github.com/mdrubelamin2/omc-slim
claude --plugin-dir ./omc-slim
```

## What changes

**A test it never ran cannot pass quietly.** A hook reads `last_assistant_message`
and the session transcript on the main thread and on writer subagents. If it
reported a passing suite and no test runner is in there, you are told. The hook
tells you and not the model: on Stop, a message to the model continues the turn,
and this plugin never continues a turn. Shell commands are matched on argv0, so
`git log --oneline latest` no longer counts as a run. The worst case this guards
against is measured: one benchmark had an agent report every task complete while
19 of 45 held-out tests failed, on a transcript reading `5/5 tests pass` about a
suite of eight.

**It plans before it edits.** Ask for something that spans four files and you get
a numbered stage map with a check per stage, shown before any work starts. Not
fourteen edits and a summary that says it went well.

**Read-only agents cannot edit files.** The agents that research and search have
`Edit` and `Write` denied at the harness level. They keep `Bash` for `git log`
and `npm view`, and a shell write there is forbidden by their prompt, not by the
harness. The same mechanism stops any agent spawning another, so a delegation
cannot quietly become a tree that spends your budget.

**It says what it could not check.** Reviews carry the quote that proves each
finding, and a finding with no evidence is dropped rather than reported. Where
something could not be verified, that is written down instead of smoothed over.

**It stays out of the way.** ~4,666 tokens of always-on context, nothing injected
per tool call, no MCP servers of its own, and it inherits whatever servers and
skills your project already has. It writes no files into your project unless you
run one of the three that do. The FileChanged hook keeps a small ledger under
`~/.claude/omc-slim/` (or `$CLAUDE_CONFIG_DIR`), never inside your project.

One thing it does take over: your `outputStyle`, for as long as it is enabled.
`/plugin disable omc-slim` gives that back. The ledger files under
`~/.claude/omc-slim/ledgers/` are yours to delete.

## What you can ask for

Ask in plain language. You should not need to name any of them.

| Agent | Ask it | What comes back |
|---|---|---|
| [explorer](./agents/explorer.md) | *"Where is the retry logic?"* | A `file:line` map, not prose. The first call for any where/what/which question |
| [librarian](./agents/librarian.md) | *"Is this still the recommended API?"* | Current docs and real usage, read off disk before anything written about it |
| [fixer](./agents/fixer.md) | *"Rename this across nine files."* | A spec you already decided on, executed. Not research, not architecture |
| [designer](./agents/designer.md) | *"This form looks wrong."* | Layout, hierarchy, spacing, colour, motion, responsive behaviour |
| [oracle](./agents/oracle.md) | *"Is this design going to hold up?"* | A second opinion on an architecture or security call. Escalation, not a default step |
| [tracer](./agents/tracer.md) | *"I have fixed this twice and it keeps coming back."* | Three competing hypotheses, ranked by what would falsify them |

| Skill | Ask it | What it does |
|---|---|---|
| [review](./skills/review/SKILL.md) | *"Is this ready to ship?"* | Every axis at once, behind an evidence gate that keeps false positives out |
| [deepwork](./skills/deepwork/SKILL.md) | *"This is too big to get right in one pass."* | Stage plan, parallel lanes, a failable check per stage |
| [deep-interview](./skills/deep-interview/SKILL.md) | *"I want to build something, I am not sure what yet."* | Interviews you, writes a spec, and stops for approval before any code |
| [verification-planning](./skills/verification-planning/SKILL.md) | *"How do I prove this did not break anything?"* | Designs the evidence path. Does not write the tests |
| [simplify](./skills/simplify/SKILL.md) | *"This is over-built."* | Deletes speculative abstraction, config nobody sets, hand-rolled standard library |
| [codemap](./skills/codemap/SKILL.md) | *"Nobody here has read this repository."* | A codemap per directory plus a root atlas. Expensive, and it says so first |

`deepwork` and `simplify` are the two you invoke by name:
`/omc-slim:deepwork`, `/omc-slim:simplify <target>`.

## Is it on?

The first reply that plans or delegates names the style. Its **absence** is the
signal: another enabled plugin can take the output-style slot, and Claude Code
picks the winner by load order without telling you.

For a permanent badge, add the status line. It costs no model tokens and prints
`omc-slim ●` when the style is in force, `omc-slim ✗ (Concise won)` when it is
not:

```json
{ "statusLine": { "type": "command",
                  "command": "/path/to/omc-slim/scripts/optional/statusline.sh" } }
```

To turn it off: `/plugin disable omc-slim`. Output style is part of the system
prompt, so changes land after `/clear` or in a new session.

## For a team

Commit one file and everyone on the repository gets it, with no per-machine step:

```json
{ "enabledPlugins": { "omc-slim@omc-slim": true } }
```

Tell them first. It changes how every teammate's session reads. Anyone who
disables it in `.claude/settings.local.json` wins, so nobody is trapped.

## What it costs

**~4,666 tokens** of always-on context, and nothing injected per tool call. Treat
it as a floor: the harness adds framing no text measurement sees, so the real
figure is nearer 5,400 ([LIMITATIONS.md](./docs/LIMITATIONS.md)).
`./scripts/measure-context.sh` re-derives it, and also prints **5,277 on a
chars/4 basis**, the estimate this project's version series is tracked on.

Two settings of yours will save you more than this plugin costs, and neither is a
plugin change:

- **`ENABLE_TOOL_SEARCH`** defers MCP tool definitions until something needs
  them. One audit of 926 sessions went from **45k to 15.5k tokens**.
  `{ "env": { "ENABLE_TOOL_SEARCH": "true" } }`
- **`subagentPromptCacheTtl`** (Claude Code 2.1.242+). Subagents get a
  five-minute prompt cache where your main conversation gets an hour, so a
  delegating plugin pays full price for prefixes it could have read from cache.
  `{ "subagentPromptCacheTtl": "1h" }`

## What we measured, including what did not work

No other plugin in this category publishes a negative result about itself. This
one does, on its front page, because a plugin that hides its misses is a plugin
you cannot calibrate.

**It does not make Claude more correct.** It changes cost, structure and what
gets checked. Four independent studies find a behavioural rules layer moves
exactly those and not correctness, and our own numbers fit that pattern.

**Delegation was available in every benchmark run and the model never chose it.**
Nine runs, 18% cheaper at equal graded quality, and zero subagents in any arm.
That is a finding against this plugin's own thesis. One task at n=3 proves very
little, the winning arm had two MCP servers the others did not, and the build it
measured is older than the one you install.

**Two skills do not start on their own.** Invoke `deepwork` and `simplify` by
name, or paste one paragraph into your `CLAUDE.md`. The rest have been seen
starting unprompted, but that is observed rather than measured, and some builds
gate delegation until you ask for it.

Everything known to be weak or unproven, with evidence for each:
**[LIMITATIONS.md](./docs/LIMITATIONS.md)**. How the numbers were taken, and the
four measurement bugs found before publishing them:
**[BENCHMARK.md](./docs/BENCHMARK.md)**. What starts on its own and what to do if
it does not: **[ROUTING.md](./docs/ROUTING.md)**.

## How it works

Five hook registrations across four scripts, all fail-open. None can block a
turn. Two scripts speak: a style collision at session start; a verification
claim with no runner, on the main thread and on writer subagents; and, on
writer subagents, a write that never reached the project. The other two
stay silent: one seeds filesystem watches inside a project, one keeps the
ledger. A claim is judged only against commands the hook can classify; a runner
it does not know abstains rather than accuses. The ledger is scoped to the
session and to the time the subagent ran. It is consulted only when that
subagent used a shell or an MCP tool. Nothing here injects into the model.
FileChanged is silent, and a claim miss on Stop reaches you, not the model.

Agents are scoped by what they must **not** do, never by a fixed tool list, so
each one picks up whatever your project already provides:

| Your project has | What happens |
|---|---|
| A documentation MCP for your stack | `librarian` becomes authoritative on it and stops reaching for web search |
| A code-generation or linting MCP | `fixer` and `designer` write current idioms instead of recalled ones |
| A browser-automation MCP | `designer` can verify what it built instead of guessing |
| Skills in `.claude/skills/` **or** `~/.claude/skills/` | Every subagent sees both automatically |

## How it is checked

CI runs all seven `check-*.sh` scripts on every push, along with all four hook
suites and all four mutation runners.

The hook suites run 198, 24, 26 and 24 cases, and the mutation runners then break
those hooks 120, 25, 27 and 23 ways to prove the suites would notice. `COVERAGE.tsv` pins every
rule to the file that must carry it, and `REINFORCEMENT.tsv` pins the *reasoning*
too, because one compression pass kept every pinned phrase and broke the
behaviour anyway.

```
./scripts/check-coverage.sh && ./scripts/check-reinforcement.sh
```

These prove the text is there and still carries its rule. **None of them proves
the agent behaves.** That needs runs that spend money, and three v1.0 criteria
are waiting on exactly that: [RELEASE-READINESS.md](./docs/RELEASE-READINESS.md).

## Documentation

| Document | What is in it |
|---|---|
| [ROUTING.md](./docs/ROUTING.md) | What starts on its own, what does not, and what to do about it |
| [LIMITATIONS.md](./docs/LIMITATIONS.md) | Everything known to be weak or unproven |
| [BENCHMARK.md](./docs/BENCHMARK.md) | Three arms, n=3, committed harness, and the four measurement bugs found first |
| [NATIVE.md](./docs/NATIVE.md) | Every component against what Claude Code already ships |
| [CHANGELOG.md](./CHANGELOG.md) | Notable releases |
| [BRUTAL-AUDIT-2026-08-31.md](./docs/BRUTAL-AUDIT-2026-08-31.md) | Hostile standing on the morning of v0.9.9, with a header saying what that release closed |
| [ARCH-SPEC-2026-08-31.md](./docs/ARCH-SPEC-2026-08-31.md) | The design v0.9.9 implemented, with a header saying what landed, what changed on contact with the binary, and what was not built |

The full record, including the competitive field, a brutal self-assessment and a
session log naming the nine of twelve components that never fired, is in
[`docs/`](./docs/) and [MAINTAINERS.md](./MAINTAINERS.md).

**Windows.** Everything runs on Node except the `review` skill's diff-base
script, which needs the POSIX shell that Git for Windows already gives you. Where
it is missing, the skill prints the steps to run by hand.

## Credits

Adapted from
[oh-my-opencode-slim](https://github.com/alvinunreal/oh-my-opencode-slim), rebuilt
native-first rather than ported. Every borrowing is pinned in
[PROVENANCE.md](./docs/PROVENANCE.md).

Thanks to **oh-my-claudecode**, which contributed more by its scars than its
features.

## License

MIT
