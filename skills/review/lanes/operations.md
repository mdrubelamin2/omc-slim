# Review lane: Operations

Opened from [`SKILL.md`](../SKILL.md) when the lane table triggers this lane, and
not otherwise. Every item is a *candidate*: nothing is reportable until it clears
the gates in `SKILL.md`.

---

## Operations

- Version tag format consistent across the manifest, the tag and the publish step
- Publish idempotent on re-run
- Secrets referenced, not inlined
- A build matrix covering the platforms actually shipped
- A new artefact type with no release path

Test-only CI changes and services with an existing auto-deploy usually clear this lane in a line. Clear it and say so: the lane table triggers it, and a triggered lane is run and reported rather than skipped.
