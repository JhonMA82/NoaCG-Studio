# Creative Mode - a custom creation path for affordable open models

Status: PLAN (no implementation in this document's branch). Companion to
`docs/AI_PLATFORM_PLAN.md` (the task-registry architecture this slots into) and
`docs/AI_LITE_BENCHMARK.md` (the evidence base). Read `src/ai/AGENTS.md` first - the harness
doctrine there stays binding; this plan changes how the CUSTOM route works, not the doctrine.

The goal: off-catalog briefs should produce original, usable broadcast graphics from cheap
open-weight models, because NoaCG - not the model - supplies the broadcast knowledge, the
structured creative process, the compiler, and the feedback loop. Catalog-grounded generation
(the adapt path) already works and is not touched.

---

## 1. The current request flow, and where it fails

### 1.1 Catalog-fit trace (works - keep)

brief + images/references + conversation + GenerationSpec
-> `contextText`/`imageBlocks` (claudeProvider.ts:546-593)
-> ONE design call (`specSystemPrompt`, forced `emit_design_spec`, the ~18.3k-token
   `catalogDigest` in the system prompt)
-> `DesignSpec { fit:'catalog', variantId, lines<=3, palette, typography, density, shape,
   referenceSystem, flourish }`
-> `assembleGroundedTemplate` (litePipeline: `specToTemplate` -> real `variant.create()` ->
   `applyDesignAdjustments` -> `ensureSpecFonts` -> `applySpecOutPreset`), every value clamped
-> injected validator (validateTemplate + runtimeBench) -> optional bounded polish.

One model call, deterministic everything else, correct by construction. This is the adapt
path and its contract does not change.

### 1.2 Off-catalog trace (the broken half)

Same design call -> `fit:'custom'` -> the free-form coder (claudeProvider.ts:937-943):

- example = `variantsFor(spec.category)[0]` - the FIRST variant of the spec's category, its
  complete html/css/js inlined as "the canonical example - match its structure exactly";
- forward-carried design direction = `designNotes()` (claudeProvider.ts:884-894): exactly
  four strings - `reason`, `motionCharacter`, `referenceSystem`, `flourish`;
- one ~16k-token emit inventing structure, layout, fields, typography, animation and every
  contract at once -> `convertEmittedRegion` -> shared repair loop (2 rounds, functional
  findings only).

### 1.3 The failure points, with evidence

**F1 - the router almost never chooses custom.** The 2026-07-29 full-harness sweep
(bench:harness, 4 candidates x 12 deliberately off-catalog briefs): only 6 of 48 runs took
the custom path; per model gemma-3-12b 0, qwen3-30b 0. The stinger, stock strip, timing
tower and poll donut all came back as lower thirds. Mirko's blind verdict: roughly 1 clear
success and 2-3 "okay" out of 48.

**F2 - the spec vocabulary cannot describe off-catalog structure, so routing custom is
structurally discouraged.** `SPEC_INPUT_SCHEMA` (designSpec.ts:103-216) requires a catalog
`category` (enum-locked, no "none of these") and caps `lines` at 3. A timing tower - five
repeating rows of three parts - is inexpressible; the honest answer does not fit the form,
and the model picks the nearest catalog shape instead. `resolveVariant` then falls back to
`lower-third` (designSpec.ts:285-295), which is why "nearest" is almost always a strap.

**F3 - prompt asymmetry anchors on the catalog.** The design stage reads ~18.3k tokens of
catalog listing and zero tokens about how to design something new; the catalog route is
described as "guaranteed-correct" while custom carries all the risk. On the custom route the
one worked example is a full catalog design. The structure-spine requirement (the `-box`
contract) is what the example is FOR, but a cheap model reads a complete design as
compositional guidance - the only design language it is shown.

**F4 - the design stage's decisions are thrown away on the custom route.** Lines, palette,
typography, density, alignment, shape, zone, sizeScale and the animation choice all die
between the spec and the coder; `designNotes` keeps four sentences. The coder re-invents
what was already decided, in the same call that writes the code.

**F5 - nothing measures "is this the graphic that was asked for".** Machine validity
anti-correlates with brief satisfaction: qwen3-30b scored 12/12 valid + 12/12 overlap-clean
and produced junk (a timing tower rendered as two lines of stray numbers); qwen3-coder-next
scored worst on validity (9/12) and produced the only "looks good" results. Ranking on the
existing gates would promote the worst model and eliminate the best. The same blind spot at
Lite scale: the vision judge scored strapShape 5 on a frame with no strap (AI_LITE_BENCHMARK
§6d) - a gate cannot catch a defect in a dimension it does not measure.

**Why the harness encourages catalog copying (the one-paragraph answer):** the routing
schema forces every brief into catalog vocabulary, the prompt spends its whole budget
describing the catalog, the custom route's only design example is catalog code, and every
gate downstream measures engineering conformance rather than brief satisfaction - so the
cheapest way for any model to "succeed" is to pick a chassis, and nothing ever penalizes
the pick being wrong.

---

## 2. Target architecture

### 2.1 The two routes and their contracts

| | ADAPT (exists, unchanged) | CREATE (new) |
|---|---|---|
| When | a catalog design family carries the brief's STRUCTURE | no family does |
| Model's job | pick chassis + parameters | design within a compiled structural scaffold |
| Platform's job | assemble, clamp, validate | analyse intent, compile scaffold, validate structure + engineering |
| Catalog's role | the design | engineering contracts only - never a compositional example |
| Cost | 1 small call | 3-5 small calls + 1 medium call |

**The routing contract.** The router's output stops being "a catalog category" and becomes a
**StructuralIntent**: what kind of graphic this is (graphic-type id when one matches, else a
composition family), the required structural elements (repeating rows? two mirrored sides? a
chart? full-frame?), the data fields (including LIST data via the house one-textarea
convention), required states/events, placement, and tone. Routing then becomes an honest,
testable question: *does a catalog family / graphic type declare this structure?* - answered
against the type registry (62 types, `src/templates/types/`) and taxonomy metadata, with the
model proposing and the platform checking, instead of the model absorbing an 18k-token
listing and free-associating. `fit` gains the escape the schema currently lacks: an intent
that matches nothing routes CREATE without having to lie about its category.

**Anti-anchoring rule (binding):** the CREATE path never sees catalog design code. Its
engineering example is a neutral structural skeleton (the Lite skin canvas generalized - see
2.3); its design input is the brief, the reference analysis, and per-brief design-knowledge
cards (§5). Catalog knowledge reaches CREATE only as *machine-readable constraints* (type
structures, motion preset banks, the :root contract), never as finished compositions.

### 2.2 The staged pipeline (the hypothesis, adjusted to the repo)

The prompt's staged hypothesis survives contact with the repo with two amendments: (a) the
"deterministic compilation" stage cannot be a universal layout compiler - that would be the
second scene model the non-negotiables forbid - so it becomes *scaffold compilation* plus
bounded model styling, the Lite skin architecture generalized and already measured to work
(rounds d-h); (b) "rendered-frame review" is split into a deterministic structural check
(cheap, reliable, ships in v1) and a vision critique (blocked on in-app capture + the judge
axes rewrite, ships later).

```
1. INTENT      1 small structured call: brief + conversation -> StructuralIntent
               (graphic kind, required parts, fields incl. list data, states, placement, tone)
2. ROUTE       deterministic: StructuralIntent vs type registry / catalog metadata
               -> ADAPT (existing grounded path, unchanged) or CREATE
3. REFERENCES  only when uploads exist: 1 vision call -> structured ReferenceAnalysis
               (principles per imagePurpose - never geometry, never literal copying; §7)
4. CONCEPTS    1 small structured call -> 3 genuinely different concept directions
               (composition family, hierarchy order, palette character, motion character -
               NO code, ~200 tokens each). User picks via the existing alternatives picker,
               or auto-pick by stated criteria when the caller wants one result.
5. DESIGN SPEC 1 structured call -> CreativeSpec (the DesignSpec extension, §6): the chosen
               concept made concrete - regions/rows/components with roles, per-region type
               scale, palette, motion plan naming preset-bank/measured-builder vocabulary
6. COMPILE     deterministic: scaffold from shared assembler pieces (base.ts :root/zone/
               auto-fit/runtime scaffold, setFieldValue, definition emit, textarea list
               runtime, animRuntime interpreter, machine attach when states were declared)
7. STYLE       1 medium call: CSS (+ bounded structural HTML inside the scaffold's marked
               slots) - the skin pattern with structure, through the applyPolish-style gate
8. VERIFY      deterministic: full injected validator + the NEW structural-requirements
               check (StructuralIntent parts vs the rendered DOM, runtimeBench-style)
9. REPAIR      the existing shared/repairLoop, findings from 8 fed back, <=2 rounds
10. (later)    vision critique on the HOLD frame - inspection-phrased axes only (§9)
```

Stages 1, 4, 5 are small structured outputs (hundreds of tokens) - exactly the call shape
the Lite comparison proved cheap open models handle at 100% (qwen3-30b 24/24). Stage 7 is
the only medium call, and it is bounded because the scaffold already carries the fields,
runtime, and animation region.

### 2.3 What each stage may and may not decide (model vs platform)

Model decides: intent interpretation, concept directions, composition, hierarchy,
typography, palette character, shape language, motion character, CSS, bounded HTML.

Platform decides (deterministic, never a model): field ids + SPX definition, the runtime JS
scaffold (update/play/stop/next, escaping, DOM-ready guards), the animation interpreter and
data conversion, machine compilation, clamps (palette contrast, type floor, size), zones and
safe areas, validation, structural verification, export packaging, frame capture.

The load-bearing precedents: the skin experiment proved model-CSS-over-deterministic-skeleton
produces genuinely non-catalog looks that pass the bench (round h: 15/18 usable, retro-
festival clamps); the repair-loop lesson says clamp instead of failing wherever a value is
merely out of range; the framing lesson says teach geometry, not prohibitions; the
prompt-load ceiling says every stage's prompt REPLACES language rather than adding it.

---

## 3. Boundaries and contracts between stages

Every inter-stage artifact is a versioned typed contract (the GenerationSpec/LiteSpec
pattern), so stages can be benched, cached, and swapped independently:

- **StructuralIntent v1** - new. Graphic kind (type id | composition family | 'novel'),
  required parts (id, role, repeating?, dataBinding), fields (reusing the TypeField role
  vocabulary from `types/graphicType.ts`), states/events (TypeMachine vocabulary), placement,
  tone words. This is deliberately the same vocabulary the graphic-type registry declares -
  the router compares like with like, and a CREATE result that later earns catalog promotion
  already speaks the registry's language.
- **ReferenceAnalysis v1** - new, per-asset, cacheable. Structured principles per
  imagePurpose (§7). Replaces the single free-text `referenceSystem` string on the CREATE
  path; ADAPT keeps `referenceSystem` unchanged.
- **ConceptDirection v1** - new, tiny. Composition family, hierarchy order, palette
  character, motion character, one-line rationale. Never code, never a chassis id.
- **CreativeSpec v1** - the DesignSpec extension (§6). Carries the WHOLE design decision
  forward - fixing F4 by construction: the style stage receives every decision, not four
  sentences.
- **Scaffold contract** - the compiled template with marked writable slots. The style
  stage's patch goes through an `applyPolish`-class gate: :root/@font-face/scripts
  untouchable, field ids and anim-data selectors preserved, `clip-path` forbidden until the
  bench's paint-region work is merged, everything else revertable.
- **StructuralFindings** - the verify stage's output, same shape as validator findings so
  `repairLoop` consumes them unchanged; `blocking` policy stays the caller's, per the
  existing seam.

Server side, each model-bound stage is a **task profile** in `api/_lib/aiTaskRegistry.ts`
(`creative-intent`, `creative-concepts`, `creative-spec`, `creative-style`,
`creative-reference-analysis`) - route policy, quota, ledger and ZDR come from the existing
registry/catalog/policy layers; no new gateway, no new endpoints beyond the task pattern.
Funded routes stay inside `fundedModelRoute()`'s price gate.

---

## 4. Systems reused (and explicitly NOT rebuilt)

Reused as-is: the model gateway + adapters, task registry + policy/budget/ledger,
`shared/repairLoop`, the injected-validator seam, `validateTemplate` + `runtimeBench`,
safety + asset-integrity screens, `convertToDataRegion` + the preset banks + measured-motion
builders, the graphic-type registry vocabulary, `imagePurpose`, the taxonomy, telemetry,
preferences, the wizard's alternatives picker, the bench/gallery/blind-review rigs, the
repeating-data textarea convention, `base.ts` assembler pieces, and the export registry.

Not built: no second router, no parallel schema family outside the versioned-contract
pattern, no new renderer or capture stack, no new timeline/field/export models, no
expression language, no universal layout engine. The scaffold compiler is assembled from
`shared/base.ts` + `shared/standard.ts` pieces the way self-assembled categories
(scoreboards, versus, competition) already are - a new *composition* of existing parts, not
a new mechanism.

---

## 5. Design knowledge without templates to copy

What exists machine-readable today: DESIGN_LANGUAGE.md's numeric rules and the §8
cross-family token table, the Lite chassis fit metadata (positive AND negative fit), the
taxonomy facets, TYPE_META, and the video harness's reference cards (pool of 14 with
orthogonality axes - including the measured lessons: keyword-anchored selection, no
contrast selection, cards must actually reach the prompt that writes output).

