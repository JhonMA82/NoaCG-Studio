---
kind: agent
date: 2026-09-15
---
# The bench presses every operator arrow, and says so when it cannot

Gate 3 of the agent road - "the bench walks every operator arrow" - was false three ways and
silent about all three. It now walks arrows instead of event names, snaps to each arrow's own
from-state before pressing it, and names what it left unpressed.

## Route, under a minute

From this feature worktree:

```sh
npm --prefix cli run build
node cli/dist/index.js docs validator
node cli/dist/index.js docs contract
```

The validator table is the bench's rule list, and `docs contract` §5a is gate 3 in the text every
coding agent reads before it builds you a graphic.

## What to look at

- **`bench-events-skipped` is a new row in the validator table.** It is the whole point: a bench
  that stops early without saying so is worse than one that stops, because the report reads clean.
  It fires past a ceiling of 24 arrows, or when the bench could not put the machine in front of an
  arrow at all - and that second one is a real defect, an arrow nobody can ever press.
- **§5a gate 3 no longer lists two things the agent has to close by hand.** It used to say the
  bench takes the first eight distinct event NAMES and fires them in sequence without snapping
  back. Both were true, and together they meant a scoreboard's `+1` was one press out of five and
  a ninth button was never pressed at all.
- **The numbers, measured on the proof case's totals board** (eleven controls, twenty-two arrows,
  `e2e/fixtures/agent-made/`): 8 arrows pressed before, 22 after. It reported 0 errors and 0
  warnings while skipping 14 of them. Bench time on that graphic went 2.6 s -> 4.5 s, inside a
  15 s cap.
- **The votes board's one warning is gone.** `bench-field-unpainted` fired on its reported field
  (`Shown`, a `hidden` holder a data-only host writes), which is what a reported field is FOR -
  R4 of `docs/OGRAF_STATE_IN_FIELDS.md` requires it to be off screen. That was the open question
  in `2026-09-15-skill-teaches-authored-machines.md`, and this is the answer it named: exempt the
  declared holder rather than teach agents to expect a warning on the shape we tell them to
  write. Strip either half of the declaration and the finding comes back.

## What this does not do

A CORRECT graphic's report does not change, so there is nothing new to see on one. What changed
is that a broken branch pose is now found, and a machine too big to walk says which arrows it
left. The proof is `e2e/lite-field-paint.spec.ts` - six tests that break a proof-case graphic on
purpose and read the walk's own phase words back out of the findings.

## One thing worth knowing

The ceiling is 24 because the whole bench run has a hard cap and blowing it replaces every precise
finding with one `bench-timeout`. 24 arrows is roughly 2.6 s of the budget. If a graphic ever
genuinely needs more, the ceiling is one constant - but a control surface with 24 buttons is
already past what an operator can read, which is the better thing to fix.
