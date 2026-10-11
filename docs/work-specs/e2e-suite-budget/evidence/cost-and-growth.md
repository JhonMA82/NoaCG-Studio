# Cost and growth, measured at f2eee85cf (2026-10-11)

Sources: the Actions REST API (6,359 workflow runs created 2026-09-15..2026-10-11, job records with
step timings for every ci.yml, nightly, quarantine, configured-suite and post-land run that had
finished), 585 merged pull requests with their merge-queue timeline events, every version of
`scripts/e2e-durations.json`, `docs/research/ci-performance-2026-10-04.md`. Scripts in
`scripts/` here recompute everything from a cached copy of the API responses; the raw cache lives in
the session scratchpad and is not committed (about 4,300 job files).

Each figure is **M** (measured), **E** (estimated) or **U** (unknown).

## Hypotheses from the task, verified

| Hypothesis | Verdict |
|---|---|
| Aggregate E2E grew 86 (09-28) -> 132 (10-04) -> 169 (10-11) minutes | M: true as recorded in table versions e3c8b7cd4 (recorded 09-26, run 36251114943), 938b6b4b2 (10-04, run 37185036599), b768c29f9 (10-11, run 38144735534). But 86.5 was a dip from 115.1 (version 772772a89, 09-22): the old editor closed on 09-24 and 542 tests began skipping at runtime. Honest growth is 115 -> 169 (+47%) in three weeks. |
| MAX_SHARDS rose 9 -> 10 -> 11 | M: 9 since 1e6f9ce3a (08-19), 10 in 747ac50cf (PR #684, 10-03), 11 in b768c29f9 (PR #1027, 10-11). |
| 32 new specs contributed 34.7 of ~37 added minutes this week | M: table 10-04 -> 10-11 is +37.3; the 32 new keys add 34.7; 30 are genuinely new files (33.2), one was re-measured (editor-foundation), one a rename (publish-gate). Leaders in order: editor-proposal-task 4.04, editor-command-task 3.40, editor-groups 2.73, editor-arrangement 2.11, publish-output-setup 2.00. Existing specs net +2.7 (+13.4 slower, -10.7 faster). |
| 237 of 293 specs call app modules through `page.evaluate` imports | M: exactly 237 of 293 files contain `import('/src/...')` (188/233 offline, 42/53 configured, 7/7 catalog), every site inside an evaluate-type call; 34 of them are fully skipped files, 15 more reach `/src` only through helpers. |
| 2,179 E2E tests versus 209 unit test files | Mixed units. 209 = `scripts/**/*.test.mjs` exactly, but 51 further unit test files exist (api/_lib 26, cli/test 16, cli/plugin-guide 7, companion-module 2). No static or runtime count yields 2,179. Comparable: E2E 293 files, ~2,400 runtime tests (offline 2,241 on run 38144735534 = 1,699 passed + 542 skipped; catalog 61; configured >= 96); unit 260 files, ~3,285 cases, of which 62 scripts tests import `src` (655 cases of product logic already run in Node). |
| CI uses one worker per shard | M: `playwright.config.ts:66` `workers: isCi ? 1 : localWorkers()`. |
| Available runner capacity is close to exhaustion | M: TRUE, and the ceiling is 20. The org is on the Free plan (`gh api orgs/NoaCG`; documented limit 20 concurrent jobs). Over four weeks the account sat at exactly 20 running jobs for 2,645 minutes (16.7% of all busy time) and above 20 for 0.2% per level (timestamp overlap at job boundaries, not real capacity). 3,800 E2E shard jobs waited more than a minute for a runner; at their creation the account was running p10 19 / p50 20 / p90 20 jobs, and only 3% waited while fewer than 18 ran. Shard queue wait in the week of 10-05: p50 0.1, p90 7.7, p99 16.2, max 31.6 minutes, 32% over two minutes. A full main run is 19 jobs; `configured-suite.yml` adds a 20-26 minute job per landing. |

## The suite over time (M, `scripts/e2e-durations.json` versions)

| Date | Commit | Specs in table | On disk | Total min | Static `test(` | Recorded run | jobMinutes p90 / testFactor |
|---|---|---|---|---|---|---|---|
| 08-19 | 1e6f9ce3a | 128 | 128 | 66.9 | 974 | 32281426013 | none |
| 09-04 | d56ffb4d3 | 147 | 147 | 102.8 | 1265 | 33905531739 | 0.50 / 1.01 |
| 09-16 | 08827f58f | 151 | 151 | 113.9 | 1368 | 35077595313 | 0.48 / 1.01 |
| 09-22 | 772772a89 | 152 | 160 | 115.1 | 1465 | same | same |
| 09-26 | e3c8b7cd4 | 166 | 166 | **86.5** | 1511 | 36251114943 | 0.43 / 1.02 |
| 10-03 | 896424999 | 200 | 200 | 123.6 | 1836 | 37143991356 | 0.43 / 1.01 |
| 10-04 | 938b6b4b2 | 202 | 204 | 132.1 | 1867 | 37185036599 | 0.40 / 1.01 |
| 10-11 | b768c29f9 | 233 | 233 | **169.4** | 2104 | 38144735534 | 0.42 / 1.01 |

Where the minutes came from (M, table diffs):

| Interval | Existing specs | Added specs | Removed |
|---|---|---|---|
| 09-22 -> 09-26 | -38.2 (old-editor skips: counting-settle -5.8, ai -3.1, timeline-v2 -1.9 ...) | +16 files, +10.2 | -0.6 |
| 09-26 -> 10-03 | +6.2 | +35 files, +32.4 (playout-folders 4.8, editor-ease 3.6, playout-clock 2.6 ...) | -1.5 |
| 10-03 -> 10-04 | +6.0 | +3 files, +3.5 | -1.0 |
| 10-04 -> 10-11 | +2.7 | +32 keys, +34.7 | -0.2 |
| **09-26 -> 10-11** | **+13.4** (165 specs: +17.1 slower, -3.7 faster) | **+69.7** (68 files) | -0.2 |

Added files dominate (84% of the growth); like-for-like drift is secondary (16%) and partly noise:
within one week the same specs swung +13.4 and -10.7 in total, and each table version is one run,
so a per-spec delta under about 0.5 minutes is not reliable. Largest like-for-like rises 09-26 ->
10-11: bridge-connect +2.13, playout-cues +1.55, bench +1.41, quiz-live-consistency +1.41,
editor-base-edits +1.02.

Files on main by week (M, `git ls-tree` at the last commit of each date):

| Date | Offline specs | Configured | Catalog | Static tests (offline) | Retired-helper call sites |
|---|---|---|---|---|---|
| 08-24 | 139 | 16 | 6 | 1107 | 331 |
| 09-14 | 150 | 23 | 6 | 1343 | 397 |
| 09-24 | 166 | 30 | 6 | 1505 | 431 |
| 09-28 | 180 | 31 | 6 | 1663 | 309 |
| 10-05 | 209 | 46 | 6 | 1936 | 307 |
| 10-11 | 233 | 53 | 7 | 2104 | 306 |

New offline specs per landing week: 09-21: 20 files 18.6 min; 09-28: 30 files 27.5 min; 10-05: 27
files 31.6 min (M). Configured specs tripled since 08-24. Landings: 86 / 124 / 188 / 190 per week.

Nothing was consolidated: 0 of 516 merged pull-request titles since 09-20 mention retiring or
merging specs; four landings deleted or renamed spec files, all as part of removing a product
surface (old editor #409, community gallery #837) or a rename.

## What the full run costs today (M unless marked)

- One full main run: 11 shards, build, factory, plan, deployable, catalog gate, report, gate,
  after-gate = 19 jobs. Runner minutes per full run at the median: 129.5 (week 09-14, nine
  shards), 113.6 (09-21), 136.8 (09-28), 169.8 (10-05, ten shards at the cap plus retries).
- Setup is not the cost: shard setup p50 0.3 / p90 0.5 minutes on the cache path; the E2E step is
  p50 10.7-13.3 minutes; the table's overhead block says jobMinutes 0.42 (p90), testFactor 1.01.
- Every full main run also runs the catalog calibration gate, because `--all` sets
  `catalog: true` (`scripts/e2e-affected.mjs:1297`): 4.4-4.7 minutes per run.
- Per landing, offline E2E execution is about 235 table-minutes: 169.4 on main plus a pull-request
  run and a merge-group run at a mean of 32.7 each (planner replay over the last 150 landings).
- `configured-suite.yml` runs on every push to main: one job, p50 20 / p90 26 / max 40 minutes
  (402 runs in the two weeks to 10-11, 7,800 runner-minutes), gates nothing, and holds two or three
  of the twenty runners during busy hours. 548 runs in four weeks.
- `trace: 'retain-on-failure'` records a trace for every test in CI (`playwright.config.ts:111`);
  measured locally at +34% wall clock, never measured in CI (U).
- 70 spec files raise the 60-second test timeout (37 `test.slow()`, 39 x 180 s, 36 x 120 s,
  18 x 90 s, 7 x 240 s, 5 x 300 s, 3 x 360 s), so one slow test can carry a shard past the cap.

## Runner minutes per week (M, sum of job wall clock, every attempt)

| Week | ci.yml | of which main pushes | merge groups | pull requests | branch pushes (stopped 10-09, #851) | configured | nightly | quarantine | post-land |
|---|---|---|---|---|---|---|---|---|---|
| 09-14 | 20,734 | 10,663 (82 runs) | 2,398 (87) | 3,281 (99) | 4,144 (124) | 780 | 813 | 10 | 34 |
| 09-21 | 35,850 | 13,507 (114) | 5,183 (128) | 5,505 (147) | 8,859 (227) | 1,493 | 916 | 13 | 53 |
| 09-28 | 46,734 | 20,470 (153) | 7,245 (190) | 8,154 (204) | 10,330 (175) | 2,593 | 1,291 | 712 | 84 |
| 10-05 | 49,077 | 20,966 (127) | 7,138 (175) | 10,468 (225) | 10,097 (181, until 10-09) | 5,208 | 1,600 | 534 | 85 |

All workflows together: 22,562 / 38,749 / 51,829 / 57,618 runner-minutes per week. `docs/METRICS.md`
targets 45,000 per 30 days; the measured rate is about 220,000 per 30 days and rising. The step from
week 09-21 to 09-28 is the nine-shard overrun (cap-hit runs, retries and re-queued groups, plus 50%
more landings); week 10-05 adds the ten-shard overrun and a doubled configured-suite bill.

## Shard wall time and the cap (M)

Main full runs, per week (gate-green runs unless stated):

| Week | Runs with shards | Shards | Slowest shard p50 / p90 / max | Mean shard p50 | Runs with a shard killed at the cap |
|---|---|---|---|---|---|
| 09-14 | 82 | 9 | 15.4 / 16.5 / 17.3 | 13.3 | 0 |
| 09-21 | 112 | 9 | 14.2 / 18.8 / 20.1 | 11.3 | 2 |
| 09-28 | 153 | 9, 10 from 10-03 | 19.6 / 20.3 / 21.1 | 13.8 | **70** (71 shards) |
| 10-05 | 121 | 10, 11 from 10-11 | 19.8 / 20.3 / 21.1 | 15.7 | **49** (56 shards) |

Two weeks of overrun, not two incidents. The week of 09-28 is the nine-shard overrun (PR #684 moved
to ten on 10-03 and refreshed the weights); the week of 10-05 is the ten-shard overrun: the suite
grew from 132 to 169 measured minutes while the table still said 132, so the packer under-weighed
32 new specs at a 0.25-minute median (34.7 real minutes) and the mean shard rose to 15.7 minutes with
the slowest at the cap on 49 of 121 runs. Issue #1020 and PR #1027 (eleven shards, 10-11) are the
end of that week, not its whole. Gate-green runs: 82 / 106 / 81 / 85 per week against 82 / 112 /
153 / 121 runs with shards. A percentile here describes the sample, not a guarantee: one unmeasured
batch of specs turns a 16-minute p90 into a cap hit.

Per-run latency, run created to gate done: p50 16.2 / 17.9 / 21.2 / 25.6 minutes, p90 22.6 / 25.3 /
35.0 / 51.7, max 29 / 38 / 47 / 80. First job start delayed p90 6.6 / 8.2 / 14.0 / 16.2 minutes (the
run waits for runners before any job starts). The retry job ran on 20 main runs in the week of
10-05 (17 passed, p50 25 minutes) because a cap kill leaves one dead shard's files to run again.

Nightly: four nights 10-05..10-08 red at the 20-minute global timeout (issue #706); packing is now
dynamic up to 16 shards at 17 planned minutes.

## Queue entry to landed (M, 585 merged pull requests)

| Week | PRs | first queued -> merged p50 / p90 / max | re-queued |
|---|---|---|---|
| 09-14 | 86 | 4 / 12 / 137 | 4 |
| 09-21 | 123 | 8 / 17 / 54 | 5 |
| 09-28 | 189 | 8 / 18 / 116 | 2 |
| 10-05 | 187 | 9 / 24 / 100 (last queued -> merged 9 / 22 / 40) | 2 |

The p50 is the merge-group run itself (p50 8.7 minutes wall that week); the p90 is contention: on
busy days E2E shard jobs wait p90 5-9 minutes for a runner before they start.

## Detection on main today (M, replay against the landing history)

588 landings 2026-09-15..10-11, 313 with a plan other than `none`. Observed: 548 main runs, 366
completed, 182 cancelled (superseded self-cancels and cap kills). For a relevant landing the first
*completed* full run at or after it finished p50 33 minutes, p90 150, max 828 minutes later. The
per-landing full run does not deliver per-landing detection; cancellations do that.

## What the evidence rejects

- "Installation is the cost": the cache path makes setup 2-3% of a shard job.
- "More runners fix the cap": the cap hits were packing and growth (unmeasured specs, nine shards
  outgrown); the week of 09-28 ran out of clock on a single lopsided shard while the mean shard sat
  at 13.5 minutes.
- "Like-for-like slowdown drives growth": 84% of the added minutes are new files.
- "The sprint focus keeps branch runs cheap": it caps an escalation at 68.6 minutes and 76 specs,
  which still takes all 11 runners; 27% of landings escalate to it, and the sprint it served closed
  on 2026-08-22.

## Unknowns

- CI cost of `retain-on-failure` tracing and of the nightly's V8 coverage.
- Configured-suite split between `supabase start` and the tests (step timings are in the cached
  job records; experiment E4 reads them).
- 90 runs in the window have no job record (API failures during the fetch); none is a main full
  run of the weeks analysed above.
- Runtime test counts for `cli/plugin-guide` and `companion-module` (the latter runs in no
  workflow).
- Where the task's "2,179" came from.
