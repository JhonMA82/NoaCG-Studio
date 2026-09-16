# AC-9 - the proof case runs from prompt to dashboard, timed, with the profile in use

**Verdict: fail.** The profile was composed and driven, and every leg of it is timed. It was driven
on the IN-APP production page, not from the hosted control page, because nothing this session could
reach can publish. Reviewed at `dfac5b9cf230532565f57d6988517bb25cdbf94d` on 2026-09-16.

## Conditions

**When:** 2026-09-16, 03:40-04:35 UTC. **Machine:** Windows 10 (10.0.19045), 16 cores, 16 GB, about
2.1 GB free, Node v24.13.0, Google Chrome as the bench browser. **Entrance:** the terminal one,
from `C:\claude\noacg-hj-walk`, an empty folder outside the repository. **CLI:**
`npx -y @noacg/cli@0.3.2`, the published package, no local build. **Deployment for the CLI's
gates:** `https://noacg.studio`, bridge `v1 (main@dfac5b9cf2)` - this branch's own base, deployed.
**Deployment for the dashboard:** this worktree's own dev server (`npm run dev:worktree`,
`http://localhost:5224`), offline.

## The verbs

| Verb | Wall clock | Exit |
|---|---|---|
| `doctor` | 2.886 s | 0 |
| `docs contract` | 1.740 s | 0 |
| `scaffold` (votes board, cold) | 7.181 s | 0 |
| `scaffold` (totals board) | 3.027 s | 0 |
| `validate ./votes-board` | 5.791 s | 0 |
| `validate ./totals-board` | 7.534 s | 0 |
| `inspect ./votes-board` | 2.955 s | 0 |
| `inspect ./totals-board` | 3.076 s | 0 |
| `pack` (both, one production file) | 3.054 s | 0 |

**32.6 seconds of tool time** for the seven authoring verbs. The warm `npx` floor, measured on
`--help`, is **1.739 s**, and every row above pays it before the tool starts - a stranger typing
`npx @noacg/cli …` pays a registry check that the 2026-09-09 walk's local build did not.

## The room's minute

Timed off the page's own clock, so the numbers are the product's and not this session's tooling.

| Step | Time |
|---|---|
| Import the pack through Home › Productions › Import a package, to the production page open | **5.785 s** |
| Compose the combined control, six steps, as walked | **100.0 s** |
| …the last two steps alone, once the form is known | 9.9 s and 7.1 s, so about **4 s a step** |
| Fill the votes cue - song, four performers, five picks, the correct letter (11 edits) | **0.283 s** of product time |
| ⟳ Take the votes cue → on air, board painted with the picks | one press |
| ⟳ Take the totals cue → both layers on air | one press |
| Press the combined control → the reveal, then the three ticked +1s | **3.904 s**, of which 3.000 s is the declared wait |
| First keystroke to the totals board showing the new figures | **83.8 s** as walked |

The 100 s and the 83.8 s are honest and not useful on their own: most of both is this session
finding elements, and a person composing the same control would spend it typing. The numbers that
describe the PRODUCT are the other rows - 5.8 s to import two graphics and a production, 0.28 s to
fill sixteen fields, 0.9 s of product time over a 3 s declared wait to send six steps.

## What the minute looked like

- The cue editor banded itself on the graphics' own titles, exactly as §3d.1 says it would:
  `Panelist 1 / Pick 1` through `Panelist 5 / Pick 5`, then a `Both` band holding the song, the
  four lettered performers and Correct.
- The combined control's composer offered `Votes board`, `Totals board`, `Cue: Votes board` and
  `Cue: Totals board` to act on, and then only what that target declares: `Reveal performer` for
  the votes board, all eleven of the totals board's controls prefixed with their section
  (`Panelist 1 +1`). No verb is offered on a graphic and no event on a cue.
- The button greyed itself with the reason in its title before the votes board was on air.
- On air, the reveal lit the correct performer and marked each pick right or wrong - the graphic's
  own `markGuesses()`, fired from the state's `calls`, not from the dashboard.
- Unticking panelists 2 and 4 sent three of the five +1s, and the board read `1,0,1,0,1`.

## Why this fails

**The hosted control page was not driven, and publishing could not run.** Precisely:

- A linked worktree has no `.env.local`; the file is per checkout and gitignored.
- The only `.env.local` on this machine, in the checkout that holds `main`, carries a single
  `VERCEL_OIDC_TOKEN` and no backend configuration at all. Backend configuration lives in that
  checkout's `.env`, and `root/never-occupy-checkout-holds-feature-branch` puts that checkout out
  of bounds for this work.
- The sanctioned route for a configured run is `npm run test:e2e:live`, whose specs sign in as the
  throwaway test account from that same file. Publishing a production by hand would have meant this
  session authenticating as the owner, which it must not do.

So plan §3c was driven from the in-app production page and not from the hosted page, and the
profile was never pinned on a published `control_shows` row. That is the second half of AC-9 and it
is the same wall HB met on 2026-09-15.

## What the walk found

- **Migration 0060 has never applied anywhere**, so AC-7's hosted half is not merely untested, it
  is absent from the live project. The diagnosis, the reproduction and the one-line correction this
  branch makes are in `ac-7-bound-field-stepper.md`. That is the walk's one real finding and it was
  fixed rather than filed, because it is small and certain.
- **The dashboard leaves an unpainted band when it scrolls.** At 1600×1000 the production page's
  document is 1269 px tall while `#root` is 1000 px, so scrolling to reach the Controls panel slides
  the app's own background off and shows the page behind it. Cosmetic, on the surface an operator
  holds. Filed rather than fixed: it is a layout question about the whole shell, not about this
  chain.
- **Four single-spec jobs at `--cost 0.5` run at once**, which is 2.0 of the queue's 2.0
  suite-equivalents, and on a box with 2 GB free that produced two false failures - a 60 s download
  timeout in `exports.spec.ts` and a 7 s workspace-open timeout in `production-data.spec.ts`. Both
  passed alone on re-run in 3.4 s and 3.2 s. The price is right for the budget and wrong for the
  RAM.
