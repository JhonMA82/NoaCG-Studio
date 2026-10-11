# Candidate inventory (AC-7 input)

Mechanical inventory of all 293 spec files at f2eee85cf by tier, then the deep reviews of the top
twenty opportunities. Minutes are from `scripts/e2e-durations.json` (recorded from run 38144735534);
runtime test counts are from that run's shard logs; "selection share" is how often the planner
selected the spec over the last 150 landings (`scripts/replay-selection.mjs`); "class" is (i) pure
logic through browser imports, (ii) needs browser APIs or layout but not the app journey, (iii) a
real journey. Classes are judgement calls from the metrics plus sampled test bodies.

## Inventory by tier

| Tier | Files | Static tests | Runtime tests | Minutes | Notes |
|---|---|---|---|---|---|
| Offline `e2e/*.spec.ts` | 233 | 2,035 (2,228 with loops) | 2,241 = 1,699 passed + 542 skipped | 169.4 | 40 files skip every test (old editor); 12 never selected in 150 landings; 19 drive no UI (12.6 min) |
| Configured `e2e/configured/` | 53 | 103 | >= 96 (floor) | not in the table; 24-28 min wall per run incl. `supabase start` | 2 quarantined; tripled since 08-24 |
| Catalog `e2e/catalog/` | 7 | 8 (>= 32 with loops) | 61 | 4.5 min per run | runs on every full main run today |
| Node `scripts/**/*.test.mjs` | 209 | 2,652 | 2,694 | build gate | 62 files import `src` (655 cases of product logic) |
| Node elsewhere | 51 | 678 | ~650 | build / cli / plugin jobs | companion-module (2 files) runs in no workflow |

Families (offline): editor-* 30 files 45.7 min (28 landed since 09-20); playout-* 11 files 18.0;
import-svg* 6 files 15.7 (55 skipped tests); wizard-* 10 files 10.1; production(s)-* 10 files 9.7;
import-* 6 files 4.6 (46 skipped); bridge-* 4.0; video-* 4.0; lite-* 3.7; quiz-* 3.6; ograf-* 3.3.

Distribution: median spec 0.33 min, p90 2.0, max 7.16; the top 10 specs carry 25% of the minutes,
the top 30 half. Per-test timeouts are raised in 70 files (up to 360 s).

Shared helpers (importers): `_create` 109, `_durable` 82, `_browse` 39, `_preview` 38,
`_svg-import` 20, `_evaluate` 19, `_keys` 19. Any `e2e/_*` edit runs the full suite.

Broadest headers (repository files matched): import-svg-behaviour 1,022, student-rehearsal 887,
import-svg-corpus 879, creative-routing 847, productions 832, ai-retrieval / lite-* 831, import-svg
807, library / ux / wizard-kit 793. 58 headers declare `src/templates/**`, 40 the wizard directory,
27 `editorFoundation/**`.

## Signals used, and what they do not prove

Selection share and traced overlap find candidates; executing the same source files does not prove
the same behaviour. Test counts and skip counts are warning signals. Every action below names the
behaviours that must stay protected and the evidence that validates the action (the graded rule in
`spec.md`: a replacement fails on the original defect or an injected fault and passes after it; a
consolidation demonstrates retained protection; a retirement names a replacement or a retired
surface).

## The top twenty

### 1. editor-proposal-task and editor-command-task (7.44 min, 6 runtime tests, selected 11-19%)
- Protects: reviewed AI proposals versus direct authoring, then reopen and three exports (proposal);
  the shared command handler's parity with UI editing (command). Both walk the wizard, run two
  modes in fresh contexts at three viewports, `test.setTimeout(360_000)`; they differ by 34 lines.
- Environment: real `/app` journey plus exports in new pages; own browser context (untraced).
- Overlap: editor-model-proposals (22 tests, 1.23 min) and editor-commands (6 tests, 0.35 min) are
  the focused counterparts; 26 other specs cover every file they cover.
- Origin: #835, #825 (10-08), the editor plan's reference-task pattern made permanent.
- Action: COMBINE into one scheduled qualification walk (one file, two modes, three viewports) run
  at the full validation; REMAINS pre-merge: the two focused specs plus one short journey
  (proposal applied -> save -> reopen -> one export) added to editor-model-proposals.
- Validation: inject a fault in `commandAdapter.ts` apply path and in the proposal normaliser; the
  focused specs must fail; the walk's assertions that are not in the focused specs are listed in
  the maintenance entry. Saving: 7.4 min off the full run and off 11-19% of gate plans; 360-s tails
  out of the cap.

### 2. editor-drawing-task (1.67) with editor-drawing-persistence (1.19)
- Protects: the cumulative drawing authoring task; persistence of drawings across save/reopen.
- Action: the task walk MOVES to the scheduled walk of item 1; persistence REMAINS pre-merge.
- Validation: fault in the pen persistence path fails the persistence spec.

