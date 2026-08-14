# Review lanes

What each lane looks for. Read only the lanes in scope. Every item is a
*candidate* — nothing is reportable until it clears the gates in `SKILL.md`.

---

## Correctness — always

Off-by-one, boundary, empty, null, single element, maximum size · the first run
ever, with no data · the button clicked twice in 100ms · a branch that logs and
continues where it should stop · an operation that can half-complete, three of
five processed then a crash, leaving records inconsistent · a catch-all that
swallows · a background job that fails with nobody watching · a default returned
where an error was the honest answer.

**Conditional side effects** — one branch updates the related record and the other
forgets; a log line claiming an action that was conditionally skipped; an event
that fires only on the happy path.

**Read-check-write races** — `find` then `create` with no unique index; a status
transition that is not an atomic `WHERE old_status = ?`; concurrent callers
double-applying or skipping.

**Boundary coercion** — a value crossing serialisation where numeric becomes
string, so digest inputs must normalise first (`{cores: 8}` and `{cores: "8"}`
hash differently); a "today" key covering only midnight-to-now; two features
bucketing the same data hourly and daily.

**Enum and value completeness — the one lane that requires reading outside the
diff.** When the change adds an enum value, status, tier or type constant, grep
its *siblings* and read every file that switches on, filters by, persists or
displays them. Check allowlist arrays and `case` chains for the new value falling
through to a wrong default. The classic miss is adding it to the dropdown while
the backend never persists it.

## Simplicity — always

The `simplify` skill's scope, applied as review: detect here, hand the fix over
when it runs past a line or two.

An abstraction with one implementation and no test substituting at the seam · a
wrapper that only forwards · hand-rolled code the standard library, the platform
or an installed dependency already ships · a config key nobody sets · a flag with
one value · nesting three deep · a nested ternary · a function past ~50 lines
doing more than one thing · `data`/`temp`/`result` naming · a comment restating
the code · dead code, unreachable branches, imports the change orphaned ·
duplicated *knowledge* that must change together.

**A conditional bolted onto an unrelated flow is a design finding, not a nit** —
push it into its own helper, state or policy. Repeated conditionals on the same
shape mean a missing model, and the "temporary" branch is usually permanent.

**Does the refactor reduce complexity or relocate it?** Count the concepts a
reader must hold; if the cleaner version leaves that count unchanged, it is not
cleaner. Prefer the restructuring that makes whole branches, modes or layers
disappear over one that re-centralises the same logic, and prefer deleting an
abstraction to polishing it. **Do not normalise drift** — "the file already does
this" is how a bad pattern becomes the convention.

## Security — auth touched, or backend and non-trivial

Past the obvious (validate input, parameterise queries, do not log secrets):

- **Trust boundaries, listed:** requests, uploads, webhooks, third-party APIs, and
  **model output**. Anything a model produced is untrusted input — never into
  `eval`, SQL, a shell, `innerHTML` or a file path, and never persisted without a
  shape and format check.
- **Prompt injection is assumed; permissions are enforced in code, not in the
  prompt.** Bound token, rate and recursion limits; keep secrets, cross-tenant
  data and system prompts out of the context window.
- **Authorisation defaults to deny** — the endpoint with no auth middleware, the
  role a user can escalate into, the object reference that works by changing an id
  to someone else's.
- **Injection past SQL** — shell interpolation, template injection, path
  traversal, header injection, SSRF via a user- or model-supplied URL: allowlist
  the host, block private and reserved ranges.
- **Validation is an allowlist, not a denylist.**
- **Crypto misuse** — MD5 or SHA1 where security depends on it, `Math.random` for
  a token, `==` on a secret or digest, a hardcoded key, an unsalted hash.
- **Escape hatches** — `dangerouslySetInnerHTML`, `v-html`, `html_safe`/`raw`,
  `mark_safe`, bare `innerHTML` on anything user- or model-controlled.
- **Deserialising untrusted data** — pickle, Marshal, unsafe YAML loads.
- **Leakage** — a secret in source or a log, a credential in a URL, a stack trace
  or SQL string in an error response, a sensitive field the serialiser forgot.

