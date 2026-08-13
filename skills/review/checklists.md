# Review lanes

What each lane looks for. Read only the lanes in scope; a lane whose trigger did
not fire costs nothing and finds nothing.

Every item here is a *candidate*. None of it is reportable until it clears the
evidence gate in `SKILL.md` — quote the line that proves it, or it does not exist.

---

## Correctness — always

- **Off-by-one, boundary, empty, null, single-element, maximum size.** First run
  ever, with no existing data. The button clicked twice in 100ms.
- **Error paths, not just the happy one.** A branch that logs and continues where
  it should stop. An operation that can partially complete — three of five items
  processed, then a crash — leaving records inconsistent.
- **Conditional side effects.** One branch updates the related record and the
  other forgets. A log line claiming an action that was conditionally skipped. An
  event that fires only on success.
- **Read-check-write races.** `find` then `create` with no unique index; a status
  transition that is not an atomic `WHERE old_status = ?`; concurrent callers
  double-applying or skipping.
- **Time windows.** A "today" key that only covers midnight-to-now. Two related
  features bucketing the same data hourly and daily.
- **Type coercion at boundaries.** A value crossing a serialisation boundary where
  numeric becomes string. Hash and digest inputs that must normalise type first —
  `{cores: 8}` and `{cores: "8"}` hash differently.
- **Swallowed failure.** A catch-all that logs. A background job that fails with
  nobody watching. A default returned where an error was the honest answer.

**Enum and value completeness — the one lane that requires reading outside the
diff.** When the change introduces a new enum value, status, tier or type
constant, grep for its *siblings* and read every file that switches on, filters
by, persists or displays them. Check allowlist arrays and `case` chains for a new
value falling through to a wrong default. The classic miss is adding it to the UI
dropdown while the backend never persists it.

## Simplicity — always

This lane is the `simplify` skill's scope, applied as review. Detect here, and
hand the fix to `simplify` when there is more than a line or two of it.

Flag: an abstraction with one implementation and no test substituting at the
seam · a wrapper that only forwards · hand-rolled code the standard library, the
platform or an installed dependency already ships · a config key nobody sets · a
flag with one value · nesting three deep · a nested ternary · a function past
~50 lines doing more than one thing · `data`/`temp`/`result` naming · a comment
restating the code · dead code, unreachable branches, unused imports the change
orphaned · duplicated *knowledge* that must change together.

**A conditional bolted onto an unrelated flow is a design finding, not a nit.**
Push the logic into its own helper, state or policy. Repeated conditionals on the
same shape mean a missing model, and the "temporary" branch is usually permanent.

Two judgements this lane must get right:

- **Does the refactor reduce complexity or relocate it?** Count the concepts a
  reader must hold to follow the change. If the cleaner version leaves that count
  unchanged, it is not cleaner. Prefer the restructuring that makes whole
  branches, modes or layers disappear over one that re-centralises the same
  logic. Prefer deleting an abstraction to polishing it.
- **Do not normalise drift.** "The file already does this" is how a bad pattern
  becomes the convention.

## Security — auth touched, or backend and non-trivial

Beyond the obvious (validate input, parameterise queries, do not log secrets):

- **Trust boundaries**, listed explicitly: requests, uploads, webhooks,
  third-party APIs, **and model output**. Anything a model produced is an
  untrusted input — never into `eval`, SQL, a shell, `innerHTML`, or a file path,
  and never persisted without a shape and format check.
- **Prompt injection is assumed. Permissions are enforced in code, not in the
  prompt.** Bound token, rate and recursion limits. Keep secrets, cross-tenant
  data and full system prompts out of the context window.
- **Authorisation defaults to deny.** Look for the endpoint with no auth
  middleware, the role a user can escalate themselves into, and the object
  reference that works by changing an id to someone else's.
- **Injection beyond SQL:** shell with `shell=True` and interpolation; template
  injection; path traversal; header injection; SSRF via a user- or model-supplied
  URL — allowlist the host and block private and reserved ranges.
- **Validation is an allowlist, not a denylist.**
- **Crypto misuse:** MD5 or SHA1 where security depends on it, `Math.random` for
  a token, `==` comparing a secret or digest, a hardcoded key, an unsalted hash.
- **Escape hatches:** `dangerouslySetInnerHTML`, `v-html`, `html_safe`/`raw`,
  `mark_safe`, direct `innerHTML` on anything user- or model-controlled.
- **Deserialising untrusted data** — pickle, Marshal, unsafe YAML loads.
- **Leakage:** a secret in source or a log, a credential in a URL, a stack trace
  or SQL string in an error response, a sensitive field the serialiser forgot to
  exclude.

Dependencies: one dependency change at a time, because a bulk bump that breaks
the build loses which package did it. Read the changelog, not the version number
— **semver is a promise the maintainer may not have kept.** Review the lockfile
diff, commit it, never hand-edit it. Triage advisories by *reachability*; an
advisory audit does not catch a newly malicious package. Every dependency is a
liability: check what it costs in bytes, whether it is maintained, and whether
the existing stack already does it.

## Tests — always

- **Negative paths.** A guard clause, an error branch, a permission check that is
  asserted in code and never tested for the denied case.
