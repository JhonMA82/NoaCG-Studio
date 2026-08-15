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
  costed through the task registry - **done 2026-08-14**: `pro-generate` is a registered task
  with a reservation ledger, a per-generation ceiling booked server-side, and a small default
  quota (`docs/AI_TASK_REGISTRY.md`). It ships switched OFF (`AI_PRO_ENABLED`), so turning it
  on is a decision made against the measured $0.0777 rather than a deployment side effect. The
  route is deliberately engine-agnostic and does not have to change when §15's Phase A replaces
  the pipeline;
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
   of a box it controls. **So the platform took placement (owner, same day) and the defect class
   closed.** The model declares the slot; the fill moves that `<img>` into a leading column of the
   box at the catalog's audited size, and because the column is a grid item the platform owns,
   `align-self: stretch` gives the mark's surface the full height of the text stack - a band, not
   a plate. Over the ablation round's 15 saved generations: clean 4 → **13**, not-painted 5 → 0,
   bounding-box-well 10 → 1, ink-contrast 3 → 0, and the mark still disappears when the operator
   clears the field on all 15. A design that already declares `.{prefix}-box.has-image` keeps its
   own placement - that is the catalog slot's signature, and the control caught the one commit
   where the platform laid its grid over the catalog's. What stays the model's: whether the
   composition leads with the mark or leans on the text, the panel's air, what the mark sits
   beside. What is now ours: the seat and what its ink reads against.

   **MEASURED WHOLE ON FRESH GENERATIONS, 2026-08-13 ($0.083, archive
   `pro-seated-round-qwen3-coder-2026-08-13`): 12/12 captured, 12/12 contract-clean, 12/12 seated,
   10/12 marks CLEAN, none unpainted, no contrast failures.** Across the three grammar-arm rounds
   on the same briefs and brands: clean marks 2/12 → 8/11 (teaching) → 10/12 (teaching + seat),
   unpainted 5 → 0, contrast failures 2 → 0. Item 1 is closed; the mark contract is a contract
   rather than an instruction. Editable timelines stayed 0/12, which is the grammar arm's own
   number and the exemplar ablation's business, not this one's.

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

## 15. What Pro is FOR - the 2026-08-14 reckoning, and the plan that follows

Written after the third owner blind read in two days, at the owner's request: *"we are doing
minor changes to these graphics… we need to broaden our repertoire… we need a system where it
can reliably create all the graphics based on some rules, rather than us giving feedback to each
graphic."* That reaction is correct and the measurements agree with it, so this section replaces
optimism with what three rounds actually showed.

### 15.1 Where three rounds got us

| round | airable (owner) | what changed |
| --- | --- | --- |
| brand round (2026-08-13) | 14/30 | first brand conditioning |
| seated round | 6/12 | platform seats the mark |
| instruments round | **7/12** | spacing + proportion reporting |

**Airable moved 6 → 7 of 12 while three separate pieces of machinery were built.** The machinery
worked on its own terms - clean marks went 2/12 → 11/12, contract failures went to zero, every
mark is seated - but the owner's verdict barely moved, because the failures left over are not
the ones any of it addressed.

### 15.2 The five failures decompose into ONE thing

Every failed item in the instruments round is a PANEL-LAYOUT decision:

- text sitting on the design's own rule (2 items - the instruments catch these)
- text overflowing the panel onto the picture (1 - **the instrument reported roomy padding**,
  because it measures from children CONTAINED by the panel and silently drops anything that
  escapes; the worst case reads as the most comfortable)
- a composition stranding the text in a corner with the frame mostly empty (1 - nothing measures
  composition)
- furniture around the mark inflating the whole graphic (1)

**Not one failure was colour, typography, motion, or brand fidelity.** Those are working: the
palettes drive, the divergence cell shows four brands producing genuinely different designs, the
marks are clean. What is failing is the model composing a panel - and it has failed at roughly
the same rate through three rounds of teaching, measuring and repair.

Meanwhile the adapt-first anchors pass the owner's eye every single round, dismissed as "template
graphic", **because nothing on that path composes a panel at all.**

### 15.3 The one intervention that has ever moved a rate

Ranked by what actually happened (docs/DESIGN_PRINCIPLES.md carries the general form):

| approach | measured effect |
| --- | --- |
| ask the model to exercise judgement | none (9/18 → 8/12) |
| state a boundary | large (2/12 → 8/11) |
| **remove the decision** | **largest (→ 10/12), and it stays removed** |

Three rounds of evidence say the same thing the mark contract said: a defect class ends when the
platform owns the decision, not when the model is told about it.

### 15.4 So what is Pro FOR?

Lite is catalog-grounded, free, one graphic, about $0.0003 a generation, and its open problem is
SAMENESS. Pro costs real money and has to be worth it. Three candidate answers, scored against
what is measured rather than hoped:

1. **"The model composes an original graphic."** This is the current premise and it is the one
   failing. 5 of 12 still fail on layout after three rounds. It is also the answer that competes
   most directly with adapt-first, which already delivers catalog-grade output for a fraction of
   a cent - so even when it works it earns little.
2. **"The model designs for THIS customer's brand."** Measured and working: brand-conditioned
   palettes, typefaces and a real mark, with genuine divergence between brands. Lite cannot do
   this at depth - it carries a logo and a palette onto a fixed chassis.
3. **"The model designs a brand's on-air LOOK, and the platform builds every graphic in it."**
   Not attempted. A channel does not need one lower third; it needs a lower third, an info card,
   a ticker, a scoreboard and a holding screen that visibly belong to each other. The catalog
   already enforces sibling consistency through the project brand and the style families, and the
   type registry already carries 22 graphic types with their structure declared.

**The recommendation is 3, built on 2, and it retires 1.** Pro stops being "a model draws a
panel" and becomes "a model decides a design language, the platform renders that language across
every graphic type the show needs". That plays to what is measured to work, avoids what is
measured to fail, and is a thing Lite structurally cannot do - which is the only honest basis for
charging for it.

### 15.5 The plan

