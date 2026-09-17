# The durations table refreshes itself now, and asks before it lands

`.github/workflows/e2e-durations-refresh.yml` runs `node scripts/e2e-durations.mjs --refresh` every
Monday at 05:30 UTC, records `scripts/e2e-durations.json` from the newest green FULL `ci.yml` run on
`main`, and opens a pull request when the recording clears a threshold tied to a real cost. It never
pushes to `main` and it never stamps its own branch: the table sets the shard budget every E2E plan
is judged against, so a job that commits its own measurement is a gate editing its own budget.

The branch also lands the recording that job would have proposed today, because it was worth having:
the table on `main` was 12 days old, four spec files had never been measured, `import-svg.spec.ts`
had grown from 4.60 to 6.71 minutes and `import-svg-behaviour.spec.ts` from 1.19 to 3.75, and the
nine bins the packer planned to a 0.03 spread were really carrying 10.3 to 14.95 table-minutes.
Repacked with the new weights every bin carries 12.7.

## What is left, and why

- **No part of this has ever run on a runner.** `workflow_dispatch` is only offered once the trigger
  exists on the DEFAULT branch, so the workflow cannot be dispatched from a feature branch and the
  first real execution is after it lands. Both halves of the script were run here against real runs
  (35076557657 and 35077595313), which is the half a laptop can prove; the git/gh half - force-push,
  `gh pr create`, the dispatch - has not executed. The precedent that it will is pull request #246,
  opened by `github-actions[bot]` on 2026-09-10 through `scripts/queue-pr.mjs`, and
  `repos/{owner}/{repo}/actions/permissions/workflow` reports `can_approve_pull_request_reviews:
  true`. If the path is broken anyway, the job goes red and files "E2E durations refresh is red".
- **The first scheduled run should propose NOTHING**, because the fresh recording lands here. That
  quiet answer is the thresholds working and the acceptance item says to expect it; a pull request
  on 2026-09-21 would mean a week of drift, not a fault.
- **Landing a bot pull request takes one command the queue does not supply.** A branch pushed with
  `GITHUB_TOKEN` raises no `pull_request` event, so the `Reviewed` job never runs on it - the job
  dispatches `ci.yml` for `CI gate`, and the pull request body tells whoever reviews it to run
  `gh workflow run ci.yml --ref bot/e2e-durations -f require_review=true -f diff_base=<sha>` after
  `/queue-merge` has posted the stamp. The deeper fix would widen `ci.yml`'s `reviewed` job
  condition, which is the landing machinery and belonged to another row this week.
- **Shape 3 from the backlog was not built** - printing the drift in the plan job's own output. With
  the table refreshed weekly it would print "no drift" on every run, and `ci.yml`'s plan step was a
  file another row was changing the same day. Shape 1, a hard `check:e2e-durations` gate, stays
  refused for the reason the backlog gave: it makes ADDING a spec fail the build until somebody
  re-records from artifacts that expire in 7 days and cannot be reached offline.
- **`docs/backlog/eight-workflows-carry-the-same-rolling-alarm-block.md`** is filed, not fixed: this
  row added the eighth copy of the same twenty lines of alarm shell, and the copies have already
  drifted once - the branch guard reached `weekly-audit.yml` five weeks after its siblings, after a
  green branch dispatch closed a `main` alarm that was still true.

## Evidence and traps that exist in no repo file

- **A fresh recording always looks better than the one in use, and most of that is noise.** Recorded
  twice from two green full runs an hour apart over the same 151 spec files, the two disagreed by
  4.0% on the suite total and 0.6 table-minutes on the slowest shard. Runner speed moves every entry
  at once, and `packShards` minimises the heaviest bin for the numbers it was just handed, so the
  repacked figure is an IN-SAMPLE optimum. Any threshold under that floor files a pull request every
  Monday. This is why they sit at 10% and 1.5 rather than the 5% and 0.5 the first draft used, and
  the 2.3 the 12-day-old table produced is what says the floor still leaves room for the signal.
- **Table-minutes and wall clock are not the same spread, and neither is wrong.** The shipped
  packing carried 4.67 table-minutes between its heaviest and lightest bin while the per-shard-index
  means over 25 green runs spread only 2.20. A runner pays a fixed cost per job (0.33 min measured)
  and per spec file, and the per-index means average over several different packings, because every
  spec file added to the suite reshuffles the bins. The heavy end agrees: 14.95 planned against a
  14.2-minute mean.
