# NoaCG Pro - the image-guided editable graphics pipeline

Status: **the reconstruction path is PARKED on measurement (2026-08-08, §10a)** - the concept
stage works and the compiler cannot keep what it designs. The first vertical slice (lower thirds)
is built and runs; this document records the architecture decisions for NoaCG Pro, the tier above
NoaCG Lite: image-model visual direction compiled into ordinary, editable, exportable NoaCG
templates. Read §10a before proposing further work on it.

The one-sentence contract: **the image model proposes the appearance; NoaCG owns
structure, fields, animation, validation, and export.** A generated image is a visual
reference or a reusable asset - never a hidden scene model, never a screenshot-to-HTML
side channel.

## 1. Why this is not the thing AI_WIZARD_PLAN.md rejected

`docs/AI_WIZARD_PLAN.md` §5 deliberately rejected "an image-generation model for
backgrounds/textures" because it pulls output away from clean, editable, exportable code.
Pro revisits that decision *with the objection answered* rather than ignored:

- Every meaningful text element becomes a real SPX DataField through the same funnel the
  Import Graphic flow uses (`addPlacedLine`), so the result is operator-editable in every
  export target.
- The primary panel is reconstructed as CSS where practical; only genuinely complex
  artwork stays raster, and the product says so honestly (the editability report).
- The compiled template is an ordinary `SpxTemplate`: data-region timeline, Style-panel
  contract, the existing validators, the existing six export targets. Once compiled it
  never needs the generation model again.

## 2. Architecture - what is reused (almost everything)

The pipeline is: **brief -> concept image (new) -> interpretation (extended) ->
deterministic reconstruction (existing funnel) -> existing validation -> existing editor
and export.**

| Stage | System | New or reused |
| --- | --- | --- |
| Brief | `ProBrief` (typed, lower-third-only v1) | new, thin |
| Concept generation | gateway image-output capability | **new seam** in `api/_lib/aiGateway.ts` |
| Interpretation | one vision call, structured contract `ProInterpretationV1` | extends the `importAnalysis` contract family |
| Normalization | deterministic clamp into `DesignFieldSpec`s + panel specs | same doctrine as `importAnalysis/normalize.ts` |
| Reconstruction | `IMPORTED_DESIGN.create()` + `applyDesignFieldSpecs` (`addPlacedLine` / `setLineTextStyle` / `setLineFit`) + reconstructed panel CSS | existing funnel, one small additive part kind |
| Motion | the `design-*` preset family + NOACG_ANIM data region | existing |
| Validation | `productionSpxValidator` (static + runtime bench + safety screen) | existing |
| Editor / export | ordinary `SpxTemplate`, all six targets | existing, untouched |

There is **no second scene model**: the structured interpretation is an ephemeral
proposal (like `ImportedGraphicAnalysisV1`), consumed by a deterministic compiler whose
output is code. The code remains the single source of truth the moment the editor opens.

## 3. Provider architecture

### 3.1 Capabilities, not providers

Pro operations are named capabilities, resolved to routes independently:

- `image-generation` - concept images. New gateway modality (§3.2).
- `image-edit` (clean plate) - declared in the capability model, deferred beyond v1
  (see §5 for how v1 gets clean results without it).
- `design-interpretation` - vision + structured output. Rides the existing gateway
  exactly as import-analysis does.
- Template planning / motion direction / repair - not separate calls in v1; the
  interpretation contract carries motion intent, and repair is the gateway's existing
  schema-revalidation + bounded retry.

### 3.2 The gateway grows one seam: image output

`api/_lib/aiGateway.ts` gains an image-output request mode (`expect: 'image'`):
the adapter asks the route for an image, and the normalized result carries
`images: [{ base64, mediaType, width, height }]` beside the usual usage/cost/attempts.
V1 implements it for the **OpenRouter adapter** (chat completions `modalities:
["image","text"]`), because that one adapter already reaches Gemini image models and a
growing set of open-weight image models behind one API shape and one billing meter.
Other adapters reject `expect: 'image'` with a normalized `unsupported` error; new
adapters enter under the same `ProviderAdapter` interface, never beside it
(`docs/AI_PROVIDER_GATEWAY.md` doctrine).

Model discovery: the existing OpenRouter discovery filters to `output_modalities=text`;
Pro adds a second, separately-cached discovery list for `output_modalities=image` so the
Pro settings UI can offer real image-capable routes with live prices.

