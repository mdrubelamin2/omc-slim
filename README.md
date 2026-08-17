# omc-slim

A small pantheon of specialist agents for Claude Code.

Ten agents, six skills, one hook, two MCP servers. **~4,406 tokens of
static context** and **zero bytes injected on the tool-call path.**
Re-derive that figure any time with `./scripts/measure-context.sh`.

Slim by construction, and it **adapts to whatever your project already has** —
every specialist inherits your MCP servers and skills.

> **Status — v0.8.1.** Working and installable. Re-benchmarked at n=3 against a
> plain session and against the setup it replaces: it costs **18% less than
> plain** at equal correctness, and ships the smallest tool of the three. The
> harness is committed at `scripts/bench/`, so the numbers are re-derivable
> rather than asserted. Every claim here was measured, and the measurements that
> went against it are in [`docs/BENCHMARK.md`](./docs/BENCHMARK.md) and
> [`RESEARCH.md`](./RESEARCH.md).
>
> **v0.6.0-v0.6.1** name every agent and skill in the output style, because the
> descriptions Claude Code shows get dropped once enough plugins are installed.
> On a 41k-LOC repository that turned `oracle` and `librarian` from never firing
> into firing on turn one. The same pass removed the `observer` agent: Claude
> Code reads images and PDFs natively, so it never auto-fired, and forced it
> matched the direct path while being unable to cross-reference the repo.
>
> **v0.6.4-v0.6.9** merge `simplify` from all four upstream sources, then audit
> and compress it 28%. The orchestrator lost 250 tokens with no behaviour change.
>
> **v0.7.0-v0.7.3** add `review`, the all-axis code-review skill, behind an
> evidence gate. It checks current sources and installed tooling rather than
> recalled knowledge.
>
> **v0.7.4-v0.7.8** make Simplified Technical English the default register, teach
> `simplify` to spot comment smells, and fix `review` to judge the whole change
> set rather than the diff. Three separate files hit the same compression floor
> at ~2%, so that pattern is now established rather than suspected.
>
> **v0.8.0-v0.8.1** hold `fixer` to the same standard the reviewers apply, and
> solve `deepwork` auto-invocation — the cause was the injection point, not the
> wording. Eight rewrites inside the output style changed nothing; the same
> sentences in a `CLAUDE.md` fire it on the first tool call.