**Phase A - take the panel.** The platform owns each graphic type's structure and spacing; the
model supplies the design LANGUAGE as parameters (palette, type scale and weight, shape and
corner language, accent form and weight, density, motion character). This is `applyLogoSlot` and
`fillBrandMark` generalised from the mark to the whole composition, and it kills all five
remaining failure modes by construction rather than by inspection. The measurable claim: layout
failures go to zero and the round's verdict becomes a judgement about the LOOK.

**BUILT 2026-08-15, bench-only, no model call wired to a user** (`src/ai/pro/language/`, and
src/ai/AGENTS.md for the four rules that bind it). What the shape of it buys:

- **`contract.ts` carries no number the model can get wrong**, because it asks for none: enums,
  four hex colours and a bundled font id (read from the font registry, never transcribed). A
  geometry field here would be a panel decision under a different name. `normalizeDesignLanguage`
  never fails and never invents - every field is a value the schema offered or the house value -
  and `languageFallbacks` records which fields fell back, so a round can see a language that was
  mostly ours.
- **`structure.ts` composes in the units the instruments measure in.** Every size is a ratio of
  the primary type size, so each calibrated threshold is cleared by construction and the file
  states its margin: tightest padding 0.34 against a 0.28 floor, opposite sides equal (1.0x
  against a 2.6x limit), widest line gap 0.83 against a 1.4 ceiling, nearest rule 0.45 against a
  0.02-0.12 crowding band, footprint ~0.071 against a 0.10 ceiling, mark 1.2 type sizes against a
  3.2 ceiling.
- **`compose.ts` builds through the catalog's own assembler.** A Phase A graphic is an ordinary
  `TemplateVariant`, so it inherits the `:root` contract, the NOACG_ANIM region, the SPX
  definition, the shared logo slot, exports - and the auto-fit `width: fit-content` box, **which
  is why text cannot escape its panel: the panel is sized by its text.** §16 is the argument for
  routing through the assembler rather than authoring a document: Pro's own reconstruction lost a
  panel that was good.
- **`stub.ts` + `languageAnchors` are the zero-token control**, four deliberately far-apart
  languages through the identical function a model answer takes, measured on the free pass of
  `node scripts/pro-spike.mjs --control`.

**What the control run measured (2026-08-15, zero tokens), after two rounds of fixes it paid for
itself:**

| language | padding (T/R/B/L, type sizes) | type ratio | fill | footprint | findings |
| --- | --- | --- | --- | --- | --- |
| Harbour Nightly (solid, edge-bar, mark seated) | 0.46 / 0.61 / 0.46 / 0.61 | 0.48 | 0.62 | 0.06 | none |
| Volt Matchday (solid, accent block, compact) | 0.33 / 0.46 / 0.33 / 0.46 | 0.35 | 0.65 | 0.03 | none |
| Alder Quiet (no panel, underline, airy) | - (no panel by design) | 0.61 | - | - | none |
| Sunbeam Daytime (blurred, top rule, airy) | 0.61 / 0.85 / 0.61 / 0.85 | 0.48 | 0.57 | 0.06 | none |

Spacing, proportion AND alignment clean on all four, and the stress hold wraps inside the panel
rather than escaping it. **The control earned its keep three times over**, which is the argument
for running it before buying anything: it caught an accent rule that was INVISIBLE on two
languages (an empty div in a flex column has no width), a supporting line pushed 8px off the
primary line's axis by its own block's inset, and then - after the obvious repair - the same
near-miss moved onto the block's edge. None of the three is a model failure and all three would
have been read as one in a paid round.

Still owed before a paid round: the `--language` arm in the runner, and the calibration re-sweep
§15.6 names.

**Phase B - broaden the repertoire.** New brief banks per graphic type, starting with the ones a
show cannot go on air without. The type registry supplies the structure, so each new type costs a
brief bank and a calibration sweep rather than a new pipeline. **BUILT 2026-08-16 - see §15.9.**

**Phase C - package coherence.** One design language, N graphic types, judged as a SET. The
sibling rule the catalog already lives under becomes Pro's headline feature and its own gate.

**Throughout, the loop that replaces per-graphic feedback:** a blind read names a defect CLASS →
it becomes a removed decision or a measurement → the round reports a RATE → the next blind read
hunts only for NEW classes. Per-graphic feedback is the discovery mechanism; it was never meant
to be the fix mechanism, and this section exists because we ran it as one for three rounds.

### 15.6 Owed before Phase A

- **The panel-overflow bug - DONE.** `spacingCheck` counted only the children a panel
  geometrically CONTAINED, so a name hanging off the edge was not the panel's content at all: it
  was dropped from the union, the children that stayed home were measured against the far edge,
  and the worst overflow of the round reported the roomiest padding. Membership is now answered
  by the DOM as well as by geometry (`panelMembers`, shared with `proportionCheck`, whose panel
  FILL carried the identical blindness), every member's overflow is recorded per side, and live
  text outside its panel raises `text-escapes-panel`. Two things keep it honest: measurements now
  use the VISUAL rect - clipped down by every ancestor that hides its overflow - so text cut off
  inside a mask is not reported as text on the picture; and a DECORATIVE member running past the
  edge is recorded without a finding, because a bleed is a composition and an instrument that
  fails one teaches designs to be timid. `e2e/spike-instruments.spec.ts` pins all four cases and
  each was mutation-checked against the code it guards.
- **The seated-mark control - DONE, and it was the SEAT rather than the control.** The owner's
  three observations ("name in the top right, logo centred, empty space underneath") are one bug:
  the platform's mark slot spanned a fixed `grid-row: 1 / span 9` so the mark would centre against
  any design's text stack, and **nine rows means eight ROW GAPS**. A box that declares `gap: 20px`
  for its two text rows therefore got 160px of empty grid beneath them - the mark centred over the
  void, the words pushed to the top, and the panel a third taller than its content. Measured, not
  inferred: `gridTemplateRows` came back `41.8px 24px 0px 0px 0px 0px 0px 0px 0px` with the field
  225.8px tall, and the spacing instrument read a 4.38x top-to-bottom imbalance
  (`padding-lopsided`). `placeMark` now COUNTS the rows the text occupies and the slot spans
  exactly those. After: padding 0.63 top / 0.63 bottom, no findings, footprint 0.08 → 0.04.
  Pinned by `e2e/spike-instruments.spec.ts`, which asserts both the span and the symmetry.
  **The same CSS shipped on every seated generation of the 2026-08-13 round**, which is worth
  remembering when reading that round's verdict.