- **Edge coverage** mirroring the happy-path tests that already exist: zero,
  empty, boundary, single element, unicode.
- **Isolation.** Shared mutable state, order dependence, reliance on the clock,
  timezone or locale, real network calls.
- **Flake sources.** Sleeps and tight timeouts, assertions on the order of
  unordered results, unseeded random data.
- **Coverage of the change specifically.** A changed method whose existing tests
  only cover the old behaviour is untested, whatever the coverage number says.
- **The test that had to change.** If a test was edited to make the change pass,
  that is a behaviour change, and it needs to be named as one.

## Performance — a query, loop, hot path, bundle or render path changed

**Never state a number you did not observe.** A finding from reading code is
*potential* impact. Label it that way, label a measured one `measured`, and mark
what you could not measure as `not measured`. Field data and lab data are
different numbers; presenting one as the other is fabrication. Reporting no
scorecard beats reporting an invented one.

### Diagnose by symptom, not by guess

| Symptom | Look at |
|---|---|
| Slow first load | Bundle size; TTFB split into DNS / TCP-TLS / server wait; render-blocking resources |
| Interaction sluggish | Long tasks > 50ms; re-renders; controlled-input overhead |
| Animation jank | Layout thrashing, forced reflow (read-then-write in a loop) |
| Slow after navigation | Fetch waterfalls; N+1 fetches on the client |
| One endpoint slow | That endpoint's queries and indexes |
| *Every* endpoint slow | Connection pool, memory, CPU — not the query |
| Intermittently slow | Lock contention, GC pauses, an external dependency |
| Memory grows | Leaked listeners/refs, unbounded caches — take a heap snapshot |

### Anti-patterns worth naming

| Pattern | Why it hurts | Fix |
|---|---|---|
| N+1 queries | Load grows linearly with rows | Join, eager-load, or batch |
| Unbounded query or fetch | Memory exhaustion, timeouts | Paginate; `LIMIT` with a deterministic `ORDER BY` |
| Missing index | Reads degrade as data grows | Index filtered and sorted columns, and new foreign keys |
| Sequential `await`s | Latency adds up | `Promise.all` where the calls are independent |
| Layout thrashing | Dropped frames | Batch all DOM reads, then all writes |
| Blocking the main thread | Poor INP | Chunk long tasks, yield to the scheduler, offload to a worker |
| Unoptimised images | Slow LCP, wasted bytes | Modern format, responsive sizes, lazy-load below the fold |
| Large bundle | Slow time-to-interactive | Split by route, lazy-load, audit dependencies |
| Missing caching | Repeated identical work | Cache with an explicit TTL; hash content for immutable assets |
| Leaked listeners, intervals, refs | Memory climbs to a crash | Clean up on teardown |

Machine-written code has its own set: memoising everything "just in case"
(**over-memoisation costs more than it saves and is itself a defect**), state
duplicated instead of lifted, `useEffect` dependencies broad enough to loop,
scroll and resize listeners without `passive` or a debounce, DOM writes inside a
loop, over-fetching "in case we need it", and parallel requests with no
deduplication. Report these under the area they belong to; do not create an
"AI" category.

**Fit the advice to the actual stack.** Identify the framework and rendering
model before applying any framework-specific rule. Recommending `next/image` to a
Vue app or `React.memo` to a Svelte app is the fastest way to make a whole review
untrustworthy.

Proposing or accepting an *optimisation* — rather than reporting one of these —
needs `performance.md`, which holds the rule that decides whether a change
survives re-measurement.

## Data and schema — a migration is in the change

Reversible, with a down that actually undoes it · no drop of a column still
holding data, no type change that truncates · `NOT NULL` added only after a
backfill · backfill batched, not one statement over the whole table · index
creation concurrent on a large table · **ordering against the deploy**: does the
old code survive the new schema during a rolling deploy, and does the new code
survive the old schema?

## API contract — a public interface changed

Removed or retyped response fields · a new required parameter on an existing
endpoint · changed status codes or methods · a renamed path with no alias ·
auth requirement changed · breaking change with no version bump · error shape
inconsistent with the rest of the API · missing pagination or rate limiting where
siblings have it · docs, spec and examples left describing the old behaviour ·
**clients that cannot force-update** — will they still work?

## Interface — the change is user-facing

Route the judgement calls to the designer; these are the mechanical ones.

Focus removed (`outline: none`) with no replacement · touch target under 44px ·
body text under 16px · heading levels skipped · `!important` added · an
interactive element with no hover or focus state · a fixed pixel width with no
`max-width` or breakpoint · text with no measure limit · more than three font
families.

And the tells of generated UI: everything centred, one large border radius on
every surface, icons in coloured circles as decoration, the symmetrical
three-card feature grid, violet-to-indigo gradients, and copy that opens "Unlock
the power of".

**Calibrate against the project's own design system if it has one.** A pattern
the project blessed is not a finding.

## Operations — CI, release or config changed

Version tag format consistent across the manifest, the tag and the publish step ·
publish idempotent on re-run · secrets referenced, not inlined · build matrix
covering the platforms actually shipped · a new artefact type with no release
path. Skip this lane for test-only CI changes and for services with an existing
auto-deploy.