### 3.3 Who pays (v1): BYO-key, `surface: 'pro'`

Image generation prices sit far above the funded-route ceiling
(`FUNDED_ROUTE_PRICE_CEILING`), and the project's standing cost policy is that hosted AI
spends only on cheap routes until there is revenue. So v1 Pro is **not a
NoaCG-funded task**: it runs through the ordinary `/api/ai/generate` gateway on the
caller's own key (BYO or self-host managed key), exactly like the main SPX harness -
client-owned prompts, server transport, content-free `ai_gateway_requests` ledger rows.

- New gateway surface tag `'pro'` beside `'video'`, gated on a new entitlement key
  `ai.pro` with the same honest enforcement note as `ai.video` (reaches recognised
  accounts; an account-free caller on their own key is not stopped).
- A managed, credit-weighted, server-owned Pro profile (task registry + approved routes
  + quotas + an Auto route) is the designed follow-up once pricing exists; the task
  registry checklist in `docs/AI_TASK_REGISTRY.md` is written for exactly that addition.
  Nothing in v1's shape blocks it: the contracts are dependency-light and the prompts can
  move server-side the way Lite's did.

This keeps expensive model use explicit (the user chose the route, the UI shows the
estimate) and measurable (the gateway ledger and the browser telemetry ring both record
it - Pro runs record as kind `pro-generate` in `src/ai/telemetry.ts`).

## 4. The structured intermediate: `ProInterpretationV1`

`src/ai/pro/contract.ts`, versioned like `import-analysis-v1`, schema-forced and
server-revalidated. It extends the `ImportedGraphicAnalysisV1` shape rather than
inventing a parallel vocabulary:

- canvas + safe margins, graphic type + confidence (v1 accepts only `lower-third`);
- regions: `kind: text | logo | image | panel | decorative`, normalized bboxes,
  confidence, roles, sample text, typography (same **font honesty** rule: enum-locked to
  the seven bundled faces, `matchQuality` can never claim exact);
- panel regions additionally carry reconstructable geometry: fill (solid or two-stop
  gradient), corner radius, opacity, optional accent-bar classification;
- an explicit `editable` classification per region: `rebuild-text` / `rebuild-shape` /
  `keep-asset` / `flattened` - the model's proposal, clamped by the deterministic
  normalizer (text is ALWAYS rebuilt; uncertainty degrades to `flattened`, never to
  pretend-editable);
- motion intent: one of the `design-*` presets + direction + speed (the same enum
  import-analysis uses), optional per-region stagger order;
- warnings, verbatim and user-facing.

Rendered words inside the image are content, never instructions (the established
prompt-injection doctrine is restated in the Pro prompt).

## 5. Reconstruction policy (v1)

- **Text**: always rebuilt as placed fields through `addPlacedLine` - real DataFields,
  canvas-draggable, fit-protected. Never left as pixels with an overlay.
- **The primary panel and accent bars**: rebuilt as CSS layers when the interpretation
  classifies them reconstructable. A reconstructed opaque panel *covers the baked
  original including its baked placeholder text* - which is what makes a clean result
  possible with a single image call and no clean-plate model.
