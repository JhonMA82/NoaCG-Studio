# `noacg scaffold --fields` silently reorders what the author declared

Found during the proof-case walk on 2026-09-15 (`docs/acceptance/owner-queue/2026-09-15-agent-made-proof-case.md`).

## The reproduction

```sh
noacg scaffold --fields "Name 1:text,Points 1:number,Name 2:text,Points 2:number" \
  --name "Totals board" --out ./totals-board
grep '"title"' ./totals-board/totals_board.html
```

The declared order is Name 1, Points 1, Name 2, Points 2. What comes out is **Name 1, Name 2,
Points 1, Points 2** - every `text` field first, everything else after - and nothing says so.

## Why it is the wrong answer

`neutralSpineFor` (`src/templates/types/neutralDesign.ts`) splits the list into `texts` and
`others` because the text fields become the neutral variant's LINES and the rest are appended as
extra fields. That is a sound way to build the spine and a silent change to the author's data
model.

It costs something real. `control/cueFieldGroups.ts` bands NUMBERED rows in the cue editor by a
mirror test, so an interleaved declaration gives an operator five "Panelist N" bands each holding
that person's name and score, which is the shape `docs/CONTROL_PANEL_ANY_GRAPHIC.md` §3d.1
describes. The grouped order gives one run of five names and one run of five numbers instead. The
walk's totals board was authored interleaved and shipped grouped; the bands still worked because
the pairing survives in the TITLES, but the author never learned that the order they wrote was
not the order they got.

## What a fix has to decide

Keeping the declared order means the spine's line block and its extra-field block interleave,
which changes the generated HTML's shape for every typeless scaffold - the studio's own typeless
road runs the same function, so this is not a CLI-only change. The cheap half is honesty: say in
the scaffold's own output that non-text fields were moved to the end, and why.

## Where

- `src/templates/types/neutralDesign.ts` - `neutralSpineFor`, the `texts`/`others` split
- `cli/src/commands/scaffold.ts` - `parseFieldList` preserves the order faithfully; nothing here
  is at fault
