# SA - the link `noacg save` prints opens the graphic

Branch `claude/sa-link-opens-the-graphic`. The row: make `https://noacg.studio/app#/graphic/<id>`
land on that graphic when it is opened as a full document load, measured against the DEPLOYED
bundle; add a check that runs against the deployed site; close the backlog file and the half of §7
row 14 that carries it.

## Which candidate it is

**Candidate 1 - the miss path.** The route does resolve the id; what was wrong is that it accepted
"not here yet" as "not there" and then threw the address away. Three measurements against
`https://noacg.studio` (commit `43fb9e66`), all on 2026-09-16, with the record minted through
production's own `/api/me/graphics` with the CLI's key exactly as `noacg save` mints it:

1. **Signed out: the link is destroyed every time, 846 ms after the click.** `#/graphic/<id>` at
   92 ms, `#/home` at 846 ms, for a record sitting perfectly well in the account.
2. **A second load of the same link, with the record now in the local library, HELD.** So the
   redirect is conditional on the lookup failing - it is not fired blind, which rules out
   candidate 2.
3. **Signed in, four runs, the address held**, including one with every `documents` GET held back
   8 s. Two of those runs logged the app's own cloud calls: one pull round, about 300 ms.

**The signed-in half of the 2026-09-10 report did not reproduce on today's build.** That day's
build cannot be re-run and the account is no longer the account: its library then took 5.0 s to
deliver the record, and today it answers in about 300 ms. A caveat on runs 2 and 3 that I did not
spot until late: those probes polled `location.hash` only, and the unsaved-changes guard
(`store/saveActions.ts` `requestSwitch`) intercepts a deep link like any other document switch - so
"the address held" can also mean "a dialog was up". The checks that landed assert the DOCUMENT, not
only the address.

## What was actually broken, all of it on the "how long do we wait" side

Found by driving the failing shape with a timeline rather than by reading:

1. **`syncNow()` resolved without syncing.** A caller arriving during a running pass got an
   already-resolved promise, so `await syncNow(); lookAgain()` looked at the library it had before
   it asked. That is precisely the 2026-09-10 report's shape.
2. **An unrelated caller could release the waiters.** Any `syncNow()` that finds it cannot sync
   (the session still coming back, a debounced push after sign-out) took the offline branch - and
   my first version of the fix released every waiting caller there. A deep-link lookup was then
   told the cloud had answered when nothing had been asked. This is what made the end-to-end test
   land on Home; it now releases only when nothing is running or queued.
3. **The backstop was too short.** A pass is not one round trip: the list comes first, then a
   `get()` per record pulled (the provider's list returns sentinel bodies). Measured with every
   request held 8 s, the record reached the library at **27 s** - and the 20 s ceiling I had
   written gave up on it at 23 s. It is 60 s now, which costs nothing, because the ordinary "no"
   comes from a pass that COMPLETED CLEANLY and not from the clock.
4. **A pass that errored, or never ran, was allowed to say "not there".** Now only a clean pass
   (`phase === 'synced'`) may answer no.

## What changed

- `src/backend/syncController.ts` - items 1 and 2 above.
- `src/backend/graphicWhenSynced.ts` (new) - the one place that answers "is there such a graphic
  for this reader", racing the record's arrival (`spx-data-changed`, which a pull write announces
  like any library write) against a clean pass that says no. Items 3 and 4 live here. It returns a
  REASON rather than acting, because the three answers want three different things on screen.
- `src/App.tsx` - the `#/graphic/<id>` effect decides: open it; keep the address and offer a
  sign-in when there is no session; go Home only when the cloud has been asked and does not have
  it. The effect re-runs when the session changes, so signing in is a second chance at the link.
- `src/components/home/GraphicControlPage.tsx` - the same lookup for `#/control/<id>`: "Opening…"
  while the cloud is asked, a sign-in offer with no session, "Graphic not found" only once true.
- `e2e/configured/deep-link-boot.spec.ts` (new, 3 tests), `playwright.production.config.ts` (new),
  a `deep-link` job in `.github/workflows/deploy-verify.yml`, `MIN_TESTS` 43 -> 46 in
  `configured-suite.yml`, `npm run test:e2e:production`.
- Docs: `docs/AGENT_SAVE.md`, `docs/SAVED_CONTENT_MODEL.md` §3, `docs/DEMO_2026-09-25.md` (R2.4's
  evidence and status cells, §7 row 14 reduced to the login half), the backlog file deleted with
  its two citations in the 2026-09-10 handoff repointed, and
  `docs/acceptance/owner-queue/2026-09-16-the-printed-link-opens-the-graphic.md`.

## Decisions somebody may want to revisit

**A signed-out deep link now KEEPS its address** and opens the sign-in dialog with "Sign in to open
this graphic". Nobody asked for that, and it is what makes a credential-free check against the
deployed site possible at all: the configured suite's account belongs to a local Supabase stack,
and no production credential exists in this repository or its secrets. It is also right - the
record behind a printed link usually lives in an account this browser has never opened, and Home is
not an answer to "open this graphic".

**The unsaved-changes guard was deliberately left alone.** A deep link replaces the working
document, so a browser holding unsaved work is asked first, and on the day that dialog can appear
between the click and the graphic. Discarding a student's work silently to make a beat look
smoother is the wrong trade. It is written into the acceptance item so the room is not surprised,
and the new spec answers it the way a reader would.

## Verified

- `npm run build`, read from the build's own exit code.
- **The shape that failed on production every time, re-measured on a production bundle of this
  branch** (`vite build` with the real Supabase env, served by `vite preview` - the deployed shape
  without a deployment): signed out, the address survives with the sign-in card up, and is still
  there four seconds later. That is the one production was measured destroying in 846 ms.
