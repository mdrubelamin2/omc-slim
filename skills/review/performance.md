# Performance work

Read this before **changing** something for performance, or judging an
optimisation someone else made. *Finding* a performance problem does not need this
file — that lane is in `checklists.md`. Deciding whether a change is worth keeping
does.

## The loop

**Measure → identify → fix → verify → guard.** Going straight to *fix* is why most
optimisations turn out neutral.

**Optimise only what a measurement proves matters.** "It is obviously slow" is a
hypothesis, and re-measuring is cheap enough that the claim costs nothing to test.
This bars unmeasured *changes*, not unmeasured *findings*: naming an anti-pattern
you can point at in the source is a legitimate finding at any time, reported as
potential impact. The measurement gates the decision to *act*, and the claim that
acting helped.

Synthetic measurement (a benchmark, a profiler, Lighthouse) is reproducible and
belongs in CI; real-user data (p75 over 28 days) is what proves a fix helped
anyone. They are not substitutes. Reading source measures nothing.

## Web numbers, when the change is web-facing

LCP good ≤ 2.5s, poor > 4.0s · INP good ≤ 200ms, poor > 500ms · CLS good ≤ 0.1,
poor > 0.25 · TTFB < 800ms · a task over 50ms is a long task, the main lever on
INP · initial JS < 200KB gzipped · CSS < 50KB · API p95 < 200ms.

Defaults only. **A budget the project already sets overrides every number here.**

## Verify — the step that actually gets skipped

A fix is a hypothesis until you re-measure.

- **Same command, same conditions, same fixed budget** — wall clock, sample count
  or request count. A cold-cache baseline against a warm-cache result **measures
  the cache, not your change**.
- **One change at a time.** Three landed together give one number you cannot
  attribute; if they must ship together, measure each alone first.
- **Beat the noise, not the mean.** A 3% gain inside ±5% run-to-run variance is
  not a gain, it is a different sample.

| Result | Action |
|---|---|
| Past the threshold, tests green | **Keep**, committing the before/after numbers |
| Within noise | **Revert** |
| Worse | **Revert** |
| Faster, but a test went red | **Revert** — a regression wearing a win's clothing |

**"Neutral" is a revert, not a keep.** This is the step people skip: the change is
written, discarding it feels wasteful, so it lands unmeasured and the codebase
accretes complexity that never bought anything. Code you keep, you maintain
forever. "We already wrote it" is sunk cost.

**Correctness gates the number.** Winning by dropping work the product needed —
skipping a validation, caching what must be fresh, removing a load-bearing
`await` — is a regression, not a win.

## Guard, and keep a ledger

Guard the win with a CI budget check, an assertion or a monitored metric, or it
erodes silently.

Then record every attempt, **including the ones you reverted** — a revert leaves
no trace in git, which is why the same dead idea returns next quarter.

```
| Idea                 | Baseline → result | Verdict  | Why                       |
| Memoise the row cell | INP 240 → 235ms   | reverted | Inside noise (±15ms)      |
| Virtualise the list  | INP 240 → 90ms    | kept     | Long tasks gone from trace|
```

The change description or a `PERF.md` both work. What matters is that the next
person reads it before re-running an experiment that already failed. Record the
variance band, not only the delta.

## Refuse these

| Excuse | Reality |
|---|---|
| "This optimisation is obvious" | If you did not measure, you do not know. |
| "The win is obvious, no need to re-measure" | Then it is cheap to prove. Unmeasured wins are how neutral complexity lands. |
| "It did not help much, but it does not hurt" | Neutral is a revert. Maintenance forever, nothing back. |
| "It is fast on my machine" | Yours is not the user's. Use representative hardware and network. |
| "We will optimise later" | Fix the named anti-patterns now; defer the micro-optimisations. |
