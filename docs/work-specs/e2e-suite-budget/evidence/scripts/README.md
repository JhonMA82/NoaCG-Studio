# Evidence scripts

Read-only reproductions of the figures in the evidence files. They cache Actions API responses in
`$NOACG_CI_CACHE` (default `<tmp>/noacg-ci-cache`); nothing here writes into the repository.

- `fetch-runs.mjs`: every workflow run in the window (sliced by day) -> `runs.json`.
- `fetch-jobs.mjs <workflow.yml ...>`: job records with step timings, every attempt -> `jobs/<run>.json`.
  Budget: 5,000 requests an hour shared across the account; `FETCH_WORKERS=3` is safe.
- `fetch-prs.mjs`: merged pull requests with merge-queue timeline events -> `prs.json`.
- `analyze-jobs.mjs [from] [to]`: runner minutes, shard wall time, cap hits, queue waits, concurrency.
- `replay-selection.mjs [N]`: the planner over the last N landings, per-spec selection share.
- `replay-core.mjs`: which files escalate a landing to the shared set; 11-shard landings.
- `scenario-plans.mjs`: the plan for the five change shapes.
- `replay-cadence.mjs`: full-validation cadences replayed against the landing history.

Run from the repository root with Node 24 and an authenticated `gh`.
