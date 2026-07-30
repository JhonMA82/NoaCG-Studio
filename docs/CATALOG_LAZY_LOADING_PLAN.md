# Catalog lazy loading - taking 520 design modules off the boot path

Status: **design note, nothing built - but stage 1 has now run.** Written 2026-07-30 from a
measured E2E investigation; the "Stage 1 result" section below (2026-07-31) answers the question
the recommendation was waiting on and settles Option A over Option B. Read
`src/templates/AGENTS.md` before acting on any of it.

## What was measured

Instrumenting `createProject` (`e2e/_create.ts`) across three consecutive runs on an idle box
gave a stable ~2.3 s bootstrap per test (2324 / 2310 / 2266 ms), split almost exactly in half:

| Phase | ms |
|---|---|
| `page.goto('/app')` | ~1030 |
| `applyTemplate` + preview rebuild | ~1040 |
| `buildDraftTemplate` + `formatTemplate` (Prettier ~100) | ~160 |
| app boot after navigation, dynamic imports | ~60 |

Two hypotheses died there. Importing `/src/templates/catalog.ts` inside the helper costs **2 ms**
(all its dynamic imports together, 12 ms), and Prettier costs ~100 ms - neither is the floor.

The navigation is. `/app` issues **802 script requests**; the HTML document itself answers in
6 ms, so essentially all of it is module loading. By area:

```
  95  src/templates/lowerThirds       29  src/model
  70  src/templates/infoCards         24  src/components/wizard
  55  src/templates/competition       20  src/blocks
  42  src/templates/cornerBug         ...
  38  src/templates/infographics
 520  src/templates TOTAL  ← 65% of the boot graph
```

## Why this is a product problem, not a test problem

`src/templates` is **3.8 MB of the ~6 MB of application source** (components 1.1 MB, ai 0.5 MB,
blocks 0.3 MB, model 0.25 MB), and it lands in the **4.16 MB main app chunk** - the one already
tripping Vite's 500 kB warning on every build.

So every visitor downloads and parses the entire catalog before the editor renders, and **each
pack added makes the product's first paint slower for everyone**, worst on the mobile layout the
product supports. The E2E suite paying it 591 times is the symptom that made it visible; the
first-load cost is the actual defect.

The test win is real but secondary: taking the catalog off boot should move the floor from
~2.3 s toward ~1.7 s, roughly 5 min of aggregate suite time.

## The constraint that shapes every option

**Deriving a variant's Browse metadata requires running its `create()`.**
`templateMeta.ts:219` does `variant.create().fields` to read the compiled field schema, and
assembly runs `DOMParser` - so the derivation needs a **browser**, not just Node.

`scripts/prerender.mjs` already hit this wall and documents the decision it forced: it reads the
*declared* variant descriptors rather than `templateMeta()`, precisely because "templateMeta
derives a field schema by actually BUILDING each template, which runs `DOMParser` and therefore
needs a browser… The alternative was a DOM dependency (against root AGENTS.md non-negotiable 3)
or a headless browser in the build."

That rules out the obvious fix. A build-time manifest generated in Node cannot contain the
derived half, and adding a headless browser to `npm run build` re-opens a question this repo has
already answered no to.

It also means the split is not "metadata vs code" but:

- **Declared** - name, description, category, styleTag, typeId, animationPresets, logo, line
  capacity. Available with no design module loaded. `prerender` already proves this.
- **Derived** - field counts and buckets, schema-derived capabilities, field semantics. Needs
  `create()`, needs a DOM.

Browse filters on **both** today. And a facet cannot be filtered lazily: to know which variants
match, you must have the facet for *every* variant. Any derived facet therefore forces the whole
catalog to load, which is exactly the situation we are in.

## Options

### Option A - declare what Browse needs, gate the declaration against the derivation

Move the facts Browse filters on out of derivation and into declaration. `src/templates/meta.ts`
is already "the DECLARED sliver" with a `VARIANT_META[id] → TYPE_META[typeId] →
CATEGORY_DEFAULT_META[category]` resolution order, so the home exists. `create()` then moves
behind a per-category dynamic import and leaves the boot graph entirely.

