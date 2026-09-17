---
kind: agent
date: 2026-09-16
---
# The shard durations table refreshes itself, and asks before it lands

Changed: `scripts/e2e-durations.json` - the measured table CI divides the E2E suite by - is no
longer refreshed only when somebody remembers. `.github/workflows/e2e-durations-refresh.yml` runs
`node scripts/e2e-durations.mjs --refresh` every Monday at 05:30 UTC, records from the newest green
FULL `ci.yml` run on `main`, and opens a PULL REQUEST when the numbers moved enough to matter. It
never pushes: the table sets the budget every E2E plan is judged against.

The branch also lands the recording the job would have proposed today. The table was 12 days old:
`import-svg.spec.ts` had grown 4.60 -> 6.71 minutes, `import-svg-behaviour.spec.ts` 1.19 -> 3.75,
four spec files had never been measured, and the nine bins the packer planned to a 0.03 spread were
really carrying 10.3 to 14.95 table-minutes.

**Route, under a minute.** GitHub -> Actions -> `e2e-durations-refresh` -> `Run workflow`. The run
takes about ten minutes; open it and read the job summary. Expect it to say the table on main still
describes the suite and to propose nothing, because the fresh recording landed here - that quiet
answer IS the threshold working, and it is the half that has never run on a real runner. The loud
half ran on this laptop on 2026-09-16 against the 12-day-old table and printed three reasons;
`docs/CI_STABILITY.md` §4 carries every number it used.

Look at: whether the summary's numbers match `npm run check:e2e-durations`, and, next week, whether
the per-shard means came down. The reading before this landed is in `docs/CI_STABILITY.md` §4 -
25 green full runs, shard means 12.0 to 14.2 minutes against a balanced 13.0, the stage waiting on
14.2. If the mechanism works, the four heavy shards flatten toward 13.

Action needed: nothing. The first scheduled run is Monday 2026-09-21; if it fails it files
"E2E durations refresh is red" and closes it again by itself.
