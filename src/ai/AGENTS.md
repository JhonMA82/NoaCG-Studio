# src/ai - the SPX generation harness

Loaded alongside the root AGENTS.md when working in this directory (Claude reads it via this
directory's CLAUDE.md import; Codex reads it directly). Keep it accurate.
(The VIDEO harness is its own world: src/ai/video + src/video - see the root map.)

**Every `##` section states its STATUS in its first line:** **LIVE** (a user reaches it today),
**EXPERIMENT** (built, but flagged off or bench-only - no user reaches it), **RETIRED** (kept only
because code still names it). A section's status is not derivable from its content, and reading an
experiment as current strategy has already cost this project a paid round. Dead ends, what they
measured, and the conditions that would revive them are **`docs/AI_ATTEMPTS.md`** - read it before
proposing an approach that sounds new.

## The doctrine - adapt, do not invent

**LIVE.** The harness exists to make AI results reliably better than a plain model call - and it must
EARN that claim in `scripts/ai-compare.mjs`, never assume it.

**The strategy that won is ADAPT-FIRST** (`docs/ADAPT_FIRST_PLAN.md`): the model retrieves a proven
catalog design and adapts it - brand colours, a logo, the user's words, typography and proportions
inside a clamped range. **It does not invent a layout.** Five paid rounds measured cheap models
composing a broadcast graphic from a blank stylesheet and none produced one the owner would air; the
catalog is both the crutch and the moat. Retrieval is that doctrine in code, so it is the section
directly below.

**A generated graphic can only be a category the catalog already carries.** Lite's allowlist is a
subset of the catalog's categories (today: lower thirds), and no path widens it at generation time.
That constraint is not a limitation to route around: it is what guarantees a generated graphic is
**operable in the control panel through the same machine, fields and events as a hand-picked one**,
because it was assembled by the same `variant.create()` the wizard runs. A graphic outside those
categories would carry no machine the control layer knows how to drive.

The principles, in priority order:

1. **Ground engineering, not visual style.** The platform pins the SPX definition, field ids, the
   `:root` contract, auto-fit, zones, the NOACG_ANIM region + interpreter, and export readiness. The
   AI owns composition, typography, spacing, proportions, colour, shape language, motion character,
   density, and hierarchy.
2. **The brief and references define taste.** Prompts state reasoning criteria - never a fixed
   aesthetic. A news strap and a children's game show earn different answers. Uploaded references are
   read as a design SYSTEM that outweighs the generic rules.
3. **Different briefs must produce different designs** - "same layout, different colours" is a named
   failure. The compare rig's top-chassis counter is the sameness tripwire.
4. **The smallest harness that wins.** A catalog-fit generation costs ONE small model call; everything
   after it is deterministic. Stages that only add cost get cut.

Two rules the repo paid to learn, binding everywhere here:

- **A deterministic gate cannot catch a defect in a dimension it does not measure** - so either
  measure that dimension or forbid the construct. Machine-valid is not good.
- **Write a constraint as INSPECTION, never as a list of named failures**, and let ABSENCE be its
  first failure. A prohibition suppresses the behaviour it constrains. When a teaching change moves a
  rate, suspect the FRAMING before the rule.

## Retrieval - the shortlist of proven designs (`retrieval.ts`)

**LIVE, on the ADAPT route only.** The design stage used to be handed `catalogDigest()` - **430
variants, ~20,300 tokens, one flat list** - and asked to find the right design on the cheapest model
in the product, and that chassis choice is the one decision the whole grounded path rests on.

`shortlistFor(brief, intent, options?)` narrows it with **no new model call and no second retrieval
system**: the ranking is the Browse storefront's engine (`templates/search.ts`), the structural filter
is the ONE anchor table, and both read what the intent stage already produced. Four measured
properties make it usable rather than merely shorter - a brief is a SET of terms (token-AND); each
term is weighted by how RARE it is in the pool; the cut is RELATIVE to the best match (a nonzero score
is not relevance); and the floor of four is filled in BANDS, selectively-named designs first, the
residue last. `Shortlist.reason` states the split, so a shortlist never reads as four answers when two
are floor-filling. The measurements are `docs/ADAPT_FIRST_PLAN.md` §3.1.

Everything degrades rather than empties: an over-tight field bucket is dropped, a query matching
nothing falls back to catalog order, no resolvable anchor returns `FULL_CATALOG`.
**`variantSatisfiesAnchor` answers TRUE for an anchor that no longer resolves** - right for the
satisfaction check, meaningless for a shortlist - so retrieval checks `anchorResolves` first.

`catalogDigest(only?)` and `narrowVariantTool` are the two seams: the prompt shows the shortlist and
the schema accepts exactly that set. **Shown-but-illegal is a chassis the model picks and
`resolveVariant` silently swaps - the wrong graphic delivered as a success.** A CREATE route keeps the
full digest. The offline stub picks from the same shortlist deterministically, which makes the path
e2e-testable without tokens (`e2e/adapt-first.spec.ts`, `e2e/ai-retrieval.spec.ts`).

**A spec-level REFINEMENT retrieves too, and `ShortlistOptions.keep` makes that safe.** `specRefine`
takes its anchor from the spec it is editing and its terms from the request PLUS what the graphic
already is - "warmer colours" places nothing in a design index. `keep` pins the design in use into the
shortlist, because narrowing collapses the `variantId` enum and a colour request would otherwise swap
the user's graphic out from under them. It is matched against the ANCHOR, not the narrowed pool, and a
`keep` from another structure is refused.

**A catalog chassis is assembled at the zone it was DRAWN for** (`AssembleOptions.keepChassisZone`).
Measured over 89 lower thirds: rendered side agrees with declared `defaultZone` 89 of 89, 87 sit at
exactly 119px from the edge. The catalog ships left-, right- and centre-drawn designs as SEPARATE
members because re-siding a strap means re-siding its accent - so placement is expressed by picking a
differently-anchored member, which retrieval puts in front of the model, and by the Style panel
afterwards. Retrieval therefore matches a requested side against `variant.defaultZone`, the one place
a side is declared; the text index cannot answer it (of twelve right-anchored lower thirds only three
carry the word in their name).

**The policy is an ARGUMENT to `groundedResult`, not a constant** (`keepChassisZone`,
`sizeScaleRange`), because **NoaCG Lite reaches that same function** with `profile` stripped, so
nothing inside can detect Lite - and Lite must compile under its own declared contract (its schema
allows `sizeScale` 0.7-1.4 where the harness tool says 0.85-1.2). Clamping every caller to the
harness's numbers told the Lite model 1.35 was legal and discarded it at compile: the shown-but-illegal
mismatch `narrowVariantTool` exists to prevent, one field over.

## The pipeline (`claudeProvider.generate` - one harness run)

**LIVE.**

1. **Design spec** (`designSpec.ts`, forced `emit_design_spec`) - the only mandatory model call and the
   ROUTER. Returns `fit: 'catalog' | 'custom'` plus every design parameter: chassis (`variantId`),
   lines, palette/font/zone/size, animation preset, real COMPOSITIONAL parameters (typography scale
   ratio/weight/tracking, density, alignment, shape/panel), `referenceSystem`, and an optional
   `flourish`.
2. **Grounded assembly** (`specToTemplate`) - catalog-fit specs run through the REAL wizard assemblers
   (`variant.create`): correct by construction, timeline- and Style-panel-editable. Every out-of-range
   value CLAMPS to the nearest legal one; the project brand palette wins.
3. **Design adjustments** (`designAdjust.ts`) - the compositional parameters apply as a marked CSS
   override block (cascade beats the design CSS; contracts untouched; every adjustment guarded on the
   structure existing). This is what keeps grounded output diverse.
4. **Polish** (`polish.ts`, only when the spec carries a flourish) - ONE bounded call. Writable:
   appended override CSS + the root element's inner HTML. `applyPolish` rejects patches touching
   `:root`/`@font-face`/scripts or losing a field id or an anim-data selector; a rejected or
   bench-failing patch REVERTS. Polish never makes a result worse.
5. **Custom path** - briefs whose STRUCTURE no catalog family carries go to the free-form coder: house
   contracts + the NEAREST catalog variant's real `create()` output as the canonical example + the
   design stage's direction, then the validated repair loop (`shared/repairLoop.ts` - THE one bounded
   errors-back loop both the SPX and video coders drive: `MAX_REPAIR_ROUNDS = 2`, RE-VALIDATED every
   round; what counts as BLOCKING stays each caller's policy, injected as a filter).
   **The region contract is authored, not emitted:** the example's ANIMATION region is shown in its
   AUTHORING shape (`emitPresetRegion`) and the prompt teaches that grammar - natural GSAP the model is
   reliably good at, instead of the strict-JSON data block it reliably got wrong. Every emit runs
   `convertEmittedRegion` (canonicalize a drifted marker, then `convertToDataRegion`, the same
   parity-proven importer every wizard category uses). **The STRUCTURE SPINE is that conversion's
   precondition, so the prompt states it as a hard requirement** - root `<div class="PREFIX">` holding
   `<div class="PREFIX-box">`, that `-box` class ALONE on the element, `PREFIX-mask` around each `#fN`,
   `PREFIX-accent`. An unconvertible region keeps the model's own code (honest hand-crafted output,
   read-only timeline) and its `bench-editability` findings DEMOTE TO WARNINGS at the end - except when
   a modify started from a data-shaped template, where losing the block is a regression and the repair
   loop fights it.

