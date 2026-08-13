---
name: codemap
description: Generate hierarchical codemaps for an UNFAMILIAR repository — one codemap.md per directory plus a root atlas. Use when asked to map or document a codebase, or before substantial work on a repository nobody has read yet. Expensive and it writes files across the tree, so state the cost and get a yes before starting.
---

# Codemap Skill

You help users understand and map repositories by creating hierarchical codemaps.

## When to Use

- User asks to understand/map a repository
- User wants codebase documentation
- Starting substantial work on an unfamiliar codebase

## Announce before you start

This skill is expensive — it reads the whole tree and spawns one fixer per
directory. On a few-hundred-file repository that is real money and several
minutes. It also **writes files into the user's repository**: a `codemap.md` in
every mapped directory, `.slim/codemap.json`, and a section in root `AGENTS.md`.

So: say what it will cost and what it will write, and get a yes first. Reaching
for it unprompted is correct; doing so silently is not.

If the repository is small enough to simply read, read it instead.

## Workflow

### Step 1: Check for Existing State

**First, check if `.slim/codemap.json` exists in the repo root.**

If it does not exist, check for legacy state at `.slim/cartography.json`.

If legacy state exists: move `.slim/cartography.json` to `.slim/codemap.json`, then continue with change detection.

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

4. **Delegate codemap writing to Fixer agents** - Spawn one fixer per folder to read code and create or update its specific `codemap.md` file.

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

3. **Only update affected codemaps** - Spawn one fixer per affected folder to update its `codemap.md`.
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

## Codemap Content

Fixers are responsible for writing `codemap.md` files during this workflow. Use precise technical terminology to document the implementation:

- **Responsibility** - Define the specific role of this directory using standard software engineering terms (e.g., "Service Layer", "Data Access Object", "Middleware").
- **Design Patterns** - Identify and name specific patterns used (e.g., "Observer", "Singleton", "Factory", "Strategy"). Detail the abstractions and interfaces.
- **Data & Control Flow** - Explicitly trace how data enters and leaves the module. Mention specific function call sequences and state transitions.
- **Integration Points** - List dependencies and consumer modules. Use technical names for hooks, events, or API endpoints.

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
