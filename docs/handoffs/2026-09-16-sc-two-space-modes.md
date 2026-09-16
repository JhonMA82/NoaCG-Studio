# SC - two Space modes

**Branch:** `claude/sc-two-space-modes`, queued 2026-09-16. Two commits.
**Pool:** fable high, inline. Nothing delegated to Codex.

## What landed

An operator setting with two Space modes on the playout dashboard, on all three surfaces: a
checkbox in the verb bar, **SPACE previews first**. Unticked is the toggle the dashboard has had
since 2026-08-06, unchanged and still the default. Ticked, walking the rundown previews nothing:
SPACE puts the selected cue on PREVIEW, SPACE again airs it, and SPACE on a cue that is on air
takes it off and leaves it on PREVIEW. The TAKE button wears the three faces the key runs, the new
one amber. The contract and the owner's words are `docs/PLAYOUT_DASHBOARD.md` §2f; the GOALS item
moved to the archive as shipped; the backlog file that held the ask is deleted; the owner-queue
route is `docs/acceptance/owner-queue/2026-09-16-sc-two-space-modes.md`.

## The model decision, and why

Three readings were open. His words are evidence of intent, not a specification, so each was
decided against the mechanism:

- **Space on a live cue takes it OFF in one press, in both modes, and lands it on PREVIEW.** The
  other reading of "like a cut button" (stage first, take off on the second press) was rejected
  because a hand that learned "SPACE takes a live cue off" in one mode must never find a second
  press between it and a clean screen in the other. A mixer's cut swaps both ways; his first two
  sentences make airing a separate press, so only the return half of the swap is his ask.
- **The editor follows the rundown selection on all three surfaces; only PREVIEW follows SPACE.**
  The exported controller has always edited the selection, and select, edit, SPACE to check,
  SPACE to air is the CG-system flow (SPX, Trio). The kicker reads SELECTED CUE while the cursor
  is ahead of the monitor. The overflow warning is shown only for the cue PREVIEW measured.
- **"On PREVIEW" is ONE cue on every surface, held synchronously.** The exported controller
  first read it off its per-graphic preview tally, which the 400 ms log poll writes; the owner's
  gesture is two presses in a row, and that read previewed twice and aired nothing. It now holds
  a `stagedId` the moment the preview rows go out, and in the new mode staging stops the other
  graphics on the preview stream so the stream shows what the React monitors show. In the
  default mode the stream keeps its accumulating behaviour, which SPACE never consults.

The setting is a device-level preference, `prefs.spaceMode` in `src/model/prefs.ts`, not on
`productionState.ts` as the prompt said: that file is the production's live tree, and the repo's
own `model/AGENTS.md` names prefs as the home. It is read when a page opens and deliberately not
followed live across tabs (a mode arriving from elsewhere would move PREVIEW under an operator).

## /check, honestly

`node scripts/review-request.mjs` scoped 16 files at merge base `6150d0ba`; I compared its list
against `git diff --name-only` plus the untracked files and it matched. Both skill invocations
returned fan-out shapes, so both legs ran inline. Then seven of the fanned-out angles reported to
the orchestrator and reached me through the branch relay; every entry was verified against the
code before acting.

- **review: inline**, 13 findings, 13 acted on. Mine: the controller's TAKE OFF title drifted from
  the React copy. From the relay: the hosted PREVIEW could show one name while a Take sent
  another, because the staged buffer is keyed by graphic (fixed: one effect drives the hosted
  stage from the previewed cue AND the values a Take would send right now, and stops a
  different graphic leaving PREVIEW); the controller's double-tap previewed twice (fixed:
  synchronous `stagedId`); ticking the box on the controller did not stage the selection while
  the React pages did (fixed); per-graphic versus global "on PREVIEW" (decided global, written
  into §2f, pinned cross-graphic on the controller); the cross-tab listener bypassed the
  re-seeding (removed, documented); the checkbox focus trap was patched in one place while every
  other checkbox on the surfaces still had it (fixed at the rule: `typingInto` no longer counts a
  checkbox, radio or button as typing, on both keymaps); wrong home for the preference (moved to
  prefs); em dashes in new comments and one skip reason (fixed); the em dash in the shipped
  controller title (fixed and committed).
