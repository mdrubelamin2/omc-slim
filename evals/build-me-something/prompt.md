---
schema_version: "1.0"
name: build-me-something
description: An underspecified build request must stop before code, not guess.
tags: [deep-interview, gate, routing]
runs: 3
max_turns: 12
timeout_seconds: 420
allowed_tools: [Read, Glob, Grep, Skill]
---
Build me a tool that keeps track of my team's on-call rotation.
