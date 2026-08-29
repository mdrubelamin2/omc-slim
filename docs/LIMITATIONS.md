# Honest limitations

Part of [omc-slim](../README.md).

This page lists what omc-slim does not do well, then gives the full benchmark
method and numbers behind its cost and correctness claims. It is for anyone
deciding whether to trust those numbers.

**No per-agent temperature.** Claude Code agent frontmatter has no
`temperature`, so `designer` cannot be given the wider sampling a visual role
wants; that is compensated for in prose, which is not the same thing.

The old version of this entry said the upstream `designer` "ran at 0.7
deliberately". **That is no longer true.** Upstream removed every agent
temperature literal in
[`c7690923`](https://github.com/alvinunreal/oh-my-opencode-slim/commit/c7690923)
— `council` 0.1, `councillor` 0.2, `designer` 0.7 and the rest — and its docs now
read *"Optional temperature; when omitted, OpenCode chooses its default."* There
is no deliberate 0.7 left to compensate for. The gap is real; the justification
that was written for it was inherited from a decision its author reversed.

**No AST-aware search in the harness.** Upstream used `ast_grep_search` across 25
languages. Claude Code ships no equivalent tool, so structural queries fall back
to `Grep`, and `explorer` is weaker than its ancestor on "find every function
shaped like this".

**The gap is narrower than that wording implied.** `ast-grep` covers ~26
languages, installs standalone, and is one `Bash` call away wherever a developer
already has it — measured on one machine during the 2026-08-26 sweep,
`ast-grep outline` compressed 64,496 lines of TypeScript to 385. omc-slim cannot
*depend* on it, because nothing guarantees it is present. But the honest
limitation is that `explorer` does not currently reach for it even when it is,
not that structural search is unavailable.

Two measured caveats if it is used: `ast-grep outline` degrades badly on
prototype-assignment JavaScript (a 631-line CommonJS file outlined to three
lines), and metavariable patterns over-match, so a thin outline must not be read
as "nothing here". See
[the research](./RESEARCH-2026-08-26.md#710-code-search-retrieval-and-deletion--measured-on-this-machine).

**`maxTurns` was raised on a user report of runs being cut off mid-work.** The
original bounds — 20 to 40 turns — were judgement with no measurement behind
them. They are now 100 for the read-only agents, 120 for `tracer`, 200 for the
two writers.

**That report is the only evidence, and it is a report rather than a measurement.**
Nobody here has observed the bound fire under controlled conditions, and the
paragraph below still stands: nothing in this repository verifies the harness
honours the key. Both readings are live — either the key is enforced and the old
values were too low, or something else truncated those runs and the change is
inert. Raising it is cheap and safe under both, which is why it was done anyway.

The rule behind the direction, if not the exact figures: **a guard whose failure
is silent is set well above observed legitimate work, never beside it.** Only a
subagent's final message reaches its caller, so a truncated run can return
*nothing*, silently, while a bound set too high costs one run on the rare case
the guard exists for.

The figures are not an order of magnitude above the observations and are not
claimed to be. Across one review of this repository, subagent runs logged 13, 23,
29, 30, 41, 56 and 63 tool uses. Tool calls are an upper bound on turns rather
than a count of them, since a turn can carry several in parallel — so 100 is
somewhere above 1.6× the largest observed run, and the true multiple is unknown
and larger. What can be said plainly: 40 sat *inside* the observed range, and 100
does not.

**Nothing in this repository verifies the harness honours the key at all.** If it
is ignored, `explorer`'s instruction to "stop searching with turns in hand"
budgets against a limit that does not exist, and no check would tell you. Treat
the bound as declared intent rather than a guarantee.

**It changes your output style.** `force-for-plugin` overrides your `outputStyle`
while omc-slim is enabled. Disabling the plugin reverts it. Your own setting is
never consulted while the plugin is on, so re-selecting a style will not get it
back — verified against a project explicitly pinned to `Explanatory`.

**Another plugin can take the style slot, and you will not be told.** Claude Code
applies exactly one forced plugin style and picks it by plugin load order, which
is not ours to control. The loser is reported at a log level nobody reads, so
omc-slim can go entirely inert while every component still loads. The
`SessionStart` hook warns when a competing plugin is installed and enabled, but it
warns about the **condition** — it cannot see which style actually won, because
the SessionStart payload does not carry one. Settle it with
`claude -p "One line: which output style is active?"`.

**The core mechanism sits on a surface the platform once deprecated.** Output
styles were deprecated around CC v2.0.30 and restored at v2.0.32 on community
pushback; the `/output-style` command was then deprecated at v2.1.73 and removed
at v2.1.91 — the docs say verbatim: *"deprecated in v2.1.73 and removed in
v2.1.91. Use `/config`."* If Anthropic removes `force-for-plugin`, omc-slim's
orchestration layer goes with it, and no hook can bring it back. The current
signal points the other way — `keep-coding-instructions` shipped at v2.1.94, a
built-in Concise style at v2.1.237, and a mid-session style-drift fix at
v2.1.221, all investment rather than retreat
([output-styles docs](https://code.claude.com/docs/en/output-styles),
[changelog](https://code.claude.com/docs/en/changelog); the v2.0.30–32 episode
is mirror-sourced, releases that old are pruned). One documented limit stands
regardless: *"styles don't change how subagents respond"* — the style governs
the main loop only, and every specialist runs on its own file's prose.

**It reads your plugin configuration at startup.** That hook parses
`~/.claude/settings.json`, `installed_plugins.json` and other plugins' output-style
frontmatter. It reads nothing else, sends nothing anywhere, and writes nothing.

**It used to connect two remote MCP servers, and this page denied it.** Until
v0.8.3 both this page and the README called the output style "the only global
side effect". That was false. `.mcp.json` shipped `context7`
(`mcp.context7.com`) and `gh_grep` (`mcp.grep.app`), and Claude Code starts a
plugin's MCP servers automatically — there is no per-server prompt. They loaded
namespaced, as `mcp__plugin_omc-slim_context7__*`, so library names and
code-search strings reached two third-party hosts. It was disclosed in
`RESEARCH.md` and `MAINTAINERS.md` and in neither of the two places a user
actually reads, which is the same as not disclosing it.

`.mcp.json` has been removed rather than documented. `librarian` finds whatever
documentation servers your project or user config provides, so the capability
survives wherever you already have it, and the plugin no longer decides on your
behalf which hosts your queries reach. See
[the audit](./AUDIT-2026-08-25.md) for how it was found.

**The output style cannot prove it ran, and that is structural.** Skills and
agents emit a `skill_activated` telemetry event per invocation, carrying name,
trigger and source. An output style is applied rather than invoked, so it emits
nothing, appears in no transcript as a thing that fired, and cannot be attributed
by any tooling the user has.

This is not cosmetic, on the retention evidence. Plugins are not removed when
they fail; they are removed months later in an audit, and the criterion is
whether the owner can name what a component did. One documented inventory went
from 235 components to 87 on exactly that basis. **The largest, most expensive,
always-on component in this plugin is the only one that can never appear in the
data used to decide whether to keep it** — and it carries the highest prune
pressure in the repository, because prune pressure tracks how often something
loads rather than how useful it is.

Two partial answers ship, and neither is complete. The style names itself in the
first reply that plans or delegates, which reaches a human and not a tool. And
`scripts/optional/statusline.sh` reads `output_style.name` from the status-line
payload and reports which style actually won — the one surface that settles it,
and one a plugin cannot ship, because `statusLine` is a settings key rather than
a manifest component. It is documented and opt-in for that reason.

**The published static figure is a floor, not the whole charge.** It counts the
output style body plus the text of twelve descriptions. The harness charges more:
measured 2026-08-29 against the installed v0.9.1, `claude plugin details` reports
**1,461 always-on tokens** for the twelve components where our own basis measures
**962** — roughly **42 tokens per component** of framing (name, type, list
structure) that no measurement of the text can see. Across the roster that is
about **500 tokens**, so the true always-on cost is nearer 4,800 than the ~4,309
this repository publishes.

It is not folded into the headline, and the reason is a scar: 42 rests on a
single observation of a number the harness itself labels an estimate, and this
project has already published one wrong figure by baking a single-observation
constant into a headline. Both numbers are stated; neither is invented. Re-derive
the harness side with `claude plugin details omc-slim`.

**No agent pins a model or an effort level, and both keys exist.** `model:` and
`effort:` are documented agent frontmatter. Until v0.9.2 the output style priced
the roster as "cheap" and "expensive" anyway, which was a cost claim no mechanism
could make true — every agent runs on the caller's model. v0.9.2 replaced that
with escalation order ("first call", "escalation"), which is a *sequencing* claim
prose can make true.

**Recorded as an open choice rather than a fixed one**, because re-labelling and
wiring are different acts and only one of them happened. A mixed-model roster is
a larger decision than a release: it changes cost in a direction users cannot
predict from the plugin's own figures, and the refusal to pin tiers is a standing
one with its own reopening trigger — an ablation showing a delegation cost win
that tier routing would multiply. Until then the keys stay unused, and this
paragraph exists so a later reader sees a decision rather than an omission.

**The static figure is disciplined and the bodies are not.** v0.9.0 added roughly
**7,377 tokens of on-invoke cost in one release, 6,500 corrected** — every addition individually
justified by measurement, and their sum unmeasured, which is the exact failure
mode this project has criticised in others. `./scripts/measure-context.sh` now
reports on-invoke cost per component so the next increase is visible while it
happens rather than three releases later.

Two consequences worth knowing. **`review` is the heaviest component**, and its
SKILL.md, frontmatter included, is 5,246 tokens on the chars/4 basis, ~4,971 corrected —
against a post-compaction re-injection limit that keeps only the **first 5,000
tokens of a skill**.

**That margin was negative until 2026-08-29, and the gate guarding it was the
reason nobody knew.** The corrected figure used to be chars/4 divided by 1.135, a
whole-estate average taken once in the 2026-08-25 audit. Measured with a real
tokeniser, `review/SKILL.md` was **5,298 tokens — 298 OVER the cap** — while the
gate reported 4,956 and called it 44 under. A single average does not hold per
file, and the file it failed on was the only one anywhere near the limit.

Two things changed. The corrected figure is now measured per build rather than
derived, and the gate refuses to print one at all when no tokeniser is installed.
And the cap check no longer asks whether a file is under a round number: it asks
whether any **pinned rule** sits past the 5,000 tokens that re-attach, across
every skill. That is `51dfbcc`'s failure mode reached by position instead of by
deletion — a rule still present, still passing every presence check, and no
longer in context when it matters. It is proved able to fail: padding inserted
ahead of the rules made it report a pinned rule at token ~6,485.

The file now fits whole, with **29 tokens of margin, and the way that number was
reached is the finding**. A 44-token addition on 2026-08-29 — the brief for the
adversarial pass, which had none — pushed it 37 tokens over. Trimming five other
paragraphs to pay for it broke two pinned rules in two attempts, and the gate
caught both. The addition ended up in `checklists.md` with a pointer left behind,
which is what the constraint actually forces: **`review` has no room, so the next
addition either displaces something or goes to the sibling.** That is a
structural fact about the heaviest component, not a number to watch — thin, and the next release owes it headroom. Its load-bearing rules are
front-loaded, its lane mechanics and its report-time suppression list live in
`checklists.md`, and its base-resolution shell — 207 tokens for 709 chars, 22%
denser than the file average because shell tokenises badly — moved out to
`skills/review/scripts/base.sh`, where it can have a test. That last move was not
token golf: the snippet implemented two of the five resolution steps its own
prose described, and a script is the only form of that logic a test can reach.

The per-skill cap is not the binding one. Re-attached skills share a **combined
25,000-token budget**, filled from the most recently invoked, so on a long
session older skills are dropped entirely rather than truncated
([docs](https://code.claude.com/docs/en/skills)). Twelve components against
25,000 is the constraint that actually bites.

The ceiling if every component fires once is **37,489 chars/4, ~34,147 corrected**.

Counting siblings is new, and it exposed an older understatement.
`review/checklists.md` is read on **every** review — "read it now, before judging
anything" — and `measure-context.sh` had never counted it, because `body_chars`
silently returned 0 for any file without YAML frontmatter. That contradicted its
own comment and had gone unnoticed. Fixed; the conditional siblings
(`performance.md`, `depth.md`, `principles.md`) are now listed separately and
excluded, because a file opened on one run in five is not a cost paid on every
run.

And the honest comparison: measured against `obra/superpowers` at v6.3.0,
omc-slim's always-on surface came out **marginally larger** (~5,743 bytes against
~5,556). The defensible claim was never "smaller". It is **no runtime that
multiplies** — no fan-out by default, nothing on the tool-call path — and every
skill that grows puts that claim closer to the line.

**Nothing here survives a compaction unless the harness re-sends it.** Measured:
constraint violations run **0% while a policy is in full context and 30% on
average after compaction, up to 59%** on some models; conditional on the rule
being dropped from the summary, **38%**
([arXiv:2606.22528](https://arxiv.org/abs/2606.22528)). The output style is part
of the system prompt and is re-sent every turn, which is structurally the
"constraint pinning" that paper found restores 0% — a real advantage over a
`CLAUDE.md`-based layer, and worth knowing. But a mid-session correction, a
delegation brief, and an invoked skill body are all in the class that gets
evicted. A separate measured effect compounds it: compliance falls roughly
**5.6% per additional function generated** within one session
([arXiv:2605.10039](https://arxiv.org/abs/2605.10039)). omc-slim has no
re-assertion mechanism and does not claim one.

**No standing-rule delivery.** A correction you make in one session does not
survive into the next, and nothing re-states it when a later message needs it.
[ballast](https://github.com/svy04/ballast) solves this with a `UserPromptSubmit`
hook that injects matching rules from a JSON catalog. We did not adopt it: it is
per-message injection, its `block` action refuses a prompt where every mechanism
here is advisory, and its value depends on a catalog you must write by hand. The
delegation contract carries constraints into the brief instead, which also
reaches subagents — where a prompt hook by design does not. Use `CLAUDE.md` for
anything that must persist.

**These numbers describe a build that no longer exists.** They were measured
against the pre-restructure prompts. Since then every agent and skill has been
restructured, four agents became one skill, and the output style was reorganised
— so the artefact under test is not the artefact that ships. `scripts/bench/` has
not been re-run. Treat the table below as the last known measurement of an
earlier version, not as a claim about the current one, until it is.

**Measured, honestly, and repeatably.** Full method and caveats in
[`docs/BENCHMARK.md`](./BENCHMARK.md). One prompt naming no technology
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
4.3× the code, and produced the run's only silent failure — skipping an
unreadable directory without a word. It also proved wildly unstable: three runs
of one prompt cost $4.71, $6.01 and $10.47.

Against the setup this replaces: **7.0× cheaper and 6.5× faster**, at equal
correctness.

This reverses the earlier v0.4.1 result, which found omc-slim 10% *more*
expensive with 2.1× the tests. Note the baseline moved too — plain now emits 2.3×
the output tokens it did then, and carries Claude Code's built-in skills — so the
two runs are not one series. The old table is kept in the appendix of
[`docs/BENCHMARK.md`](./BENCHMARK.md).

So the honest claim is not "better than plain". It is *cheaper than plain, with
a smaller and markedly more consistent deliverable, at a fraction of a
heavyweight discipline layer.* An earlier version of this sentence said
"materially more verification" — the table above falsifies that (21 tests
against plain's 39), and BENCHMARK.md says it plainly: it writes fewer tests
than plain, not more.

What it does **not** show: the central bet. A single-file CLI is exactly where
"smallest thing that works" wins and delegation cannot pay — **no subagent ran in
any arm.** Whether routing work to cheaper tiers beats doing it all on the main
model is still untested, and needs a large multi-file task to settle.

For context on why that matters:

| | Static context | Independent benchmark |
|---|---|---|
| Karpathy Skills | ~589 tok | +0.96pp at identical cost |
| oh-my-claudecode | ~2,671 tok | +1.65pp at +43% cost |
| **omc-slim** | **~4,768 tok** | see above |
| Agent Skills | ~1,826 tok | −1.10pp |

Source for the outer rows: [orcabot.com/benchmarks](https://orcabot.com/benchmarks),
July 2026. In that dataset **sophistication correlates negatively with results** —
the smallest pack won on efficiency, the largest lost to doing nothing. Our own
result is consistent with it.

**omc-slim is the most expensive row in that table**. It has grown on net across
every release — 2,774 at v0.1.0 against 4,768 today — though not monotonically:
v0.6.9 cut 250 tokens and v0.7.6 cut 48. Each increase was individually
justified — adopted behaviours, an anti-context-anxiety instruction, a skill
roster the listing could not be trusted to provide — and they still sum. That is
the exact failure mode oh-my-claudecode was criticised for, arrived at one
defensible step at a time.

The earlier figures in this series were measured by hand, and by v0.8.1 the
README quoted two different totals for the same plugin. `measure-context.sh`
exists so that cannot recur; treat pre-v0.8.1 points as approximate.

If further measurement holds this direction, the right response is to shrink
toward Karpathy, not to add features.
