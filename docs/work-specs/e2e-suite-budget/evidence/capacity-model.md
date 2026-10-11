# Capacity model and 30/60/90-day scenarios

## The model (not suite-minutes divided by shards)

A full run of T table-minutes on S shards has a predicted slowest shard of

    wall = maxBin(T, S) x testFactor + jobMinutes + imbalance + variance

- `maxBin` is the heaviest bin the packer makes (longest-processing-time first); with fresh weights
  the bins are within 0.1 min of T/S, with stale weights the heaviest bin was 15.9 against 13.2
  balanced (10-04 audit).
- `testFactor` 1.01 and `jobMinutes` 0.42 (p90) are measured (table overhead block); setup is
  0.3-0.5 min on the cache path and 6-10 min on a registry miss (2026-09-04, since cached).
- `imbalance` from unmeasured specs: 32 specs guessed at 0.25 min cost 34.7 (10-11, #1020).
- `variance`: runner speed moves every spec at once (two recordings an hour apart differed 4% on
  the total); the slowest shard's p90 ran 1.2-1.4x the mean shard in the nine-shard weeks.

The job cap is 20 minutes; the planner keeps 3 minutes of safety, so a shard may carry
`budgetMinutes = (20 - 3 - 0.42) / 1.01 = 16.4` table-minutes. Capacity for the full run is
`MAIN_RUNNERS x 16.4`; at 11 runners 180.6 table-minutes. Usage today 169.4 / 180.6 = 94%.

Concurrency is the second limit, and it is measured: the account ran exactly 20 jobs for 2,645
minutes in four weeks (17% of busy time; levels above 20 are timestamp overlap at job boundaries,
0.2% each), and shard jobs that waited for a runner were created while 19-20 jobs ran (p10 19,
p50 20). A full main run holds 11 shard slots for 16-20 minutes; a pull-request or
merge-group subset over 30 table-minutes also takes 11 slots (`SHARD_TARGET_MINUTES = 3`); the
configured suite holds one slot for 25 minutes per landing. When runs overlap, shard jobs queue
(p90 5-9 minutes on busy days) and the merge-group p90 moves from execution (8-9 min) to 20+. So
the latency model is: landing p90 = merge-group execution + queue wait, and queue wait is set by how
many slots other runs hold, which is where main's cadence and the subset shard count enter.

Three costs are tracked separately: execution (table-minutes, what the suite is), runner minutes
(what CI consumes, including setup, retries, cancelled and superseded runs), and landing latency.

## Growth rates (measured)

- Table: +26 min/week from new files over the last three weeks (18.6, 27.5, 31.6 per landing
  week); like-for-like +13 over three weeks (+4/week, noisy).
- Files: about 25 offline specs and 5-10 configured specs per week; ~140 landings per week.
- Pending growth already decided: the old-editor rewrites (#800). If a third of the 543 skipped
  tests return at today's mean of 4.5 s each, that is about +14 table-minutes.

## Scenarios

Assumptions: growth g = +26/week (observed) with a sensitivity case at +18/week (growth slows as
the editor plan's test-first slices finish); capacity 180.6 at 11 runners; the 60-minute validation
target and p90 20-minute landing target from the spec.

| Day | Current approach, +26/wk | +18/wk | Cleanup only (one-time -35) | Cleanup + process (net +5/wk) |
|---|---|---|---|---|
| 0 | 169 (94%) | 169 | 169 -> 134 (74%) | 134 |
| 30 | 281 (156%, needs 17 runners) | 246 (14) | 246 (136%) | 155 (86%) |
| 60 | 392 (24 runners) | 323 (20) | 357 (22) | 177 (98%) |
| 90 | 504 (31 runners) | 400 (25) | 469 (29) | 198 (110%, 13 runners) |

- Current approach: the eleven-runner full run stops fitting within about three weeks; by day 60 a
  single full run would need every slot the org has, and pull-request runs would queue behind it.
  The main run's wall clock would pass the 60-minute target through queueing before the cap is hit.
- Cleanup only (items 1-14 of `candidates.md`, -30 to -40 table-minutes once the profiled items
  deliver; label: estimated) buys six to seven weeks at the observed growth, then the same curve.
  Finite cleanup cannot absorb indefinite growth.
- Cleanup + process: the placement rule sends pure logic to Node and extends maintained journey
  files instead of adding one per feature (expected to halve the new-file rate; estimated), and the
  weekly candidate list retires or moves about 5 minutes a week (one candidate a week). Net +5/week
  keeps the eleven-runner envelope for about 70 days; at +8/week (placement halves growth, no
  retirement) about 40 days. The envelope is therefore sustainable only with both halves working,
  and even then the hard line is reached again within a quarter unless the retirement rate matches
  the addition rate. That is the point of the ratchet: usage is held, not the file count.
- With batched validation (-32% full runs) and the configured suite on the same cadence, the
  runner-minute curve drops by 5,000-7,000 a week independently of the table; it does not change
  the table scenarios above, which are about whether one full run still fits its cap.

## Sensitivity

- jobMinutes p90 back at 6 minutes (a dependency-cache miss on every shard) cuts budgetMinutes to
  10.9 and capacity to 120: the suite stops fitting at once. The cache key must stay stable.
- A 20% runner slowdown (variance) is the same as +34 table-minutes: the 85% warning line is
  what keeps a bad day under the cap.
- Trace recording: if `retain-on-failure` costs the 34% measured locally, the true execution is
  126 table-minutes and the capacity line moves accordingly; the experiment decides.
- Two or three workers per shard would raise `budgetMinutes` per runner only if efficiency holds
  under a 4-vCPU runner with Chromium and Vite; unmeasured, see `experiments.md`.