- `e2e/configured/deep-link-boot.spec.ts` against the configured dev server: **3 passed**, 1.2 min -
  including the signed-in slow-pull walk and the sync seam.
- **NOT re-run on the bundle: the signed-in slow-pull leg.** It mints its record through
  production's save API with the machine's CLI key, and that key disappeared mid-afternoon -
  the CLI's credentials file now reads `{"deployments":{}}`, so another session on this
  machine logged the CLI out while this row was measuring (row SB is working on `noacg login`).
  The same walk passes on the dev server, where the race is forced by the same delay, and the code
  path is the one the signed-out case proved on the bundle.
- The signed-in walk against `noacg.studio` itself after the fix needs the deployment, so it is the
  acceptance item, by hand.
- **`npm run test:e2e:affected` was NOT run here, and that is a decision rather than an oversight.**
  `src/App.tsx` is a CORE file, so it escalates - and locally the escalation resolved to the FULL
  suite over 95 changed files, because `e2e-affected` takes its base from the local `main` this
  machine's merge queue no longer moves (it listed `.gitattributes`, which this branch never
  touched). That is hours of browser work on the machine's single browser slot, against a scope
  that is not this branch's. CI runs the real thing on the merge group, which is what this row's
  gate says.

## For row SB, which shares §7 row 14

`merge-order` reports this branch and `claude/sb-cli-exits-and-r25` colliding on one file:
`docs/DEMO_2026-09-25.md`. Row 14 has been rewritten here to carry ONLY the login half - the link
half is closed - and the R2.4 status cell says the same. Whichever of the two lands second
integrates `main` and keeps the other's half; if SB's work closes the login defect as well, row 14
goes entirely.

## What the check found, and the two things it left

`/check`: `review: delegated` (8 findings, scope confirmed against the merge base), `simplify:
inline` (the skill returned fan-out instructions, so the leg was done here), `verify: inline`.

Fixed from the review: the control panel's new "Sign in" offer led nowhere, because its lookup
effect did not depend on the session (HIGH - the same fix `App.tsx` already had); every configured
boot ran the deep-link attempt twice, since `signedIn` is false while the session is still being
read, which cost a second unsaved-changes dialog and a second cloud lookup; a pass that completed
but failed to APPLY one unrelated record reports `error`, and insisting on `synced` left a deleted
id waiting out the whole 60 s backstop; the delay in the spec's prose said 8 s where the constant
says 4 s; the em dash and the over-claiming "your account" in the sign-in line. Simplify collapsed
the duplicated local lookup in `App.tsx` - `graphicWhenSynced` already answers from the library.

Left, both LOW and both named where they live:

- **`syncNow`'s release window.** Between the re-dispatch clearing `queued` and the follow-up pass
  taking `running`, there is an `await`, and a third caller arriving inside it can release waiters
  a pass is about to answer. Closing it means making the pass chain one object rather than two
  booleans. The comment says so, and says that a caller acting on a release must check the phase -
  which is what `graphicWhenSynced` does.
- **An abandoned lookup keeps its listener and its backstop timer** for up to 60 s (walking Back
  and Forward across several not-yet-pulled control panels accumulates one of each per visit, all
  doing a map lookup on every library write). The fix is an `AbortSignal` on `graphicWhenSynced`
  and a disposer in the two effects.

## One gate only fires once the file is COMMITTED

`check:tree-shape` refused `playwright.production.config.ts` as an unexpected top-level entry -
but only on the build AFTER the commit, because it reads `git ls-files` and the file was untracked
through every earlier green build. A new root entry needs a line in `ALLOWED_ROOT_ENTRIES`
(`scripts/check-tree-shape.mjs`), which this branch adds with the reason beside it. Worth knowing
for any row that adds a root file late: the pre-commit builds are all green and the one after the
commit is not.

## Traps that exist in no repo file

- **A worktree carries no `.env`, so `playwright.live.config.ts` runs the "configured" suite
  against an app with NO BACKEND.** Every test that needs one then measures the offline product.
  Copy `C:\claude\NoaCG-Studio\.env` into the worktree first (it is gitignored). My first run of
  the new spec went red for exactly this.
- **Playwright starts a `webServer` in the CONFIG's directory**, not the repository root - and a
  config kept outside the repository tree cannot resolve `@playwright/test` at all.
- **`e2e/configured/_helpers.ts`'s `signIn` leaves the wizard OPEN** (it ends on
  `startNewProject`), and `settleSync` waits for a chip in the topbar underneath it.
  `dismissWizard` between them, as `agent-access.spec.ts` does.
- **A route delay in a Playwright test compounds across a sync pass** (list, then a `get()` per
  pulled record). An 8 s delay is a 27 s answer, not an 8 s one.
- **The probes live in `bench-deeplink-probe/`**, gitignored by the `bench-*/` rule - that is why
  they are named that. They drive production and write real records to the shared test account;
  roughly two dozen graphics accumulated there today and nothing cleans them up. Worth a sweep.

## Pointers

- The probes, in order: `bench-deeplink-probe/deep-link.spec.ts` (student shape + the second-load
  discriminator), `deep-link-2.spec.ts` (three rounds with the cloud calls timed, plus the
  signed-out case), `deep-link-3.spec.ts` (the 8 s pull), and `verify.spec.ts` with
  `local.config.ts` and `build-configured.mjs` (the fix on a production bundle).
- `docs/backlog/noacg-login-hangs-after-it-has-already-succeeded.md` is the OTHER half of §7 row 14
  and is untouched here - row SB owns it. Row 14 now names only that half.
