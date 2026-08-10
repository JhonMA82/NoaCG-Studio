# NoaCG Pro - the open broadcast graphics specialist

**OWNER-APPROVED DIRECTION, PLAN ONLY. Implementation has not started.** This plan replaced the
image-guided reconstruction plan on 2026-08-10. Pro will become a narrow open-weight specialist for
premium HTML broadcast graphics, not an attempt to make an open model equal a frontier model at
general reasoning.

The old concept-image -> interpretation -> raster reconstruction path is retired as a product
direction. Its code and fixtures remain an experiment until an implementation slice removes or
archives them deliberately. Its evidence remains in `docs/AI_ATTEMPTS.md` and
`benchmarks/pro/round-2026-08-08/`, `benchmarks/pro/round-2026-08-09/` and
`benchmarks/pro/round-2026-08-10/`; this document does not rewrite that history. Approving this
direction does not reorder the Student release: implementation remains parked until it is
separately authorized.

This plan combines four mechanisms in one pipeline:

| mechanism | role in Pro |
| --- | --- |
| **2. Direct HTML generation by an open-weight model** | The model authors the actual visual HTML, CSS and SVG instead of describing a raster image that another model must reverse-engineer. |
| **3. A broadcast design grammar** | A transient plan gives the model a precise vocabulary for composition, typography, assets, motion and placement; deterministic compilers own SPX and runtime correctness. |
| **4. Retrieval and composition from design units** | The model starts from a small, relevant set of proven broadcast decisions rather than a blank page or one flattened template. |
| **5. A smaller fine-tuned specialist, eventually** | Accepted generations, failures and repairs become a licensed training set only after the system and evaluation harness prove what should be learned. |

These are not four competing architectures. They are stages in one system. The final artifact is
always an ordinary, clean `SpxTemplate`; no design plan, retrieval trace or model runtime is needed
to put it on air.

---

## 1. The claim and the boundary

**The claim:** a specialized open-weight system can match or outperform general frontier models
inside one small world: premium broadcast design, HTML/CSS/SVG, SPX operation, deterministic
motion, and render-and-repair.

That claim is plausible because the platform can remove most general reasoning from the model's
job:

- NoaCG supplies the field contract, SPX definition, animation runtime, state-machine semantics,
  control generation, asset packaging, safe canvas and validators.
- Retrieval supplies relevant, proven visual decisions instead of asking the model to rediscover
  broadcast design from first principles.
- The design grammar narrows an ambiguous brief into decisions that can be checked and compiled.
- Chromium shows the system what it actually made. Deterministic measurements and a separate
  visual critic localize defects; a bounded repair pass fixes the artifact rather than merely
  producing another answer.
- Fine-tuning eventually teaches the repeated successful transformations and repairs, not broad
  world knowledge.

This is a testable product hypothesis, not a guarantee. Success means parity on a predeclared,
blind, broadcast-graphics evaluation. It does not mean parity on coding benchmarks, conversation,
research, mathematics, arbitrary websites or general agent work.

### 1.1 Initial scope

Pro starts with **lower thirds** because that is the category with the deepest measurements, the
clearest placement contract and three paid rounds of failure evidence. It expands one graphic type
at a time only after that type has:

1. a declared field and structural contract;
2. deterministic SPX and state-machine compilation;
3. normal, long, empty and non-Latin content fixtures;
4. entrance, hold, update, next where applicable, exit and snap tests;
5. a category-specific blind quality round.

Likely expansion order is lower third -> info card and corner bug -> scoreboard and results board
-> multi-state graphics. Full-frame transitions, data-driven collections and arbitrary graphic
types are not silently included in a lower-third success.

### 1.2 Non-goals

- No general website or application generator.
- No attempt to reproduce a concept image pixel for pixel.
- No raster image as the graphic's hidden source of truth.
- No second persisted scene graph beside HTML/CSS/JS and `NOACG_ANIM`.
- No model-authored SPX dispatcher, control protocol or parallel animation runtime.
- No arbitrary JavaScript from the model in operator or lifecycle paths.
- No unbounded agent loop, autonomous paid cascade or silent fallback to a closed model.
- No fine-tune before the base system, evaluator and data provenance are sound.
- No claim of frontier parity from machine scores alone or from one 12-brief round.

