# Two copies of "the published weight nearest the one asked for"

**Filed:** 2026-09-16, during the drain of the 2026-09-16 handoffs. **Source:** row QC reported it
and did not fix it, because the fix reaches outside that row's diff. This file is that report's
home now that the handoff is gone.

## The duplication

`src/model/googleFonts.ts` has:

```ts
/** The weight to fetch when the user has not chosen one: 400 where it exists, else nearest. */
export function defaultWeight(weights: number[]): number
```

`src/components/wizard/import/FontsSection.tsx` has, privately:

```ts
/** The published weight closest to the one the file's own name asked for. */
function nearestWeight(weights: number[], want: number): number
```

Same reduce, same distance measure. `defaultWeight` hard-codes 400 as the target;
`nearestWeight` takes the target as an argument, because an imported SVG names a weight in the
face's own name (`Archivo-Bold`) and that is what it wants the nearest published weight to.

So `defaultWeight(w)` is `nearestWeight(w, 400)` with one difference: the empty-array answers are
400 and `want` respectively.

## What it would take

Export one function from `src/model/googleFonts.ts` that takes the target, have `defaultWeight`
call it with 400, and delete the private copy in `FontsSection.tsx`. Keep each caller's
empty-array answer, because they are deliberately different: nothing published means fall back to
the standard weight for a fetch, and to the asked-for weight for a name the artwork stated.

Small, and worth doing the next time either file is open. It is here rather than done because row
QC's diff was a file split and `googleFonts.ts` was outside it, and a refactor smuggled into an
unrelated diff is how a split stops being reviewable.

## Evidence

Measured 2026-09-16: `src/model/googleFonts.ts` line 84 and
`src/components/wizard/import/FontsSection.tsx` line 17. A repo-wide grep for `nearestWeight` finds
two lines and nothing else: that definition and its one call site at `FontsSection.tsx:84`.
