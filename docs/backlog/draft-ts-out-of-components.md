# CLOSED, REFUSED: moving the wizard's import draft out of `components/`

**Filed:** 2026-08-28. **Closed:** 2026-09-16 on `claude/qc-mapping-step-out-of-components`, by
measuring what the move would cost. **Source:** weekly quality review (measurement).

## The verdict

**Do not move `src/components/wizard/import/draft.ts` (or `fieldAutoMap.ts`, or the measurement
layer beside them) out of `components/`.** The item asked for it on the strength of one sentence
in `docs/ARCHITECTURE.md` §5 - "Logic files without JSX do not live under `components/`" - and
never priced the move. Priced, it loses on three counts, every one re-derivable:

1. **It widens the affected-spec plan by ~4x, for the file that is edited most.**
   `scripts/e2e-affected.mjs` unions its rules rather than taking the first match, so a file's
   plan is as wide as the widest rule it matches. Ask the tool
   (`node -e "console.log(require('./scripts/e2e-affected.mjs').planFor(['<path>']).specs.length)"`):
   **13** specs where the file is, **48** under `templates/importedDesign/`, **15** under
   `blocks/`. The `templates/` destination this item implied would undo the narrowing wizard row 2
   was built for ("38 specs down to 13", commit `79566d3c`). Merge latency is the owner's stated
   bottleneck; this item would have added to it while claiming to reduce debt. `blocks/` is cheap
   on this count and loses on the next two - plus a third: the four `with*(template, draft)` passes
   take a draft type, and `blocks/` may not import `components/`, so the move would not compile
   without taking `WizardDraft` with it.
2. **Two compiled invariants would stop loading for the code they govern.**
   `contracts/rules/wizard/let-geometry-propose-followers-author-edit.md` (which names
   `proposeFollowers` by symbol) and `keep-prepare-erase-offer-never-applied.md` (which governs
   what `withEraseSeedFields` does) both carry `scope: src/components/wizard/import/**`. A file
   outside that scope loads `src/templates/AGENTS.md` instead - the chain that calls itself the
   tightest in the repo.
3. **The area contract already answered it.** `wizard/keep-whole-import-graphic-capability-inside`
   names the draft slice as part of the capability, and `.dependency-cruiser.cjs`
   (`wizard-import-through-its-index`) enforces its single door. This item read §5 without
   reading that.

The verdict now lives in `docs/ARCHITECTURE.md` §5, beside the rule, which is where the next
person meets the question. **This file stays only because
`docs/backlog/architecture-debt-rows-are-unverifiable.md` cites it.**

## What was done instead, and what it fixed

The real complaint under the item was that the boundary was wide, not that the code was in the
wrong folder. That was fixed on the same branch:

- `WizardDraft` no longer declares thirteen fields whose types the import capability defines.
  `SvgImportDraft` declares them once, beside those types, and `WizardDraft extends` it.
- The nine functions `draft/core.ts` imported across the boundary are now two - `svgDesignOptions`
  and `withSvgImportPasses` - and the eight that were public only to cross it are module-private.
  The import list in `core.ts` went from eighteen names to three, and the file from 453 lines
  to 352.
- The knowledge that lived on the CALLING side came with them: the `designSvg` option literal
  (which decided field NUMBERING in the file that knows least about it) and the order of the four
  template passes (which each number their fields after the last).

**The first of the item's two findings is therefore done.** Its eight helpers collapsed exactly
as it predicted.

## The second finding outlived it, and is bigger than it was described

The item said `pickersOf`, `withFill` and `clearFill` in `fieldAutoMap.ts` "walk the same five
draft shapes that `proposeSvgBehaviour` walks", calling it two copies of one walk. Re-measured on
2026-09-16:

- **Half of it is already fixed.** Those three functions share one walk, `mapBoxes`
  (`fieldAutoMap.ts:531`). A later branch did that.
- **The rest is worse than stated.** Each behaviour role is spelled in FOUR places, not two:
  `templates/behaviours/<recipe>.ts` declares it as registry data (`{ look: 'answer.selected',
  rows: 'answer', … }`, `quiz.ts:98`); `proposeSvgBehaviour` (`import/draft.ts:1195`) reads the
  proposal into the draft by hand; `mapBoxes` visits the box by hand; and `MapSvgFieldsStep`
  renders its picker by hand. Reproduce with
  `grep -rn "'answer.selected'\|'team.flash'\|'badge'" src/components/wizard/import src/templates/behaviours`.
- **The registry is already the table the other three restate.** The generic `recipe` draft shape
  reads it; the four legacy shapes (quiz, score, poll, timer - the set the step names as
  `LEGACY_RECIPES`) do not. The fix is to collapse those four onto the generic shape, which is a
  persisted-format change to `DesignSvgBehaviour` and wants its own row and its own migration.

Filed on its own as `docs/backlog/one-role-vocabulary-for-the-five-behaviour-shapes.md`.
