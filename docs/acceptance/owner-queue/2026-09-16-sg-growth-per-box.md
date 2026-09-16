---
kind: walk
date: 2026-09-16
because: taste
serves: now
---
# One box grows, its neighbours stay, and the limit is a line you can pull

Growth was one choice for the whole graphic: one shape named in a dropdown, one direction. Your
question plate and your answer plates could not differ, which is what you asked about on
2026-09-03 - *"What if you want it to react differently between the question and the answer?"*
It is now a choice PER BOX, on the checklist heading that already names the box, and the shape is
never asked for because the row is the shape. Beside it, how far a box may get taller is a dashed
line on the preview you can drag, and it cannot be dragged to a value the graphic could not keep.

## Route, about a minute

1. `npm run dev:worktree` in this worktree, then open the port it prints and go to
   **Home › + New graphic › Import graphic**.
2. Drop `e2e/fixtures/svg-corpus/illustrator-question-timer-board.svg` - a countdown card with two
   plates, an amber label band over a dark clock panel. Press **Next**.
3. In **Editable text**, each plate now heads its own group with a select on the right. Set the
   amber band to **gets wider** and the dark panel to **gets taller**.

Your own quiz board works the same way and shows it on five plates: drop
`e2e/fixtures/svg-corpus/illustrator-owner-quiz-board-rotated.svg` instead and set the question's
plate alone to **gets wider**, leaving the four answer plates as drawn.

## What to look at

- **Two boxes, two answers, and neither disturbs the other.** The old dropdown could hold one
  shape and one direction, so the second answer overwrote the first.
- **The dashed line across the artwork** appears for the box you told to get taller, with its name
  and its own sentence on a chip: *"Board 2: stops at the same margin as the bottom, room for 1
  line"*. That is the design's own limit - the margin it left on the other side of the box,
  mirrored - said in your terms rather than as a number.
- **Pull the line.** The sentence under the heading follows it, in the artwork's own px and in
  lines: *"Stops at 43 px below the top of the frame, room for 4 lines at the size you drew."*
  The line count comes off the limit, so you are never asked a second question about it.
- **It refuses to go wrong.** Drag it to the top of the screen and it stops at the frame's safe
  margin; drag it into the box and it stops on the box's own drawn edge. There is no warning to
  read, because there is no wrong value to reach. The arrow keys move it the same way.
- **Put it back where it started and the graphic forgets it.** A limit you did not move emits
  nothing at all, so an import nobody touched still produces the file it always did.

## What it costs the file

One optional number per growth row in the generated code, written as the margin it keeps:
`{ el: 'g1', axis: 'y', safe: 0.04, cap: 0.419 }`, with a comment above it saying the same thing
in words. Version 1 of the layout table survives, and a graphic saved before today reads exactly
as it did.

## What is not here

The line is offered only for a box that may get TALLER. Sideways, the runtime decides at play time
which of three directions a box widens in, and two of them spend the margin on both sides at once,
so one line drawn on one edge would be a limit you can see on one side of the box and not on the
other. The width limit is still the design's own mirrored margin, as it has always been, and the
file format already has room for a width cap the day it is wanted.
