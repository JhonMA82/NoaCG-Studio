---
v: 2
source: owner
kind: ask
raised: 2026-09-15
state: unstarted
asked: "Settle the order of the two editors. I wish that we could think of it as one editor, or maybe it can't. That's not up to me. We have to think about it. Let's just plan it. Let's have Fable look at it, and it can suggest if we can combine it or how we should move forward."
serves: P7
size: large
needs-owner: none
---

# One editor, or two: the OGraf Studio benchmark and quick templates

**Filed:** 2026-09-15. **Source:** owner, recording the weekly alignment answers
(`docs/OWNER_RULINGS.md` ALIGN-2026-09-14-2 and "2026-09-15 - deadlines are not gospel, and
everything is unlocked").

## Why

The owner named two things the editor has to do, and wants them treated as one editor if that
can work:

1. **A benchmark to catch up to.** Zero Density's open-source OGraf Studio
   (`github.com/zerodensity/ograf-studio`) edits layers, properties and a keyframe timeline well.
   The owner rejected how animation and keyframe editing feel in NoaCG today (2026-09-14).
   `docs/EDITOR_REBUILD_PLAN.md`, on the unlanded branch `codex/ograf-studio-architecture-research`,
   plans that rebuild. He said not to scrap it.
2. **Quick graphics from a template.** A person opens a basic template for a type of graphic, such
   as a lower third, changes shapes, colours and logos, picks an animation, and exports to a
   production or an HTML template. Yle staff rarely draw from scratch, and a live crew needs a
   lower third in minutes with the right colours and names. Editing an imported SVG is the same
   editor's second use.

Nobody has decided whether these are one surface with two entry points, or two surfaces, or which
comes first. The owner's expectation is that the template road takes Yle furthest.

## What it would take

One planning session on the strongest design model (Fable), producing a plan and no product code:
read `docs/EDITOR_REBUILD_PLAN.md` and `docs/OGRAF_STUDIO_RESEARCH.md` through
`git show codex/ograf-studio-architecture-research:<path>`, `docs/WYSIWYG_PLAN.md` "Why attempt one
did not land", `docs/COMPETITORS.md` (Zero Density block), and the wizard and catalog code that
already recolours and animates templates. Then say whether the two combine, how, and the order.

Copying Studio code is an option the owner raised. It is AGPL-3.0-only and its runtime is embedded
in every export, so any reuse goes through the exact-file licence review in
`docs/OGRAF_STUDIO_RESEARCH.md` §9 first.

## Acceptance

A plan that answers one editor or two, and the order, with its reasons; the owner-facing summary
readable in five minutes. Implementation rows follow from it, each with its own acceptance.
