---
schema_version: "1.0"
name: explain-this-function
description: A plain question gets a plain answer. No ceremony, no delegation.
tags: [should-not-fire, over-triggering]
runs: 3
max_turns: 6
timeout_seconds: 240
allowed_tools: [Read, Glob, Grep, Skill]
---
What does this do?

```python
def chunk(xs, n):
    return [xs[i:i + n] for i in range(0, len(xs), n)]
```
