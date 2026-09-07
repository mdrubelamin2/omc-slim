---
name: design
description: Builds and judges user interfaces against a measured floor, in two modes — replicating a source at fidelity, or originating from a brief — then renders the result and reports what a script measured rather than what it looks like.
when_to_use: '"build this page", "make this look good", "this UI is generic", "match this Figma", "clone this screenshot", "design me a landing page". Needs something to build or something built. Judging a code diff is the omc-slim:review skill.'
---

# Design

**Dispatched by the `omc-slim:review` skill, you are already the escalation. Take the work.** Routing it back is a loop, not a boundary. What you refuse is a diff with no interface in it, in one line.

Two modes, weighting fidelity and invention in opposite directions. **Replicate** matches a source: a design file, a screenshot, a wireframe. **Originate** builds from a brief. Settle which before anything else.

**Scale to the work.** A one-line change gets the edit and one audit run at one viewport. A component gets the viewport sweep. A whole surface gets the sweep and the dispatched verdict. Nothing below a surface earns a plan, a self-diff or a second opinion. This tier governs sections 4 to 6: below a surface, build and check what changed, and skip the rest.

## 1. Survey

**Read the project first.** Design documentation, tokens, scale, theme config, class-merge and variant helpers, component library, icon set, motion library, and the nearest existing screen. A component that exists is used, never re-implemented. A value the project set is the answer.

**Then this session.** Survey the toolset the way the output style says, route a slice to a specialist that covers it better, and say so in the report.

Read [`floor.md`](./floor.md). It governs both modes.

## 2. Replicate

Read [`replicate.md`](./replicate.md). Fidelity is the standard.

Creativity enters in one case: the source is wrong. A contrast failure, a target below the floor, a state nobody drew, a mistake its author would fix. Name the deviation and match everything else.

## 3. Originate

Read [`calibration.md`](./calibration.md) for starting values, [`defaults.md`](./defaults.md) for what gets called out, and the one section of [`domains.md`](./domains.md) matching the brief. Read [`gesture.md`](./gesture.md) only for drag, swipe, sheets, sliders or momentum.

**Ask for references before you ask for anything else.** Two or three real pages worth taking structure from. "Modern" and "clean" produce the median, which is the thing being complained about.

**Plan before markup**: four to six named values, the typefaces and their roles, the layout concept, one signature element.

**Then diff the plan against the dated list in [`defaults.md`](./defaults.md), once.** Name every entry it matches — the gradient, the three cards, the tracked-out eyebrow, the uniform radius. That is a comparison against a written corpus and it is checkable; your own median is a second guess and a story about the difference. A plan matching four entries is the default wearing a plan's clothes.

**One revision, then build.** The second self-diff re-runs the first against a plan you just wrote and will always find something: this checks the plan, it does not search for one that passes. Still the median after revising? Say so and build it — a named default beats an unnamed one, and neither is worth another hour.

## 4. Build

Whole surfaces. Every interaction state, every asynchronous state, copy with something checkable in it, real images or placeholders marked as placeholders.

**Build closes on the plan, not on taste.** The four to six values, the typefaces, the layout, the signature element, and the floor's states for what you built: that is the surface. Polish you think of while building is a finding for the report, not a reason to keep building.

## 5. Verify

**Build fully first, then verify twice.** One batched inspection round, one batch of fixes, then at most one confirming round. Sections 5 and 6 share that budget: a re-run, the verdict pass and any check you added spend from it and never reset it. A third round needs an open failure, the audit's exit 1 or a thrown page, and it is the last. State where you are, `round 2 of 2`, the way the review and deepwork skills state theirs. An advisory, a critic finding and a doubt of your own are not failures. Those findings are the only list; a re-opened hunt of your own is how this stops terminating.

**Use whatever this session has, at a checkpoint rather than per edit.** Take the strongest instrument available and work down: a browser tool already connected to a live page, a driver the project installs, then the bundled script. Read what each offers instead of assuming its shape, and use its own audits where they beat the probe.

The bundled probe is the floor, not the ceiling:

```
node "${CLAUDE_PLUGIN_ROOT}/skills/design/scripts/audit.mjs" <url-or-file>
```

Exits 0 clean, 1 on a failure, 2 when it could not run. `--width` and `--height` set the viewport; the sweep is 320, 768 and 1280. `--probe` emits a bare expression and `--probe-fn` a function, for running the same checks through a connected tool.

**Extend it at most once, chosen before the first round.** A check the probe cannot make and this session can is one to make, and to name in the report as beyond the bundled set.

**Capture the render** at every swept viewport, and in dark mode where the project has one. Capture the states a static view misses once each on what this run changed, not once per viewport: hover, focus-visible, disabled, loading, empty, error. Emulate rather than assume. Take that tool's accessibility audit and console issues; its network and performance views only where the brief asks for speed.

**Errors gate everything.** An uncaught script error, or a page still hiding most of its text after load, means every later number is meaningless. Fix it, re-run the checks it invalidated at one viewport, and charge that to the budget.

**Failures are the floor. Advisories never fail anything.** The advisory list is dated and carries a real false-positive rate. Report the count, never a verdict.

**No browser, no claim.** Report NOT VISUALLY VERIFIED, name the assertions that did not run, and ask before building a check the project does not already have.

**Read the render only for what no script reaches**: whether it means what it should, whether hierarchy reads, whether it looks assembled rather than designed. Every number comes from a measurement. A reading is not one.

## 6. Verdict

On a whole surface, dispatch a **general-purpose agent** with [`critic.md`](./critic.md), the audit output as a path, and the render. It measures nothing; it names what the audit cannot. Below a surface, skip it. Dispatch once, and only once the audit is clean or its open failures are written down as accepted.

## Output

```xml
<mode>replicate | originate</mode>
<adopted>what the project provided, used as-is</adopted>
<plan>values, typefaces, signature element, what the self-diff changed</plan>
<changes>files touched, one line each</changes>
<verification>N of M checks, at which viewports, advisory count, what did not run and why, the verdict or the reason there was none</verification>
<deviations>where you left the source, the brief or a rule here, and why</deviations>
```

Then stop. What is still imperfect goes in `<verification>` as open. A surface is never finished, so finished means the plan is built and the budget is spent.
