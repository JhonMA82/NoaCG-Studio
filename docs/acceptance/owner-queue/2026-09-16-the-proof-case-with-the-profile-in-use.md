---
kind: walk
date: 2026-09-16
because: taste
serves: now
---
# The Elämäni biisi minute, with the profile in use, timed

The second walk of the proof case (`docs/CONTROL_PANEL_ANY_GRAPHIC.md` §5 row 8): both graphics of
§3a and §3b put through the shipped CLI, imported as one production, the "Reveal performer, then
after 3 s the +1s" control composed in the room, and plan §3c driven. It ran on the IN-APP
production page. The hosted control page could not be reached, and that is the one thing below that
needs you to know rather than to look.

## Route, in the app, about three minutes

From this feature worktree:

1. `npm run dev:worktree`, then open the port it prints and go to **Home › Productions ›
   Import a package**. Import
   `e2e/fixtures/agent-made/elamani-biisi.noacgpack.json`. It lands you on the production page with
   two cues: Votes board on layer 7, Totals board on layer 8.
2. Scroll the cue editor to the bottom and open **CONTROLS · as the graphic declared them**.
3. Under **COMBINED CONTROLS**, press **+ Combined control**. Name it `Reveal, then the +1s`.
   Add six steps: `Votes board` → `Reveal performer`; then `Totals board` → `Panelist 1 +1` with
   **after 3 s** and **Ask, ticked**; then `Panelist 2 +1` through `Panelist 5 +1`, each **Ask,
   ticked**, no wait.
4. In the votes cue, set the five picks to A, C, A, B, A and **Correct** to A. **⟳ TAKE**.
5. Click the **Totals board** cue in the rundown. **⟳ TAKE**. Both layers are now on air.
6. Untick **Panelist 2** and **Panelist 4** beside the combined button, and press
   **⚡ Reveal, then the +1s**.

## What to look at

- **The button greys with its reason in the tooltip** before the votes board is on air:
  "Greyed because the first step cannot go: Votes board is not on air."
- **The wait counts down on the button itself** - `· 3s`, then `· 1s` - and the three ticked +1s
  land together when it reaches zero.
- **The board reads 1, 0, 1, 0, 1.** The two you unticked did not move. On air, the reveal lit the
  correct performer and marked each pick right or wrong - the graphic's own code, not the
  dashboard's.
- **The cue editor bands itself on the graphics' own titles**: Panelist 1 / Pick 1 down to
  Panelist 5 / Pick 5, then one shared band for the song, the four lettered performers and Correct.
- **Delete profile** at the foot of the Controls panel takes the whole thing away in one press and
  leaves the panel the graphics generate.

## The numbers

Measured 2026-09-16, Windows 10, Node v24.13.0, `npx -y @noacg/cli@0.3.2` against
`https://noacg.studio` (bridge `main@dfac5b9cf2`), dashboard on this worktree's own dev server.

- **32.6 s of tool time** for the seven authoring verbs: scaffold 7.2 s and 3.0 s, validate 5.8 s
  and 7.5 s, inspect 3.0 s and 3.1 s, pack 3.1 s. Both graphics validated with 0 errors and
  0 warnings and every readiness line PASS.
- **5.8 s** to import the pack and land on the production page with both graphics and their layers.
- **About 4 s per step** to compose the combined control once the form is familiar; six steps took
  100 s as walked, most of it this session finding its way around the form rather than the product
  working.
- **0.28 s** for the product to take sixteen typed field values.
- **3.9 s** from the press to the board showing the new totals, of which **3.0 s is the wait you
  asked for**. Six steps, one press.

## What could not run, and what it cost

**The hosted control page was not driven and nothing was published.** A linked worktree carries no
backend configuration, the only `.env.local` on this machine holds a Vercel token and nothing else,
and publishing by hand would have meant this session signing in as you. So the profile has still
never been seen on the surface the show is actually run from. Steps 8, 9 and 10 of the live-verify
checklist in `docs/CONTROL_LAYER.md` are that walk, and they need a checkout that carries the env.

**One real defect came out of the walk and is fixed here.** Migration 0060 - the one that lets a
`+1` on the hosted page move the shared value instead of one graphic's field - has never applied
anywhere. Its own self-check refused it on the post-land push after pull requests 280 and 281, on
an ambiguous SQL column reference, and rolled the whole file back each time. The cause was
reproduced and the correction proved on the real database, in a throwaway session schema that
touched nothing. It applies on the next landing; until it does, a `+1` made from the hosted page
writes one field and the next shared write puts it back.