- **The calibration re-sweep - DONE, and the change is INERT on the shipped catalog.** Both
  sweeps over all 90 lower thirds, compared against the committed fixtures rather than against an
  absolute (`findPanel` still resolves for 45 of the 90, so the sweep measures half of what it
  lists - the same figure as before, which is itself part of the answer). Spacing: 1 design
  flagged before, 1 after, the same design and the same code; exactly ONE row moved at all (lt51,
  right padding 1.20 → 1.28); and **not one shipped design reports an escape**. Proportion: byte
  identical, 0 rows moved, every percentile unchanged. The instrument change fires on the defect
  it was built for and on nothing else.

### 15.7 What a Phase A round would cost

DERIVED from measured per-call costs on the same transport, not measured for this pipeline -
the runner arm does not exist yet, so treat this as the estimate a round is authorised against
rather than as a result.

A Phase A generation is **one forced structured text call and nothing else**: roughly 1.5-2k
input tokens (the system prompt, the brief, and a brand block when there is one) for ~300-500
output tokens of enum values. There is no image anywhere in it.

| | 2026-08-10 Pro round | a 12-brief Phase A round |
| --- | --- | --- |
| calls per graphic | 2 (a concept IMAGE + an interpretation) | 1 (text) |
| measured per graphic | $0.0777, of which $0.0671 is the flat-rate image | - |
| estimated per graphic | - | ~$0.001-0.003 on `PRO_STANDARD_ROUTES.interpret`'s own model |
| round total | $1.014569 (12 briefs) | **~$0.02-0.05**, or **~$0.16** on a frontier checkpoint |

The low figure is the interesting one and it is not a rounding artefact: **86% of the old bill
was one fixed charge for a picture the compiler then failed to keep** (§16), and Phase A does not
draw one. That changes what a round IS - a language round is cheap enough to run per checkpoint,
per brand and per brief bank rather than being rationed - and it is the first thing about Pro's
economics that argues for the tier rather than against it.

The estimate's honest limits: it assumes the standard interpret route's pricing, one call with no
retry, and no divergence cell. A four-brand divergence block on two briefs adds six calls (~$0.02).
Nothing here is spent until the `--language` arm exists AND the owner says yes.

### 15.8 The first Phase A round - 2026-08-15

`node scripts/pro-spike.mjs --generate --arms=language --divergence-arm=language
--route=vercel:google/gemini-2.5-flash --max-cost=0.25`. **18 cells - the 12-brief bank under
its assigned brands, plus the two-brief four-brand divergence block - for $0.0983, $0.0055 a
graphic.** Archived at `noacg-lite-eval-archive/pro-language-round-gemini25flash-2026-08-15`
(1281 files, copy proven). The gallery is `pro-lang-round/review.html`; **the human read is
owed and nothing here is a substitute for it.**

What the machine measured, over 18 of 18:

| | result |
| --- | --- |
| contract (scaffold + fields + declared slot) | **18/18**, zero blocking errors |
| runtime errors, repair rounds | **0**, **0** (there is no repair loop on this path) |
| spacing findings | **none** |
| alignment near-misses | **0** |
| text escaping its panel | **0** |
| proportion findings | 1 (`footprint-large`, 0.11 against a 0.10 ceiling, on the long-name brief) |
| fields the model failed to answer legibly | **0** - every language came back complete |
| palette furniture repaired for legibility | 3 (`palette_text_dim_lightness_clamped`) |
| mark unreadable on the language's own panel | 3 (`ink-contrast` / `bench-mark-unreadable`) |

**The layout failure classes §15.2 decomposed did not occur.** That is the phase's measurable
claim and it held, though the honest reading is that it held BY CONSTRUCTION - the platform is
composing, so this measures that the composer works rather than that the model improved.

**The divergence cell answers the sameness question.** The same brief under four brands returned
four different accents, four different typefaces, and different accent forms and densities - not
one look with the colours swapped, which is the named failure (src/ai/AGENTS.md).

**THE OWNER'S BLIND READ: 26 of 30 acceptable** (`pro-lang-round/notes.md`, verbatim). Four named
failures and one legibility note, and **every one of them is the PLATFORM's, not the language's** -
no palette, no typeface, no motion and no composition was called wrong. Ranked by what they buy:

- **The accent BLOCK form failed on both graphics that used it** (2 of 2 - one of them the
  hand-written control): *"black text on an orange background is not so good… the text is very
  small… the orange background should scale with the text length"*. Three faults in one form, all
  fixed by construction: the block now takes `width: fit-content` (the `align-self` it relied on
  is INERT once the shared logo slot gathers the lines into a plain block container, which is why
  a two-letter role sat in a full-width bar); its ink is MEASURED (`readableInkOn` - white or
  black, whichever reads on that accent) instead of being the panel colour, which is a design
  answer to a legibility question; and it carries its own size and weight floors, because a line
  set on a solid slab of the accent is a badge rather than a caption.
- **A thin supporting line is illegible even at full contrast**: *"the title is too thin and small
  for it to be legible"* - 26px regular that measured 4.6:1 and passed every colour check, because
  contrast was never the defect. The supporting weight now has a floor that is a FUNCTION OF ITS
  SIZE (medium below 30px): small text is read by its stem.
- **An invisible mark reads as an unfinished graphic**: *"has a place for a logo, so it is nice if
  there is a logo. Without one it looks unfinished."* The mark was there; its dark ink had nothing
  to read against on the dark panel the language chose. **This one needs an owner decision - see
  below.**
- **A banner wider than its shortest line** (the mildest note, on a graphic called fine):
  *"a little too much of a banner to the right… should wrap closer around the text"*. The panel is
  sized by its LONGEST line, so a short supporting line leaves a void under it. Measurable as a
  void ratio (panel area no line covers) rather than by the padding, which was 0.46 and healthy.
  Recorded, not fixed.
- **Not a defect, by the owner's own ruling**: the mark shrinking under stress text. *"If it is
  actually so long then that is what we live with."*

