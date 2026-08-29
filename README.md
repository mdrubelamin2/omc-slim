# omc-slim

Claude Code plugin. It makes the main thread plan and delegate instead of diving
straight into the code, and it stops the model claiming a test it never ran.

```
/plugin marketplace add mdrubelamin2/omc-slim
/plugin install omc-slim@omc-slim
```

That is the whole setup. Six agents, six skills, two hooks and an output style
turn on together, and the style applies while the plugin is enabled.

Try it first without installing:

```
claude --plugin-dir /path/to/omc-slim
```

## What changes

- **It plans before it edits.** Multi-step work gets a stage map with a check per
  stage, instead of fourteen edits and a summary.
- **It sends work to specialists.** Searching, research, bulk edits and UI go to
  agents that do one thing, so your main thread keeps its context for the problem.
- **It will not claim a check it did not run.** A hook reads the transcript and
  tells you when an agent reported a passing test with no test in it.
- **It says what it cannot do.** Unproven is written as unproven, here and in the
  docs.

It ships no MCP servers, writes no files unless you run one of the three that do,
and changes no settings.

## What you can ask for

Ask in plain language. You do not need to name any of these.

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

Two do not start on their own. Type `/omc-slim:deepwork` or
`/omc-slim:simplify <target>`, or paste the paragraph in
[ROUTING.md](./docs/ROUTING.md) into your `CLAUDE.md` and they will.

## Is it on?

The first reply that plans or delegates names the style. If the `Agent` tool is
missing from your session, that first reply says so too.

Their **absence** is the signal. A session that plans work and never mentions the
style means another plugin took the output-style slot, and Claude Code picks the
winner by load order without telling you. Check with:

```
claude -p "One line: which output style is active?"
```

To turn it off: `/plugin disable omc-slim`. The style is part of the system
prompt, so it changes after `/clear` or in a new session.

## For a team

Commit one file and everyone on the repository gets it, with no per-machine step:

```json
{ "enabledPlugins": { "omc-slim@omc-slim": true } }
```

Tell them first. It changes how every teammate's session reads. Anyone who
disables it in `.claude/settings.local.json` wins, so nobody is trapped.

## What it costs

**~4,413 tokens** of always-on context, measured with a real tokeniser.
`./scripts/measure-context.sh` re-derives it and also prints **4,842 on a chars/4
basis**, the estimate this project's version series is tracked on. Nothing is
injected per tool call.

Two settings of yours will save you more than this plugin costs, and neither is a
plugin change:

- **`ENABLE_TOOL_SEARCH`** defers MCP tool definitions until something needs
  them. One audit of 926 sessions went from **45k to 15.5k tokens**.
  `{ "env": { "ENABLE_TOOL_SEARCH": "true" } }`
- **`subagentPromptCacheTtl`** (Claude Code 2.1.242+). Subagents get a
  five-minute prompt cache where your main conversation gets an hour, so a
  delegating plugin pays full price for prefixes it could have read from cache.
  `{ "subagentPromptCacheTtl": "1h" }`

## What it does not do

It does not make Claude more correct, and nothing here claims it does.

The one benchmark, on a single-file task at n=3 per arm, came out 18% cheaper at
equal graded quality. **Zero subagents ran in any arm, with delegation available
the whole time.** That is a finding against this plugin's own thesis and it is on
the front page on purpose. One task at n=3 proves very little, and the build it
measured is older than the one you install.

Two more, stated once:

- `deepwork` and `simplify` do not auto-fire. Invoke them by name.
- No agent may spawn another agent. That is enforced by the harness, not asked
  for in a prompt.

Everything known to be weak or unproven: **[LIMITATIONS.md](./docs/LIMITATIONS.md)**.
The numbers and how they were taken: **[BENCHMARK.md](./docs/BENCHMARK.md)**.

## How it works

The main thread plans and reconciles; specialists do the work. Everything Claude
Code already provides was deleted from the prompt rather than described.

Only a thin layer is enforced. `disallowedTools`, the output-style flag and the
hook matcher are harness-enforced with no model cooperation, which is why
one-level delegation is a guarantee rather than a request. The two hooks are
code, and they have tests. Every agent body, every skill and the output style
itself is prose, and prose holds exactly as well as a prompt holds.

Neither hook can block anything. Both emit a message, always exit 0, and stay
quiet when they cannot tell. One watches the `fixer` agent and the `designer`
agent for a verification claim with no verification behind it. The other warns
when a second plugin is fighting for the output-style slot.

Agents are scoped by what they must not do, never by a fixed tool list, so each
one picks up whatever your project already provides:

| Your project has | What happens |
|---|---|
| A documentation MCP for your stack | `librarian` becomes authoritative on it and stops reaching for web search |
| A code-generation or linting MCP | `fixer` and `designer` write current idioms instead of recalled ones |
| A browser-automation MCP | `designer` can verify what it built instead of guessing |
| Skills in `.claude/skills/` **or** `~/.claude/skills/` | Every subagent sees both automatically |

## How it is checked

Every claim on this page has a script behind it, and CI runs all seven
`check-*.sh` scripts on every push along with both hook suites and both mutation
runners.

The hook suites run 38 and 24 cases. The mutation runners then break those hooks
56 and 25 ways to prove the suites would notice. `COVERAGE.tsv` pins every rule
to the file that must carry it; `REINFORCEMENT.tsv` pins the *reasoning* too,
because one compression pass kept every pinned phrase and broke the behaviour
anyway.

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
| [COMPETITORS-2026-08-29.md](./docs/COMPETITORS-2026-08-29.md) | The field, and the four places a competitor beats us |
| [ASSESSMENT-2026-08-29.md](./docs/ASSESSMENT-2026-08-29.md) | What this plugin actually is, written under an instruction not to look only at the good parts |
| [DOGFOOD-2026-08-29.md](./docs/DOGFOOD-2026-08-29.md) | One real session, including the nine of twelve components that never fired |
| [CHANGELOG.md](./CHANGELOG.md) | Notable releases |
| [PROVENANCE.md](./docs/PROVENANCE.md) | What was adopted from where, pinned exactly |
| [MAINTAINERS.md](./MAINTAINERS.md) | Undocumented Claude Code behaviour found along the way |
| [RESEARCH.md](./RESEARCH.md) | Every decision, what was measured, and three tests that proved nothing |

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
