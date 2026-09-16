# A value box on the Data tab writes the whole tree on every keystroke

**Filed:** 2026-09-16. **Source:** the Data-tab row's check (`claude/ta-data-tab-explains-itself`),
from reading the code; not reproduced against a published production.

## Why

`ProductionDataPanel.tsx` calls `write(setPath(liveData, ...))` from a value box's `onChange`, so
every character retypes the production's tree. Unpublished, that is a synchronous read and
rewrite of every production's tree in browser storage per keypress, then a resolve-and-diff that
fires an `update` per affected graphic. Published, the tree write goes to the data API, so an
eleven-letter team name is eleven PATCH calls against an ingest budget of 25 per five seconds. If
the later ones are refused, the refusal handler in `ProductionPage.tsx` refreshes the server's
older tree back into the controlled input mid-word, and the box reverts under the cursor. On
2026-09-25 that is a student typing a name live.

## What it would take

Reproduce first, published, by retyping a name quickly and watching the network panel. If it
holds: keep the row's text in local component state and commit to the tree on blur or Enter, or
behind a short debounce. The +/- steppers and Apply JSON are discrete gestures and stay
immediate. `e2e/production-data.spec.ts` fills boxes with `fill()`, which fires one change, so
the specs would not notice either behaviour; add one that types.

## Evidence

The `onChange` at the value input in `src/components/home/ProductionDataPanel.tsx`, `saveLiveData`
in the model, and the catch that calls `refreshServerData()` in `src/components/home/ProductionPage.tsx`.