---

## 2. Non-negotiable output contract

The specialist may own taste. The platform continues to own engineering.

### 2.1 Code and SPX

- The result is one normal `SpxTemplate`: readable HTML, CSS and JS plus its parsed definition.
- Each live field maps to its visible `id="fN"`; `update(data)` changes the painted graphic.
- `play()`, `stop()`, `next(data)` and `update(data)` retain the repository's SPX semantics.
- Data never causes a state transition. Events and timers follow the structural state-machine
  contract. `steps` remains derived from the default path.
- Operator controls are generated from fields and the machine. Pro does not write a special
  control panel or per-template command language.
- Dependencies, fonts and assets are local and exportable. Generated code contains no CDN or
  runtime network dependency.
- The output validates and operates in the same editor, preview, export and control surfaces as a
  hand-authored template.

### 2.2 One final 1920x1080 coordinate system

The graphic is designed in its production coordinate system from the first authored element:

- The canvas is a transparent 1920x1080 stage.
- The graphic's settled bounding box is already at its final sharp size and final coordinates.
- There is no operator transform required after generation and no root `--scale` used to make the
  composition fit.
- CSS and SVG are authored at final design-pixel dimensions. They do not have a raster-resolution
  problem.
- Raster user assets preserve aspect ratio and source pixels. They may downscale with an explicit
  asset fit, but never visibly upscale or stretch. An asset too small for the chosen use fails
  honestly or causes the platform to choose a smaller supported placement.
- Text, logos, masks, decorative geometry and motion share the same coordinates. A repair cannot
  move one layer while leaving its related mask, hit area or animation origin behind.

The model chooses **semantic composition intent** and may propose integer pixel bounds. The
platform resolves and clamps that proposal against the category, safe area, text capacity and
asset resolution. This keeps aesthetic placement with the specialist while making exact production
geometry deterministic.

### 2.3 Safe authorship regions

The platform emits the complete structural scaffold. The model may author or patch only marked
creative regions:

- semantic visual HTML inside the graphic root;
- CSS custom properties and selectors for those visual elements;
- inline or bundled SVG using the approved feature set;
- approved timeline/keyframe declarations through the motion grammar.

The model does not directly edit the SPX definition, field wiring, `NOACG_ANIM` interpreter,
control receiver, export glue or security markers. Changes to those areas happen only by changing
the structured plan and recompiling them deterministically.

---

## 3. The architecture

```text
brief + fields + brand + assets
        |
        v
structural intent and supported-type route
        |
        v
ONE shared retrieval engine -> relevant design units and complete exemplars
        |
        v
open planner -> transient BroadcastDesignPlan
        |
        v
deterministic SPX scaffold + motion/state compiler
        |
        v
open code author -> creative HTML/CSS/SVG regions
        |
        v
render all test states at 1920x1080
        |
        +-> deterministic measurements
        +-> independent open visual critic
        |
        v
bounded code repair, maximum two rounds
        |
        v
production validation -> ordinary SpxTemplate -> editor/export/control
```

There is one pipeline and one result. The planner and coder may initially be the same open-weight
checkpoint with separate contexts, but the roles remain separate contracts so the best model for
each can be selected later. The visual critic should be a different checkpoint or, at minimum, an
independent context that never sees the creator's self-assessment.

### 3.1 Who owns each decision

