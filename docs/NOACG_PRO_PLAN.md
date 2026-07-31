# NoaCG Pro - the image-guided editable graphics pipeline

Status: in progress (first vertical slice: lower thirds). This document records the
architecture decisions for NoaCG Pro, the tier above NoaCG Lite: image-model visual
direction compiled into ordinary, editable, exportable NoaCG templates.

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
- **Logos / portraits**: v1 keeps them in the plate and reports them (replaceable-asset
  slots are the next slice); an explicit `filelist` slot is only added when the brief
  asked for a logo field.
- **Complex textures / illustrations / backgrounds**: stay raster in
  `.imported-design-art`, by design.
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

## 7. UX (v1)

A new wizard entry card, **Create with AI Pro**, in the AI strip (clearly separated from
Lite; the Lite path is untouched). One step surface with explicit machine states:

`brief -> generating concept -> concept review (image + estimated cost) -> interpreting
-> compiling -> review (editability report) -> open in editor / export`

- Failures are actionable and never destroy prior state (same rules as AiStep).
- Offline / flag-off: the card is absent (mutation-pinned in e2e); the stub pipeline
  (fixture concept + fixture interpretation) keeps the whole flow e2e-testable without
  tokens, the `stubProvider` pattern.
- No isolated Pro editor: Finish lands in the ordinary editor or the export window.

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
  backdrops spread 200+ counts per channel across the band, far past `FLAT_BG_TOLERANCE`,
  and their accent bars come back as `kind: decorative` (kept raster in v1), which keeps
  the pad on those edges. The clean fix for those remains the deferred image-edit
  clean-plate capability (or alpha matting).
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

## 11. What v1 deliberately does not do

- No generated video or motion assets (architecture leaves room: a video background
  would be one more capability + one more asset kind).
- No image-edit clean-plate call (declared capability, deferred; §5's panel-cover +
  erase policy is the v1 answer).
- No multi-concept fan-out, no managed funded tier, no credit pricing UI.
- No non-lower-third graphic types (the contract carries `graphicType` so widening is
  an allowlist change plus per-type compile rules, not a redesign).
