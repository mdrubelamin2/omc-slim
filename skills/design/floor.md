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

**Dated 2026-09-08.** Past six months, re-verify any standard below that a decision rests on.

## Access

**Contrast gates on WCAG 2: 4.5:1 body, 3:1 large text and interactive boundaries.** Compute against the composited background by walking ancestors. Over a gradient or an image, report inconclusive, never a pass. Report APCA alongside as advisory; it never gates.

**Target size gates at 24 by 24 CSS px: WCAG 2.2 SC 2.5.8, level AA.** It carries five exceptions and three of them are common — a target inline in a sentence and sized by its line-height, one with 24px of spacing around it, and one with an equivalent control elsewhere on the page. **44 by 44 is SC 2.5.5, level AAA, and the Apple convention**; this skill takes it as a target on touch by choice, not because a standard requires it. Expand the hit area when the visual element is smaller.

**`:focus-visible` is never removed without a replacement.** A focused element is never entirely hidden behind sticky chrome. Focus is trapped, moved and returned around a modal surface. DOM and focus order agree with visual order at every breakpoint and zoom level.

**Every control and every image has an accessible name.** An icon-only button needs `aria-label`; an informative image needs `alt` that carries what it shows; a decorative one needs `alt=""`, not a missing attribute. The document needs `lang`. Missing and empty accessible names are the most common real-world violation there is, and none of them is visible in a screenshot.

**A form error is announced, not only shown.** `aria-invalid` on the field, the message tied with `aria-describedby`, and a live region for anything that appears without focus moving. Inline and red is a sighted-user fix.

**Native semantics before ARIA.** A `<div>` with a click handler breaks the keyboard, middle-click and Cmd-click. `role="button"` handles Space with `preventDefault` on keydown and the action on keyup.

**Zoom is never disabled. Paste is never blocked**, including passwords and one-time codes.

**Text scales with the user's size setting.** Spacing in `rem` or `em`. **One floor per role, and every other file cites these**: body copy 16px, functional text 11px for navigation, buttons, labels, table cells and meta, non-interactive smallprint 10px, and a text-entry input 16px or larger or iOS zooms on focus. The gate enforces the 11 and the 10; 16 for body is a target the audit reports against rather than fails. Being on the project's ramp does not exempt a value.

**Text containers have no fixed width.** Budget 30 to 40 percent expansion for translation, use logical properties for right-to-left, and mirror directional glyphs.

**Every gesture has a click or keyboard equivalent** unless the gesture is essential to the task.

## States

**Every interactive element ships rest, hover, focus-visible, active and disabled. Every asynchronous surface ships loading, empty and error.** Cutting one is a defect, not a scope decision.

**A failed script must not leave the page blank.** Content is visible at rest and revealed by enhancement, never hidden at rest and revealed by JavaScript.

**Layout stability is a design defect, not a performance one.** Every `img` and `video` carries `width` and `height` or an `aspect-ratio`, so the box exists before the bytes do. A web font is preloaded or served `font-display: optional`, and a fallback is metric-matched with `size-adjust` where the swap would move text. Font swap and undimensioned media are the two largest sources of layout shift, and both are decisions made while designing.

**The field numbers, where the brief asks for speed**: LCP good ≤ 2.5s, INP good ≤ 200ms, CLS good ≤ 0.1. A project's own budget outranks these.

**Response budget: under 100ms reads as direct, under 1s must show something happening, past 10s needs a determinate indicator and a visible cancel.** Mutations inside 500ms. Skeletons for content, spinners for momentary operations, and a skeleton mirrors the shape it replaces.

**Filters, tabs, pagination and expanded panels live in the URL.** Back and Forward restore the view and the scroll position.

## Forms

**A validation error preserves what the user typed**, and a form warns before discarding unsaved changes.

**Enter submits from an input, Cmd or Ctrl with Enter from a textarea.** The submit button stays enabled until the request starts and cannot fire twice; an optimistic update has a rollback path. Errors are inline at the field and focus moves to the first. A loading button keeps its label and adds a spinner.

Labels persist; a placeholder is an example. Format and eligibility requirements appear before submission.

**Set `autocomplete`, a meaningful `name`, and the right `type` and `inputmode`.** Disable spellcheck on emails, usernames and codes. The label and its control share one hit target.

## Motion

**`prefers-reduced-motion` substitutes, it does not delete.** Remove translation, scale and overshoot; keep opacity and colour changes that carry meaning. `prefers-reduced-transparency` raises background opacity and drops the blur; `prefers-contrast` moves to near-solid backgrounds with a defined contrasting border. **`forced-colors: active` is the separate and more common case**: Windows Contrast Themes replace your palette outright, so meaning carried by a background colour disappears. Give controls a real border, keep focus rings visible, and reach for the system keywords (`Canvas`, `ButtonText`, `Highlight`) rather than `forced-color-adjust: none`.

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

**Working memory holds about four items, and that bounds what the user must carry between screens** — a wizard's state, an undo you hid, a value they have to remember to re-enter. It does not bound what is on screen: visible navigation is recognition, not recall, and reading Cowan's limit onto a menu is the old Miller misreading. **Dated 2026-09-07, practitioner position:** one primary action per view, one or two secondary, around five top-level navigation entries, around four sibling choices at any level.
