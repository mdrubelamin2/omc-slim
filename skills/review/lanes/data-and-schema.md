# Review lane: Data and schema

Opened from [`SKILL.md`](../SKILL.md) when the lane table triggers this lane, and
not otherwise. Every item is a *candidate*: nothing is reportable until it clears
the gates in `SKILL.md`.

---

## Data and schema

- Reversible, with a down that actually undoes it
- No drop of a column still holding data, no type change that truncates
- `NOT NULL` only after a backfill
- Backfill batched, not one statement over the table
- Index creation concurrent on a large table
- **Ordering against the deploy**: does the old code survive the new schema during a rolling deploy, and the new code survive the old schema?
