# Full-validation cadence replayed against the landing history

Script: `scripts/replay-cadence.mjs` (reads the cached run list and the landing commits; plans every
landing with the planner at HEAD, sprint focus on, traced map on, as CI did). Window 2026-09-15..
2026-10-11: 588 first-parent landings on main, 313 with a plan other than `none` ("relevant"), 50
mechanical (quarantine, refresh, traced-map, revert). Per week landings / relevant: 86/36, 124/82,
188/103, 190/92.

A simulated full validation lasts the observed p50 wall clock of successful main runs in that week
(16.6 / 17.6 / 19.5 / 22.4 minutes), which already includes today's queueing; it pins main's tip at
start, is never cancelled, and the next one starts as soon as it finishes if relevant landings
arrived meanwhile. Runner minutes use 130 per full run (the median of the nine-shard weeks; the
ten-shard week at the cap measured 170 with its retries, so the savings below are conservative).
Detection = landing to the completion of the first validation whose snapshot contains it.

| Policy | Full runs / 4 weeks | Per week | vs observed 366 | Runner-min / week | Detection p50 / p90 / max (min) | Landings per run p50 / p90 / max | Share > 60 min |
|---|---|---|---|---|---|---|---|
| Observed (per landing, superseded runs cancel, cap kills) | 366 completed + 182 cancelled | 92 | - | ~11,900 | 33 / 150 / 828 | 1 | large |
| B batch, start at once, never cancel, skip `none` | 249 | 62 | -32% | ~8,100 | 19.5 / 28.4 / 43.7 | 1 / 2 / 4 | 0% |
| C batch, wait up to 10 min for more landings | 233 | 58 | -36% | ~7,600 | 27.9 / 32.4 / 41.8 | 1 / 2 / 4 | 0% |
| D batch, wait up to 20 min | 213 | 53 | -42% | ~6,900 | 37.6 / 42.4 / 44.2 | 1 / 2 / 4 | 0% |
| E hourly slot when anything relevant landed | 188 | 47 | -49% | ~6,100 | 47.6 / 73.5 / 82.3 | 1 / 3 / 6 | 33.5% |
| F every 30 minutes | 220 | 55 | -40% | ~7,150 | 32.4 / 45.7 / 52.1 | 1 / 2 / 4 | 0% |
| G as B, at the p90 wall clock (slow weeks) | 229 | 57 | -37% | ~7,400 | 31.4 / 46.8 / 68.3 | 1 / 2 / 4 | 2.2% |
| H as B but without skipping `none` landings | 418 | 105 | +14% | ~13,600 | 19.5 / 31.8 / 44.3 | 1 / 2 / 4 | 0% |

## Reading

- Today's per-landing run buys worse detection than batching, because a superseded run cancels
  itself and a cap kill leaves no verdict: half the relevant landings waited more than 33 minutes
  for a completed full run, a tenth more than 2.5 hours.
- Skipping landings whose plan is `none` is worth as much as batching itself (H versus B): 275 of
  588 landings touch nothing the offline suite can see.
- Policy B or C meets the 60-minute operational target with margin at today's wall clock; D meets it
  with less margin; an hourly cron does not (a third of landings wait over an hour). At the p90 wall
  clock (G) B still meets it for 98% of landings.
- Batches are small: p90 two landings, max four, so culprit assignment by re-running the failed
  specs per landing in the range is one short job.
- The runner saving (3,800-5,000 runner-minutes a week against ~11,900) is a third to a half of
  main's cost and frees 11 runner slots for a third of the time, which is where the merge-group p90
  comes from (shard queue waits). That latency effect is not simulated; it is measured after
  rollout (AC-10).

## What the replay does not model

- Failures: a red validation re-runs failed specs on the pinned SHA (existing retry job) and then
  bisects over the range; those minutes are extra and rare (gate red on 11% of completed main runs
  in the window).
- A faster wall clock once fewer runs overlap (likely, unmeasured).
- Landings that arrive while the validation's plan job runs: the pin is main's tip at the plan
  step; a landing a second later waits for the next validation, which starts at once.
- Scheduling delay of GitHub itself (first job start p90 6-16 minutes on busy days is inside the
  observed wall clock used here).

## Recommended policy

B with a short idle wait (0-5 minutes) is the design in `spec.md` decision 6: never cancel, pin, skip
when nothing relevant changed, start the next at once. Continuous pushes cannot postpone validation:
each validation covers everything up to its pin, and the next covers the rest. Staleness (no
completed validation within 60 minutes of a relevant landing) raises the rolling issue with the
range (decision 7).
