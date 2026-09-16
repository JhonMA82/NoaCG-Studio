# A queued bench waits for every other browser run while every other run yields to it

**Filed:** 2026-09-16. **Source:** measurement, while running the affected specs for the Data-tab
row (`claude/ta-data-tab-explains-itself`).

## Why

The queue admitted a spec run and a bench in the same minute, on purpose: `scripts/jobs-store.mjs`
prices a walk at half a suite and says in its own comment that two walks may run by day where one
suite could. That admission is not the defect. The defect is what the two did next: the bench sat
in its own wait loop for 22 minutes while the spec run sat behind the bench, both counted as
running, nothing timing out, and the session that owned the spec run lost the time before reading
the logs and breaking the tie by hand. A queue whose "running" can mean "waiting on the other
running job" gives a false picture to every session that reads it, which is the exact defect
`docs/JOB_RUNNER_PLAN.md` says the queue was built to remove.

## What it would take

The mechanism, read from the code rather than guessed:

- `scripts/save-to-air-bench.mjs` (and `scripts/cli-bench.mjs`, the same loop) starts by waiting
  until `activeRuns()` lists nobody but itself, with no cap. `scripts/e2e-runs.mjs` has
  `WAIT_CAP_SECONDS`; this loop does not use it.
- `scripts/command-match.mjs` lists the bench in `SWEEP_SCRIPTS`, and `blockingRuns()` in
  `scripts/e2e-runs.mjs` yields to a sweep unconditionally, because "a sweep has no globalSetup and
  never waits for anybody". The bench is the one sweep that DOES wait, so it is the one browser
  holder that opts out of the total order while everybody else defers to it.

So the fix is in the bench, not in the queue's cost budget: either the bench must not register as a
holder until its wait is over (start the wait before anything the detector can see), or it must
not wait at all and take the same FIFO tiebreak as a run does, and either way its loop needs the
same cap `e2e-runs.mjs` gives a run. Pin it with a unit test in `scripts/e2e-runs.test.mjs`: a
sweep that is itself waiting is not a blocking run. Do not reinstate one-browser-job-at-a-time;
the cost comment records why that stalled j-0888 for three hours.

## Evidence

Observed 2026-09-16 on the owner's laptop, `node scripts/jobs.mjs`:

```
running  j-1225  22 min  [0.5]  npx playwright test e2e/production-data.spec.ts e2e/feedback.spec.ts --workers 1
running  j-1226  22 min  [0.5]  node scripts/save-to-air-bench.mjs
Browser holder diagnostics (advisory):
  - pid 20184: suspected-idle; age 1327s; CPU delta 0.000s; descendants 0, browsers 0
  - pid 11980: waiting; age 1325s; CPU delta 0.000s; descendants 4, browsers 0; yields to other holder pid 20184
```

j-1226's log printed `[air] still waiting (N min)...` once a minute for 22 minutes. j-1225's log
printed `Queued behind browser-driving work in another checkout ... (pid 20184, save-to-air-bench
sweep)`. Cancelling j-1225 let the bench log `[air] logged in (+4.6 s)` within the same minute,
which is the proof that the bench was waiting on the spec run and not on anything else. The spec
run was re-added with `--after j-1226`.
