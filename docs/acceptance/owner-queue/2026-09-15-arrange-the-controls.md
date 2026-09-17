---
kind: walk
date: 2026-09-15
because: taste
serves: now
---
# A production can arrange its own control block

The football principle, built: a graphic declares twelve controls at equal weight, and the show
decides which four are under the hand. Order, a shown name, pinned and hidden, per graphic, on the
in-app production page, the hosted control page and the exported controller.

## Route, under a minute

From this feature worktree, `npm run dev`, then:

1. New graphic → **Club Scorebug** → Create.
2. Right dock → **Control** tab → Productions → name it `Club Match` → Create → **+ Add current**
   → **Open production page**.
3. Scroll past the ⚡ GRAPHIC ACTIONS block to **CONTROLS** and click it open.
4. On `Start clock` press **★ Pin**. On `Stop clock` type `Stop the clock` into its box, then
   press **● Shown** to put it away.

## What to look at

- **The ⚡ block above it changed while you were typing.** Start clock is now on its own row above
  a hairline, out of the Clock section; Stop clock is gone from the block and sits under a
  **More (1)** drawer wearing the words you typed.
- **Press ⟳ TAKE, then open More.** "Stop the clock" is greyed, because the machine has no arrow
  out of `armed` — exactly as it was when it was visible. Press **Start clock** and it comes alive.
  That is the line this whole feature stands on: the profile moved where a control sits and what
  it is called, and could not touch what it does or when it is legal.
- **Press Delete profile.** The generated panel comes back whole, and the record goes back to
  having no profile at all rather than an empty one.
- The drawer, not deletion, is the judgement worth arguing with. `hidden` reads as "out of the
  panel" in the format, and I render it as one collapsed line instead. An operator on the hosted
  page is often on a phone away from the laptop that authored the show, and a control they turn
  out to need should be one tap away rather than a trip back to the app.

## What this does not do

- **COMBINE is not built.** The profile's other half — one button that sends several steps, with
  a delay and a tick — is AC-6 and a row of its own. This is AC-5, the presentation half.
- **The field bands are still derived from the field titles** and are not arrangeable, on your
  2026-08-21 rule. AC-5's text says ARRANGE applies to "the ⚡ actions block and the cue editor";
  the format has no vocabulary for a field, so I built the first half and left the second alone.
  If you want a production to order its own fields, that is a new decision, not a missing piece.
- **The hosted page is not in the offline suite.** Mounting it needs a configured backend, so the
  in-app and exported deployments are pinned by specs and the hosted one is step 9 of the
  live-verify checklist in `docs/CONTROL_LAYER.md`. That check is worth doing before 2026-10-20,
  because it is the surface the show is actually operated from.

## One thing worth knowing

Migration 0059 widens `control_show_by_slug` to return the profile column, and **it needs no
action from you** — it lands with the branch. The previous row deferred this believing
`npm run db:push` would refuse the drop-and-create such a function needs; the classifier already
exempts a DROP of an object the same migration creates back, which is how migration 0031 did this
exact thing. Measured on the file: 4 statements, no findings.