The derivation does not get deleted - it becomes the **test oracle**. An E2E spec (which has a
DOM) derives every variant's metadata and asserts it equals the declaration. This is the same
shape as the capabilities gate that already compares authored against compiled variants
(`docs/GRAPHIC_TYPES.md` §5, read by `scripts/factory.mjs`).

- **For:** no new generated artifact; the facts live where a design author is already writing;
  drift is caught by a gate that fails on the PR that causes it.
- **Against:** the biggest change. Every variant needs its Browse-relevant facts declared, and
  the fallback chain has to cover the ones that never declare anything. Some facets may be
  genuinely awkward to declare by hand.

### Option B - precompute a manifest in the browser, check it in

An E2E spec derives metadata for all 430 variants and writes `catalogMeta.json`, checked in and
diffed on every run - the exact mechanism `e2e/catalog-baseline.spec.ts` already uses for source
hashes and render fingerprints.

- **For:** smallest conceptual change; no facts move; the machinery is proven in this repo.
- **Against:** **it adds a third checked-in generated catalog artifact, and today demonstrated
  the cost of those.** `catalog-baseline.json` went stale across four pack merges and left `main`
  red for about two hours; a mid-sequence re-record (`d68a5d8`) went stale again within the hour.
  Every pack author would now have to re-record three artifacts instead of two, and the failure
  mode is a red `main` rather than a local error.

### Option C - lazy per-category chunks only, Browse unchanged

Keep the metadata story as-is; make `catalog.ts` a map of category → `() => import('./…')`.

- **Against:** does not work. Browse needs facets across all categories at once, so the first
  filter loads everything and the boot cost simply moves a few hundred milliseconds later. Listed
  because it is the intuitive first idea and it fails on the constraint above.

## Recommendation

**Option A**, staged - but the first stage is a measurement, not a migration.

The unknown that decides feasibility is: *how many of the facets Browse actually filters on need
the derived half at all?* If most already resolve from `meta.ts` and only field-count buckets
need `create()`, A is modest. If capabilities and semantics are deeply derived across hundreds of
variants, A is large and B's ergonomics start to look better despite the third artifact.

Nobody should pick between A and B without that number.

## Stage 1 result - the audit is done, and Option A is SMALL

Run 2026-07-31 against `search.ts`, `templateMeta.ts` and `meta.ts`. The question was how many
Browse facets need the derived half. The answer is **two**, and each needs far less than a facet.

| Facet | Resolves from | Needs `create()`? |
|---|---|---|
| `query` | token index over name/description/category + capability names | only via capabilities |
| `family`, `format` | `deriveFormats(variant, category)` - type registry + declared category | **no** |
| `category` | `meta.ts` declaration (`VARIANT_META → TYPE_META → CATEGORY_DEFAULT_META`) | **no** |
| `style` | `variant.styleTag` | **no** |
| `structures` | `meta.ts` declaration | **no** |
| `placement` | `declared.coverage ?? graphicCategoryById(category).coverage` | **no** |
| `intensity` | `variant.animationPresets` → the motion table in `model/taxonomy.ts` | **no** |
| **`capabilities`** | declared extras ∪ variant-derived ∪ **one field check** | **yes, once** |
| **`fieldBucket`** | `visibleRange`, whose ends come from `variant.suggestedLines`/`maxLines` around a **field count** | **yes, once** |

Reading the two derivations closely is what shrinks the problem:

- **`deriveCapabilities`** has five sources and only ONE touches `fields`:
  `fields.some(f => f.ftype === 'filelist' && !isLogoField(f))` → `image-upload`. Everything else
  is `declared.extraCapabilities`, `variant.logo`, `variant.category` + `variant.maxLines`, and
  `variant.animationPresets`.
- **`deriveFieldCounts`** returns nine numbers, but the FILTER only reads `visibleRange` (and
  `repeating`, which comes from `declared.extraCapabilities`, not from fields). Both ends of that
  range are `visible ± shrink/growth`, and shrink/growth are already computed from
  `variant.suggestedLines.length` and `variant.maxLines`. So the only unknown is **`visible`**.