Proposal: **design-knowledge cards for the SPX side** - one card per composition family
(strap, tower/stack, board/table, split/versus, card, ring/meter, full-frame reveal, strip),
each carrying: the hierarchy this family reads in, its structural anatomy in StructuralIntent
vocabulary, its numeric guardrails (from DESIGN_LANGUAGE), its motion grammar (which preset
bank / measured builders fit), its named failure modes, and positive/negative fit (the Lite
chassis metadata pattern). Selected deterministically per StructuralIntent (the
referenceSelect precedent), 1-2 cards per generation, injected into stages 4-5-7.

Cards teach *anatomy and principles*, never a finished implementation - the anti-copy line
is that a card contains no CSS values beyond DESIGN_LANGUAGE's published ranges and no
complete markup. And per the load-ceiling finding, a card REPLACES generic prompt language
for its family rather than stacking on top of it.

---

## 6. The design contract: extend DesignSpec, do not replace it

The existing DesignSpec stays byte-identical for ADAPT (Lite and grounded generation are
pinned to it). CREATE adds a versioned extension - `CreativeSpec v1` - whose new sections
are exactly what F2 showed to be inexpressible:

- **layout**: ordered regions with roles; a region may be `repeating` with an item shape
  (parts per item) bound to a LIST field - the timing tower's five rows, the schedule
  board's entries - compiled onto the house one-textarea convention and a
  `rebuildInfographic()`-class runtime, never onto twenty fields;
