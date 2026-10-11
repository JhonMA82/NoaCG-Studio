# CI plan reliability: a green run stays green, a helper change runs its specs

Authority: owner, 2026-10-11 (see `work.json`). Plan for `/plan-run ci-plan`: two phases, each
built by one session and checked by another on `main`. Issues #1025 and #994.

## Why

Two gaps in the e2e planning and retry scripts let `main` read wrong in both directions:

- A full run on `main` (run 38153870752, commit 769e1286b) had every shard upload a complete, green
  blob report, but shard 5/10 finished just inside its 20-minute cap and was concluded `cancelled`.
  The retry job saw ten reports and no failing spec, refused with "the failure was not a test",
  and `CI gate` went red (#1020) for a commit whose every spec passed.
- A pull request that changes only an e2e helper (`e2e/_ografParity.ts` in #988) planned a subset
  that ran none of the helper's three importers, so a harness change landed measured only locally.

## Goal

`scripts/e2e-retry.mjs` and `scripts/e2e-affected.mjs` give the gate the verdict the specs earned:
a run whose specs all passed is green even when a shard was cancelled after reporting, and a
changed helper runs the specs that import it before it lands.

## Decisions and boundaries

- Scripts and their tests only, plus the lines of `.github/workflows/ci.yml` that read them. No
  product code, no new workflow, no change to what a dead shard (no report) does today.
- The refusals stay for what they were written for: more than one dead shard, a dead shard whose
  files the plan does not name, and a failing spec the change itself edited.
- No browser run is needed to build or check either phase; the evidence is unit tests, the
  planner's `--list` output and the recorded run above.

## Acceptance criteria

### AC-1: A cancelled shard with a complete green report does not turn main red
`retryPlan` given every shard reported and no failing spec answers `ok` with nothing to re-run and
says why, instead of refusing; `ci.yml`'s retry job then exits 0 and `CI gate` passes for a run
whose only non-success is a shard concluded `cancelled` after uploading its report. A unit test pins
the shape of run 38153870752 (ten reports, none failing, one shard cancelled).

### AC-2: The three refusals still refuse
Two shards without a report, one dead shard whose files the plan does not name, and a failing spec
the change edits are each still refused with their existing reasons; the existing tests pass.

### AC-3: A changed helper plans its importers
`node scripts/e2e-affected.mjs --list --files e2e/_ografParity.ts` plans `e2e/ograf-parity.spec.ts`,
`e2e/ograf-isolation.spec.ts` and `e2e/catalog/ograf-parity.spec.ts`, and sets the catalog flag,
both plainly and with `E2E_SPRINT_FOCUS=1`. Helpers imported through another helper count. A
planner test pins it and fails on the code before the change.

### AC-4: The planner's other verdicts are unchanged
`node --test scripts/e2e-affected.test.mjs` passes in full; a change to a spec file, a product
file and a docs file plan what they planned before (the existing tests are the evidence).

## Phases

1. **Green stays green**: AC-1 and AC-2 (#1025).
2. **A helper runs its specs**: AC-3 and AC-4 (#994).

Each phase keeps the earlier phase's criteria passing.

## How a phase is checked

On current `main`: run the two scripts' tests; mutate the fix (revert the one condition it adds)
and confirm the new test fails; for phase 1 apply `retryPlan` to the recorded shape of run
38153870752 and read `ci.yml`'s gate for the retry result it needs; for phase 2 run the planner's
`--list` on the helper with and without `E2E_SPRINT_FOCUS=1`. The user outcome is the gate's verdict,
so the checker says in plain words what a landing with this shape would now show.

## Phase notes

Each phase's pull request adds what the next phase must allow for: decisions, traps, and the
check's findings.

### Phase 1: green stays green

- **Findings of the last check:** none (first phase).
- **Decision: "every shard reported, none failing" is green only on the run's own job list.**
  `retryPlan` takes `jobs` (this run's jobs with their steps, read through `gh api` with
  `RUN_ID`) and `errors` (the merged report's run-level error count). It answers ok with nothing
  to re-run only when every `E2E <n>/<total>` job either succeeded or was cancelled with "E2E
  shard", "Tests left the tree clean" and "Upload shard report" all passed (`cancelledAfterReport`,
  `REPORTED_STEPS`), and the report holds zero errors. Anything else - a failed leg, a cancelled
  leg whose tree check failed, a list that is short or unreadable, a report that does not say -
  still refuses with "the failure was not a test" plus the specific why.
- **Why not `needs.e2e.result`:** the first cut read the matrix's aggregate `cancelled`, and the
  review rejected it. The gate's own comment says that word can hide a FAILED shard beside a
  capped one, so a clean-tree failure (#801) next to a shard at its cap would have gone green.
  Per-job steps also catch a re-run attempt whose shard was killed mid-test while an earlier
  attempt's report is still downloaded.
- **ci.yml, lines that run and read the retry:** the retry job gains `actions: read` and passes
  `GH_TOKEN`, `GH_REPO` and `RUN_ID` to the script; "Upload the retry report" runs only when a
  re-run step ran (with nothing run, `if-no-files-found: error` is what failed run 38153870752's
  retry job, beside the refusal); the quarantine step skips an empty `specs` (`[]`), which it
  used to answer with an exit 2 under `continue-on-error`. The gate's notice for a cancelled
  matrix now covers the nothing-run case, and the script annotates the shard that reached its cap
  so that pressure stays visible on a green run.
- **For phase 2:** nothing here touches `scripts/e2e-affected.mjs`. `retryPlan` gained two
  optional inputs; a caller that omits them keeps the old refusals.

### Phase 2: a helper runs its specs

- **Findings of the last check (phase 1):** PASS. The real script on run 38153870752's shape exits
  0 and the gate reads green; the three refusals hold; reverting the fix fails the new tests. The
  shard blob reports could not be downloaded from a cloud session (proxy 403), so the zero
  run-error input rests on the shard log. Shard 5 used 19.7 of its 20 minutes.
- **Decision: a helper is planned by its importers, not by the escalation plus its importers.**
  `helperReach` reads every `.ts` under `e2e/` and follows relative imports (static, dynamic and
  `/e2e/` absolute) backwards to the specs; `planFor` takes the map as `helpers` and plans those
  specs, raising the catalog flag for an `e2e/catalog/` importer and the configured flag for an
  `e2e/configured/` one. The answer is the same with and without sprint focus. Unioning the focus
  set on top was rejected: a TypeScript helper can only move the specs that import it, and the
  76-spec focus set ran for `_ografParity.ts` while proving nothing about it.
- **What still escalates through CORE:** a helper a Playwright config or `e2e/tsconfig*.json`
  names, with or without its extension, or one such a helper imports (`_offline-guard`, `_trace`,
  and `_env-probe` through `_offline-guard`); a helper nothing imports (a commented-out import
  does not count); a deleted helper. The map is built only by this script's CLI and only when a
  helper changed; `catalog-affected.mjs`, `collision-check.mjs` and `e2e-plan-compare.mjs` pass no
  map and keep escalating every helper, which runs more, never less.
- **Cost, measured on today's tree:** most helpers plan 1-20 specs where they planned the focus
  set (76) in CI or the full suite (233) locally. The broad ones plan more than the focus set:
  `_create.ts` 121 specs, `_durable.ts` 91. That is the honest set a change to them can break.
- **Trap:** the config check matches `/<helper name>` in the config text, and the import reading
  skips whole comment lines only; a config that loads a helper some other way (a computed path)
  would not be seen. ci.yml needed no change: it reads only the JSON, whose shape is unchanged.
- **For a later phase:** none planned; this was the plan's last phase.

### Check of phase 2 (on main 1c9355e)

- **Verdict: PASS.** `node --test` passes 76/76 for the planner and 22/22 for the retry.
  Reverting the one added condition (the `helpers` branch in `planFor`) fails both new tests.
- **AC-3, all three specs:** `--list --files e2e/_ografParity.ts` gives `subset`,
  `ograf-isolation.spec.ts` and `ograf-parity.spec.ts`, with `catalog: true`, with and without
  `E2E_SPRINT_FOCUS=1`. The third importer, `e2e/catalog/ograf-parity.spec.ts`, is not in `specs`
  and cannot be: `playwright.config.ts` ignores `**/catalog/**`. It runs because the flag starts the
  `Catalog calibration gate` job, whose `npm run test:e2e:catalog` runs all of `e2e/catalog/` with
  no design scope, and `CI gate` reads that job's result. The planner test pins the flag and names
  the catalog spec as its reason.
- **What a helper-only pull request's gate runs now:** a commit that changed only
  `e2e/_ografParity.ts`, planned the way CI plans it (`--json --integration origin/main`, focus on),
  gets one shard with the two default-suite importers plus the catalog gate. Before #1044 the same
  change got the 76-spec focus set in CI, with neither importer and no catalog gate. Locally,
  without focus, it got the full suite.
- **AC-4:** a spec, `src/export/targets/ograf.ts` and `docs/GOALS.md` each plan the same mode, spec
  count and catalog flag as the planner from before #1044, in both modes.
- **Phase 1 still holds:** the retry tests for run 38153870752's shape and the three refusals pass.