**So the whole blocker is two declared values per variant:** the count of visible content fields,
and whether the design has a non-logo image field. Not a wholesale metadata migration.

`complexity` follows from `visible` (`visible > 3`) and needs nothing new. The per-ftype counts
(`text`/`number`/`image`/`choice`/`total`) are used by the card's field summary, not by any
filter - so they can stay derived and simply be resolved lazily for the handful of cards on
screen, or be declared alongside `visible` if that proves simpler.

### What this changes

- **Option A is the answer.** It was written as "the biggest change"; it is two fields.
- **Option B's third generated artifact is not worth it** for two values that a design author can
  state where they already author, and that the existing capabilities gate shape can verify.
- Open question 2 ("if the audit says A is large, is B acceptable?") is **answered: not needed.**

### What the audit did NOT establish

Whether `visible` is cheap to declare correctly for all ~430 variants, or whether some
fixed-contract categories (scoreboards, versus, quiz, the competition boards - where the DESIGN
owns its fields) make it fiddly. That is a counting exercise against the compiled schema, and it
needs a browser, so it belongs in step 2's gate rather than in another reading pass. The gate
should therefore land BEFORE any declaration, and be allowed to report the mismatch it finds.

## Migration order (Option A, now that stage 1 has run)

1. **Audit** - for each facet in `search.ts`, record whether it resolves from declaration or
   derivation, and how many variants would need a new declared value. Output is a table, not code.
2. **Gate first** - add the E2E spec that derives metadata and asserts it matches the declaration,
   while the declaration is still allowed to fall back to derivation. It passes trivially at
   first; it is what makes every later step safe.
3. **Declare** - fill in the declared values, category by category, watching the gate.
4. **Cut the import** - `create()` moves behind a dynamic import per category; `variantById` and
   `variantsFor` become async or grow an async sibling. This is the step that changes call sites.
5. **Re-measure** - boot module count, `/app` navigation time, main chunk size. If the numbers do
   not move, stop and reconsider rather than continuing on faith.

## Consumers that will feel step 4

`CATALOG` is imported by `components/wizard/CreationWizard.tsx`, `components/InsertTemplateDialog.tsx`,
and five AI modules (`ai/claudeProvider.ts`, `ai/designSpec.ts`, `ai/spec/categories.ts`,
`ai/spec/specDesign.ts`, `ai/structuralIntent.ts`, `ai/stubProvider.ts`).

**And the E2E suite.** `import('/src/templates/catalog.ts')` inside `page.evaluate` is a documented
fast path in the root `AGENTS.md`, used by `catalog-baseline`, `graphic-types`, `template-escaping`,
`exports`, `community`, `ai`, the pack specs and the catalog bench. An async catalog must keep that
call working - most of those specs already `await` the import, so the likely shape is that
`variantsFor`/`variantById` gain async siblings rather than changing signature.

## Risks

- **The AI harness assembles catalog-fit briefs through these variants.** A change to how variants
  resolve touches `src/ai/`'s generation path, which has its own contract and benchmarks.
- **Four categories were mid-flight today** (the pack branches). Doing this while packs land
  invites conflicts across `src/templates/` - land it between waves, not during one.
- **`--type-scale` and the `:root` contract are untouched by this** and must stay that way; this
  is a loading change, not a template change. Byte-identical `create()` output is the pass mark,
  and `catalog-baseline.spec.ts` already proves it.

## Open questions for the owner

1. Is the first-load cost worth a change of this size *now*, given the goal is adoption and the
   catalog is still growing fast? A 4.16 MB first paint argues yes; "not while packs are landing
   weekly" is a legitimate answer.
2. If the audit says A is large - is a third generated artifact (B) acceptable, knowing today's
   two-hour red `main` came from exactly that failure mode?
3. Should the eager/lazy line be drawn at the category or the pack? Packs are the unit that grows.
