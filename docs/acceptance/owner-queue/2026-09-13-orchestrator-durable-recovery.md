---
kind: agent
date: 2026-09-13
---
# Recover a wave without the master's transcript

## Route, under a minute

From this feature worktree run `node scripts/wave-recover.mjs --json` for the newest stored plan,
or pass `--plan <absolute-stored-plan>` for the intended wave. The command reads only.
Read `docs/metrics/2026-09-13-orchestrator-durable-recovery.md` for evidence and limits.

## What to verify in the next requested wave

- Each worker has its returned identity and worktree recorded with `wave-launch record`.
- Worker progress becomes a tick event without reading its transcript. Replaced-worker and
  stale-SHA claims cannot mark current work ready. Unknown ownership does not free a slot.
- A fresh master recovers goals, ownership, next actions and fixed deadline from files, then
  reconciles the existing coordinator and harness identities before any launch.
- Failed observations are visible; repeated unchanged warnings and reports stay quiet.
- The same procedure works in Codex and Claude, refills useful independent work, and finishes
  through GitHub's merge queue with successful main CI. Local tests do not prove that live shift.

## Landing integration, 2026-09-17

The live restart/refill test remains outstanding. Integration with the new SPEC acceptance
ledger keeps parent acceptance separate from branch landing in recovery output. Also verify
that a landed slice with open parent criteria leads to bounded gap work, not parent completion.