**THE MARK DECISION - ANSWERED BY A FREE A/B, AND THE ANSWER IS "THE TRIGGER, NOT THE POLICY".**
`markFieldFor` + `markFieldCss` are built and DEFAULT OFF, and the same three flagged cells were
re-composed from their saved `language.json` with the field off and on, for zero tokens
(`scripts/.mark-field-ab.mjs`, throwaway). What that showed:

| cell | mark ink on its panel | with the field |
| --- | --- | --- |
| the institutional MONOGRAM on its own navy | **1.00:1** - invisible | reads, and looks deliberate |
| the consumer ROUNDEL on a cream panel (×2) | 1.91:1 by the gate | **worse** - a black tile it does not need |

**The roundel reads perfectly without any field**, because it is a full-colour mark whose
mid-tone ink measures badly and looks fine - and the owner's own blind read agrees: both roundel
cells are inside the B16-B26 block he called fine, and the only one he named as unfinished is the
monogram. So a field wired to today's signal would have damaged two graphics he passed to repair
one he failed.

**This is the recorded Lite false-positive class arriving on the Pro side** (`src/ai/AGENTS.md`:
luminance flagged crests that render perfectly, "a blue crest on a red tile separates by hue").
`MarkProbe` carried aspect, backing and one alpha-weighted ink luminance - which cannot tell a
single-ink knockout wordmark from a coloured logo, and that distinction is the whole question.

**THE MEASUREMENT NOW EXISTS AND THE SEPARATION IS TWO ORDERS OF MAGNITUDE.**
`MarkProbe.inkSpread` (additive, optional) is the alpha-weighted standard deviation of the ink's
luminance, computed in the same pass as the mean. Over the four fixture marks:

| mark | backing | ink luminance | **ink spread** |
| --- | --- | --- | --- |
| volt wordmark | transparent | 0.7772 | **0.0021** |
| navy monogram | transparent | 0.0200 | **0.0004** |
| consumer roundel | transparent | 0.4910 | **0.2053** |
| editorial mark | own-field | 0.1820 | 0.3439 (excluded - own field) |

`MARK_SINGLE_INK_SPREAD = 0.05` sits 24x above the loosest single ink and 4x below the coloured
one. **Re-run on the same three cells, free: the monogram takes its field (1.01:1 → 13.61:1) and
both roundel cells are left untouched** - the trigger fires once in 18 instead of three times, and
on the one graphic the owner named. An older probe with no spread is treated as "cannot tell",
which means do not touch it. Pinned by `e2e/spike-instruments.spec.ts` as a BAND on each side, so
a drift that narrows the gap fails rather than quietly restoring the false positive.

**RULED ON 2026-08-15 (owner): the field is ON, and what was ruled on is the TRIGGER.**
`markField` now defaults to true in `composeFromLanguage`, so the product, the paid arm and the
zero-token control all compose the same graphic - a control that runs different code than the
product is not a control, which is the finding this file has already paid for three times.

