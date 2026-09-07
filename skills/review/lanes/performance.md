# Review lane: Performance

Opened from [`SKILL.md`](../SKILL.md) when the lane table triggers this lane, and
not otherwise. Every item is a *candidate*: nothing is reportable until it clears
the gates in `SKILL.md`.

---

## Performance

**Never state a number you did not observe.** A finding from reading code is *potential* impact; label a measured one `measured`, and what you could not measure `not measured`. Field and lab data are different numbers, and presenting one as the other is fabrication: no scorecard beats an invented one.

| Symptom | Look at |
|---|---|
| Slow first load | Bundle size; TTFB split into DNS / TCP-TLS / server wait; render-blocking resources |
| Interaction sluggish | Long tasks > 50ms; re-renders; controlled-input overhead |
| Animation jank | Layout thrashing, forced reflow (read-then-write in a loop) |
| Slow after navigation | Fetch waterfalls; N+1 fetches on the client |
| One endpoint slow | That endpoint's queries and indexes |
| *Every* endpoint slow | Connection pool, memory, CPU — not the query |
| Intermittently slow | Lock contention, GC pauses, an external dependency |
| Memory grows | Leaked listeners and refs, unbounded caches — take a heap snapshot |

The named anti-patterns — N+1, unbounded queries, missing indexes, sequential awaits on independent calls, layout thrashing, unsplit bundles, absent caching, leaked listeners — need no table. Two are less obvious. Machine-written code memoises everything "just in case": **over-memoisation costs more than it saves** and is itself a defect. And `useEffect` dependencies broad enough to loop. Report both under the area they belong to; there is no "AI" category.

**Fit the advice to the actual stack.** Identify the framework and rendering model before applying any framework-specific rule. Recommending `next/image` to a Vue app, or `React.memo` to a Svelte app, makes a whole review untrustworthy.
