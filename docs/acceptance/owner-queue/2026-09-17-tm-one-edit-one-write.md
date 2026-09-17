---
kind: walk
date: 2026-09-17
because: taste
serves: now
---
# Typing a value on the Data tab is one save, not one per letter

## Before

Every character typed into a value box or a binding path box on a production's Data tab wrote the
whole store. Measured, not guessed: a Playwright probe wrapped `localStorage.setItem` and counted
the writes to the production-data key while twelve characters were typed into one box. The count
was **12**. Five characters into a clock field were **5**.

Published, each of those is an HTTP PATCH against the data API, whose ingest budget is 25 requests
per 5 seconds. Retyping an eleven-letter team name spent half of it; a slower correction spent all
of it and the rest were refused. The refusal handler answers by re-reading the server's tree, and
that tree - the older one - lands in the box the operator is still typing into, so the word being
typed is replaced mid-letter.

A binding box was worse in kind: typing `match.home.name` saved fifteen bindings, fourteen of them
to paths that do not exist, each one a synced write to the show record.

## After

The same probe counts **1** for the same twelve characters, and 1 for the walk-away case. The box
holds what is being typed and saves it when the edit is over: leaving the box, pressing Enter, half
a second of not typing, or leaving the tab. While a box holds an unsaved edit it has an amber
border, and nothing arriving from anywhere else can put a value in it - the typed value wins that
one path when it saves, and every other value that arrived meanwhile is kept.

The steppers, Apply JSON, Reset to seed, Clear and Move numbers are single presses and still act
the instant they are pressed.

## Route (under a minute)

1. `npm run dev`, open any production, then the **Data** tab (it opens in its own browser tab).
2. Add a value: path `match.home.name`, value `Suomi`, **+ Add field**.
3. Open the browser's network panel (or, unpublished, watch Application to `spx-gfx-production-data`
   in Local storage), select the whole value in its box and retype `Helsinki IFK`.
   - **Before:** one write per character - twelve, and on a published production twelve PATCHes with
     the last of a fast run answered `429`.
   - **Now:** the box turns amber while you type, and one write lands about half a second after you
     stop - or the moment you click out of the box or press Enter.
4. Type into the box and leave the mouse alone: the value is saved anyway, half a second later.
5. Type into a binding path box and watch the same thing: `match.home.name` is one binding saved,
   not fifteen.

## What I saw when I did this myself

Driven in the running app, not only in a test. Twelve characters into a value box: **one** write,
the box amber while typing, the value saved about half a second after the last letter. The amber is
distinguishable from focus because this app's focus style is an outline and this is the border, so
a box that is both focused and unsaved says both things at once. A two-line list typed down to one
line and then LEFT ALONE stayed a text box with the caret still in it and saved as a list - the one
place this could have thrown the caret out, and it does not.

## What I decided, and what is left for your eye

The write count is a number and a test holds it at one, so nothing there needs you. Two things on
screen are judgement calls I made and you can overrule by looking at them:

- **Half a second of quiet** before an unattended edit saves. Long enough that a whole typed word is
  one save, short enough that it lands before you have looked away. Leaving the box or pressing
  Enter is still instant.
- **An amber border while a box holds an unsaved edit.** The same amber this product already uses
  for "armed, not done". It says why a value on this screen and a value on air can differ for a
  moment, which they now can.

## What changed

`src/components/home/ProductionDataPanel.tsx` holds a box's text in the component until the edit is
over (`useDeferredEdits`, commented there with the rule for a box under the cursor). `src/styles/
feedback.css` gives a box with an unsaved edit an amber border. Three tests in
`e2e/production-data.spec.ts` pin it: the write count for a twelve-character edit, the unattended
edit that saves without the box being left, and a write arriving from another tab while a word is
being typed.
