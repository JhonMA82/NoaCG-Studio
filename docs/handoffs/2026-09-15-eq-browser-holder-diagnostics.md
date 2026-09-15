# Browser holder diagnostics - 2026-09-15

Branch: `claude/eq-browser-holder-diagnostics`
Worktree: `C:/Users/ahonemi/.codex/worktrees/pilot-eq/NoaCG-Studio`
Implementation: `c3f0d2a7` - Report advisory CPU evidence for idle browser holders.

## Delivered and verified

Existing e2e/jobs status exposes advisory PID/age/CPU-window/descendant evidence. Young,
CPU-active, browser-present and confirmed other-holder waits remain distinct; incomplete or
recycled evidence stays unknown. Diagnostics never decide scheduling, reclaim, liveness or
termination. The existing orphan exclusion now also protects live sweeps, after reproducing
that omission against the original function with injected process evidence.

`npm run build > build.log 2>&1` returned its own BUILD_EXIT=0 in exec session 93324:
116 test files / 1648 tests, 1647 pass, zero fail, one platform skip; app/API TypeScript,
ESLint, dependency checks, bundle, 502 prerendered pages and after-build checks passed.
Two earlier attempts failed only new receipt formatting; both defects were fixed before
this complete pass. No code changed afterwards. No browser-driving probe or shared-runner
restart was performed in this slice.

Real OS probe: two self-expiring non-browser children, full fixture families retained,
5823 ms window, idle CPU delta 0 versus busy 5.8125 s. Production thresholds answered young;
explicit age-only acceleration answered suspected-idle/cpu-active. Both exited naturally 0.
This is not the historical 126-minute incident reproduced.

## Review and evidence

Review: inline, 2 findings fixed (unknown browser count, partial CIM error handling).
Simplify: inline, reused existing ancestry/blocking helpers and one orphan node snapshot.
Verify: inline, passed. Taste: not applicable - no graphic/UI rendering changed.
No dedicated callable review/simplify tool was available in the native inventory. Scope was
checked against review-request's exact 11 files and base fff13a0a3dbdb538a2fd45d3acf0d3c2612a8bd1.
This handoff is the sole additional documentation file, read back before stamping the final tip.

- `docs/work-specs/browser-holder-recovery/evidence/eq-diagnostics.md` - full context,
  reproduction, implementation decisions, gates and native/Claude limitation.
- `docs/work-specs/browser-holder-recovery/evidence/eq-cpu-probe.json` - real families/counters.
- `docs/work-specs/browser-holder-recovery/evidence/eq-cli-status.json` and
  `eq-jobs-status.json` - existing command wiring on the quiet machine.
- `docs/acceptance/owner-queue/2026-09-15-browser-holder-diagnostics.md` - technical review route.

## Still open and next action

AC-3/AC-4 have slice evidence awaiting independent acceptance; integrated AC-5 remains OPEN.
Neither work-spec ledger nor work-spec.mjs changed. The original backlog ask remains advanced,
not closed. The predecessor Claude attempt had configured Edit/npm/test denials and no code;
its terminal state/PID exit was verified before native fallback. No Claude permissions changed,
no denied route was retried, and no native safety refusal occurred.

Owner action: nothing. This session queues its own finished branch once. Coordinator owns
landing observation, ET the bookkeeping fix and ES independent integrated acceptance review.
Do not infer parent completion from this branch's build, exit or landing.