| decision | owner |
| --- | --- |
| requested graphic type, fields and content roles | structural intent proposes; supported-type registry decides |
| relevant examples and design units | the existing retrieval engine over declared metadata |
| hierarchy, composition, shape language, palette and visual rhythm | open planner and code author |
| exact safe bounds, asset pixel limits and final canvas placement | planner proposes; deterministic normalizer decides |
| field ids, SPX definition and update wiring | platform compiler |
| state shape, lifecycle semantics and control legality | supported graphic type plus platform compiler |
| entrance character, sequencing, masks, stagger and easing | model through the motion grammar |
| GSAP/runtime implementation and snap behavior | platform compiler |
| correctness, overflow, asset safety and exportability | deterministic validators |
| visible polish findings | independent open visual critic, calibrated by humans |
| whether the result is good enough to claim parity | blind human evaluation |

### 3.2 The two authoring lanes are one system

Direct HTML generation and a design grammar can look contradictory. The resolution is deliberate:

1. The open planner emits `BroadcastDesignPlan`, which describes intent and relationships.
2. A deterministic compiler creates the full SPX scaffold and marked creative regions.
3. The open code author writes the actual semantic HTML, CSS and SVG for those creative regions.
4. Motion intent compiles through the existing timeline/state vocabulary.
5. Repairs patch only the failing creative region or revise a plan value and recompile.

This keeps direct code generation expressive enough for premium work while preventing the model
from repeatedly spending reasoning on boilerplate or breaking operator behavior. The transient plan
is not saved as another editable format. Once code is emitted, code is the source of truth.

---

## 4. `BroadcastDesignPlan` - the transient grammar

The grammar is a versioned wire contract between planner and compilers. It is normalized and then
discarded. Unknown versions fail honestly; they are never guessed into the current shape.

It must express relationships that the retired rectangle reconstruction schema could not:

### 4.1 Composition

- fixed canvas: 1920x1080, transparent;
- graphic type and supported structural anchor;
- safe-area-relative placement intent plus proposed integer design-pixel bounds;
- compact, standard and wide capacity classes;
- horizontal anchor, vertical band and growth direction;
- layer groups, stacking, alignment, gaps, padding and optical offsets;
- rectangular, rounded, angled, polygonal and path-based silhouettes;
- clipping paths, masks, strokes, dividers, underlines and accent rails;
- solid, gradient, translucent and glass-like surfaces within engine support;
- image and logo slots with fit, crop, focal point and minimum source-resolution rules.

Placement values are not normalized concept-image coordinates. They are final canvas pixels or
semantic anchors resolved once into final canvas pixels.

### 4.2 Typography

- semantic roles such as eyebrow, primary, secondary, score and metadata;
- bundled font family, weight, size, line height, tracking, case and numeric treatment;
- hierarchy relationships rather than unrelated font-size guesses;
- maximum lines, fit policy, minimum type floor and empty-field behavior;
- width growth and truncation rules where the graphic type permits them;
- foreground/surface relationships for deterministic contrast inspection.

The platform owns the fit implementation. The model chooses the hierarchy and capacity it is
designed to support.

### 4.3 Brand and visual system

- one dominant palette with role-based tokens;
- brand mark treatment and reserved clear space;
- surface, accent and decoration families;
- corner, stroke, shadow and depth tokens;
- declared compatibility between units so retrieval cannot assemble unrelated visual languages.

### 4.4 Motion

- entrance, hold, update, step and exit beats;
- per-layer reveal order and relative timing;
- transforms, opacity, clips, masks, wipes, staggers and approved transition styles;
- duration, easing, motion origin and reduced-motion behavior;
- explicit initial, settled and exit poses;
- optional state and event intent only within the supported state-machine schema.

The compiler emits the existing `NOACG_ANIM` format and runtime. The model never emits its own
event queue, timers or lifecycle globals. Motion that the grammar cannot represent is unsupported,
not smuggled into arbitrary JavaScript.

### 4.5 Expressiveness gate

The grammar is not accepted because its schema validates. Before an element is added, the harness
must prove that the compiled result can reproduce a small human-authored reference set covering
angled panels, layered accents, masks, logo slots, type growth and multi-phase motion. If designers
must fight the grammar or insert opaque escape hatches, the vocabulary is too weak and must be
extended before model evaluation.

---

## 5. Retrieval and composition from design units

Pro extends the repository's **one shared retrieval system**. It does not build a second vector
store, catalog ranking engine or design-family format.

