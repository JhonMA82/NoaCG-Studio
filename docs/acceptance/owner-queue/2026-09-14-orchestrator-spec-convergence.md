---
kind: agent
date: 2026-09-14
---
# Bounded work keeps its parent intent

## Route, under a minute

Open `docs/ORCHESTRATOR_SPEC_REVIEW.md`, starting with Decision and the invariant table.
Then run from this feature worktree:

```sh
node scripts/work-spec.mjs status docs/work-specs/orchestrator/work.json
```

## What to look at

- A substantial feature has one compact desired-outcome spec, while small fixes keep the old path.
- Your existing goals and rulings remain authoritative; agreeing a spec does not create per-task approval.
- A completed slice can land while the parent remains open. Failed or unverified acceptance never
  disappears because a session ended or ran short of context.
- The checker reports record consistency, not a substitute for observing the actual behaviour.
- The scheduler, recovery, fixed wave window, native host routes and merge queue are preserved.

The next natural substantial assignment should sample receipt size, retained acceptance IDs,
fresh-context restart and gap discovery on both hosts. No overnight shift or paid probe is started
by this change. This record is for review, not a gate on other work.
