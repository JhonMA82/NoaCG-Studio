# Phased plan

Each phase is one or more pull requests, each independently verified with `/check` and landed with
`/queue-merge`, each recording before/after figures (AC-10) in its description and in `spec.md`'s
"Completed maintenance". Full suites never run on the shared local machine; CI runs them. Rollback
for every phase is named with it.

## Phase 0: evidence and spec (this pull request)

`spec.md`, `work.json`, `evidence/`, `interventions.md`, this plan. Nothing else changes.
Verification: docs checks in `npm run build`; `node scripts/work-spec.mjs status` reports ten open
criteria with AC-1 ready for review.

## Phase 1: selection safety, the budget, instructions (week 1-2)

1. **Shared-change set** (`scripts/e2e-lists.mjs`, `scripts/e2e-affected.mjs`, headers): retire
   `// focus` and `E2E_SPRINT_FOCUS` in favour of `SHARED_CHANGE_SET` with reasons; `// untraced`
   for own-context specs; pin the five scenario plans in `scripts/e2e-affected.test.mjs`; narrow the
   catalog-registry headers (candidate 16). Measure with `scripts/replay-selection.mjs` before and
   after (planned minutes p50/p75/p90 over 150 landings). Rollback: revert the lists; the planner's
   fail-toward-more rule is untouched.
2. **Capacity check** (`scripts/e2e-durations.mjs`, `ci.yml` e2e-report): usage, lines, exceptions
   with expiry, p90 for unmeasured, three separate cost figures in the check summary; constant
   `MAIN_RUNNERS`; unit tests for the lines and the exception grammar. Rollback: the check is
   advisory for its first week (warning only), then refusing.
3. **Protection check** (`scripts/check-e2e-protection.mjs`, `// gate: build`): refuses spec or
   test removal, added skips and timeouts above 120 s in the gate set without a maintenance entry;
   mutation-tested against a change that deletes a test. Auto-fix rule amended (one sentence) with
   `npm run learn`. Rollback: header `gate: none - <why>`.
4. **Instructions**: placement rule replaces `root/give-any-new-flow-playwright-spec`;
   `docs/VERIFICATION.md` corrected ("no unit-test suite"); work-spec README asks acceptance
   criteria to name the tier; `docs/TEST_SELECTION.md` describes the shared-change set.
5. **Miss measurement** starts: a weekly job (in `e2e-durations-refresh.yml`'s pull request body)
   lists failures found by full main runs and whether the culprit's pull-request plan would have
   selected them.
6. **Small contained wins**: catalog gate on main only when flagged; retry refusal fix (#1025);
   quarantine expiry after 14 days; `dashboard-hosted-walk` root cause or scheduled.

Before/after for the phase: usage %, planned gate minutes p50/p75/p90 (replay), queue entry to
landed p50/p90, runner minutes per week.

## Phase 2: cadence and cost (week 2-4, after phase 1's criteria pass)

1. **Batched validation** behind `NOACG_MAIN_VALIDATION=batched`: the plan job on a push to main
   checks the last validated snapshot (`noacg/validated` status on main's commits, written by
   after-gate), skips when every landing since it planned `none`, otherwise pins the tip, runs the
   full suite plus the catalog gate when any landing in the range flagged it, records
   `validated.json` (pinned SHA, range, started, finished); never cancels; a finished validation
   dispatches the next if relevant landings arrived. Stale alarm in `nightly-drift.yml`'s style:
   no completed validation within 60 minutes of a relevant landing opens or updates the rolling
   red-main issue with the range. Bisect job: on a confirmed red, the failed specs run per landing
   SHA in the range in one job; `red-main-issue.mjs` names the culprit; `revert-landing.mjs` takes
   that landing. Drill (E5) before enabling. Rollback: the variable.
2. **Configured suite** triggered by the validation run with the same range (E4 measured first).
3. **Experiments** E1, E2, E3 on an experiment branch at night; results into `evidence/`; adopt
   only what measured.
4. **Task walks** (interventions row 6): one scheduled walk file assembled from the five, focused
   counterparts extended, maintenance entries with fault-injection receipts.

Before/after: full runs per week, detection p50/p90 (observed, not replayed), runner minutes,
landing p50/p90, slowest shard p50/p90.

## Phase 3: portfolio maintenance (ongoing, one candidate a week)

The weekly refresh pull request carries usage, the week's adders and the ranked candidates; the
monthly quality review assigns the top ones as wave rows with an owner, a completion trigger (a
measured saving landed) and the result recorded in `spec.md`. Order: candidates 4, 10, 7, 11-12,
5-6, 9, 13-14, 15, 17-18. Each row: profile, change at the cheapest layer, fault-injection or
defect replay receipt, maintenance entry, before/after minutes.

## Verification across phases

- Replays (`evidence/scripts/`) are re-run at each phase on the same commit range for
  comparability; new measurements cite run IDs.
- No phase raises `timeout-minutes`, lowers an assertion, or lets a stop-at-cap read as a verdict.
- The owner is asked only if a phase's evidence requires changing the protection or detection
  targets in `spec.md`.
