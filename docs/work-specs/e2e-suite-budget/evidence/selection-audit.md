# Selection safety audit (AC-2)

The selector is `scripts/e2e-affected.mjs` (`planFor`), fed by each spec's `// covers:` header
(`scripts/e2e-lists.mjs`) and the nightly's traced map (`scripts/e2e-traced.mjs`). Everything below
is replayed with the planner at f2eee85cf, sprint focus on and the traced map of 2026-10-11, as CI
runs it. Script: `scripts/scenario-plans.mjs`, `scripts/replay-selection.mjs`, `scripts/replay-core.mjs`.

## What the selector plans today for the five shapes

| Change | Plan | Specs | Table-min | Shards | Catalog gate |
|---|---|---|---|---|---|
| Playout-only: `src/components/home/CueRundown.tsx` | subset | 39 | 53.2 | 11 | no |
| Playout-only with its stylesheet (`src/styles/playout-dashboard.css`) | focus (styles are CORE) | 87 | 81.4 | 11 | no |
| One catalog template added (`src/templates/lowerThirds/lt99.ts`) | subset | 59 | 51.6 | 11 | yes |
| ... plus its registration in `src/templates/catalog.ts` | subset | 132 | 124.6 | 11 | yes |
| Editor-only: `editorFoundation/EditorFoundation.tsx` + `foundation.css` | subset | 42 | 62.5 | 11 | no |
| Editor-only: `editorFoundation/commandAdapter.ts` | subset | 42 | 62.5 | 11 | no |
| Shared model `src/model/structure.ts` | focus | 76 | 68.6 | 11 | no |
| Shared rendering `src/preview/settleGraphic.ts` | focus | 76 | 68.6 | 11 | no |
| Shared storage `src/store/templateStore.ts` | focus | 76 | 68.6 | 11 | no |
| Uncertain: new `src/sync/replication.ts` with no covers line | focus, `unmapped` named | 76 | 68.6 | 11 | no |
| Uncertain: new helper `e2e/_newhelper.ts` | focus (helpers are CORE) | 76 | 68.6 | 11 | no |
| Docs only | none | 0 | 0 | - | no |

With sprint focus off, every "focus" row is the full suite (233 specs, 169.4 minutes, catalog gate).

## Findings

1. **The sprint focus has expired but still decides every shared change.** `E2E_SPRINT_FOCUS: '1'`
   is set in `ci.yml:311` with "delete this line when the sprint ends"; the student release closed
   2026-08-22 (`docs/GOALS_ARCHIVE.md`). The focus set is now 76 specs / 68.6 minutes, one third of
   the suite, grown by new specs adding `// focus` (77 declare it). It is the de facto "shared
   change" set, chosen by a sprint rule rather than by the question "which journeys must a shared
   change not break". 27% of landings (40 of 150) escalate to it; the escalating files are
   `src/validation/*` (25 hits, 14 files), `src/model/*` (15, 9 files), `src/community/*` (8,
   unmapped), `scripts/e2e-affected.mjs` (7, unmapped), `package.json` (4), `playwright.config.ts`
   (3), e2e helpers.
2. **The traced map cannot see specs that open their own browser context.** editor-proposal-task
   and editor-command-task (7.4 minutes) create `browser.newContext()`, so `e2e/_trace.ts` records
   nothing for them and the map's "fresh" share counts them as traced-but-empty. A file only they
   execute is invisible to the traced union. Specs landed after the map's commit are also absent
   until the next nightly (the map is at most 3 days old by construction).
3. **New or unmapped files escalate correctly** (`unmapped` named in the plan), to the focus set
   rather than the full suite. Under the proposed shared-change set that stays an escalation.
4. **Shared dependencies: helpers run everything** (`e2e/_*` is CORE), which is right, but a helper
   edit is also the most common reason a maintenance change runs 169 minutes twice. Broad headers
   (import-svg-behaviour matches 1,022 repository files, student-rehearsal 887, productions 832)
   inflate unrelated plans; the 15 broadest are listed in `candidates.md`.
5. **Configured behaviour** is reported, never selected (`configured` flag printed); the configured
   suite runs on every push to main instead. Under batching it runs at each validation, which keeps
   its latency (minutes, not a day) and halves its cost.
6. **Multi-domain merge groups** plan the union from the group's base (`--integration`), so two
   queued pull requests from different domains run both plans in one group run; the replay shows
   subsets of 54-100 minutes that are unions of two domains (`replay-selection.json`). That is
   correct and is the reason merge-group runs are the p90 of landing latency.
7. **The selection miss on record** (#927, 2026-10-10: `editor-fidelity-trim` not mapped to
   `importedDesign/svg.ts`) is what the traced map was built for; the other three red main runs
   named in that investigation were flakes, a cap hit and a port collision
   (`docs/work-specs/e2e-traced-selection/evidence/run-triage.md`).

## Extension to make (phase 1; nothing new selects, the selector grows)

- Replace `FOCUS` with `SHARED_CHANGE_SET` in `scripts/e2e-lists.mjs`: an explicit list of journey
  specs, each with a one-line reason, reviewed like a rule. Starting membership: the current focus
  set minus specs whose header says `covers: none` or that are fully skipped, plus the journeys a
  shared change must not break (create, import, production, publish, output, editor save/reopen,
  OGraf export). The `// focus` header line is retired; membership is one list, not 77 headers.
- A spec that opens its own browser context declares `// untraced` and the planner treats its
  covered files as "trace cannot confirm" (the covers header still selects it; the traced union
  never removes it).
- Broad headers are narrowed where the header is a habit rather than a dependency (the catalog
  specs that only read `src/templates/catalog.ts` and one category), measured by the landing
  replay before and after.
- The scenario table above is pinned in `scripts/e2e-affected.test.mjs` so a change to the lists is
  a visible change to these plans.

## Miss measurement (rollout criterion for the cadence)

For two weeks after the extension and before the cadence change: every failure found by a full
main run is replayed through the pull-request plan of the landing that introduced it (planner at
that commit, `--files` of its diff). A failure the plan would not have selected is a miss and is
fixed (a covers line, a shared-set entry) before the cadence changes. The count is reported in the
weekly refresh pull request. Zero misses in two weeks is the criterion to enable batching; it is not
a proof of completeness, so full post-merge validation continues after the change.

## Rollback

`NOACG_MAIN_VALIDATION=per-landing` (repository variable read by the plan job) restores a full run
per push to main. The shared-change set and the traced-map changes stay; they are improvements to
selection regardless of cadence.
