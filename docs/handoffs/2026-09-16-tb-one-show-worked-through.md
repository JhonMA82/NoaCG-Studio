# TB - one show, worked all the way through

**Branch:** `claude/tb-one-show-worked-through`, three commits on `20d4b094`.
**Gate:** `npm run build` green, read from its own exit code (`EXIT=0`), three times: after the
first draft, after the screenshots landed, and after the check's fixes.
**Check:** `review: delegated` (9 findings, 9 fixed), `simplify: inline` (the skill returned
fan-out instructions, so the four angles were covered here), `verify: inline`,
`taste: not applicable` - nothing here can move what a graphic looks like on air; the pixels this
branch changes are two dashboard panels, and both were measured before and after.

## What landed

`/docs#data-example` is one small imaginary show that uses production data, bindings and tables
together, and `#audience-no-chat` is the same show growing an audience. Both anchors are exactly
as the prompt named them, and `#data-example` is a top-level `<section>` with a nav entry under
"Run the show", because tables were not documented anywhere on `/docs` before this and a reader
who cannot find the page cannot be helped by it.

**The show is Hall Cup**, a school sports night: Match Strip and Quiet Score (Scoreboards),
House Wire (Tickers), House Strap (Lower thirds); a tree of `match.teamA/scoreA/teamB/scoreB` and
a `tickerItems` list; one press of **Bind all by title** binding nine of the thirteen fields; a
table called Interviews with two columns and three guests.

**Two scoreboards, not one, and that is the whole design of the example.** The section's headline
claim is that one value moves every graphic that reads it. A pool where no two graphics ever want
the same number can only assert that; two boards carrying the same four field titles, landing on
the same four paths from one press, show it. If a later edit trims the pool to three graphics the
section quietly loses its point, which is why `e2e/docs.spec.ts` names all four.

**Seven screenshots**, all from `scripts/docs-shots.mjs` against that exact production, blocks 4
to 10. The script gained a `clipBetween` helper for the strips no single element wraps, a `blur`
before the shutter, and it now prints each PNG's pixel size because `docs.html` hard-codes
width/height and the spec fails when the two disagree.

## What I found by driving it, and did not write around

**The Bindings rows were laid out by a five-column grid that a bound row only ever filled four
of** (commit 1, `src/styles/feedback.css`). The unbind ✕ landed in a `0.9fr` track and drew 336px
wide; and because each row is its own grid with an `auto` track in it, every row sized its columns
from its own content, so the path inputs sat up to nine pixels apart down the list. Measured
373/381px first columns and a 336px button before, 386/386 and 28px after.

**`.pd-live-row` had the identical defect** and I had photographed it before the review caught it:
the ± stepper renders only for a NUMBER leaf, so a string or list row has four children, the ✕ fell
into the 64px stepper track and drew twice its size 40px left of its neighbours. Same repair,
measured: every row's ✕ is now 28px at the same x whatever the leaf type. **Both are in
`src/styles/feedback.css` and neither is touched by any e2e assertion** - I grepped. That is why
they survived: nothing in the repo measures either row's geometry, and the only thing that caught
them was publishing a picture.

**Two backlog items, both real and both filed rather than worked around:**

- `docs/backlog/the-join-page-prompt-never-follows-the-mode.md` - the viewer's page says "Send us
  your question" over a comment box and over a ballot. Both providers seed that literal string
  (`localAudience.ts:98`, migration `0035:59`), `setState` accepts a `prompt` patch and no surface
  in the app ever sends one. `joinSurface.ts` already has `defaultPrompt(mode)` and only reaches
  it when the prompt is empty. I kept that frame out of the docs and the page now says the heading
  is the same in both modes, because a reader choosing Comments will hit it tonight.
- `docs/backlog/the-audience-tab-never-says-how-the-room-gets-in.md` - the Audience tab's first
  panel is Chat sources, wanting Twitch or YouTube. The join link is on another tab, behind Links,
  and that popover does not exist until the production is published. The one line pointing at it
  renders only when `backend.simulate` is absent, which is the published case - so the person who
  most needs telling is the one not told. `#audience-no-chat` works around it by saying "publish
  first", which is the right instruction in the wrong place.

## Evidence and traps that are in no repo file

- **An unpublished production on an offline build has no Links button at all**
  (`production-links-toggle` renders zero times; `production-publish` renders once, disabled).
  That is why the audience half opens with "publish first" rather than with the link.
- **The vote tally is POLLED at 2 s**, not pushed. My first capture fired the shutter 600ms after
  pressing Simulate votes and photographed three zeroes, which reads as a broken product. It is
  not a bug; the shot waits 2.6 s and says why.
- **`clip` on a Playwright screenshot is viewport-relative unless `fullPage` is also set**, in
  which case it is page-relative. Two capture rounds were lost to this: scrolling a region to the
  top of the pane put the live tree's heading under the dashboard's sticky topbar, and a region
  near the bottom of a long page cannot be scrolled to the top at all once the pane is tall. The
  helper now takes document coordinates and never scrolls.
- **`svg-fields.png` and `svg-behaviour.png` are not byte-stable across runs.** Re-running the
  whole script changed both without any input changing, so I restored them from HEAD. Anyone
  regenerating shots should re-run with `--only=` and check `git status` before committing, or an
  unrelated screenshot rides along in the diff.
- **The Data tab and the Audience tab open in their OWN browser tab** (`e2e/_workspace.ts`). A
  screenshot script navigating to `#/production/<id>/data` directly, as this one does, bypasses
  that and is simpler; a spec must not.

## Anything needing the owner

Nothing blocking. The acceptance note
(`docs/acceptance/owner-queue/2026-09-16-tb-one-show-worked-through.md`, `kind: walk`,
`because: taste`) asks him to read the section and judge one thing: whether the "Which of the two
you want" table makes the distinction land. If it does not, that is the paragraph to argue with
rather than the whole section.

One honest boundary is on the page in its own words: the published
`noacg.studio/join/<name>` link needs an account and the hosted backend, and this build has
neither, so it is the single step not driven. Everything else was.

## Pointers

- `scripts/docs-shots.mjs` blocks 4 to 10 build the example; `--only=<name>` re-runs one. A dev
  server must be up (`node scripts/dev-worktree.mjs`), and the run is browser work, so it is
  queued: `npm run queue -- "node scripts/docs-shots.mjs --only=data-tree"`.
- `docs/PRODUCTION_DATA_PLAN.md` §16 records why the example exists and what the two grid repairs
  were, so the next person working on that panel finds them from the plan rather than from git.
- Row TA was editing `src/components/home/ProductionDataPanel.tsx` in its own worktree tonight and
  is expected to link the Data tab at `/docs#data-example`. I touched neither that file nor that
  link; the spec comment says the link is intended, not that it exists.
