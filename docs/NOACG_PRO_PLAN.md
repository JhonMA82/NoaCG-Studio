# NoaCG Pro - the open broadcast graphics specialist

**OWNER-APPROVED DIRECTION AND ACTIVE ROADMAP.** This plan replaced the image-guided
reconstruction plan on 2026-08-10; on 2026-08-11 the owner promoted it from parked to active, with
**Phase 0 as the next implementation slice**. Pro will become a narrow open-weight specialist for
premium HTML broadcast graphics, not an attempt to make an open model equal a frontier model at
general reasoning.

The old concept-image -> interpretation -> raster reconstruction path is retired as a product
direction. Its code and fixtures remain an experiment until an implementation slice removes or
archives them deliberately. Its evidence remains in `docs/AI_ATTEMPTS.md` and
`benchmarks/pro/round-2026-08-08/`, `benchmarks/pro/round-2026-08-09/` and
`benchmarks/pro/round-2026-08-10/`; this document does not rewrite that history. Phase 0 is
bench-only and touches no Student release surface; product integration (Phase 5) still queues
behind the Student release. Every paid round, including the Phase 0 spike, still needs an explicit
owner OK with a stated cost cap before tokens burn.

This plan combines four mechanisms in one pipeline:

| mechanism | role in Pro |
| --- | --- |
| **2. Direct HTML generation by an open-weight model** | The model authors the actual visual HTML, CSS and SVG instead of describing a raster image that another model must reverse-engineer. |
| **3. A minimal broadcast intent contract** | A small transient plan carries only structural decisions NoaCG must compile; HTML/CSS/SVG remains the creative design language. |
| **4. Retrieval from excellent complete exemplars first** | The model starts from a few relevant, proven graphics. Decomposed design units are added only if an ablation earns them. |
| **5. A smaller fine-tuned specialist, eventually** | Accepted generations, failures and repairs become a licensed training set only after the system and evaluation harness prove what should be learned. |

These are not four competing architectures. They are stages in one system. The final artifact is
always an ordinary, clean `SpxTemplate`; no design plan, retrieval trace or model runtime is needed
to put it on air.

---

## 0. First falsification - does an open model already have the eye?

> **RUN 2026-08-12. OWNER VERDICT: GO, with logos as the named gap.** `moonshotai/kimi-k3`, 20 of
> 24 generations captured, $4.58 on the round's own ledger. The owner's read of the blind gallery:
> *"the graphics are fine if we can create this quality"*, plus two named defects (one strap's
> panel not aligned to its own accent line; one near-identical pair judged simple but acceptable)
> and one named gap: **there is no structure or plan for how a brand mark is placed so it fits the
> design, nor for animating it meaningfully and smoothly.** That gap is also the one defect every
> deterministic gate passed - the `portrait-logo` brief rendered a broken-image icon with its alt
> text showing. §0.3's transfer test went the right way: the no-exemplar arm completed 12 of 12 and
> was judged indistinguishable from the exemplar arm on the pair the owner singled out, so the pass
> is not paraphrased catalog taste - and the exemplar block has not yet earned its ~34,500 tokens.
> **Both planned checkpoints ran.** `alibaba/qwen3-coder` completed the identical protocol **24 of
> 24, all contract-clean, for $0.263** - against kimi-k3's 21 of 24 at $5.032, about 19x cheaper and
> more complete, because it spends no reasoning tokens and so never truncated or timed out. Neither
> checkpoint is separated by CAPABILITY; which of them designs better is a human comparison still
> to be made. kimi-k3's exemplar arm stopped at 9 of 12: two briefs never completed across four
> attempts, and `corporate.exemplar` truncated at both the 17,000 and 25,000 token ceilings.
> Full record: `docs/AI_ATTEMPTS.md`; archives `pro-phase0-kimi-k3-complete-2026-08-12/` and
> `pro-phase0-qwen3-coder-2026-08-12/`.

Before building a grammar, unit corpus, model tournament, visual critic or formal parity harness,
run one deliberately small research spike. Its only question is:

> When a strong open-weight model receives a good brief, a minimal NoaCG scaffold and a few
> excellent complete exemplars, does its rendered HTML show enough broadcast-design judgement to
> justify building the specialist system around it?

This is an early go/no-go experiment, not evidence of frontier parity and not a product prototype.

### 0.1 Reuse, do not build a second pipeline

The spike should be a thin bench-only wrapper over systems that already exist:

- before any token is spent, push one known-good hand-authored lower third through the complete
  wrapper - scaffold, render set, gates and gallery - as a zero-token control; if the control
  looks broken, the harness is broken. Two paid rounds have already been mis-read as model
  failure when the platform was at fault, so the control rerun is mandatory after any wrapper
  change;
- start from the existing 12-brief lower-third bank, adjusting only inputs that were specific to
  raster reconstruction; those 12 briefs are the complete run and the section 0.3 denominators;
- use `structuralIntent` and the lower-third type contract for fields and supported structure;
- use `creative/neutralSkeleton.ts` or an equivalently minimal generated scaffold for the root,
  field ids, style variables and authoring-region contract;
- run every brief through two arms: one with two or three excellent **complete** lower-third
  exemplars retrieved through `shortlistFor` (which already reuses `templates/search.ts`,
  `TemplateMeta` and the one structural-anchor table), and one with no exemplars at all. The
  no-exemplar arm is what separates the model's own eye from paraphrased catalog taste; without
  it a pass could be mostly transfer;
- make one initial call per brief and arm to a strong, pinned, commercially usable open-weight
  checkpoint, with decoding parameters pinned in the fixtures; a second pinned checkpoint may run
  the same protocol (section 0.3), never more than two;
- use the existing `shared/repairLoop.ts` maximum of two rounds for deterministic blocking
  findings only;
- validate through `productionSpxValidator`: `validateTemplate`, `benchTemplateRuntime`, safety
  and asset-integrity checks;