- **Baked text outside reconstructed panels**: the compile runs the existing deterministic
  flat-fill erase (`assets/eraseRegion.ts`, the Import Graphic Prepare step's machinery)
  over each such region of the crop. Only a flat verdict is applied - the Prepare step's
  "use it anyway" has a human looking at a preview, the compiler runs unattended - so a
  region the erase refuses stays in the plate with an honest warning naming the non-flat
  background. `ProCompileReport.textErased` counts the clean removals.
- **The crop's pad ring**: a side of the unit whose union edge is owned entirely by rebuilt
  OPAQUE panels drops its pad - the CSS panel repaints that edge, so the tight crop loses
  nothing and removes both the backdrop ring and the misregistered baked-panel peek (§10).
  Sides that keep pad (text / logo / flattened raster at the edge) get a deterministic
  matte pass (`matteRingTransparent`): a flat band is written as true transparency
  (`ringMatted`), a non-flat one is reported, never guessed at. Dropping the raster
  entirely (`artDropped`) additionally requires EVERY region to be rebuilt - a kept-raster
  logo or flattened panel lives only in the crop, and dropping it would silently delete
  them.
- **Logos / portraits**: v1 keeps them in the plate and reports them (a replaceable slot
  for a PORTRAIT is still a later slice); an explicit `filelist` slot is only added when the
  brief asked for a logo field. When it did, the compile reports that slot
  (`ProCompileReport.logoSlot`) and `fillProLogoSlot` (`src/ai/pro/logoAsset.ts`, the
  pipeline's `logoMark` option) bundles the user's first "use it as it is" upload into it and
  sets it as the slot's value - deterministically, so the mark the user attached is actually
  in the graphic rather than merely asked for. It runs BETWEEN the compile and the validator,
  because the as-is screen (`src/ai/assetIntegrity.ts`) finds a protected picture by its
  `<img src>`: filling afterwards would leave the gate screening a template with an empty
  slot, and the result card's readiness rows describing one. It writes no CSS, which is how
  it passes that screen by construction; the region's outcome line then says the slot was
  filled, and the "waiting for a file" warning is retired.
- **Complex textures / illustrations / backgrounds**: stay raster in
  `.imported-design-art`, by design. A `decorative` region rides the panel rules WHEN it
  carries reconstructable geometry - models file accent bars and divider rules under
  decorative (every 2026-07-31 fixture does), and CSS renders those exactly; a duplicate
  region naming the same box twice (a 'panel' and a 'decorative' twin) becomes ONE layer.
  Geometry-less decoration stays raster.
- The compile returns a `ProCompileReport`: per region, what it became and why - the
  editability score the product surfaces before the editor opens.

The compile target is the `imported-design` structure (art layer + placed fields), so
every existing behaviour - locks, Style tab, design presets, stretch, text-fit, export -
applies verbatim. One additive change in `src/model/structure.ts`: `.{prefix}-panel-N`
elements become selectable `panel` parts so reconstructed panels get canvas/timeline/
Inspector presence. (Additive: no existing template emits that class.)

## 6. Motion (v1)

The interpretation's motion intent selects among the existing whole-unit `design-*`
presets (fade / slide / pop / blur) with speed + direction, emitted exactly as the
Import Graphic flow emits them - a NOACG_ANIM data region, timeline-editable,
deterministic reverse for the exit. Reconstructed panels and placed lines are ordinary
layers, so per-layer refinement (stagger, masked reveals) is normal timeline editing;
richer generated motion (per-layer stagger plans, masked reveals chosen by the model)
is a later slice and stays inside the validated preset/keyframe vocabulary.

## 7. UX - Pro is a TIER of Create with AI (revised 2026-08-01)

There is **no separate Pro wizard card**. Create with AI is the one AI creation entry
point, and the ⚙ AI settings panel inside it carries the execution-tier picker:

- **NoaCG Lite** - the managed free profile (offered when the server exposes it).
- **NoaCG Pro** - this pipeline, on pinned standard routes. A normal Pro user never picks
  a text, vision, or image model: `PRO_STANDARD_ROUTES` (src/ai/pro/pipeline.ts) documents
  the curated choice and §7a records the reasoning.
- **Custom provider** - the secondary advanced surface: bring your own provider, key, and
  models (the established `AiProviderSettings` component, unchanged).

Lite and Pro share the SAME brief, UI, and workflow systems - the prompt, the "More
control" structured setup (category, data fields with kinds, look, fonts, animation), the
purposed uploads, and the brand strip. `src/ai/pro/brief.ts` maps that shared brief onto
the v1 `ProBrief` deterministically: the first two text fields become the name/title lines
(example values ride into the concept), an as-is upload or a requested image field asks
for the logo slot, which the pipeline then BUNDLES that upload into (§5,
`fillProLogoSlot`) - and style/mood/avoid/brand-colour decisions travel as direction text.
Category options clamp to what v1 compiles (lower thirds); a wider pick resets to 'auto'
exactly as Lite clamps its own scope.

One Generate press runs `concept -> interpret -> compile -> validate` with the stages
streamed into the busy line; the result card carries the concept image with its real cost,
the per-region editability report, and the shared readiness rows. Pro results offer no
refine/repair calls in v1 - the compile is deterministic, so the honest move on a failure
is a new concept, and the card says so.

- Failures are actionable and never destroy prior state (same rules as the rest of AiStep).
- Without an OpenRouter key the tier says so and runs the stub pipeline (deterministic
  local concept + fixed interpretation), which keeps the whole flow e2e-testable without
  tokens - the `stubProvider` pattern (e2e/pro.spec.ts).
- No isolated Pro editor: Finish lands in the ordinary editor or the export window.

### 7a. The standard routes (v1) - quality / cost / model-selection reasoning

`PRO_STANDARD_ROUTES` pins concept generation to `google/gemini-3.1-flash-image` and
interpretation to `google/gemini-2.5-flash`, both via OpenRouter:

- **Quality**: the 2026-07-31 paid round (§10) measured 4/5 brief-bank passes after the
  normalizer fixes, with the strongest text rendering among affordable image routes -
  text fidelity is the binding constraint for a concept whose lines must be transcribable.
- **Cost**: ~$0.067 per concept + **$0.009-0.011 per interpretation** = **~$0.077 per completed
  generation**, roughly a tenth of premium image routes - and ~250x a NoaCG Lite generation
  ($0.0003), which is the comparison that decides whether the tier is worth its price.
  The interpretation figure was ~$0.002 under OpenRouter and is five times that on the managed
  gateway, because **reasoning tokens bill**: the route spends 2,400-3,900 output tokens thinking
  before it writes any JSON (measured 2026-08-08, benchmarks/pro/round-2026-08-08/ROUND.md §3).
  A generation that FAILS after its concept still costs the full ~$0.077.
- **Why one provider**: OpenRouter reaches both models behind one API shape, one billing
  meter, and the gateway adapter that already implements `expect:'image'`.

Changing either route requires re-running `npm run bench:pro` paid stages. Brief-driven
model routing (picking routes per graphic type, references, or quality/latency budget) is
deliberately deferred until the single standard path has been validated in use.

## 8. Cost and observability

- Browser telemetry: `startAiRun('pro-generate')` records stages (concept /
  interpret / compile / validate), models, usage, retries, and the compile report's
  editability summary in the existing local ring.
- Server: `ai_gateway_requests` rows per call (already content-free), surface `'pro'`.
- Explicit budgets: one concept call + one interpretation call + the gateway's bounded
  retries; no automatic paid cascades. The repair loop for interpretation is schema
  revalidation + at most one re-roll, matching import-analysis.

## 9. Benchmarking

`benchmarks/pro/v1/` + `scripts/pro-bench.mjs`:

- A brief bank covering news / sports / entertainment / corporate / minimalist,
  portrait+logo variants, long names, multiline titles, empty optional fields,
  non-Latin text, broadcast-safe placement.
- **Fixture-first**: checked-in concept images (locally rendered, no paid calls) and
  hand-authored interpretation fixtures drive the deterministic stages - normalize,
  compile, validate, runtime bench, export - so regression runs are free.
- Paid stages (`--generate`, `--interpret`) are explicit, per-run cost-ceilinged, and
  write their outputs back as new fixtures plus a review gallery (the `ai-bench.mjs`
  pattern), keeping deterministic structural checks separate from subjective visual
  scoring.

## 10. Known limitations (v1, measured)

- **The crop ring** (narrowed by the erase slice, still real). The pad is now per side:
  a union edge owned by rebuilt opaque panels crops tight (no ring, and the misregistered
  baked-panel peek below goes with it), and a retained flat band mattes to transparency.
  What remains is the honest residue: a NON-flat backdrop behind a retained-pad side stays
  in the crop and is reported as a warning. Measured on the six checked-in fixtures, that
  residue is the common case for model-generated concepts - their "dark and quiet"
  backdrops spread 200+ counts per channel across the band, far past `FLAT_BG_TOLERANCE`.
  (Accent bars coming back as `kind: decorative` used to keep pad on their edges too;
  decorative-with-geometry now rebuilds - §5.) The clean fix for the non-flat residue
  remains the deferred image-edit clean-plate capability (or alpha matting).
- **Paint order is an unmeasured dimension.** The runtime bench measures rects, not paint,
  so a reconstructed opaque panel covering the live text passed every deterministic gate;
  only a rendered-frame screenshot caught it (fixed by insertion order, and the bench
  gallery is the standing tripwire). A vision judge over the hold frame is the general
  answer, deferred with the Lite judge's calibration doctrine.
- **Baked text outside reconstructed panels** now runs the deterministic flat-fill erase
  (§5); a non-flat background still refuses and is reported. Note the coverage honesty:
  none of the six checked-in fixtures exercises the clean path (their text is panel-covered
  and their backdrops non-flat), so the erase and matte behaviours are pinned by
  e2e/pro.spec.ts with hand-built flat and gradient concepts instead.

Findings from the first PAID round (2026-07-31, gemini-3.1-flash-image concepts +
gemini-2.5-flash interpretation, ~$2 total including debugging):

- **Google's constrained decoding has a schema state budget.** Number enums are rejected
  outright, and min/max bounds, string patterns, length caps and oneOf branches together
  blew the "too many states for serving" limit. The wire schema now carries SHAPE only
  (types, required, closed objects, string enums); every bound, cap and colour check
  lives in the normalizer - which is where the platform doctrine wanted the meaning
  enforced anyway. Do not re-add constraints without re-running a paid round.
- **`fontSizeNorm` is not a measurement.** Models free-associate its meaning (the bbox
  height as an image fraction in one answer, "0.6 of the region" in the next), so the
  normalizer now ignores the claim and derives type size from the measured bbox height -
  the erase-seed rule. This took the round's bank from 1/5 to 4/5 passing.
- **Logo classification misses.** A requested logo area came back as `decorative`, so no
  replaceable slot was placed (the one remaining bank failure). Interpretation-prompt
  teaching, next round.
- **Raster misregistration** - a rebuilt panel sits a percent or two off the baked one,
  so crop pixels peek out beside it. The erase slice took the geometric half: a
  rebuilt-opaque panel edge now crops tight (the peek outside the interpreted edge is cut
  away), and `artDropped` fires whenever every region was rebuilt and one opaque panel
  covers the now-unpadded unit. A peek beside an edge the crop must keep - a flattened
  panel, a kept logo - remains, and remains a clean-plate argument.

## 10a. The 2026-08-08 feasibility round - the measured answer to "does this work at all"

`benchmarks/pro/round-2026-08-08/` (ROUND.md + MACHINE.md) is the round `docs/GOALS.md` asked for,
and its verdict is that **the reconstruction is the thing that does not work**, not the concept.

- **The image model designs well**: 11 of 12 concepts are credible broadcast lower thirds.
- **The reconstruction ships a visibly broken graphic on 5 of 12** while the deterministic gates
  report 11 of 12 passing. §10's "crop ring residue" and "paint is an unmeasured dimension" are
  not residue: they are where Pro's output quality lives.
- **The relationship is INVERSE.** The strongest concept in the bank (`sports-live`, angled panels,
  layered accents) became the worst output in the bank, because a distinctive design is exactly the
  one a rectangle-rebuilding compiler cannot reproduce or erase behind. A better image model makes
  this worse, not better.
- **Lite delivered a usable graphic on 12 of 12 of the same briefs**, at 1/250th the cost and 1/6th
  the wall clock. Lite's weakness is sameness (9 of 12 on one chassis) - a ceiling on something that
  works. Pro's is correctness reported as success.
- **A truncation bug cost 5 of 12 concepts in the first bank** - `maxTokens: 4000` against a route
  that spends ~96% of its output budget on reasoning tokens (§3 of the round doc). Fixed to 12,000.
  Every hand-set `maxTokens` in the tree deserves the same check.

The round's recommendation is to PARK the interpret→compile path and keep the concept stage for two
uses that do not require reconstruction: a generated concept fed back as a `layout` REFERENCE into
the grounded adapt path (attacking Lite's sameness with Pro's strength), and concepts as input to
human-built catalog chassis. Nothing here is a reason to change `PRO_STANDARD_ROUTES`; the failure
is in the compiler's reach, not the route.

**Q2, and it is not a Pro problem.** Pro cannot generate custom fields or a state machine by
construction - `ProBrief` is `{brief, name, title, includeLogo}` and the compiled graphic carries
two text fields, one step, no machine. The free-form coder DOES mint its own fields (6 correct,
correctly typed, operable on `#/control/<id>`), but a machine cannot survive its pipeline:
`convertEmittedRegion` → `importAnimData` returns `{version, root, speed, steps}` and mentions
`machine` nowhere. No generation path in the repo asks any model for a state machine. That seam -
a small structured MACHINE stage spliced in deterministically, the way `designSpec` already works -
would serve every tier at once and needs no image model.

## 11. What v1 deliberately does not do

- No generated video or motion assets (architecture leaves room: a video background
  would be one more capability + one more asset kind).
- No image-edit clean-plate call (declared capability, deferred; §5's panel-cover +
  erase policy is the v1 answer).
- No multi-concept fan-out, no managed funded tier, no credit pricing UI.
- No non-lower-third graphic types (the contract carries `graphicType` so widening is
  an allowlist change plus per-type compile rules, not a redesign).
