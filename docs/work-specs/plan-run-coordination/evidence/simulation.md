# Simulation of the ledger and the store through their command lines

Recorded 2026-10-11 on Windows 10 from Claude Code, against throwaway stores (`NOACG_JOBS_DIR`), by
the session that made the change. Unit tests: `node --test scripts/plan-run.test.mjs` (14 pass) and
`node --test scripts/wave-plan-store.test.mjs` (20 pass). What follows is the same behaviour driven
through `node scripts/wave-plan-store.mjs --open` and `node scripts/plan-run.mjs next|record`.

## A. Four phases without repairs: five landings (AC-1, AC-3, AC-6)

For each phase: `next` -> `launch build phase n`, then `record build`, `record landed #10n`, `next`
-> `launch check phase n`, `record check`, `record pass <findings>`. Observed:

- `next` after phase 1 passed: `launch build phase 2` and a second line `carry: AC-1 hold; finding:
  tighten 1` (the previous check's findings, read from the file alone, so a restarted coordinator
  gets them too). The same for phases 3 and 4.
- `next` after phase 2 passed: `retro phase 2: the middle phase passed: write ## Midpoint retro ...`,
  once; after the heading was appended, `launch build phase 3`.
- Only the fourth check was told `launch check phase 4 (land notes: final phase)`; checks 1 to 3
  printed `launch check phase n` alone.
- `next` at the end: `done: all 4 phases built, landed and checked`. The file holds four `landed`
  lines, and one check was asked to land notes: five landings.

## B. A product failure repairs, a blocked check runs again, a kind is required (AC-2)

- `record 1 fail "the label clips"` -> refused: `a fail names its kind: the detail starts with
  "product:" (the phase misses its outcome, so repair) or "blocked:" (a prerequisite failed, so check
  again)`.
- `record 1 fail "product: the label clips at 40 cols"` -> `next`: `launch repair phase 1` with
  `carry: product: the label clips at 40 cols`.
- After the repair landed and its check was launched, `record 1 fail "blocked: no signed-in
  claude -p on this machine"` -> `next`: `launch check phase 1 (land notes: second check)`, no repair;
  `record 1 repair` -> refused: `phase 1 is built; the next event is check, not repair`.

## C. Closing window, paused, restart under the same window (AC-4)

A run opened with a window 20 minutes away:

- `next`: `launch build phase 1` and the last line `window ends in 20 min: launch only a step that
  lands before then, else checkpoint and record paused`.
- With the build recorded, `record 1 paused "builder told to commit and push; PR #7 queued on
  GitHub"` was accepted.
- A second coordinator (another `CLAUDE_CODE_SESSION_ID`) reopened the same date and the same
  `--until`: the same file came back, `next` said `wait build phase 1 (branch claude/plan-sim3-p1-build
  worktree C:/wt/p1)`, a second `record 1 build` was refused (`already launched: resume it`), and
  `record 1 resume` was accepted. The file holds exactly one `phase 1 build` line.

## D. A new window the same day, and a wave refused beside it (AC-5)

With a `## Report` appended (the morning run reported at its time limit), reopening the same date
with a later `--until` printed the file and, on stderr, `new window from 2026-10-11T20:23:17.721Z to
2026-10-12T05:23:00+00:00; the earlier window ended 2026-10-11T20:43:00+00:00`. The file then read
`Window starts: <now>`, `Window ends: <new until>`, both `Session:` lines, the untouched `## Phases`
and `## Steps`, and `## Earlier report` in place of `## Report`. `next` still answered `wait build
phase 1`, and `--open <date> day --until <same>` was refused: `another wave or plan run is open`.

## E. A new date for an unfinished plan (AC-5)

With phase 1 passed and a `## Report`, `--open <next day> plan-sim4 --until <20 h away>` was
refused: `the plan sim4 has an unfinished run: <file>. Continue it: --open 2026-10-11 plan-sim4
--until 2026-10-12T16:24:00+00:00`. That command then opened a new window on the first day's file
and `next` said `launch build phase 2` with `carry: ok`. A `--until` 30 hours away was refused first
by the ceiling: `a wave runs at most 24 hours from now`.

## Limitations

- No builder, checker or landing ran: the sessions, pull requests and `main` were simulated by
  `record` lines, and the wake-ups (`CronCreate`, `sleep 1800`, the landing job) were not armed.
- The guided-mod ledger in the live store was read, never written.
- Not simulated: a real restart of a running worker, a real deadline with a pull request in the
  queue, the cloud route. Those are for a live run.