Adapted from [oh-my-opencode-slim](https://github.com/alvinunreal/oh-my-opencode-slim),
rebuilt native-first rather than ported.

---

## Install

```
/plugin marketplace add mdrubelamin2/omc-slim
/plugin install omc-slim@omc-slim
```

Or load it without installing:

```
claude --plugin-dir /path/to/omc-slim
```

MIT. No configuration, no API keys, no dependencies — the single hook is a
plain Node script and both MCP servers are public HTTP endpoints.

**No further setup.** The orchestration output style applies automatically while
the plugin is enabled (`force-for-plugin`), so the main thread works as a
planner and reviewer rather than diving straight into implementation. 12 of the
16 components route automatically — see
[What invokes automatically](#what-invokes-automatically).

That flag overrides your `outputStyle` setting — it is the one global thing this
plugin does. To opt out, `/plugin disable omc-slim`, or delete
`output-styles/omc-slim.md` from your copy. Because output style is part of the
system prompt, changes take effect after `/clear` or a new session.

### `/config` will still say "default" — that is expected

`force-for-plugin` supersedes your output style **at runtime without writing the
`outputStyle` setting**. `/config` reads the stored setting, so it keeps showing
`default` while omc-slim is active. Verified: setting unset, plugin enabled,
effective style `omc-slim:omc-slim`.

Don't trust the picker — ask:

```
claude -p "One line: which output style is active?"
```

Expect `omc-slim:omc-slim`. If you get `default`, check `/plugin` shows the
plugin enabled, then `/clear` or start a new session — output style is part of
the system prompt and an already-running session will not pick it up.

## What invokes automatically

Measured across natural prompts that named no component and no plugin, with no
instruction to delegate. **12 of the 15 components measured fire on their own.**
The sixteenth, `review`, has not been tested either way.

| Fires unprompted | |
|---|---|
| `explorer` | "where is the retry logic?" |
| `librarian` | "current recommended way to do X in <lib>?" — reached context7 itself |
| `oracle` | "is this design going to hold up?" — ran `explorer` first, then reviewed |
| `tracer` | "this bug keeps coming back, I've fixed it twice" |
| `designer` | "this login form looks awful" |
| `council` + all 3 seats + synthesiser | "Postgres or DynamoDB? I want more than one opinion" |
| `deep-interview` | "I want to build something, not sure what yet" |
| `codemap` | fires on an unmistakable task shape — a large, unfamiliar repo — not on wording |
| `verification-planning` | "how do I prove this refactor didn't break anything?" |
| `gh_grep`, `context7` | reached through `librarian` |

`codemap` correctly declined a 15-file toy and fired unprompted on a 362-file,
41k-LOC repository, writing 26 `codemap.md` files across 8 parallel `fixer`
lanes for $6.09. Since v0.6.0 it must announce that cost, and what it writes
into your repo, before starting.

**Three do not, and one is untested:**

- **`fixer`** — on "rename X to Y across the codebase" the main thread did it
  directly. That is the ladder working: isolated mechanical work should not pay
  delegation overhead. It *does* fire when the work splits into genuinely
  parallel lanes — three non-overlapping packages produced three concurrent
  `fixer` calls, cost-neutral and 1.8x faster than doing them in sequence. The
  threshold is parallelism, not file count.
- **`deepwork`** — **invoke it yourself; it will not fire on its own.** See
  below.
- **`simplify`** — did not fire on "simplify src/pricing.js"; the orchestrator
  handled the file directly instead. A routing clause added to fix it measured
  zero benefit and was reverted. Known limitation — workaround is the explicit
  form, `/omc-slim:simplify <target>`.
- **`review`** — **unmeasured, not a known failure.** No routing test has ever
  covered it. Its description names it as a gate after implementation lands, so
  it may well fire on "is this ready to ship"; nobody has checked.

`council` fires but not reliably — one hit, one miss across two attempts. Treat
the synthesiser as unproven and dispatch it explicitly for anything that matters.

### `deepwork` is manual

Invoke it explicitly:

```
/omc-slim:deepwork migrate the auth service off sessions onto tokens
```

It was previously listed here as auto-firing. That rested on one prompt —
*"migrate five services, **in phases**"* — which contains the trigger word, so it
was really measuring the prompt, not the skill. Retested properly, it does not
fire.

Everything else was ruled out first. Effort level is not the cause: `opus`
medium and high behave identically, and medium delegated *more*. No session
suppression exists — probed directly. The skill is visible and listed. Blocked
writes were not the cause either; with writes allowed it still did not fire.

Asked point-blank whether deepwork applies to a four-subsystem cancellation bug,
the orchestrator says **yes** and reasons correctly about why. Then, given the
same task to actually do, it makes fourteen edits across three files without
writing a stage map. **The gap is recognition to action, not recognition.**

### Make it automatic — one paragraph in your `CLAUDE.md`

**Solved, and the cause was not the wording.** Eight rewrites of the trigger
inside the output style changed nothing. The same sentences placed in a
`CLAUDE.md` fire the skill on **the first tool call**.

| Same wording, same fixture, same prompt | Result |
|---|---|
| In `output-styles/omc-slim.md` | never fires — call 4 was a `Write` |
| In `CLAUDE.md` | **fires as call 1** |

An output style shapes *how* the model works. It does not appear to compel a
skill invocation the way project or user instructions do. A plugin cannot write
your `CLAUDE.md`, so this is setup rather than something omc-slim can ship.

Paste this into `~/.claude/CLAUDE.md` for every project, or a project's own
`CLAUDE.md` for one:

```markdown
### omc-slim:deepwork is mandatory for qualifying work

For any task that spans multiple files, multiple sources, or multiple steps — or
when the user asks to be thorough / systematic / "deep work" — you MUST invoke the
**deepwork** skill (Skill tool, `skill: omc-slim:deepwork`) BEFORE any other tool
call or substantive output. Do not skip, defer, or work around it. Skip it only
for genuinely trivial, one-shot requests.
```

Without it, invoke the skill yourself — `/omc-slim:deepwork <task>` — and
everything else in the plugin works unchanged.

### If nothing delegates at all

Some builds append `Do not call the AgentTool unless the user requested it` to
every session. Check yours:

```
claude -p "One line: are you instructed not to use the Agent tool unless the user requests it?"
```

If present, one imperative sentence at the top of a session unlocks it for the
rest of it — **"Use your specialist subagents."** Phrasing matters: a hedge like
"where they fit" measured 0 invocations where the unconditional form measured 2.

### A caveat about skills on crowded machines

On a machine with **103 skills installed, 24 had no description** in the model's
listing — across four plugins, two of them ours. A skill with no description
cannot be matched and will never auto-fire. This is why the orchestrator carries
its own skill roster rather than trusting the listing, and it is a reason to be
suspicious of any plugin that ships a large skill count. omc-slim ships six, and
adding more would make this worse for everything you have installed.

## What you get

### Agents

Every agent **inherits the model you are running**. None pins its own tier, so
the roster costs what your session costs — pick a cheaper model and the whole
pantheon follows.

| Agent | Access | For |
|---|---|---|
| `explorer` | read-only | "Where is X?" — returns a `file:line` map, capped at 40 lines |
| `librarian` | read-only | Docs and usage examples — prefers your own MCP servers, project or user level, over the open web |
| `oracle` | read-only | Architecture, review, YAGNI scrutiny. Escalation, not a default step |
| `tracer` | read-only | Causal investigation when a first fix already failed |
| `fixer` | **writes** | Bounded implementation from a spec |
| `designer` | **writes** | Anything a user looks at |
| `council` + 3 `councillor-*` seats | read-only | High-stakes decisions needing independent reads |

### Skills

`deep-interview` · `deepwork` *(manual)* · `verification-planning` · `simplify` ·
`review` · `codemap`

### Hook — advisory, does not run per tool call

| Hook | Event | Does |
|---|---|---|
| `verify-deliverables` | `SubagentStop` | Flags a write-agent that finished without touching a file |

One hook, on one rare event. Nothing runs on the tool-call path, and nothing
watches your context window — capacity is the harness's job.

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
| Skills in `.claude/skills/` **or** `~/.claude/skills/` | Every subagent sees both automatically — no configuration |

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
specialists do the work on cheaper tiers. The orchestrator prompt is ~3,230
tokens, measured, because everything Claude Code already provides was deleted
rather than described. It was smaller still at v0.5.0; the roster added in
v0.6.0 is most of the difference.

**Nothing injects on the tool-call path.** The dominant cost in comparable
plugins is not startup context, it is per-tool-call and per-Stop injection.
There is no `Stop` hook, no `PostToolUse` hook, and no context-window policing —
deliberately. The plugin never tells the model it is running low on room, never
pre-emptively dumps state "before running out", and never suggests compacting.
That is the harness's job and it does it better.

**Subagents return structures, not prose.** No hook in Claude Code can truncate
what a subagent returns to its parent — `PostToolUse` is purely additive — so the
only lever is the agent's own output contract. `explorer`, `fixer` and
`librarian` each have one, with hard caps.

## How it behaves

Not configurable, and deliberately so — a house style you can rely on rather
than a setting to tune.

**It writes like a busy senior engineer.** Answer first. No preamble, no
restating your question, no "great question", no narrating routine work. Errors
quote the shortest decisive line rather than dumping a log. Measured against the
same question with no plugin, replies run roughly half the length with no
loss of substance.

**It reaches for the smallest thing that works.** Does this need to exist? Is it
already in the codebase, the standard library, a native platform feature, or a
dependency you already have? Only then new code. No abstraction with one
implementation, no config for a value that never changes.

**It fixes causes, not symptoms.** Given a bug report naming one call site, it
greps every caller and fixes the shared function — one diff instead of three,
and no sibling left broken.

**It leaves a runnable check behind.** Non-trivial logic gets the smallest thing
that fails if the logic breaks — an assert-based check, no framework — and says
plainly when it could not run it rather than implying it passed.

**Laziness has floors.** Input validation at trust boundaries, error handling
that prevents data loss, security controls, accessibility basics and anything you
explicitly asked for are never simplified away.

**It owns the problem.** "Pre-existing", "not caused by my change", "known
limitation" and "future work" are descriptions, never exits. Given a file
carrying a comment that said *"known bug, nobody has fixed it"*, it investigated
rather than taking the exit — and found the comment itself was wrong.

**It reasons from the artefact, not the report.** Told `total()` returns NaN on
`'12.50'`, it read the code and corrected the premise: `parseInt('12.50')`
returns `12`, a silent-truncation bug worse than NaN because nothing signals
failure.

**It says when it did not verify.** "Looks right" is not a check. If a test could
not be run, it says so instead of implying a result.

## Replaces a global CLAUDE.md and a staged-work skill

The behavioural layer above is adopted from a personal `~/.claude/CLAUDE.md` and
a `fable-mode` staged-execution skill, so neither is needed alongside it:

| | Cost |
|---|---|
| `CLAUDE.md` | ~1,058 tok **every session, every project** |
| `fable-mode` | ~1,879 tok **each time it is invoked** |
| Combined, typical task | **~2,937 tok** |
| omc-slim's cost for the same behaviour | **+243 tok standing** |

**Net ~2,694 tokens saved per task.** The always-on layer carries only what
shapes every response; the staged-execution discipline — stage map, one failable
check per stage, backward re-runs, the warning threshold, the two self-critique
questions — folded into the existing `deepwork` skill, which occupies the same
niche and costs nothing until invoked.

One deliberate improvement over the originals: those two files disagreed with
each other. The `CLAUDE.md` made staged mode *mandatory for any multi-step task*;
the skill's own text said staging a trivial task "wastes effort and buries the
answer under ceremony". `deepwork` keeps the skill's trigger discipline, not the
blanket mandate.

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

**Measured, honestly, and repeatably.** Full method and caveats in
[`docs/BENCHMARK.md`](./docs/BENCHMARK.md). One prompt naming no technology
("build a CLI that finds duplicate files"), three arms, held-out grading fixture,
measures fixed before running. **n=3 per arm.** The harness is committed at
`scripts/bench/`, so anyone can re-run it.

| | Cost | Tool LOC | Tests | Flags | Correct |
|---|---|---|---|---|---|
| plain session | $1.2367 | 434 | 39 | 16 | ✅ |
| **omc-slim** | **$1.0146** | **251** | 21 | **6** | ✅ |
| CLAUDE.md + fable-mode | $7.0651 | 1,077 | 137 | 22 | ✅ |

**omc-slim costs 18% less than a plain session, and the spreads do not overlap** —
plain's cheapest run still costs more than omc-slim's dearest. It also ships the
smallest tool of the three, with a 6-flag CLI, at identical correctness. All nine
runs found every duplicate group with no false positives.

Its three runs landed at 243, 251 and 258 LOC with the same 6 flags every time,
while plain ranged 351 to 539 LOC and 14 to 19 flags. **Consistency is the
clearest signal in the data.**

More code did not buy more correctness. The heavyweight arm wrote 137 tests and
5.4× the code, and produced the run's only silent failure — skipping an
unreadable directory without a word. It also proved wildly unstable: three runs
of one prompt cost $4.71, $6.01 and $10.47.

Against the setup this replaces: **7.0× cheaper and 6.5× faster**, at equal
correctness.

This reverses the earlier v0.4.1 result, which found omc-slim 10% *more*
expensive with 2.1× the tests. Note the baseline moved too — plain now emits 2.3×
the output tokens it did then, and carries Claude Code's built-in skills — so the
two runs are not one series. The old table is kept in the appendix of
[`docs/BENCHMARK.md`](./docs/BENCHMARK.md).

So the honest claim is not "better than plain". It is *close to plain cost, with
materially more verification, at a fraction of a heavyweight discipline layer.*

What it does **not** show: the central bet. A single-file CLI is exactly where
"smallest thing that works" wins and delegation cannot pay — **no subagent ran in
any arm.** Whether routing work to cheaper tiers beats doing it all on the main
model is still untested, and needs a large multi-file task to settle.

For context on why that matters:

| | Static context | Independent benchmark |
|---|---|---|
| Karpathy Skills | ~589 tok | +0.96pp at identical cost |
| oh-my-claudecode | ~2,671 tok | +1.65pp at +43% cost |
| **omc-slim** | **~4,406 tok** | see above |
| Agent Skills | ~1,826 tok | −1.10pp |

Source for the outer rows: [orcabot.com/benchmarks](https://orcabot.com/benchmarks),
July 2026. In that dataset **sophistication correlates negatively with results** —
the smallest pack won on efficiency, the largest lost to doing nothing. Our own
result is consistent with it.

**omc-slim is the most expensive row in that table**, at 7.5× Karpathy and ~1,740
tokens above oh-my-claudecode. It has grown on net across every release —
2,774 at v0.1.0 against 4,406 today — though not monotonically: v0.6.9 cut 250
tokens and v0.7.6 cut 48. Each increase was individually justified — adopted
behaviours, an anti-context-anxiety instruction, a skill roster the listing could
not be trusted to provide — and they still sum. That is the exact failure mode
oh-my-claudecode was criticised for, arrived at one defensible step at a time.

The earlier figures in this series were measured by hand, and by v0.8.1 this
README quoted two different totals for the same plugin. `measure-context.sh`
exists so that cannot recur; treat pre-v0.8.1 points as approximate.

If further measurement holds this direction, the right response is to shrink
toward Karpathy, not to add features.

## Provenance — what was adopted, pinned exactly

Every source is pinned so a future version can diff against what was actually
read, and adopt upstream changes deliberately rather than by memory.

| Source | Pin | What omc-slim took |
|---|---|---|
| [alvinunreal/oh-my-opencode-slim](https://github.com/alvinunreal/oh-my-opencode-slim) | `282d5f26` (2026-08-11) | The agent roster, routing heuristics, output contracts and most prompt content |
| [Yeachan-Heo/oh-my-claudecode](https://github.com/Yeachan-Heo/oh-my-claudecode) | `7e38c1f9` (2026-08-12), `package.json` 4.15.7, npm `oh-my-claude-sisyphus` 4.15.10 | The deliverable-verification idea, the `tracer` role, `deep-interview`, and six verified failure modes to design against |
| [multica-ai/andrej-karpathy-skills](https://github.com/multica-ai/andrej-karpathy-skills) | `2c606141` (2026-04-20) | "Surgical changes" outright; the whole file as a compression target |
| `~/.claude/CLAUDE.md` | sha256 `e1894ef55a06…` (4,230 B) | Ownership language bans, no early stopping, no permission-to-continue, evidence over plausibility |
| `~/.claude/skills/fable-mode/SKILL.md` | sha256 `c48cbc5cf0c9…` (7,516 B) | Stage map, one failable artefact per stage, backward re-runs, warning threshold, the two self-critique questions, find-and-replace safety |

Three further packs were read and deliberately **not** adopted wholesale — see
[`RESEARCH.md`](./RESEARCH.md) §6d for why. Their disciplines informed the
register and the one-hook budget:

| Pack | Pin | Informed |
|---|---|---|
| [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) | `7829ffd9` | Hook discipline — it registers exactly one. Its 24-skill surface is the counter-example, not the model |
| [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail) | 4.8.4, `16f29800` | The build ladder and laziness-with-floors stance |
| [JuliusBrussee/caveman](https://github.com/JuliusBrussee/caveman) | `ec83e5ba` | Compressed output contracts and the terse register |

None is named anywhere in the plugin's prompts — the behaviour is described
directly, so nothing depends on those packs being installed.

Benchmark figures come from [orcabot.com/benchmarks](https://orcabot.com/benchmarks),
July 2026 run, page last updated 2026-08-08.

### Safe to delete the sources this replaces

`~/.claude/CLAUDE.md` and the `fable-mode` skill are meant to be **deleted** once
this plugin is installed — that is the ~2,700 tokens per task it buys back. Two
checks make that safe.

**1. The pins survive deletion.** Those two entries are marked `archived` in
`UPSTREAM.tsv`: fully adopted, source retired on purpose. The verbatim copies in
[`docs/upstream/`](./docs/upstream) become the record, and the checker verifies
*those* rather than reporting a permanent false alarm:

```
CLAUDE.md            archived   e1894ef55a06 (source retired, snapshot intact)
fable-mode.SKILL.md  archived   c48cbc5cf0c9 (source retired, snapshot intact)
```

It also detects a tampered or missing snapshot, and — if you have not deleted the
original yet — tells you whether it drifted since adoption, so you can review
before deleting.

**2. Coverage is asserted, not assumed.** With the originals gone, nothing else
would catch a later edit quietly dropping an adopted rule.
[`COVERAGE.tsv`](./COVERAGE.tsv) maps every load-bearing rule to where it now
lives — 218 rows, and growing with each release:

```bash
./scripts/check-coverage.sh
# 218/218 adopted behaviours present.
# Safe to delete the adopted sources; the plugin covers them.
```

Exits non-zero if any behaviour goes missing, so it works in CI or a pre-commit
hook. It has been verified to actually fail: rewording or deleting a rule turns
it red, and it earned its keep immediately — it caught that `surgical-edits` had
been lost from the output style during an earlier compression pass.

### Checking for upstream changes

```bash
./scripts/check-upstream.sh          # all sources
./scripts/check-upstream.sh karpathy # one
```

Read-only. It queries each remote and hashes each local file, then prints the
exact `git diff` or `diff -u` command for anything that moved.

Upstream moves fast — oh-my-claudecode ships roughly 35 npm versions a month, and
had already moved past its pin within hours of being audited. Expect the checker
to report movement; the point is to review it, not to chase it. Adopt only what
earns its tokens, then update the pin in
[`UPSTREAM.tsv`](./UPSTREAM.tsv) and refresh the snapshot.

## Credits

Everything this plugin borrows is listed with its exact pin in
[Provenance](#provenance--what-was-adopted-pinned-exactly) above. Particular
thanks to **oh-my-claudecode**, which contributed more by its scars than its
features: the reason `verify-deliverables` emits no `additionalContext` on
`SubagentStop` is a regression it hit and we inherited as a lesson rather than an
outage.

Full research — every decision, what was measured, and the three occasions a test
turned out to prove nothing — is in [`RESEARCH.md`](./RESEARCH.md). Undocumented
Claude Code runtime behaviour discovered along the way is in
[`MAINTAINERS.md`](./MAINTAINERS.md).

## License

MIT
