# `noacg scaffold --fields` silently reorders the fields the author declared

**Filed:** 2026-09-15. **Source:** measurement during the proof-case walk (`docs/acceptance/owner-queue/2026-09-15-agent-made-proof-case.md`, CLI 0.3.2, branch `claude/hb-release-and-first-walk`)

## Why

The cue editor bands NUMBERED rows (`src/control/cueFieldGroups.ts`), so an interleaved
declaration gives an operator five "Panelist N" bands each holding that person's name and score -
the shape `docs/CONTROL_PANEL_ANY_GRAPHIC.md` §3d.1 describes and the thing that makes a
five-person board readable on the dashboard. The scaffold moves every non-text field to the end,
so the pairing an author wrote is not the pairing they get, and nothing says a word about it.

The walk's totals board was declared interleaved and shipped grouped. The bands still worked,
because the pairing survives in the field TITLES - which is exactly why this is worth filing
rather than urgent: the failure is silent in the good direction today, and will not be the day an
author depends on the order for something the titles do not carry.

## What it would take

`neutralSpineFor` (`src/templates/types/neutralDesign.ts`) splits the list into `texts` - which
become the neutral variant's LINES - and `others`, appended after. Keeping the declared order
means the line block and the extra-field block interleave, which changes the generated HTML for
every typeless scaffold, and the studio's own typeless road runs the same function. So this is not
a CLI-only change and wants its own verification.

The cheap half is honesty rather than order: have `scaffold` say in its own output that non-text
fields were moved to the end, and why. `cli/src/commands/scaffold.ts` `parseFieldList` preserves
the order faithfully and is not at fault.

## Evidence

```sh
noacg scaffold --fields "Name 1:text,Points 1:number,Name 2:text,Points 2:number" \
  --name "Totals board" --out ./totals-board
grep '"title"' ./totals-board/totals_board.html
```

Declared: Name 1, Points 1, Name 2, Points 2. Emitted: **Name 1, Name 2, Points 1, Points 2**.
