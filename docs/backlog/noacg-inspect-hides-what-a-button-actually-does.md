# `noacg inspect` hides what a button actually does, and it is the gate with a human in it

**Filed:** 2026-09-15. **Source:** measurement during the proof-case walk (`docs/acceptance/owner-queue/2026-09-15-agent-made-proof-case.md`, CLI 0.3.2, branch `claude/hb-release-and-first-walk`)

## Why

`cli/skill/noacg-graphic/SKILL.md` step 4 makes `inspect` the second of the three gates, and it is
the one with a person in it: *SHOW the user the buttons - "these are your buttons" - so a person
confirms the operator surface before it is saved.* A gate whose table withholds the dangerous part
passes on nothing.

The proof case's totals board prints `newGame | New game | Game | -`. That button zeroes five
fields and is flagged `destructive: true`, and the row says `-`: the `set`, the `add`/`remove`
roads and the destructive flag are all absent from the table, so the one press that cannot be
undone reads as the blandest row in it.

The votes board shows the other half. Its `reveal` control prints `f15` where every NoaCG surface
says `Correct`. `docs/PLAYOUT_DASHBOARD.md` §7b is explicit that a button's hint names the field
by its OPERATOR TITLE and never as `f7`; `inspect` is the one surface left that does not.

## What it would take

Mostly already written. `src/control/controlModel.ts` `adjustWords(button, labelOf)` composes
exactly this sentence for all three dashboard surfaces - "Points 1 to 0, Points 2 to 0, …" - and
`fieldDescriptors` supplies the labels. `cli/src/commands/inspect.ts` needs to call them instead
of printing the raw `payload` array, and to mark a destructive control the way the panels colour
it red. It ships with the next `@noacg/cli` release; 0.3.2 went out on 2026-09-15.

## Evidence

`noacg inspect ./totals-board`, measured:

```
event    label     section     payload
plus1    +1        Panelist 1  f5+1
...
newGame  New game  Game        -
```

and `noacg inspect ./votes-board`:

```
event   label             section  payload
reveal  Reveal performer  Song     f15
```
