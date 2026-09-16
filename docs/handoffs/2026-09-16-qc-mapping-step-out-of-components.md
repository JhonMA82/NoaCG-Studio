# The SVG mapping step is four files, and the move out of `components/` was refused

`src/components/wizard/import/MapSvgFieldsStep.tsx` went from **3,827 lines to 1,750**. Its
no-JSX measurement layer and two of the sections it renders are now their own files, and the
boundary between the Import-graphic capability and the shared wizard draft went from eighteen
crossing names to three.

**The row's other instruction - move the no-JSX logic out of `components/` - was refused on
measurement.** That is the one decision here somebody may want to revisit, so it is first.

## The refusal, and why

The row said to move `import/draft.ts` and the step's no-JSX helpers below `components/`, per
`docs/ARCHITECTURE.md` §5 ("Logic files without JSX do not live under `components/`"). I planned
that move, then priced it with the repo's own tools and abandoned it. Three reasons, each
re-derivable:

1. **It widens the affected-spec plan ~4x for the most-churned file in the wizard.**
   `scripts/e2e-affected.mjs` unions its rules, so a file's plan is as wide as the widest rule it
   matches. `planFor` returns **13** specs where these files are, **48** under
   `templates/importedDesign/`, **15** under `blocks/`. Merge latency is the stated bottleneck
   this row exists to relieve; the `templates/` move would have made it worse for exactly the file
   in question, undoing the narrowing wizard row 2 was built for (38 down to 13).
2. **Two compiled invariants would stop loading for the code they govern.**
   `wizard/let-geometry-propose-followers-author-edit` (which names `proposeFollowers`) and
   `wizard/keep-prepare-erase-offer-never-applied` both carry
   `scope: src/components/wizard/import/**`.
3. **`blocks/` fails a third way**: the four `with*(template, draft)` passes take a draft type,
   and `blocks/` may not import `components/` (§3 invariant 4), so it would not compile without
   dragging `WizardDraft` down too.

I reached this by a blocking consult after planning the opposite, then verified its two decisive
claims myself rather than taking them - the `planFor` numbers and the `scope:` lines are the
evidence above. The verdict, its numbers and the command that reproduces them are recorded in
`docs/ARCHITECTURE.md` §5, beside the rule, where the next person meets the question.

**The row's step 7 said to DELETE §5's draft rows. I did not**, because deleting them presumed the
move. The `components/wizard/draft/` row is still true and still open, so it stands; §5 gained the
import capability's exception beneath it. Row QI's counting rule and greps, re-recorded earlier
today, are untouched.

## What changed

**The boundary (commit `7105b13c`).** `WizardDraft` declared thirteen fields whose types the
import capability defines; `SvgImportDraft` now declares them beside those types and `WizardDraft
extends` it. The nine functions `draft/core.ts` imported across the boundary became two -
`svgDesignOptions` and `withSvgImportPasses` - and the eight that were public only to cross it
are module-private. The knowledge that lived on the CALLING side came with them: the `designSvg`
option literal (which decided field NUMBERING in the file that knows least about it) and the
order of the four template passes (each numbers its fields after the last). `core.ts`: 453 → 352
lines, eighteen imported names → three.

**The measurement layer (commit `74664002`).** 763 lines that never rendered anything moved to
`import/stageMeasure.ts`. Nine of its 27 declarations are now module-private. They are mirrors of
runtime rules that live as untyped JavaScript inside an emitted string in
`templates/importedDesign/svg.ts` - `lineSitsIn` mirrors `svgLinesInside`, `boxFitOf` mirrors
`svgAlignOf` plus `measureSvgRoom` - so the two halves cannot share code and a reviewer holding
both is the only defence against drift. One file is what makes that possible.

**The sections (commit `d7454641`).** `BehaviourSection.tsx` (1,225 lines) holds the five recipe
shapes, the fill-them-in guess and its Undo, and the switches and choices. `FontsSection.tsx`
(202) holds the typeface rows and all four pieces of state behind them. The cut ran along a seam
that already existed: every hook sits above the step's `if (!svg) return null`, and everything
below is derivation, handlers and JSX.