- **fields**: the TypeField vocabulary (logical keys, roles, line/list/logo/number), lifted
  from the <=3-lines cap;
- **per-region typography** (the existing SpecTypography, per region instead of global);
- **motion plan**: entrance order + which preset-bank choreography or measured builder each
  region uses (names from the existing banks - new motion is expressed in the authoring
  grammar and converted, exactly like the custom route today);
- **states** (optional): TypeMachine-vocabulary declarations when the intent required them.

Everything else - palette, fonts, zone, sizeScale, shape - reuses the existing spec fields
and their clamps. Fields, timelines, state compilation, responsiveness (auto-fit), and
exports remain entirely existing-system territory.

---

## 7. References as principles, not pixels

Keep the four-purpose vocabulary (`model/imagePurpose.ts`) - it already encodes the right
user intents. Change what CREATE extracts:

- **layout** -> structured composition analysis: anchor/zone, hierarchy order, density,
  proportion rhythm, shape language - in CreativeSpec vocabulary so it flows into stage 5
  directly. Never coordinates: the vision benchmark's clearest signal is that cheap VLMs
  transcribe text perfectly and place boxes badly, so geometry is the one thing not to ask
  them for.
- **mood** -> palette character, texture, weight, motion energy tokens.
- **plate** -> legibility constraints (bright/busy zones to avoid, needed panel opacity).
- **asset** -> unchanged: bundled, placed, protected by the as-is screen.