### 5.1 The corpus

The searchable corpus contains two kinds of source:

- complete, proven catalog variants for coherent chassis and operator structure;
- curated design units extracted from owned or appropriately licensed source code.

A design unit is code plus metadata, not a screenshot and not a hidden scene model. Initial unit
roles are:

- silhouette and layout skeleton;
- typography hierarchy;
- panel or reading-surface treatment;
- accent and decorative motif;
- logo or image treatment;
- entrance, reveal, update and exit motion motif.

Every unit has a stable id, version, provenance, license, supported graphic types, capacity,
placement, engine floor, required fields, style-family tags and compatibility tags. A changed unit
is a new version so a benchmark remains reproducible.

### 5.2 Retrieval behavior

The existing brief terms, `TemplateMeta`, structural anchor and catalog search produce a small,
diverse shortlist. Pro adds unit metadata to that same index and ranking path. It does not paste the
whole catalog into a prompt.

The shortlist should contain:

- one to three structurally compatible complete exemplars;
- a small set of compatible units for roles the brief emphasizes;
- at least one deliberately different but still relevant visual family when available;
- provenance and a human-readable reason for every result.

Retrieval is deterministic for a fixed corpus and query. Model choice happens over the shortlist,
not over an unbounded catalog dump.

### 5.3 Coherence over collage

Retrieval must not create a Frankenstein graphic. Composition follows these constraints:

- one dominant chassis or layout skeleton owns the composition;
- one typography system owns the hierarchy;
- secondary units may fill only declared compatible roles;
- palette, radii, stroke, depth and motion tokens are unified before code generation;
- incompatible placement, capacity, engine or field requirements are rejected before the model
  sees them;
- the plan records which units were used, transformed or rejected for evaluation and provenance.

The model is expected to transform units, not copy a finished template and recolor it. Evaluation
measures both coherence and distance from the selected exemplar.

### 5.4 Diversity without randomness

The harness records dominant chassis, unit and style-family concentration. A route that passes by
putting most briefs on one safe design has not met the Pro promise. Diversity is measured across a
brief set, but no per-generation random novelty rule may force a worse design. Relevant alternatives
come from retrieval; taste chooses among them.

---

## 6. Render, inspect and repair

The current repository can validate structure and measure rendered geometry. Pro adds a first-class
visual inspection loop around those existing systems.

### 6.1 The render set

Every candidate renders in Chromium at 1920x1080 with transparency made visible by a neutral
checkerboard. The harness captures at least:

- initial/off pose;
- entrance samples and settled hold;
- normal field values;
- long values at declared capacity;
- empty optional values;
- non-Latin and difficult numeral values;
- update while on air;
- each reachable default-path step and supported branch state;
- exit and snapped recovery pose.

The exact set is derived from fields and the state machine so a complex graphic cannot receive the
same shallow inspection as a two-field lower third.

### 6.2 Deterministic gates

Before visual judgement, a candidate must pass:

- template validation, SPX definition and runtime pairing;
- runtime exceptions and external-network screening;
- field coverage through real `update()` calls;
- state, event, timer, default-path, snap and control reachability;
- canvas bounds, safe-area and settled alpha-bounds checks;
- self-clipping, overflow, long-text capacity and minimum type floors;
- logo/image containment, aspect ratio and source-resolution checks;
- font and asset availability, export paths and engine compatibility;
- motion duration, stuck pose, large-frame jump and performance checks.

A critical deterministic failure rejects the candidate before it can be ranked as visually good.

### 6.3 Independent open visual critic

The critic receives the brief, relevant brand input, rendered state contact sheet, alpha view,
declared design plan and a DOM overlay naming elements. It returns localized findings, not one
opaque score:

- severity and category;
- affected state and element ids;
- image-space region and visible evidence;
- expected relationship;
- whether the issue is repairable in plan, HTML, CSS, SVG or motion.

