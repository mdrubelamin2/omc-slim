# Performance work

Read this when you are about to **change** something for performance, or to judge
an optimisation someone else made. *Finding* a performance problem does not need
this file — that lane lives in `checklists.md`. Deciding whether a change is
worth keeping does.

## The loop

**Measure → identify → fix → verify → guard.** Skipping straight to *fix* is the
default failure, and it is why most optimisations are neutral.

**Optimise only what a measurement proves matters.** "It is obviously slow" is a
hypothesis. If you did not measure, you do not know — and re-measuring is cheap
enough that the claim costs nothing to test.

This bars unmeasured *changes*, not unmeasured *findings*. Naming a structural
anti-pattern you can point at in the source — a query inside a loop, an unbounded
fetch — is a legitimate review finding at any time, reported as potential impact.
What needs a measurement is the decision to *act*, and the claim that acting
helped.

Two measurement kinds, not substitutes for each other: **synthetic** (Lighthouse,
a benchmark, a profiler) is reproducible and belongs in CI; **real-user data**
(RUM, p75 over 28 days) is what proves a fix helped anyone. Static reading of
source measures nothing at all.

## Web numbers, when the change is web-facing

LCP good ≤ 2.5s, poor > 4.0s · INP good ≤ 200ms, poor > 500ms · CLS good ≤ 0.1,
poor > 0.25 · TTFB acceptable < 800ms · a task over 50ms is a long task and the
main lever on INP · initial JS < 200KB gzipped · CSS < 50KB · API p95 < 200ms.

These are defaults. **A budget the project already sets overrides every number
here** — read it first.

## Verify: the step that is actually skipped

A fix is a hypothesis until you re-measure. This step decides whether it lives.

- **Same command, same conditions, same fixed budget** — wall-clock, sample count
  or request count. A baseline on a cold cache against a result on a warm one
  measures the cache, not your change.
- **One change at a time.** Three optimisations landed together produce one
  number you cannot attribute. If they must ship together, measure each alone
  first.
- **Beat the noise, not the mean.** A 3% gain inside ±5% run-to-run variance is
  not a gain, it is a different sample.

| Result | Action |
|---|---|
| Past the threshold, tests green | **Keep.** Commit with the before/after numbers. |
| Within noise | **Revert.** |
| Worse | **Revert.** |
| Faster, but a test went red | **Revert** — a regression wearing a win's clothing. |

**"Neutral" is a revert, not a keep.** This is the one people skip: the change is
already written, throwing it away feels wasteful, so it lands unmeasured and the
codebase accretes complexity that never bought anything. Code you keep, you
maintain forever — make it pay for itself. "We already wrote it" is sunk cost;
the measurement does not care how long it took.

**Correctness gates the number.** An optimisation that wins by dropping work the
product needed — skipping a validation, caching something that must be fresh,
removing an `await` that was load-bearing — is a regression, not a win.

## Guard, and keep a ledger

Guard the win: a budget check in CI, an assertion, or a monitored metric.
Otherwise it erodes silently.

Then record the attempt — **including the ones you reverted**. A revert leaves no
trace in git, which is exactly why the same dead idea gets tried again next
quarter.

```
| Idea                  | Baseline → result | Verdict  | Why                           |
| Memoise the row cell  | INP 240 → 235ms   | reverted | Inside noise (±15ms).         |
| Virtualise the list   | INP 240 → 90ms    | kept     | Long tasks gone from the trace|
```

A section in the change description or a `PERF.md` both work. What matters is
that the next person — or the next agent — reads it before proposing an
experiment that already failed. Record the variance band, not only the delta.

## Refuse these

| Excuse | Reality |
|---|---|
| "This optimisation is obvious" | If you did not measure, you do not know. Profile first. |
| "The win is obvious, no need to re-measure" | Then re-measuring is cheap and proves it. Unmeasured wins are how neutral complexity lands. |
| "It did not help much, but it does not hurt" | Neutral is a revert. You pay maintenance forever and got nothing back. |
| "It is fast on my machine" | Your machine is not the user's. Use representative hardware and network. |
| "We will optimise later" | Fix the named anti-patterns now; defer the micro-optimisations. |
