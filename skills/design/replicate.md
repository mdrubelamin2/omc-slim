# design: replicating a source

Opened from [`SKILL.md`](./SKILL.md) in Replicate mode.

Conventions, not law. Precedence is in [`floor.md`](./floor.md).

Fidelity is the standard. The floor still binds, and it is the only thing that outranks the source.

## Take structure and values separately from pixels

**Tokens first.** From a design file, pull its variables and styles: colour, spacing, typography. Hardcoding a value the file names as a token loses what makes a clone maintainable.

**Geometry second.** The layer outline with positions and sizes, which keeps a large source out of context.

**Existing components third.** Where the source maps to something the project already has, use the project's. Re-implementing an existing button pixel-accurately is a defect.

**Pixels last, and only as the reference to compare against.** Export the frame at a known width.

Where the source is a screenshot or a wireframe, only the last two exist. Say so, and say that token fidelity is therefore unverifiable rather than achieved.

## Match in this order

Alignment, then colour, then type size and weight, then spacing, then everything else. A two-pixel drift on an edge reads before a two-pixel drift in a gap.

## Tolerances, derived rather than chosen

**Colour: exact.** Tokens are discrete. A near-match is a wrong value.

**Type: exact size and weight.** Line height within a pixel of the intended ratio.

**Position and spacing: inside the project's own scale.** If the scale steps by 4, then 2px is inside the step and 4px is a token error. Where there is no scale, 2px.

**Pixels: a change detector, not an acceptance test.** A diff percentage cannot separate a layout shift from anti-aliasing. Changed dimensions are unconditional failure; a pixel delta only points at where to look.

## Compare like for like, or the comparison means nothing

Same width, same device pixel ratio, scrollbars hidden, animations settled or disabled, caret hidden, fonts confirmed loaded, clocks and random content masked.

**Never take a baseline from a browser carrying a real profile.** Extensions, zoom level and font smoothing all move the pixels.

**Confirm the capture before trusting the comparison.** A blank region, a half-loaded image or an entrance animation caught mid-flight is a bad capture, not a bad build. An element hidden by animation timing reads exactly like a missing element.

## The overlay, when a diff is inconclusive

Position the reference over the live render at the same width with `mix-blend-mode: difference`. Everything matching goes black, which turns "are these the same" into "is this black".

## What a clone cannot inherit

A static source has no hover, focus, loading, empty or error state, and no behaviour at a narrower viewport. The floor still requires all of them: design them, list them as additions rather than matches, and sweep the viewports regardless of how exact the match is at the design width.
