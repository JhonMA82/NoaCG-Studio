# `noacg inspect` hides what a button actually does, and gate 2 is the one with a human in it

Found during the proof-case walk on 2026-09-15 (`docs/acceptance/owner-queue/2026-09-15-agent-made-proof-case.md`).

## The reproduction

The proof-case totals board declares eleven controls; ten are `adjust` and one is a destructive
`set`. `noacg inspect` prints:

```
event    label     section     payload
plus1    +1        Panelist 1  f5+1
...
newGame  New game  Game        -
```

**New game zeroes five fields and is flagged `destructive: true`, and the row says `-`.** The
`set`, the `add`/`remove` roads and the destructive flag are all absent from the table. The one
button that cannot be undone prints as the blandest row in it.

The votes board shows the other half of the same gap: its `reveal` control prints `f15` where
every NoaCG surface would say `Correct`. `docs/PLAYOUT_DASHBOARD.md` §7b is explicit that a
button's hint names the field by its OPERATOR TITLE and never as `f7`; `inspect` is the one
surface that still does.

## Why it matters more than it looks

`cli/skill/noacg-graphic/SKILL.md` step 4 makes `inspect` gate 2 of three, and it is the gate
with a person in it: *SHOW the user the buttons - "these are your buttons" - so a person confirms
the operator surface before it is saved*. A human reading `newGame | New game | Game | -` learns
nothing about what pressing it does, so the gate passes on a table that withheld the dangerous
part.

## The fix is mostly already written

`src/control/controlModel.ts` `adjustWords(button, labelOf)` composes exactly this sentence for
all three dashboard surfaces - "Points 1 to 0, Points 2 to 0, …" - and `fieldDescriptors` gives
the labels. `inspect` needs to call them rather than print the raw `payload` array, and to mark
a destructive control the way the panels colour it red.

## Where

- `cli/src/commands/inspect.ts` - the table
- `src/control/controlModel.ts` - `adjustWords`, `fieldDescriptors`, already the shared wording
- Ships with the next `@noacg/cli` release (0.3.2 is out as of 2026-09-15)
