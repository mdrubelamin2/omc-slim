# design: domain playbooks

Opened from [`SKILL.md`](./SKILL.md), not read by default. Read the one section matching the brief. Generic craft is in [`floor.md`](./floor.md) and is not repeated.

Evidence strength is marked per section. A rule marked second-hand is not quoted to the user as a number.

**Five worked examples, not a closed list.** For a category not here, derive its playbook the same way: find who has studied that surface, keep what would not fall out of the floor, and mark the evidence strength. A category with no research playbook is a licence to build something specific, not to guess quietly.

**Dated 2026-09-05.** Conventions, not law. Everything above this file in the precedence list in [`floor.md`](./floor.md) outranks it.

## Ecommerce

Backed by large-scale moderated usability testing, reported second-hand and not read at source. Cite the direction, not the decimal.

- **Guest checkout is the most prominent option at the account step.** Around 60% of tested users struggled to find or select it.
- **Cut the form fields.** A typical checkout carries roughly 15 fields across 23 elements. Half is achievable.
- **The gallery is where product pages fail.** Around 40% of tested sites hide images that were available.
- **A swatch is not enough for apparel or cosmetics.** Users look for the colour shown on a person.
- **Price, availability, shipping cost and return terms are visible before the cart.**

## Blog and editorial

- **Measure and leading are the design.** 66 characters, 1.5 to 1.6 leading, body 18 to 20px.
- **One reading path.** Related links collect into a single block at the end.
- **Vertical rhythm derives from the body leading**, not from independently chosen gaps.
- **A serif body runs slightly longer lines and takes more leading than a sans at the same size.**

## Portfolio

No research playbook exists here. Practitioner position, not presented to the user as research.

- **The work leads from the first viewport and the interface recedes.**
- **One decision per screen on the index: which piece to open.**
- **Real imagery.** A geometric mask approximating a photographic subject reads worse than omitting the effect.
- **Source and self-host a display face.** Typography carries the identity here more than anywhere else.

## Product and dashboard

Any dense working surface. Several rules override [`calibration.md`](./calibration.md), which is written for reading and brand surfaces.

- **The measure rule does not apply to data.** Tables and dense rows may run well past 120 characters.
- **Fixed rem type scale, not fluid sizing.**
- **Type steps 1.125 to 1.2, not 1.25.** More type roles, so exaggerated contrast reads as noise.
- **A second neutral layer** for sidebars, toolbars and panels, slightly warmer or cooler than the content surface.
- **The accent marks primary action, current selection and state. Nothing else.** An inactive element never carries a saturated accent.
- **One state vocabulary across the surface**: hover, focus, active, disabled, selected, loading, error, warning, success, info. If "save" looks different in two places, one is wrong.
- **Cap the metrics on one view.** *Practitioner sources put the drop-off past roughly a dozen; second-hand.*
- **Three layers: summary, diagnostic, detail.** Top-left carries the most important figure.
- **Virtualise past about 50 rows.**
- **Motion 150 to 250ms, no page-load sequences.**
- **An empty state teaches the interface.** "Nothing here" wastes the one screen guaranteed to be read.
- **A modal is usually laziness.** Exhaust inline and progressive alternatives first.

## Landing page

- **The value proposition is above the fold** with a supporting line or short benefit list beside it, serving the scanner and the reader at once.
- **Benefit-led headline, specific subheadline, one dominant call to action.** Competing calls split the decision.
- **Trust signals sit at the conversion point**, not in a strip elsewhere. *The reported impact multiplier is second-hand.*
- **Open with the most characteristic thing in the subject's world.** The big-number hero is the default treatment; use it only when it is the best one.
- **One orchestrated motion moment**, not a reveal on every section.