`modify` refines a grounded result at SPEC level while it is still house-shaped (the caller passes the
result's `spec` back via `GenerateOptions.spec`); anything else refines at code level. `convertImport`
= deterministic import first (`model/importTemplate.ts`), then the validated conversion - the AI only
ever sees parsed code, never raw bytes.

## Phase-A routing - the mode + intent stage (`structuralIntent.ts`)

**LIVE.** `GenerateOptions.mode` (`adapt` | `create` | `auto`, default auto) plus `structuralIntent`
run BEFORE the design call in `generate` and `generateAlternatives` (never for Lite, raw, or modify):
one small forced `emit_structural_intent` call on the provider's `role:'fast'` model ->
`normalizeIntent` -> `routeIntent` (deterministic; `structuralFit` checks the type registry + catalog
LIVE, so catalog growth updates routing by itself).

An explicit mode is never overridden. Auto routes CREATE only on originality words in the brief, no
structural fit, a low-confidence/novel/hybrid classification, or a BEYOND-SCOPE match
(`intent.beyondScope`: the brief matches a listed structure but requires structure its
`GraphicType.structuralScope` note excludes - a double-elimination brief on the single-elim bracket
type. The REGISTRY declares the scope, the intent stage judges the brief with evidence, `routeIntent`
decides deterministically). Explicit adapt skips the intent call entirely (one-call economy) and
narrows the spec tool's fit to catalog; a CREATE decision narrows it to custom (`narrowFitTool`).
Decision + intent land on `AiTemplateChange.routing`/`.intent` and the telemetry record, which the
routing benchmark (`scripts/creative-route-bench.mjs`, SPENDS TOKENS) reads rather than reconstructs.

**The anchor vocabulary is ONE table** (`templates/structuralAnchor.ts`): the family words,
`resolveAnchor`, `structuralFit`, `intentCoversFrame`, and what a variant satisfies. It lives in
`templates/` because the router and the satisfaction check need the same answer and `validation` may
not import `ai`. A second copy is how the two come to disagree - the router sending a brief down the
catalog path while the check has no idea what was promised.

## The structural-satisfaction check (`validation/structuralIntentCheck.ts`)

**LIVE, on both routed paths.** Asks whether the result is the graphic that was asked for:

- **Kind** (`structuralKindFindings`) - does the assembled variant carry the anchor the intent
  promised? Answered by IDENTITY against `spec.variantId`. The defect every other gate was blind to: a
  stinger brief routes to the catalog path CORRECTLY, the design stage returns a lower third, and
  static validation, the runtime bench and the parts checks all pass - a lower third really does have a
  headline and really does sit bottom-left. Every measurement agreed and the user got the wrong
  graphic. It reports only when BOTH sides are known.
- **Parts** - list data as a textarea, field capacity, states vs machine/steps statically, plus
  repeating groups and zone placement measured in a rendered iframe. It DRIVES every text-bearing field
  to a sentinel and re-reads the painted frame, because reading the markup for `id="fN"` cannot see a
  standings row, ticker item or credits line a runtime BUILDS from one field. It ignores opacity on
  purpose: a region the machine reveals in a later step is transparent during the entrance and
  perfectly reachable.

Browser-only, injected as `GenerateOptions.structuralCheck`. PARTS findings land as WARNINGS (rule
`structural-intent`) - they measure presence, not quality. KIND findings (`structural-kind`) land as
blocking ERRORS on grounded results (owner decision 2026-07-31): a wrong-kind assembly fails closed and
is surfaced for refine/regenerate, never delivered as a success. Grounded assemblies have no repair
loop, so blocking there changes no repair rounds. `groundedResult` reports the RESOLVED chassis
(`pickVariant` clamps an unknown one), which is also what makes a spec-level `modify` refine the graphic
the user is looking at. Free coverage: `e2e/creative-routing.spec.ts`.

## NoaCG Lite - the managed free profile

**LIVE in production since 2026-08-07; quality is the open problem and the deadline plan is
`docs/AI_LITE_PLAN.md`.** The catalog-only, one-result profile selected with `GenerateOptions.profile =
'lite'`. Its model-bound design call goes through the trusted `/api/ai/lite/generations` endpoint and
the compact allowlist in `liteContract.ts`; the browser cannot supply a model, route, fallback, system
prompt, or cost policy. A ready response rejoins the `groundedResult` path above, so `specToTemplate`,
real catalog assemblers, deterministic adjustments, fields, NOACG_ANIM, assets, validation, runtime
checks, and exports stay shared. **That sharing is the control-panel guarantee** in the doctrine: a Lite
graphic drives through the same machine, fields and events as a hand-picked one because it IS a catalog
assembly.

Lite must never call `generateRaw`, `generateAlternatives`, custom code generation, polish, import
conversion, or code repair. `modify` is allowed only while the caller passes the grounded DesignSpec and
the template remains house-shaped. A grounded failure is reported to the server as a platform validation
failure. No model call may rewrite the compiled code. Unsupported scope returns a typed explanation and
simplification, never an automatic expensive fallback.

**`litePipeline.ts` is the ONE grounded compile path** - `normalizeLiteSpec` + `assembleGroundedTemplate`
(specToTemplate → applyDesignAdjustments → ensureSpecFonts → applySpecOutPreset) +
`productionSpxValidator`. `claudeProvider` is built FROM it and the benchmark runners compile through the
identical function; `scripts/ai-lite-bench.test.mjs` pins that no second copy exists.

**Lite category meaning lives in one `CATEGORY_CONTRACTS` registry.** A contract names the graphic
type, visible field range, allowed kinds, named slots, compatible measured chassis, type-owned
machine, and operator events. The same constrained model call returns category confidence and
alternatives plus structured style intent. Manual category is authoritative; auto mode proceeds
only above the confidence and margin floors, while ambiguity returns choices for the UI. Trusted
server retrieval shows at most five relevant, diverse compatible chassis and narrows the output
enum to the same ids. The compiler owns fields and state and may retry ranked fallback chassis
when the rendered hold rejects generic treatment, weak brief fit, overflow, or poor contrast.

**Lite composes its OWN validator** (`claudeProvider.liteValidator`), for the same reason it passes its
own `AssembleOptions`: `ProductionBenchOptions` can only be answered from the DECISION - which lines must
hold one line (`singleLineIdentityFields`, off the spec's declared roles) and which category's type floor
the ADJUSTED result is held to - and the browser builds its injected validator in AiStep long before a
decision exists. While they were unset, `bench-line-wrap` and `bench-type-floor` were findings every
BENCHMARK measured and no user ever did: **the round scored a stricter gate than the product ran.** All
three are WARNINGS, so composing them in cannot fail a generation that used to pass. Pinned by
`e2e/lite-line-fit.spec.ts`.

**Lite gets NO structural check, which is why field paint is composed in explicitly.**
`withStructuralFindings` returns early without a `StructuralIntent` and Lite runs no intent stage, so the
one question that measures whether a declared field REACHES THE SCREEN never ran on the one path with no
repair loop. The 2026-08-08 quality round produced the proof: a strap that painted its name, reserved a
band under it, drew nothing there, and answered `update()` with fresh data by changing nothing -
`fieldCount: 2`, every rule code silent. The drive lives in `validation/fieldPaint.ts`, shared by the
structural check and the bench's opt-in `fieldPaints`, which `liteValidator` and `compileLiteDecision`
both turn on. **It reads ONE state** (the settled default path), which is why it is opt-in: a field a
later operator event reveals would read as unpainted, and Lite is safe today only because it ships
single-step lower thirds. **Widening Lite past those revisits this note first.** Pinned by
`e2e/lite-field-paint.spec.ts`.

**A chassis's fit metadata is MEASURED where it can be, and `supportingLineChars` is the precedent.** It
was a hand-authored adjective that ranked the designs almost backwards - three of them set their
supporting line in tracked uppercase, costing about a third of the characters a reader expects, and **no
gate in the tree can see the consequence** because a wrapped line does not escape its frame. The number
comes from `node scripts/lite-line-capacity.mjs --check` - run it after any change to a Lite chassis, its
stylesheet, or the bundled fonts. A claim ABOVE the measurement fails as the defect it is; one more than
four characters below fails as stale. **An adjective is what a chassis may say only where nothing can
measure it.**

**A BRAND MARK is under the same rule, and `LiteCatalogEntry.logoSlot` is the measurement.**
`node scripts/ai-lite-brand-audit.mjs --lite --check` renders a real mark into a real slot and
reads the frame back - size, aspect, crop, clear space, containment, ink contrast against the
surface the slot actually paints - and gates the declaration against it. **The design declares
the slot and the compiler fills it; the model never places a mark.** The declaration is split
because the halves go stale differently: `fits` is GEOMETRY (which mark shapes land legibly; no
palette changes it) and `surface` is TONE - `palette` when the slot sits on the design's own
panel, `dark` when it sits on the picture, which means a brand owning only a dark version of its
mark cannot use that chassis at all. **The other half of the answer is the REQUEST**: `hasLogo`
was a boolean, so the model knew a mark existed and nothing about it. `LiteGenerationRequest.mark`
now carries shape, backing and ink, all measured in the browser by `assets/assetInfo.ts`
`probeMark` and content-free by construction; `hasLogo` stays beside it because the quota check
reads it and the request validator is a strict key allowlist. **Retrieval itself narrows a
marked request to slot-carrying chassis** (`retrieveLiteReferenceSet`, and by shape when the
descriptor names one) - the 2026-08-13 baseline traced three of five brand failures to slotless
chassis being shown to marked requests after the semantic round added seven chassis without
slots (`benchmarks/lite/BRAND-BASELINE-2026-08-13.md`). **All thirteen chassis now carry a
measured slot** (2026-08-13): two already drew a well and only the metadata denied it, five had a
well designed for them, and `--lite --check` agrees with the render on every one. A `surface` of
`dark` now covers TWO different facts - a slot sitting on the picture, and `ls12`'s well, which is
painted a fixed opaque dark whatever the package says so a knockout-only brand can use a light
package with no repair (`docs/AI_LITE_BRAND_PLAN.md` §3.4). The validator needs no new vocabulary
for the second: both mean "a surface the palette cannot repaint". Design, findings and the catalog
work they bought: `docs/AI_LITE_PLAN.md` §7, `benchmarks/lite/BRAND-AUDIT-2026-08-09.md`.

**A REQUESTED palette is the platform's to apply, not the model's to return** (`applyLiteBrandPalette`).
Colour splits in two: **identity** (accent, panel) is copied verbatim from the REQUEST - never
altered, never dropped - and **furniture** (text, textDim) is legibility-owned, repaired by a
three-rung ladder (re-map the two furniture slots, clamp lightness with hue and saturation
untouched, neutralize to white or black). The old repair dropped the whole bespoke palette when
the clamp could not reach, and the compile read the MODEL's echo of the palette rather than the
request - so "exactly the brand's colours" could fail three silent ways at once: a near-miss hex,
an omitted palette, a legibility floor deleting the package. Every divergence is now an
`adjustments` code, and those reach `ai_generations.adjustments` (migration 0042) because a repair
the ledger cannot count is a promise nobody can check. The audit's positive twin is
`brand-accent-verbatim` at TOLERANCE 0 - a near miss is the defect, not a pass. A palette nobody
requested is still dropped: the contract widened for the user's colours, not for the model's.
Design and what is deliberately NOT built (chassis re-pick and well, which need §3.3's measured
per-chassis surface metadata): `docs/AI_LITE_BRAND_PLAN.md` §3.1-3.2.

**`zone` and `animation.presetId` stay in the schema although both decisions are dead.** The Lite spec
object is `additionalProperties: false`, so a property the model still EMITS becomes a refusal rather
than a no-op - deleting them cost 29/30 → 26/30. Teach a field away in its DESCRIPTION first, measure the
emission rate reach zero across more than one round, then delete. Pinned by PRESENCE in
`api/_lib/aiLite.test.ts`; the account is in `docs/AI_ATTEMPTS.md`.

`liteTypes.ts` is intentionally dependency-light because both the browser and API TypeScript trees import
it - do not import catalog or DOM-bearing model modules from it. Model/provider configuration, quota,
price, privacy, and endpoint policy live only in `api/_lib/aiLiteProfile.ts`; the server task registry
(`api/_lib/aiTaskRegistry.ts`, `docs/AI_TASK_REGISTRY.md`) re-expresses that profile as task
`lite-design-spec` and fails closed unless every managed route is in the approved-route catalog. The
generated template carries no profile marker or generation ledger id.

The first quality release is LOWER-THIRD-ONLY: 13 measured chassis with positive and negative fit
metadata, semantic style signals and geometry, a broad intent facet, and an explicit named slot for
each of one to four visible lines. Server semantic validation
enforces requested roles and custom-palette contrast before deterministic compilation. **Do not widen the
category or variant allowlist without the versioned lower-third benchmark and human visual review.**

Lite's improvement signal is content-free: the ledger keeps only the resolved chassis, broad intent
facet, accepted/discarded outcome, and an optional enumerated discard reason. Aggregate per-intent
outcomes enter the trusted prompt only after the server-configured sample threshold and only as a subtle
tie-breaker. Prompts, templates, screenshots, generated code, and full DesignSpecs never enter it.

## The alternatives path and the raw off switch

**LIVE.** The 2026-07-17 benchmark proved the harness a clean win on reliability, editability, overlaps
and cost (5/5 clean vs the baselines' 3/5, 0 overlaps, ~3x fewer output tokens, fastest).

- **Default (`AiSettings.useHarness` true): `generateAlternatives`** - one design-stage call (forced
  `emit_design_alternatives`) returns THREE genuinely different directions; each assembles like a single
  harness generation. The AI step offers the pick.
- **Off switch: `generateRaw`** - ONE model call with `RAW_SYSTEM` (format basics only, no taste
  teaching, no worked example), statically validated for display, NO bench and NO repair loop. **Keep
  this path pure:** it is the baseline the harness is measured against, and diluting it makes the
  comparison dishonest.
- **Preference learning (`preferences.ts`)** - the pick is staged on selection and COMMITTED when the
  project is created: aggregated shown/chosen facet counters, localStorage-only. `preferenceHint()` feeds
  the design prompt a SUBTLE tie-breaker only after ≥8 selections and ≥6 shows per facet; it never
  overrides the brief and never reacts to a single click.

## The quality gate (injected, not owned)

**LIVE.** The provider is UI-free: callers inject `GenerateOptions.validate` (an `SpxValidator`) - the
app wires `validateTemplate` + `benchTemplateRuntime` (`src/validation/runtimeBench.ts`: live-iframe
lifecycle, field binding, overlap/overflow, doubled-text stress, and the house editability contract).
Bench findings are teaching messages that drive repair rounds. A result that still fails is returned WITH
its validation attached - surfaced, never auto-applied. **Grounded assemblies get NO repair loop:** one
failing its own bench is a platform bug worth surfacing. On the free-form path the editability contract
is enforced deterministically first (`convertEmittedRegion`), so repair rounds only fire on FUNCTIONAL
findings.

## The safety screen (`safety.ts`) - what the code DOES, not whether it is correct

**LIVE.** Nothing in the quality gate asks what the generated JavaScript *does*, and the model does not
read only the user's brief: it reads uploaded REFERENCE IMAGES (text inside a picture is instructions to
a vision model) and, on modify/convert, a whole HTML file the user may have been handed by someone else.
`safetyFindings` screens the emitted JS for network calls, browser storage, runtime code building and
cross-frame reach, sharing its construct list with the community share gate
(`validation/templateBench.ts` `unsafeJsConstructs`) - one question, one answer, one place to update.

It blocks rather than warns because a generated template is EXECUTED automatically: the runtime bench
loads it the moment a result lands, before anyone has looked at it, in an iframe that today shares the
app's origin.

- **`withSafetyChecks`** wraps the INJECTED validator, so a finding reaches the repair loop.
- **`mergeSafety`** screens again where a result is SHOWN (AiStep's `showChange`, AIPromptPanel) -
  `generateRaw` validates itself and never runs the injected validator, so the screen meets that path at
  the consumer instead.
- **`source`** is the template a modify/convert started from, and only constructs the result ADDED are
  reported: a graphic already carrying a Live data or Show chat block legitimately calls `fetch()`. A
  generate passes no source.

Honest limit: a regex screen refuses the obvious, not the determined (`window['fetc'+'h']`). The
containment that would actually hold is denying the preview iframe the app's origin.

## The structured setup (`spec/` - the "More control" panel)

**LIVE.** The panel authors a `GenerationSpec` (schema in `src/model/generationSpec.ts` - MODEL layer,
because SavedProject/GraphicDoc persist it as `aiSpec`) that rides `GenerateContext.spec` as TYPED data,
never flattened into prose early. An empty spec injects nothing - the prompt-only flow is byte-identical.

- `spec/categories.ts` - the 20-entry AI CATEGORY registry: each entry links an `AssemblerId` and,
  where one models it, a `GraphicType` id (fields/machine/controls come from the type), plus suggested
  fields, workflow rules, and a machine hint. **Adding a category = one entry here + its id in the model
  union**; nothing else enumerates categories.
- `spec/specPrompt.ts` - deterministic prompt sections. Appended by `contextText`, so every path -
  including raw - reads the user's own decisions.
- `spec/specDesign.ts` - the pinning: `narrowedSpecTool` collapses the design-stage tool schema to the
  pinned category; `applySpecLocks` overwrites the model-emitted DesignSpec with the user's decisions and
  re-picks a chassis that can CARRY the user's line count; `applySpecOutPreset` applies an explicit exit
  preset as a real keyframe swap.
- `spec/specValidate.ts` - requested-field-present (ERROR, driving the coder's repair loop; demoted to a
  warning on grounded assemblies, where a fixed-contract category legitimately can't carry it and no loop
  exists), uploaded-font-used (warning = the honest fallback report), and `ensureSpecFonts` (uploaded
  fonts ALWAYS land as embedded assets + a visible `@font-face`, model or no model).

## What an uploaded picture is FOR (`model/imagePurpose.ts`)

**LIVE.** A dropped image carries FOUR unrelated intents wanting opposite treatment, so the user says
which; the vocabulary lives in the MODEL layer because VideoProject persists it.

- **`asset`** - "use it as it is". The ONLY purpose that bundles: a real file, referenced by path,
  exported. Rides `GenerateContext.images`. `fixedAssetPaths` says the operator gets NO field for it -
  permanent brand furniture rather than content.
- **`layout`** - "make one like this": composition, hierarchy, density, shape language; never the
  artwork. A SKETCH is a diagram of what to build, not a look to imitate.
- **`mood`** - "take the look and feel": colour, texture, weight, motion energy; layout ignored.
- **`plate`** - "make it work over this": the REAL background the graphic will sit on - never placed,
  never imitated, read for legibility and safe placement.

The last three ride `GenerateContext.references` as `{asset, use}` and are vision-only.
`attachmentSections` builds ONE numbered manifest plus a block per purpose present, and `imageBlocks`
sends the pictures in that order, so "attachment 3" means the same picture in the text and the vision
blocks. `modifyContent` reuses the same function. The preselect only ever guesses `asset` vs `mood`;
`layout` and `plate` are intents no pixel reveals.

**The as-is screen (`assetIntegrity.ts`)** is the protection "use it as it is" promises: a design putting
a filter, crop, mask, `object-fit: cover`, rounded corners or an uneven scale on a protected picture is
REJECTED. It reports through the injected validator (composed in `productionSpxValidator`, beside the
safety screen), so a violation reaches the repair loop rather than only the result card. Same honest
limit as `safety.ts`: it reads CSS text, not the resolved cascade. **It finds a protected picture by its
`<img src>`, so anything that bakes a `src` must run BEFORE it** - a gate that runs before the last
deterministic step measures a document nobody will ever see.

## The conversation is part of the brief

**LIVE.** `GenerateContext` carries two more typed inputs, both rendered by `contextText` (so EVERY path
reads them, including raw) and mirrored into `modifyContent` and the spec-refine prompt:

- **`conversation`** - the talk turns that led here, oldest first. A brief refined over three turns IS
  all three. **The caller bounds this** (the AI step sends the last 10 turns); the provider never re-reads
  a session.
- **`seed`** - "three more like this": the design spec of a direction the user picked. The design stage
  keeps its category, typographic voice and colour character and varies what is genuinely a choice. A
  starting point, never a template to return three tints of.

**`modify` takes a context** (`modify(prompt, template, context?, options?)`), which is what makes an
image attached mid-conversation real: the context reaches `toTemplate`, so the asset is BUNDLED, not
merely mentioned - a referenced-but-missing asset is the dangling-reference defect class that ships broken
exports. `contextFrom(template, outer)` merges the template's own images with the turn's attachments,
deduped by path. An attachment does NOT force the code level: the design stage sees the image and routes
to `custom` itself when the catalog has nowhere to put it.

## Telemetry & the value proof

**LIVE.** `telemetry.ts` records every run locally (stages, tokens from the API usage block, repair
rounds, route, diversity fields; localStorage ring, JSON-exportable). The VIDEO harness records through
the same ring (kinds `video-generate`/`video-refine`); consumers filter by kind, so SPX statistics never
mix with video runs.

- `scripts/ai-compare.mjs` - same brief, same model, four arms (raw / raw+self-critique / pre-harness /
  the harness), neutral scoring plus cost/latency/diversity. **The decision rule: each stage keeps its
  place only if it shows a clear improvement for its cost.**
- `scripts/ai-bench.mjs` - the single-arm brief bank + review gallery for prompt iteration.

Both need the dev server + a real key and SPEND TOKENS - never CI.

**Run `npm run bench:preflight -- <models>` before any paid round.** It is free, reaches no network, and
answers what the paid runner structurally cannot: given this `.env` and these candidates, what would each
arm ACTUALLY serve? `api/_lib/aiBenchPreflight.ts` resolves every arm through the REAL `liteProfile` +
task registry (never a model of their rules - a preflight that reimplements the server drifts from it and
then certifies runs the server will refuse), and refuses a plan whose arms are overridden, unapproved,
unconfigured, or not pairwise distinct. Each of those wasted a real round: they are invisible in the
OUTPUT, because a comparison whose arms resolve to one model still produces differences - sampling noise
reads as model character.

## The Lite SKIN and its vision JUDGE

**EXPERIMENT - both server-flagged OFF by default (`AI_LITE_SKIN_ENABLED`, `AI_LITE_JUDGE_ENABLED`). No
user reaches either; only the eval rig calls the judge, whose agreement with a human is 3 of 6, which is
chance.** Not strategy. Mechanics, thresholds and rulings: `docs/AI_LITE_BENCHMARK.md` (parked)
Appendix B. Verdicts and retry conditions: `docs/AI_ATTEMPTS.md`.

Three rules bind anyone touching the code even while the flags are off:

- **A skin can decline to land, never cost the user a working result.** Any failure - an illegal patch
  (`liteSkinPatchErrors`), a gate rejection, a failing bench - REVERTS silently to the spec's house
  chassis. With the flag off the schema, prompt and behaviour are byte-identical to before the skin
  existed, and a skin a model emits anyway is stripped server-side.
- **A skin may not use `clip-path`, because our checks measure LAYOUT and it changes PAINT.** Two skins
  lost their secondary line's last letter to an angled cut; the runtime bench read a perfectly placed
  box and passed, and so did the judge. `background-clip: text` stays legal.
- **The judge passes admission of its OWN** (`store.reserveJudge`, migration 0013): ownership, liveness,
  the per-generation cap (attempts, not successes) and the daily fleet ceiling are decided ATOMICALLY in
  one RPC under the same advisory locks `reserve_ai_lite_generation` takes, and the worst-case cost is
  BOOKED before the call. **A new paid Lite route repeats this shape** - the per-IP burst limiter is
  pre-body protection, never an entitlement.

## Import analysis - the proposal-only vision task (`importAnalysis/`)

**EXPERIMENT - flag `AI_TASK_IMPORT_ANALYSIS_ENABLED` off by default.** `imported-graphic-analysis`
(`docs/AI_TASK_REGISTRY.md`) assists the MANUAL Import Graphic flow and never replaces it: one
server-owned vision call proposes text regions, nearest BUNDLED fonts, and an animation preset.
`contract.ts` is the schema (font honesty: `matchQuality` cannot say 'exact', font ids enum-locked to the
seven bundled faces; rendered words are content, never instructions); `client.ts` downscales the artwork
to ≤1920x1080 BEFORE anything leaves the machine; `normalize.ts` deterministically clamps and converts
into `DesignFieldSpec`s - accepted suggestions apply through the exact transforms manual placement uses.
No second representation, no auto-apply, no code generation. E2E: `e2e/import-analysis.spec.ts` (flag-off
absence is mutation-pinned).

## NoaCG Pro - the image-guided tier (`pro/`)

**EXPERIMENT - the reconstruction path is PARKED on measurement (2026-08-08).** The concept stage works
and the compiler cannot keep what it designs: visibly broken on 5 of 12 while the gates reported 11 of 12
passing. **Read `docs/NOACG_PRO_PLAN.md` before proposing further work.** What measured well is the
concept itself, whose live reuse is as a `layout` REFERENCE into the grounded adapt path.

**Re-measured 2026-08-09 over the whole bank (`benchmarks/pro/round-2026-08-09/ROUND.md`, $0.940,
10 fixtures saved): the bench said 10/10 pass at `editability 1.00`, and of five frames read by
eye two were usable, one degraded and two BROKEN - one printing the artwork's baked name a second
time above the rebuilt panel. `editability` is a real measurement of a different question; NO gate
here asks whether the compiled graphic resembles the concept, which is why a wrong graphic scores
1.00. Every concept image was good, so the compiler is what loses them.**

**The sharp-placement gate now EXISTS and `pro-bench` counts both halves in `pass`.** The
interpretation carries a separate `canvasPlacement`; `resolveProCanvasPlacement`
(`pro/contract.ts`) clamps it to a useful lower-third size and safe canvas position, applies at
most a 1.00 scale, and says when the source lacks enough pixels to fulfil the requested size.
`api/_lib/proGeometry.test.ts` pins the arithmetic free. The pre-change fixture bank is expected
to keep source-limited failures because those concepts spent their pixels on full-frame scenery;
only a fresh tight-concept round can measure whether the prompt fixed that input.

**THE CAUSE IS THE CONCEPT PROMPT, and the direction is decided (owner, 2026-08-09).**
`proConceptPrompt` asks for the graphic inside a "full 1920x1080 frame" over a "softly blurred
studio backdrop", so a fixed ~1376x768 output spends most of its pixels on scenery the compiler
then crops away - `minimalist` kept 23% of the width and binned the rest. Ask for the GRAPHIC
ALONE, tightly framed, and decide its canvas size and placement separately instead of inheriting
them from the model's framing: a strap drawn at 1376px and placed at ~1150px is a downscale, so
correct size and sharpness stop competing. Root `--scale` alone (a pure stretch) is RULED OUT; a
larger model output is unavailable (the gateway image call has no size parameter). Expect it to
clear most of the baked-text ghosting too - four of five broken frames show it, and a tight
concept has no backdrop to show through. A prompt change invalidates the fixtures: budget a fresh
paid round (~$0.95). Detail: `benchmarks/pro/round-2026-08-09/ROUND.md`.

**IMPLEMENTED 2026-08-09 and paid-verified 2026-08-10.** `proConceptPrompt` now asks for the
graphic alone with tight framing and no environment. The same interpretation call independently
chooses normalized canvas width and top-left placement. Normalization clamps that decision;
compile keeps the native crop and sends artwork, live fields, rebuilt panels, and the logo slot
through one downscale-only imported-design `--scale`, expressed with the normal editable zone and
nudge contract. Contract version: `pro-interpret-v3`. The fresh 12-brief round spent $1.014569 and
verified the placement contract: 9/12 requested sizes were fulfilled by downscaling, three stayed
at native scale and were reported `SOURCE-LIMITED`, and none upscaled. The overall product result
was 8/12 usable or degraded and 4/12 broken. Tight concepts therefore fixed the canvas arithmetic,
not reconstruction: baked-text ghosts remain on three frames and `portrait-logo` loses its portrait.
Full record: `benchmarks/pro/round-2026-08-10/ROUND.md`.

**Re-diagnosed 2026-08-09 (`benchmarks/pro/round-2026-08-08/DIAGNOSIS.md`): the approach has not been
fairly tested, so do not carry "image-led reconstruction cannot work" as a finding.** The compiler
renders every design at 0.72x the size it was drawn (a 1376x768 concept's pixels used as DESIGN pixels
in a 1920x1080 frame), places live text at 0.59x the baked text it replaces, paints panels in colours
the pixels do not contain, and re-buckets the designed position into one of nine zones. `ProPanelGeometry`
carries no polygon, so an angled design is rebuilt as rectangles - which is a schema limit, not a
model one: on `sports-live` the interpretation SAW the angles and warned about them. Free re-measurement:
`node scripts/pro-geometry-audit.mjs`. And the house rule below was misapplied here - the compiler's own
`ProCompileReport.warnings` separates broken from usable on 11 of 12, and `pro-bench.mjs` records them
and computes `pass` without reading them. **A gate that measures the right dimension and discards the
answer is a scoring bug, not a blind spot.**

**Lite and Pro are SEPARATE PROJECTS with different purposes and constraints (owner decision,
2026-08-09).** Pro is not the continuation of Lite and Lite is not a reduced Pro. Lite is a managed,
free, catalog-grounded profile whose constraints are cost per generation, quota safety and
control-panel operability, and whose open problem is SAMENESS. Pro is a paid image-guided experiment
whose constraint is whether a generated appearance can survive becoming code at all, and whose open
problem is CORRECTNESS. A change that serves one is not evidence for the other, they do not share a
quality bar, and neither's benchmark scores the other. What they DO share is deliberate and narrow:
one Create-with-AI entry point (`AiSettings.tier` picks lite/pro/custom), one user-facing brief, and
one deterministic mapping seam - `pro/brief.ts` maps that shared brief onto the v1 `ProBrief` so there
is no parallel brief vocabulary. That is a UI and contract economy, not a shared strategy.

**A Pro generation is capped at `PRO_MAX_GENERATION_COST_USD` = $0.15, counting BOTH calls**
(`pro/contract.ts`; measured $0.0777, of which the concept image is a flat $0.0671 - `docs/ADMIN.md`
§9). `compileProConcept` refuses before the interpretation when the concept alone spent it, and
again on the total. `generateProConcept` deliberately does NOT throw on a breach: the image is
already billed, so it returns with its cost and only the next call is stopped - the 2026-08-08
lesson about early returns destroying paid concepts. Browser-side, so it is a cost control and not
a server booking; an unreported cost counts as zero.

`PRO_STANDARD_ROUTES` (`pro/pipeline.ts`) is pinned so a normal Pro user never picks models; **do not
change it without re-running `npm run bench:pro` paid stages** - and pass `--save-fixtures`, because the
2026-08-08 round did not and its twelve interpretations are gone. Offline the deterministic stub
(`pro/stub.ts`) runs the identical flow, keeping `e2e/pro.spec.ts` token-free. `fillProLogoSlot` bundles
an as-is upload into the slot it asked for, deterministically and writing no CSS, and runs BETWEEN the
compile and the injected validator - that order is load-bearing (see the as-is screen above).

## Phase-C creative pilot (`creative/`)

**RETIRED 2026-08-09 (owner decision): Creative Mode is superseded by NoaCG Pro and is no longer carried
as a parallel architecture.** Both existed to answer "the model proposes the appearance, the platform owns
the engineering"; Pro owns that question now, and two live experiments asking it separately is how the
answers come to disagree. `docs/CREATIVE_MODE_PLAN.md` is a RETIRED record to MINE, never a plan to
continue - its reusable mechanisms and their measured rulings are listed in that file's banner and in
`docs/AI_ATTEMPTS.md`. **Nothing in the product reaches this code**: no UI, no route from `claudeProvider`
into it, and its only caller is `scripts/creative-pilot-bench.mjs`. Removing it is a separate, deliberate
change - and `scripts/creative-route-bench.mjs` plus `e2e/creative-routing.spec.ts` are NOT part of it,
because they cover the LIVE Phase-A routing stage.

Two rules reach outside the pilot and bind here:

- **THE CUSTOM CODER IS THE BENCHMARK CONTROL: its catalog example, `designNotes` and repair policy stay
  byte-identical, and routing changes WHICH briefs reach it, never what it is shown.** The freeze on its
  SYSTEM PROMPT was lifted for exactly one edit - the ratified corpus motion numbers, which a control
  cannot keep contradicting once it is also production code. **Arm A results from 2026-08-02 and earlier
  are therefore not comparable with later rounds; re-baseline the control rather than reusing them** (arm
  B reuses `coderSystemPrompt`, so it moved too). No further prompt change without the same explicit
  trade written down.
- **The anti-anchoring rule is absolute: no catalog design code reaches any CREATE prompt.**
  `neutralSkeleton.ts` is what the coder arm studies instead. Free coverage:
  `e2e/creative-pilot.spec.ts`.

## Other files

**LIVE.**

- `modelTypes.ts` + `modelGateway.ts` - the provider-neutral model-call contract and browser client. The
  server adapters in `api/_lib/aiGateway.ts` implement Vercel AI Gateway (the MANAGED transport, and the
  only one NoaCG funds), plus Anthropic, OpenAI Responses and compatible Hugging Face Inference Providers
  as bring-your-own-key routes - without branching the harness. Retention is TWO filters, ANDed by the
  gateway: `disallowPromptTraining` is free on every plan and pinned on for every managed call, and
  `zeroDataRetention` is the Pro/Enterprise superset - so a task requiring ZDR fails closed with
  `zdr_unavailable` rather than degrading quietly. The per-request price cap OpenRouter enforced has no
  gateway equivalent and now lives entirely in the approved-catalog snapshot and each task's cost booking
  (`docs/AI_PROVIDER_GATEWAY.md`). `modelCatalog.ts` reads only the normalized server discovery endpoint.
  Structured output, usage, costs, errors, retries and explicit fallbacks normalize here. `cacheSystem`
  remains an Anthropic hint.
- `stubProvider.ts` - the offline provider: keyword -> DesignSpec -> the SAME `specToTemplate` pipeline, so
  offline results are catalog-grade. It honors the structured setup through the same `applySpecLocks`/
  post-passes, which keeps the whole More-control flow e2e-testable without tokens.
- `settings.ts` stores only non-secret provider/model/routing preferences and server-reported credential
  availability. Raw keys never enter localStorage. `index.ts` (`getAiProvider`), `brainstorm.ts`,
  `examplePrompts.ts` and `presets.ts` keep their existing roles.

The binding gateway and key-handling contract is `docs/AI_PROVIDER_GATEWAY.md`. Provider adapters never own
DesignSpec, validation, repair, preference learning, or graphic-type context. New providers enter below
`AIProvider`, never beside it.

The versioned video matrix and brief bank live in `benchmarks/video/v1`; its runner must drive
`src/ai/video` through the application, never call a model with a benchmark-only prompt pipeline. The
binding experiment and artifact contract is `docs/VIDEO_MODEL_BENCHMARK.md`.

**Deferred (benchmark-gated, deliberate):** a selective vision taste critic (free-form path only,
evidence-based findings, never auto-rewriting a valid grounded result), a curated taste library with
per-brief retrieval, and a nightly taste-analysis task producing reviewable proposals. Add them only when
the compare rig shows they pay for themselves.