It inspects hierarchy, composition, spacing, optical alignment, brand handling, legibility over
video, visual coherence, accidental artifacts, motion continuity and whether the brief is actually
answered. It may not declare structural correctness or edit code directly.

The critic is calibrated against broadcast-designer labels. Agreement, false-negative rate on
seeded defects and false-positive rate on accepted catalog graphics are recorded per pinned model
version. If it misses known critical defects, its pass is advisory and cannot ship a candidate.

### 6.4 Bounded repair

The code repairer receives only the failing evidence, relevant source regions and allowed patch
contract. It gets at most **two rounds**:

1. patch the smallest responsible creative region or revise a normalized plan value;
2. recompile if needed, render every affected state, and rerun all gates;
3. keep the patch only if the stated defect improves without a new regression.

A repeated finding, no measurable improvement or new critical failure stops the loop and rejects
the candidate. Regenerating indefinitely is not repair.

### 6.5 Candidate count

The research harness starts with one candidate so model and compiler failures remain diagnosable.
Best-of-two generation becomes the intended quality mode only if an ablation proves that it
materially improves blind airability. The system gates both, the critic ranks the survivors and
repairs only the winner. More than two requires separate evidence and a cost/latency decision.

---

## 7. Open-model strategy

### 7.1 What "open" means here

A production Pro route must use a checkpoint whose weights are downloadable, whose exact version
is pin-able, whose license permits the intended commercial deployment after review, and which can
be self-hosted. A hosted inference service is acceptable during development or managed operation
only when it serves that same identifiable open-weight checkpoint. "Open API" without available
weights does not qualify.

Closed frontier models may be paid **evaluation baselines only**, with explicit approval for each
round. They are not runtime fallbacks, hidden teachers or required infrastructure. Training data is
owned, licensed, human-authored or explicitly opted in; it is not silently distilled from closed
model outputs or customer graphics.

Open-weight does not mean small, local or cheap. The strongest initial checkpoint may require a
remote multi-GPU host. Local deployment is a goal of the later specialist, not a false constraint
on the quality experiment.

### 7.2 Capability tournament

Model names change faster than this architecture. Before implementation pins a route, candidates
are tested on:

- structured planning and schema adherence;
- HTML/CSS/SVG quality and disciplined patching;
- long-context use of retrieved examples without copying;
- tool use and recovery after compiler/validator errors;
- visual understanding for a separate critic candidate;
- deterministic decoding controls, latency, throughput, hosting availability and license;
- exact cost per accepted output, including failed candidates and repairs.

Planner, coder, repairer and critic are independent route roles. One checkpoint may win several
roles; no plan assumption requires that. Routes and prompt/grammar versions are pinned in every
fixture and round.

### 7.3 Quality before inference optimization

The first route is the strongest open-weight combination that satisfies the license and can run
the harness. Development cost and inference convenience do not outrank visible quality. After
parity is demonstrated, distillation, quantization, caching and smaller checkpoints may reduce
cost and latency, but each optimization reruns the locked quality gate.

---

## 8. Evaluation - what "Opus-level" means

The claim is about the complete specialist system, not raw model intelligence. The comparison is
therefore final rendered graphics produced from the same briefs under declared, bounded workflows.

### 8.1 Evaluation sets

- **Development bank:** visible briefs spanning broadcast genres, field shapes, brand inputs,
  capacity stress, logo/image cases and motion requests. Used for engineering, never for the final
  claim.
- **Locked holdout:** unseen brief families and brands, stored separately and opened only for a
  declared round. Minimum 40 joined items for a parity read; the final sample size is set by a
  power calculation before the round.
- **Adversarial bank:** long names, empty optional fields, literal `undefined`/`null`, multiline
  values, non-Latin text, difficult logos, low-resolution assets, extreme but valid brand colors,
  interrupted events and state recovery.
- **Category banks:** a new type receives its own holdout and cannot inherit a lower-third verdict.

Fixtures record brief, inputs, retrieval ids, plan, model/checkpoint hashes, prompts, code, every
rendered state, measurements, critic findings, repairs, usage, cost and human verdict.

