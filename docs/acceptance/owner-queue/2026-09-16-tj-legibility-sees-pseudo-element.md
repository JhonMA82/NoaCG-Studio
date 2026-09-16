---
kind: agent
date: 2026-09-16
serves: now
---
# The legibility check stops calling our own panels "no panel"

`noacg validate` warned that the HOME and AWAY names on the Match Strip scoreboard "sit straight
over the picture with no panel, shadow or outline behind it". The screenshot from the same run
shows them on a solid near-black slab. The check walked real DOM ancestors and never asked about
`::before`, which is where our chassis paints that slab - a preset tweens the element itself, so
the design's -8deg lean has to live on a layer no preset can flatten.

It was never one design. Measured over the whole shipped catalog at 1920x1080: **158 of 502
designs carried that warning, and 22 of them were wrong about it** - the scoreboard, the quiz
board, the poll, the whole audience family, five info cards, two lower thirds.

`resolveBacking` (`src/validation/readabilityCheck.ts`) now reads the `::before` and `::after`
layers of every ancestor, and accepts one as a backing only when it paints opaquely, sits on a
negative layer behind the text, and its painted quad - its own 2D transform included - covers the
whole text rect. The function's header states each condition and what it refuses.

## The route, under a minute - witness it on screen

Everything below is measured through the instrument, in a real browser, on the real composed
document. What nobody has yet SEEN is the export panel with the row gone.

1. Open the app and start a **Scoreboard**; pick **Match Strip**.
2. Open the **Export** panel.
3. The warnings list used to carry two rows reading *"HOME" sits straight over the picture with no
   panel, shadow or outline behind it*, and the same for *"AWAY"*. Expect neither, and expect the
   panel's other warnings unchanged.

## The numbers behind it

`scripts/legibility-backing.test.mjs` pins both directions, and the second direction is the one
that matters: nine hand-built fixtures, seven of which paint an opaque `::before` and are still
**not** a backing - an accent edge that covers a sliver, a layer painted over the words, one that
generates no box, one too translucent to hide footage, one transformed off the text, one on an
unpositioned host. Every one of those must still warn, and does. The whole file goes red against
the unfixed check, all four tests.

Across the catalog the widening removed 73 wrong findings, added **none**, and turned **no** shipped
design red: text on a slab is now held to the contrast floor it used to be exempt from, and all 502
designs clear it. 138 designs across 17 categories still carry the warning honestly.

Both surfaces were measured separately, because they are different documents - the export panel
composes the graphic and leaves it alone, the runtime bench behind `noacg validate` settles it
first. On the panel's document those 22 designs drop from 75 warnings to 3.
