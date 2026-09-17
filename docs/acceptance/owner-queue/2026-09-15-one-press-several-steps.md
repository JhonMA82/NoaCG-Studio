---
kind: walk
date: 2026-09-15
because: taste
serves: now
---
# One press, several steps, one of them three seconds later

The Elämäni biisi press, built as the general primitive you asked for rather than as that
workflow: a production makes a button out of steps its graphics already declare, any step can be
held for a few seconds, and any step can be offered as a tick the operator decides on the night.
No condition, no loop, no second clock.

## Route, under a minute

From this feature worktree, `npm run dev`, then:

1. Home → **Productions** → **Import pack** → pick
   `e2e/fixtures/agent-made/elamani-biisi.noacgpack.json`. You land on the production page with
   the two agent-made boards already cued.
2. Scroll past the ⚡ block to **CONTROLS**, click it open, then **+ Combined control**. Name it
   `Reveal + points`.
3. First step: *Act on* `Votes board`, *Control* `Song Reveal performer`, **+ Add step**.
4. Second step: *Act on* `Totals board`, *Control* `Panelist 1 +1`, **after `3` s**, *Ask,
   unticked*, **+ Add step**.
5. Same again for `Panelist 2 +1` and `Panelist 3 +1`, leaving *after* empty and *Ask, unticked*
   on both.
6. Close the panel. Press **⟳ TAKE**, click the second cue in the rundown, **⟳ TAKE** again, then
   click back to the first cue.

## What to look at

- **The button is greyed before you take anything**, and its hover says which step cannot go and
  why — the FIRST step, never the ones after it. A walk's later steps are illegal at the moment
  its first one is pressed; that is what a walk is.
- **Tick two of the three panelists, then press it once.** The performer is revealed at once.
  The button then wears the amber accent and counts `3 · 2 · 1` — and three seconds later exactly
  the two panelists you ticked gain a point, on the other board, with the third untouched.
- **Open Activity.** One row per step, in order, on the same log every Take and Update lands on.
  Nothing about a combined control is a special kind of command.
- **Press it again, and press the countdown while it runs.** The tail never goes, and the feed
  says so. Taking the graphic off air does the same thing — Out is the stop.
- **The figures stuck.** Click the totals cue: its Points boxes read what air reads, so ✎ Update
  cannot put the score back.

The judgement worth arguing with is the tick's WORDING. The totals board labels all five of its
controls `+1`, so five ticks reading "+1" would be useless; I prefix the author's own section, so
they read `Panelist 1 +1`. If you would rather see the raw label, it is one line.

## What this does not do

- **The wait lives in the browser tab that pressed.** Reload it mid-countdown and the unsent tail
  is gone — nothing is retried behind your back, and you press it again by hand. That is the cost
  §6d of the plan accepted rather than building persistence, and the button's hint says it out
  loud. If you want a wait that survives a reload, that is a new decision.
- **Only the in-app page has it so far.** The hosted control page is its sibling row; the exported
  offline controller deliberately never gets it, on your 2026-09-15 ruling about a second
  production runtime.
- **A step cannot write field values from here.** The format carries that third kind of step and
  the page sends one, but composing it would mean a text box taking a VALUE, and the authoring
  panel takes only a name and a number of seconds on purpose.