The standing no-plate rule (2026-08-14) is not overturned; its premise no longer applies. It was
written for Lite, where the platform does NOT own the composition and a well can only ever be a
repair scar pasted over somebody else's design. Phase A owns the whole composition and knows the
mark's ink before the panel colour is chosen, so the field is a designed band - `align-self:
stretch`, `object-fit: contain`, a segment of the panel - rather than a rectangle behind a logo.

What makes it safe is `inkSpread`, and the numbers above are the argument: the trigger fires once
in 18 cells, on the monogram the owner named as making its graphic look unfinished, and leaves
both coloured roundels alone. A field wired to the older mean-luminance signal would have damaged
two graphics he passed in order to repair one he failed.

Pinned by `e2e/pro-language.spec.ts` as four cases - the single dark ink takes its field, the
coloured mark does not, a probe with no spread at all is treated as "cannot tell", and
`markField: false` still composes the un-repaired graphic for a future A/B. Mutation-checked: with
the default back at false the monogram case fails and nothing else does. The repair is recorded as
`mark_field_painted` and reaches the ledger row as `pro-mark-field`.

**The original framing, kept because the premise change stands.** The standing rule is *a mark carries NO PLATE* (2026-08-14),
and its reasoning was explicit: on Lite the platform does not own the composition, so a well is a
repair scar pasted over someone else's design. **Phase A changes that premise** - the platform now
draws the whole composition and knows the mark's ink BEFORE the panel colour is chosen, so a
reading field can be a designed band rather than a patch. Three options, in order of how much they
cost: (1) leave it - the mark is reported unreadable and the graphic ships with a hole; (2) the
platform gives the mark's own column a measured neutral field when its ink cannot read on the
chosen panel (this is `decideMarkSurface`, already written and already measured); (3) the platform
constrains the PANEL instead, refusing a surface the customer's mark cannot survive. Telling the
model about the ink is already done and did not bind - the prompt says "its ink is dark, it needs a
light surface" and the model chose the brand's navy anyway, which is §15.3's ranking arriving on
schedule.

**Two classes for the next round, both platform-side:**

- **A dark-ink mark on a dark panel disappears** (3 of 18). The model took each brand's own
  palette faithfully and the mark's ink then had nothing to read against. It is REPORTED and not
  repaired, which is the owner's standing decision (no plate behind a mark, 2026-08-14) - but
  Phase A changes the terms, because the platform now knows the mark's ink BEFORE the panel is
  chosen. The cheap version is a boundary in the prompt rather than a repair in the compositor.
- **`footprint-large` on the long-name brief.** The panel is sized by its text and the text was
  long; the cap that bounds it is the category's auto-fit width, not a footprint budget.

### 15.9 Phase B - the language drives a PACKAGE (2026-08-16)

Phase A's claim, and Pro's whole promise, is that *a model decides a design language and the
platform renders it across every graphic type a show needs*. It had been tested on ONE type. Until
a second one ran, Pro was a lower-third generator with a plan attached - and it is also the only
honest basis for charging for the tier, because a channel does not need a lower third, it needs a
lower third, a sponsor bug and a countdown that visibly belong to each other, which Lite
structurally cannot do (it adapts one proven catalog design at a time).

**THE TWO TYPES WERE PICKED FROM THE REGISTRY, NOT FROM TASTE.** `src/templates/types/` records
`GraphicType.frequency` - how many of the 60 reference formats ask for that graphic - and the
order is not a matter of opinion:

| type | frequency | why it is also the hardest test |
| --- | --- | --- |
| lower third | 52/60 | Phase A's subject; the type both instruments were calibrated on |
| **sponsor bug** | **37/60** | mark-led, ONE line, on screen LONGEST - so it sits beside every other graphic in the package, which is what makes incoherence visible |
| **countdown** | **30/60** | its primary element is not a line an operator types (the clock is painted by the shared runtime), and it carries a real MACHINE - a parallel pause/resume group |
| topic card | 29/60 | the next one, and a third word-in-a-panel type - it would have tested less |

Together the three span the package's whole footprint range (a corner mark a fifth of the frame
wide, a strap, an 80px display clock), which is the range a coherence claim has to survive.

**They are composed THROUGH THE TYPE REGISTRY, not merely through the category assembler**
(`pro/language/fromType.ts`). Each Phase A design is handed to `variantsFromType` as that type's
one design, so four things arrive as declarations rather than as claims: the field contract in the
type's own order, the REQUIRED-PARTS gate (`missingParts` throws when the composed design fails to
emit a part the type promised - a real measurement of the platform's composition), the compiled
machine (a Pro countdown gets the same pause/resume buttons the catalog's own timers get), and the
clamped content channel (`withContentValues` drops an illegal duration rather than writing it).
That is what makes a new type *a brief bank and a sweep* rather than a pipeline.

**What is shared across the package, and what is not.** Every ratio is expressed against a
per-type anchor (`GRAPHIC_METRICS`: 54px name, 24px caption, 80px clock) - holding three graphics
to one absolute size would be sameness, not coherence. But **the accent's thickness and the corner
radius are resolved against `PACKAGE_UNIT_PX` instead**, so they are one value for the whole set.
That is DESIGN_LANGUAGE §8's sibling rule made structural, and it is what the catalog already does
(lt11, gt05 and bug03 all draw their bar from one `--accent-weight`).

#### The calibration sweep, per type (`node scripts/pro-type-calibrate.mjs`, FREE)

Every threshold in `spike/{spacingCheck,proportionCheck}.ts` was read off the lower-third catalog.
Both instruments take an override for every one of them, so a per-type calibration is a set of
ARGUMENTS (`PRO_GRAPHICS[id].instruments`) rather than an edit to a shared gate - nothing about
how a lower third is judged moved. The sweep renders each type's SHIPPED catalog designs plus
Phase A's four stub languages, under both calibrations:

| | shipped designs flagged |
| --- | --- |
| catalog under the LOWER THIRD's thresholds | **7 of 14** |
| catalog under the TYPE's thresholds | **3 of 14** |
| Phase A's own compositions under the type's thresholds | **0 of 12** |

Three thresholds moved, each read off the catalog rather than chosen:

- **`markScaleCeiling` 3.2 → 5.5 (sponsor bug).** Measured, the shipped bugs run 1.67x-5.25x the
  caption; bug01 (5.25) and bug04 (4.81) are a small caption UNDER a mark, not a mark beside a
  headline. Phase A's own bugs come in at 2.1x-2.7x, so the ceiling bounds the catalog and never
  binds the composer.
- **`markGapFloorRatio` 0.25 → 0.10 (sponsor bug).** The strap's clear space flagged HALF the
  shipped bugs (bug01 0.12, bug02 0.20) - a corner mark is a compact lockup, and 0.25 of an 84px
  mark is 21px of air inside a tile a fifth of the frame wide.
- **`typeRatioThin` 0.28 → 0.18 and `paddingFloorRatio` 0.28 → 0.24 (countdown).** Three of four
  shipped timers step their label further down than a strap ever steps its role line (gt01 0.20,
  gt02/gt05 0.25), and gt05 - the HOUSE countdown - reads 0.26 of top padding against a 0.28
  floor. Phase A's step never goes below 0.36 and its tightest padding is 0.34.

**Two shipped readings are left flagged on purpose** (gt01's clock 0.11 type sizes from its accent,
inside the almost-touch band; gt06's label-to-clock gap 1.5 against 1.4) plus bug02's own layered
live clock, which the instrument correctly reads as overlapping text. One design is not a
calibration, and moving a threshold to silence a single design is how an instrument stops
measuring anything.

**A `panelFillFloor` override for the bug was WRITTEN AND THEN DELETED by the measurement.** The
reasoning was that a corner tile is mostly mark and mostly air; measured, the shipped bug fills
0.56 of its tile and Phase A's fill 0.70-0.78, so the strap's 0.18 floor was never near firing. An
override nothing needs is a second number that can drift from the one it was copied from.

#### What the free control run bought this time - two composer bugs, before any tokens

The zero-token control (`--control`, now 20 rows: the strap's four plus eight new-type rows through
`composeGraphic`) earned its keep again, and both findings were structural rather than cosmetic:

- **A padding unit that was not the unit the instrument measures in.** Padding was derived from the
  type's ANCHOR, and on two of three graphics the anchor IS the painted primary size, so this
  reduced to the same number and nothing showed it. On a sponsor bug it does not: the block accent
  form's own size floor raises what is painted above the anchor, and a compact block-accent bug
  came out at 8px of padding on a 30px caption - 0.27 against a 0.28 floor, `padding-tight`, on a
  composition whose entire premise is that the threshold is cleared BY CONSTRUCTION. The unit is
  now the largest PAINTED type size.
- **A tile tighter than its own mark's clear space.** The mark gate measures clear space in the
  MARK's height (0.25, the brand manual's) while a tile's padding is measured in its CAPTION's
  size, and on a bug those units are three times apart: a balanced-density tile put 15px between
  the mark and the accent bar against a 15.6px need. The floor is now the mark's - on this type
  the mark IS the graphic, so the tile's air belongs to it - which costs the two tightest densities
  their horizontal difference and is the right trade.
- **And a badge with 4px of air.** The strap borrows its block-accent padding from the gap between
  its two lines; a bug has ONE line, so that expression collapsed. The alignment instrument read it
  as a near-miss (the block's edge 4px past its own word); on screen it is a badge somebody forgot
  to finish. A bug's badge padding is now a function of its own text.

After all three: **20 control rows, zero spacing findings, zero proportion findings, zero alignment
near-misses, zero mark findings, and every row animates** (15 motion frames and three clips each).

**A fourth was found by LOOKING, which is the part no instrument was going to do.** The bug's
`top-rule` accent rendered BETWEEN the mark and the caption rather than across the top of the tile:
the shared logo slot injects the mark as the box's first child (it must - a first-child insertion
is what renumbers a design's own `nth-child` rules), and the rule is written after it, so source
order decided. Every instrument passed it, because a rule one clear space from the text is a rule
one clear space from the text wherever it sits. It is a coherence defect rather than a spacing one:
**the same enum value has to mean the same thing on every graphic in the package**, or the claim is
only ever about colour. Fixed with `order: -1` rather than by fighting the slot's insertion point.

#### The palette rule finally reaches Pro - and what that says about the 26/30

**A requested brand palette is copied VERBATIM by the platform, never returned as prose by the
model.** Lite has had this since 2026-08-13 (`docs/AI_LITE_BRAND_PLAN.md` §3.1) and Pro did not:
`proBrandSection` stated the four hexes to the model and the model returned a palette, so "exactly
the brand's colours" rode on an echo that could fail three silent ways - a near-miss hex, an
omitted palette letting a default carry, or the legibility repair deleting the package.

Now `proBrandPalette` (pro/brief.ts) carries `GenerationSpec.brandColors` as DATA and
`resolvePalette` (pro/language/paint.ts) applies Lite's own split through `applyLiteBrandPalette` -
identity (accent, panel) verbatim, furniture (text, textDim) legibility-owned - with every
divergence recorded as an adjustment that reaches the ledger. The prompt still DESCRIBES the brand,
because a language decision needs to know what world it is in; what changed is that the identity is
no longer the model's to return.

**This changes what the §15.8 verdict covers.** The owner's 26-of-30 blind read measured the PROSE
version, on a bench brand that states its colours as a brand BRIEF rather than as a filled-in
palette - so it says nothing about how faithfully a *stated* palette now lands, and a later round
should not be read as confirming that.

#### The paid round - the package-coherence question

`node scripts/pro-spike.mjs --generate --arms=language --divergence-arm=language
--route=vercel:google/gemini-2.5-flash --max-cost=0.20 --out=pro-spike-out-phaseb-set news-public`
(the `pro-spike-out*` prefix is what keeps a round's 400-odd captures out of the repo - and the
round still has to be ARCHIVED outside the worktree before any cleanup, because ignored files die
with it.)

ONE brief, under FOUR brands - four design languages - each rendered as all three graphic types.
**Twelve graphics for four model calls, $0.021 of the $0.20 ceiling** ($0.0043-$0.0065 a language,
$0.0018 a GRAPHIC), because composing is deterministic: the package is what the one paid call
already bought. That is the economic half of the Phase A argument arriving as a number rather than
as a claim - and it is the number that says a package is not three times the price of a graphic.

What the machine measured, over 4 languages x 3 types:

| | result |
| --- | --- |
| contract (scaffold + fields + declared slot) | **4/4**, zero blocking errors |
| set members composing clean (bug + countdown) | **8/8** under their own calibrated thresholds |
| repair rounds | **0** (there is no repair loop on this path) |
| fields the model failed to answer legibly | **0** - every language came back complete |
| palette furniture repaired | 1 of 4 (`palette_text_dim_lightness_clamped`, the navy brand) |
| code audit | spine ok, region ok, **timeline editable on all four**, es5-drift 0, comments 24-25% |

**The divergence held, and it held harder than §15.8's.** Four brands returned four typefaces
(source-serif-4, anton, outfit, ibm-plex-sans), four accents, three different accent forms and
three motion characters - and one of them (`Ledger Report`) chose a **LIGHT package**, `#8a8a85` on
`#fafaf8`, which is the one thing the catalog's own variety audit says a style family cannot do
(`docs/CATALOG_VARIETY.md`: 148 designs cannot take a light palette). Not one look with the colours
swapped, which is the named sameness failure.