One vision call per generation at most (all references analysed together, as
`attachmentSections` already batches them), producing ReferenceAnalysis; cache per asset
hash so a refinement never pays twice. Brand material (logos, fonts) keeps its existing
deterministic path (ensureSpecFonts, logo slots). The consent notice already covers image
upload; the vision quota decision (§15 of the platform plan) applies.

---

## 8. The pilot: Creative Mode v1 on versus cards

Versus is the right first category: vs01/vs02 exist as adapt-path ground truth (themselves
born from AI benchmark winners), the matchup graphic type carries a real machine
(select/lock winner) for the states dimension, full-frame composition gives creativity room,
logo assets exercise references, and the harness sweep showed it is the one brief where both
paths already produce sane output - so improvement is attributable to the pipeline, not to
the category being impossible.

Scope: the CREATE pipeline (stages 1-9, no vision critique), flag-gated, category-limited to
versus-shaped intents. Bench-rig only - no production UI beyond the existing flow.

Brief bank (~12, committed with the rig): canonical team-vs-team; long/unusual names
(60-char stress); 3-way and 5-way multi-competitor (forces the repeating-row muscle);
non-sport versus (debate night, cook-off, chess); brand-referenced (mood board + logos);
plate-constrained (busy arena shot); countdown-to-faceoff (timer state); winner-reveal
required (machine); minimalist editorial tone; kids-show tone; one deliberately
catalog-fit brief (MUST route ADAPT - the routing regression case); one deliberately
unfulfillable brief (the honest-refusal case).

