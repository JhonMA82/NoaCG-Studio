---
kind: agent
date: 2026-09-14
serves: now
---
# A stalled offline readiness probe gives the queue its capacity back

## Route, under a minute

Open `docs/work-specs/browser-holder-recovery/evidence/ep-readiness.md` at "Queued acceptance and focused verification". On the verification machine, `node scripts/jobs.mjs log j-1068` shows the bounded failure and `node scripts/jobs.mjs log j-1069` shows the following same-worktree smoke passing. Portable job timings and logs are beside the evidence file.

To reproduce, enqueue `npx playwright test --config scripts/e2e-readiness.config.mjs offline.spec.ts` using `npm run queue` with `--cap 2`, then enqueue `npx playwright test e2e/offline.spec.ts --workers 1` at the default full queue cost. The first job is expected to fail after the guard's 10-second limit; the next should pass without anyone closing processes.

## What changed and what to look at

Offline, catalog and configured Playwright servers and probes now agree on explicit IPv4 loopback. Their normal 60-second readiness caps remain intact. Offline guard HTTP requests have their own 10-second limits after initial readiness, including a stalled JSON body. A failed fixture releases its owned server and the following smoke reuses the assigned port successfully.

This is the AC-1/AC-2 slice. AC-3/AC-4/AC-5 remain open for diagnostics, continuation evidence and independent integrated review. No owner action is needed, and offline results do not establish authenticated or production behavior.
