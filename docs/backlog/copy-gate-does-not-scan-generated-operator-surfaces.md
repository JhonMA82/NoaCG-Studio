---
v: 2
source: agent
kind: gap
raised: 2026-09-16
state: unstarted
---
# The copy gate is blind to the operator copy that ships in generated surfaces

**Filed:** 2026-09-16, from the two-Space-modes row (`docs/PLAYOUT_DASHBOARD.md` §2f).

## What was seen

`scripts/check-copy.mjs` scans a fixed list of source directories for copy tells and records a
per-file baseline. `src/control/` is not in that list, and it is where two operator surfaces are
GENERATED as template strings: the exported controller (`productionControllerHtml.ts`) and the
exported control panel (`controlPanelHtml.ts`). A button title with an em dash in the controller
passed the gate green on this branch because nothing scanned it; the same title in
`components/` failed the build. The tooltip an operator reads mid-show is exactly the copy the
gate exists for, and it is the one copy the gate does not see.

The branch fixed its own strings by hand and moved the shared operator words into
`src/control/spaceMode.ts`, which is still outside the scan.

## What it would take

Add `src/control` to the gate's scanned directories and re-record the baseline for the files
it brings in. A gate lands alone - it changes what every in-flight branch is judged against -
which is why this row did not widen it.
