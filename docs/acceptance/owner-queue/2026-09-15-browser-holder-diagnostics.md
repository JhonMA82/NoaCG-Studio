---
kind: agent
date: 2026-09-15
---
# Browser holder diagnostics

Date: 2026-09-15

Changed: existing command-line status can distinguish suspected sustained idle from orphaned
processes. The result is advisory, showing PID, age, CPU delta/window and descendants. It never
releases a slot or authorizes termination. Orphan cleanup now also protects live catalog sweeps.

## The route, under a minute

In this worktree run `node scripts/e2e-runs.mjs --diagnose --json`, or
`node scripts/jobs.mjs --json` and inspect `holderDiagnostics`. With no holders the list is empty.
With holders a read takes a five-second sampling window plus bounded OS queries. The running
queue prints the same evidence every 30 seconds, using its previous sample without sleeping.

Look at: young/CPU-active/browser-active/other-holder waits remain distinct from suspected-idle;
unavailable evidence remains unknown. For a reproducible controlled picture, open
`docs/work-specs/browser-holder-recovery/evidence/eq-cpu-probe.json`: production answers young,
while the explicitly accelerated fixture shows idle versus busy OS counters. This is not a replay
of the historical incident. Integrated acceptance AC-5 remains open for independent review.