**One reading to carry forward, and it is not new.** The navy-monogram brand reports
`mark-own-background, ink-contrast` on its strap - the mark field FIRED correctly
(`mark_field_painted` is in its adjustments) and the rendered mark gate then sees a background
behind the mark and says so. The gate cannot tell a platform-drawn field from a mark that brought
its own, which is the §15.8 trigger working and the instrument describing it in the only vocabulary
it has. It is on the lower-third path and predates Phase B.

**The human read is owed and nothing here is a substitute for it.** The machine measured that the
composer works; whether four channels' worth of graphics look like four channels' packages is the
question `set-gallery.html` exists to be asked.

**The deliverable is `set-gallery.html`**: one row per design language, three graphic types side by
side, so the coherence claim is read in one glance. It is BLIND like the main gallery - rows keyed
by blind id, images blind copies - because "do these three belong to each other" must be answered
before anyone knows which brand or checkpoint produced them. Judge the ROW, not the graphics:
every graphic in an incoherent package can be individually fine, which is exactly why no
per-graphic gallery can ask this question.

**What is deliberately NOT done.** `PRO_SUPPORTED_CATEGORIES` still lists only the lower third:
that constant is the WIZARD's copy of what a user can reach, and the wizard has no way to ask for a
package yet. The engine composes three (`ProGenerateRequest.graphic`, one argument), and widening
the constant before the UI exists would leave the tier naming a graphic its own door cannot
produce - the failure `src/ai/AGENTS.md` already records against Pro's shipped copy.

---

## 16. The first REAL hosted generation - 2026-08-15, and what it settles

Hosted Pro went live for the owner and one cohort domain on 2026-08-14. The owner ran the first
real generation the next morning, from the wizard on a phone, using **one of the service's own
suggested prompts**. Ledger id `8e9a35eb-3df8-4d79-a089-083a7ed55c2b`.

**The verdict was UNUSABLE, and the gate said `usable`.**

### What arrived

The rebuilt panel - a name, a role, a dark rounded panel, a thin amber edge accent - was clean
and correct. **Behind it sat the same text baked into the artwork at roughly four times the
size**, clipped at both edges, with the tail of the name bleeding in from the right. The
familiar baked-text ghost.

### Why

