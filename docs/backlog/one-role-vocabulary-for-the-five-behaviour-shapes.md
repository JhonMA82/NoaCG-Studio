# Each behaviour role is spelled in four places, and the registry already holds the table

**Filed:** 2026-09-16, on `claude/qc-mapping-step-out-of-components`, while splitting
`MapSvgFieldsStep.tsx`. **Source:** measurement. Carried over from
`docs/backlog/draft-ts-out-of-components.md`, which described it as two copies of one walk; it is
four, and one of the four is data that the other three restate by hand.

## Why

A behaviour ROLE is a name like `question`, `answer.selected`, `team.flash`, `winner`, `expired`.
Adding one to a recipe, or renaming one, means editing four files that share no code:

| Where | What it does with the role |
|---|---|
| `src/templates/behaviours/<recipe>.ts` | DECLARES it as data (`{ look: 'answer.selected', rows: 'answer', when: {…}, anchor: 'answer' }`, `quiz.ts:98`) |
| `src/components/wizard/import/draft.ts` `proposeSvgBehaviour` (:1195) | reads the matcher's proposal into the draft, role by role, by hand |
| `src/components/wizard/import/fieldAutoMap.ts` `mapBoxes` (:531) | visits the same boxes for fill-them-in and its Undo, role by role, by hand |
| `src/components/wizard/import/BehaviourSection.tsx` | renders the picker for it, role by role, by hand |

Reproduce with:

```
grep -rn "'answer.selected'\|'team.flash'\|'badge'\|'expired'" src/components/wizard/import src/templates/behaviours
```

Three of the four are hand-written restatements of the first. **Nothing compares them**, so a role
added to the registry and missed in `mapBoxes` means the fill guess silently skips a box the
proposal can fill; missed in `proposeSvgBehaviour` means the drop never proposes it at all. Both
failures look like "the guess is a bit weak" rather than like a bug, which is why they would sit.

The registry ALREADY is the table. The generic `recipe` draft shape reads it - that is how a new
recipe ships without touching the wizard. The four legacy shapes do not: quiz, score, poll and
timer each have their own hand-written draft interface, their own branch in all three walks, and
their own JSX. The step even names the set (`LEGACY_RECIPES = new Set(['quiz', 'score',
'countdown', 'vote'])`), which says the migration was foreseen and not finished.

## What it would take

One row, and it needs a migration.

Collapse the four legacy shapes onto the generic `SvgRecipeDraft`, so every behaviour is
`{ kind: 'recipe', recipe, layers, fields, rows, options }` read from the registry. The three
hand-written walks then become one registry-driven walk, and a new role is a registry edit alone.

**This is a persisted-format change.** `DesignSvgBehaviour` travels inside the built template
(`templates/importedDesign/designTypes.ts`), so the union's shape is on disk in every saved and
exported imported-SVG graphic. Root `AGENTS.md` rule 6 applies: version bump and a migrate-on-read
in the same commit, so an older graphic still opens.

**Do not attempt it as part of another row.** The four shapes carry real behavioural differences
that the collapse has to preserve and that are documented where they live - the quiz's and the
score board's pickers read only the rows that are ON, the poll's read every text layer the artwork
draws, because a vote writes display targets rather than operator fields
(docs/GRAPHIC_BEHAVIOUR_PLAN.md §12). A collapse that flattened that would change what the pickers
offer on every board in the catalog.

**Proof it did not break:** `npm run build`, then `e2e/import-svg-behaviour.spec.ts` (the road's
behaviour spec, 143 tests across the three import-svg specs) plus `e2e/import-svg-corpus.spec.ts`,
which walks the shipped sample files.

## Evidence

- Measured 2026-09-16 on `claude/qc-mapping-step-out-of-components`. The four call sites above,
  by grep; `mapBoxes` has one branch per kind at `fieldAutoMap.ts:533, 546, 557, 571` and the
  generic fall-through after; `proposeSvgBehaviour` has the matching five at `draft.ts:1204, 1217,
  1228, 1237, 1257`.
- Half of the original finding was already fixed and is not part of this item: `pickersOf`,
  `withFill` and `clearFill` share `mapBoxes` rather than walking the shapes separately.
- `LEGACY_RECIPES` is declared in `BehaviourSection.tsx` and is exactly the four kinds with
  hand-written shapes.