- **simplify: inline**, 9 findings, 6 applied: the controller's three faces and the checkbox
  tooltip now come from `control/spaceMode.ts` (the faces as data, the decision as the table of
  its eight outcomes computed from the TypeScript function at generation time, because
  `check:preview-serialization` refuses a hand-interpolated function body and `src/control` may
  not import `composeDocument`); `takeFace` looked up once per render; the preview-template memo
  lost a pointless special case; the `stageCue` wrapper and the mode guard on take-off went
  (staging on take-off is unconditional, the id is never read in the default mode); one `kbd`
  chip rule for the whole bar; the empty-PREVIEW label as one constant. Declined, with reasons:
  a shared `useStagedPreview` hook and an outcome-shaped `spaceAction` (each page's outcome code
  is now six lines, and a hook over two pages whose stages are driven differently would hide
  more than it shares); moving the e2e rundown fixture into `_create.ts` (three near-copies
  exist, worth a tidy of its own); `useCallback` on `changeSpaceMode` (harmless).
- **verify: inline.** `npm run build` green three times on the final tree, read from its own
  exit code. No local e2e battery, per the row's trap; CI runs the specs. The in-app page was
  driven on this worktree's own dev server at 1536, 1200 and 390 wide before the relay fixes:
  the amber face, the empty PREVIEW after a reload, the stacked small print under 1366px and
  the phone bar hiding it were all looked at; the relay fixes changed no in-app pixel.
- **taste: not applicable** for graphics (nothing here moves what a graphic looks like). For the
  dashboard itself the owner-queue file asks the two taste questions the owner should answer.

## What is left, and why

- **The hosted page in the new mode has not been driven by a person.** It cannot mount offline;
  `e2e/configured/hosted-space-modes.spec.ts` walks it with a real backend in CI, and it is a
  NEW configured spec that has never run - if it is red, the assertion most likely to be wrong
  is the 30 s wait for the on-air tally to come back off the wire.
- **A cross-graphic walk of the React pages is not driven.** Pinned on the exported controller;
  holds by construction on the React pages (one staged id). The parity row says so.
- **The copy gate does not scan `src/control`**, where two operator surfaces are generated.
  Filed: `docs/backlog/copy-gate-does-not-scan-generated-operator-surfaces.md`. A gate lands
  alone, so this row did not widen it.
- **Mode B on the hosted page changed in one visible way**: the PREVIEW stage now shows the one
  cue the label names (a different graphic leaving PREVIEW is stopped) instead of stacking
  graphics as the cursor moves across them. Air is untouched. It is the documented model and
  what the in-app page always did; say if the stacking was wanted.

## Traps in no repo file

- The Browser pane's `key: "space"` and `type: " "` never produce a keydown with `key: ' '`;
  drive SPACE in that pane with a dispatched `KeyboardEvent`. Playwright's `press('Space')` is
  fine.
- `/check`'s two skills both fan out; their reports go to the launcher. Read the branch relay
  before believing the check is done.
- `git branch -m` took, but the worktree directory name still reads `agent-aad4120a64be97d37`;
  that is only the directory.

## Needs the owner

Nothing to decide before landing. Two taste questions are in the owner-queue file: whether the
amber → PREVIEW face reads as safe beside the red ⟳ TAKE, and whether the editor should wait for
SPACE rather than follow the cursor.

## Pointers

`src/control/spaceMode.ts` (decision, faces, words), `src/components/playoutKeys.ts`
(`takeFace`, `useSpaceMode`, `typingInto`), `src/components/SpaceModeToggle.tsx`,
`src/components/home/ProductionPage.tsx` (`stagedCueId`, `previewCue`, `onVerb`),
`src/components/HostedControlPage.tsx` (the one preview-stage effect above the loading returns),
`src/control/productionControllerHtml.ts` (`stagedId`, `SPACE_TABLE`, `takeTo`), `src/model/prefs.ts`.
Specs: `e2e/production-controls.spec.ts` (both modes in-app, the controller on the relay
including the double-tap and cross-graphic), `e2e/hosted-control.spec.ts` (the prefs contract),
`e2e/configured/hosted-space-modes.spec.ts`.
