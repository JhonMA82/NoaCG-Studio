# Where NoaCG Pro actually breaks - the 2026-08-08 round, re-opened

`ROUND.md` measured the outcome: 5 of 12 visibly broken, 11 of 12 reported passing, and
concluded that a rectangle-rebuilding compiler cannot keep a distinctive design. This document
locates the failure INSIDE the pipeline, per failing brief, and separates what is inherent to
image-led design from what is this implementation.

Every number below is reproducible for free: `node scripts/pro-geometry-audit.mjs` replays the
checked-in fixtures through the real normalizer and compiler and compares what the compiler
produced against what the concept image contains. Nothing here needed a paid call.

**The short version.** The reconstruction carries four defects that are arithmetic and
vocabulary, not taste, and a fifth that lives in the concept prompt. Together they account for
all five broken briefs. Only one of the five is a consequence of image-led design as such. The
round's central claim - *no gate in the tree can see the difference* - is false: the compiler's
own warning count separates the broken from the usable on 11 of 12, and the bench threw it away.

---

## 1. The failure map

| Brief | Human verdict | Where it broke | Class |
|---|---|---|---|
| `empty-optional` | broken | **stage 1, the concept prompt** - `proConceptPrompt` renders the two values inside its own bullet scaffolding, and the image model drew the scaffolding | prompt defect |
| `minimalist` | broken | **stage 3, cover-or-erase** - no panel in the design, so nothing covers; the flat-fill erase refused twice; then the SCALE defects made the live text half the baked text's size | compiler |
| `entertainment` | broken | **stage 3, registration** - the rebuilt panel's top edge sits below the baked name, which protrudes; erase refused | compiler |
| `sports-live` | broken | **stage 2 contract expressivity** - the interpretation SAW angled panels and said so in a warning; `ProPanelGeometry` has no way to express one, so four rectangles were rebuilt over an angled design and the baked text showed beside them | contract |
| `portrait-logo` | broken | **stage 3, fill + registration + placement** - four panels rebuilt at colours the pixels do not contain, unit bucketed to the wrong zone | compiler |
| `non-latin` | marginal | **stage 3, placement** - `zoneFor` bucketed a lower third to mid-frame | compiler |

The six usable results are not a different pipeline. They are the designs that happened to be a
plain opaque rectangle with text on it - the one shape this compiler can rebuild.

---

## 2. Four measured defects in the deterministic compiler

### 2.1 The design unit renders at 0.72x the size it was designed at

`PRO_STANDARD_ROUTES.concept` is asked for "a full 1920x1080 frame" and
`google/gemini-3.1-flash-image` returns **1376x768** (all 12 concepts in this round, and all 6
checked-in fixtures). `compileProConcept` then builds the plan against the concept's own pixel
frame:

```ts
const plan = normalizeProInterpretation(result.output, { width: concept.width, height: concept.height }, uuid);
```

and `compileProPlan` hands those pixels straight to the design frame:

```ts
designArt: { path: artPath, width: Math.round(plan.unit.w), height: Math.round(plan.unit.h) },
```

`IMPORTED_DESIGN.create` reads `art.width` as DESIGN pixels - `.imported-design-box { width:
calc(${art.width}px * var(--scale)) }` - and the design frame is 1920x1080. Nothing rescales.
So a strap the model drew across 61% of its frame is painted across 44% of the graphic's frame.
Measured, n=5 fixtures, every one identical:

```
  design unit rendered at 0.72x the size it was designed (1.00 is faithful)
```

0.72 is exactly 1376/1920. **This is a coordinate-space bug inherited from the funnel Pro
reuses**: in the Import Graphic flow the artwork's pixels legitimately ARE design pixels,
because the user's file is the design. A generated concept is a proxy for a 1920x1080 frame,
not the frame itself, and nobody converted.

