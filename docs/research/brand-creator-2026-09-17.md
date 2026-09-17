# Brand creator implementation evidence

The owner authorized the starter-collection/brand/editor route on 2026-09-17. Its detailed
sequence lives in [the editor rebuild plan](../EDITOR_REBUILD_PLAN.md#template-first-creation-and-the-shared-brand-library).

## Baseline

At `eccc120e`, a queued one-worker Playwright walk (`j-1285`) opened `/app#/home/looks`,
verified Brand looks and Save current look, and verified no New brand action existed.
The screenshot showed the capture-only form and an otherwise empty brand list. This is
evidence of the missing independent-creation route, not an animation usability diagnosis.

## Studio source inspection

Read Zero Density Studio at the research pin `3142fc7d02934494931eb14e7dc255393e4110d0`:
`apps/editor/src/panels/BrandKitPanel.tsx`, `apps/editor/src/state/projectStore.ts`
(`updateDesignToken`) and `packages/scene-model/src/stylePackPalette.test.ts`.
Its panel exposes colour roles and tokens; edits normalize token values and synchronize
bound properties. Tests describe propagation across linked colours and fields. No upstream
code was copied and no new Studio browser comparison is claimed by this slice.

Adopted pattern: meaningful roles and immediate previews. Deliberate difference: NoaCG's
reusable brand is the existing SavedLook library record; editing it never updates existing
graphics automatically. The new form previews through the existing wizard builder and
MiniPreview, preserving the same asset/font/logo-slot contracts as final creation.

## Verification scope

`e2e/brand-editor.spec.ts` covers creation with SVG logo, previews, persistence, edit-in-place,
wizard discovery, cancellation/open-graphic preservation, oversize/invalid logo refusal,
storage refusal/retry, uploaded font persistence and stale-edit refusal. Existing
`wizard-brand.spec.ts` covers applying palette/font/logo and respecting slot capabilities.
The initial cancellation assertion was corrected because `createProject` intentionally
seeds an existing brand; the correct requirement is preserving that record without adding
another, not asserting an empty library.

Queued browser results: `j-1287` passed all 10 brand-creator and wizard-brand tests;
`j-1288` passed the existing Home capture/apply/reload regression. Rendered screenshots
were inspected at 1366x768 and 1920x1080. The preview cards were shortened and the Save/Cancel
header made sticky so the examples and actions remain usable while editing a long form.

`npm run build` completed with exit 0: repository gates, 1,625 passing tests (one skipped),
TypeScript, lint, dependency checks, production bundle, prerender and client-secret scan.
The first complete attempt exposed an expired delegation-effort trial; its separate
[review and correction](2026-09-17-effort-trial-review.md) restored the standing default.

Human usability, collection-wide editing, production installation and animation comparison
remain outstanding. See the [acceptance route](../acceptance/owner-queue/2026-09-17-brand-creator.md).