- **Nothing offline in this repo parses YAML.** No `yaml` or `js-yaml` package is installed after
  `npm ci`, and every gate reads workflows as text. `pip install pyyaml` then `python -c "import
  yaml; yaml.safe_load(open(...))"` is what checked the new file's structure here, and `bash -n`
  over each `run:` block extracted from it is what checked the shell. Neither found a fault, but
  both cost seconds and CI is otherwise the first parser a workflow meets.
- **`gh pr list ... --jq '.[0].number'` prints an empty string on no match, not `null`**, verified
  against the live CLI, which is what makes the `if [ -n "$EXISTING" ]` idiom the workflows share
  safe under `set -euo pipefail`.
- **`default_workflow_permissions` is `read` on this repository.** That is the default for a
  workflow with no `permissions:` block, not a ceiling - an explicit block still grants write, which
  is how the existing bot landings work.
- **The argument-parsing trap this row fell into**: `args.indexOf('--body')` returns -1 when the flag
  is absent, so excluding `bodyAt + 1` from the positional search excludes ARGUMENT ZERO - and
  `e2e-durations.mjs <merged-report.json>` is the one mode whose positional comes first. It silently
  became the usage error. Caught by the review, fixed, and pinned by `parseArgs` and its test.

## The decisions this row made, and where to revert them

- **A separate workflow file rather than a job inside `weekly-audit.yml`.** That file's whole
  contract is "this job REPORTS; it never bumps anything", it fails fast through steps whose order is
  argued in comments, and its rolling issue says "Weekly dependency audit is red". A step that opens
  a pull request needs `contents: write` and `pull-requests: write`, its own failure sentence and its
  own clock. `docs/STACK_FRESHNESS.md` now says both files exist and why.
- **`scripts/e2e-durations.json` is marked `-merge` in `.gitattributes`.** Two recordings that
  line-merge produce a table whose `source` stamp is true of some rows and false of the rest, with
  no conflict to say so. A weekly proposer makes concurrent writers likelier, so the file now
  conflicts instead, and a person keeps one recording whole.
- **The fresh table landed in its own commit** rather than being left for the mechanism to propose.
  It was costing about 2.3 table-minutes on every full run, and waiting five days for a demonstration
  is not a reason to ship a known cost.

## Gates

- `npm run build`: green before taking `main` in (`<scratchpad>/qd-build-check-final.log`) and
  green again after (`qd-build-integration.log`), both read from the build's own exit code. The log
  names are unique on purpose: a sibling row read a neighbour's `build.log` back as its own today.
- **`main` came in at `f1b90e55`, nine commits, and merged clean.** The only file both sides touched
  is `docs/STACK_FRESHNESS.md`, where QB replaced the "Not in CI" paragraph about the Supabase
  advisors with the section saying they now run in `post-land.yml`, and this row added its own
  section immediately after it. Git placed both; the merged reading was checked by eye, and the
  intro's "the one time-driven job that is not in that file" is still true - the advisor check runs
  on a LANDING, not on a clock. Nothing on `main` had touched the durations table, `packShards` or
  `ci.yml` since the fork point.
- The refresh path proven end to end twice against real runs, offline of CI: material against the
  12-day-old table (three reasons printed, body written), immaterial against a recording an hour
  older (table restored byte for byte, `material=false` on `$GITHUB_OUTPUT`).
- `check: review: delegated, simplify: inline, taste: not applicable`. The review returned six
  findings against a scope that matched `scripts/review-request.mjs` exactly (merge base
  `6e0d8119`, the same ten files); all six were confirmed against the code and fixed. Simplify
  returned fan-out instructions, so that leg ran inline over reuse, simplification, efficiency and
  altitude - it routed four hand-rolled suite totals through one helper, collapsed two restore paths
  into one, and filed the alarm-block duplication rather than fixing it across eight workflows.
- E2E not run: no product code changed. The branch touches `scripts/`, `docs/` and a workflow, and
  the affected map ignores `scripts/` by rule - nothing a spec can observe changes when this file
  does.
