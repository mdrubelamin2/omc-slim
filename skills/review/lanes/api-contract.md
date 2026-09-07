# Review lane: API contract

Opened from [`SKILL.md`](../SKILL.md) when the lane table triggers this lane, and
not otherwise. Every item is a *candidate*: nothing is reportable until it clears
the gates in `SKILL.md`.

---

## API contract

- Removed or retyped response fields
- A new required parameter on an existing endpoint
- Changed status codes or methods, or a renamed path with no alias
- A changed auth requirement
- A breaking change with no version bump
- An error shape inconsistent with the rest of the API
- Missing pagination or rate limiting where siblings have it
- Docs, spec and examples still describing the old behaviour
- **Clients that cannot force-update**: will they still work?
