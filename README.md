# omc-slim


omc-slim is a discipline layer for Claude Code. It does three things. It makes the model talk like a principal engineer with no time to waste. It catches a verification claim that no command supports. It stops before it builds the wrong thing.

**The moment this plugin exists for:** the agent says *"all tests pass."* It ran
no tests. You find out an hour later, three commits deeper.

It is honest about what it cannot do, on this page, further down. Read that part before you trust the rest.

```
/plugin marketplace add mdrubelamin2/omc-slim
/plugin install omc-slim@omc-slim
```

That is the whole setup. Four agents, six skills, five hooks, four commands and one output style turn on together.

Try it first without installing:

```
git clone https://github.com/mdrubelamin2/omc-slim
claude --plugin-dir ./omc-slim
```

---

## What changes on day one

**A test it never ran cannot pass quietly.** A hook reads the last message and the transcript, on the main thread and on writer subagents. If the model reported a passing suite and no test runner appears in the transcript, you are told. The hook tells *you*, not the model. Commands are matched on argv0, so `git log --oneline latest` no longer counts as a test run. The worst case is measured: one benchmark had an agent report every task complete while 19 of 45 held-out tests failed, on a transcript reading `5/5 tests pass` about a suite of eight.

**It plans before it edits.** Ask for something across four files and you get a numbered stage map with a check per stage, before any work starts. Not fourteen edits and a summary that says it went well.

**Research agents cannot touch your files.** The four agents have `Edit` and `Write` denied at the harness level. They keep `Bash` for `git log` and `npm view`. The same mechanism stops an agent spawning another agent, so one delegation cannot become a tree that spends your budget.

**It says what it could not check.** A review finding must quote the line that proves it. A finding with no evidence is dropped, not reported. What could not be verified is written down instead of smoothed over.

**It stays out of your way.** ~2,467 tokens of always-on context. Nothing injected per tool call. No MCP servers of its own. It writes no file into your project unless you run one of the three that do.

---

## Scenarios: what to reach for, and when

You should not have to remember any names. Ask in plain language and routing usually works. This section is for the times you want to be sure.

### "I have never seen this repository before"

Ask a question about it first: *"where does the retry logic live?"* That is `omc-slim:explorer`. It returns a `file:line` map, not prose, and it refuses to fix anything it finds.

Only reach for `omc-slim:codemap` when nobody on the team has read the repo and several people need to. It writes a `codemap.md` into every directory plus a root atlas. It is expensive — one 362-file repo cost $6.09 — so it states the cost and waits for your yes.

> Rule of thumb: one question, one place → `omc-slim:explorer`. A whole repo, for many people, kept on disk → `omc-slim:codemap`. If you could just read the repo, read it.

### "This bug keeps coming back"

You fixed it. It returned. Nobody can name the cause. That is `omc-slim:tracer`. It builds three competing hypotheses and ranks them by the evidence for and against each one. It will not guess at a symptom nobody has reproduced; it tells you what reproducing it would take.

If you already know the cause and have a diff, you do not want tracer. You want `omc-slim:review`.

### "Is my recalled API knowledge still true?"

The library moved. Your model's memory did not. `omc-slim:librarian` reads the installed source on disk first, then the web, and sources every claim. Use it when an external fact is load-bearing, or when prior art beats inventing: named algorithms, RFCs, real usage on GitHub.

### "I am about to merge this"

`omc-slim:review` reads the diff across correctness, simplicity, security, tests, schema, API contract and performance at once. Every finding quotes `file:line` with a severity and a confidence. It then fixes what is mechanical.

The change has to exist first. Review judges; it does not design.

### "This design worries me"

Not a diff. A decision — an architecture, a security boundary, a data-integrity call. `omc-slim:oracle` argues the opposing side on purpose. Ask it *"am I over-engineering this?"* and expect it to say yes when you are.

Use it for a decision that is hard to undo. It is an escalation, not a step in every task.

### "I want to build something, I am not sure what"

`omc-slim:deep-interview` asks you two to four questions per round until the shape is clear. Then it writes a spec — goal, out of scope, acceptance criteria, verification plan — and **stops** for your approval before any code.

It runs before a plan exists. A question gets an answer, never an interview.

### "This change touches everything"

A migration. A rewrite. Work that is only correct once every layer lands together. That is `omc-slim:deepwork`: a written stage map, parallel lanes, one check per stage that can fail, and a gate between stages.

Invoke it by name — it does not start on its own. See *What we measured* below.

```
/omc-slim:deepwork migrate the auth service off sessions onto tokens
```

Routine multi-file edits are not deepwork. Two files and a rename stay on the main thread.

### "Why is this code so complicated?"

`omc-slim:simplify` deletes code that should never have been written: speculative abstraction, config nobody sets, a hand-rolled standard library. Nothing comes out until it knows why it went in, and behaviour is preserved exactly.

