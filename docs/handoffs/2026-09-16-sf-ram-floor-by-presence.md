# SF - the RAM floor by presence

**Branch:** `claude/sf-ram-floor-by-presence`, two commits on `6150d0ba`. Queued for landing.
**Gate:** `npm run build` exit 0, read from the build's own exit code, and its gates tier ran
`node --test` over 120 files (1783 passing) including `scripts/jobs-store.test.mjs` at 99.

## What landed

The queue's free-RAM floor now follows whether anybody is at the machine, and both numbers are
measured. `POLICY.freeMemFloorMb` is `{ present: 4096, away: 3072 }` instead of one guessed 4096,
and `freeMemFloorFor(presence, policy)` picks between them. Only the exact string `away` loosens
the floor; every other value lands on `present`.

Presence is DECLARED, not guessed, because it is the one scheduling input this machine cannot
read for itself. `npm run jobs -- presence away|present|<nothing>` writes and reads a
`presence.json` sidecar beside the jobs. The runner re-reads it on every scheduling pass, which is
the point: `NOACG_JOBS_FREE_MB` only ever worked at runner start, so the old way to loosen the
floor was to stop the runner and start another by hand - the thing
`docs/backlog/ram-floor-by-presence-not-by-guess.md` asked to stop needing. A declaration expires
after twelve hours, and anything unreadable, undated or misspelt reads as `present`.

A job held by the stricter floor now prints what is being kept and the command that releases it,
which is the owner's "during a day wave it's always good to ask if you can go over 4 GB" put where
the wait happens. The queue listing and the session-start summary both show a live `away`, above
the empty-queue return, so a stale declaration cannot be invisible.

Presence moves the floor and nothing else. `capacity` is untouched, and a test pins that.

## The measured numbers, and what produced them

Taken 2026-09-16, 13:30-13:45 UTC, on the 15.9 GB laptop (16236 MB visible), six agent sessions
live, owner away. `Get-CimInstance Win32_OperatingSystem` for free physical memory and
`Get-Process` working sets, sampled every 5 s across a queue job that was already running
(j-1180, `save-to-air-bench`, cost 0.5). Nothing was enqueued to produce these - five sibling rows
were using the live queue.

| What | Measured |
| --- | --- |
| Free, six sessions, no queue job | 6.4-6.7 GB |
| Free, same six sessions, one walk running | 5.0-6.2 GB, low sample 4988 MB |
| One browser walk | **~1.4 GB peak** - 965 MB across five `chrome-headless-shell`, plus a ~0.4 GB dev server |
| Six sessions and their subprocesses | 3310 MB, about 550 MB each |
| Desktop apps that are not agent work | 3114 MB (Codex/ChatGPT app 1020, Wispr Flow 583, Antigravity, WD Discovery, scanners) |

The derivation, which is the part worth arguing with: the floor times a job's cost should be what
the job takes. A walk measured 1.4 GB at cost 0.5, so a suite-equivalent is about 3 GB - the away
floor. Each cost class then lands on its own measurement: a walk is charged 1536 MB against 1.4 GB
used, a landing 461 MB against the few hundred megabytes `gh run watch` takes. The 2026-09-09
reading of two suites leaving "under 2 GB free" on a box that idles near 6.5 agrees at about 2.3 GB
a suite, so 3072 keeps a margin. The extra gigabyte in the 4096 is the room the person at the
keyboard gets, not part of the job's cost, which is why it goes when nobody is there.

`docs/JOB_RUNNER_PLAN.md`, "What a job actually costs in RAM", carries this table with its date and
how to redo it.

## What is left

**One measurement.** The backlog item is narrowed rather than closed, and says which part: a real
Playwright suite and a catalog battery were never watched at peak. Their cost is derived from the
walk and cross-checked against the older reading, not measured. If a suite peaks above 3 GB the
away floor is under-reserving. Doing it means enqueuing two browser-driving jobs, which was not
available on a machine five other rows were queueing into.

**The owner has one question, and it is small.** `docs/acceptance/owner-queue/2026-09-16-the-queue-asks-whether-you-are-there.md`
(`kind: walk-p`, `because: direction`) asks whether "ok to use it all" meant lower than 3 GB. If he
says yes it is a one-line change, and nothing printed anywhere quotes the gap between the floors as
a literal - the held-job message computes it.

## Traps this found, in no repo file

- **The presence sidecar is read inside the runner's `for(;;)` with no catch.** Anything
  `readPresence` throws kills the runner, the queue reads "NO RUNNER", and every replacement the
  next `add` spawns dies identically with `stdio: 'ignore'` eating the stack - the 2026-09-04
  outage's exact shape. Any future read of that file from the drain loop owes the same total
  robustness: the first cut threw a `TypeError` on a `presence.json` containing `null`.
- **`Number(process.env.X)` as a threshold is a silent off switch.** `Number('4gb')` is NaN and
  `value < NaN` is false for every value, so a typo in `NOACG_JOBS_FREE_MB` removed the RAM check
  rather than changing it. That predates this row; it is fixed here because the line was being
  rewritten anyway. The same shape is worth grepping for wherever an env var becomes a limit.
- **Changing an exported POLICY field's shape from a number to an object is not additive.**
  `policy` is a documented option of `schedule`, and a caller on the old shape got `undefined`,
  then `NaN`, then no floor at all - measured, a whole suite admitted on 100 MB free. The accessor
  now reads a plain number as one floor.

## Check

- `review: delegated` - 8 findings, 8 acted on. Scope verified: the pass reported branch
  `claude/sf-ram-floor-by-presence` and base `6150d0ba`, and
  `git diff --name-only 6150d0ba..HEAD` plus a clean `git status --porcelain=v1` matched the
  11 files `review-request.mjs` handed it. Six findings were confirmed by running the code in a
  probe script before being fixed, not by reading. Two were stale single-floor comments in
  `e2e-runs.mjs` and `codex-rescue.mjs` that this change itself falsified, corrected here.
- `simplify: inline` - the skill returned fan-out instructions, so per the workflow the leg was
  done in this context over reuse, simplification, efficiency and altitude. Five fixes: a doubled
  `readPresence` read in the session-start hook, a re-listed object literal in the expired branch,
  the `NOACG_JOBS_FREE_MB` NaN hole above, a repeated `'away'` literal in the listing banner, and
  the banner moved above the empty-queue return. Skipped as not worth the indirection: `cmdList`
  and `snapshot()` each read the sidecar once per listing (two reads of a tiny file), and
  threading the record out of `snapshot()` would cost more than it saves.
- `verify: inline` - `npm run build` exit 0 plus `node --test scripts/jobs-store.test.mjs` at 99.
  No `src/` file changed, so `test:e2e:affected` does not apply.
- `taste: not applicable` - nothing here can move what a graphic looks like.

Every new test was proved red before it was believed green, by breaking the implementation one way
at a time and reading which case failed: eight breaks, eight distinct failures, restored green
after each.

## Pointers

- `scripts/jobs-store.mjs` - `PRESENCE`, `PRESENCE_TTL_MS`, `readPresence`, `writePresence`,
  `freeMemFloorFor`, `overrideFloorMb`, and the floor's use in `schedule`.
- `scripts/jobs.mjs` - `cmdPresence`, the listing banner, and the three `schedule` call sites that
  now pass presence.
- `docs/OWNER_RULINGS.md` - the 2026-09-16 entry, his answer verbatim with what it settles and what
  it does not.
- `docs/JOB_RUNNER_PLAN.md` - "Presence" and "What a job actually costs in RAM".
- `docs/backlog/ram-floor-by-presence-not-by-guess.md` - narrowed to the one open measurement.
