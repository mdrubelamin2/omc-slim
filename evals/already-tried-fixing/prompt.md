---
schema_version: "1.0"
name: already-tried-fixing
description: A failed first fix should produce competing hypotheses, not a second guess.
tags: [tracer, contract, routing]
runs: 3
max_turns: 10
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Skill]
---
Our nightly job intermittently writes duplicate rows. I already added a unique
constraint and it still happens, maybe once a week. I have no reproduction. What
is going on?
