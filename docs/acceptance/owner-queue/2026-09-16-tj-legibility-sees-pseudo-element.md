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

## The route, under a minute

1. Open the app and start a **Scoreboard**; pick **Match Strip**. Finish, then **Export it**.
2. The warnings list used to carry two rows reading *"HOME" sits straight over the picture with no
   panel, shadow or outline behind it*, and the same for *"AWAY"*. Expect neither - just
   *"Template is valid and ready to export."*
3. The control, worth thirty seconds: the same route with **Frost Score**, a scoreboard that has
   no slab. Both rows are there, in amber. That is the check still working, not gone quiet.

Both were walked in the running app on 2026-09-17 and looked at, not only measured.

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

## One thing found on the way, and fixed here

Walking that route is what turned it up: the export panel showed NO legibility warnings at all,
for Match Strip and for Frost Score alike. `checkTemplateLegibility` waited on a double
`requestAnimationFrame` with no timeout beside it, and a hidden or backgrounded page throttles
that to never - so the panel silently rendered an empty warnings list, indistinguishable from a
graphic with nothing wrong. The font wait one line above it already had a cap; this one now has
the same, as does the identical recipe in `markLegibility.ts`. It is the reason step 3 above is
worth doing: a quiet panel used to be ambiguous.

Nothing in this item needs you. It is a defect fix with its own test and a walked route, filed
here because the warning was visible in the product and is now not.