**The docs (commits `125bc694`, `a88cc8c4`).** §5's exception; `draft-ts-out-of-components.md`
rewritten as the closed record of the refusal; `split-map-svg-fields-step.md` updated;
`one-role-vocabulary-for-the-five-behaviour-shapes.md` filed new (below).

## Two things measurement corrected, that the shelf had wrong

- **`proposeBannerGrowth` and `proposeFollowers` are not "the pure proposal functions"** the
  backlog calls them, and the row repeated. Both take `stage: HTMLElement` and read
  `getBoundingClientRect` / `getComputedStyle`; so does every other helper in those 913 lines.
  They are one DOM-measurement layer, which is why they went to `stageMeasure.ts` together
  instead of beside the transform layer.
- **The `fieldAutoMap` duplication finding was half stale and half much bigger.** `pickersOf`,
  `withFill` and `clearFill` already share one walk (`mapBoxes`), so that half is done. The rest
  is four copies, not two: each behaviour role is spelled in `templates/behaviours/<recipe>.ts`
  (as registry DATA), in `proposeSvgBehaviour`, in `mapBoxes`, and in the picker JSX. **The
  registry is already the table the other three restate by hand.** The fix is to collapse the four
  legacy behaviour shapes onto the generic one that reads it - a persisted-format change to
  `DesignSvgBehaviour` needing a version bump and a migrate-on-read, so it is its own row:
  `docs/backlog/one-role-vocabulary-for-the-five-behaviour-shapes.md`.

## Verification

- `npm run build`, read from its own exit code (`npm run build > log 2>&1; echo $?`): **exit 0**
  on the final tree.
- **`npm run test:e2e:integration`, not `--affected`** (j-1158): the branch took `main` in, so the
  affected base would be `main` itself and everything main brought would go unchecked. The
  integration plan from the fork point `16ed46e9` is 39 specs. **498 passed, 0 failed, 0 flaky,
  11.3m.**

  **Read the job list, not the job's verdict.** `scripts/jobs.mjs` marks j-1158 `failed`, and it is
  not a test failure: its record carries `"exitCode": null` with `"reapedAsDead": true`, so the
  runner lost the process rather than the run failing. The log's last line is playwright's own
  `498 passed (11.3m)` summary, which only prints on a completed run, and the only line in 569
  matching `failed|✘` is a TEST NAME ("the raw one-shot never claims the checks it did not run").
  Worth knowing about the runner; it is not this branch's.
- The three specs the row named ran twice: once on the split (**143 passed**), and again after
  taking `main` in (**143 passed**, j-1156) - the first run straddled the merge, so it was redone
  rather than reported.
- No `eslint-disable` was added; the folder still carries none.
- **No `docs/acceptance/owner-queue/` item**, deliberately: nothing here is observable in the
  product. The whole point of the branch is that the mapping step does exactly what it did, and
  the sweep table and the 498 specs are the evidence for that claim rather than for a new one.

## Check

- `review: delegated` (2 findings, 2 fixed). Scope verified: the pass reported merge base
  `0a5e3990` and a file list matching `git diff --name-only $(git merge-base origin/main HEAD)..HEAD`
  plus `git status --porcelain` exactly - 11 files, no mismatch. **Both findings were against this
  branch's own documentation and both were load-bearing**, which is the argument for running the
  leg on a refactor that changed no behaviour: §5 claimed the module "exports exactly two
  functions to the rest of the wizard" when it is six (CreationWizard reads `proposeSvgBehaviour`,
  `proposeSvgExtras` and `armTimerClock`; FinishStep reads `behaviourSummary`), so the paragraph's
  own re-open trigger was met the day it was written; and the split item claimed "no hook moved",
  which was its stated safety argument and was false - seven hooks moved. Both are now corrected
  and carry the command that counts them. I verified each finding against the code before fixing.
