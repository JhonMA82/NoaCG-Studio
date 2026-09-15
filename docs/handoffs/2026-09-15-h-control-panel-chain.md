# Handoff - the control-panel chain, paused after HC for the night wave

Written 2026-09-15 by the coordinating session (`new-session-db1287`), on the owner's word: let HC
finish, then pause, and start a night wave around 21:00 Helsinki (18:00Z) that continues the
chain. Everything a planner needs is in the wave-state file
`<git-common-dir>/noacg-jobs/wave-plans/2026-09-15-day-wave-plan.local.md`: the table, all ten
prompts verbatim, the launch log, and the decisions of the evening. This file is the pointer and
the state.

## Where the chain stands

| Row | State | Pointer |
|---|---|---|
| HA | landed, pull request 270 | `docs/handoffs/2026-09-15-ha-skill-teaches-the-contract.md` |
| HB | landed, pull request 271; cli 0.3.2 on npm; the minute measured at 56 s | `docs/handoffs/2026-09-15-hb-release-and-first-walk.md` |
| HC | running when this was written; queues itself with the catalog gate named as CI's | its handoff once it lands |
| HD to HJ | not started; each fires on the previous landing; prompts in the store | the wave-state file |

The next launch is HD on HC's landing: `codex/hd-show-profile`, the profile model and migration
0058, on the codex pool with opus as the fallback.

## What the night wave must carry forward

- **Queue single-spec runs at `--cost 0.5`** (`node scripts/jobs.mjs add --cost 0.5 "npx playwright
  test <spec> --workers 1"`, the flag before the command). Every remaining row's GATE line in the
  store already says so.
- **The memory floor is retuned for the night**: a runner started with `NOACG_JOBS_FREE_MB=3072`
  is live from the coordinating session; if it is gone, start one that way before launching HD. The
  rule is `jobs/owner-away-machine-job-queue-may` and the mechanism wanted is
  `docs/backlog/ram-floor-by-presence-not-by-guess.md`.
- **HC's traps** (from HA and HB): a reported hidden field trips `bench-field-unpainted`; the bench
  dedups by event name and never snaps back between presses. HC's scope covers both; check its
  handoff before HD starts, and if HC left either open, carry it as a gap row rather than dropping it.
- **AC-9's hosted half** waits for HJ and needs a checkout with `.env.local`.

## Evidence and traps that live in no repo file

- The safety classifier refused a runner restart that combined a forced process stop with a
  background start; the plain forced stop and a plain background start, done as two commands with
  the owner's permission in chat, passed. Do not fold them into one command.
- HB found and fixed a dashboard defect the room would have hit: at 1440×900 the verb column
  collapsed so far that Out sat over Next. Its spec pins it.
- The other wave's `codex/ograf-studio-architecture-research` reads finished-and-unqueued to the
  tick; its ownership is unknown from here and it was left alone.

## Needs the owner

Nothing. The two questionnaire questions ALIGN-2026-09-15-5 and -6 stay open and nothing waits
on them.
