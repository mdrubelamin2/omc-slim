# Distribution, drafted and not sent

Every artefact below is ready to publish and none of it has been. Publishing is
the maintainer's decision, and one of these makes a public admission that cannot
be taken back.

---

## 1. The write-up

Working title: **What I found benchmarking my own Claude Code plugin, including
the part that says it does not work.**

The shape, and why this order:

Open with the number that hurts. *"I built a six-agent orchestrator for
Claude Code. I benchmarked it against a plain session. It came out 18% cheaper —
and zero subagents ran in any arm. The win came from the prompt. The roster the
plugin is named for did nothing."*

Then the part that makes it useful rather than confessional. Five
independent sources say the same thing about delegation for coding work:
Anthropic's own multi-agent paper (*"LLM agents are not yet great at coordinating
and delegating to other agents in real time"*), Cognition reversing their own
public position, MAST across 1,600 traces and 7 frameworks, Nature MI on
SWE-bench Verified, and this benchmark. Five against, none for.

Then the study most people in this category have not read. Laszlo,
2026-06-11: 500 tasks, 59 repositories, 8 languages, Codex against Codex plus the
leading orchestration plugin, with significance testing. Pass rate +2.2pp, **not
significant**. Tokens +625k per task, **significant**. The framework *"changed the
failure surface"* rather than improving correctness.

Then what survives, because the post is not nihilism. The measured wins are
a terse register and a hard stop before building. The register answers the most
saturated complaint in the corpus and works where `CLAUDE.md` edits do not,
because the harness applies an output style instead of asking the model to. The stop scores +14.50 points in a control-armed comparison and is the
one thing native Dynamic Workflows explicitly cannot do: *"No mid-run user
input."*

Close on the correction. *"I also wrote, in my own strategy document, that no
head-to-head benchmark of any orchestrator plugin existed anywhere. That was
wrong. There are at least five, and two are better than mine. I found that out by
asking a research agent to argue against me, which is the only part of this whole
apparatus I would recommend without reservation."*

Do not include a feature list, a comparison table where this project wins, or
any sentence containing "delve", "leverage" or "seamless". The post's entire
value is that it is the one in the category that admits something, and a single
paragraph of selling destroys it.

Publish to r/ClaudeAI and r/ClaudeCode (where the complaint corpus lives),
Hacker News, and link it from the README's first screen.

The risk, stated: this post makes the plugin harder to sell and easier to
trust. That trade is the maintainer's to accept, and it is irreversible.

---

## 2. The awesome-claude-code entry

One line, in the category's own format:

> **[omc-slim](https://github.com/mdrubelamin2/omc-slim)** — A discipline layer:
> terse register, evidence gates, and a stop before the model builds the wrong
> thing. Benchmarked against a plain session with the harness committed, and
> publishes its own negative result.

No star count, no multiplier, no adjective the evidence does not force.

---

## 3. The marketplace listing

Already in `.claude-plugin/marketplace.json`, and it leads with what is measured
rather than with delegation. Check `./scripts/check-coverage.sh` before
publishing: the worded roster is pinned in four places and drifts silently.

---

## 4. The GitHub repository description

`./scripts/check-coverage.sh` prints the exact command with the current figure.
It is the fifth site quoting the roster and the token total, and the only one no
check can see from inside the repository. It has drifted twice.

Run it last, after the tag. It describes what is published, so updating it
earlier makes it describe something that does not exist yet.

---

## What to do before any of this

Two things, and the second is the one that will be skipped.

Run the delegation benchmark. [INSTRUMENTS-R4.md](./INSTRUMENTS-R4.md) §1.
~$45–60. It is the only thing that turns "the roster did nothing on one
single-file task" into either a defensible claim or a retraction, and the post
above is stronger with either outcome than it is with the question open.

Decide the name. The migration path exists — marketplace `renames` maps
plugin names, verified against the binary — and the cost of using it never gets
lower than it is today, with no listing and no adoption. After the listing, it
rises for good.