Invoke it by name: `/omc-slim:simplify src/pricing.js`. It is not for renames or formatting, which change no structure.

### "How do I prove this did not break anything?"

`omc-slim:verification-planning` frames the claim, designs an evidence path from the system itself, and requires every check to be able to fail. It decides what would prove the change. It does not write the tests.

---

## How to choose between the close ones

These are the pairs people confuse.

| If you are torn between | Choose by asking |
|---|---|
| explorer / codemap | Do I need one answer, or a durable map for the whole team? |
| explorer / review | Am I locating code, or judging it? explorer never judges. |
| tracer / review | Do I know the cause? No → tracer. Yes, and there is a diff → review. |
| oracle / review | Is the thing a decision or a diff? Decisions go to oracle. |
| verification-planning / review | Does the change exist yet? Not yet → verification-planning. |
| deepwork / just do it | Is it correct only when every layer lands together? |
| deep-interview / just answer | Is there a real question, or an unclear want? |
| simplify / refactor | Should this code exist at all? If yes, it is a refactor. |
| librarian / your own memory | Would being wrong here cost more than one lookup? |

**Everything is on demand.** Nothing in this plugin spends your budget unless the task or your words ask for it. A one-file edit gets one edit and one check, not a committee.

---

## Reference

Ask in plain language. You should not need to name any of these.

| Agent | Ask it | What comes back |
|---|---|---|
| [explorer](./agents/explorer.md) | *"Where is the retry logic?"* | A `file:line` map, not prose |
| [librarian](./agents/librarian.md) | *"Is this still the recommended API?"* | Current docs and real usage, read off disk first |
| [oracle](./agents/oracle.md) | *"Is this design going to hold up?"* | A second opinion that argues the other side |
| [tracer](./agents/tracer.md) | *"I have fixed this twice and it keeps coming back."* | Three hypotheses, ranked by what would falsify them |

| Skill | Ask it | What it does |
|---|---|---|
| [review](./skills/review/SKILL.md) | *"Is this ready to ship?"* | Every axis at once, behind an evidence gate |
| [deepwork](./skills/deepwork/SKILL.md) | *"This is too big to get right in one pass."* | Stage plan, parallel lanes, a failable check per stage |
| [deep-interview](./skills/deep-interview/SKILL.md) | *"I want to build something, not sure what."* | Interviews you, writes a spec, stops for approval |
| [verification-planning](./skills/verification-planning/SKILL.md) | *"How do I prove this did not break anything?"* | Designs the evidence path. Writes no tests |
| [simplify](./skills/simplify/SKILL.md) | *"This is over-built."* | Deletes what should never have been written |
| [codemap](./skills/codemap/SKILL.md) | *"Nobody here has read this repository."* | A codemap per directory plus a root atlas |

Every one also has an explicit form, and the agents work with the output style off: `/omc-slim:explorer`, `/omc-slim:librarian`, `/omc-slim:tracer`, `/omc-slim:oracle`, `/omc-slim:review`, `/omc-slim:deepwork`, and the rest.

---

## What it costs

**~2,467 tokens** of always-on context, and nothing injected per tool call. Treat it as a floor. The harness adds framing that no text measurement sees, so the real figure is nearer 5,400 ([LIMITATIONS.md](./docs/LIMITATIONS.md)). `./scripts/measure-context.sh` re-derives it, and also prints **2,791 on a chars/4 basis**, the estimate this project's version series is tracked on.

Two settings of yours will save more than this plugin costs. Neither is a plugin change:

- **`ENABLE_TOOL_SEARCH`** defers MCP tool definitions until something needs them. One audit of 926 sessions went from **45k to 15.5k tokens**.
  `{ "env": { "ENABLE_TOOL_SEARCH": "true" } }`
- **`subagentPromptCacheTtl`** (Claude Code 2.1.242+). Subagents get a five-minute prompt cache where your main conversation gets an hour. So a delegating plugin pays full price for prefixes it could read from cache.
  `{ "subagentPromptCacheTtl": "1h" }`

---

## What we measured, including what failed

No other plugin in this category publishes a negative result about itself. This one does, on its front page, because a plugin that hides its misses is a plugin you cannot calibrate.

**It does not make Claude more correct.** It changes cost, structure and what gets checked. Four independent studies find that a behavioural rules layer moves exactly those and not correctness. Our own numbers fit that pattern.

**Delegation was available in every benchmark run and the model never chose it.** Nine runs, 18% cheaper at equal graded quality, and zero subagents in any arm. That is a finding against this plugin's own thesis. One task at n=3 proves very little, the winning arm had two MCP servers the others did not, and the build it measured is older than the one you install.

**Two skills do not start on their own.** Invoke `omc-slim:deepwork` and `omc-slim:simplify` by name, or paste one paragraph into your `CLAUDE.md` ([ROUTING.md](./docs/ROUTING.md) has it). The rest have been seen starting unprompted, but that is observed rather than measured, and some builds gate delegation until you ask for it.

