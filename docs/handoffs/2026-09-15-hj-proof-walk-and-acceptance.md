# The chain is built and one walk short of proven

The ten rows are reviewed against the integrated tree. Seven criteria pass, AC-6 is unverified,
AC-7 and AC-9 fail, and the three are one gap wearing three numbers: **no profile has ever been
seen on the hosted control page.** The walk itself found a migration that had never applied
anywhere, and reading that file for the cause turned up two ways a shared operating link could
destroy a production's authored tree. All three are corrected here.

(The row named this file `2026-09-15`; the work ran on the 16th, and the commits and the
owner-queue item carry that date.)

## What is left, and why

- **The hosted control page has never been driven with a profile.** That is AC-9's second half,
  AC-6's hosted half, and steps 8, 9 and 10 of the live-verify checklist in `docs/CONTROL_LAYER.md`
  - one walk, on one surface, closing three open criteria. It needs a checkout that carries backend
  configuration. A linked worktree has none; the only `.env.local` on this machine (in the checkout
  that holds `main`, which is out of bounds for feature work) carries a single `VERCEL_OIDC_TOKEN`
  and nothing else. Backend configuration lives in that checkout's `.env`, and the sanctioned route
  that uses it is `npm run test:e2e:live`, whose specs sign in as the throwaway test account. **A
  session that publishes by hand would be authenticating as the owner, which this one would not
  do.** Either that live suite gains a spec that publishes a profile-carrying production, or the
  walk runs from the primary checkout.
- **Migration 0060 still has not executed.** The correction is certain for the statement that
  failed and proved for the two the review found, but the ~19 assertions past statement 15 have
  still never run anywhere. **The next post-land push is the first execution of them**, and it may
  stop at the next one. Read `gh run view --workflow post-land.yml` after this lands rather than
  assuming it went green.
- **Nothing was cut.** Every DO step ran except the publish, which is the gap above.

## Evidence and traps that exist in no repo file

- **The post-land workflow has been RED for two consecutive landings and nobody noticed** - runs
  `35045162515` (pull request 280) and `35050545400` (281). It does not fail a landing by design,
  so a red post-land is invisible unless somebody looks. Both failures are the same migration.
  Worth a tick or a report, because the thing it silently did not do was add a database function
  the 2026-10-20 demo depends on.
- **`RETURNS TABLE (path text, value jsonb)` puts `value` in scope as a plpgsql variable**, so
  `select key, value from jsonb_each(...)` inside such a function is ambiguous and Postgres refuses
  it at RUN time - nothing plans the query until the loop executes, which is why the migration
  applied as far as its own self-check before failing. The sibling function three declarations up
  runs the identical line and is fine, because it returns a scalar. Qualify the source in any
  function whose out parameters share a name with a set-returning function's columns.
- **The Supabase MCP can run SQL in `pg_temp`, and that is a real test rig for migration logic on
  a machine with no Docker.** `create function pg_temp.f(...)` plus a `select` in ONE call is
  session-local, touches nothing in the project, and executes on the same Postgres 17 the migration
  will meet. Every claim in this branch's SQL was proved that way, both directions, including a
  seven-case table of the bound-path guard before and after. **This is the answer to "0060 could
  not be tested locally"** and it should have been used a row earlier.
- **`{"panel": []}` was a legal press against a binding of `panel.katri.points`.** The array
  carve-out matched any binding that descended into the path, and merge-patch replaces a branch
  with a non-object value - so a signed-out slug holder could empty an authored branch, and
  silently, because the bound leaves are then gone from the resolve and no `update` row is written
  to report it. The self-check only ever tried `null` and a scalar.
- **The same guard ran the caller's own JSON key as a LIKE pattern.** `{"%": [1]}` builds `%.%`,
  which matches every dotted binding; `{"matc_": [1]}` matches `match.home.score`. Any predicate
  of the form `x like $user_input || '.%'` has this shape.
- **`npx @noacg/cli` validates against the DEPLOYED studio, not against your checkout.**
  `noacg doctor` prints which - it read `bridge v1 (main@dfac5b9cf2)` here, which is exactly the
  base this branch was cut from, so the gates measured the integrated tree. On a day when the
  deployment is behind, that same line is the warning.
- **Four single-spec jobs at `--cost 0.5` run CONCURRENTLY** - 2.0 of the queue's 2.0
  suite-equivalents - and on a box with 2 GB free that produced two false failures, a 60 s download
  timeout and a 7 s locator timeout. Both passed alone in 3.4 s and 3.2 s. The cost is right for
  the budget and wrong for the RAM; `docs/backlog/ram-floor-by-presence-not-by-guess.md` is where
  that belongs.
- **`e2e-affected` against the stale local `main` reports 159 changed files for this 20-file
  branch** and escalates to the full suite plus the catalog. Given this branch's real base it
  reports the truth: nothing the offline suite covers, and a configured-only change. Pass the base.
- **A `<details>` panel and a `ref` captured earlier do not survive each other.** Adding a step in
  the combined-control composer re-renders the row; the refs for the row's own selects stayed
  stable but the ones around it did not, and `find` does not match a label that lives only in an
  `aria-label`. Re-`find` immediately before clicking, exactly as HB's handoff says.
- **The Bash guard refuses a `git commit -F -` heredoc whose message contains braces and quotes.**
  Write the message to a file with the Write tool and pass its path. Two commits here were blocked
  before that.

## What needs the owner

Nothing blocking, and one thing to look at: the route and the numbers in
`docs/acceptance/owner-queue/2026-09-16-the-proof-case-with-the-profile-in-use.md`. The question
already on HF's and HG's routes is the one that would be expensive to change after 2026-10-20 -
**whether a wait that dies with a browser reload is acceptable on the surface the show is run
from.** One sentence answers it.

## Pointers

- Commits: `1ecf34d8` (the ambiguity fix and every receipt), `fb80327a` (the ledger),
  `3ae9388b` (the guard and the no-op write), `f5f300c7` (re-pointing the review), plus the
  handoff and the stamp commit.
- Check stamp: `npm run stamp` on this branch - review `delegated` (3 findings, 3 fixed, scope
  confirmed: base `dfac5b9c`, 19 files, identical to `review-request.mjs`), simplify `inline`
  (the skill returned fan-out instructions, not a result), verify `inline`, taste
  `not applicable` - nothing here can move what a graphic looks like.
- Verification: `npm run build` exit 0 three times (1713 tests, 1712 pass, 0 fail);
  `scripts/production-data-migration.test.mjs` 14/14; seven queued single-spec runs, `j-1136` to
  `j-1142`, plus `j-1143` and `j-1144` re-running the two that flaked under load.
  `node scripts/e2e-affected.mjs dfac5b9c --list` says nothing the offline suite covers and that
  the configured half needs `test:e2e:live:queued`.
- The ledger: `docs/work-specs/control-panel-any-graphic/work.json`, `converge` open, 0 problems,
  3 gaps, with eleven receipts under `evidence/`.
- Findings filed: `docs/backlog/the-production-page-shows-bare-page-behind-it-when-it-scrolls.md`.
  The receipt `docs/backlog/elamani-biisi-own-control-panel.md` is `advanced`, not removed, and its
  note names the gap.
- The walk's own working folder, outside the repository, with both packages and the pack it
  built: `C:\claude\noacg-hj-walk\`.
- `origin/main` moved to `223a52ad` (pull request 282) during this walk. This branch was not
  merged with it; CI is the pre-merge gate, and that pull request's own freshness rewrite accepts
  this record's shape - it recognises `fail` and `unverified` gaps as an honest partial review
  rather than as a malformed one.
