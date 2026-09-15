---
v: 2
source: owner
kind: ask
raised: 2026-09-15
state: unstarted
asked: "if I'm not on the computer then it's okay to use more RAM and also to check whether we actually need 4 GB ready every time so we aren't too conservative with the RAM ... During a day wave it's always good to ask if you can go over 4 GB."
serves: H0
size: standard
touches: scripts/jobs-store.mjs, scripts/jobs.mjs, scripts/jobs-store.test.mjs, .agent-workflows/orchestrator/night.md
needs-owner: none
---
# The queue's memory floor follows the owner's presence, and is measured rather than guessed

**Filed:** 2026-09-15, the evening the control-panel chain stalled on it. **Source:** the owner,
in session, recorded as the rule `jobs/owner-away-machine-job-queue-may` the same evening.

The queue refuses to start browser work below a free-RAM floor of 4 GB on a 16 GB laptop
(`scripts/jobs-store.mjs`, `freeMemFloorMb`, retuned only by `NOACG_JOBS_FREE_MB` at runner
start). The store's own comment calls that number a starting point, not a measurement, and notes it
is unreachable while the owner has a browser open. On 2026-09-15 row HC of the control-panel
chain sat behind it with 3.5 to 3.6 GB free, first with one spec on one worker priced as a suite,
then with its catalog tripwire; nothing on the box was the session's to close, and the classifier
refused a runner restart until the owner ruled in chat.

## What the owner asked for

Two things, both his words above. When he is away from the machine, the queue may use more RAM.
And the number itself should be checked: whether a run actually needs 4 GB ready every time,
rather than assumed. During a day wave, with him at the computer, a session asks before going
past the floor.

## The mechanism this wants

- A floor that depends on presence, the way the suite budget already depends on the clock
  (`POLICY.byDay` / `byNight`): a night floor beside the day floor, read by the same runner, so a
  night wave never needs a session to set an environment variable and restart a runner by hand.
- A measured floor: the runner already knows each job's cost class; record the peak memory a
  suite, a walk and a catalog run actually take on this box from the logs, and set the floors from
  those numbers with a stated margin. `jobs-store.mjs` says to retune "once the logs say what a
  run actually costs"; nothing has said it yet.
- A day-wave ask: when a job waits on the floor during a day wave, the tick prints the one line
  that tells the owner what to close or what to allow, instead of a silent wait.

Until this lands, the rule applies by hand: a night wave's coordinator starts the runner with
`NOACG_JOBS_FREE_MB=3072`, and a single-spec run is queued at `--cost 0.5`.
