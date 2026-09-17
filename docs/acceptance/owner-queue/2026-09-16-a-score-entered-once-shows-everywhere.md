---
kind: walk
date: 2026-09-16
because: taste
serves: now
---
# A score entered once shows everywhere

Your 2026-09-15 ask, built. When a field is bound to the production's data, a ± press and an ⚡
`+1` no longer write that one graphic's field - they move the shared VALUE, and every graphic
bound to it follows. Put the same score on a big strip and a small bug, press once, and both
change. Nothing about an unbound field moved: those steppers are exactly what they were.

The offline export deliberately does not get it. It carries no data tree at all, so its field
stepper stays a field stepper, which is your 2026-09-15 boundary ruling held where it needed
holding.

## Route A, in the app - offline, about two minutes

From this feature worktree with `npm run dev`:

1. New project -> **Scoreboards** -> **House Score** -> Create. Dock **Productions** -> name it
   `Derby` -> **Create** -> **+ Add current** -> **Open production page**.
2. New project -> **Scoreboards** -> **Club Scorebug** -> Create. Dock **Productions** -> pick
   `Derby` in the list -> **+ Add current** -> **Open production page**. Two cues now, on layers
   20 and 21.
3. **DATA** tab. Under *Live values*, path `match.home.score`, value `0`, **Add**. In the
   bindings table below, type `match.home.score` into **House Score / F1 Score A** and into
   **Club Scorebug / F1 Score A**. Both rows go green with the current value beside them.
4. Back on **PLAYOUT**: **⟳ TAKE** the first cue, click the second cue in the rundown,
   **⟳ TAKE** it. Both boards are on air, both reading 0.

### What to look at

- **In the cue editor, F1 has no box.** It reads out, greyed, wearing a 🔗 chip with its path.
  That is the rule that stops the whole thing lying: a bound field is not a cue value, so there
  must be nowhere to type one that nothing would ever air. An empty one says `not set yet` rather
  than sitting blank.
- **Press `+` in ± LIVE NUMBERS on Score A.** BOTH boards move. That is the one thing this row
  exists for - before today the press moved the board you were looking at and the next shared
  write put it back.
- **Go back to the DATA tab.** `match.home.score` reads 1, and its type still says **number**.
  The press wrote the value, not a string that happens to look like one, so a feed writing the
  same path next tick does not find the shape changed underneath it.
- **Press `+` on Score B, which you did NOT bind.** Only the board you are on moves, and its own
  cue keeps the figure - the old behaviour, untouched.
- **⚡ GOAL A on the House Score cue.** The flag animation plays on the strip, and the figure
  moves on both boards. The event and the shared value are two rows now; the flag is the
  graphic's, the number is the production's.
- **⟳ TAKE the cue again.** The score stays where you put it. It used to be re-aired at whatever
  the cue had stored.

## Route B, the hosted page - needs the cloud, about two minutes

Publish `Derby`, open its `?control=` link (a phone is the honest test, a second window the quick
one), take both cues, and do the same two presses. The bound box reads out there too, with the
same chip, and ⟳ TAKE cannot regress the figure.

**The part worth trying with two windows open**: press `+` on one, and watch the other window
follow within the moment. Both are reading one value now, not two copies of a field.

## Route C, the exported package - offline, under a minute

Export the same production as the local-control (HTML overlay) package, unzip, open
`controller.html`. The ± stepper there is the field stepper it always was, and the package carries
no tree and no bindings. If an offline show ever needs shared values, that is the demand that
reopens the question - it is recorded, not pre-built.

## What is not proved by a green gate

Route A is pinned end to end by the merge gate. Routes B and C are not equally covered: the hosted
page cannot be mounted by the offline suite at all, so the gate pins its RESOLUTION (which field is
bound, what a press puts on the wire, what a Take sends) and not its buttons. Route B above is the
buttons.

The database half - migration 0060, which is what lets the hosted page reach the tree with only a
control slug - is proved by its own self-check at the moment it applies, and that self-check drives
a whole production through both doors and counts the rows. It runs on the landing push, not here.