### 3. editor-transform-qualification (0.70) and editor-layer-property-qualification (0.97)
- Protects: the production transform/save/reopen receipt (transform); bounded layer and property
  edits at 125% zoom (layer-property).
- Action: assessed individually. The one production receipt test REMAINS pre-merge (moved into
  editor-canvas-transforms, 1.29 min); the comparison-style cases MOVE to the scheduled walk.
- Validation: the receipt test fails on a fault in the transform save path.

### 4. editor-groups (2.73) and editor-arrangement (2.11)
- Protects: group/ungroup keeping child pose, ids and fields with one undo step; align, distribute,
  keyboard nudge and resize through rendered bounds.
- Evidence of duplication: same `open/create/select/rects/undo` preamble, 99.7% traced overlap; the
  arrangement "baseline probe" test has zero assertions; `scripts/editor-arrangement.test.mjs`
  already tests `arrangementGeometry.ts` in Node (5 tests); no Node test for `blocks/editorGroups.ts`.
- Action: COMBINE the preamble into one helper; MOVE the geometry cases (align, distribute, nudge
  arithmetic, group bounds) to the Node tests; REMAINS: one journey per button (group, ungroup,
  align, distribute, nudge, undo/redo) asserting rendered bounds; RETIRE the zero-assertion probe.
- Validation: mutate `arrangementGeometry.ts` and `editorGroups.ts`; Node tests fail; the journeys
  still pass on the unmutated tree. Estimated saving 2-3 min of the full run.

### 5. playout-folders (7.16, 51 tests, selected 31%)
- Protects: the rundown's folders (range select, header rows, collapse, menus, drag by thirds,
  refused drops, arrow keys, failed writes) and the air half (One by one, Play through, Loop, All
  together) against a faked Bridge. Every test seeds graphics, cues and folders through the record
  writers and boots `/app`.
- Action: PROFILE first (step timings per test: boot, seed, interaction). If seeding and boot are
  over half, seed once per describe with a pre-serialised durable store via `addInitScript` while
  keeping one context per test; keep all 51 behaviours.
- Validation: unchanged assertions; the storage-failure and persistence cases keep their isolated
  seeds. Estimated saving 2-3 min (unmeasured).

### 6. import-svg (5.07, 101 tests, 47 skipped)
- Protects: the import door and field mapping. 47 legacy tests walk the door, then skip at the
  retired helper, costing 2.6 min per run before the skip.
- Action: finish issue #800 for this file first: map each skipped test to a current behaviour
  (library, export, new editor) or mark it obsolete (an old-editor panel); rewrite the former at
  the cheapest layer (mapping logic in the blank-page tier), RETIRE the latter with a note.
- Validation: each restored behaviour gets a mutation twin; saving 2.6 min of waste, plus restored
  coverage counted against the budget.

### 7. import-svg-corpus (5.84, 24 tests, one 214-s sweep, selected 31%)
- Protects: six exporter idioms (Illustrator, Figma, Inkscape, Affinity) each pinning an answer the
  importer got wrong, swept through the wizard; growth, pictures and caps in one walk.
- Action: SPLIT: the per-file mapping answers MOVE to a browser-integration spec that calls
  `svgImport.ts` in a blank page (no `/app`), one case per corpus file; one journey REMAINS (one
  file through the door into a production). Keep every fixture and expectation sidecar.
- Validation: replay the historical defects the README lists against the new spec (each sidecar is
  a recorded defect); the journey covers the door. Estimated saving 3 min pre-merge.

### 8. import-svg-behaviour (4.43, 38 tests, header matches 1,022 files)
- Protects: imported behaviours and operator controls on real exporter artwork.
- Action: REMAINS; NARROW the header to the files it reads (its covers lists `src/templates/**` and
  the whole wizard); assess its four legacy export cases under #800.
- Validation: landing replay shows the selection share after narrowing; the traced map confirms
  executed files.

### 9. bridge-connect (4.01, 45 tests, +2.1 min since 09-26)
- Protects: pairing, persistence, diagnostics and production states against a network fake; some
  waits represent delayed replies.
- Action: REMAINS; replace real waits with Playwright's clock where the wait is a timer, keep the
  observation window where it is a real network delay; find what doubled since 09-26.
- Validation: unchanged assertions; the delayed-reply tests must still fail when the retry logic is
  removed. Estimated saving 1-2 min.

### 10. creative-pilot (2.00, 30 tests, class i)
- Protects: Creative Mode's deterministic compile, style gate, diversity measure, knowledge-card
  selection and anti-anchoring rule, each with a mutation twin, no model calls.
- Action: MOVE to a Node test under `scripts/` importing `src/ai` (the lane 62 tests already use);
  if a DOM is needed for the compile, the blank-page tier.
