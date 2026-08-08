# src/ai - the SPX generation harness

Loaded alongside the root AGENTS.md when working in this directory (Claude reads it via this directory's CLAUDE.md import; Codex reads it directly). Keep it accurate.
(The VIDEO harness is its own world: src/ai/video + src/video - see the root map.)

## The doctrine

The harness exists to make AI results reliably better than a plain model call - and it must
EARN that claim in scripts/ai-compare.mjs, never assume it. Its principles, in priority order:

1. **Ground engineering, not visual style.** The platform pins the SPX definition, field ids,
   the :root contract, auto-fit, zones, the NOACG_ANIM data region + interpreter, and export
   readiness. The AI owns composition, typography, spacing, proportions, colour, shape
   language, motion character, density, and hierarchy.
2. **The brief and references define taste.** Prompts state reasoning criteria (hierarchy,
   intentional contrast, genre/audience-suited density, motion supporting reading order) -
   never a fixed aesthetic. A news strap and a children's game show earn different answers.
   Uploaded references are read as a design SYSTEM that outweighs the generic rules.
3. **Different briefs must produce different designs** - "same layout, different colours" is
   a named failure. Telemetry records variant/preset/palette per run; the compare rig's
   top-chassis counter is the sameness tripwire.
4. **The smallest harness that wins.** A catalog-fit generation costs ONE small model call
   (the design spec); everything after it is deterministic. Stages that only add cost get cut.

## The harness is ON BY DEFAULT (with a still-live off switch)

The 2026-07-17 benchmark proved the harness a clean win on reliability, editability,
overlaps, and cost (5/5 clean vs the baselines' 3/5, 0 overlaps, ~3x fewer output tokens,
fastest); the earlier hesitation was about VISUAL taste, which the deterministic-conversion
work (below) and the refreshed structure briefs closed enough to make it the default. So:

- **Default (checkbox on, `AiSettings.useHarness` defaults true): `generateAlternatives`** —
  one design-stage call (forced `emit_design_alternatives`) returns THREE genuinely
  different directions; each assembles like a single harness generation. The AI step
  offers the pick.
- **Off switch (checkbox cleared): `generateRaw`** — ONE model call with `RAW_SYSTEM` (format
  basics only, no taste teaching, no worked example), statically validated for display,
  NO bench and NO repair loop. Keep this path pure: it is the baseline the harness is
  measured against, and diluting it makes the comparison dishonest.
- **Preference learning (`preferences.ts`)**: the pick is staged on selection and COMMITTED
  when the project is created — aggregated shown/chosen facet counters (chassis, category,
  density, palette, zone, preset, route), localStorage-only. `preferenceHint()` feeds the
  design-stage prompt a SUBTLE tie-breaker only after ≥8 selections and ≥6 shows per facet;
  it never overrides the brief and never reacts to a single click.

## NoaCG Lite - the managed free profile

Lite is the catalog-only, one-result profile selected with `GenerateOptions.profile =
'lite'`. Its model-bound design call goes through the trusted `/api/ai/lite/generations`
endpoint and the compact allowlist in `liteContract.ts`; the browser cannot supply a model,
route, fallback, system prompt, or cost policy. A ready response rejoins this file's existing
`groundedResult` path, so `specToTemplate`, real catalog assemblers, deterministic
adjustments, fields, NOACG_ANIM, assets, validation, runtime checks, and exports stay shared.

Lite must never call `generateRaw`, `generateAlternatives`, custom code generation, polish,
import conversion, or code repair. `modify` is allowed only while the caller passes the
grounded DesignSpec and the template remains house-shaped; it produces another constrained
DesignSpec. A grounded failure is reported to the server as a platform validation failure.
No model call may rewrite the compiled code. Unsupported scope returns a typed explanation
and simplification, never an automatic expensive fallback.

**`litePipeline.ts` is the ONE grounded compile path** - normalizeLiteSpec +
assembleGroundedTemplate (specToTemplate → applyDesignAdjustments → ensureSpecFonts →
applySpecOutPreset) + productionSpxValidator (static + bench + safety screen). claudeProvider
is built FROM it, and the Lite benchmark
runners (`scripts/ai-lite-*.mjs`, docs/AI_LITE_BENCHMARK.md) compile through the identical
function - never re-inline the sequence anywhere; `scripts/ai-lite-bench.test.mjs` pins
that no second copy exists.

**Lite composes its OWN validator** (`claudeProvider.liteValidator`), for the same reason it
passes its own `AssembleOptions`: `productionSpxValidator`'s `ProductionBenchOptions` can only be
answered from the DECISION - which lines must hold one line (`singleLineIdentityFields`, off
the spec's declared roles) and which category's type floor the ADJUSTED result is held to -
and the browser builds its injected validator in AiStep long before a decision exists. While
they were left unset, `bench-line-wrap` and `bench-type-floor` were findings every Lite
BENCHMARK measured and no user ever did: the round scored a stricter gate than the product
ran. All three are WARNINGS, so composing them in cannot fail a generation that used to pass. The
two arguments AiStep does supply are always empty on this path (Lite takes no uploads and
cannot convert an import), so nothing is lost but the structured setup's own checks, which
`liteValidator` re-applies. Pinned by the provider case in `e2e/lite-line-fit.spec.ts`.

**The third option is there for a different reason: Lite gets NO structural check at all.**
`withStructuralFindings` returns early without a `StructuralIntent`, and Lite runs no intent
stage - so the one question that measures whether a declared field REACHES THE SCREEN
(`structuralIntentCheck`'s sentinel drive) never ran on the one path with no repair loop. The
2026-08-08 quality round produced the frame that proves it matters: a strap that painted its
name, reserved a band under it, drew nothing there, and answered `update()` with fresh data by
changing nothing - `fieldCount: 2`, every rule code silent. The drive now lives in
`validation/fieldPaint.ts`, shared by the structural check and the bench's opt-in
`fieldPaints`, which `liteValidator` and `compileLiteDecision` both turn on. **It reads ONE
state** (the settled default path), which is why it is opt-in rather than ambient: a field a
later operator event reveals would read as unpainted, and Lite is safe today only because it
ships single-step lower thirds. Widening Lite past those revisits that note first. Pinned by
`e2e/lite-field-paint.spec.ts` (quiet on a real result, fires on a hidden field, off by
default, and the default data is restored so the phases after it measure what they always did).

`liteTypes.ts` is intentionally dependency-light because both browser and API TypeScript
trees import it. Do not import catalog or DOM-bearing model modules from it. Model/provider
configuration, quota, price, privacy, and endpoint policy live only in `api/_lib/
aiLiteProfile.ts`; the server task registry (`api/_lib/aiTaskRegistry.ts`,
docs/AI_TASK_REGISTRY.md) re-expresses that profile as task `lite-design-spec` and fails
closed unless every managed route is in the approved-route catalog
(`api/_lib/aiModelCatalog.ts`). The generated template carries no profile marker or
generation ledger id.

**The SKIN experiment (server-flagged, `AI_LITE_SKIN_ENABLED`, off by default):** when the
profile enables it, the same single model call may ALSO return `skin:{summary,css,html?}` -
bounded restyling for the NEUTRAL canvas chassis (`templates/lowerThirds/skinCanvas.ts`
`ltc01`, deliberately NOT in the browse catalog). The platform still compiles everything
deterministically; the skin CSS lands as a marked override block through the SAME polish gate
(`applyPolish`, `LITE_SKIN_MARKER`), and `litePipeline.attemptLiteSkin` is the ONE
implementation both production (`liteGroundedResult`, path `grounded+skin`) and the benchmark
runners use. Any failure - an illegal patch (`liteSkinPatchErrors`, shared with the server's
semantic validation), a gate rejection, or a failing bench - REVERTS silently to the spec's
house chassis: a skin can decline to land, never cost the user a working result. With the
flag off, the schema (`LITE_READY_OUTPUT`), prompt, and behavior are byte-identical to before
the skin existed, and a skin a model emits anyway is stripped server-side.

**A skin may not use `clip-path`, because our checks measure LAYOUT and it changes PAINT.**
The blind review found two skins whose secondary line lost its last letter to an angled cut;
the runtime bench read a perfectly placed box and passed, and so did the vision judge
(docs/AI_LITE_BENCHMARK.md §6d). The patch gate rejects it in CSS and in `skin.html` style
attributes; `background-clip: text` stays legal. Generalize the lesson before adding any
visual construct to a model's allowlist: **a deterministic gate cannot catch a defect in a
dimension it does not measure**, so either measure that dimension or forbid the construct.

**The skin VISION JUDGE (server-flagged, `AI_LITE_JUDGE_ENABLED`, off by default):** one
server-owned, cost-capped vision call (`POST /api/ai/lite/judge`) scoring the rendered HOLD
frame on legibility/textIntegrity/hierarchy/briefFit/strapShape (contract + prompt in
`liteContract.ts`, `LITE_JUDGE_*`, versioned independently as `LITE_JUDGE_PROMPT_VERSION`);
every axis must reach the server threshold or the caller reverts to the house chassis. It fails closed like the generation routes and stores nothing. Today only the
eval rig calls it (Playwright captures the hold frame); production wiring waits on
judge-vs-blind-review calibration AND an in-app capture path - see
docs/AI_LITE_BENCHMARK.md §6b before touching thresholds.

**Write every judge axis as INSPECTION, and let ABSENCE be its first failure.** Both blind
spots the human review found were the same mistake in different clothes. `legibility` asked
the model to read, and reading completes a word whose last letter is sliced off.
`strapShape` listed the wrong shapes a panel can take - squat box, badge, tall stack - so a
frame with no panel at all matched nothing on the list and scored 5. An axis phrased as a
taxonomy of variants can only find the variants; an axis phrased as "locate the elements,
then ask what binds them" can find nothing-is-there. A new axis states what to look at,
what counts as absent, and what earns a 5 - never a list of named failures.

**The judge passes admission of its OWN** (`store.reserveJudge`, migration 0013): a
generation is admitted once, for one generation, so a second paid call cannot ride that
admission indefinitely. Ownership, liveness (`expiresAt`), the per-generation cap
(`AI_LITE_JUDGE_MAX_PER_GENERATION`, attempts not successes) and the daily fleet spend
ceiling are decided ATOMICALLY in one RPC under the same advisory locks
`reserve_ai_lite_generation` takes, and the worst-case cost is BOOKED there before the
call - `settleJudgeCost` reconciles it to the provider's number afterwards. Booking first
is not bookkeeping neatness: adding the cost afterwards from a value read before the call
loses one of two overlapping judgements. A missing record and someone else's answer
identically, so the endpoint is not a generation-id oracle. **A new paid Lite route
repeats this shape** - the per-IP burst limiter is pre-body protection, never an
entitlement.

**A constraint stated as a prohibition suppresses the behaviour it constrains.** The strap
rules first shipped as "STRAP SHAPE IS NON-NEGOTIABLE" and "a wrapped name is a failed
skin", and the next paid round emitted skins at HALF the previous rate: given a way to fail
and a documented way out (`omit skin`), the model took the way out. The same geometry now
reads as the shape being painted, and the escape hatch names omission as the likelier
mistake. Measured, not theorised - prompt version `lite-lower-third-v3`, and the pin in
`aiLite.test.ts` fails if failure language returns. When a teaching change moves a rate,
suspect the FRAMING before the rule.

The first quality release is LOWER-THIRD-ONLY. `liteContract.ts` exposes six audited chassis
with positive and negative fit metadata, a broad intent facet, and an explicit semantic role
for each of the one or two lines. Server semantic validation enforces requested roles and
custom-palette contrast before deterministic compilation. Do not widen the category or
variant allowlist without the versioned lower-third benchmark and human visual review.

**A chassis's fit metadata is MEASURED where it can be, and `supportingLineChars` is the
precedent.** It was `textCapacity: 'medium' | 'high'`, authored by hand, and the first
production round (docs/AI_LITE_PLAN.md §1) found it ranked the designs almost backwards: both
"medium" entries measure widest, and the loudest "high" holds the fewest characters of all six.
The cause is invisible in the source and obvious in the render - three of these designs set
their supporting line in tracked uppercase, which costs about a third of the characters a reader
expects. **No gate in the tree can see the consequence**, because a wrapped line does not escape
its frame: overflow-sweep and the runtime bench's stress pass both ask that question, and
type-floor measures font size. So the number comes from
`node scripts/lite-line-capacity.mjs --check` - run it after any change to a Lite chassis, its
stylesheet, or the bundled fonts - and a claim ABOVE the measurement fails as the defect it is,
while one more than four characters below fails as stale. An adjective is what a chassis is
allowed to say only where nothing can measure it.

Lite's continuous improvement signal is content-free: the server ledger keeps only the
resolved chassis, broad intent facet, accepted/discarded outcome, and optional enumerated
discard reason. Aggregate per-intent chassis outcomes enter the trusted prompt only after the
server-configured sample threshold and only as a subtle tie-breaker. They never override the
brief, semantic fit, or the diversity doctrine. Prompts, templates, screenshots, generated
code, and full DesignSpecs never enter the ledger.

## NoaCG Pro - the image-guided tier (`pro/`)

Pro is an execution TIER of the same Create-with-AI step, never a second flow
(docs/NOACG_PRO_PLAN.md is binding): `AiSettings.tier` picks lite/pro/custom, and the AI
step maps the SHARED brief (prompt + GenerationSpec + uploads) onto the v1 `ProBrief`
through `pro/brief.ts` - one deterministic seam, no parallel brief vocabulary. Generation
runs concept -> interpret -> compile -> validate on `PRO_STANDARD_ROUTES`
(`pro/pipeline.ts`): the curated model choice measured in the 2026-07-31 paid round
(~$0.07-0.08/generation), pinned so a normal Pro user never picks models - the custom tier
is where model choice lives. Do not change the standard routes without re-running
`npm run bench:pro` paid stages. Offline (no gateway credential) the deterministic stub
(`pro/stub.ts`) runs the identical flow, which keeps e2e/pro.spec.ts token-free.

**An as-is upload is BUNDLED into the slot it asked for** (`pro/logoAsset.ts`
`fillProLogoSlot`, run by BOTH pipeline entry points via `GenerateOptions`-style
`logoMark`). The compile reports the slot it placed (`ProCompileReport.logoSlot` - field
id, wrapper id, and the outcome line it belongs to); the fill writes the mark into
`template.assets` and the slot's DataField value, so the project's sample data follows from
that default on create. It is deterministic - no model decides which file goes in the slot -
and it writes no CSS, which is how it satisfies the as-is screen by construction. The report
follows: the region's outcome says the mark was placed, and the empty-slot warning is
retired BY IDENTITY (`PRO_EMPTY_LOGO_SLOT_WARNING`, exported from `pro/compile.ts` so the
second place never keeps a copied literal). An upload whose purpose is `layout`/`mood`/
`plate` is never bundled, here as everywhere.

**It runs BETWEEN the compile and the injected validator, and that order is load-bearing.**
Baking the `src` into the markup is what ARMS the as-is screen - `assetIntegrity.ts`
`targetsOf` finds a protected picture by its `<img src>`, so before the fill there is
literally nothing for it to screen, and an all-clear would mean only that it looked at a
template with an empty slot. Same honesty argument for the result card: the readiness rows
must describe the template the user actually gets. Generalize it - **a gate that runs before
the last deterministic step measures a document nobody will ever see.**

## Import analysis - the proposal-only vision task (`importAnalysis/`)

`imported-graphic-analysis` (docs/AI_TASK_REGISTRY.md, plan §6) assists the MANUAL Import
Graphic flow and never replaces it: one server-owned vision call
(`POST /api/ai/tasks/import-analysis`, flag `AI_TASK_IMPORT_ANALYSIS_ENABLED`, off by
default) proposes text regions, nearest BUNDLED fonts, and an animation preset.
`contract.ts` is the schema (font honesty: `matchQuality` cannot say 'exact', font ids
enum-locked to the seven bundled faces; rendered words are content, never instructions);
`client.ts` downscales the artwork to ≤1920x1080 BEFORE anything leaves the machine;
`normalize.ts` deterministically clamps and converts into `DesignFieldSpec`s - accepted
suggestions apply through the exact transforms manual placement uses (draft.ts
`withDesignFieldSpecs` -> addPlacedLine). No second representation, no auto-apply, no
code generation. E2E: e2e/import-analysis.spec.ts (flag-off absence is mutation-pinned).

## The pipeline (claudeProvider.generate — one harness run; generateAlternatives runs it ×3)

1. **Design spec** (`designSpec.ts`, forced `emit_design_spec`) - the only mandatory model
   call and the ROUTER. Returns `fit: 'catalog' | 'custom'` plus every design parameter:
   chassis (`variantId`), lines, palette/font/zone/size, animation preset choice, real
   COMPOSITIONAL parameters (typography scale ratio/weight/tracking, density, alignment,
   shape/panel), `referenceSystem` (read from uploads), and an optional `flourish`.
   `catalogDigest()` puts the whole assemblable world in the system prompt.
2. **Grounded assembly** (`specToTemplate`) - catalog-fit specs run through the REAL wizard
   assemblers (`variant.create`): correct by construction, timeline/Style-panel editable.
   Every out-of-range value CLAMPS to the nearest legal one; the project brand palette wins.
3. **Design adjustments** (`designAdjust.ts`) - the spec's compositional parameters apply as
   a marked CSS override block (cascade beats the design CSS; contracts untouched; every
   adjustment guarded on the structure existing). This is what keeps grounded output diverse.
4. **Polish** (`polish.ts`, only when the spec carries a flourish) - ONE bounded call.
   Writable: appended override CSS + the root element's inner HTML. `applyPolish` rejects
   patches touching :root/@font-face/scripts or losing a field id / an anim-data selector;
   a rejected or bench-failing patch REVERTS. Polish never makes a result worse.
5. **Custom path** - briefs whose STRUCTURE no catalog family carries go to the free-form
   coder: house contracts + the NEAREST catalog variant's real create() output as the
   canonical example + the design stage's direction, then the validated repair loop
   (`shared/repairLoop.ts` - THE one bounded errors-back loop both the SPX and video
   coders drive: `MAX_REPAIR_ROUNDS = 2`, RE-VALIDATED every round, exact findings fed
   back; what counts as BLOCKING stays each caller's policy, injected as a filter).
   **The region contract is authored, not emitted:** the example's ANIMATION region is shown
   in its AUTHORING shape (the legacy GSAP builders, via `emitPresetRegion`) and the prompt
   teaches that grammar - natural GSAP the model is reliably good at, instead of the bespoke
   strict-JSON data block it reliably got wrong. Every emit (first and repairs) runs
   `convertEmittedRegion`: canonicalize a drifted open marker, then `convertToDataRegion` -
   the SAME parity-proven importer every wizard category uses at create - so a convertible
   emit ships as a timeline-editable data block.
   **The STRUCTURE SPINE is the conversion's precondition, so the prompt states it as a hard
   requirement** (root `<div class="PREFIX">` holding `<div class="PREFIX-box">`, that -box
   class ALONE on the element; `PREFIX-mask` around each `#fN`; `PREFIX-accent`). Learned the
   expensive way (ai-compare, 2026-07-17): the coder followed the authoring grammar perfectly
   and `parseTimeline` read every region, but `importAnimData` bails on `detectPrefix` FIRST,
   and detectPrefix keys entirely off `class="{prefix}-box"` - which the old prompt never named
   (the example merely showed it, and models generalize the idea, not the literal class). Every
   free-form result converted the moment a `-box` was injected. Worse, the bench's own repair
   message told the model to "give the root a single class and prefix every child class",
   which does NOT satisfy the check - so the custom route's repair rounds were UNWINNABLE by
   construction. That message now names the real contract. If a future editability finding
   looks model-shaped, suspect the teaching message before the model. An unconvertible region keeps the model's
   own code (honest hand-crafted output, read-only timeline) and its `bench-editability`
   findings DEMOTE TO WARNINGS at the end - they never burn a repair round alone, though
   they ride along in any round a functional error triggers. Exception: when the template
   being MODIFIED already carried a readable data block, losing it is a regression, so
   editability stays a hard error there and the repair loop fights it.

`modify` refines a grounded result at SPEC level while it is still house-shaped (the caller
passes the result's `spec` back via `GenerateOptions.spec`); anything else refines at code
level. `convertImport` = deterministic import first (model/importTemplate.ts), then the
validated conversion - the AI only ever sees parsed code, never raw bytes.

## Phase-A routing (docs/CREATIVE_MODE_PLAN.md §2, §8 - the mode + intent stage)

`GenerateOptions.mode` (`adapt` | `create` | `auto`, default auto) plus `structuralIntent.ts`
run BEFORE the design call in `generate` and `generateAlternatives` (never for Lite, raw, or
modify): one small forced `emit_structural_intent` call on the provider's `role:'fast'`
model (`modelRole: 'fast'` - the per-stage binding of plan §4; every later stage keeps the
session route, and the routing bench pins a NAMED model instead because measuring one is its
job) -> `normalizeIntent` ->
`routeIntent` (deterministic; `structuralFit` checks the type registry + catalog LIVE, so
catalog growth updates routing by itself). The rules: an explicit mode is never overridden;
auto routes create only on originality words in the brief, no structural fit, a
low-confidence/novel/hybrid classification, or a BEYOND-SCOPE match
(`intent.beyondScope`: the brief matches a listed structure but requires structure its
`GraphicType.structuralScope` note excludes - a double-elimination brief on the
single-elim bracket type. The REGISTRY declares the scope, the intent stage judges the
brief against it with evidence, `routeIntent` decides deterministically - the
originalityRequested pattern) - a catalog-fit brief under auto still gets NO FIT NARROWING.
(It used to run the pre-routing flow byte-identically; **retrieval ended that** - the design call
now reads the shortlist instead of the full digest. What stays byte-identical is the CREATE
route, which is the one the frozen control needed.) Explicit
adapt skips the intent call entirely (one-call economy) and narrows the spec tool's fit to
catalog; a CREATE decision narrows it to custom (`narrowFitTool`, the narrowedSpecTool
mechanism). Decision + intent land on `AiTemplateChange.routing`/`.intent` and the telemetry
record (`AiRoutingRecord`) - the routing benchmark (`scripts/creative-route-bench.mjs`,
SPENDS TOKENS; bank + expected routes in `benchmarks/creative/v1/briefs.json`) reads them,
never reconstructs.

**THE CUSTOM CODER IS THE BENCHMARK CONTROL (plan §8): its catalog example, `designNotes`,
and repair policy stay byte-identical, and routing changes WHICH briefs reach it, never what
it is shown.** The byte-identical freeze on its SYSTEM PROMPT held through the pairwise round
of 2026-08-02 and was then lifted for exactly one edit: the ratified corpus motion numbers
(docs/SPX_EXAMPLES_CORPUS.md "Production deltas"), which the rest of the platform had already
adopted and which a control cannot keep contradicting once it is also production code.
**Arm A results from 2026-08-02 and earlier are therefore not comparable with later rounds -
re-baseline the control instead of reusing them** (arm B reuses `coderSystemPrompt`, so it
moved too). No further prompt change without the same explicit trade being written down.

## Retrieval - the shortlist of proven designs (`retrieval.ts`, docs/ADAPT_FIRST_PLAN.md)

The default path was already an ADAPTATION pipeline; what it lacked was retrieval. The design
stage was handed `catalogDigest()` - **430 variants, ~20,300 tokens, one flat list** - and asked
to find the right design in it on the cheapest model in the product, and that chassis choice is
the one decision the whole grounded path rests on.

`shortlistFor(brief, intent, options?)` narrows it with **no new model call and no second
retrieval system**: the ranking is the Browse storefront's own engine (`templates/search.ts`) and
the structural filter is the ONE anchor table, both reading what the intent stage already
produced. Three things make the result usable rather than merely shorter, each measured:

- **A brief is a SET of terms, not one query.** `textScore` is token-AND - every token must land
  or the whole query scores zero - and a sentence always contains a word the index cannot place.
- **Each term is weighted by how RARE it is in the pool.** "lower", "third" and "name" match every
  lower third there is; summing raw scores collapsed the shortlist to catalog order once the
  distinctive words ran out (measured: 89 of 89 "matched the brief text").
- **The cut is RELATIVE to the best match.** A worship brief's two scripture designs score 29 and
  11 and the next sixty score 2.2 - a nonzero score is not relevance. A slot spent on an
  irrelevant design is worse than an empty one.
- **Only matches ship, and the floor of four is filled in bands.** Designs a SELECTIVE term named
  (one reaching fewer than half the pool) come first, then designs no term reached, then the
  residue last. Measured over 40 briefs, 14 needed a top-up: filling by "scored anything at all"
  spends those slots on the 2.2 residue in 13 of them, and filling by "scored nothing at all"
  misses the 14th, where two designs a rare term named sit just below the cut. **The residue ranks
  below an UNREACHED design deliberately** - a generic house strap is unreached because it has no
  distinctive vocabulary, which makes it a neutral base to adapt, while 2.2 means only "has a name
  field and is a lower third". `reason` states the split, so a shortlist never reads as four
  answers when two of them are floor-filling.

Everything degrades rather than empties: an over-tight field bucket is dropped, a query that
matched nothing falls back to catalog order, and no resolvable anchor returns `FULL_CATALOG` -
today's full digest. **`variantSatisfiesAnchor` answers TRUE for an anchor that no longer
resolves**, which is right for the satisfaction check and would hand retrieval a meaningless
shortlist, so retrieval checks `anchorResolves` first.

**It runs on the ADAPT route only.** `catalogDigest(only?)` and `narrowVariantTool` are the two
seams: the prompt shows the shortlist and the schema accepts exactly that set (shown-but-illegal
is a chassis the model picks and `resolveVariant` silently swaps - the wrong graphic delivered as
a success). A CREATE route keeps the full digest, so the frozen coder control stays frozen. The
offline stub picks from the same shortlist deterministically, which is what makes the whole path
e2e-testable without tokens (`e2e/adapt-first.spec.ts`, `e2e/ai-retrieval.spec.ts`).

**A spec-level REFINEMENT retrieves too, and `ShortlistOptions.keep` is what makes that safe.**
`specRefine` takes its anchor from the spec it is editing (the structure is not in doubt, so no
intent call) and its terms from the request PLUS what the graphic already is - "warmer colours"
places nothing in a design index, and searching on it alone would rank by catalog order and offer
a worse set than the one already on screen. `keep` pins the design in use into the shortlist:
narrowing collapses the `variantId` enum, so a design missing from it is one the model cannot ask
for, and a colour request would swap the user's graphic out from under them. It is matched against
the ANCHOR rather than the narrowed pool, so a placement filter cannot evict it either, and a
`keep` from another structure is refused rather than smuggled in.

**A catalog chassis is assembled at the zone it was DRAWN for** (`AssembleOptions.
keepChassisZone`, set by `groundedResult`). Measured over 89 lower thirds: the rendered side
agrees with the declared `defaultZone` on 89 of 89, 88 sit in the bottom band and 87 at exactly
119px from the edge (`scripts/catalog-geometry.mjs`). The catalog ships left-, right- and
centre-drawn designs as SEPARATE members because re-siding a strap means re-siding its accent, so
placement is expressed by picking a differently-anchored member - which retrieval now puts in
front of the model - and by the Style panel afterwards. The `intentCoversFrame` precedent: a
decision the catalog's own data answers better than a prompt does.

**A brief that ASKS for a side is what makes that defensible, so retrieval matches placement
against `variant.defaultZone`** - the one place a side is declared. It cannot come from the text
index: `templateMeta` records a coverage-derived `placements` list, never a side, and of the
twelve right-anchored lower thirds only three carry the word in their name ("Line Handle" and
"Glass Tag" are unreachable by any wording). A matched design is RELEVANT, not merely boosted,
or it would sit behind designs on the wrong side of the frame.

**The policy is an ARGUMENT to `groundedResult`, not a constant** (`AssembleOptions`:
`keepChassisZone` + `sizeScaleRange`), because **NoaCG Lite reaches that same function**
(`liteGroundedResult` calls it with `profile` stripped, so nothing there can detect Lite) and
Lite must keep compiling under its own declared contract: its schema allows `sizeScale` 0.7-1.4
where the harness tool says 0.85-1.2, and its prompt already carries the bottom-zone rule.
Moving either needs the paid re-baseline ADAPT_FIRST_PLAN §6.2 defers. Clamping every caller to
the harness's numbers told the Lite model 1.35 was legal and then discarded it at compile - the
shown-but-illegal mismatch `narrowVariantTool` exists to prevent, one field over.

**The anchor vocabulary is ONE table** (`templates/structuralAnchor.ts`): the family words,
`resolveAnchor`, `structuralFit`, and what a variant satisfies. It lives in templates/ rather
than here because the router and the satisfaction check both need the same answer and
`validation` may not import `ai`. A second copy is how the two come to disagree - the router
sending a brief down the catalog path while the check has no idea what was promised. Everything
resolves LIVE against the registry and catalog, so catalog growth updates routing AND
satisfaction by itself.

The **structural-satisfaction check** (`validation/structuralIntentCheck.ts`) asks whether the
result is the graphic that was asked for, in two parts:

- **Kind** (`structuralKindFindings`) - does the assembled variant carry the anchor the intent
  promised? Answered by IDENTITY against `spec.variantId`. This is the defect the benchmark hit
  most and every other gate was blind to: a stinger brief routes to the catalog path CORRECTLY
  (the catalog does carry transitions), the design stage returns a lower third, and static
  validation, the runtime bench and the parts checks all pass - a lower third really does have a
  headline and really does sit bottom-left. Every measurement agreed and the user got the wrong
  graphic. It reports only when BOTH sides are known: an unresolvable variant or an intent that
  anchored to nothing is a measurement that failed, not evidence of a mismatch.
- **Parts** - list data as a textarea, field capacity, states vs machine/steps statically, plus
  repeating groups and zone placement measured in a rendered iframe.

Browser-only, injected as `GenerateOptions.structuralCheck` (AiStep + AIPromptPanel pass
`benchStructuralIntent`). PARTS findings land as WARNINGS (rule `structural-intent`) - they
measure presence, not quality, and must not change the frozen control's repair rounds. KIND
findings (rule `structural-kind`) land as blocking ERRORS on grounded results (owner decision
2026-07-31, AI_PLATFORM_PLAN §16.3): a wrong-kind assembly - a valid lower third for a stinger
brief - fails closed and is surfaced for refine/regenerate, never delivered as a success.
Grounded assemblies have no repair loop, so blocking there changes no repair rounds; the
provider passes `variantId` to the check only for grounded paths, so a free-form result can
never be kind-checked against a chassis that was never assembled.
**It runs on BOTH routed paths.** It first shipped CREATE-only, which left the grounded path -
where the wrong-graphic defect actually happens - unmeasured: assembly being correct by
construction says nothing about whether the right thing was constructed. `groundedResult`
therefore reports the RESOLVED chassis (`pickVariant` clamps an unknown or unusable one, so the
model's requested `variantId` can name a design that was never built), which is also what makes
a spec-level `modify` refine the graphic the user is looking at.

Free coverage: e2e/creative-routing.spec.ts (mutation-pinned, incl. the brief-bank
catalog-anchor re-verification - the decay rule - and fixtures named after the wrong outcomes
the paid round produced: a lower third for a stinger, a lower third for a timing tower).

## Phase-C pilot (`creative/`, docs/CREATIVE_MODE_PLAN.md §3.2, §8, §10) - BENCH ONLY

`creative/` is the pilot's CREATE pipeline. **Nothing in the product reaches it**: there is no
UI, no route from `claudeProvider` into it, and its only caller is
`scripts/creative-pilot-bench.mjs`. `runCreativeArm(arm, input)` runs one of four ablation arms
per brief - **A** the frozen control (literally `claudeProvider.generate(..., mode:'create')`),
**B** the same coder with a NEUTRAL skeleton example and the whole intent carried, **C** the
staged pipeline, **D** C plus one rendered-frame critique and one focused repair. A-vs-B
isolates the catalog example, B-vs-C the staging, C-vs-D the critique - so the arms must differ
in ONE thing each, which is why arm B reuses `coderSystemPrompt` rather than owning a prompt.

The staged path is `contracts.ts` (ConceptDirection + CreativeSpec, both normalize-don't-reject)
-> `knowledgeCards.ts` (family anatomy + DESIGN_LANGUAGE numbers, keyword-selected, max 2, a
card REPLACES generic language) -> `stages.ts` (the stage 4/5 tools and prompts) ->
`scaffold.ts` (DETERMINISTIC: fields + SPX definition + runtime + list rebuild + the marked
region + safe-area geometry) -> `style.ts` (the model's CSS and bounded region HTML through an
applyPolish-class gate). **The scaffold is the floor**: a style patch the gate refuses leaves a
plain but valid graphic, e2e-pinned against the full production validator. The anti-anchoring
rule (§4) is absolute here - no catalog design code reaches any CREATE prompt, and
`neutralSkeleton.ts` is what the coder arm studies instead.

Rigs: `bench:creative:route` (routing only), `bench:creative:pilot` (the arms - the most
expensive rig in the repo, explicit routes, priced, ceilinged), `bench:creative:refs` (free
catalog hold frames, so `bench:sameness` can calibrate the copy line), and
`scripts/creative-plate-visibility.mjs` (free, reads PNGs already on disk). Free coverage:
e2e/creative-pilot.spec.ts.

**The BACKDROP rule is split by what the spec declares** (owner ruling 2026-07-31,
benchmarks/creative/v1/RULINGS-2026-07-31.md; the defect: a style patch shadows `--panel-bg`
to black on the root - legal, `:root` is untouched - and makes the box `100vw x 100vh` painted
with it, so a "valid" overlay floods the frame). An OVERLAY (`fullFrame: false`) may not paint
an opaque full-frame backdrop: `style.ts stripFrameFlood` strips the FILL and keeps the PAINT
from any rule carrying both, which leaves the panel at content size in its zone instead of an
invisible box with the content sprayed across the canvas. A full-frame BOARD may cover, and is
measured instead - `creative-plate-visibility.mjs` composites against the known plate
(`creative-plate.mjs`, shared with the rig so reference and capture cannot drift) and
calibrates the floor against the catalog's own designs **per category**: pooled over lower
thirds and versus the catalog minimum is 0.0%, because vs02 legitimately covers every pixel,
and one number over two placement classes excuses every flood there is. The same measurement
reads the opposite end exactly - a frame pixel-identical to the bare plate painted NOTHING.

**`spec.layout.fullFrame` is DERIVED, not asked for.** It decides both the scaffold's anchoring
(a full-frame graphic is centred, not zoned) and whether the backdrop gate above applies, and
the model got it wrong on 24 of 30 lower thirds - for graphics whose own family word was
"strap" and whose zone was "bottom-left". Two rewordings of the stage-5 schema moved the rate by
8 points, which is the evidence that it was never a wording problem. `templates/
structuralAnchor.ts intentCoversFrame` now resolves the structure the brief named through the
anchor table and reads the `CoverageClass` the graphic category already declares; the model's
flag survives only for a brief that names no structure the catalog knows, where there is
nothing to correct it against. Over the archived specs: lower thirds 24/30 claiming the frame ->
0, versus 49/49 (correcting two that had denied it). It lives beside the anchor table for that
table's own reason - the router and the satisfaction check must not hold two answers.

**Stage 3 READS THE USER'S REFERENCES** (`creative/references.ts`, plan §7; wired 2026-08-02,
benchmarks/creative/v1/REFERENCES-2026-08-02.md). Four briefs in the bank had said "the attached
mood board" / "plate attached" since it was written and every round sent nothing.

- **The reading REPLACES the picture, it does not accompany it.** The designing stages are text
  models by choice - that is what makes arm C cost a tenth of the control - so one vision call
  turns every attachment into structured words and the raw image blocks are dropped. Sending
  both is not redundancy but a FAILED REQUEST: a text route rejects a message carrying an image
  rather than ignoring it, which killed every reference brief on this stage's first run.
- **The purpose decides what may be said** (model/imagePurpose.ts): `mood` gives colour and
  texture and explicitly no arrangement, `layout` gives arrangement and no artwork, `plate` is
  what the graphic must survive and is never drawn. Each keeps its own heading in the prompt -
  a flat list is how a plate gets read as a mood board, and a duplicated attachment claim is
  dropped rather than filed under another's purpose.
- **Arm A does not get references** and the bench says so wherever its numbers are: the frozen
  control cannot consume a picture on a text route, so a reference brief compares a pipeline
  that can see against one that cannot.
- Fixtures are SYNTHESISED (`scripts/creative-reference-fixtures.mjs`), not collected. Real
  broadcast graphics belong to whoever made them, and a mood board carries no composition - a
  real design used as one would smuggle a layout in and make the experiment unreadable.

**A CREATE result must be readable against SOMETHING - a surface, or its own halo, never
neither** (`style.ts legibilityFloor`). The scaffold published `--panel-bg` as a variable and
nothing ever painted it, so a contract that correctly said dark ink on cream paper rendered the
ink onto live video. The floor is a disjunction, not "always paint a panel": a panel-less design
is real (the catalog's `clean` skin carries none and buys legibility with a halo), so the
platform supplies one only when the design supplied neither. It applies to the BARE SCAFFOLD
too, which is what ships whenever the gate refuses a patch. Only the scaffold's own elements
count as a surface - accepting any prefixed class let a decorative dot disable the floor for
the designs most likely to need it, so it errs toward painting.

**Three more things about a CREATE result are the platform's floor, because a model got each of
them wrong at scale** (the 2026-08-01 pass, benchmarks/creative/v1/PASS-2026-08-01.md):

- **Every declared field reaches the screen.** Fields bind to regions through the spec's
  `fieldKeys`, which stage 5 frequently returns EMPTY, and the rescue for unbound fields used
  to skip the `list` and `hidden` roles - so 48 of 69 staged runs shipped fields nothing could
  draw (88 of them). Row sets are now one compiled table generating both the markup and the
  runtime (they were decided separately, which left 26 of 55 runs with a rebuild whose
  container did not exist), every list field gets its own container, and a final sweep gives a
  visible slot to anything still unreachable.
- **A graphic can say something.** Seven runs declared no fields at all and several typed every
  field as a picture, leaving a frame of src-less `<img>`. The scaffold guarantees one
  text-painting field, synthesized from the graphic's own name. The rule asks what a field
  PAINTS, never what its label looks like - a keyword guess has to call "Home Team Crest" an
  image and "Team 1" not, and would become its own defect.
- **A length keeps its unit.** The style stage copies the scaffold's
  `calc(26px * var(--scale) * var(--type-scale))` and drops the `px`; the browser then discards
  the declaration and the whole type ladder reverts to ~16px in a 1920x1080 frame. 469
  declarations across 59 of 155 archived stylesheets, and the coder arms clean at 0 - the
  scaffold's own pattern induces it. `style.ts repairUnitlessLengths` restores the unit
  (clamp-don't-reject) narrowly enough that it only touches expressions built from bare numbers
  and the two scaffold multipliers, so it cannot rewrite CSS that would have worked.

**These were all invisible to every gate, which is the lesson worth keeping.** Structural
satisfaction asked whether a required part was PRESENT in the DOM, and a hidden holder is
present - so a versus card whose four fields were all undrawable scored complete. Reading the
markup for `id="fN"` cannot fix that: a standings row, a ticker item and a credits line are
BUILT by a runtime from one field, so the id is legitimately absent. `validation/
structuralIntentCheck.ts` therefore DRIVES every text-bearing field to a sentinel and re-reads
the painted frame - scripts/field-coverage.mjs's technique asked in the opposite direction. It
ignores opacity on purpose: a region the machine reveals in a later step is transparent during
the entrance and perfectly reachable (the bracket's champion is exactly that, and was its first
false positive).

**The critique repair lands when it is NO WORSE than its base** (`pipeline.ts noWorseThan`,
same ruling): no new error rule and no more errors than the base, or clean. The old
`validation.ok` rule could not land on an invalid base at all - 1/20 across both smoke rounds -
which made §11 criterion 8 unmeasurable rather than negative.

**The pilot rig's routes are PER ARM CLASS** (the 2026-07-31 bracket smoke, blocker 1:
qwen3-30b completed 0/8 coder-arm runs on `malformed_response` over ~10k-token emits while
going 8/8 on the staged arm - one route for every arm measures emit-size reliability, not
the arms): `--route` is the candidate under test (arms C/D + the shared intent stage),
`--coder-route` is REQUIRED for arms A/B and may equal `--route` to restore single-model
attribution. The rig pins each arm's route through saved settings - the same mechanism
that picks production's session model - so the frozen control's code is untouched; each
stage's serving model is in the ledger, `pilot.json` records `armRoutes`, and per-stage
cost is priced by the RECORDED model first. With split routes, A-vs-B and C-vs-A stay
single-variable; B-vs-C differs in model class AND staging, and the report says so.

## The quality gate (injected, not owned)

The provider is UI-free: callers inject `GenerateOptions.validate` (an `SpxValidator`) -
the app wires `validateTemplate` + `benchTemplateRuntime` (src/validation/runtimeBench.ts:
live-iframe lifecycle, field binding, overlap/overflow, doubled-text stress, and the house
editability contract). Bench findings are teaching messages that drive repair rounds. A
result that still fails is returned WITH its validation attached - surfaced, never
auto-applied. Grounded assemblies get NO repair loop: one failing its own bench is a
platform bug worth surfacing. On the free-form path the editability contract is enforced
deterministically first (`convertEmittedRegion`, pipeline item 5): repair rounds only fire
on FUNCTIONAL findings, and residual `bench-editability` findings surface as warnings -
except when a modify started from a data-shaped template, where they stay errors.

## The safety screen (`safety.ts`) - what the code DOES, not whether it is correct

The quality gate above asks whether a result is CORRECT. Nothing in it asks what the generated
JavaScript *does*, and the model does not read only the user's brief: it reads uploaded REFERENCE
IMAGES (text inside a picture is instructions to a vision model) and, on modify/convert, a whole
HTML file the user may have been handed by someone else. So `safetyFindings` screens the emitted
JS for network calls, browser storage, runtime code building and cross-frame reach, sharing its
construct list with the community share gate (`validation/templateBench.ts` `unsafeJsConstructs`)
- one question, one answer, one place to update.

It blocks rather than warns because a generated template is EXECUTED automatically: the runtime
bench loads it the moment a result lands, before anyone has looked at it, in an iframe that today
shares the app's origin.

- **`withSafetyChecks`** wraps the INJECTED validator, so a finding reaches the repair loop and
  the model gets a round to write the code properly.
- **`mergeSafety`** screens again where a result is SHOWN (AiStep's `showChange`, AIPromptPanel).
  That belt exists because `generateRaw` validates itself and never runs the injected validator -
  keeping that path pure is deliberate, so the screen meets it at the consumer instead.
- **`source`** is the template a modify/convert started from, and only constructs the result ADDED
  are reported: a graphic that already carries a Live data or Show chat block legitimately calls
  `fetch()`, and restyling it must not become impossible because the model preserved the user's
  own code. A generate passes no source.

Honest limit: a regex screen refuses the obvious, not the determined (`window['fetc'+'h']`). The
containment that would actually hold is denying the preview iframe the app's origin.

## Telemetry & the value proof

`telemetry.ts` records every run locally (stages, tokens from the API usage block, repair
rounds, route, diversity fields; localStorage ring, JSON-exportable). The VIDEO harness
records through the same ring (kinds `video-generate`/`video-refine` - it recorded
nothing before); consumers filter by kind, so SPX statistics never mix with video runs.
The standing proof:

- `scripts/ai-compare.mjs` - same brief, same model, four arms (raw / raw+self-critique /
  pre-harness / the harness), neutral scoring (runtime bench + motion-sampled overlaps +
  screenshots) plus cost/latency/diversity. **The decision rule: each stage keeps its place
  only if it shows a clear improvement for its cost.**
- `scripts/ai-bench.mjs` - the single-arm brief bank + review gallery for prompt iteration.

Both need the dev server + a real key and SPEND TOKENS - never CI.

**Run `npm run bench:preflight -- <models>` before any paid round.** It is free, reaches no
network, and answers the question the paid runner structurally cannot: given this `.env` and
these candidates, what would each arm ACTUALLY serve? `api/_lib/aiBenchPreflight.ts` resolves
every arm through the REAL `liteProfile` + task registry (never a model of their rules - a
preflight that reimplements the server drifts from it and then certifies runs the server will
refuse), and refuses a plan whose arms are overridden, unapproved, unconfigured, or not
pairwise distinct. Each of those wasted a real round: they are invisible in the OUTPUT, because
a comparison whose arms resolve to one model still produces differences - sampling noise reads
as model character - so the numbers look like findings. `--env=<path>` checks another
environment file. Regression suite: `api/_lib/aiBenchPreflight.test.ts` (in the build gate).

## The structured setup (spec/ - the "More control" panel's harness grip)

The AI step's optional "More control" panel authors a `GenerationSpec` (schema in
`src/model/generationSpec.ts` - MODEL layer, because SavedProject/GraphicDoc persist it as
`aiSpec`) that rides `GenerateContext.spec` as TYPED data, never flattened into prose early.
An empty spec injects nothing - the prompt-only flow is byte-identical to before. The parts:

- `spec/categories.ts` - the 20-entry AI CATEGORY registry (measured from the 60-format
  reference workbook): each entry links a `TemplateCategory` and, where one models it, a
  `GraphicType` id (fields/machine/controls come from the type), plus suggested fields,
  workflow rules, and (rules-only entries) a machine hint. **Adding a category = one entry
  here + its id in the model union**; nothing else enumerates categories.
- `spec/specPrompt.ts` - deterministic prompt sections (category workflow rules, the field
  table, the linked type's serialized machine pattern, fonts, motion intent). Appended by
  `contextText`, so every path - including raw - reads the user's own decisions.
- `spec/specDesign.ts` - the pinning: `narrowedSpecTool` collapses the design-stage tool
  schema to the pinned category; `applySpecLocks` overwrites the model-emitted DesignSpec
  with the user's decisions (fields, animation, fonts, brand colours) and re-picks a chassis
  that can CARRY the user's line count; `applySpecOutPreset` applies an explicit exit preset
  as a real keyframe swap (blocks/presetApply).
- `spec/specValidate.ts` - the user's own quality gates: requested-field-present (ERROR -
  drives the coder's repair loop; demoted to a warning on grounded assemblies, where a
  fixed-contract category legitimately can't carry it and no loop exists), uploaded-font-used
  (warning = the honest fallback report), and `ensureSpecFonts` (uploaded fonts ALWAYS land
  as embedded assets + a visible @font-face, model or no model).

## What an uploaded picture is FOR (model/imagePurpose.ts)

A dropped image used to mean one thing: bundle it and place it. It carries FOUR unrelated
intents, and they want opposite treatment - so the user says which, and the vocabulary lives
in the MODEL layer (like GenerationSpec, because VideoProject persists it):

- **`asset`** - "use it as it is". The ONLY purpose that bundles: it becomes a real file,
  referenced by path, exported. Rides `GenerateContext.images`. Its sub-choice
  `fixedAssetPaths` says the operator gets NO field for it - permanent brand furniture rather
  than content, which was impossible to say before (a logo slot always emitted its `filelist`).
- **`layout`** - "make one like this". Follow the composition, hierarchy, density, shape
  language; never reproduce the artwork. A SKETCH is read as a diagram of what to build, not a
  look to imitate.
- **`mood`** - "take the look and feel". Colour, texture, weight, motion energy; layout
  explicitly ignored.
- **`plate`** - "make it work over this". The REAL background the graphic will sit on: never
  placed, never imitated, read for legibility and safe placement.

The last three ride `GenerateContext.references` as `{asset, use}` and are vision-only - never
bundled, never placed. `attachmentSections` builds ONE numbered manifest plus a block per
purpose present, and `imageBlocks` sends the pictures in exactly that order, so "attachment 3"
means the same picture in the text and in the vision blocks. `modifyContent` reuses the same
function, so a picture attached mid-conversation means what it would have meant at the start.

**The as-is screen (`assetIntegrity.ts`)** is the protection "use it as it is" promises: a
design that puts a filter, crop, mask, `object-fit: cover`, rounded corners or an uneven scale
on a protected picture is REJECTED. It reports through the injected validator (composed in
`productionSpxValidator`, beside the safety screen), so a violation reaches the repair loop
rather than only the result card. Same honest limit as safety.ts: it reads CSS text, not the
resolved cascade - the obvious case, not the determined one.

The preselect only ever guesses `asset` vs `mood`; `layout` and `plate` are intents no pixel
reveals, and guessing them would present a coin flip as a decision.

## The conversation is part of the brief

`GenerateContext` carries two more typed inputs, both rendered by `contextText` (so EVERY
path reads them, including raw) and mirrored into `modifyContent` and the spec-refine prompt:

- **`conversation`** — the talk turns that led here, oldest first. A brief refined over three
  turns IS all three; the brainstorm used to hand over one summary line and drop the rest,
  and its system prompt said so ("the generator never sees this chat"). It no longer does.
  **The caller bounds this** (the AI step sends the last 10 turns); the provider never
  re-reads a session.
- **`seed`** — "three more like this": the design spec of a direction the user picked. The
  design stage keeps its category, typographic voice and colour character and varies what is
  genuinely a choice. It is a starting point, never a template to return three tints of —
  the same named failure the alternatives call exists to avoid.

**`modify` takes a context** (`modify(prompt, template, context?, options?)` — the shape
`convertImport` already had). That is what makes an image attached mid-conversation real:
the context reaches `toTemplate`, so the asset is BUNDLED, not merely mentioned in a prompt.
A referenced-but-missing asset is the dangling-reference defect class that ships broken
exports. `contextFrom(template, outer)` merges the template's own images with the turn's
attachments, deduped by path, so a spec-level re-assembly loses neither the logo it already
had nor the picture just handed to it. An attachment does NOT force the code level: the
design stage sees the image and routes to `custom` itself when the catalog has nowhere to
put it (a logo slot takes a mark; a full-frame still does not).

## Other files

- `modelTypes.ts` + `modelGateway.ts` - the provider-neutral model-call contract and browser
  client. The server adapters in `api/_lib/aiGateway.ts` implement Vercel AI Gateway (the
  MANAGED transport, and the only one NoaCG funds), plus Anthropic, OpenAI Responses and
  compatible Hugging Face Inference Providers as bring-your-own-key routes - without branching
  the harness. Retention is TWO filters, ANDed by the gateway: `disallowPromptTraining` is free
  on every plan and pinned on for every managed call, and `zeroDataRetention` is the
  Pro/Enterprise superset - so a task that requires ZDR fails closed with `zdr_unavailable`
  rather than degrading quietly, and a deployment without the plan still keeps the no-training
  floor. The per-request price cap OpenRouter enforced has no gateway equivalent and now lives
  entirely in the approved-catalog snapshot and each task's cost booking
  (docs/AI_PROVIDER_GATEWAY.md).
  `modelCatalog.ts` reads only the normalized server discovery endpoint; live catalog
  normalization stays in `api/_lib/aiModelDiscovery.ts`. Structured output, usage, costs, errors,
  retries, and explicit fallbacks normalize here. `cacheSystem` remains an Anthropic hint;
  other adapters ignore it.
- `stubProvider.ts` - the offline provider: keyword -> DesignSpec -> the SAME specToTemplate
  pipeline, so offline results are catalog-grade; block answers remain as fallback. It honors
  the structured setup through the same `applySpecLocks`/post-passes, which is what keeps
  the whole More-control flow e2e-testable without tokens (e2e/ai-more-control.spec.ts).
- `settings.ts` stores only non-secret provider/model/routing preferences and server-reported
  credential availability. Raw keys never enter localStorage. `index.ts` (getAiProvider),
  `brainstorm.ts`, `examplePrompts.ts`, and `presets.ts` keep their existing roles.

The binding gateway and key-handling contract is `docs/AI_PROVIDER_GATEWAY.md`. Provider
adapters never own DesignSpec, validation, repair, preference learning, or graphic-type
context. New providers enter below `AIProvider`, never beside it.

The versioned video matrix and brief bank live in `benchmarks/video/v1`; its runner must drive
`src/ai/video` through the application, never call a model with a benchmark-only prompt pipeline.
The binding experiment and artifact contract is `docs/VIDEO_MODEL_BENCHMARK.md`.

**Deferred (benchmark-gated, deliberate):** a selective vision taste critic (free-form path
only, evidence-based findings, never auto-rewrites a valid grounded result), a curated taste
library with per-brief retrieval, and a nightly taste-analysis task producing reviewable
proposals. Add them only when the compare rig shows they pay for themselves.
