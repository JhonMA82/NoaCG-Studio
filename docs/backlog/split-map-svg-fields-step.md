# Split `MapSvgFieldsStep.tsx`, which quadrupled in three weeks and is edited by every SVG-import row

**Filed:** 2026-09-15. **Source:** weekly quality review (measurement).

## Why

`src/components/wizard/import/MapSvgFieldsStep.tsx` is the largest file in `src/` at **3,827
lines**, and nothing else in the tree is growing as fast. It was 1,008 lines on 2026-08-25 (then
under `steps/`), 1,719 on 2026-09-01, 3,187 on 2026-09-08 after it moved into `import/`, and
3,827 today. The last week alone added 640 lines.

The size sits in one place. The file has a single export, and the default component starts at
line 1,115 and runs **2,714 lines**, with 48 hook calls and 17 `useState`. That one function body
is larger than all of `ProductionPage.tsx`'s component, which already has its own extraction item
on this shelf. Around the component sit 47 more top-level declarations, and **913 lines of them
contain no JSX**: `panelOfEachLine` (90), `measureOutline` (86), `boxFitOf` (71),
`proposeBannerGrowth` (69), `repeatsWithNewContent` (67), `proposeFollowers` (50),
`panelsHoldingText` (41) and their constant tables. That is measurement and proposal logic, and
`docs/ARCHITECTURE.md` §5 says logic without JSX does not live under `components/`.

The cost is paid per edit, and the edits are many. It had 11 commits in the week to 2026-09-15 and
49 first-parent landings in the month (counting its old path). Edits times lines this week is
42,097, twice the next file (`src/templates/importedDesign/svg.ts` at 20,356). Five different
branches landed into it in seven days. Merge latency is the owner's stated bottleneck, and a file
that every SVG-import row has to open is where parallel rows collide.

More rows are already waiting on this file. Eight other entries on this shelf name code inside it:
`one-rule-for-what-a-backplate-is`, `growth-target-defaults-to-the-frame`,
`pick-the-behaviour-before-typing-into-the-fields`, `decorative-numerals-arrive-as-fields`,
`import-step-copy-a-kid-can-read`, `a-vote-board-loses-and-distorts-its-bars`,
`svg-growth-default-across-exporters` and `svg-import-sweep-findings`. Each becomes a branch
editing the same 2,714-line function unless the file is split first.

## What it would take

About a day, and it may want two branches.

1. **Move the no-JSX logic out first.** It carries no hook order and no render risk. Where it goes
   is the session's call, under two constraints. Several helpers read live DOM geometry
   (`measureOutline`, `boxFitOf`), so they stay browser-side. And `.dependency-cruiser.cjs` rule
   `wizard-import-through-its-index` requires the import capability to be reached through
   `import/index.ts`. The pure proposal functions (`proposeBannerGrowth`, `proposeFollowers`) sit
   naturally beside `import/draft.ts` and `import/fieldAutoMap.ts`.
2. **Split the component along the sections it already renders**: the field rows, the text box and
   alignment panel, the stretch and growth controls, the recipe and behaviour options, and the
   preview overlay. Lift only the state each one needs.

Do this together with `draft-ts-out-of-components.md` or straight after it, because
`import/draft.ts` (1,298 lines, no JSX) sits in the same folder and the two moves pick the same
destination. No worktree was editing the file on 2026-09-15, so it could start now without a
collision.

**What could break:** hook order, and state the field rows and the preview overlay share. The
mapping step is the only door from an SVG to a playable template, so a regression here is a
regression in the import road.

**Proof it did not break:** `npm run build` catches a bad edge (eslint Stage A plus `depcruise`
default-deny). The road has 7,763 lines of specs: `e2e/import-svg.spec.ts`,
`e2e/import-svg-behaviour.spec.ts` and `e2e/import-svg-corpus.spec.ts`. Queue them as the affected
plan with `npm run queue`. The file carries no `eslint-disable` today, and the split should keep
it that way. `react-hooks/exhaustive-deps` is the rule all 23 disables in `src/` suppress.

## Evidence

Measured on `main` at `7e4b50aa`, 2026-09-15:

- `wc -l` gives 3,827. `grep -c '^export'` gives 1. Occurrences of `useState` 17, of all six
  React hooks 48.
- Size history is `git show $(git rev-list -1 --before=<date> main):<path> | wc -l` at
  2026-08-25, 09-01, 09-08 and 09-12, reading `steps/MapSvgFieldsStep.tsx` before the move.
- Top-level declaration spans came from a line scan for `function|const` at column 0. A span counts
  as JSX when its text contains an element tag.
- `git log --since="1 week ago" --no-merges --name-only`, crossed with `wc -l`, gives the
  edits-times-lines ranking.
- `git log --first-parent main --since="1 week ago" -- <path>` lists the five landings:
  `text-box-alignment-control`, `text-box-preview-overlay`, `agents-refs-text-box`,
  `c-vote-notice-plates` and `m-wizard-says-it-itself`.
- `npm run rules -- <path>` returns no rule that argues for keeping the step in one file.

## Trend

- 2026-09-15: 3,827 lines (3,187 on 09-08), 1 export, component body 2,714 lines, 48 hooks
  (17 `useState`), 913 lines of no-JSX logic, 11 commits in the week.