### 8.2 Comparison arms

At minimum, a quality round compares:

1. the strongest open Pro system;
2. the best current closed frontier baseline available through the same scaffold, tools, render
   evidence and maximum repair count;
3. the existing adapt-first product baseline.

The open system may use retrieval and specialization because those are the product. The baseline
receives the same NoaCG structural compiler and validation opportunities so the comparison does not
confuse broken boilerplate with design intelligence. All output galleries are blinded and shuffled.

### 8.3 Human judgement

At least three independent reviewers with broadcast-design competence rate each joined item. The
primary question is: **would you take this graphic to air after entering content and brand, without
redesigning it?** Supporting reads cover:

- brief and field correctness;
- premium visual quality and originality;
- typography and information hierarchy;
- composition and production placement;
- brand and logo handling;
- motion quality and state continuity;
- code/editability sampling after the visual verdict.

Reviewers see the rendered result and behavior before machine findings or model identity. Ties are
allowed. Disagreements are retained, not forced into consensus.

### 8.4 Release gates

Lower-third Pro does not enter product beta until all are true on the locked holdout:

- 100% export-valid, field-operable and control-operable results among accepted outputs;
- zero known baked-text ghosts, missing requested assets, visible upscaling, stretch, off-canvas
  placement or unresolved critical critic finding;
- at least 90% of supported holdout briefs return an accepted candidate without a manual repair,
  manual selection or user-triggered rerun;
- at least 95% accepted outputs judged airable after content and brand entry;
- blind preference is statistically non-inferior to the frontier baseline within a predeclared
  five-percentage-point margin, with no material loss in motion or editability;
- it materially beats adapt-first on distinctiveness without losing adapt-first's correctness;
- cost, latency, failure and retry distributions are published with the result.

If a round misses, the failure taxonomy decides the next change. Re-rolling the same model and
calling the better sample progress is not allowed.

### 8.5 Ablations

Every major mechanism must earn its complexity. The harness compares:

- direct open code without grammar vs grammar plus deterministic scaffold;
- full exemplars only vs exemplars plus design units;
- no critic vs critic only vs critic plus repair;
- one candidate vs best of two;
- base open checkpoint vs later specialist fine-tune.

An ablation uses identical briefs and pinned routes. A component that does not improve blind
airability, correctness or diversity is removed rather than defended by theory.

---

## 9. Delivery plan and stopping gates

No phase is scheduled by optimism. Each begins only when the prior phase's artifact and gate are
complete. Work remains bench-only until Phase 5.

### Phase 0 - freeze the evaluation contract

**Build:** the rubric, development bank, locked holdout process, fixture manifest, human review
form, cost ledger and frontier/adapt baseline procedure. Reclassify the existing paid Pro rounds as
historical reconstruction evidence, not baselines for the new architecture.

**Gate:** a dry run can reproduce shuffled galleries, join machine and human results, detect seeded
defects and prevent holdout leakage. No model spend is needed to build it.

**Stop if:** parity cannot be defined independently of model identity or reviewers cannot agree
enough to support a useful decision.

### Phase 1 - deterministic production spine and grammar

**Build:** `BroadcastDesignPlan`, normalization, final-canvas placement, SPX scaffold compiler,
safe creative regions, motion/state compilation and reference implementations authored by humans.
Use existing `blocks`, `validation`, catalog geometry, state-machine and control systems; do not put
a compiler in React or persist the plan.

**Gate:** the reference set compiles to readable code, survives editing/export, updates every field,
runs every state/control, passes long/empty/non-Latin cases and matches its approved 1920x1080
renders. No root scaling and no visible asset upscale occur.

**Stop if:** the grammar needs arbitrary-JS escape hatches or becomes a second editor model.

### Phase 2 - open direct author

**Build:** a bench-only planner/coder/repair route contract, open-checkpoint tournament and
fixture-saving harness. Start with one candidate and no visual repair so failure ownership is clear.

