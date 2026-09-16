# The job queue admits two browser-driving jobs at once, and they wait on each other forever

**Filed:** 2026-09-16. **Source:** measurement, while running the affected specs for the Data-tab
row (`claude/ta-data-tab-explains-itself`).

## Why

The queue's own invariant is that one browser-driving job runs per machine. Its admission
arithmetic is a budget of 1 suite-equivalent, and two jobs at cost 0.5 fit, so it started a spec
run and a bench in the same minute. Each then waited for the other, both counted as running,
nothing timed out, and the session that owned the spec run lost 22 minutes before reading the logs
and breaking the tie by hand. A queue whose "running" can mean "waiting on the other running job"
gives a false picture to every session that reads it, which is the exact defect
`docs/JOB_RUNNER_PLAN.md` says the queue was built to remove.

## What it would take

Two mechanisms would each close it; pick one and pin it with a unit test.

1. `scripts/jobs-store.mjs`: admit at most one browser-driving job at a time regardless of the
   cost sum. The cost budget can stay for the CPU-only jobs; the browser slot is a separate
   count of one.
2. `scripts/save-to-air-bench.mjs` (and `scripts/cli-bench.mjs`, same loop): do not register as
   a holder until the wait loop at the top has ended. Today the bench is one of the runs
   `scripts/e2e-runs.mjs` lists from the moment it starts, so every other run yields to it while
   it waits for every other run.

Option 1 is the one that matches the stated invariant. The test belongs in
`scripts/jobs-store.test.mjs`: two browser-driving jobs added together, only one starts.

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
