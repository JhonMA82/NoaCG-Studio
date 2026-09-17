# ARRANGE renders on three surfaces; COMBINE is untouched

AC-5's presentation half holds. One function (`controlModel.ts` `arrangeControls`) answers order,
shown name, pinned and hidden for the in-app production page, the hosted control page and the
exported production controller, and a Controls panel authors it.

**Landed:** `7cc81897` (the rule, the three surfaces, the panel, migration 0059, the specs, the
docs, the owner-queue item), `92a819c5` (the seven check findings). Check stamp:
`claude-he-arrange-three-surfaces.json`, PASS at `92a819c5`. Owner-queue item:
`docs/acceptance/owner-queue/2026-09-15-arrange-the-controls.md`.

check: `review: delegated 7/7` (scope confirmed: 21 files, base `f6bb663e`, identical to
`review-request.mjs`), `simplify: inline` (the skill returned fan-out instructions, not a result),
`verify: inline`, `taste: not applicable` - nothing here can move what a graphic looks like; the
DASHBOARD was looked at, and the two things that came of that are below.

## The decisions worth arguing with, so they can be reverted rather than rediscovered

- **`hidden` renders as a collapsed "More", not as absence.** The format's own word was "out of
  the panel entirely" and the row said "under a collapsed More"; I built the drawer and corrected
  the format's comment to match. The reason is the hosted page: it is operated from a phone, away
  from the laptop that authored the show, and a control the production tucked away that the
  operator turns out to need should be one tap rather than a trip back to the app. The machine
  still accepts the event either way, so nothing about legality changes. If the owner wants
  hidden to mean gone, the change is three `more.length > 0` blocks.
- **ARRANGE does NOT reach the cue editor's field bands, and AC-5's text says it should.** The
  format is keyed by control id and has no vocabulary for a field at all, so honouring that
  sentence would mean inventing a third primitive against `docs/PLAYOUT_DASHBOARD.md` §2e and the
  owner's 2026-08-21 rule. I built the ⚡ half and wrote the refusal into §7b where it can be
  argued with. **AC-5 is therefore held with that scope note, not fully.**
- **The exported controller READS a baked arrangement rather than inlining the rule**, which is
  the opposite of how it treats `eventPayload` and the row's instruction. A payload reads live
  field values at press time and must be a rule the page runs; an arrangement is authored state
  fixed when the zip is written. One fewer restated rule, and `controlSections` could then be
  deleted outright - the standalone panel renders from the same baked answer, so there is now one
  bucketing loop in the codebase instead of three.
- **The Controls panel does not author SECTIONS.** The format allows it; drag order already moves
  a control past a heading, and a production renaming another author's sections is how two
  vocabularies start. Rename is in, so the row's "may leave rename to HF" escape was not needed:
  **the panel shipped with drag order, hide, rename, pin and delete.**
- **The panel is a collapsed `<details>` under the ⚡ block.** That column is an operating surface,
  and a drag-to-reorder list sitting open during a programme is a hand's width from the controls
  that go to air.

## Evidence and traps that exist in no repo file

- **0058's central claim is wrong, and so is HD's handoff on the same point.** Both say a
  `RETURNS TABLE` widening must wait because `npm run db:push` refuses its drop-and-create without
  `--allow`. `scripts/db-push.mjs` `createdObjects` collects every `create function`, and the drop
  rule clears anything in that set - which is why 0031 applied this exact drop-and-create on this
  exact function unattended. Measured: `classifyMigration` on 0059 reports 4 statements, no
  findings. **0059 needs no `--allow` and no owner action**, and the row's instruction to file one
  was dropped. 0058 stays as applied; the correction is in 0059's header and recorded as
  `contracts/rules/supabase/widen-returns-table-function-migration-needs.md`.
- **The version gate was skipped on two of the three surfaces and nothing could have caught it.**
  The in-app page and the exporter read `show.profile.arrange` directly while the hosted page went
  through `readPublishedProfile`, so a v2 profile - read-only at both write doors - still ordered
  and hid buttons on two surfaces and not the third. `arrangeFor` now applies the gate itself, so
  the mistake is no longer available to a fourth caller. This is the shape to watch for when
  COMBINE arrives: every read of a versioned record needs the gate at the READER, not at the call
  site.
- **A trim-on-change rename box refuses the space bar.** The first cut committed the typed name on
  every keystroke; the trim took the trailing space off, the controlled value came back without
  it, and "Stop the clock" could not be typed at all. It commits on blur and on Enter now. Escape
  is deliberately not bound: abandoning a draft races the draft's own state update and would
  commit the text it promised to drop.
- **The Browser pane's `key Return` does not reach React as `e.key === 'Enter'`.** Ten minutes went
  into a rename that looked uncommitted in the product and was fine; clicking another field
  committed it, and Playwright's `press('Enter')` exercises the same path in the spec. Do not
  conclude a keyboard handler is broken from that tool alone.
- **`e2e-affected` escalates this branch to the FULL suite plus the catalog** (25 changed files,
  core/unmapped). That goes to CI per `root/let-pre-merge-gate-laptop-does`; locally I ran the
  eight specs that cover every surface this touched - `production-controls`, `hosted-control`,
  `control`, `exports`, `shows`, `local-relay`, `lite-parity`, `production-persistence` - as
  `j-1110`, 86 passed, exit 0, and re-ran the two that changed afterwards as `j-1111`, 32 passed,
  exit 0.
- **`node scripts/jobs.mjs add` takes the command FIRST and `--cost` after it.** The row prompt
  said the opposite again; HD's handoff and the usage line in `jobs.mjs` are right. This is the
  third handoff to say so - it belongs in the prompt template, not in another handoff.

## What needs the owner

Nothing blocking. One thing to look at, and it is the owner-queue item's route: whether a hidden
control behind "More" is what he meant by hiding, and whether he wants a production to be able to
order its own FIELDS as well as its controls. Both are one-sentence answers.

## What is left

- **COMBINE (AC-6) is not started.** The profile's other half - one button, ordered steps, `after`
  and `ask` - is a row of its own. `model/profile.ts` already parses, validates and canonicalises
  it, and `withGraphicArrange` deliberately leaves `combine` untouched, so that row starts from a
  format that is ready and an authoring panel it can extend.
- **The hosted page's DOM is not in the offline suite.** Mounting it needs a configured backend.
  The rule and its inputs are pinned in `e2e/hosted-control.spec.ts`; the buttons themselves are
  step 9 of the live-verify checklist in `docs/CONTROL_LAYER.md`, added by this row. Worth walking
  before 2026-10-20, because that is the surface the show is operated from.
- **`bindings` still names its column unconditionally in `publishControlShow`.** HD found it and
  left it as outside that diff; it is outside this one too, and it is still one unmigrated
  instance away from taking every publish down.
