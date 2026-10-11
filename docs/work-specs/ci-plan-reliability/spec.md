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
