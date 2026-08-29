# The field, and where it beats us

Dated 2026-08-29, from two sourced research passes. Earlier competitive work sits
in `VIABILITY-2026-08-28.md` and `RESEARCH-2026-08-26.md`, which are lab
notebooks. This is the consolidation, and it exists because scattered analysis is
analysis nobody reads.

Every figure is a snapshot read on 2026-08-29. Star counts measure attention, not
quality, and are reported rather than reasoned from.

## Where a competitor is genuinely better, in our own scope

Four, and the first two are the ones that should change what we build.

### Delegation discipline is enforced by a hook, not by prose

`Rylaa/fable5-opus5-orchestrator` (52 stars) registers `PreToolUse` on the
matcher `^(Agent|Task|Workflow|TaskCreate)$` and **blocks the spawn** when a
requirements ledger has not been written. A `Stop` hook holds the turn while a
verification item is open, and `UserPromptSubmit` re-surfaces unreconciled
dispatches.

Ours is `disallowedTools: [Agent, Task]` plus output-style prose. The denial is
real and harness-enforced, but it is binary and invisible at the orchestrator: it
can stop a subagent spawning anything, and it cannot express *when* a spawn is
allowed. Theirs is admission control. Read from their `hooks.json`, not their
README.

### Read-only is a property of the hook layer, not of the prompt

`linxule/kimi-plugin-cc` (36 stars) states it plainly: *"Read-only commands
enforce read-only at the hook layer, not the prompt."* An index-0 `PreToolUse`
hook fires on every tool call of every turn, with a workspace allowlist and a
mandatory budget ceiling on heavy modes.

Our read-only agents rest on `disallowedTools` in agent frontmatter, which is
genuinely harness-enforced, so this is a narrower gap than it first reads. What
they have and we do not is a **`Stop`-event review gate**: their reviewer checks
the work before the turn ends. Our `review` skill only runs when something invokes
it, and the second dogfood receipt records it never firing in two sessions.

### The reviewer is a different vendor's model

`openai/codex-plugin-cc` (32,528 stars) ships `/codex:review` and
`/codex:adversarial-review`, where the reviewing model is not Claude.

Our strongest review rule is that the pass which produced a change cannot be the
pass that clears it. A separate Claude context satisfies the letter. A separate
vendor covers correlated failure modes that a same-model second pass cannot see,
which is more of the spirit than we reach.

Caveat that cuts the other way: that repository has not been pushed since
2026-07-08, and open issue `#368` is *"Is there an active fork of this plugin?"*

### A numeric finding threshold

Anthropic's bundled `/code-review` is reported to score every finding 0 to 100
and admit only those above a tunable default of 80. Ours emits severity and
confidence as labels. **Secondary source, a listicle, unverified against
first-party documentation.** Do not build on it before checking.

## Where nobody beat us

Three, and they are narrower than a moat.

Verification planning as a separable act. Nothing in the survey plans what would
prove a change without also writing the tests.

Context economy as a measured claim, with one exception below.

Honest negative results. No competitor found publishing a regression against
itself. Our README leads with nine runs in which delegation was available and
never chosen, which is a finding against our own thesis.

## The thing that competes with `explorer` directly

`MinishLab/semble`, 5,969 stars, and the only project in the survey competing on
context economy with a number attached: *"Code search for agents that uses 98%
fewer tokens than grep"*, per its Hacker News launch on 2026-05-17 at 445 points.
The repository now claims 99%.

`explorer` exists to return a compressed file:line map instead of file dumps.
That is the same claim without the measurement.

## Mechanisms from other ecosystems worth naming

Full sourcing in the research pass. Three transfer; two do not, and the ones that
do not are as useful to know.

`opencode` expresses delegation as a permission map rather than a tool denial:
`{"task": {"*": "deny", "orchestrator-*": "allow", "code-reviewer": "ask"}}`,
glob-matched per target. It also names `doom_loop`, the repeated-identical-call
guard, as a permission rather than a hook.

Roo Code scopes *which files a mode may edit* with a `fileRegex` on the agent
definition. Claude Code's `disallowedTools` is all-or-nothing per tool, so the
equivalent needs a `PreToolUse` hook reading `file_path`.

AWS Kiro writes requirements in EARS notation and gives every task a
back-reference to the requirement it discharges, with approval gates between
phases. It is files and prose, no platform feature, which is exactly why it
transfers when the next item does not.

Google Antigravity's artefact review loop does not transfer. Its value is a
first-class reviewable object with inline comments routed back to the agent, and
a plugin can write a markdown plan and block, but cannot create a commentable UI
object or record video. Worth noting that Antigravity allows subagent nesting to
depth 10 where we allow one level: opposite bets on the same problem.

Cline's checkpoints do not transfer either. Per-message workspace snapshots are
harness-level state capture and no hook can restore a conversation.

## The correction that matters most

The platform is larger than our documents assume. Probing the 2.1.251 binary
turned up hook events we had not accounted for, including `TaskCreated`,
`TaskCompleted`, `SubagentStart`, `InstructionsLoaded`, `PostToolBatch` and
`FileChanged`. `TaskCreated` is documented as able to block.

If that holds, one-level delegation could become admission control rather than a
tool denial, and `InstructionsLoaded` could answer which of our own instructions
actually loaded, which is the question `check-output-style.mjs` raises and cannot
settle. The event strings are confirmed on disk. The blocking semantics are
documented, not tested, and the documentation contradicts itself on whether
`SubagentStop` blocks. Nothing here is built on until that is measured.

## What no plugin solves, from the last month of complaints

Auto mode's shell-first instruction defeats tool-call-based gates. Covered in
`LIMITATIONS.md`, where it is tested against our own hook, because it is a live
threat to us rather than only a market gap.

Effort is uncalibrated to task size. One report describes *"read and update the
config file with new data"* consuming 43 minutes of container pulls and test-suite
authoring. `#84672` records non-converging review-and-fix spirals where each
round's fix becomes the next round's finding. A convergence budget is
plugin-shaped and nobody ships one.

Compaction is closed to plugins. A fleet measurement over July 2026 found 354 of
354 bare `/compact` runs used the stock template, a `CLAUDE.md` compact-instructions
section applied zero times, and `PreCompact` receiving empty
`custom_instructions` on auto-trigger. We name compaction eviction as a top
silent failure mode, and the one hook that could re-assert discipline is inert on
the path that matters.

## Sourcing and its limits

Every mechanism above is the project's own assertion, verified only as far as
reading the manifest, the documentation page or the hook file. **No competitor
was installed, and nothing here is a measurement of any of them against stock
Claude Code.** For the small projects there are no independent user reports at
all, which is what 25 to 210 stars looks like.

Two projects named in a comparison blog, Claude Octopus and Codex Peer Review,
have no repository we could locate. Their quality percentages are one author's
account of one feature and are not carried here as claims.

The complaint sweep rests on the GitHub tracker and Hacker News. No working route
into Reddit was found, so complaints that reach neither are invisible to this
pass.
