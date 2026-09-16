# Growth per box, with the cap line - rung 4 of docs/TEXT_BOX_BINDING.md

Branch `claude/sg-growth-per-box`, queued 2026-09-16. Rung 4 is built and marked DONE in the
design doc with its departures; the owner-queue item is
`docs/acceptance/owner-queue/2026-09-16-sg-growth-per-box.md`.

## What was built

Growth moved from one question about the whole graphic to one answer per BOX, on the checklist
heading that already names the box - so the shape is never asked for, and the owner's 2026-09-03
question ("react differently between the question and the answer") is answerable. Beside it, how
far a box may get taller is a dashed line across the artwork on the preview, draggable with the
pointer or the arrow keys, clamped before anything is stored at the frame's safe margin on one
side and the box's own drawn edge on the other. Its chip and the sentence under the heading say
where it stands in the artwork's own px and how many lines the box then holds at the size the
text was drawn.

The format gained one optional number per growth row (`DesignSvgGrowth.cap`, the margin the
growing edge must leave as a fraction of the frame), floored at the rule's safe margin by the
runtime. Version 1 survives, and a rule without a cap derives the margin exactly as before.

## What I departed from in the design, and why

Six departures, all written into `docs/TEXT_BOX_BINDING.md` under "Growth, per box":

1. **The line is offered only for a box that may get TALLER.** Sideways the runtime picks between
   three directions at play time and two of them spend the margin on both sides, so one line on
   one edge would be a limit visible on one side of the box and not the other. The format already
   holds a width cap the day it is wanted (`cap` is per rule, so per box and per axis, and the
   draft stores it the same way).
2. **The line count is the TOTAL the box holds at that limit**, not the extra the limit buys.
3. **"What else moves" stays its own section** rather than nesting inside the checklist group -
   the checklist has a measured rows-on-screen budget and a canvas-arming button inside a
   scrolling list of text boxes would push rows past the fold.
4. **A box with no ticked line gets no select** (the runtime grants it nothing), and a box that
   already carries an answer keeps its control.
5. **No persisted shape moved.** `svgStretch.shapeId` is now the box carrying the declared
   followers; every other box's answer rides `perPanel`, which existed already.
6. **One narrowing**: a plate whose only editable text is a replaced OUTLINE row has no heading
   in the Editable text list, so no select. It is still reachable by dragging the plate on the
   artwork, and the section summary names it when it grows, so the answer is never invisible.

## What is left

- **Rung 5** - the fit line under the Text box and the too-long tag - is the last of that
  document.
- **Outline rows have no box headings.** The narrowing above. Giving the Outlines section its own
  headings is the honest fix and belongs with rung 5.
- **The line count uses the BIGGEST type in the box.** On a box holding a 120 px clock over a
  24 px note it says "room for 1 line", which is true of the clock and understates the note.
  Conservative on purpose; worth re-reading if a reader finds it confusing.
- **Nothing here has been walked by the owner.** The queue item has the route.

## Traps that are in no repo file

- **A NUL byte in a source file makes git store the whole file as binary.** I built a memo key as
  `` `${id}\0${label}` `` with a real NUL; `git ls-files --eol` then reported `i/-text`, grep
  answered "Binary file matches" and the review's diff came out as 1819 added lines instead of
  343. Caught by the code review, fixed by using JSON for the key. `check:line-endings` does not
  catch it.
- **The wizard preview's `javascript_tool` DOM reads can lag the render.** While looking at the
  cap line I read `.wz-stage-overlay` children through the browser pane's JS door and got only
  the pick layer, on a page where the screenshot plainly showed the cap line and its chip. Trust
  the picture and the specs over a scripted DOM read in that pane.
- **`catalog-affected` and `e2e-affected` diff against the LOCAL `main`**, which the merge queue
  no longer moves, so both reported ~90 changed files for a 16-file branch. `review-request.mjs`
  is the one that takes the base from `origin/main`.

## Anything that needs the owner

Nothing blocking. The queue item is a `walk` with `because: taste`: whether the per-box select on
the heading row reads right, and whether the cap line's sentence is the one he would write.

## Pointers

- Design and its departures: `docs/TEXT_BOX_BINDING.md`, "Growth, per box" and the plan's rung 4.
- Surface: `src/components/wizard/import/MapSvgFieldsStep.tsx` (`modeOfBox`, `setBoxMode`,
  `capSentence`, the heading's select), `src/components/wizard/WizardPreview.tsx`
  (`PreviewGrowCap`, the line and its grab strip).
- Measurement: `src/components/wizard/import/stageMeasure.ts` (`growCapOf`, `capLines`,
  `capClamped`).
- Format and runtime: `src/templates/importedDesign/designTypes.ts` (`DesignSvgGrowth.cap`),
  `src/templates/importedDesign/svg.ts` (`svgCapMargin`, the emitter's `cap` row).
- Specs: `e2e/import-svg.spec.ts` - "two boxes in one graphic grow differently", "a growth limit
  stops at the frame and at the box", "one box can answer the too-long question on its own". The
  shared helpers (`boxGrow`, `boxGrows`, `boxGrowOf`, `growthNow`) live in `e2e/_svg-import.ts`.