**Gate:** on the development bank, the best open route produces a high majority of structurally
valid candidates, the visual code is genuinely more expressive than the old rectangle compiler,
and failures are localizable to planner, compiler or coder.

**Stop if:** no available open checkpoint can follow the bounded contracts even with retrieved
examples. Keep the plan and revisit models later rather than weakening SPX safety.

### Phase 3 - retrieve and compose design units

**Build:** provenance-safe unit extraction, metadata, compatibility rules and integration with the
existing retrieval engine. Human designers approve the first corpus. The model cites its selected
units and transformations in the transient trace.

**Gate:** a paired ablation shows higher human-rated taste and broader design-family distribution
than direct generation alone, without greater structural failure or obvious source copying.

**Stop if:** outputs become incoherent collages or retrieval merely selects one whole template and
changes its colors.

### Phase 4 - visual critic, repair and frontier comparison

**Build:** state contact sheets, deterministic visual measurements, calibrated open critic, bounded
repair and optional best of two. Seed a defect suite containing the exact historical failures:
baked text, duplicate fields, wrong scale, lost logo/portrait, mismatched masks, bad paint order,
unsafe placement and overflow.

**Gate:** the critic meets its calibrated critical-defect recall, repair improves blind airability
without increasing regressions, and the locked comparison meets the release gates in section 8.4.

**Stop if:** critic and creator reward each other's artifacts while humans do not, or repair success
depends on more than two rounds.

### Phase 5 - product beta

**Build:** Pro behind the existing Create with AI tier picker, using the shared gateway, telemetry,
entitlement and BYO/self-host paths. The user sees generation, render, inspection and repair status;
the accepted result enters the normal editor/export flow. A critical gate failure returns no result
and a specific reason. There is no concept-image card or separate Pro editor.

**Gate:** focused E2E, production SPX/CasparCG/OBS walkthroughs, build and CI; operational limits
cover concurrency, timeout, model unavailability and cost. No closed fallback exists.

**Stop if:** hosting economics require hiding the real price, or product behavior differs from the
bench harness that earned the quality claim.

### Phase 6 - fine-tune the specialist

This is mechanism 5 and deliberately comes last.

**Entry gate:** do not start a deployment fine-tune until there are at least 1,000 de-duplicated,
licensed, human-reviewed accepted traces and 2,000 localized repair or rejection examples across
the supported variation. A smaller research adapter may start after 500 accepted traces, but it
cannot replace the base route from that evidence alone.

**Dataset record:** brief, structured fields, brand and asset metadata, retrieved unit ids,
normalized plan, code, all state renders, deterministic findings, critic findings, human ratings,
rejected alternatives and successful repairs. Customer content is excluded unless explicitly
opted in and suitable for that use.

**Training sequence:**

1. supervised fine-tuning for brief + retrieval -> plan and plan + scaffold -> creative code;
2. a repair curriculum using real failures plus deterministic adversarial mutations;
3. preference training from blinded accepted/rejected pairs;
4. a separately trained or calibrated critic on localized visual findings;
5. quantization and serving optimization only after quality parity.

The planner/coder and critic do not need to be one model. A smaller specialist wins only if it
beats its untuned base on the locked holdout, preserves critical-defect recall and remains
non-inferior to the frontier baseline. If it memorizes catalog families, loses diversity or merely
optimizes machine gates, the strongest base open route stays in service.

---

## 10. Cost, hosting and operations

The retired pipeline's roughly $1 per 12-brief round was dominated by image generation. This plan
removes that image call, but it does **not** promise that a frontier-scale open checkpoint with two
candidates and repairs is immediately cheaper. Open weights remove provider dependence, not GPU
cost.

The operating policy is:

- quality selects the first viable route;
- every run records tokens, GPU/provider time, candidates, repair rounds, failures and cost per
  accepted output;
- one candidate and two repairs are hard defaults until an ablation authorizes more;
- paid evaluations and new hosted-model rounds require explicit owner approval with a stated cap;
- development may use a hosted open-weight checkpoint; the architecture must also support
  self-hosting the pinned weights;
