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

The sentence is inline on purpose. Cases run in a sandboxed working directory, so
a prompt that points at "our README" names a file neither arm can open — both
would fail identically and the case would contribute a zero delta by
construction rather than by measurement.
