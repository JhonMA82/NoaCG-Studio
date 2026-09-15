# `scaffold --fields` cannot declare the hidden holder the contract teaches

Found during the proof-case walk on 2026-09-15 (`docs/acceptance/owner-queue/2026-09-15-agent-made-proof-case.md`).

## The gap

`cli/skill/noacg-graphic/references/contract.md` §5b names five things a machine-bearing graphic
declares, and the first is *"Fields, with kinds. … A `hidden` field is a holder the runtime reads
and nobody draws."* §5c then builds its whole reported-field mechanism on one.

`noacg scaffold --fields` accepts `text, lines, number, color, select, toggle, image`
(`cli/src/commands/scaffold.ts`, `KINDS`). There is no `hidden`, and the refusal names the seven
it does take, so an author following the contract is told their kind does not exist:

```
--fields: "Shown" has kind "hidden"; kinds are text, lines, number, color, select, toggle, image.
```

The walk added the field by hand afterwards - the DataField, the `.noacg-data-source` holder in
the markup and the class rule in the CSS, three edits in three files - which works and is what
§5c describes, but it is three edits an author has to know to make after the tool told them the
shape they wanted is not available.

## A second, smaller one beside it

A `select` cannot declare an EMPTY option: `parseFieldList` splits on `|` and filters empties, so
`Pick 1:select=|A|B|C|D` yields four options and makes `A` the default. §3a of
`docs/CONTROL_PANEL_ANY_GRAPHIC.md` asks for "dropdown A/B/C/D, empty allowed", which is a pick
nobody has made yet - a real state on a votes board. The walk hand-edited the definition for that
too.

## What a fix would do

Add `hidden` to `KINDS`, emit `ftype: "hidden"` plus a `.noacg-data-source` holder and the class
rule; and let a leading empty option through for `select`. Both are small, and both are in the
CLI's own grammar rather than in shared studio code, so neither has the blast radius of
`docs/backlog/cli-scaffold-fields-drops-the-declared-order.md`.

## Where

- `cli/src/commands/scaffold.ts` - `KINDS`, `parseFieldList`
- `src/templates/types/neutralDesign.ts` - `ftypeForKind`, and the holder markup the extras emit
- Ships with the next `@noacg/cli` release
