# `scaffold --fields` cannot declare the hidden holder the contract teaches

**Filed:** 2026-09-15. **Source:** measurement during the proof-case walk (`docs/acceptance/owner-queue/2026-09-15-agent-made-proof-case.md`, CLI 0.3.2, branch `claude/hb-release-and-first-walk`)

## Why

`cli/skill/noacg-graphic/references/contract.md` §5b names five things a machine-bearing graphic
declares, and the first is *"Fields, with kinds. … A `hidden` field is a holder the runtime reads
and nobody draws."* §5c then builds its whole reported-field mechanism - the thing that keeps a
data-only host able to drive the graphic - on one of them.

`scaffold --fields` accepts seven kinds and `hidden` is not among them, so an author following the
contract is told the shape it teaches does not exist. The walk added the field by hand afterwards:
the DataField, the `.noacg-data-source` holder in the markup and the class rule in the CSS, three
edits in three files. That works and is what §5c describes. It is also three edits an author has
to know to make after the tool has told them no, on the pattern the skill says to use.

A second, smaller one sits beside it. A `select` cannot declare an EMPTY option: `parseFieldList`
splits on `|` and filters empties, so `Pick 1:select=|A|B|C|D` yields four options and makes `A`
the default. §3a of `docs/CONTROL_PANEL_ANY_GRAPHIC.md` asks for "dropdown A/B/C/D, empty allowed",
which is a pick nobody has made yet - a real state on a votes board, and one the walk hand-edited
the definition for too.

## What it would take

Add `hidden` to `KINDS`, emit `ftype: "hidden"` plus a `.noacg-data-source` holder and the class
rule; and let a leading empty option through for `select`. Both live in the CLI's own grammar
(`cli/src/commands/scaffold.ts`) and the neutral spine's `ftypeForKind`
(`src/templates/types/neutralDesign.ts`), so neither carries the blast radius of
`docs/backlog/cli-scaffold-fields-drops-the-declared-order.md`. It ships with the next
`@noacg/cli` release.

## Evidence

```
--fields: "Shown" has kind "hidden"; kinds are text, lines, number, color, select, toggle, image.
```

`KINDS` is `['text', 'lines', 'number', 'color', 'select', 'toggle', 'image']`
(`cli/src/commands/scaffold.ts`).