It is invisible to every gate because it shrinks the raster crop, the rebuilt panels, the placed
fields and the type together. A human reads the result as "a small graphic", not a broken one -
which is why six of them were scored usable while carrying it.

### 2.2 Live text renders at 0.59x the baked text it replaces

A second, independent shrink sits in the shared field normalizer
(`src/ai/importAnalysis/normalize.ts`):

```ts
const capBased = region.typography?.fontSizeNorm
  ? (region.typography.fontSizeNorm * art.height) / 0.72
  : boxH * 0.72;
```

`fontSizeNorm` is deliberately dropped for Pro (`normalize.ts` `analysisView`, the 2026-07-31
ruling), so Pro ALWAYS takes the else branch: font size = 0.72 x the reported box height. The
interpretation's text boxes are tight - measured against the baked glyphs they are within a pixel
or two on 8 of 10 - so the 0.72 is a straight 28% undersize, and it compounds with §2.1:

```
  live text rendered at 0.59x the baked text it replaces (n=10 text regions)
```

For the Import Graphic flow that conservatism is right: the box may be loose and the placed
field must not overflow its slot. For Pro it is fatal, because the live line is REPLACING a
baked line that is still in the picture. Whenever the cover-or-erase step fails, the viewer sees
the same name twice at roughly half size and full size - which is precisely what
`pro/sports-live.png` and `pro/minimalist.png` show. **The size mismatch is what turns an
un-erased plate from a near-miss into an obviously broken graphic.**

### 2.3 The rebuilt fills are not the colours in the picture

For every `rebuild-shape` region in the checked-in fixtures, the mean colour of the pixels
inside the region's OWN reported box, against the fill it told CSS to paint:

```
  rebuilt fills: mean rgb distance 131, within 20 on 0 of 17
```