The concept model draws the lower third AS PIXELS, text included. The compiler finds the text
regions, rebuilds the panel in CSS with live fields, and then tries to erase the baked original.
`eraseRegion` is a FLAT FILL: it erases where the backdrop is flat and refuses where it is not
(pinned by `e2e/pro.spec.ts`, "baked text outside panels is erased where the backdrop is flat,
refused honestly where not"). This ghost sat on a dark gradient, so the erase refused - honestly
- and left it. The rebuilt panel carries house type sizing while the ghost keeps the concept's
native scale, which is why the two disagree so violently.

### The part that is a defect rather than a limitation

`validation_rule_codes` came back EMPTY and the row says `usable`. **The compiler knew**: it
records the refusal in `ProCompileReport.warnings`, and nothing reads it. §14 already recorded
this for the benchmark - *a gate that measures the right dimension and discards the answer is a
scoring bug, not a blind spot*. This generation proves the same hole exists on the PRODUCT
surface, where the person on the other end is a student rather than a reviewer.

**The cheapest honest change: make an erase refusal blocking.** A graphic with un-erased baked
text outside its rebuilt panels must not be presented as usable. On the 2026-08-10 numbers that
would have caught three of the four broken frames. It does not produce a good graphic; it stops
the product asserting a broken one is fine.

### DONE 2026-08-15 - the refusal is a blocking code

`ProCompileReport` now records the refusal STRUCTURALLY (`bakedTextRefused`, the field labels;
`ringRefused`), and one seam - `validateProCompile` in `pro/compile.ts` - folds the
compiler's own findings into the injected gate's verdict. `pipeline.ts`, `stub.ts` and
`pro-bench.mjs` all go through it, so no engine can deliver a compile whose refusals were
never scored. Two codes, split by how badly the graphic is hurt:

| Code | Severity | What it means |
|---|---|---|
| `pro-baked-text` | ERROR, one per refused region | the concept's own words are still in the artwork under the live field - the graphic prints them twice |
| `pro-artwork-ring` | warning | a thin band of the concept's backdrop rides the edges over live video |

Consequences, in the order a user meets them: the wizard's result card says
`✗ N check(s) failing` instead of `✓ Passes SPX validation`, and the finding is shown as a
blocking ✗ rather than the ⚠ every unrowed finding used to wear; `reportProOutcome` sends
`failed` with `platform_validation` and the codes, so the ledger row carries
`validation_rule_codes = {pro-baked-text,…}` instead of nothing; and `pro-bench` scores it,
because `pass` reads `validation.ok`.

**Reproduced and measured on the checked-in fixture bank, free.** Before: 9/12 pass, and
`corporate` was one of them - two baked-text refusals in `report.warnings`,
`validationErrors: []`, `pass: true`, the §16 defect exactly. After: 8/12, `corporate`
failing on two `pro-baked-text` errors, `minimalist` and `multiline-title` (already failing
as SOURCE-LIMITED) now also naming the ghost, and **every one of the nine clean fixtures
unchanged**. Mutation-tested both ways in `e2e/pro.spec.ts`: dropping the error lets the
gradient case pass, and emitting a spurious one fails the flat case and the clean offline
pipeline.

**What this does NOT do.** It blocks nothing at the wizard's Create button and repairs
nothing - the compile is deterministic, so the honest advice stays "generate a new design".
And it is a browser-side verdict: the server records what the browser reports, which is the
same trust boundary every `pro-outcome` field already sits on (the SPEND is settled
server-side and is not affected).

### What it says about §15

**The panel the model designed was good.** Clean type, sensible hierarchy, restrained accent.
What wrecked the frame was the platform's reconstruction of it. §15.2 found that none of the
remaining failures were colour, typography, motion or brand; here even the composition was
sound. That is evidence FOR §15.4's option 3 - *the model decides a design language and the
platform renders it* - and against spending anything further on making raster reconstruction
work.

### Operational state

The cohort domain was cleared from the `arcada` plan the same hour, so no student can reach
Pro; the owner's own grant stands so the investigation can continue. The hosted ROUTE is
verified and correct and is not implicated: cost reconciled exactly (concept image $0.0671020 -
the documented flat rate - plus interpret $0.0184629, summing to the $0.0855649 on the
generation row), both settlements landed, the lease renewed, and the allowance moved.

**First real turnover: 62 s** (`runtime_ms` 61984). `AI_PRO_RETRY_SPACING_MS` is an unmeasured
8 s; Lite's own formula (turnover / retries) puts it near 31 s. One sample - re-derive after a
class rather than treating it as settled.

### SHIPPED 2026-08-15 - the composer IS the product path

`src/ai/pro/language/pipeline.ts` is now the only route from the wizard to a Pro graphic.
Pressing Create spends **one** forced structured text call on
`PRO_STANDARD_ROUTES.language` and then composes deterministically; nothing in the product asks
an image model for anything.

**Reproduced before it was rewired.** The shipped path was watched running through
`pro/stub.ts` into `compile.ts` (15 of 15 offline Pro specs green on the unmodified tree), and
`src/ai/pro/language/` confirmed to be imported by exactly two things, both bench-only:
`scripts/pro-spike.mjs` and `src/ai/spike/anchors.ts`. The rewire replaced that path rather
than adding beside it.

What ships with it:

| | before | after |
|---|---|---|
| model calls per generation | 2 (a concept IMAGE, then an interpretation) | **1** (text) |
| measured cost | $0.0777, 86% of it the flat image charge | ~$0.0055 (the §15.8 round's rate) |
| who composes the panel | the platform's raster reconstruction | the catalog's own assembler |
| browser cost ceiling | refuses the second call after the first overspends | **none, and none is possible** |
| ledger row on a repaired graphic | `usable`, `validation_rule_codes` EMPTY | `usable`, carrying the `pro-` codes |

**The browser ceiling is gone because the shape removed its job.** `PRO_MAX_GENERATION_COST_USD`
existed to stop the SECOND call once the first had spent the budget. With one call the money is
already spent by the time a browser could refuse it, and throwing then destroys a finished
graphic for no saving - the 2026-08-08 mistake exactly. The server's `pro-generate` booking
enforces the same constant and is the half a browser was never trusted with.

**The §16 hole is closed from the other side too.** `pro/language/gate.ts` is the one seam a
composed graphic is scored through, and it mints the platform's own divergences as findings:
`pro-palette-repaired`, `pro-mark-field`, `pro-language-fallback`, all WARNINGS, because each
describes a graphic that is airable *because* the platform intervened. `proRuleCodes` then sends
every ERROR unfiltered (an error is why a row says `failed`) and only `pro-` WARNINGS (the
runtime bench is chatty by design and the wire caps the list at 30, so bench noise would evict
the Pro-owned codes). A row can now tell a clean generation from a rescued one.

**Why the retired engine still exists**, per the requirement to say so explicitly. It moved to
`src/ai/pro/reconstruct/` behind a build-time import boundary
(`retiredProEngineRestriction`, `eslint.config.js`) that refuses it from every region of `src/`
a user can reach - mutation-checked from the UI and from `pro/language/`, and a per-file version
of the same rule was measured to be VACUOUS first, because the patterns match the import string
and missed the sibling form. Three reasons it was not deleted outright:

- **The fixture bank is the evidence for §16.** `scripts/pro-bench.mjs` replays it free and
  reproduces the defect that argued for Phase A. Deleting the engine deletes that check.
- **Deleting reaches outside this change.** `api/_lib/aiProProfile.ts` funds the image route,
  `api/_lib/admin/models.ts` and two api tests read `PRO_STANDARD_ROUTES`, and four `scripts/`
  entries plus a `package.json` script drive the engine - none of it owned here, and a live
  worktree is editing `scripts/` and `package.json` right now.
- **The precedent is the repo's own.** `creative/` is carried the same way, and that file says
  it: removing it is a separate, deliberate change. The order to do it in is
  `src/ai/pro/reconstruct/AGENTS.md`.

The one consequence worth naming: the server still funds `PRO_STANDARD_ROUTES.concept`, an image
route the product no longer calls. Funding is not spending, so it costs nothing - but it should
come off the funded list when the engine goes.

**Owed, and deliberately not done here:**

- **A real hosted generation.** This is verified by build, by the offline composer gates and by
  the configured walk's route interception - not yet by a graphic a person looked at. The
  configured suite needs `VITE_SUPABASE_URL` and `E2E_EMAIL`/`E2E_PASSWORD`, which this worktree
  does not carry, so it skips here and must run where they exist.
- **Pro's own example briefs.** The step still offers Lite's, which describe one strap; Pro now
  decides a language for a whole channel. One line, waiting on `claude/tier-promise-briefs-0e4d77`
  (TODO in `AiStep.tsx`). Inventing briefs locally would fork the bank a round is measured against.
- **A requested brand palette is still a prompt, not a lock.** Lite's ratified rule is that
  identity colours are copied verbatim by the platform and never left to the model. Phase A passes
  them in the brief, which is what the 26/30 round measured; making them verbatim is a real
  improvement and a behaviour change no round has read yet.

### The first REAL generation on the new engine - 2026-08-15, and two defects it found

Owner-authorised, run through the wizard on a configured deployment with nothing stubbed: a real
reservation, a real managed call, a real outcome, real ledger rows.

| generation | calls | provider cost | runtime |
|---|---|---|---|
| `8e9a35eb` - §16's unusable one | 2 | $0.0855649 | 62.0 s |
| `9ebc84f0` | 2 | $0.0898749 | 73.5 s |
| **`f21d6e23`** | **1** | **$0.0043211** | **12.3 s** |
| **`0740a885`** | **1** | **$0.0034336** | **9.9 s** |

**One call, ~$0.0039 a graphic - 22x cheaper and 6x faster**, `status: usable`, and the composed
document carries `.lower-third-box` / `.lower-third-accent` / `#f0`: the composer's own structure,
not a reconstruction. The estimate in §15.7 was ~$0.001-0.003; the measurement is $0.0039, close
enough that the estimate stands as a planning number.

`validation_rule_codes` and `adjustments` came back EMPTY, and here that is the honest answer
rather than §16's silence: no palette repair fired, no mark was uploaded, no field fell back. The
codes have a rendered test of their own (`e2e/pro-language.spec.ts`).

**TWO GENERATIONS WERE SPENT, NOT ONE.** The harness spec asserted a locator that does not exist
AFTER the product had finished, and Playwright's retry bought a second graphic. Worth recording
because it is the cheap version of an expensive lesson this file already carries twice: the run
that spends the money must take its evidence FIRST and assert afterwards.

**NO VISUAL READ YET.** The picture was lost to that same locator and the trace was overwritten by
the next run; a third attempt was refused by the allowance and charged nothing. §16's whole lesson
is that a graphic can pass every gate and still be unusable, so the human read is still owed.

**Defect 1: the allowance read-back promised a generation the gate refused.** The panel said
*"1 generation(s) left today"* while Create was disabled under
*"Your current NoaCG Pro allowance has been used."* An allowance is TWO counters - starts and
successes - and the note read the starts one while successes were spent. This is exactly the drift
`api/_lib/lite/status.ts` warns about ("the panel promises an allowance the reservation will not
honour"), arriving on the read-back side rather than the gate side. Fixed: the note reports the
BINDING number. The configured spec's fixture now sets the two counters DIFFERENTLY, because a
fixture where they agree cannot tell a panel reading the right one from a panel reading either -
mutation-checked by flipping `min` to `max`.

**Defect 2: hosted Pro is still gated on the RETIRED image route.** Availability requires every
route in the funded list to be priced, catalog-approved and not disabled from `/admin`
(`resolveProGate`), and that list is still `[concept, interpret]`. Funding an unused route costs
nothing, but **de-listing or disabling the image model would now take the whole tier down for a
pipeline that never calls it.** Dropping `concept` from `api/_lib/aiProProfile.ts` belongs with the
deletion pass in `src/ai/pro/reconstruct/AGENTS.md`.

**Turning hosted Pro on locally needs three env vars `.env.example` does not group together:**
`AI_PRO_ENABLED`, `IP_HASH_SALT` (>= 16 chars, or the ledger reads unconfigured) and
`AI_LITE_GATEWAY_PROVIDERS` (the audited gateway allowlist Pro shares). With the last unset,
`taskConfigured` is false for every route and the status endpoint answers `not-configured` - which
names the deployment rather than the missing variable.