Arms: current custom path vs the staged pipeline, same models - qwen3-30b, gemma-3-12b,
qwen3-coder-next, plus the incumbent gemini-2.5-flash-lite as reference. This is the
smallest experiment that answers the actual question: *does decomposition (not model choice)
improve affordable-model design quality?*

---

## 9. Evaluation: engineering validity and design quality never share a scorecard

**Objective regression gates (free, every run):** routing correctness against per-brief
expected routes; the structural-requirements check (intent parts present in the rendered
DOM); the full existing validator + bench; export validity; graphic-type/machine
correctness where declared. These gate merges and repair rounds. They are NEVER a quality
ranking - the sweep's inversion is the standing proof.

**Human design evaluation (the ranking that counts):** pairwise blind comparison - same
brief, two arms side by side, "which would you air?" plus per-item what-is-wrong notes -
using the existing blind-gallery + judgements.jsonl + bench:report agreement machinery.
Pairwise-per-brief replaces absolute scores because the calibration rounds showed score
deltas are noise while yes/no decisions are reliable. Axes for notes: hierarchy,
composition, broadcast suitability, originality (vs the catalog - the sameness metric's
nearest-house distance is the free proxy), typography, motion, overall. Reviewers: Mirko +
the student pool he wants to recruit; ~20+ joined items before any threshold talk, per §6e.