- Validation: the mutation twins carry over unchanged. Saving 2.0 min of the full run; covers
  `src/ai/**` so also off every AI change's plan.

### 11. lite-field-paint, lite-line-content, lite-line-fit, lite-parity, lite-type-floor (3.69, class ii)
- Protects: every Lite field reaches the screen (multi-state), line content and fit, parity with
  the full pipeline, the type floor. Each boots `/app` in `beforeEach`.
- Action: MOVE to a blank-page tier (bundle the pipeline the way `check-catalog-emit` does); the
  measurements need a rendering frame, not the app shell.
- Validation: the existing mutation halves (a template whose field cannot paint) must still fail.
  Estimated saving 1-2 min.

### 12. bench (2.39, 24 tests, class ii, +1.4 since 09-26)
- Protects: the runtime bench's detection fixtures and design adjustments.
- Action: MOVE to the blank-page tier (its `toApp` is only a boot to get a page); find the drift.
- Validation: fixtures trip the same rules. Saving about 1 min.

### 13. svg-examples (2.09, one 360-s test)
- Protects: the seven tutorial examples import, are recognised and run as a show in one production.
- Action: MOVE to the scheduled validation walk; REMAINS pre-merge: downloads.spec (zip contents)
  and the corpus spec's exporter coverage.
- Validation: the walk runs at every full validation (landing list attached). Saving 2.1 min.

### 14. quiz-live-consistency (2.01, 18 runtime tests looping 15 catalog quizzes plus the docs quiz)
- Protects: Reveal carries the corrected key, both answer models, the fast road for clock-free
  events, on every board.
- Action: SPLIT: two representative boards (one per answer model) plus the docs quiz REMAIN
  pre-merge; the full loop MOVES to the scheduled validation.
- Validation: the 2026-09-22 defect (key corrected on air not reaching Reveal) replays on the
  representative boards. Saving 1.5 min.

### 15. The 40 fully skipped files and 543 skipped tests (issue #800)
- Protects (nominally): imports, wizard, productions, exports, and old-editor panels.
- Action: a mapping pass per file: obsolete requirement (the old editor's dock, canvas, timeline,
  code pane, Inspector, machine graph: canvas-*, timeline-v2, machine-graph, inspector, text-tools,
  pasteboard, keyboard, multi-select, wysiwyg, inline-edit, legacy-timeline, machine-edit,
  wave2) RETIRES with a line in the maintenance ledger; behaviour still in the product is
  rewritten at the cheapest layer, counted against the budget as new minutes.
- Validation: each rewritten behaviour gets a mutation twin; the owner sees the obsolete list once.

### 16. Catalog-enumerating headers (58 specs declare `src/templates/**`; a one-template addition plans 59 specs / 51.6 min plus the catalog gate; with registration 132 specs / 124.6)
- Action: NARROW headers to `src/templates/{catalog,types,shared}/**` for specs that read the
  registry rather than every design; keep the enumeration specs (pack, baseline, counting) on the
  wide glob.
- Validation: landing replay before and after; the catalog gate still fires on any design file.

### 17. production-controls (2.50, 26 tests, selected 37%)
- Protects: the production page's verbs and controls.
- Action: REMAINS; remove the fixed 2-second wait before `verb-take` in favour of the readiness
  signal the page already stamps. Saving under 1 min, high selection share.

### 18. playout-cues (2.52, +1.55 since 09-26) and playout-clock (2.45)
- Action: REMAINS; find the drift (compare the 09-26 and 10-11 per-test durations), use the fake
  clock for timers. Estimated saving 1 min.

### 19. The 19 no-UI specs (144 tests, 12.6 min): ai-retrieval, bench, creative-pilot, creative-routing, graphic-sound, lite-*, live-field-change, live-path, ograf-isolation, ograf-parity, publish-drift, publish-gate, render-schedule, sync, video-generation-corpus
- Action: items 10-12 first; the rest assessed one by one for the blank-page tier or Node.

### 20. The configured suite (53 specs, 24-28 min wall per push to main, 548 runs in four weeks)
- Protects: the app assembled against a real backend.
- Action: MEASURE the fixed cost (`supabase start`, migrations, account) versus the tests; run at
  each full validation instead of every push (same attribution as the offline validation); fix the
  root cause of `configured/dashboard-hosted-walk`'s five quarantine entries or move it to the
  scheduled walk. Saving about half its runner minutes; frees two runners during busy hours.

## Never selected, and the shared-change set

12 specs (0.5 min) were never selected in 150 landings (ai-dev-routes, ai-panel, canvas-fit,
canvas-selection, comments, inline-edit, keyboard, machine-edit, preview-error, pro-custom,
video-generation-corpus, wysiwyg); ten of them are fully skipped files (item 15). The 76-spec focus
set (68.6 min) becomes the explicit shared-change set under AC-5; its review is a candidate of its
own (which journeys a shared change must not break), measured by the landing replay.
