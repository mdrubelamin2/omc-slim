# Review lane: Interface

Opened from [`SKILL.md`](../SKILL.md) when the lane table triggers this lane, and
not otherwise. Every item is a *candidate*: nothing is reportable until it clears
the gates in `SKILL.md`.

---

## Interface

Judgement calls go to the `omc-slim:design` skill, which owns the visual audit and can render the result; these are the mechanical ones.

- Focus removed (`outline: none`) with no replacement
- Touch target under 24×24 CSS px: the WCAG 2.2 AA floor (2.5.8). 44×44 is the AAA enhanced target (2.5.5) and the Apple convention, not the AA floor
- Body text under 16px
- Heading levels skipped
- `!important` added
- An interactive element with no hover or focus state
- A fixed pixel width with no `max-width` or breakpoint
- Text with no measure limit
- More than three font families

The tells of generated UI are dated, so they live in one place with a calibration date on them: the `omc-slim:design` skill carries the list, split into what gates and what only advises.

**Calibrate against the project's own design system if it has one.** A pattern the project blessed is not a finding.