**The vision judge is not part of v1.** Its axes are documented broken (strapShape 5 on no
strap); production wiring needs in-app capture. When it returns, every axis is written as
inspection ("locate the elements, then ask what binds them") with absence as its first
failure, and it must earn agreement against the pairwise reviews before gating anything.

---

## 10. Cost and operation

Per CREATE generation at funded routes (<=$1.0/M in, $5.0/M out, the `fundedRoutePrice`
gate; measured Lite call ~1.3k in / 224 out ~= $0.0001):

| stage | shape | est. cost |
|---|---|---|
| intent | ~1.5k in / 300 out | ~$0.0002 |
| concepts | ~2k in / 700 out | ~$0.0003 |
| spec | ~2.5k in / 800 out | ~$0.0004 |
| style | ~4k in / 2-4k out | ~$0.002-0.004 |
| reference vision (only with uploads) | 1 call | ~$0.001 |
| repair (<=2, usually 0-1) | style-shaped | ~$0.002 |

Total ~$0.003-0.008 - versus the current custom path's single ~16k-token emit plus repairs,
and far under the harness's ~18.3k-token digest *per design call* (staged retrieval finally
removes that: the intent stage needs the type/category summary, not the whole listing).
Cheap-model affordability holds; different stages can bind different model classes through
task-profile route policy (structured-output models for 1/4/5, a coding model for 7, a VLM
only for references). Latency: stages are sequential but small; the medium call dominates,
so wall-clock stays comparable to today's custom path.

Free-tier note: the platform plan classed code generation as BYO/paid at launch. Creative
Mode's staged shape brings the cost into the free envelope, but *whether* free users get it,
at what quota, is an owner decision (§12).

## 11. The learning loop

Two tiers, matching the existing privacy split:

- **Content-free (server ledger, always on):** per stage - task id, prompt/schema versions,
  route, tokens/cost, outcome, structural-check pass/fail codes, route taken
  (adapt/create), concept index picked, discard reason. Extends the `ai_generations` ledger
  the Lite pattern already defined; feeds routing and stage-value statistics (each stage
  must EARN its place, per the doctrine - a stage that never changes outcomes gets cut).
- **Content-full (local-first, explicit opt-in to share):** brief -> StructuralIntent ->
  concepts (+ which was picked) -> CreativeSpec -> final code -> user verdict (kept /
  discarded / edited, plus edits diff), and pairwise review judgements. This is the future
  preference/repair/fine-tune dataset. Two rules: never collect grounded/catalog outputs as
  training material (they are NoaCG's own designs - training on them teaches copying, the
  exact failure this plan removes), and nothing content-full leaves the machine without the
  consent flow. The local telemetry ring + preferences.ts pattern is the storage shape.

## 12. Migration - incremental, grounded path untouched

- **Phase 0 - routing honesty (small, immediate product value, no new architecture).** Give
  the spec schema its escape (structural-intent fields + a fit that does not require a
  catalog category), rebalance the routing prompt, and pass the FULL spec into the coder
  instead of `designNotes`'s four strings. Re-run bench:harness (the rig is repaired and
  records `change.path`): the 12 off-catalog briefs should route custom at high rate.
  Cheap, reversible, and it de-risks the pilot's routing stage.
- **Phase 1 - the structural-requirements gate.** StructuralIntent v1 + the DOM check
  riding runtimeBench's iframe; wire into the repair loop on the custom route. This is the
  brief-satisfaction proxy that today does not exist anywhere, and it improves the CURRENT
  custom path before Creative Mode lands.
- **Phase 2 - the versus pilot.** Scaffold compiler for the versus/split family +
  CreativeSpec v1 + concepts stage + the bench arms and pairwise gallery (§8-9). Decision
  gate: pairwise human preference over the current custom path.
- **Phase 3 - widen.** More composition families (tower/board/strip are the sweep's proven
  gaps), reference analysis, concept picker in the wizard UI, learning-loop persistence.
