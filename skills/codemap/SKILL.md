---
name: codemap
description: Writes hierarchical codemap.md files across an UNFAMILIAR repo plus a root atlas and an AGENTS.md section. Expensive, one agent per directory, and it mutates the repo — state the cost and get an explicit yes first.
when_to_use: '"map this codebase", "document this repo". Proposes itself on an unfamiliar repo and never runs without an explicit yes. If the repo is small enough to read, read it.'
---

# Codemap Skill

You help users understand and map repositories by creating hierarchical codemaps.

## Announce before you start

This skill is expensive — it reads the whole tree and spawns one fixer per
directory. On a few-hundred-file repository that is real money and several
minutes. It also **writes files into the user's repository**: a `codemap.md` in
every mapped directory, `.slim/codemap.json`, and a section in root `AGENTS.md`.

So: say what it will cost and what it will write, and get a yes first. Reaching
for it unprompted is correct; doing so silently is not. Proposing and running are
different acts, and only the first is yours.

Recorded so no later pass re-opens it: `disable-model-invocation: true` is the
native key for the other road — "on request only", invisible until someone types
the name. It was applied once and reverted, because it removes the skill from
context entirely rather than hiding it from the slash menu, and that also removed
the one unprompted routing decision ROUTING.md records this skill winning. The
announce-and-confirm gate above is what protects the user from the spend; the
frontmatter key is not.

If the repository is small enough to simply read, read it instead.

## When to Use

- User asks to understand/map a repository
- User wants codebase documentation
- Starting substantial work on an unfamiliar codebase

## Workflow

### Step 1: Check for Existing State

**First, check if `.slim/codemap.json` exists in the repo root.**

If it does not exist, check for legacy state at `.slim/cartography.json`.

If legacy state exists: move `.slim/cartography.json` to `.slim/codemap.json`, then continue with change detection.

*(This migration is deprecated and comes out in v1.1. It exists for repositories
mapped before the rename; a repository mapped since has never written that path.)*

If `.slim/codemap.json` exists: Skip to Step 3 (Detect Changes) - no need to re-initialize.

If neither file exists: Continue to Step 2 (Initialize).

### Step 2: Initialize (Only if no state exists)

1. **Analyze the repository structure** - List files, understand directories
2. **Infer patterns** for **core code/config files ONLY** to include:
   - **Include**: `src/**/*.ts`, `package.json`, etc.
   - **Exclude (MANDATORY)**: Do NOT include tests, documentation, or translations.
     - Tests: `**/*.test.ts`, `**/*.spec.ts`, `tests/**`, `__tests__/**`
     - Docs: `docs/**`, `*.md` (except root `README.md` if needed), `LICENSE`
     - Build/Deps: `node_modules/**`, `dist/**`, `build/**`, `*.min.js`
   - Respect `.gitignore` automatically
