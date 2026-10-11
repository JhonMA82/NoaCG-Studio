# Controlled CI experiments

Every benefit below is unmeasured until its experiment has run. None is launched by the planning
work. Common design: one commit on an experiment branch, dispatched with `gh workflow run ci.yml
--ref <branch>` (a dispatch plans the full suite), five baseline runs and five candidate runs
alternated (B C B C ...), same day and same hours (23:00-05:00 UTC, when the queue is quiet), warm
caches (the first run of each arm is discarded), `fail-fast: false`. Measured per run: shard wall
clock p50/p90/max, E2E step minutes, setup minutes, shard queue wait, test retries and failures,
runner minutes, and on the experiment branch only a step that prints `nproc`, `free -m` and
`/proc/loadavg` before and after the E2E step. Stop rule: a candidate arm with a failure the
baseline arm never shows ends the experiment as "not safe". Cost: ten full runs, about 1,300 runner
minutes per experiment. Each candidate arm is a change on the experiment branch only.

## E1. Workers per shard: 1 versus 2 versus 3

- Candidate: `workers: isCi ? 2 : ...` (then 3) with the same 11 shards.
- Question: does the E2E step shorten enough to carry more table-minutes per runner (and so fewer
  slots per run) without new failures? Expect sub-linear scaling (one Vite dev server, one browser
  per worker, 4 vCPU on a public-repo runner).
- Success: step minutes fall by >= 35% at 2 workers with no new failure or flake across five runs;
  then `budgetMinutes` can be recomputed with a measured per-worker factor.

## E2. Trace recording off in the gate

- Candidate: `trace: 'off'` on pull requests and merge groups; `retain-on-failure` stays on the
  full validation and the retry job (where a failure is investigated).
- Question: the local measurement was +34% wall; what is it in CI?
- Success: >= 15% shorter E2E step. Policy note: a pull-request failure then has no trace on the
  first run; the retry job keeps traces for main.

## E3. Subset shard target 3 versus 6 minutes

- Candidate: `SHARD_TARGET_MINUTES = 6` for pull-request and merge-group plans only.
- Question: a 60-minute subset moves from 11 to 10 slots and a 40-minute one from 11 to 7; does the
  merge-group wall clock rise by more than the queue wait it saves on busy days?
- Measured on real traffic rather than dispatches: two weeks with the variable set, compared on
  queue entry to landed p50/p90 and shard queue wait.

## E4. Configured-suite fixed cost

- Measurement only: step timings of `supabase start`, migrations, the account mint and the test
  step over the last 50 runs (pending job records).
- Decides whether the suite follows the validation cadence (if fixed cost dominates) or whether the
  tests themselves need the same treatment as the offline suite.

## E5. Batched validation drill

- On the experiment branch: a validation run with a range of three synthetic landings, one of
  which breaks a spec; the stale alarm fires when the validation is held past 60 minutes; the bisect
  job names the culprit.
- Success: the issue names the range and then the culprit; the revert targets one landing.

## E6. Blank-page tier cost

- Candidate: creative-pilot and the lite-* specs run under a config with no `webServer`, bundling
  the modules the way `scripts/catalog-emit.mjs` does.
- Success: the same assertions pass, mutation twins still fail, and the step minutes are under half
  of today's.
