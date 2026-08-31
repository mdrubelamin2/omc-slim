---
name: codemap
description: Writes hierarchical codemap.md files across an UNFAMILIAR repo, plus a root atlas and an AGENTS.md section. Expensive, one agent per directory, and it mutates the repo — state the cost and get a yes first.
when_to_use: '"map this codebase", "document this repo". Proposes itself on an unfamiliar repo, never runs without a yes. If the repo is small enough to read, read it.'
---

# Codemap Skill

You help users understand and map repositories by creating hierarchical codemaps.

## Announce before you start

This skill is expensive: it reads the whole tree and spawns one writer agent per directory. On a few-hundred-file repository that is real money and several minutes. It also **writes files into the user's repository**: a `codemap.md` in every mapped directory, `.slim/codemap.json`, and a section in root `AGENTS.md`.

So: say what it will cost and what it will write, and get a yes first. Reaching for it unprompted is correct; doing so silently is not. Proposing and running are different acts, and only the first is yours.

If the repository is small enough to simply read, read it instead.

## When to Use

- User asks to understand/map a repository
- User wants codebase documentation
- Starting substantial work on an unfamiliar codebase

## Workflow

### Step 1: Check for Existing State

**First, check if `.slim/codemap.json` exists in the repo root.**

If `.slim/codemap.json` exists: Skip to Step 3 (Detect Changes) - no need to re-initialize.

If it does not exist: Continue to Step 2 (Initialize).

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

`init` exits 1 with `already exists` when state is present, after migrating a legacy `.slim/cartography.json`; go to Step 3.

This creates:
- `.slim/codemap.json` - File and folder hashes for change detection
- Empty `codemap.md` files in all relevant subdirectories, each opening with a provenance header naming the commit, date and file count it was written against

4. **Delegate codemap writing** - Dispatch one general-purpose writer per folder, using the brief in "Dispatching a codemap writer" below.

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

3. **Only update affected codemaps.** `changes` now prints two sections, and they get different treatment. Dispatch **one writer per directory whose own files changed**, using the same brief. The **ancestor directories** below that only re-aggregate their children's summaries go to **one** dispatch, deepest first.

### Checking freshness

A stale map is worse than no map: it is confidently wrong context in a file agents were told to trust. `stale` answers, per mapped directory, whether its map still describes the tree. It exits non-zero if any does not, so it works as a check.

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/codemap/scripts/codemap.mjs" stale --root ./
```

Each row is `FRESH`, or a status and the reason it cannot be trusted: files changed, no header, never written, header skewed, map missing. A commit distance it cannot know (no repository, shallow clone) is named, never guessed.

### Step 4: Finalize Repository Atlas (Root Codemap)

Once all specific directories are mapped, the Orchestrator must create or update the root `codemap.md`. This file serves as the **Master Entry Point** for any agent or human entering the repository.

1.  **Map Root Assets**: Document the root-level files (e.g., `package.json`, `index.ts`, `plugin.json`) and the project's overall purpose.
2.  **Aggregate Sub-Maps**: Create a "Directory Map" section. For every folder that has a `codemap.md`, extract its **Responsibility** summary and include it in a table or list in the root map.
3.  **Cross-Reference**: Ensure that the root map contains the absolute or relative paths to the sub-maps so agents can jump directly to the relevant details.

### Step 5: Register Codemap in AGENTS.md

**Claude Code auto-loads `AGENTS.md` into agent context on every session.** To ensure agents automatically discover and use the codemap, update (or create) `AGENTS.md` at the repo root:

1. If `AGENTS.md` already exists and already contains a `## Repository Map` section, **skip this step** - the reference is already set up.
2. If `AGENTS.md` exists but has no `## Repository Map` section, **append** the section below.
3. If `AGENTS.md` doesn't exist, **create** it with the section below.

```markdown
## Repository Map

`codemap.md` in the project root, and one per mapped directory, describe this
repo's architecture, responsibilities and data flow. **They are generated, and
they go stale.** Each states the commit it was written against in its header.

Check before you rely on one:

Ask the omc-slim codemap skill to run its `stale` check (`/omc-slim:codemap stale`).

For any directory it lists: ignore that map and read the code, or regenerate it
with the codemap skill. A map is a shortcut to the code, never a substitute.
```

This is idempotent - repeated codemap runs will detect the existing section and skip. No duplication.

### Step 6: Run `update`

Run `update` on both paths, after the writers return **and** after Step 4 writes the root map. It saves the new hashes *and* re-stamps every `codemap.md` provenance header, which is the run's statement that the maps are current. Run it before the writers and it certifies maps nobody touched. Run it before Step 4 and it certifies the root map. The root folder always carries a header for it, and Step 4 has not written it yet.

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/codemap/scripts/codemap.mjs" update \
  --root ./
```

## Dispatching a codemap writer

A general-purpose writer produces these files; the plugin's own agents are read-only, so they can survey a directory but never produce the file.

The writer executes a specification and does not research one, so the brief below is the specification. It fixes the output path, the required headings, the exact files to read, and a check the writer can actually run. Send one brief per directory.

Get the exact file list from the script rather than improvising it. A map that describes files nobody opened is the failure this command exists to stop:

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/codemap/scripts/codemap.mjs" files --root ./
```

A line starting with `# ` is a header or a comment; every other line is a repo-relative path belonging to the nearest header above it. A header with no paths under it is a directory that contributes no files of its own and only aggregates its children's maps. Diagnostics go to stderr, so stdout needs no filtering. Run it after `init`; it re-selects from disk, so it stays current.

> Write `<dir>/codemap.md`. It opens with a machine-maintained provenance header ending in `<!-- /codemap:provenance -->`. **Leave every line up to and including that marker exactly as it is**, and replace everything below it. `update` rewrites that header; anything you put in it is lost.
>
> Read only these files: `<the paths listed under this directory's header by `codemap.mjs files`>`. You may also read one hop out, a file this directory imports, to see what a call actually does. Describe only this directory: a neighbour you read is context, not content. Where you need more than one hop, name the path and stop.
>
> Read the tests for this directory even though they are excluded from the map. They are the densest statement of intended behaviour you will find, and the map is about intent. Do not describe them; use them.
>
> Use exactly these four `##` headings, in this order: Responsibility, Design, Flow, Integration. `<paste the "Codemap Content" section of this skill here, including the example>`
>
> Verification you must run and report: every path you cite resolves under the repo root, and the file carries all four headings. Both are `test -f` and `grep`: report the counts, not a claim.

That check proves the citations resolve and the shape is right. It does not prove the prose is accurate, so read the returned codemap before accepting it.

## Cite symbols, never line numbers

A codemap outlives the session that wrote it, and **a line number is exact at authoring time and silently wrong later**. One audited plan carried eleven stale citations, and the two worst pointed roughly thirty lines past the symbol they named, into an unrelated class. An agent editing by them modifies the wrong code *while reporting success*.

So in every file this skill writes: name the function, class, constant or export. `resolveSession` in `auth/session.ts`, never `auth/session.ts:118`. Where a range genuinely matters, name what bounds it: "the retry block inside `send`", not where it happened to sit today.

The `omc-slim:review` skill is the exception that proves it. Its `file:line` gate is right because a review reads a live tree in the same session, and the citation dies with it. Nothing written to disk gets that.

## Codemap Content

Writers produce the `codemap.md` files during this workflow, one per directory. Use precise technical terminology to document the implementation:

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

The root atlas takes the same four headings plus a `Directory Map` table, one row per mapped directory. Each row carries its Responsibility summary and a relative link to its `codemap.md`.
