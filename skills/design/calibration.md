# design: the calibration

Opened from [`SKILL.md`](./SKILL.md) when authoring. A replication run takes its values from the source instead.

Starting positions. Each is a reasonable default and none is a target. **Arriving at all of them unchanged is the tell.**

**Dated 2026-09-05.** Conventions, not law. Everything above this file in the precedence list in [`floor.md`](./floor.md) outranks it, and [`domains.md`](./domains.md) overrides individual values.

## Typography

Measure 45 to 75 characters, 66 for a single column; a serif may run longer than a sans. Body 16px floor, 18 to 20px for reading. Leading inverse to size and proportional to measure: about 1.5 body, 1.0 to 1.15 display.

Tracking is size-specific, so one `letter-spacing` across a page is wrong somewhere: negative at display, zero at body, slightly positive at small sizes. Caps and small caps take 5 to 12% extra. Collision floor about `-0.04em`.

Hierarchy moves size, weight and leading as a set. Steps of at least 1.25. Two typefaces is a ceiling and they must be obviously different. Indent or space between paragraphs, never both. Light on dark takes more leading, more tracking and one weight step lighter.

## Space

A 4px base beats an 8px base, which has no step between 8 and 16. Values off the chosen scale are defects.

Space is rhythm, not uniformity. One value everywhere gives every element equal weight. Related things sit closer than unrelated things. A heading takes more space above than below. Try proximity before a container.

## Colour

Author new palettes in OKLCH, which holds perceived lightness across hues and moves chroma without dragging hue. Vary lightness and reduce chroma approaching white and black; uniform chroma is uniform arithmetic, not uniform perception.

Name by role: page, raised surface, subtle border, strong border, solid fill, fill hover, secondary text, primary text. Secondary text on a coloured surface is tinted from that surface's hue, never neutral grey. Compose dark mode; do not invert it.

The accent is spent on primary actions, current selection and state, never on decoration and never at full saturation on something inactive. Prefer explicit colours to stacked translucent overlays. Simulate colour-vision deficiency before calling a palette done.

## Depth

Declare elevation once, a border or a shadow. An opaque grey 1px border under a wide soft shadow is the ghost card. A hairline semi-transparent border tinted toward the surface is a material edge and may sit under a shadow.

Layer shadows and tint them toward the background hue; one shadow at one blur reads as a sticker and pure black reads dirty. Keep `blur()` under 20px. Under sticky chrome, prefer a scroll-edge fade to a divider.

Material weight carries hierarchy: heavier for structural regions, lighter for interactive ones. Never stack one translucent surface on another. Dim to focus, separate to keep flow: a modal pairs its surface with a scrim, a non-blocking panel uses offset without one. Over translucency, raise contrast and add a weight step rather than using flat grey; put colour on a solid layer beneath.

## Motion

Direct feedback 100 to 150ms. Routine state change 150 to 250ms. Layout, overlay and view transitions 300 to 500ms. At most one authored focal moment per page, up to 800ms. Routine motion stays under 300ms.

Exit runs at about 70% of entrance. Stagger 30 to 80ms. A popover scales from the control that opened it; modals are exempt.

Easing follows what is moving: entering or exiting takes ease-out, moving or morphing on screen takes ease-in-out, a hover or colour change takes ease, constant motion takes linear. Asymmetry follows deliberateness, not direction: slow where the user is deciding, fast where the system responds. `will-change` is applied only for the duration of a known animation, never at rest.

Prefer transitions to keyframes, which restart from zero instead of retargeting. Use a named curve for state change; reserve springs for gesture velocity. Bounce defaults to zero and is earned only where the gesture itself carried momentum, then stays between 0.1 and 0.3.

**The frequency gate outranks every duration here.** An action performed 100 or more times a day gets no animation, and a keyboard-initiated action is disqualified by that alone.

## Two tests before you call it done

**The squint test.** Blur the detail. Primary, secondary and the major groups must still read in that order.

**The skeleton test.** Strip the copy out and look at the bare structure. If it only works once the words come back, the boldness was in the type size, not the design.