3. **Run codemap.mjs init**:

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/codemap/scripts/codemap.mjs" init \
  --root ./ \
  --include "src/**/*.ts" \
  --exclude "**/*.test.ts" --exclude "dist/**" --exclude "node_modules/**"
```

This creates:
- `.slim/codemap.json` - File and folder hashes for change detection
- Empty `codemap.md` files in all relevant subdirectories

4. **Delegate codemap writing to Fixer agents** - Dispatch one fixer per folder, using the brief in "Dispatching a codemap fixer" below.

### Step 3: Detect Changes (If state already exists)

1. **Run codemap.mjs changes** to see what changed:

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/codemap/scripts/codemap.mjs" changes \
  --root ./
```

2. **Review the output** - It shows:
   - Added files
   - Removed files
   - Modified files
   - Affected folders

3. **Only update affected codemaps.** `changes` now prints two sections, and they
   get different treatment. Dispatch **one fixer per directory whose own files
   changed**, using the same brief. The **ancestor directories** below that only
   re-aggregate their children's summaries go to **one** dispatch, deepest first
   — a leaf edit used to spawn a fixer for every level above it, three of which
   rewrote maps whose own directories had not changed.
4. **Run update** to save new state:

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/codemap/scripts/codemap.mjs" update \
  --root ./
```

### Step 4: Finalize Repository Atlas (Root Codemap)

Once all specific directories are mapped, the Orchestrator must create or update the root `codemap.md`. This file serves as the **Master Entry Point** for any agent or human entering the repository.

1.  **Map Root Assets**: Document the root-level files (e.g., `package.json`, `index.ts`, `plugin.json`) and the project's overall purpose.
2.  **Aggregate Sub-Maps**: Create a "Repository Directory Map" section. For every folder that has a `codemap.md`, extract its **Responsibility** summary and include it in a table or list in the root map.
3.  **Cross-Reference**: Ensure that the root map contains the absolute or relative paths to the sub-maps so agents can jump directly to the relevant details.

### Step 5: Register Codemap in AGENTS.md

**Claude Code auto-loads `AGENTS.md` into agent context on every session.** To ensure agents automatically discover and use the codemap, update (or create) `AGENTS.md` at the repo root:

1. If `AGENTS.md` already exists and already contains a `## Repository Map` section, **skip this step** - the reference is already set up.
2. If `AGENTS.md` exists but has no `## Repository Map` section, **append** the section below.
3. If `AGENTS.md` doesn't exist, **create** it with the section below.

```markdown
## Repository Map

A full codemap is available at `codemap.md` in the project root.

Before working on any task, read `codemap.md` to understand:
- Project architecture and entry points
- Directory responsibilities and design patterns
- Data flow and integration points between modules

For deep work on a specific folder, also read that folder's `codemap.md`.
```

This is idempotent - repeated codemap runs will detect the existing section and skip. No duplication.

## Dispatching a codemap fixer

Fixer writes these files, because the alternatives cannot. Explorer, oracle and
tracer are read-only, so they can survey a directory but never produce the file.
Designer writes, but only UI.

Fixer executes a specification and does not research one. So the brief below is
the specification. It fixes the output path, the required headings, the exact
files to read, and a check the fixer can actually run. Send one brief per
directory.

Get the exact file list from the script rather than improvising it — a map that
describes files nobody opened is the failure this command exists to stop:

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/codemap/scripts/codemap.mjs" files --root ./
```

A line starting with `# ` is a header or a comment; every other line is a
repo-relative path belonging to the nearest header above it. A header with no
paths under it is a directory that contributes no files of its own and only
aggregates its children's maps. Diagnostics go to stderr, so stdout needs no
filtering. Run it after `init`; it re-selects from disk, so it stays current.

> Write `<dir>/codemap.md`, replacing whatever is there now.
>
> Read only these files: `<the paths listed under this directory's header by
> `codemap.mjs files`>`.
> You may also read one hop out — a file this directory imports — to see what a
> call actually does. Describe only this directory: a neighbour you read is
> context, not content. Where you need more than one hop, name the path and stop.
>
> Read the tests for this directory even though they are excluded from the map.
> They are the densest statement of intended behaviour you will find, and the
> map is about intent. Do not describe them; use them.
>
> Use exactly these four `##` headings, in this order: Responsibility, Design,
> Flow, Integration. `<paste the "Codemap Content" section of this skill here,
> including the example>`
>
> Verification you must run and report: every path you cite resolves under the
> repo root, and the file carries all four headings. Both are `test -f` and
> `grep` — report the counts, not a claim.

That check proves the citations resolve and the shape is right. It does not
prove the prose is accurate, so read the returned codemap before accepting it.

## Cite symbols, never line numbers

A codemap outlives the session that wrote it, and **a line number is exact at
authoring time and silently wrong later**. One audited plan carried eleven stale
citations, and the two worst pointed roughly thirty lines past the symbol they
named, into an unrelated class — an agent editing by them modifies the wrong code
*while reporting success*.

So in every file this skill writes: name the function, class, constant or export.
`resolveSession` in `auth/session.ts`, never `auth/session.ts:118`. Where a range
genuinely matters, name what bounds it — "the retry block inside `send`" — not
where it happened to sit today.

The `omc-slim:review` skill is the exception that proves it. Its `file:line` gate
is right because a review reads a live tree in the same session, and the citation
dies with it.
Nothing written to disk gets that.

## Codemap Content

Fixers write the `codemap.md` files during this workflow, one per directory. Use precise technical terminology to document the implementation:

- **Responsibility** - Define the specific role of this directory using standard software engineering terms (e.g., "Service Layer", "Data Access Object", "Middleware").
- **Design** - Identify and name specific patterns used (e.g., "Observer", "Singleton", "Factory", "Strategy"). Detail the abstractions and interfaces.
- **Flow** - Explicitly trace how data enters and leaves the module. Mention specific function call sequences and state transitions.
- **Integration** - List dependencies and consumer modules. Use technical names for hooks, events, or API endpoints.

Example codemap:

```markdown
# src/payments/

## Responsibility
Charges, refunds and webhook reconciliation against the payment provider.

## Design
Provider calls go through one adapter so the rest of the app never sees the
vendor SDK. Idempotency keys are derived from the order id.

## Flow
1. Handler validates the request
2. Adapter calls the provider
3. Webhook reconciles the async result
4. Ledger row written in the same transaction

## Integration
- Consumed by: checkout, admin refunds
- Depends on: ledger, provider adapter
```

Example **Root Codemap (Atlas)**:

```markdown
# Repository Atlas: acme-store

## Project Responsibility
Storefront and order pipeline for a mid-size retailer.

## System Entry Points
- `src/server.ts`: HTTP entry point and route registration.
- `src/worker.ts`: Background job consumer.

## Directory Map (Aggregated)
| Directory | Responsibility Summary | Detailed Map |
|-----------|------------------------|--------------|
| `src/payments/` | Charges, refunds, webhook reconciliation. | [View Map](src/payments/codemap.md) |
| `src/catalog/` | Product data, search indexing, pricing rules. | [View Map](src/catalog/codemap.md) |
| `src/auth/` | Sessions, tokens, permission checks. | [View Map](src/auth/codemap.md) |
```
