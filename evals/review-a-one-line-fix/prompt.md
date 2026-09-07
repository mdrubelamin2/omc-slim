---
schema_version: "1.0"
name: review-a-one-line-fix
description: An explicitly invoked review still scales its spend to the change.
tags: [cost, scope, explicit-invocation]
runs: 3
max_turns: 12
timeout_seconds: 420
allowed_tools: [Read, Glob, Grep, Bash, Skill]
---
Use the omc-slim review skill on my working tree. The only change is one line:

    -  const RETRY_LIMIT = 3;
    +  const RETRY_LIMIT = 4;

in `src/queue/retry.ts`. Nothing else is modified.
