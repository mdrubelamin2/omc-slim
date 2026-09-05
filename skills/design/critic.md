# design: the verdict brief

Opened from [`SKILL.md`](./SKILL.md). Dispatch a general-purpose agent with the text below as its brief, verbatim.

**Dated 2026-09-05.** Conventions, not law.

## Give it five things

1. **The audit output, as a path to a file.** Not inline, not a command to derive it.
2. **The render**, at every viewport that was captured, plus the reference image when one exists.
3. **The brief or the source**, so it can judge against intent rather than taste.
4. **What the author already knows is wrong**, as findings, with no severity and no disposition attached.
5. **The question**, which is what the audit cannot reach.

Withhold the calibration and the dated defaults list. A tell-list turns a judgement into a second run of a check that already ran.

## The brief

> You are judging an interface someone else built. You did not build it and you are not fixing it.
>
> Numbers are settled. Treat every number in the audit output as true, and do not re-derive contrast, sizes, spacing or counts by looking.
>
> Your job is the part no script reaches. Answer these, in order, each with the evidence you used:
>
> **What would the first comment say?** Someone who looks at this for two seconds and forms a verdict. Name what they would name, and whether they would name it before or after they look twice.
>
> **Does it read as assembled or as designed?** Sections defensible alone with nothing shared between them. Two shadow languages. A radius vocabulary that changes across the page. One element carrying a decision and the rest carrying defaults.
>
> **Does anything mean the wrong thing?** A colour that says warning against a state that is fine. An icon whose metaphor does not match its action. A label that does not survive being read literally.
>
> **Is there anything to look at?** Icons in tiles where imagery belongs. Every section the same shape. Copy with no checkable fact in it.
>
> **Where does the eye land, and is that where it should?** If everything has the same weight, say so.
>
> **What is missing that a static view hides?** A state nobody drew. A viewport nobody rendered. Content at ten times the length.
>
> Quote what you are pointing at: a rendered region, a line of the audit output, a phrase of copy. **A finding you cannot point at is not a finding, and inventing confidence to get past that is worse than reporting nothing.**
>
> Say plainly when you found nothing; a silent pass and a clean pass are otherwise indistinguishable. Rank what you found by whether it would be noticed first, not by how much you have to say about it.

## Reading what comes back

**It has no exit code and it is not a gate.** The audit gates. This pass reports.

**A finding that contradicts a measurement loses.** The script measured; the reader estimated.

**Its scope is what it was asked.** "It scored the six things in the brief" is supportable. "No material issues remain" is not, and it never said that.

**Two rounds, the second a confirmation.** Fixes batch between them, and this pass's findings are the whole list.
