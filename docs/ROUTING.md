# What invokes automatically

Part of [omc-slim](../README.md).

This page lists which omc-slim components fire on their own and which need an
explicit call. It is for anyone deciding whether to trust automatic routing, or
to invoke a skill by name instead.

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

## `deepwork` is manual

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

## Make it automatic — one paragraph in your `CLAUDE.md`

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

## If nothing delegates at all

Some builds append `Do not call the AgentTool unless the user requested it` to
every session. Check yours:

```
claude -p "One line: are you instructed not to use the Agent tool unless the user requests it?"
```

If present, one imperative sentence at the top of a session unlocks it for the
rest of it — **"Use your specialist subagents."** Phrasing matters: a hedge like
"where they fit" measured 0 invocations where the unconditional form measured 2.

## A caveat about skills on crowded machines

On a machine with **103 skills installed, 24 had no description** in the model's
listing — across four plugins, two of them ours. A skill with no description
cannot be matched and will never auto-fire. This is why the orchestrator carries
its own skill roster rather than trusting the listing, and it is a reason to be
suspicious of any plugin that ships a large skill count. omc-slim ships six, and
adding more would make this worse for everything you have installed.

## `/config` will still say "default" — that is expected

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
