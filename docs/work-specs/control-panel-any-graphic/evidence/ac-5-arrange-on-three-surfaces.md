# AC-5 - ARRANGE renders on all three dashboard deployments, and the generated panel returns on delete

**Verdict: pass, against the amended criterion.** First reviewed at
`dfac5b9cf230532565f57d6988517bb25cdbf94d` on 2026-09-16; **re-reviewed at `66b000808a1547695a6cc07ae5fc2ed1315713df` the same
day, when the third deployment stopped being an inference.**

The criterion was amended on 2026-09-15 (`3876df11`, pull request 277) to say that ARRANGE applies
to the ⚡ actions block and never to the cue editor's field bands. HE built the ⚡ half and refused
the field half in `docs/CONTROL_PANEL_ANY_GRAPHIC.md` §7b; the spec now says the same thing, so
this is judged against the text as it stands rather than against the sentence HE had to argue with.

## One rule, three readers

`arrangeFor` (`src/control/controlModel.ts:374`) applies the version gate itself and hands
`arrangeControls` (`:398`) the arrangement. Its three callers are the three deployments:
`ProductionPage.tsx:1744` (in-app), `HostedControlPage.tsx:837` (hosted), and
`hostedCombine.ts:176` plus the exporter's baked answer for the exported controller. There is one
bucketing loop rather than three restatements of it.

## What was observed

- **In-app, by hand.** The Controls panel opens as a collapsed `<details>` under the ⚡ block,
  headed "CONTROLS / as the graphic declared them", and its own copy explains the four verbs in the
  operator's words. For the votes board it listed the single control with its drag handle, ★ Pin
  and ● Shown; renaming is a text box placeholdered with the declared name.
- **Delete restores the generated panel.** Pressing "Delete profile" on the walk's production left
  `show.profile` null and the ⚡ block back to what the graphics declare, in one action.
- **The exported controller renders the same panel without a profile.** Two exported controllers
  for the same profile-less production - one built by this revision, one by the pre-chain revision
  `1fc7ffc6` - render identical text once the activity feed's clock is normalised: both 947
  characters, the same `PODIUMS` and `RESULT` sections, the same three ⚡ buttons in the same
  order, no "More" drawer. The measurement and its method are in
  `ac-10-nothing-a-downloaded-graphic-carries-changed.md`.
- Through the queue: `e2e/production-controls.spec.ts` (job `j-1137`) **22 passed**,
  `e2e/hosted-control.spec.ts` (`j-1138`) **12 passed**, `e2e/control-panel-types.spec.ts`
  (`j-1141`) **8 passed**, `e2e/exports.spec.ts` (`j-1140`) 15 passed and one load flake that
  passed alone on re-run (`j-1143`, 3.4 s). All exit 0.

## The third deployment, observed rather than inferred

The first reading of this criterion passed it with the hosted page's rendering recorded as
inference: the arrangement would travel, because the column returns it, but nobody had seen the
buttons. `e2e/configured/hosted-control-profile.spec.ts` now publishes a production whose ARRANGE
pins `plus2` and hides `newGame` under the name "Reset the board", opens the capability URL signed
out, and reads the block. In `configured-suite` run `35059312926` (43 passed, 0 skipped):

- `hosted-actions-pinned` holds exactly one button, `⚡ +1`, above the section headings;
- the "Panelist 2" section is left holding only its `⚡ −1`, which is what pinning MEANS rather
  than a copy of the button in two places;
- `hosted-actions-more` reads `More (1)` and opens on `⚡ Reset the board` - the production's word
  on the machine's own control - and that button is ENABLED, so a hidden control is still declared
  and still guarded rather than decorative.

Step 9 of the live-verify checklist in `docs/CONTROL_LAYER.md` is therefore walked, by a spec, on
every run of that suite.

## Limitations

- **Nobody has LOOKED at it.** "Above the fold" is a claim about a phone screen; what is asserted
  is that the pinned block precedes the sections in the document. The owner-queue item
  `2026-09-16-a-profile-driven-where-the-show-is-run.md` is the route for the eye that can judge
  the rest.
- **Delete-and-republish was not re-walked on the hosted page.** The delete is one action and its
  in-app effect is observed above; that the hosted page then renders the generated panel follows
  from the same `arrangeFor` gate the three deployments share, and from the offline case that
  passes a null profile through it.
- **`hidden` is a collapsed "More", not absence.** HE's call, made against the format's own first
  wording, for the phone-operated surface. If the owner meant gone, the change is three
  `more.length > 0` blocks. Recorded here because the criterion's word is "hidden" and the product's
  behaviour is a drawer.
- The Controls panel does not author SECTIONS, deliberately. The format allows it.
