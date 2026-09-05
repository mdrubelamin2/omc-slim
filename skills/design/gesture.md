# design: gesture and physics

Opened from [`SKILL.md`](./SKILL.md) only when the work involves dragging, swiping, sheets, sliders or momentum. Skip it otherwise.

**Dated 2026-09-05.** Conventions, not law. Everything above this file in the precedence list in [`floor.md`](./floor.md) outranks it.

## Tracking

**Feedback is continuous during the interaction, not only at the end.** Track the pointer one to one the whole way through. Pointer-down response is in [`floor.md`](./floor.md).

**Respect the grab offset.** Capture `pointer - element.top` at the start and hold it; snapping the centre to the pointer breaks the illusion on the first frame.

**Use `setPointerCapture`** so tracking survives the pointer leaving the element.

**Keep a short history of recent move events.** Velocity needs it.

**Ignore additional touch points once a drag has begun**, or switching fingers mid-drag jumps the element.

## Interruption

**Never lock input during a transition.** Animating from the presentation value rather than the target is in [`floor.md`](./floor.md).

**On reversal, blend the velocity.** Replacing one animation with another produces a discontinuity that reads as a wall.

**Decompose two-dimensional motion into one spring per axis.** A single spring over a 2D distance desynchronises when the axes carry different velocities.

## Physics

**Springs take damping and response, not mass and stiffness.** Damping 1.0 is critically damped. Response is time to reach the target, not duration.

**Starting values**: reposition damping 1.0 response 0.4; rotation 0.8 and 0.4; drawer or sheet 0.8 and 0.3. On the web, `bounce: 0` with a 0.4 duration, and `bounce: 0.2` only where the gesture carried momentum.

**Hand the release velocity to the spring.** Where the API takes a normalised value, `relativeVelocity = gestureVelocity / (target - current)`.

**Project where the gesture is going, then snap to the nearest target to that projection.** `projection = (velocity / 1000) * d / (1 - d)`, with `d` about 0.998, or 0.99 for a snappier feel. The textbook constant-deceleration formula is not what shipping platforms use.

**Rubber-band past a bound** so resistance rises with distance: `overshoot * dimension * 0.55 / (dimension + 0.55 * abs(overshoot))`.

**Dismiss on velocity, not distance.** A quick flick should be enough. Around 0.11 px per ms is a reasonable threshold.

## Intent

**Require about 10px of movement before committing to a direction**, and allow a drag to be cancelled by returning.

**Detect every plausible gesture in parallel from the first move, then cancel the losers.** A recogniser reporting only a final state throws away the tracking feedback needs.

**Decide reverse against commit from the sign of the velocity at release, not from position.**

**Enter and exit along the same path**, with mirrored easing. In from the right and out through the bottom reads as two events.

**Hint in the direction of the gesture.** The intermediate frames should telegraph the outcome.

**Pay a disambiguation delay only where the ambiguity is real.** Double-tap detection delays every single tap.
