# design: the floor

Opened from [`SKILL.md`](./SKILL.md). Read on every run, including a critique.

Correctness. It does not vary for taste, a brief or a design system. Starting values live in [`calibration.md`](./calibration.md).

## Precedence, highest first

0. **What you can verify right now.** A standard that moved, a measurement you took, a fact the user states, a convention the field has left behind. Every file here is dated evidence, not authority. Where one disagrees with something you can check, what you can check wins, and you name the line you are overriding.
1. **The accessibility floor below**, once you have confirmed the standard it cites still stands.
2. **What the project already does.** Tokens, scale, components, config, conventions, and any design documentation it carries. A value the project set is the answer. A written design system in the repository outranks this skill entirely, calibration and defaults included.
3. **What the brief asks for.**
4. **[`calibration.md`](./calibration.md)**, only where everything above is silent.

A pattern the project blessed is not a finding.

**Override any rule here that you can show to be stale, wrong for this project, or wrong for this brief.** Name the rule, state the case, take the better of the two. Following a rule you know to be wrong is the failure this precedence prevents. Never arguable: a check you did not run is not a result.

**Dated 2026-09-05.** Past six months, re-verify any standard below that a decision rests on.

## Access

**Contrast gates on WCAG 2: 4.5:1 body, 3:1 large text and interactive boundaries.** Compute against the composited background by walking ancestors. Over a gradient or an image, report inconclusive, never a pass. Report APCA alongside as advisory; it never gates.

**Target size floor is 24 by 24 CSS px, 44 by 44 on touch.** 24 is the legal minimum, not a usable button on a phone. Expand the hit area when the visual element is smaller.

**`:focus-visible` is never removed without a replacement.** A focused element is never entirely hidden behind sticky chrome. Focus is trapped, moved and returned around a modal surface. DOM and focus order agree with visual order at every breakpoint and zoom level.

**Meaning is never carried by hue alone.** Pair every status colour with an icon, a label or a shape.

**Native semantics before ARIA.** A `<div>` with a click handler breaks the keyboard, middle-click and Cmd-click. `role="button"` handles Space with `preventDefault` on keydown and the action on keyup.

**Zoom is never disabled. Paste is never blocked**, including passwords and one-time codes.

**Text scales with the user's size setting.** Spacing in `rem` or `em`. Inputs at 16px or larger. Functional text has an 11px floor for navigation, buttons, labels, table cells and meta; non-interactive smallprint stops at 10px. Being on the project's ramp does not exempt a value.

**Text containers have no fixed width.** Budget 30 to 40 percent expansion for translation, use logical properties for right-to-left, and mirror directional glyphs.

**Every gesture has a click or keyboard equivalent** unless the gesture is essential to the task.

## States

**Every interactive element ships rest, hover, focus-visible, active and disabled. Every asynchronous surface ships loading, empty and error.** Cutting one is a defect, not a scope decision.

**A failed script must not leave the page blank.** Content is visible at rest and revealed by enhancement, never hidden at rest and revealed by JavaScript.

**Response budget: under 100ms reads as direct, under 1s must show something happening, past 10s needs a determinate indicator and a visible cancel.** Mutations inside 500ms. Skeletons for content, spinners for momentary operations, and a skeleton mirrors the shape it replaces.

**An error names what happened, why, and how to recover.**

**Filters, tabs, pagination and expanded panels live in the URL.** Back and Forward restore the view and the scroll position.

## Forms

**A validation error preserves what the user typed**, and a form warns before discarding unsaved changes.

**Enter submits from an input, Cmd or Ctrl with Enter from a textarea.** The submit button stays enabled until the request starts and cannot fire twice; an optimistic update has a rollback path. Errors are inline at the field and focus moves to the first. A loading button keeps its label and adds a spinner.

**A placeholder is an example, not a label.** Labels persist. Format and eligibility requirements appear before submission.

**Set `autocomplete`, a meaningful `name`, and the right `type` and `inputmode`.** Disable spellcheck on emails, usernames and codes. The label and its control share one hit target.

## Motion

**`prefers-reduced-motion` substitutes, it does not delete.** Remove translation, scale and overshoot; keep opacity and colour changes that carry meaning. `prefers-reduced-transparency` raises background opacity and drops the blur; `prefers-contrast` moves to near-solid backgrounds with a defined contrasting border.

**Four failures.** `transition: all`. `ease-in` on anything the user triggered. Entering from `scale(0)`. Animating `top`, `left`, `width` or `height` without a measurement.

**Animate from the presentation value, never the target**, or a new animation jumps the element wherever the old one had reached.

**Interactive feedback fires on pointer-down, not on release.**

**Motion past 5 seconds alongside content needs a pause, stop or hide control.** Any non-essential loop stops when offscreen or the tab is hidden.

## Layout

**Flex and grid children need `min-width: 0`**, or they refuse to shrink below their content and overflow the row.

**An overlay must escape a clipping ancestor.** Use a portal, the popover API or fixed positioning.

**Hover styling sits behind `@media (hover: hover) and (pointer: fine)`.** Touch fires hover on tap and the state sticks.

**Nested radii are concentric: `inner + gap = outer`.** Choose the outer value; derive the inner.

**Numbers compared in a column get `font-variant-numeric: tabular-nums`.**

**Theme the surfaces you did not draw**: text selection, caret, scrollbars, focus rings, link underline offset and thickness.

**Working memory holds about four items.** One primary action per view, one or two secondary, the rest behind a menu. Around five top-level navigation entries, around four sibling choices at any level.