Zero of seventeen. Two are within 40 (`long-name` #283C6C, `news-public` #1F4E97). The rest run
54, 63, 76, 79, 112, 118, 158, 164, 218, 220, 227, 248, 308. Some of that is baked text and
gradients pulling the mean, and the metric is deliberately blunt - but a distance of 220 is not
anti-aliasing. It is a box that does not contain the thing it claims, a colour that is not there,
or both. The compiler paints them at full opacity anyway, and `resolveTreatment` accepts any
well-formed hex.

### 2.4 The designed position is discarded and replaced with one of nine buckets

```ts
function zoneFor(plan: ProPlan): Zone9 {
  const cy = (plan.unit.y + plan.unit.h / 2) / plan.frame.height;
  const vertical = cy < 1 / 3 ? 'top' : cy > 2 / 3 ? 'bottom' : 'mid';
```

`long-name`'s unit centre sits at cy = 0.66 of the concept frame - a lower third by any reading,
a hair under the threshold - so it is bucketed `mid` and the compiled graphic renders vertically
centred (masks at y=492 and y=560 of a 1080 frame). The concept placed it at 0.58-0.74. This is
`ROUND.md`'s "drifted mid-frame in 2 of 12", and the cause is not drift: the compiler never
carries the designed y at all. It reads a designed position, throws it away, and re-derives an
approximate one.

---

## 3. The one defect that IS about image-led design

`ProPanelGeometry` can express a rectangle with a corner radius, a solid or two-stop gradient
fill, and an opacity. That is the whole vocabulary. On `sports-live` the interpretation model
looked at the angled panels, understood exactly what was needed, and had nowhere to put it -
so it wrote a warning instead (`pro/results.json`, verbatim):

> "The panels are non-rectangular with angled edges. The 'panel' shape and bounding boxes are
> provided as tight-fitting, and the platform is expected to interpret and rebuild these angled
> shapes (e.g., using CSS clip-path) rather than strictly rectangular forms with radiusNorm."

The compiler rebuilt four rectangles, the tight crop kept the angled original underneath, and the
result is the worst output in the round. **The perception was correct; the contract could not
carry it.** That is a real and structural limit on reconstruction - but it is a limit of a
FOUR-FIELD panel schema, not of image-led design. A `clip-path` polygon is a list of points.

The other genuinely image-led constraint is the clean plate. The flat-fill erase
(`eraseRegionFlat`) fired **zero times in twelve briefs**, and the ring matte fired zero times
too. Generated concepts have textured backdrops by construction - the concept prompt asks for
"a dark, softly blurred, neutral studio backdrop". So the erase path is, against this concept
prompt, dead code. Everything rests on cover-by-opaque-panel, which works only for rectangular
designs, which is §3's first paragraph again.

---

## 4. The claim that no gate could see it is false

`ProCompileReport.warnings` already separates the two populations:

| | warnings = 0 | warnings > 0 |
|---|---|---|
| usable (6) | news-public, corporate, long-name, multiline-title, high-contrast, gradient-accent | - |
| broken / marginal (6) | empty-optional | sports-live, entertainment, minimalist, portrait-logo, non-latin |

Eleven of twelve, perfectly separated. The one miss is `empty-optional`, whose failure is in the
concept stage, upstream of anything the compiler could warn about.

`pro-bench.mjs` computes:

```js
checks.pass = checks.validationOk && checks.textFields >= ... && checks.nameCarried && checks.titleCarried && ...
```

`reportWarnings` is recorded in the results file and **not read**. The compiler said "the baked
text stays visible in the artwork under the live field" and the scoreboard printed PASS.

The same is true of the product: `AiStep` builds its summary from `textFields` and
`panelsRebuilt`, and the warnings ride the result card as advice. A compiler that knows it could
not remove the original text is not reporting an inconvenience; it is reporting that it shipped
two copies of the name.

There is a second, cheaper tripwire nobody wired: **`artDropped` predicts the verdict.** It fired
on 3 of 12 - news-public, long-name, gradient-accent - and all three are usable. It is the path
where the raster is dropped entirely and the graphic is pure reconstructed code. There is no
plate left to show through, so the whole failure mode is structurally absent.

---

## 5. What this does and does not change about the round's verdict

**Stands.** The inverse relationship is real in its narrow form: this compiler rebuilds
rectangles, so the designs it survives are the ones that are rectangles, and a more distinctive
concept is more likely to be angled, layered or textured. Six of twelve passed because six of
twelve were straps.

**Does not stand.** "A better image model makes this worse" is not supported. The five broken
outputs are not five instances of one cause. One is a prompt bug in the concept call. Three are
dominated by the scale, type-size, fill and zone defects above - all of which hit the six usable
briefs equally hard and merely failed to break them. Exactly one, `sports-live`, is the
rectangle-vocabulary limit the round names, and it is a schema with no polygon in it.

**Therefore: the interpret → compile path has not been fairly tested.** What was measured is a
compiler that shrinks every design by a quarter, halves its type against the plate it leaves
behind, paints panels in colours the picture does not contain, and re-buckets the position -
scored by a bench that discards the compiler's own warnings. That is not a verdict on image-led
design. Parking it is still defensible on cost and on the clean-plate problem; parking it on
*"the approach cannot work"* is not what this evidence says.

---

## 6. What the round could not answer, and why

- **The 2026-08-08 interpretations were not saved.** `--save-fixtures` was not passed, so the
  twelve raw model outputs that produced these twelve frames are gone. Per-brief attribution for
  the failing five had to be reconstructed from frames, `results.json` and code; the numeric
  measurements in §2 come from the six 2026-07-31 fixtures instead. **A paid round should always
  write its fixtures.** The concepts cost $0.92 and the interpretations that explain them cost
  nothing extra to keep.
- **Every fixture measurement is on the 2026-07-31 concept model.** The three arithmetic defects
  are in code, so they do not vary by round; the fill fidelity and box tightness numbers might.
- **No vision judge was run**, here or in the round. "Usable" remains one person reading frames.
