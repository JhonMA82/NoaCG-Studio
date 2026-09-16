# QB - the advisor gate now runs where it fires

**Branch:** `claude/qb-advisors-run-in-post-land` (two commits, `0acaff64` and `687e0ad6`).
**State:** finished and queued. Build green, `check-gate-coverage` green, `check:advisors` exits 0
at 110 of 110.

## The shape chosen, and why

The backlog file argued three: a `::warning` in post-land, a hard failure there, or a warning there
plus a hard failure in `weekly-audit.yml`. **A hard failure in post-land**, and the two rejections
matter more than the choice.

Post-land runs after the merge, so this is an alarm and can never be a gate. That argues for the
softer shape only if some quieter signal would actually be read, and none would. The defect being
closed is a check that ran nowhere, and a `::warning` inside a run that concludes `success` is that
same defect with a paper trail. A red conclusion is the one channel this repository already reads:
`scripts/ci-watch.mjs` polls every run, reports each red one and logs it where the morning reads,
and a failed `db-push` in the same job already uses that channel to say the same kind of thing.

It cannot decay into a standing red for accepted noise, because the script exits 1 only for a
finding that is new against the baseline and never for one that cleared.

**weekly-audit was rejected on cost, and the reason is structural rather than squeamishness about
secrets.** It has `workflow_dispatch` and no environment, so a token there is readable by YAML on
whatever branch someone dispatches it from; post-land's is scoped to the `production` environment.
It would also answer a week late about a database that changes on landings.

## What that forced, which was not in the plan

Making a failure red means the failure has to mean what it says, so the exit codes became the
interface. Three ways existed for exit 1 to arrive without a new finding, two of them reproduced:
an unconfigured project ref and a baseline whose `entries` key was renamed both exited 1 with a
stack trace. Now **2 is a defect on our side and post-land reds on it too** - a deleted baseline
must not switch the alarm off while every landing stays green - and **3 is the outside world
refusing to answer, and only warns**. All four paths were exercised by hand, not reasoned about.

Two silent-green holes closed on the way. `body.lints ?? []` let a reshaped 200 read as "no
findings"; that was already documented as this gate's silent-green path and became load-bearing the
moment post-land started reading exit 0 as "this landing was checked". And every accepted finding
clearing at once is a comparison against the wrong data, not a project that fixed a hundred
advisories in one landing.

## The thing worth knowing: the gate had already decayed

**The prompt said to confirm `check:advisors` still exits 0 at 106 of 106. It did not.** It was red
at 110 live against a 106 baseline, four findings from migration 0060's two slug-addressed
functions, seven days after a review recorded it green. That is the decay this row was written to
stop, and it had already happened once more while nothing was watching.

The four were judged against the live database rather than the migration text, and accepted:
`anon` holds no privilege of any kind on `control_shows`, so those functions are the only door, and
`control_data_apply`, which writes the column wholesale, is `service_role` only. Baseline
re-recorded at 110, diff is the four entries plus `recordedAt` and `count`, no existing entry
dropped.

**Accepting the reachability is not a claim the door's guard is tight**, and on this one it is not.
`docs/backlog/the-operator-door-guards-a-branch-and-not-a-leaf.md`, which landed on main during
this row, measured on staging that `{"drivers":[]}` still deletes a bound branch through the array
carve-out. The first draft of the accepted-class note claimed the opposite; it is corrected, and it
now points at that file. The two questions are separate on purpose: the advisors ask who may call a
function, and a bug inside one is not answered by revoking a grant the product needs. **Migration
0061 is that fix and it is not this branch's.**

## Check

- `review: delegated` - returned findings and its own scope. Scope-checked: branch, base
  `f8245243`, and all 7 paths match `git diff --name-only` plus a clean `git status`. Seven
  findings, six fixed; the seventh is a handoff still citing the backlog file this change deletes,
  not acted on because `docs/handoffs/` is consumed by design and the migration trap it points at
  is already durable in `supabase/AGENTS.md` (lines 67 and 112).
- `simplify: inline` - the skill returned fan-out instructions rather than a result, so the pass
  had not run and the four angles were taken here. It caught the one that mattered: `db-push.mjs`
  talks to the same Management API and carries a warning that `AbortSignal.timeout()` leaves a live
  libuv handle which aborts the process on Windows, so the timeout now uses an explicit controller
  with a cleared timer. Also trimmed three comment blocks that re-argued the header's exit-code
  table. Skipped, deliberately: running the two advisor fetches in parallel would need
  `Promise.allSettled` to avoid an unhandled rejection, and that is complexity for about a second
  on a job that has just pushed two databases.
- `verify: inline` - `npm run build` exit 0 read from its own status, twice, zero `not ok`. No e2e:
  nothing under `src/` or `api/` changed.
- `taste: not applicable` - nothing here can move what a graphic looks like.

## For whoever picks up next

- **`docs/backlog/the-morning-verdict-is-a-claim-nothing-re-derives.md`** is filed and deliberately
  not built. The sharp version is not "the brief carries no command": `grounding.md` already says
  to re-check the run a verdict names, and that instruction cannot disprove this class of claim,
  because the run it names failed and always will have, while the run that made the claim false is
  one it never mentions. Re-derived here: `migration-drift.mjs` says 60 of 60 on both projects, and
  post-land has six consecutive green runs since `35055657854` at 04:27Z.
- **The first post-land run after this lands is the first execution of the new step.** Read it.
  The likeliest surprise is not the advisors but the shell: the step is new, and nothing offline
  can prove a workflow file parses, because this repository has no YAML parser anywhere - every
  script reads workflows as text, so CI is the only parser there is.