Everything known to be weak or unproven, with evidence: **[LIMITATIONS.md](./docs/LIMITATIONS.md)**.
How the numbers were taken, and the four measurement bugs found before publishing them: **[BENCHMARK.md](./docs/BENCHMARK.md)**.

---

## Is it on?

The first reply that plans or delegates names the style. Its **absence** is the signal. Another enabled plugin can take the output-style slot, and Claude Code picks the winner by load order without telling you.

For a permanent badge, add the status line. It costs no model tokens. It prints `omc-slim ●` when the style is in force, and `omc-slim ✗ (Concise won)` when it is not:

```json
{ "statusLine": { "type": "command", "command": "/path/to/omc-slim/scripts/optional/statusline.sh" } }
```

To turn it off: `/plugin disable omc-slim`. Output style is part of the system prompt, so the change lands after `/clear` or in a new session. The ledger files under `~/.claude/omc-slim/ledgers/` are yours to delete.

---

## For a team

Commit one file and everyone on the repository gets it, with no per-machine step:

```json
{ "enabledPlugins": { "omc-slim@omc-slim": true } }
```

Tell them first. It changes how every teammate's session reads. Anyone who disables it in `.claude/settings.local.json` wins, so nobody is trapped.

---

## How it works

Five hook registrations across four scripts, all fail-open. None can block a turn.

Two scripts speak. One reports a style collision at session start. The other reports a verification claim with no runner, on the main thread and on writer subagents, and a write that never reached the project. The other two stay silent: one seeds filesystem watches inside a project, one keeps the ledger.

A claim is judged only against commands the hook can classify. A runner it does not know abstains rather than accuses. The ledger is scoped to the session and to the time the subagent ran, and it is read only when that subagent used a shell or an MCP tool. It lives under `~/.claude/omc-slim/` (or `$CLAUDE_CONFIG_DIR`), never inside your project. Nothing here injects text into the model.

Agents are scoped by what they must **not** do, never by a fixed tool list. So each one picks up whatever your project already provides:

| Your project has | What happens |
|---|---|
| A documentation MCP for your stack | `librarian` becomes authoritative on it and stops reaching for web search |
| A code-generation or linting MCP | writer briefs execute current idioms instead of recalled ones |
| A browser-automation MCP | UI work can verify what it built instead of guessing |
| Skills in `.claude/skills/` **or** `~/.claude/skills/` | Every subagent sees both automatically |

---

## How it is checked

CI runs all seven `check-*.sh` scripts on every push, along with all four hook suites and all four mutation runners.

The hook suites run 198, 24, 26 and 24 cases. The mutation runners then break those hooks 120, 25, 27 and 23 ways, to prove the suites would notice. `COVERAGE.tsv` pins every rule to the file that must carry it. `REINFORCEMENT.tsv` pins the *reasoning* too, because one compression pass kept every pinned phrase and broke the behaviour anyway.

```
./scripts/check-coverage.sh && ./scripts/check-reinforcement.sh
```

These prove the text is there and still carries its rule. **None of them proves the agent behaves.** That needs runs that spend money, and three v1.0 criteria wait on exactly that: [RELEASE-READINESS.md](./docs/RELEASE-READINESS.md).

---

## Documentation

| Document | What is in it |
|---|---|
| [ROUTING.md](./docs/ROUTING.md) | What starts on its own, what does not, and what to do about it |
| [LIMITATIONS.md](./docs/LIMITATIONS.md) | Everything known to be weak or unproven |
| [BENCHMARK.md](./docs/BENCHMARK.md) | Three arms, n=3, committed harness, and the four measurement bugs found first |
| [NATIVE.md](./docs/NATIVE.md) | Every component against what Claude Code already ships |
| [CHANGELOG.md](./CHANGELOG.md) | Notable releases |
| [BRUTAL-AUDIT-2026-08-31.md](./docs/BRUTAL-AUDIT-2026-08-31.md) | Hostile standing on the morning of v0.9.9, with a header saying what that release closed |
| [ARCH-SPEC-2026-08-31.md](./docs/ARCH-SPEC-2026-08-31.md) | The design v0.9.9 implemented, and what was not built |

The full record — the competitive field, a brutal self-assessment, and a session log naming the nine of twelve components that never fired — is in [`docs/`](./docs/) and [MAINTAINERS.md](./MAINTAINERS.md).

**Windows.** Everything runs on Node except the `review` skill's diff-base script, which needs the POSIX shell that Git for Windows already gives you. Where it is missing, the skill prints the steps to run by hand.

---

## Credits

Adapted from [oh-my-opencode-slim](https://github.com/alvinunreal/oh-my-opencode-slim), rebuilt native-first rather than ported. Every borrowing is pinned in [PROVENANCE.md](./docs/PROVENANCE.md).

Thanks to **oh-my-claudecode**, which contributed more by its scars than its features.

## License

MIT
