# Split `MapSvgFieldsStep.tsx`, which quadrupled in three weeks and is edited by every SVG-import row

**Filed:** 2026-09-15. **Source:** weekly quality review (measurement).
**Largely done 2026-09-16** on `claude/qc-mapping-step-out-of-components`; what is left is named
under "What is still open".

## Why

`src/components/wizard/import/MapSvgFieldsStep.tsx` was the largest file in `src/` at **3,827
lines**, and nothing else in the tree was growing as fast. It was 1,008 lines on 2026-08-25 (then
under `steps/`), 1,719 on 2026-09-01, 3,187 on 2026-09-08 after it moved into `import/`, and
3,827 on 2026-09-15. The last week alone added 640 lines.

The size sat in one place. The file had a single export, and the default component started at
line 1,115 and ran **2,714 lines**, with 48 hook calls and 17 `useState`. Around the component sat
47 more top-level declarations, **913 lines of which contained no JSX**.

The cost was paid per edit, and the edits were many: 11 commits in the week to 2026-09-15 and 49
first-parent landings in the month. Edits times lines that week was 42,097, twice the next file.
Five different branches landed into it in seven days. Merge latency is the owner's stated
bottleneck, and a file that every SVG-import row has to open is where parallel rows collide.

## What was done

The step is **1,750 lines** with **35 hook calls** and one export. Four files now hold what was
one, and the cut ran along a seam that already existed: every hook in the step sits above its
`if (!svg) return null`, and everything below it is derivation, handlers and JSX. So the JSX and
the handlers could move with no hook-order question to answer at all.

**Seven hooks did move, and that is the part to check when extracting the next section.** The
counts are 42 before, 42 after (`grep -o 'use(State|Ref|Effect|Memo|Callback|LayoutEffect)[<(]'`):
35 left in the step, 6 in `FontsSection` (`fontBusy`, `fontError`, `uploadFor`, `fileInput`,
`googleFamilies` and the index-loading effect) and 1 in `BehaviourSection` (the `fill` record).
Each moved as a COMPLETE set into a component whose mount condition matches the lifetime that
state already had, which is the condition that makes such a move safe:

- `FontsSection` mounts on `draft.svgFonts.length > 0`, and its effect's own guard was already
  `svgFonts.some(...)`, so the two are equivalent.
- `BehaviourSection` is mounted UNCONDITIONALLY with its
  `(textLayers.length > 0 || groups.length > 0)` guard inside it, precisely so `fill` keeps the
  lifetime it had in the parent.

What did not change is hook ORDER within any one component, and no hook crossed the early return.

| File | Lines | What it holds |
|---|---|---|
| `MapSvgFieldsStep.tsx` | 1,750 | the field-row checklist, the drawn fields, growth, images, outlines, the off-screen stage, and the hooks every section's measurements come from |
| `BehaviourSection.tsx` | 1,225 | the five recipe shapes, the fill-them-in guess and its Undo, the switches and choices. Owns the `fill` explanation, which nothing else reads |
| `stageMeasure.ts` | 796 | every question the step asks its own rendered artwork. Nine of its 27 declarations are now module-private |
| `FontsSection.tsx` | 202 | the typeface rows, owning all four pieces of state behind them |

Two things the original item got wrong, both corrected by measuring:

- **`proposeBannerGrowth` and `proposeFollowers` are not "the pure proposal functions".** Both take
  `stage: HTMLElement` and read `getBoundingClientRect` / `getComputedStyle`. So does every other
  helper the item counted: all 913 no-JSX lines are one DOM-measurement layer, which is why they
  went to `stageMeasure.ts` together rather than beside the transform layer.
- **"Move the no-JSX logic out of `components/`" was refused**, on measurement rather than taste:
  `scripts/e2e-affected.mjs planFor` returns 13 specs where these files are and 48 under
  `templates/importedDesign/`, and the move would orphan two compiled invariants from the code
  they name by symbol. The verdict and its evidence are in `docs/ARCHITECTURE.md` §5 and
  `docs/backlog/draft-ts-out-of-components.md`.

## What is still open

The step is a third of its old size and no longer the largest file in `src/`, so the collision
argument is largely answered. Three sections were left in it deliberately, and none is urgent:

1. **The field-row checklist** (~325 lines of JSX) is the step's subject. It reads `panelIds`,
   `boxLooks`, `boxOfRow`, `fieldGroups` and the hover state, which are the same measurements the
   growth section reads, so extracting it means passing most of the step's state back down. Worth
   doing when one of those measurements next changes, not before.
2. **The stretch and growth section** (~300 lines) is the same case, one degree worse: it reads
   `proposed`, `perPanelOpen`, `followArmed`, `growOptions`, `perPanelRows` and `stretchMode`.
3. **The images and outlines sections** (~115 lines together) are small enough that moving them
   buys a file rather than a boundary.

The eight shelf items that named code inside this file can now proceed: six of them
(`one-rule-for-what-a-backplate-is`, `growth-target-defaults-to-the-frame`,
`a-vote-board-loses-and-distorts-its-bars`, `svg-growth-default-across-exporters`,
`decorative-numerals-arrive-as-fields`, `svg-import-sweep-findings`) now land in `stageMeasure.ts`
or `BehaviourSection.tsx` rather than in one shared 3,800-line file.

## Evidence

Measured on `main` at `7e4b50aa`, 2026-09-15, and re-measured on
`claude/qc-mapping-step-out-of-components` on 2026-09-16:

- `wc -l` gave 3,827, now 1,750. `grep -c '^export'` gives 1 either way.
- **Hook counts, with the command, because the two measurements here disagree.** The 2026-09-15
  entry says 48 without naming its method and it does not reproduce. Counting call SITES with
  `grep -o 'use\(State\|Ref\|Effect\|Memo\|Callback\|LayoutEffect\)[<(]' <file> | wc -l` gives
  **42** at the merge base `0a5e3990` and **42** across the four files afterwards (35 + 6 + 1).
  Use that command for the next entry; a bare number nobody can re-derive is what let the
  "no hook moved" claim stand for a day before a review caught it.
- Size history is `git show $(git rev-list -1 --before=<date> main):<path> | wc -l`, reading
  `steps/MapSvgFieldsStep.tsx` before the move.
- Top-level declaration spans came from a line scan for `function|const` at column 0. A span counts
  as JSX when its text contains an element tag.
- `git log --first-parent main --since="1 week ago" -- <path>` listed the five landings:
  `text-box-alignment-control`, `text-box-preview-overlay`, `agents-refs-text-box`,
  `c-vote-notice-plates` and `m-wizard-says-it-itself`.
- The file still carries no `eslint-disable`, which the split kept true.

## Trend

- 2026-09-15: 3,827 lines, component body 2,714, 48 hooks by an unstated count (42 by the command
  above), 913 lines of no-JSX logic, 11 commits in the week.
- 2026-09-16: **1,750 lines, 35 hooks in the step** and 42 across the four files it became - seven
  moved out with the sections that own them, none crossed the early return, and no hook's order
  within a component changed. The no-JSX measurement layer stays under `components/`
  deliberately, with the reason recorded in `docs/ARCHITECTURE.md` §5.
