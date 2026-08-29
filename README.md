# omc-slim

Claude Code plugin. It makes the main thread plan and delegate instead of diving
straight into the code, and it stops the model claiming a test it never ran.

```
/plugin marketplace add mdrubelamin2/omc-slim
/plugin install omc-slim@omc-slim
```

That is the whole setup: six agents, six skills, two hooks and an output style
turn on together.

Or try it without installing:

```
git clone https://github.com/mdrubelamin2/omc-slim
claude --plugin-dir ./omc-slim
```

## What changes

- **It plans before it edits.** Multi-step work gets a stage map with a check per
  stage, instead of fourteen edits and a summary.
- **It sends work to specialists.** Searching, research, bulk edits and UI go to
  agents that do one thing, so your main thread keeps its context for the problem.
- **It will not claim a check it did not run.** A hook reads the transcript and
  tells you when an agent reported a passing test with no test in it.

No MCP servers, no files written unless you run one of the three that do. It
does override your `outputStyle` while enabled, and only `/plugin disable
omc-slim` gives that back.

## What you can ask for

Ask in plain language. Most start on their own, though that is observed rather
than measured, and some builds gate delegation until you ask for it
([ROUTING.md](./docs/ROUTING.md) has the one-paragraph fix).

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

Those two lines are the only evidence that reaches you, so their **absence** is
the signal. A session that plans work and never mentions the style means another
plugin took the output-style slot, and Claude Code picks the winner by load order
without telling you. Check with:

```
claude -p "One line: which output style is active?"
```

For a permanent badge in your status line, showing `omc-slim ●` when the style is
in force and `omc-slim ✗ (Concise won)` when it is not, add this. It costs no
model tokens:

```json
{ "statusLine": { "type": "command",
                  "command": "/path/to/omc-slim/scripts/optional/statusline.sh" } }
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

**~4,413 tokens** of always-on context, and nothing injected per tool call. Treat
it as a floor: the harness adds framing no text measurement sees, so the real
figure is nearer 4,900 ([LIMITATIONS.md](./docs/LIMITATIONS.md)).
`./scripts/measure-context.sh` re-derives it, and also prints **4,842 on a
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

## What it does not do

It does not make Claude more correct.

The one benchmark, on a single-file task at n=3 per arm, came out 18% cheaper at
equal graded quality. **Zero subagents ran in any arm, with delegation available
the whole time.** That is a finding against this plugin's own thesis and it is on
the front page on purpose. One task at n=3 proves very little, the winning arm
also ran with two MCP servers the others did not, and the build it measured is
older than the one you install.

And `deepwork` and `simplify` do not start on their own. Invoke them by name.

The full list, with evidence for each: **[LIMITATIONS.md](./docs/LIMITATIONS.md)**.
How the numbers were taken: **[BENCHMARK.md](./docs/BENCHMARK.md)**.

## How it works

The main thread plans and reconciles; specialists do the work. One level deep,
and that is enforced by the harness rather than asked for in a prompt, so an
agent cannot quietly spawn a tree of its own.

Neither hook can block anything. Both emit a message, always exit 0, and stay
quiet when they cannot tell.

Agents are scoped by what they must **not** do, never by a fixed tool list, so
each one picks up whatever your project already provides:

| Your project has | What happens |
|---|---|
| A documentation MCP for your stack | `librarian` becomes authoritative on it and stops reaching for web search |
| A code-generation or linting MCP | `fixer` and `designer` write current idioms instead of recalled ones |
| A browser-automation MCP | `designer` can verify what it built instead of guessing |
| Skills in `.claude/skills/` **or** `~/.claude/skills/` | Every subagent sees both automatically |

## How it is checked

CI runs all seven `check-*.sh` scripts on every push, along with both hook suites
and both mutation runners.

The hook suites run 38 and 24 cases, and the mutation runners then break those
hooks 56 and 25 ways to prove the suites would notice. `COVERAGE.tsv` pins every
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