- render through `composeDocument` at 1920x1080 and reuse the fixture, screenshot, result-ledger
  and review-gallery patterns in `pro-bench.mjs` and `ai-bench.mjs`. One piece is new build, not
  reuse: virtual-clock scrubbing today lives only in the render compose path
  (`src/render/runtimeScript.ts`); the wrapper must wire it into the bench render for the motion
  strips, and the zero-token control run is what proves that wiring.

The spike does not need `BroadcastDesignPlan`, a visual critic, decomposed design units, best of
two, a new retrieval index, a new repair loop or product wiring. The wrapper either graduates into
the later harness or is deleted after recording the result.

### 0.2 What humans inspect

Every result is rendered at its actual final placement over neutral and video-like backgrounds.
Review the settled hold, entrance, update and exit, with normal and stress text. Motion is
reviewed from sequences captured through the virtual clock - the timeline scrubbed to fixed
timestamps for entrance, update and exit strips - because headless GSAP does not visibly tick on
requestAnimationFrame; a spike that inspects only settled holds has not reviewed motion. The
review gallery blind-mixes a few adapt-first outputs and strong catalog graphics among the
candidates, so "coherent, deliberate composition" is judged against visible anchors rather than
cold. The human notes are written **before** revealing the validator verdict or which arm and
checkpoint produced each result, so a green machine result cannot frame a broken graphic as
successful.

The read is intentionally direct:

- Does it show deliberate hierarchy, proportion, spacing and composition?
- Does it look like a real broadcast graphic rather than a tutorial component?
- Did it transform the exemplars into an appropriate answer instead of copying one?
- Does the motion support the composition?
- Would local CSS/SVG polish finish it, or would a designer have to start over?

### 0.3 Go/no-go rule

With a 12-brief run, continue only if human inspection finds all of the following:

- at least 6 results show a coherent, deliberate broadcast composition worth refining;
- at least 3 are airable or one localized repair away, not a redesign away;
- the set contains at least 3 genuinely different visual directions rather than one safe slab;
- at least 9 of 12 preserve the scaffold and live-field contract after the existing bounded repair
  loop;
- the promising results are not near-copies of an exemplar.

The gate is read on the exemplar arm of the better checkpoint. The no-exemplar arm does not have
to pass anything; it exists to interpret the pass. An exemplar arm that clears the gate while the
no-exemplar arm collapses into incoherence is a transfer result, not evidence of taste - treat it
as ambiguous, not as go. These thresholds answer only whether there is enough visual signal to
invest in the system. They do not establish a product success rate, a release bar or statistical
parity.

If the spike is clearly below the gate, stop. Record the renders and failure taxonomy, then revisit
only when a materially stronger open checkpoint or a specific falsifiable technique exists. Do not
build the grammar, unit architecture or critic in hope that infrastructure will manufacture taste.
If the result is narrowly ambiguous - because the chosen endpoint cannot follow the scaffold,
because taste sits just under the gate, or because the pass reads as transfer - the second pinned
checkpoint answers it. Two checkpoints are the ceiling; a third requires a new planning decision.
That is endpoint diagnosis, not an open-ended prompt program.

Estimated spend: 12 briefs, two arms, up to two checkpoints, inside the existing two-round repair
ceiling, is on the order of $5-15 at current hosted open-weight pricing - the flat concept-image
call that dominated the retired pipeline's cost does not exist here. The exact route and cap are
still approved explicitly, with the estimate restated, before the round runs. This document
schedules the spike; it does not authorize the spend.

---

## 1. The claim and the boundary

**The claim:** a specialized open-weight system can match or outperform general frontier models
inside one small world: premium broadcast design, HTML/CSS/SVG, SPX operation, deterministic
motion, and render-and-repair.

That claim is plausible because the platform can remove most general reasoning from the model's
job:

- NoaCG supplies the field contract, SPX definition, animation runtime, state-machine semantics,
  control generation, asset packaging, safe canvas and validators.
- Retrieval first supplies a few complete, excellent graphics instead of asking the model to
  rediscover broadcast design from first principles.
- A deliberately small intent contract carries only relationships the platform must compile;
  HTML/CSS/SVG keeps creative expression open.
- Chromium shows the system what it actually made. Deterministic measurements establish
  correctness, a separate visual critic can localize likely defects, and humans judge whether the
  rendered design is actually good.
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
- No large grammar, unit corpus, critic or formal comparison harness before the early spike says
  the model has enough visual ability to justify them.

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
ONE shared retrieval engine -> a few complete, excellent exemplars
                              -> optional units only after a positive ablation
        |
        v
open planner -> minimal transient BroadcastDesignPlan, once earned
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
        +-> separate open visual critic for defect hypotheses
        |
        v
bounded code repair, maximum two rounds
        |
        v
production validation -> ordinary SpxTemplate -> editor/export/control

