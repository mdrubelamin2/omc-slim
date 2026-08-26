---
schema_version: "1.0"
name: where-is-it
description: A locating question should come back as a map, not an essay.
tags: [contract, locating]
runs: 3
max_turns: 10
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Skill]
---
I have a Python service with modules `auth.py`, `session.py`, `tokens.py` and
`middleware.py`. Where would the refresh-token rotation logic live, and what
would I grep for to find every place that touches it? Answer for a codebase you
cannot see — tell me how to locate it, not what it should do.
