---
kind: walk
date: 2026-09-16
because: taste
serves: now
---
# The Data tab says what it is for, and its rows line up on a wide screen

You opened this tab on 2026-09-15 and could not tell what "Bind all by title" does, why a second
press changed nothing, or how the boxes work. Four things changed on the tab, all in the
Production data panel and the Bindings table under it. Branch `claude/ta-data-tab-explains-itself`;
the landing is the merge commit whose first parent follows `0e49eeec`.

1. **A drawer under the heading, "How this tab works".** Closed by default. Three short paragraphs:
   what Production data is, what a binding is and how to pick a path, what Tables are for. It ends
   in a link to the docs anchor `/docs#data-example`, which row TB is writing tonight; until that
   lands the link opens the docs page at the top.
2. **One line under "Bindings" that says what the button does**, taken from the code that does it:
   it fills each empty field whose title is the last part of exactly one path, typed paths stay,
   and pressing again changes nothing until the data or the fields change. The per-graphic button
   is labelled "Bind this graphic by title" so its scope is in its own words. The second-press note
   reads "Nothing left to bind. No empty field has exactly one matching path."
3. **The rows are one grid.** Every value row and every binding row starts its box at the same x
   and ends its delete button at the same x, and the whole panel stops growing at 1200px. The
   before and after numbers are in the comment on `.pd-live` in `src/styles/feedback.css`, and
   `e2e/production-data.spec.ts` now measures the claim. Under 900px the rows fall back to flexible
   tracks that still agree with each other, so a phone is not asked to scroll sideways.
4. **Words a student can read.** The unbound box says "pick or type a path" instead of "not
   bound". An ambiguous field says "2 paths match, pick one: match.home.name, match.away.name"
   instead of "ambiguous, matches ...". A bound path with no value says "no value at this path,
   field left alone". The example path everywhere is `show.title`, so a quiz night reads the same
   explanation as a derby.

## Route, in the studio, about a minute

Nothing needs to be published. A local build or the deployment after this lands both work. The
route needs two graphics whose fields are titled **Name**, which every lower third has; a
scoreboard's fields are Team A and Score A and would match nothing here.

1. New project -> **Lower thirds** -> the first card -> Create. Dock **Productions** -> name it
   `Names` -> **Create** -> **+ Add current** -> **Open production page**.
2. New project -> **Lower thirds** -> any other card -> Create. Dock **Productions** -> pick
   `Names` -> **+ Add current** -> **Open production page**.
3. **Data** tab. Under Production data add `match.home.name` = `Finland` and `match.away.name` =
   `Sweden` with the two boxes at the bottom of the list.
4. Read the tab. Open "How this tab works" once, then close it.
5. Press **Bind all by title** twice.

## What to look at

- **The drawer's summary is the first small line under the heading**, and the three paragraphs
  read in one pass. If any sentence needs a second read, that is the finding.
- **The line under "Bindings"** should tell you, before you press, that the button only fills
  empty fields and only where one path matches. The first press says "Nothing left to bind" at
  once here, because both graphics' Name fields match two paths, and the second press says the
  same thing rather than nothing.
- **Every "Name" field says "2 paths match, pick one"** with both paths named, and stays empty:
  the button never guesses between them.
- **On your wide screen**, run a finger down the left edge of the boxes: one straight line, from
  the value rows at the top to the last binding row, and the delete buttons of both blocks on the
  same right edge, with the action buttons at the block's right edge rather than at the far side
  of the monitor. The Tables block below is still full width; that block is not this item's.
- **Click an empty path box**: the browser's own list of the paths above drops down, and typing
  still works. This is the one control this pass did not change, and the drawer now says what
  the list is.

## What this does not cover

The Tables heading's own sentence, one panel down, still carries two em dashes; it lives in a
different file and was left for your read of the whole tab. The docs anchor the drawer links to
is row TB's, not this one's.