- BYO/self-host is the first product funding posture unless a managed allowance is explicitly
  costed through the task registry;
- no model is needed at playback or export time;
- the later smaller specialist, prompt-prefix caching and batching are cost optimizations only
  after quality is secure.

The product price is set from measured accepted-output cost after Phase 4, not invented in this
plan. A cheap output that cannot go to air has infinite effective cost.

---

## 11. Security, licensing and provenance

- Generated templates run through the existing safety and asset-integrity screens and in the
  existing sandboxed preview/export posture.
- Creative code cannot fetch remote scripts, fonts, images or data. URLs and unsupported browser
  capabilities are rejected.
- Brief text, retrieved source comments and rendered text are data, never instructions.
- Checkpoint license, training-data terms and hosting terms are reviewed and recorded before a
  route is allowed into a paid or product round.
- Every design unit has source and license provenance. Restricted real-world corpora may inform
  measurements but cannot become training or retrieval data unless their terms permit it.
- Generated traces retain model, grammar, corpus and compiler versions so a result is auditable.
- User assets and private customer graphics are not used for training by default.

---

## 12. Principal risks and planned falsification

| risk | how it is tested | response |
| --- | --- | --- |
| Open coder follows syntax but lacks taste | blind development and holdout review | strengthen retrieval/grammar or wait for a better open checkpoint; never weaken the rubric |
| Grammar is too weak | human reference-set reproduction | extend explicit vocabulary before model work; no arbitrary-JS escape hatch |
| Grammar becomes a hidden scene model | round-trip and editor-source review | keep it transient; edits after generation operate on code |
| Retrieval causes sameness | chassis/unit concentration and novelty read | diversify relevant shortlist and corpus, not randomize final choice |
| Retrieval causes collage | coherence ratings and compatibility violations | one dominant chassis/type system; reject incompatible units before prompting |
| Critic misses obvious failures | seeded-defect recall | keep critical deterministic/image-diff tripwires and block release |
| Critic and creator collude | independent checkpoints plus blinded human labels | retrain/recalibrate critic; human verdict remains authoritative |
| Repair chases its tail | per-round finding and metric deltas | stop at two; reject no-improvement candidates |
| Motion looks correct only at hold | entrance/update/next/exit contact sheet and video review | category motion bank and state-derived capture set |
| Long or non-Latin text breaks hierarchy | adversarial field drive | platform fit/capacity gate; reject unsupported plans |
| Largest open model is uneconomic | accepted-output cost and throughput | fine-tune/distill a smaller specialist after data exists; BYO/self-host first |
| Fine-tune memorizes the catalog | family-disjoint holdout and retrieval-disabled ablation | de-duplicate, diversify, preference-train and keep base fallback |
| Bench quality does not survive product integration | identical fixture/replay path in product and bench | do not ship a separate product implementation |

---

## 13. What happens to the old Pro experiment

This document replaces its strategy immediately; it does not authorize code deletion in this
planning slice.

When implementation begins:

1. mark the raster reconstruction route retired in the AI area contract and attempt record;
2. keep its paid round folders immutable as evidence;
3. reuse generic gateway, telemetry, fixture and validation infrastructure only where it fits the
   new contracts;
4. remove Pro-specific concept, interpretation and reconstruction code once no test or migration
   needs it;
5. update `docs/GOALS.md`, `src/ai/AGENTS.md`, architecture edges and task registry in the same
   implementation phase that changes their live truth;
6. preserve the standard Create with AI entry and ordinary editor/export destination.

No new work or spend should improve the retired reconstruction path.

---

## 14. First future slice

The first implementation slice, when separately authorized, is **Phase 0 only**: write the locked
evaluation contract and fixture manifest, seed the historical defect bank, and establish the
frontier/adapt comparison procedure. It makes no model call and changes no product path.

Only after that review should Phase 1 define `BroadcastDesignPlan` and compile human-authored
references. This ordering is intentional: NoaCG must decide what premium, correct and airable mean
before optimizing any model to produce it.