Dependencies: **one dependency change at a time**, because a bulk bump that breaks
the build loses which package did it. Read the changelog, not the version number —
**semver is a promise the maintainer may not have kept.** Review the lockfile
diff, commit it, never hand-edit it. Triage advisories by *reachability*; an
advisory audit does not catch a newly malicious package. Every dependency is a
liability: bytes, maintenance, and whether the existing stack already does it.

## Tests — always

Negative paths — a guard clause, an error branch, a permission check asserted in
code and never tested for the denied case · edge coverage mirroring the happy-path
tests that exist: zero, empty, boundary, single element, unicode · isolation:
shared mutable state, order dependence, reliance on the clock, timezone or locale,
real network calls · flake sources: sleeps and tight timeouts, assertions on the
order of unordered results, unseeded random data.

**Coverage of *this* change.** A changed method whose tests only cover the old
behaviour is untested, whatever the coverage number says. A test edited to make
the change pass is a behaviour change, and has to be named as one.

## Performance — a query, loop, hot path, bundle or render path changed

**Never state a number you did not observe.** A finding from reading code is
*potential* impact; label a measured one `measured`, and what you could not
measure `not measured`. Field and lab data are different numbers, and presenting
one as the other is fabrication — no scorecard beats an invented one.

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

| Anti-pattern | Fix |
|---|---|
| N+1 queries | Join, eager-load, or batch |
| Unbounded query or fetch | Paginate; `LIMIT` with a deterministic `ORDER BY` |
| Missing index | Index filtered and sorted columns, and new foreign keys |
| Sequential `await`s on independent calls | `Promise.all` |
| Layout thrashing | Batch all DOM reads, then all writes |
| Blocking the main thread | Chunk long tasks, yield to the scheduler, offload to a worker |
| Unoptimised images | Modern format, responsive sizes, lazy-load below the fold |
| Large bundle | Split by route, lazy-load, audit dependencies |
| Missing caching | Explicit TTL; hash content for immutable assets |
| Leaked listeners, intervals, refs | Clean up on teardown |

Machine-written code has its own set: memoising everything "just in case"
(**over-memoisation costs more than it saves** and is itself a defect), state
duplicated instead of lifted, `useEffect` dependencies broad enough to loop,
scroll and resize listeners with no `passive` or debounce, DOM writes inside a
loop, over-fetching "in case", parallel requests with no deduplication. Report
these under the area they belong to; there is no "AI" category.

**Fit the advice to the actual stack.** Identify the framework and rendering model
before applying any framework-specific rule — recommending `next/image` to a Vue
app, or `React.memo` to a Svelte app, makes a whole review untrustworthy.

## Data and schema — a migration is in the change

Reversible, with a down that actually undoes it · no drop of a column still
holding data, no type change that truncates · `NOT NULL` only after a backfill ·
backfill batched, not one statement over the table · index creation concurrent on
a large table · **ordering against the deploy**: does the old code survive the new
schema during a rolling deploy, and the new code survive the old schema?

## API contract — a public interface changed

Removed or retyped response fields · a new required parameter on an existing
endpoint · changed status codes or methods · a renamed path with no alias · a
changed auth requirement · a breaking change with no version bump · an error shape
inconsistent with the rest of the API · missing pagination or rate limiting where
siblings have it · docs, spec and examples still describing the old behaviour ·
**clients that cannot force-update** — will they still work?

## Interface — the change is user-facing

Judgement calls go to the designer; these are the mechanical ones.

Focus removed (`outline: none`) with no replacement · touch target under 44px ·
body text under 16px · heading levels skipped · `!important` added · an
interactive element with no hover or focus state · a fixed pixel width with no
`max-width` or breakpoint · text with no measure limit · more than three font
families.

The tells of generated UI: everything centred, one large radius on every surface,
icons in coloured circles as decoration, the symmetrical three-card grid,
violet-to-indigo gradients, copy that opens "Unlock the power of".

**Calibrate against the project's own design system if it has one.** A pattern the
project blessed is not a finding.

## Operations — CI, release or config changed

Version tag format consistent across the manifest, the tag and the publish step ·
publish idempotent on re-run · secrets referenced, not inlined · a build matrix
covering the platforms actually shipped · a new artefact type with no release
path. Skip for test-only CI changes and services with an existing auto-deploy.
