# Report - the control-panel chain, 2026-09-15 to 2026-09-16

The coordinating session's report, written 2026-09-16 05:45Z at the owner's word to wrap up.
It supersedes `docs/handoffs/2026-09-15-h-control-panel-chain.md`. The durable record is the
wave-state file `<git-common-dir>/noacg-jobs/wave-plans/2026-09-15-day-wave-plan.local.md`: the
table, every prompt, the launch log and every decision of the night.

## What landed

Ten rows planned, ten landed, one gap row in flight. `docs/CONTROL_PANEL_ANY_GRAPHIC.md` §5 is
the plan; `docs/work-specs/control-panel-any-graphic/` the ledger.

| Row | Pull request | Outcome |
|---|---|---|
| HA | 270 | the skill teaches the control contract and its three gates |
| HB | 271 | cli 0.3.2 on npm; the first timed walk (56 s minute); a dashboard defect found and fixed (Out over Next at 1440×900) |
| HC | 274 | the bench presses every arrow (22 of 22, 4.5 s) and names skipped ones; hidden reported fields exempt |
| HD | 275 | `Show.profile` v1, migration 0058 (opus did it; the codex route died on its usage limit) |
| HE | 276 | ARRANGE on all three deployments, the Controls panel, migration 0059; its refusal of field bands amended the spec (277) |
| HF | 278 | COMBINE on the in-app page: resolver, scheduler, composer; five bugs |
| HG | 279 | COMBINE on the hosted page and the exported controller's one line; four review defects |
| HH | 280 | a ± or adjust on a bound field patches the shared tree; migration 0060 (unplanned mint) |
| HI | 281 | bind all by title |
| HJ | 283 | the second timed walk (3.9 s from one press to the totals board), every criterion reviewed, 0060 fixed after two red post-land pushes nobody noticed |
| HK | running | the hosted half in the configured suite, 0060's first execution read |

Also landed on the way: the acceptance ledger and the receipt (269), the rules and receipts of
the evening (273: the queue's memory floor follows the owner's presence), and the AC-5 amendment
(277).

## Where the acceptance stands

HJ's converge: `open`, AC-1 to AC-5, AC-8 and AC-10 pass; AC-6 unverified, AC-7 and AC-9 fail,
all three on one gap: no profile had been driven on the hosted control page, because a worktree
carries no backend and the owner's account was the only alternative. HK closes it in CI's
configured suite (its own local stack and test account); its first push was green at 04:53Z, its
third at 05:23Z. Migration 0060 executed for the first time in the post-land push after 283
(run 35055657854, green).

**If HK reports converge `evidence-complete`, the parent is done and the receipt
`docs/backlog/elamani-biisi-own-control-panel.md` goes.** If it reports a gap, the next planner
continues it as a bounded row from HK's handoff; the plan's prompts carry the pattern.

## Vitals

- Refusals by the queue: none. Re-queues: one (HC, re-queued at walk cost after a memory hold).
- Rows that could not run on their pool: three (HD, HG, HH routed to opus; the codex route died
  before touching a file). HJ and HK were re-routed to opus in advance.
- Classifier refusals, both left alone: a runner restart bundled with a forced stop (later done
  as two plain commands with the owner's permission), and stopping HH's leftover dev server.
- Stray subagent reports relayed: one (HI's review verifier, both candidates refuted).
- Launch-guard catches: one (a wrong migration filename in HD's prompt, fixed and relaunched).

## What the next planner must know

- **Queue single-spec runs as walks**, with the night floor:
  `NOACG_JOBS_FREE_MB=2560 node scripts/jobs.mjs add --cost 0.5 "npx playwright test <spec> --workers 1"`.
  A runner exits when its queue empties, so the floor travels with the command, never with a
  process. The rule is `jobs/owner-away-machine-job-queue-may`; the mechanism wanted is
  `docs/backlog/ram-floor-by-presence-not-by-guess.md`.
- **`e2e-affected` plans against the stale local main** and escalates small branches to a full
  suite (`docs/backlog/e2e-affected-plans-against-a-stale-main.md`, HD). Twice tonight a row's
  `/check` verify leg queued a suite the box could not admit; both times CI carried it.
- **Two red post-land pushes went unnoticed** (after 281 and 282). Arm `node scripts/ci-watch.mjs`
  beside the wave watch; the wave watch alone does not report a red post-land run.
- **The Codex medium-effort trial expired** with no outcomes measured; HH restored the high
  default. Revisit with a measurement, not by default.
- **Two owner-queue notes were left by rows**, neither blocking: HE asks about field bands (the
  spec already says controls only); HG asks whether a countdown that dies with a reload is
  acceptable for 2026-10-20 (plan §6d already says yes and shows it on the button).
- **The questionnaire's open questions are now `ALIGN-2026-09-15-5` and `-6`** in the local
  weekly file; the four rulings kept `-1` to `-4`.
- The other wave's `codex/ograf-studio-architecture-research` and `codex/orchestrator-durable-recovery`
  are still ahead of main and unqueued; ownership unknown from here, left alone.

## Needs the owner

Nothing for the chain. Two things on the machine: a session in the primary checkout
(`noacg-studio-ca`) has waited since 04:05Z on a permission prompt only he can answer, and a dev
server HH left running on port 5184 (pid 37912) holds 0.3 GB, which the classifier would not let
this session stop.