- **Phase 4 - judged.** In-app hold-frame capture, the rewritten inspection-axis vision
  critique, promotion of Creative Mode routes/thresholds via the benchmark-first policy.

Each phase lands behind the task-registry flags; ADAPT and Lite behavior stay pinned by the
existing regress/bench identity tests throughout.

## 13. Risks and open owner decisions

Risks: scaffold expressiveness (a too-rigid scaffold reproduces the catalog-anchor problem
one level up - mitigated by the style stage owning bounded HTML, and by measuring
nearest-house distance); stage-count creep (the doctrine's answer: ai-compare-style
ablation, every stage earns its cost); cheap-VLM reference analysis quality (proposal-only
principles limit blast radius); structural-check false confidence (it measures presence,
not quality - the pairwise review stays the quality instrument); routing regressions on
catalog-fit briefs (the pilot bank's MUST-route-ADAPT case pins it).

Owner decisions for Mirko:
1. **Catalog gaps vs Creative Mode** - the timing tower he explicitly wants can be a new
   catalog type (days, guaranteed quality) independent of this plan; Creative Mode is for
   the unbounded tail. Recommend both; decide sequencing.
2. **Free-tier exposure** - does Creative Mode launch free-quota'd (the staged costs allow
   it) or BYO-first per the platform plan's class-C stance?
3. **Concept selection UX** - a real mid-flow pick (one more step, better data for the
   learning loop) vs auto-pick (frictionless). Recommend: pick when the alternatives
   checkbox is on, auto otherwise - mirrors the existing harness toggle.
4. **Paid pilot approval** - the Phase 2 bench round spends real tokens (rough order: 13
   briefs x 4 models x 2 arms ~ $1-3 at funded routes; estimate to be confirmed against
   measured usage before any run, per the standing spend rule).
5. **In-app capture investment** (Phase 4 dependency) - priority call.
6. The hairline/key-and-fill question stays DEFERRED per his 2026-07-29 ruling; the
   knowledge cards take no position until he rules.

## 14. Recommended follow-up implementation prompt

> NoaCG Studio - Creative Mode Phase 0+1 (routing honesty + the structural gate).
> Read docs/CREATIVE_MODE_PLAN.md §1-3 and §12, src/ai/AGENTS.md, and the harness-sweep
> findings in the lite-eval memory/docs first.
> Implement, in this order, each phase committed and verified separately:
> 1. Extend the design-spec schema so an off-catalog brief can be described honestly:
>    structural-intent fields (graphic kind, required parts incl. repeating rows bound to
>    list data, fields beyond 3 lines, needed states) and a fit/category shape that does not
>    force a catalog category on a custom route. Rebalance the routing prompt to ask the
>    structural question; keep the ADAPT path byte-identical (bench:regress and the Lite
>    identity tests must stay green).
> 2. Carry the full spec into the custom coder (replace designNotes) and stop inlining a
>    catalog design as the compositional example on the CREATE route - teach the structure
>    spine and engineering contracts with a neutral skeleton instead.
> 3. Add the structural-requirements check: verify the intent's required parts against the
>    rendered DOM inside the runtime-bench iframe, surface findings through the injected
>    validator so the shared repair loop consumes them.
> Verification: npm run build; the free bench rigs (no paid calls without explicit OK) -
> and prepare, but do not run, a bench:harness comparison of old-vs-new routing over the
> 12 off-catalog briefs with an expected-route table.
> Do not touch litePipeline compile behavior, the grounded assembly, or provider policy.

---

*Evidence basis: the 2026-07-29 full-harness sweep and Mirko's blind verdict (routing 6/48
custom; validity-vs-satisfaction inversion), the Lite benchmark rounds a-j and §6b-6e
(skins, framing, load ceiling, judge axes), the 2026-07-29 model comparison (three
open-weight models at parity with the incumbent on structured design calls), and the code
traces in §1 of this document.*
