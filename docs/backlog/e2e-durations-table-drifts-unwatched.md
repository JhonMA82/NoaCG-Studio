# The e2e durations table drifts for weeks because nothing forces a refresh

**Filed:** 2026-09-04. **Source:** measurement, while fixing the E2E shard-cap cancellations
(`git show ba427e57:docs/handoffs/2026-09-04-t-shard-cap-poisons-every-gate.md`).
**Merged 2026-09-15:** `the-durations-table-is-refreshed-by-hand.md` was filed the same day about
the same table and the same fix. Its two points not already here are in "Folded in" below, and
that file is gone.

## Why

`scripts/e2e-durations.json` was 15 days stale and nobody noticed: recorded 2026-08-20 from run
32412658565 with **131 specs / 70.5 minutes**, while the real suite had grown to **147 specs /
99.7 minutes**. Sixteen spec files had no entry at all. `npm run check:e2e-durations` reported this
correctly the whole time - it only runs inside `check:freshness`, which is a weekly REPORT and not
a gate (`root/drive-freshness-time-never-commit-freshness`), and a report that nobody acts on for
a fortnight is indistinguishable from no report.

**The cost of staleness went up on 2026-09-04.** Until then the table only decided HOW MANY runners
a plan asked for, and `shardsFor` caps at 9, so a full run asked for nine either way and drift
changed nothing. Since `packShards` started bin-packing spec files by measured duration and handing
each runner an explicit file list, the table decides shard BALANCE - and an unbalanced shard set is
exactly what killed four of thirty `main` runs at the 20-minute cap. A wrong weight now costs a
cancelled run, not just wall clock.

This is not urgent: the table was re-recorded on 2026-09-04, and the packer degrades honestly (an
unmeasured spec is packed at the median, never dropped, and the assignment asserts its own
coverage). It is worth doing because the same drift will happen again, on the same schedule, and
the next time it will show up as cancelled runs rather than as a line in a weekly report.

## What it would take

The obvious move - make `check:e2e-durations` a build gate - is probably wrong as-is. A hard gate
on "every spec file has an entry" makes ADDING a spec file fail the build until someone re-records
from a green full CI run, which needs CI artifacts (7-day retention) and cannot be done offline.
That trades a slow leak for a wedge.

Three shapes worth weighing instead:

- **Gate on aggregate drift, not per-file coverage.** Fail when the table's total is more than some
  percentage away from the newest green full run's measured total, or when more than N spec files
  are unmeasured. Both are computable from the table plus `specFilesOnDisk()`, and neither blocks a
  single new spec.
- **Remove the human step.** A scheduled job (`weekly-audit.yml` already exists) runs
  `npm run record:e2e-durations` against the newest green full `main` run and opens a PR when the
  table moves materially. The refresh path is already sound - `--check`, `drift()` and
  `fullRunRefusal` (which refuses a half-run) all exist; the gap is only that nothing forces it to
  be used.
- **Report it where it is read.** Print the drift in the plan job's own output, so it appears in
  every CI run that depends on it rather than in a weekly digest.

A build gate lands alone (`root/work-feature-branch-own-worktree-made`), so whichever shape wins
is its own branch.

## Folded in from `the-durations-table-is-refreshed-by-hand.md`

- **A scheduled refresh should open a pull request, never push.** The table is an input to a
  safety gate, and a silent auto-commit to it would be a gate editing its own budget.
- **The table carries the per-job overhead term too** (`git show
  12ce8f55:docs/handoffs/2026-09-04-u-honest-timings-and-selection.md`). A stale overhead reading
  makes the planner warn about a cap the run would have cleared, or stay quiet about one it would
  not. So drift now costs a wrong verdict about fitting as well as a slow run.

## What the imbalance costs, measured 2026-09-15

The packer balanced nine bins to a 1.005 spread when the table was recorded. The runners do not
see that. Across the 25 newest green full `ci.yml` runs on `main` (2026-09-10 to 2026-09-15), the
per-shard mean wall clock was:

| shard | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 |
|---|---|---|---|---|---|---|---|---|---|
| mean min | **14.6** | 12.2 | **14.1** | 12.3 | 11.8 | 12.1 | 12.2 | **14.4** | 12.4 |
| worst | 15.8 | 12.8 | 15.2 | 14.1 | 13.4 | 13.2 | 13.5 | 15.1 | 13.3 |

Shards 1, 3 and 8 are the heavy three, and the spread between shard means is 1.24. A shard mean
does not move with runner variance, so the weights are wrong, not the runners. The E2E stage waits
on its slowest shard. That puts about 1.7 minutes on every full run over a balanced 12.9 (116
shard-minutes over nine), and the worst green shard left 4.2 minutes under the 20-minute cap.

## Evidence

- `docs/CI_STABILITY.md` §4 "Reopened 2026-09-04, different cause: an uneven split, not a suite that
  got too big" - the 30-run measurement, the per-shard table, and the 66.9 -> 99.7 minute growth.
- `git show ba427e57:docs/handoffs/2026-09-04-t-shard-cap-poisons-every-gate.md` - how the drift reached four
  cancelled runs and, through them, a misfiled issue and two dead landings.
- `scripts/e2e-durations.mjs` header - why the table exists and how a refresh is meant to happen.

## Trend
- 2026-09-08: table recorded 2026-09-04 from run 33905531739 - 147 specs, 102.8 min, 2 spec files unmeasured (`library-productions.spec.ts`, `wizard-brand.spec.ts`), overhead 0.5 min/job at p90. Four days old and materially accurate, so the leak is slow this week; the mechanism that lets it drift is untouched
- 2026-09-15: same table, now 11 days old. 150 spec files on disk against 147 in the table, and **3 unmeasured** (`import-name-collision.spec.ts` joined the two above). The measured full run is about 116 shard-minutes (about 112 once 9 jobs of 0.5-minute overhead are taken out) against the table's 102.8, roughly 9% drift. Per-shard means now spread 1.24 (14.6 slowest, 11.8 fastest, table above), where the packer planned 1.005. Nothing has refreshed the table since 2026-09-04
