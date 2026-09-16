# The hosted half is closed, and the ledger with it

The one gap HJ's review left - no profile had ever been driven on the hosted control page - is
closed by a walk that runs in CI. `e2e/configured/hosted-control-profile.spec.ts` publishes a
production carrying an ARRANGE, a combined control with a delayed step and two ticks, and three
bound fields, then opens the capability URL in a signed-out browser context and drives it. AC-5,
AC-6, AC-7 and AC-9 are re-reviewed against `configured-suite` run `35062005497`; converge reads
`evidence-complete` with all ten criteria passing.

## What is left, and why

- **Nobody has LOOKED at the hosted page with a profile on it.** Every hosted claim in the
  receipts is structural - text, attributes, counts, rows, server timestamps - and none of it
  judges how the surface reads on a phone. "Above the fold" is asserted as document order. The
  owner-queue item is the three-minute route for the eye that can settle it, and that is the one
  thing before 2026-10-20 that no gate can do.
- **Two operators, and the batch cap** (live-verify step 10 in `docs/CONTROL_LAYER.md`) are
  unwitnessed anywhere. The multi-operator claim - a delayed step counting from the WIRE rather
  than the cue, so two phones move a score by two - is pinned as a RULE offline and never as
  behaviour. It is the strongest candidate for a second hosted case and it needs a second browser
  context, which this file now has the shape for.
- **The DROP has not been seen on the hosted feed**, only its resolution over the published bytes
  and its rendering in-app. Driving a graphic into a refusing state mid-press against a real
  backend is the work.
- `docs/GOALS.md` NOW still carries "The production control profile, for 2026-10-20" as an
  unticked box. All ten rows landed and all ten criteria pass, so it is tickable; it was left
  alone because GOALS was not this row's to edit and another session may be in it.

## Evidence and traps that exist in no repo file

- **`configured-suite.yml` does NOT run on a feature-branch push.** Its `on:` is `push` to `main`,
  a cron, and `workflow_dispatch` - and all twenty historical runs are `main` pushes. The row's DO
  step said the push would trigger it and its TRAPS said never to dispatch it; the first half is
  false, which makes the second half's premise false with it. **Dispatch on the branch ref** is the
  supported route and the workflow was built for it: its rolling-issue steps are branch-guarded
  with a comment that exists precisely so a WIP branch cannot raise or withdraw a `main` alarm, and
  `docs/VERIFICATION.md`'s "never dispatch" rule is about dispatching to see whether a CRON fires,
  which `nightly-drift.yml` filters to `--event=schedule` so a dispatch cannot mask it. Four runs
  were dispatched here and none touched issue #38.
- **`context.newPage()` is NOT a signed-out page, and nothing in a spec says so.** The Supabase
  client persists its session in localStorage, so a page opened in the publisher's own context
  carries the owner's token and every RPC succeeds on the owner's grants. A walk written that way
  passes green with `anon` holding no grants at all - which is the entire capability-URL claim,
  silently unproven. `browser.newContext()` is the fix, as `output-url-cannot-push.spec.ts` already
  does. **`e2e/configured/hosted-control-recovery.spec.ts` has the same shape and the same
  "signed OUT (incognito)" comment**, on the boot-replay walk; it is not this branch's file and was
  left alone, but its claim is worth the same five-line fix.
- **The hosted control page shows NO machine state with no renderer attached.** Legality is judged
  against the graphic's last REPORT and only the receiver injected into a real renderer
  (`src/control/hostedReceiver.ts`) ever calls `control_report`. So with no output URL open, ⚡
  buttons never grey or un-grey on state - only on whether the cue is up - and a hand-walk reads
  that as a fault. It cost this row one red CI run: an assertion that the fired reveal greys its own
  button is unsatisfiable on a rig with no renderer. The owner-queue route now says to open the
  output link and why.
- **`control_events` is not only commands.** `control_stage` writes a `staged` row and
  `control_report` a `live` row (migration 0008), so "one row per step" has to filter before it
  counts. The spec drops both at the source rather than at each assertion.
- **`scripts/jobs.mjs add` takes the COMMAND FIRST**, then the flags: `add "<cmd>" --cost 0.5`.
  The row's GATE line had them the other way round and the script refuses it with its usage.
- **`MIN_TESTS` in `configured-suite.yml` had drifted twice** - 35 against a suite of 39, then 36
  against 43 - and `scripts/configured-verdict.mjs` only compares the TOTAL against it, so every
  test of slack is a test that can silently stop being collected. It is 43 now, which is the
  suite's actual size. **`hosted-latency.yml` runs the same specs through the same verdict script
  and still says 33**; that is a second floor, on another branch's file, tracking nothing.

## What needs the owner

Nothing blocking. One sentence would settle the question HF, HG and HJ have each put on his route
and this row cannot: **is a wait that dies with a browser reload acceptable on the surface the show
is run from?** It is the expensive one to change after October.

## Pointers

- Commits: `84586770` (the walk), `ac0c53ac` (the cancel), `66b00080` (the greying correction),
  `f97ec0f1` (receipts, plan, live-verify, the filed finding, the deleted owner receipt),
  `9c7d93af` and `b9f7c39f` (re-pointing the review), `0079711f` (the check's fixes), `ea39b693`
  (the ledger).
- Check stamp: `ea39b693` PASS - review `delegated` (7 findings, 6 fixed, 1 reported as another
  file's), simplify `inline` (the skill returned fan-out instructions), verify `inline`, taste
  `not applicable` - nothing here can move what a graphic looks like.
- CI: `configured-suite` `35062005497` green (43 passed, 0 skipped) on the final spec;
  `35057360476` and `35059312926` green on earlier ones; `35058398961` red on the unsatisfiable
  greying, described in `ac-6-…`. `ci.yml` `35057295179` green. `post-land.yml` `35055657854`
  green, and **0060 applied to production and staging there** - its first execution anywhere.
- Offline gate: `e2e/hosted-control.spec.ts` through the queue as `j-1147`, 12 passed, 58.4 s.
- The ledger: `docs/work-specs/control-panel-any-graphic/work.json`, `evidence-complete`,
  0 problems, 0 gaps, 0 open criteria, anchored at `b9f7c39f`.
- Owner-queue item: `docs/acceptance/owner-queue/2026-09-16-a-profile-driven-where-the-show-is-run.md`.
- Filed: `docs/backlog/a-renamed-control-still-wears-its-section-in-a-combined-step.md`.
- Deleted: `docs/backlog/elamani-biisi-own-control-panel.md`, served. Its one open question, whether
  the boards air through Yle's own playout, is carried in the owner-queue item rather than lost.