- `simplify: inline`. The skill returned its four-agent fan-out instructions, which per the check
  workflow means the pass did not run. Done by hand over the four angles: no orphan or
  over-exported declarations in any of the four files; the `pollDrivenLayers` call was hoisted out
  of a per-element `.filter` callback when the option literal moved; one fix applied - the
  behaviour section's `artworkInk` prop was typed by argument position off `fillGap`
  (`Parameters<typeof fillGap>[5]`) and now uses the exported `FillBox`. **One reported, not
  fixed:** `FontsSection`'s `nearestWeight` is the same shape as `defaultWeight`
  (`src/model/googleFonts.ts:86`), which hard-codes 400 where mine takes a target. Unifying them
  means editing `googleFonts.ts`, which is outside this diff, so it stays a report.
- `verify: inline`.
- **`taste: answered`.** This touches the SVG import road, so it needed looking at rather than a
  green build. `node scripts/svg-import-sweep.mjs --shots <dir>` (j-1162) walked all 47 corpus
  fixtures through the real Import door in the app and wrote 45 frames; I opened six spanning the
  shapes the moved code decides - a Figma nested-frame quiz board, a gradient-shadow lower third,
  a duplicate-ids scorebug, an outlined-text title card, an offset-centred endboard and the
  owner's own rotated quiz board.

  **The decisive answer is the verdict table, not my eye: 47 fixtures, 42 pass, 5 partial, 0 fail,
  and the five notes are exactly findings 1 and 5 of `docs/backlog/svg-import-sweep-findings.md`**
  - which is what that file says a re-run should leave. Nothing new appeared. The sweep's first
  line confirms it drove this worktree's own server (`http://localhost:5264`,
  `agent-af8e3646ecfc73110`), so it measured this branch's build and not a sibling checkout's -
  the mistake that made the 2026-08-29 sweep a before-baseline rather than an after.

  Axes 1-5 pass on every frame I opened: hierarchy holds (the lower third's name largest, role
  and show below it), text sits on its plates including the rotated board where each answer plate
  carries its own angle, nothing is clipped, and the palettes are the source files' own.

  **Two NOs, both pre-existing and both already filed:**
  - **T4 grows as implied** - five fixtures default to `grow-xy` where their sidecar expects
    `shrink`. That is finding 5, "the growth default reads banner on shapes that are not banners",
    open since 2026-08-29.
  - **T1 centred** - `figma-offset-centred-endboard` renders its two lines centred on each other
    but left of their plate's centre. That is the fixture built for exactly that case and it
    passes its own expectation: the block sits outside `SVG_ALIGN_TOL`, so the runtime treats it
    as drawn-position, which is the documented rule and the import road's fidelity promise.

  Neither is introduced here, and the evidence for that is the table above plus
  `import-svg-corpus.spec.ts` passing in j-1158 - it is the gate that pins these fixtures' answers.
- Stamp: written after the check, before queueing.

## Left deliberately

Three sections stayed in the step, and none is urgent now that it is a third of its old size:
the field-row checklist (~325 JSX lines), the stretch and growth section (~300) and the images and
outlines pair (~115). The first two read the same measurements as each other - `panelIds`,
`boxLooks`, `fieldGroups`, `proposed`, `perPanelRows` - so extracting either means passing most of
the step's state back down. Worth doing when one of those measurements next changes.
`docs/backlog/split-map-svg-fields-step.md` records this with the reasoning.

`scripts/copy-baseline.json` moved three user-facing strings between files and nothing else: the
step's em-dash row went 6 → 3 and the two new files take the 3, so the repo-wide total is
unchanged at 5530. The strings themselves are untouched on purpose - rewording user-facing copy
inside a refactor would make the other commits false where they say the code moves verbatim. If
those select-option placeholders should lose their em dashes, that is a copy decision and its own
row.