At every important research milestone: render the actual output -> human inspection -> decision
```

There is one pipeline and one result. The planner and coder may initially be the same open-weight
checkpoint with separate contexts, but the roles remain separate contracts so the best model for
each can be selected later. A visual critic presented as independent must use a different
checkpoint and be calibrated against human findings. The creator in a fresh context is only
self-critique; it may be useful, but it is not independent evidence.

### 3.1 Who owns each decision

| decision | owner |
| --- | --- |
| requested graphic type, fields and content roles | structural intent proposes; supported-type registry decides |
| relevant complete exemplars | the existing retrieval engine over declared metadata |
| whether decomposed design units exist at all | paired ablation after complete-exemplar retrieval |
| hierarchy, composition, shape language, palette and visual rhythm | open planner and code author |
| exact safe bounds, asset pixel limits and final canvas placement | planner proposes; deterministic normalizer decides |
| field ids, SPX definition and update wiring | platform compiler |
| state shape, lifecycle semantics and control legality | supported graphic type plus platform compiler |
| entrance character, sequencing, masks, stagger and easing | model through the motion grammar |
| GSAP/runtime implementation and snap behavior | platform compiler |
| correctness, overflow, asset safety and exportability | deterministic validators |
| likely visible defects and their locations | separate open visual critic, calibrated by humans |
| visual quality and whether the result is good enough | humans inspecting rendered graphics and motion |

### 3.2 The two authoring lanes are one system

Direct HTML generation and a structured intent contract can look contradictory. The resolution is
deliberate:

1. Existing structural intent supplies the graphic type, requested fields and supported structure.
2. If the spike earns further work, the open planner emits the smallest useful
   `BroadcastDesignPlan` for relationships the platform must compile.
3. A deterministic compiler creates the full SPX scaffold and marked creative regions.
4. The open code author writes the actual semantic HTML, CSS and SVG for those creative regions.
5. Motion intent compiles through the existing timeline/state vocabulary.
6. Repairs patch only the failing creative region or revise a plan value and recompile.

This keeps direct code generation expressive enough for premium work while preventing the model
from repeatedly spending reasoning on boilerplate or breaking operator behavior. The transient plan
is not saved as another editable format. Once code is emitted, code is the source of truth.

---

## 4. `BroadcastDesignPlan` - the smallest useful transient contract

The early spike runs without this contract. If the spike passes, v1 starts as a small versioned
wire object between the planner and deterministic compilers. It is normalized and discarded;
unknown versions fail honestly. It is never an editor format and never persisted beside code.

The existing `StructuralIntent` and graphic-type registry already own type, fields, repeating parts
and structural support. `BroadcastDesignPlan` must not copy that vocabulary. Its initial job is only
to carry the one decision creative code alone cannot safely coordinate with platform behavior:

- **placement:** final 1920x1080 anchor, intended settled bounds and growth direction;

That is the initial contract. Field behavior remains in the graphic-type and field contracts, and
the model authors motion through the existing marked authoring region that NoaCG already converts
to `NOACG_ANIM`. Add a field-behavior or motion-plan property only if rendered evidence later shows
that those existing seams cannot coordinate a required relationship.

In particular, the initial plan does **not** describe:

- DOM nodes, layer trees or component ids;
- panels, cards, accent bars or predefined shape pieces;
- colors, typefaces, font sizes, spacing, padding, radii or shadows;
- SVG paths, clipping geometry or CSS declarations;
- a catalog-unit assembly recipe.

HTML/CSS/SVG owns those creative decisions directly. A sports strap may use angled SVG, a glass
strap may use translucent CSS and an editorial strap may use only rules and type without the plan
learning three component families.

The platform normalizes placement and asset pixel limits, then emits field ids, the SPX definition,
safe scaffold, runtime and canonical `NOACG_ANIM`. Motion that cannot be represented in the existing
vocabulary is unsupported until that platform vocabulary grows; it is never hidden in arbitrary
lifecycle JavaScript.

### 4.1 Growth rule

Every added plan property needs evidence from rendered failures that:

1. the model cannot coordinate the relationship reliably in HTML/CSS/SVG alone;
2. NoaCG must know the value to compile, validate, edit or operate the graphic; and
3. adding it improves human-rated output in an ablation.

A schema property added because it seems useful is removed. If the contract starts describing how
the graphic looks rather than the small set of relationships NoaCG must own, it has become the
second scene graph this architecture forbids.

---

## 5. Retrieval - complete exemplars first

Pro extends the repository's **one shared retrieval system**. It does not build a second vector
store, catalog ranking engine or design-family format.

### 5.1 Initial retrieval

The existing brief terms, `TemplateMeta`, structural anchor and `browseTemplates` ranking produce a
small deterministic shortlist. The first specialist path retrieves only complete, proven,
appropriately licensed NoaCG graphics:

- two or three structurally compatible exemplars, best first;
- a different relevant visual family when the shortlist genuinely contains one;
- stable source id, version, provenance, license and human-readable retrieval reason.

The exemplars show coherent relationships among layout, type, shape and motion. That coherence is
exactly what premature decomposition could lose. The model is asked to design an answer to the
brief, not assemble pieces or repaint one of the examples.

The first retrieval ablation is **no exemplar vs complete exemplars**. Phase 0's paired arms give
the first read; the formal ablation on the development bank must still show a material human
quality improvement before exemplar retrieval becomes part of the specialist. The whole catalog is
never pasted into a prompt.

### 5.2 Copying and similarity

Similarity to a retrieved exemplar is primarily a provenance and copying alarm:

- flag unusually close layout, silhouette, decoration and motion combinations for human review;
- retain the exemplar ids and code versions used for every generation;
- reject unattributed near-copies and remove unsafe source material.

Do not optimize a graphic to be mechanically distant from its references. Lower thirds share
conventional anchors, type hierarchies and motion grammar for good reasons. A strong conventional
design is not worse because a distance metric says it is familiar. Human reviewers judge whether
the result is appropriately transformed and whether it is good.

### 5.3 Design units are conditional

Do not extract a large unit corpus up front. Decomposed units become a candidate only if complete
exemplars reveal a specific limitation, such as excessive copying, one-chassis sameness or an
inability to transfer a good motion or typography relationship across layouts.

Test that hypothesis with a tiny, human-curated set of units inside the existing retrieval path.
Compare complete exemplars against complete exemplars plus those units on the same briefs. Build
versioned unit metadata and compatibility rules only if the unit arm materially improves human-
rated quality or diversity without reducing coherence, correctness or provenance clarity.

If units earn a place, they remain source code plus metadata, never a hidden scene model. One
dominant complete exemplar still anchors coherence; units may inform a limited role, not turn the
generation into a collage.

### 5.4 Diversity without novelty theatre

The harness records exemplar and visual-family concentration across a brief set. A route that puts
most briefs on one safe composition has not met the Pro promise. This is a set-level diagnosis, not
a per-output demand for novelty. Relevant alternatives come from retrieval and human taste decides
whether the result is both appropriate and distinct enough.

---

## 6. Render, inspect and repair

The current repository can validate structure and measure rendered geometry. Pro adds a first-class
visual inspection loop around those existing systems.

### 6.1 Evidence hierarchy

The three kinds of evidence have different jobs and never collapse into one score:

1. **Deterministic checks establish correctness.** They answer whether fields paint, SPX operates,
   states are reachable, geometry stays safe, assets survive and exports run. They do not answer
   whether the design is premium.
2. **A visual critic finds and localizes likely defects.** It is an assistive instrument for paint,
   hierarchy, spacing and motion problems the deterministic checks do not measure. Its score is
   neither correctness nor taste.
3. **Humans establish visual quality.** People inspect the actual rendered frames and motion and
   decide whether the work is coherent, premium and airable. Model or critic confidence cannot
   override that read.

The historical Pro rounds make this ordering binding: 10/10 machine passes once accompanied 5/10
visibly broken frames, and the tight-placement round still had machine passes on broken outputs.

### 6.2 The render set

Every candidate renders in Chromium at 1920x1080 with transparency made visible by a neutral
checkerboard. Motion frames are captured by scrubbing the virtual clock to deterministic
timestamps, never by trusting live requestAnimationFrame playback in a headless renderer. The
harness captures at least:

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

### 6.3 Deterministic gates

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

A critical deterministic failure rejects the candidate before it can be considered visually good.
Passing says only that the candidate is correct enough to inspect.

### 6.4 Assistive open visual critic

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
answered. It may not declare structural correctness, define good design or edit code directly.

The critic is a different open checkpoint from the creator when independence matters, and is
calibrated against broadcast-designer labels. Agreement, false-negative rate on seeded defects and
false-positive rate on accepted human-authored graphics are recorded per pinned version. A same-
model fresh context is labeled self-critique and never counted as independent validation. A critic
finding is a hypothesis until deterministic reproduction or a human read confirms it; a critic
pass never establishes quality.

### 6.5 Bounded repair

The code repairer receives only the failing evidence, relevant source regions and allowed patch
contract. It gets at most **two rounds**:

1. patch the smallest responsible creative region or revise a normalized plan value;
2. recompile if needed, render every affected state, and rerun all gates;
3. keep the patch only if the stated defect improves without a new regression.

A repeated finding, no measurable improvement or new critical failure stops the loop and rejects
the candidate. Regenerating indefinitely is not repair.

### 6.6 Candidate count

The research harness starts with one candidate so model and compiler failures remain diagnosable.
Best-of-two generation becomes the intended quality mode only if an ablation proves that it
materially improves blind airability. The system gates both, the critic may rank the survivors and
repairs only the winner, but that ranking mechanism must first agree with human choices on a
calibration set. More than two requires separate evidence and a cost/latency decision.

### 6.7 Human visual milestone gates

Every important visual milestone produces reviewable 1920x1080 frames and motion, not just JSON:

- the early feasibility spike;
- the first minimal-plan outputs;
- complete-exemplar retrieval and every retrieval ablation;
- critic calibration and repair ablations;
- each model, prompt, fine-tune or quantization promotion;
- each new graphic-type expansion and the product-beta candidate.

The responsible human review happens before that milestone is called successful. Machine, critic
or model claims may help explain the output after it is seen; none may substitute for seeing it.

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

Model names change faster than this architecture. The early spike does **not** build a tournament:
a license and endpoint capability preflight selects one strong open-weight checkpoint, pins it and
tests the hypothesis cheaply. Only after a go decision are candidates systematically tested on:

- structured planning and schema adherence;
- HTML/CSS/SVG quality and disciplined patching;
- long-context use of retrieved examples without copying;
- tool use and recovery after compiler/validator errors;
- visual understanding for a separate critic candidate;
- deterministic decoding controls, latency, throughput, hosting availability and license;
- exact cost per accepted output, including failed candidates and repairs.

Planner, coder and repairer are independent route roles and one checkpoint may win several. A
critic claimed as independent must be a different checkpoint. Routes, prompts, the minimal plan
version and exemplar versions are pinned in every fixture and round.

### 7.3 Quality before inference optimization

The first route is the strongest open-weight combination that satisfies the license and can run
the harness. Development cost and inference convenience do not outrank visible quality. Assistive
roles are the one early exception: the critic and the repairer may be filled by cheaper open
checkpoints once calibration shows no loss against the strong checkpoint in that role - the
authoring roles are never downgraded for cost ahead of the locked quality gate. After parity is
demonstrated, distillation, quantization, caching and smaller checkpoints may reduce cost and
latency, but each optimization reruns the locked quality gate.

---

## 8. Evaluation - what "Opus-level" means

The claim is about the complete specialist system, not raw model intelligence. The comparison is
therefore final rendered graphics produced from the same briefs under declared, bounded workflows.
This formal evaluation begins only after the early spike passes; the spike is not a small parity
round.

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

1. excellent human-authored NoaCG graphics mapped to the same briefs as the quality anchor;
2. the strongest open Pro system;
3. the best current closed frontier baseline available through the same scaffold, tools, render
   evidence and maximum repair count;
4. the existing adapt-first product baseline.

The open system may use retrieval and specialization because those are the product. The baseline
receives the same NoaCG structural compiler and validation opportunities so the comparison does not
confuse broken boilerplate with design intelligence. The human anchor is the best structurally
appropriate catalog graphic populated for the brief; when the catalog has no excellent answer, a
designer authors the benchmark graphic. It establishes what excellent broadcast work in NoaCG
looks like, not merely what another model can do. Its code and screenshots are withheld from the
model's prompt, retrieval and training data for that scored item. All output galleries are blinded
and shuffled.

Frontier parity is useful evidence, but it is not the real finish line. If the frontier arm is
mediocre on a brief, matching it does not pass. Human-authored anchors calibrate an absolute premium
quality band, and the open system must enter that band as well as remain competitive with frontier
models.

### 8.3 Human judgement

At least three independent reviewers with broadcast-design competence rate each joined item. The
panel is the owner plus reviewers recruited from the teaching cohort and the broadcast community;
recruiting and onboarding them is Phase 2 work, not an afterthought - a gate that cannot staff
its panel gets silently weakened, which is worse than an honestly smaller gate. The
degraded-panel rule is predeclared: two reviewers produce a provisional verdict that cannot pass
a release gate; a single reviewer only triages. The primary question is: **would you take this
graphic to air after entering content and brand, without redesigning it?** Supporting reads
cover:

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
  placement or unresolved critical visible defect confirmed from the rendered output;
- at least 90% of supported holdout briefs return an accepted candidate without a manual repair,
  manual selection or user-triggered rerun;
- at least 95% accepted outputs judged airable after content and brand entry;
- human ratings reach the predeclared premium band calibrated by the excellent human-authored
  anchors; frontier parity alone cannot satisfy this gate;
- blind preference is statistically non-inferior to the frontier baseline within a predeclared
  five-percentage-point margin, with no material loss in motion or editability;
- it materially beats adapt-first on distinctiveness without losing adapt-first's correctness;
- cost, latency, failure and retry distributions are published with the result.

If a round misses, the failure taxonomy decides the next change. Re-rolling the same model and
calling the better sample progress is not allowed.

### 8.5 Ablations

Every major mechanism must earn its complexity. The harness compares:

- direct open code with the scaffold vs the same path plus the minimal plan;
- no exemplars vs complete-exemplar retrieval;
- complete exemplars vs exemplars plus a tiny unit set, only if a measured limitation justifies
  testing units;
- no critic vs critic only vs critic plus repair;
- one candidate vs best of two;
- base open checkpoint vs later specialist fine-tune.

An ablation uses identical briefs and pinned routes. Humans read the rendered graphics before the
machine explanation. A component that does not improve blind airability, correctness or useful
set-level diversity is removed rather than defended by theory. Exemplar similarity is reported as
a copying/provenance alarm, never optimized as a general quality or novelty objective.

---

## 9. Delivery plan and stopping gates

No phase is scheduled by optimism. Each begins only when the prior phase's artifact and gate are
complete. Each expensive or architectural assumption is preceded by the cheapest experiment that
can falsify it. Work remains bench-only until Phase 5.

### Phase 0 - small open-model go/no-go spike

**Build:** only the thin experiment in section 0: the zero-token control run, the 12-brief
lower-third bank, one or at most two strong open-weight checkpoints, the existing neutral
scaffold, paired exemplar/no-exemplar arms with two or three hand-vetted complete exemplars, the
shared repair loop, production validator, Chromium renderer with virtual-clock motion capture,
fixtures and the anchor-mixed review gallery. No plan schema, critic, unit corpus, tournament or
product path.

**Gate:** the control run renders correctly first; then humans inspect every rendered hold and
motion sample before reading machine verdicts. The go/no-go rule is exactly section 0.3.

**Stop if:** the model lacks visible hierarchy, proportion, composition or variety, or promising
frames need redesign rather than localized repair. Archive the evidence and spend nothing on later
phases until the underlying model capability materially changes.

### Phase 1 - minimal production spine and intent contract

**Build:** harden the existing scaffold boundary, final-canvas placement and safe creative regions.
Add only the minimal `BroadcastDesignPlan` properties in section 4, normalized into existing
`blocks`, state-machine, control and validation systems. Do not put a compiler in React and do not
persist the plan.

**Gate:** human-authored reference graphics and the promising spike cases compile to readable code,
survive editing/export, update every field, run every state/control, pass long/empty/non-Latin
cases, and match their approved 1920x1080 renders. No root scaling or visible asset upscale occurs.
Humans confirm the minimal plan did not flatten the visual expression that passed Phase 0.

**Stop if:** the contract needs DOM/layer/component descriptions, arbitrary-JS escape hatches or
becomes a second editor model. Remove unnecessary fields before adding more.

### Phase 2 - formal evaluation contract and human quality anchors

**Build:** the rubric, development bank, locked holdout process, fixture manifest, human review
form, cost ledger, excellent human-authored NoaCG anchors and frontier/adapt procedures - and the
reviewer panel itself, recruited from the teaching cohort and broadcast community per section 8.3.
Reclassify the existing paid Pro rounds as historical reconstruction evidence, not baselines for
the new architecture.

**Gate:** a dry run reproduces shuffled galleries, joins machine and human results, detects seeded
defects, prevents holdout leakage and calibrates the premium rating band against the human anchors.
No model spend is needed for the dry run.

**Stop if:** quality cannot be defined independently of model identity, the anchors are not
actually excellent, or reviewers cannot agree enough to support a useful decision.

### Phase 3 - robust open author and complete-exemplar retrieval

**Build:** the bench-only planner/coder/repair contracts, open-checkpoint tournament and
fixture-saving harness. Integrate two or three complete exemplars through the existing retrieval
path. Start with one candidate and deterministic repairs only so failure ownership stays clear.

**Gate:** on the development bank, the best open route produces a high majority of structurally
valid candidates, human review confirms the code retains the visual capability seen in Phase 0,
and the no-exemplar vs complete-exemplar ablation shows whether retrieval earns its place. Source
similarity catches copying but does not reward arbitrary visual distance.

**Stop if:** no available open checkpoint can follow the bounded contracts, complete examples
cause copying without a quality gain, or visual quality regresses behind the cheap spike. Keep the
evidence and revisit later rather than weakening SPX safety.

### Phase 4 - visual repair, conditional units and frontier comparison

**Build:** state contact sheets, deterministic visual measurements, a calibrated separate open
critic, bounded repair and optional best of two. Seed a defect suite containing the exact
historical failures: baked text, duplicate fields, wrong scale, lost logo/portrait, mismatched
masks, bad paint order, unsafe placement and overflow.

Only if complete-exemplar retrieval exposes a specific measured limitation, run the tiny design-
unit ablation in section 5.3. Do not build the unit architecture otherwise.

**Gate:** deterministic checks establish correctness, the critic shows useful localized defect
recall, and humans confirm that its repairs improve blind airability without more regressions. The
locked comparison meets section 8.4 against human-authored, open, frontier and adapt-first arms.

**Stop if:** critic and creator reward each other's artifacts while humans do not, repair success
depends on more than two rounds, or units reduce coherence. Critic scores never rescue a result
humans judge poor.

### Phase 5 - product beta

**Build:** Pro behind the existing Create with AI tier picker, using the shared gateway, telemetry,
entitlement and BYO/self-host paths. The user sees generation, render, inspection and repair status;
the accepted result enters the normal editor/export flow. A critical gate failure returns no result
and a specific reason. There is no concept-image card or separate Pro editor.

**Gate:** focused E2E, production SPX/CasparCG/OBS walkthroughs, build and CI; operational limits
cover concurrency, timeout, model unavailability and cost. The beta predeclares a
generation-to-accepted latency budget taken from Phase 3/4 measurements rather than discovering
it in production. No closed fallback exists.

**Stop if:** hosting economics require hiding the real price, or product behavior differs from the
bench harness that earned the quality claim.

### Phase 6 - fine-tune the specialist

This is mechanism 5 and deliberately comes last.

**Entry gate:** start fine-tuning when the data, not a calendar or magic count, shows that a
specialist can learn something reusable. Provenance must be complete; accepted and rejected traces
must cover the supported brief, style, field, motion and failure variation; family-disjoint
holdouts must exist; and a small diagnostic adapter must show a real learning curve rather than
memorization.

For planning and capacity estimates, expect roughly 500-1,000 de-duplicated human-reviewed accepted
traces and 1,000-2,000 localized repair or rejection examples before a serious deployment attempt.
Those are estimates, not thresholds. A diverse, high-signal corpus may justify an earlier pilot; a
larger repetitive corpus may still be inadequate. No count by itself authorizes promotion.

**Dataset record:** brief, structured fields, brand and asset metadata, retrieved complete-
exemplar ids and any optional unit ids, normalized plan, code, all state renders, deterministic
findings, critic findings, human ratings, rejected alternatives and successful repairs. Customer
content is excluded unless explicitly opted in and suitable for that use.

**Training sequence:**

1. supervised fine-tuning for brief + retrieval -> plan and plan + scaffold -> creative code;
2. a repair curriculum using real failures plus deterministic adversarial mutations;
3. preference training from blinded accepted/rejected pairs;
4. a separately trained or calibrated critic on localized visual findings;
5. quantization and serving optimization only after quality parity.

The planner/coder and critic do not need to be one model. A smaller specialist wins only if it
beats its untuned base on the locked holdout, preserves critical-defect recall and remains
non-inferior to the frontier baseline, and stays in the premium band calibrated by the human-
authored anchors. If it memorizes catalog families, loses diversity or merely optimizes machine
gates, the strongest base open route stays in service.

---

## 10. Cost, hosting and operations

The retired pipeline's roughly $1 per 12-brief round was dominated by image generation. This plan
removes that image call, but it does **not** promise that a frontier-scale open checkpoint with two
candidates and repairs is immediately cheaper. Open weights remove provider dependence, not GPU
cost.

The operating policy is:

- the Phase 0 spike is one or at most two pinned checkpoints, one candidate per brief and arm,
  the 12-brief bank in paired exemplar/no-exemplar arms and the existing two-round deterministic
  repair ceiling; no critic, model tournament or frontier arm is paid for first;
- human inspection of those rendered outputs decides whether later investment exists at all;
- after a go decision, quality selects the first viable route;
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
- Every complete exemplar, and every later unit if units earn a place, has source and license
  provenance. Restricted real-world corpora may inform measurements but cannot become training or
  retrieval data unless their terms permit it.
- Generated traces retain model, minimal-plan, exemplar-corpus and compiler versions so a result
  is auditable.
- User assets and private customer graphics are not used for training by default.

---

## 12. Principal risks and planned falsification

| risk | how it is tested | response |
| --- | --- | --- |
| Harness bug reads as model failure | zero-token control run of a known-good template through the wrapper, rerun after wrapper changes | fix the harness before spending; a round judged on a broken wrapper is void |
| Spike passes on transfer, not taste | paired exemplar/no-exemplar arms in Phase 0 | treat as ambiguous, probe the second checkpoint; copied coherence is not visual signal |
| Open coder follows syntax but lacks taste | Phase 0 rendered spike | stop before building the specialist; revisit only for a materially stronger checkpoint or specific new hypothesis |
| Minimal plan is too weak | rendered human references and plan/no-plan ablation | add only the observed relationship NoaCG must compile; no arbitrary-JS escape hatch |
| Minimal plan becomes a hidden scene model | round-trip and editor-source review | delete visual-description fields; edits after generation operate on code |
| Complete exemplars cause sameness | exemplar/family concentration plus human review | improve the relevant shortlist first; test small units only if this measured limitation remains |
| Optional units cause collage | paired unit ablation and coherence ratings | do not build or keep unit architecture unless humans see a material gain |
| Similarity metric punishes good conventional design | compare flags against human provenance decisions | use similarity to catch copying, never as a novelty target |
| Critic misses obvious failures | seeded-defect recall | keep deterministic/image-diff tripwires, require human confirmation and remove the critic if its recall stays weak |
| Critic and creator agree on bad work | separate checkpoints plus blinded human labels | treat same-model review as self-critique; recalibrate or remove the critic; human verdict remains authoritative |
| Repair chases its tail | per-round finding and metric deltas | stop at two; reject no-improvement candidates |
| Motion looks correct only at hold | entrance/update/next/exit contact sheet and video review | category motion bank and state-derived capture set |
| Long or non-Latin text breaks hierarchy | adversarial field drive | platform fit/capacity gate; reject unsupported plans |
| Largest open model is uneconomic | accepted-output cost and throughput | fine-tune/distill a smaller specialist after data exists; BYO/self-host first |
| Fine-tune starts on a large but weak corpus | provenance, coverage and learning curves | treat counts as estimates; wait for diverse evidence and keep the base fallback |
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

No new work or spend should improve the retired reconstruction path. Until Phase 5 replaces the
backend, the existing Pro tier entry in Create with AI stays as it is today; whether to relabel
or hide it earlier is an owner product decision recorded outside this plan.

---

## 14. First implementation slice - DONE 2026-08-12; what Phase 1 inherits

**Phase 0 ran and the owner's verdict was GO** (the banner in section 0). The wrapper is
`src/ai/spike/` + `scripts/pro-spike.mjs` + `scripts/spike-checkpoint-probe.mjs`, bench-only and
fenced off from the app by `.dependency-cruiser.cjs`. Phase 1 begins with three things owed from
this round, and one decision it should make early:

0a. **THE CODE IS THE DELIVERABLE, AND IT IS AN EVALUATION AXIS** (owner, 2026-08-12). Phase 0
   judged rendered frames alone and did not keep the emitted HTML/CSS/JS at all, which is backwards
   for a product whose artifact IS an HTML template: the frame is a derivative of the code, the
   code is what a user edits, exports and puts on air, and **code quality is part of choosing a
   winner, not a follow-up check.** Every round from here saves
   `code/<brief>.<arm>/{index.html,template.css,template.js}` (already implemented), the review
   reads the code beside the frames, and the ledger records what the code is like - not merely
   whether it validated. Concretely, the house contract in `src/ai/AGENTS.md` already names what
   good looks like and is what to score against: the `:root` variable contract with zero hardcoded
   colours elsewhere, every pixel size through `calc(N * var(--scale))`, the structure spine, the
   marked ANIMATION region in the authoring grammar, and simple readable ES5 with comments that
   explain WHY. A generation that renders beautifully and emits unreadable or uneditable code has
   failed the product, and Phase 0 could not have told the difference.

0. **THE PREMISE TEST COMES FIRST: brand, not generic quality** (owner, 2026-08-12). Phase 0 asked
   whether a strong open checkpoint can design a broadcast lower third. It can. But every brief in
   the bank is generic - no brand palette, no brand typeface, no real mark - so the round never
   asked whether it can design **this customer's** graphic, and the owner's reading of the output
   was that it looks like something the free template gallery could carry. That reading is correct
   and it is the whole problem: **adapt-first already delivers catalog-grade generic graphics for a
   fraction of a cent, so a paid Pro generation earns nothing by matching it.** Pro's premise is
   originality conditioned on a customer's own brand, and that has not been measured once.
   The next round is the same 12 briefs carrying a real mark (shape/backing/ink via
   `assets/assetInfo.ts` `probeMark`), a brand palette and a brand typeface, measuring two things:
   brand FIDELITY (mark placed legibly and unaltered, palette driving the design rather than
   decorating it) and brand-driven DIVERGENCE (different brands, same brief, visibly different
   graphics - the sameness tripwire adapt-first already lives under). On the chosen checkpoint that
   round costs about $0.26. Item 1 below is a precondition for it, not a parallel task.
   **RAN 2026-08-13: 30/30 for $0.63, owner-read blind. Verdict and the named follow-ups (the
   mark-surface "bounding box" defect, the catalog side-slot, animated motion review - the last
   of those BUILT 2026-08-13: every strip is also a looping real-speed webm in the blind gallery,
   the five stills and the mark-motion gate untouched) are the
   top entry of `docs/AI_ATTEMPTS.md`; archive `pro-brand-qwen3-coder-2026-08-13`. No four-tints
   sameness appeared; the exemplar arm's 12/12 editable timelines vs the no-exemplar arm's 0/18
   is the first measured evidence for the exemplar block.**

1. **The logo contract is the named gap and the first real work.** The owner's own words: find a
   structure and plan for how a mark is placed so it fits the design, and how it animates
   meaningfully. The Lite side already solved the placement half in a shape worth copying rather
   than reinventing - **the design declares the slot and the compiler fills it; the model never
   places the mark** - with the declaration gated against a rendered measurement
   (`LiteCatalogEntry.logoSlot`, `scripts/ai-lite-brand-audit.mjs --check`, `docs/AI_LITE_PLAN.md`
   §7). A GENERATED design has no catalog slot to declare, so the equivalent contract for authored
   graphics is genuinely new, and the MOTION half has no precedent anywhere in the repo.

   **BUILT 2026-08-13 (`src/ai/spike/brand.ts`), and the brand-round harness with it.** The
   contract as shipped: the DECLARATION is part of the emitted design - one `filelist` field bound
   to an empty `<img id="fN">` whose geometry and surface are the model's decisions, taught with
   the mark's measured shape/backing/ink (`probeMark`, Lite's own vocabulary); the FILL is
   deterministic (`fillBrandMark`, the fillProLogoSlot recipe, inside the ground step so repair
   rounds re-validate a FILLED template with the as-is screen armed); the GATE is a rendered
   measurement (`measureRenderedMark`, the Lite brand audit's thresholds); the MOTION half samples
   the slot through the virtual clock (`markMotionState` - "did it move" is measured, "was it
   meaningful" stays the §0.2 human read). Beside it: the synthetic brand fixture
   (`benchmarks/pro/v1/spike/brands.json` + four measured marks), the divergence cell, the
   alignment-axis instrument calibrated over all 90 catalog lower thirds
   (`src/ai/spike/axisCheck.ts` + `benchmarks/pro/v1/spike/axis-calibration.json`: 3/90 base rate,
   text pairs flagged only when aligned on NO side), and the per-generation code audit
   (`scripts/spike-code-audit.mjs`, item 0a's countable half). Zero-token control green including
   a mark-fill control (`control-mark`: the kestrel wordmark filled into lt11's shared band and
   measured CLEAN). The paid round itself still needs the owner's explicit OK with a stated cap.

   **THE SURFACE HALF, ATTEMPTED STRUCTURALLY (owner decision 2026-08-13: "take it structurally
   like Lite"). The DECISION shipped; the DRAWING is blocked on placement, which is a product
   call.** `decideMarkSurface` now answers, deterministically and with no rendering, whether the
   design's own panel carries this mark's ink: an own-field mark never needs a surface, and a
   transparent one is compared against the design's declared `--panel-bg` - composited over black
   AND white where the panel is translucent, evaluated at every stop where it is a gradient, worst
   case wins. Which neutral a field would use is computed rather than assumed from "light ink" or
   "dark ink", because the mid-tone case breaks that assumption (the sunbeam roundel at 0.49 reads
   at 1.8:1 on the light neutral and 9.4:1 on the dark one). Measured over the ablation round's 15
   generations it fires on exactly the three the rendered gate flags for `ink-contrast` - the
   measurement and the need agree, and every record now carries the answer.
   **DRAWING the field failed twice, and both failures say the same thing.** A wrapper using
   `align-self: stretch` computed to `stretch` and was used at the mark's own height (the slot
   sits in the design's own flex container and the mark's `height: 100%` makes the cross size
   circular), so it hugged the mark - the defect it exists to remove - and its padding took two
   marks under the minimum legible size. A `display: contents` wrapper painting a bleeding
   `::before` kept every mark's size exactly and painted the band across the middle of the panel,
   over the text, because a pseudo-element with no box of its own resolves against whatever
   ancestor happens to be positioned; the rendered gate cannot see a pseudo-element either.
   **A surface can only be "a band of the composition" if the platform knows the composition.**
   Lite draws one because Lite owns PLACEMENT too - `applyLogoSlot` puts the mark in a grid column
   of a box it controls. Taking the surface while leaving placement to the model asks the platform
   to draw a shape inside a layout it has never seen. So the real structural version is the fuller
   one - the platform owns where the mark sits as well as what it sits on - and that takes
   composition back from the model, which is a product decision, not an implementation detail.

   **WHERE THE CONTRACT STANDS AFTER THE 2026-08-13 ABLATION, and the one decision it now needs.**
   Two halves are settled and structural: the FILL guarantees a filled mark PAINTS (it stamps
   `has-image` on the root and the box and appends a scoped display rule, after 5 of 12 marks in
   that round never appeared - the designs hid their own `<img>` and their un-hide rule was keyed
   at the wrong level, following a prompt line that points at an example carrying no image field),
   and the MOTION half reads. **The SURFACE half is not settled and prose has not moved it:** the
   well-integration teaching was written after the brand round and measured on the ablation, and
   the boxed rate is 8/12 taught against 9/18 untaught - flat to worse, once the invisible marks
   are repaired and can be judged at all. **The decision owed is who owns the mark's surface.**
   Teaching it again is the option already tried twice. The alternative is the shape the rest of
   this contract already uses and Lite proved: the design declares the slot, the PLATFORM decides
   what the mark sits on, and the model never draws that surface - the only version of the rule
   that cannot be got wrong. Full measurement: `docs/AI_ATTEMPTS.md` top entry.
2. **The checkpoint is decided: `alibaba/qwen3-coder`** (owner, 2026-08-12), on a read of both
   galleries - better AND ~19x cheaper, 24/24 complete and contract-clean where kimi-k3 reached
   21/24 and could not finish three exemplar-arm briefs at all.
3. **Decide whether the exemplar block survives. DECIDED 2026-08-13: IT SURVIVES.** It costs
   ~34,500 tokens per call - about 80% of the round's spend - and on the pair the owner examined it
   produced a result indistinguishable from showing no exemplars at all. Section 5 treats
   complete-exemplar retrieval as a pillar, so the ablation was owed before Phase 3 built on it.
   **It ran for $0.215 of a $0.40 cap** (`pro-exemplar-ablation-qwen3-coder-2026-08-13`): the same
   12 briefs with a ~480-token region lesson in the block's slot (`src/ai/spike/grammar.ts`, the
   `grammar` arm) returned **1 of 12 editable timelines against the exemplar arm's 12 of 12**, and
   three exemplar re-runs reproduced the stored arm exactly on that axis, so the comparison is
   against a live arm. A worked example of the region conforms; a description of one does not, and
   the explicit "do not hand-write `NOACG_ANIM`" changed the rate of that behaviour by nothing.
   Full record: `docs/AI_ATTEMPTS.md` top entry.

**Four harness faults cost roughly $5 of the round's ~$16**, every one of them a case of the rig
measuring itself: a probe that asked a smaller question than the round, an output budget pinned
from that undersized probe, retries disabled on reasoning that did not survive the actual failure
mode, and a free control run that overwrote the paid ledger the cost ceiling counts from. All are
fixed and commented where they happened. The transferable rule is the one already in
`src/ai/AGENTS.md` about gates: **a bench that measures a smaller question than the round is not a
cheaper bench, it is a wrong one.**

---

The original scope, kept for the record: build
the thin bench wrapper, prove it with the zero-token control run, select one or two strong
open-weight checkpoints through a license/capability preflight, render the 12-brief bank in
paired exemplar/no-exemplar arms with the existing scaffold, validator and repair loop, and
inspect every result by eye against blind-mixed anchors. It changes no product path. Its model
spend still requires an explicit owner OK with a stated cap (estimated $5-15, section 0.3)
before the round runs.

Only a positive human go/no-go verdict unlocks Phase 1 - **given 2026-08-12**. The minimal plan and
every later mechanism must still earn its place through rendered evidence. This ordering was
intentional and it paid: falsify model taste before funding infrastructure, and never let
infrastructure's own scores certify the visual work it exists to improve. This round is the
argument for the second half of that sentence - every deterministic gate passed the frame with a
broken brand mark in it, and a human found it in seconds.
