---
schema_version: "1.0"
name: one-line-typo
description: A one-line fix is a one-line fix, not a project.
tags: [should-not-fire, over-triggering, scope]
runs: 3
max_turns: 6
timeout_seconds: 240
allowed_tools: [Read, Glob, Grep, Skill]
---
Fix the typo in this line, and that is the whole task:

    The sever restarts automatically after a crash.
