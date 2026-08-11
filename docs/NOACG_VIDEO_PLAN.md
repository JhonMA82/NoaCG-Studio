# NoaCG Video - frontier-level graphic video from cheap models

**OWNER-APPROVED DIRECTION, SCHEDULED BEHIND PRO PHASE 0.** Decided 2026-08-11: the video
generators (the "Video or animation with AI" surface) must produce broadcast-grade stingers,
intros, overlay animations and - later - silent explainer videos from a prompt plus the user's
logo and style guide, at frontier-model output quality, **served by cheap hosted models**. The
plan is written now; its first paid spike runs only after the Pro Phase 0 spike has run, so the
two programs share harness lessons and never compete for paid rounds.

This is the video counterpart of `docs/NOACG_PRO_PLAN.md`. Where a rule there applies unchanged,
this document references it instead of restating it. The two programs share one philosophy:

> A specialized system - retrieval of excellent complete exemplars, a minimal intent contract,
> deterministic compilation, render-inspect-repair, and human visual gates - can lift a model far
> beyond its unaided output inside one narrow domain. The system is the product; the model is a
> replaceable part.

The difference is the economic claim. Pro asks whether an **open-weight** checkpoint plus the
system can match frontier models. Video asks whether a **cheap hosted** model plus the system can
match what a frontier model produces on the same brief - because hosted video generation must be
servable at Lite-tier prices (see the model-cost policy: cheap hosted routes by default, frontier
only through a user's own key).

**Never in scope: generative video models.** No diffusion/video-synthesis model produces frames,
ever. The model writes code; Chromium and the render service produce every pixel. That is what
makes output editable, deterministic, brand-exact and free of per-second generation cost.

---

## 1. The claim and the boundary

**The claim:** for graphic video - stingers, intros/openers, overlay loops, and later silent
explainers - a cheap hosted model inside the specialist system produces results a blind panel
judges at parity with a frontier model run through the same scaffold, and inside the premium band
set by human-authored anchors.

The claim is plausible for the same reason Pro's is: the platform removes almost everything but
taste from the model's job. NoaCG supplies the composition contract, the animation runtime, fonts,
brand values, validation, rendering and repair evidence. Retrieval supplies proven designs.
What remains - composition, type, color, motion character - is exactly what three prompt-surgery
rounds (2026-07-17/18/21, `docs/VIDEO_DESIGN_QUALITY_PLAN.md`) improved but never made premium.
The missing mechanisms are the ones Pro identified: complete exemplars, a real render-inspect
loop judged by humans, and blind evaluation against anchors - none of which the video harness has
today.

### 1.1 Engine decision: HyperFrames is canonical

The quality program targets the **HyperFrames engine** (standalone HTML + CSS + GSAP
compositions, `src/video/hyperframes/`). Reasons, decided 2026-08-11:

- It is the same design language as the graphics catalog. Design DNA, typography, palette and
  motion vocabulary transfer directly; a graphics exemplar and a video exemplar are readable by
  the same eye and eventually retrievable by the same engine.
- One motion vocabulary (GSAP timeline) across graphics and video, driven by the same virtual
  clock at render time.
- Compositions are portable, self-contained files - consistent with "code is real and always
  available".

Consequences:

- **Remotion stays a supported engine and export target.** Nothing built here breaks it. But new
  quality investment (exemplars, contract, critic, retrieval) is HyperFrames-only; Remotion is
  not brought along brief-for-brief.
- Whether HyperFrames becomes the product **default** engine is a Phase 5 owner decision, made
  after the program proves quality - not a side effect of this plan.
- The HyperFrames v1 limitations recorded at merge (no media clips, no sub-compositions, image
  variables reload the preview) are platform vocabulary this program will press on; §7 names
  which phase grows what. HyperFrames output quality has **never been measured with a real
  model** - every HF generation test to date ran on the offline stub. Phase 0 is that first
  measurement.

### 1.2 Initial scope and expansion order

Graphic-video types enter one at a time, each with its own contract, fixtures and blind round -
the same discipline as Pro §1.1. The order:

1. **Stinger / logo sting** (2-5 s, usually transparent, one-shot or loop; the wipe variant has
   a full-cover cut window) - closest to a graphic, deepest existing evidence.
2. **Intro / opener** (5-15 s, opaque, title + brand, music optional as user-supplied audio
   under the existing render audio path - never generated).
3. **Overlay loop** (seamless-loop ambient graphics: tickers, backgrounds, frames, bugs).
4. **Silent explainer** (30-120 s, multi-scene, text-driven; no narration, no TTS - a later plan
   may add narration timing, this one does not).

Explainers are last on purpose: they need scene/beat structure and sub-composition vocabulary
the platform does not have yet (§7 Phase E). A stinger success is not silently an explainer
success.

### 1.3 Non-goals

Everything in Pro §1.2, plus:

- No generative video/image model in the pipeline, including "just for backgrounds".
- No narration, TTS or audio generation; audio is user-supplied files only.
- No per-frame or per-shot model calls; one generation authors the whole composition.
- No parallel scene format: the HyperFrames composition (HTML + one paused timeline +
  `data-composition-variables`) stays the single source of truth.
- No silent model upgrade as the quality fix: the served route stays cheap; quality comes from
  the system or it does not ship.

---

## 2. Output contract

The platform owns engineering; the model owns taste - Pro §2, translated to video:

- The result is one valid HyperFrames composition: readable HTML/CSS, one paused GSAP timeline
  registered at `window.__timelines[id]`, `data-*` clip timing, editable inputs declared as
  composition variables, assets referenced by logical name (`asset:<name>`).
- Deterministic and seek-safe: any frame renders identically from a cold seek; no wall-clock
  reads, no rAF-dependent state, no network, no CDN. Fonts and GSAP ride bundled, as today.
- Canvas is the declared production resolution (1920x1080 default) with transparency honored
  for stingers/overlays; alpha survives to the ProRes/WebM export path.
- Brand is data, not decoration: the user's logo asset, palette and typefaces enter as
  composition variables and assets; a generation without the logo it was given is a hard
  failure (the Lite lesson: a rule without a contract property is dead teaching - the logo
  slot is part of the scaffold, not a prompt suggestion).
- Editability survives: the Content panel edits declared variables live; regenerating preserves
  user-edited values (`mergeVideoInputs` behavior is contract, not accident).
- The model authors only the creative region of a platform-emitted scaffold; variable
  declarations, asset wiring, timeline registration and export glue are compiled
  deterministically, mirroring Pro §2.3.

### 2.1 The minimal `VideoDesignPlan`

Phase 0 runs without any plan contract. If the spike passes, a small transient wire object
carries only what creative code cannot safely coordinate with platform behavior - the Pro §4
growth rule applies verbatim (every property needs rendered-failure evidence, or it is removed).
The candidate initial properties, each already motivated by a known failure class:

- **duration and loop mode:** one-shot / seamless loop / hold-last - the platform must know this
  to render, export and (for loops) verify the seam;
- **cut window (stingers only):** the interval during which the frame is fully covered, so a
  switcher can take the cut behind the wipe - operators need it surfaced, validators must check
  full coverage during it;
- **transparency:** transparent or opaque canvas, decided before generation, verified at export.

Nothing about scenes, layers, shapes, colors, type or easing goes in the plan. HTML/CSS/GSAP
owns those, exactly as HTML/CSS/SVG does in Pro.

---

## 3. Exemplars - the corpus must be built first

Pro retrieves from a 460-design catalog. **Video has no catalog** - five offline stub samples
are the entire corpus. This is the program's largest structural gap and its first deliverable:

- **Bootstrap corpus:** 10-20 hand-authored, excellent HyperFrames compositions covering the
  Phase A types (stingers, intros, overlay loops) across genuinely different visual directions -
  authored by distilling the graphics catalog's design DNA (`referenceCards.ts` already maps
  briefs to catalog families) plus broadcast reference study, and reviewed by the owner before
  any of them anchors a round. Zero model cost; real authoring effort. These double as the
  human-authored **anchor arm** for every blind gallery.
- **Retrieval:** two or three complete exemplar compositions per brief, chosen by the same
  shortlist discipline as Pro §5 (structural compatibility first, one different visual family
  when available, provenance recorded). The corpus is small enough that retrieval starts as a
  deterministic keyword/type map - the existing `referenceCards.ts` mechanism generalized from
  "design-DNA cards" to "complete compositions" - and joins the shared retrieval engine only
  when the corpus is big enough to need ranking.
- **Copying policy:** Pro §5.2 verbatim - similarity is a provenance alarm, never an optimized
  distance; humans judge whether an output transformed its exemplar.
- The corpus grows from accepted generations only through human review, which later feeds the
  Pro Phase 6 fine-tune track with video traces as well.

---

## 4. Render, inspect and repair

The evidence hierarchy is Pro §6.1 verbatim: deterministic checks establish correctness, a
critic (later) localizes likely defects, humans establish quality. Video changes what is
rendered and reviewed:

### 4.1 The render set

**Motion is the product, so motion is what gets reviewed.** Every candidate produces:

- a frame strip at deterministic virtual-clock timestamps - entrance, each beat, settled
  mid-point, exit, and for loops the seam pair (last frame vs first frame);
- an actual rendered MP4/WebM through the real render service for human review - a strip alone
  cannot judge easing character, and live playback in an undisplayed pane or headless rAF is
  known-false evidence (two past rounds mis-read frozen rAF as broken output);
- transparent candidates rendered over checkerboard and over real video-like footage;
- variable stress: normal, long, empty and non-Latin values through the declared inputs;
- brand stress: the user logo swapped for wide/tall/low-resolution variants.

### 4.2 Deterministic gates

Reuse, in the HyperFrames path, everything the video world already has: composition validation,
the live probe, and the four shared readability checks (contrast, glyph overlap, occlusion,
clip). Add the video-specific gates this program needs:

- loop seam check: pixel delta between last and first frame of a declared seamless loop;
- cut-window coverage: full-frame opacity throughout the declared stinger cut window;
- stuck-pose and dead-air checks: no interval longer than N ms where nothing moves during a
  declared motion phase (thresholds set per type from the anchor corpus, not invented);
- duration honesty: timeline length matches the declared duration;
- alpha honesty: a transparent composition never paints an accidental full-frame backdrop.

A critical gate failure rejects before visual review, and passing establishes only "correct
enough to inspect" - Pro §6.3.

### 4.3 Bounded repair and the critic

The existing two-round repair ceiling stays. Repairs receive the failing evidence (including
the rendered frames at the failing timestamps) and patch the smallest responsible region.
A visual critic is a Phase D question, calibrated exactly as Pro §6.4 requires - and given the
cheap-model constraint, the critic is where a cheap vision route gets its own calibration round
before it is trusted at all.

---

## 5. Evaluation - what "frontier level from a cheap model" means

The comparison is final rendered videos from the same briefs under declared bounded workflows,
blind-shuffled with anchors. Structure follows Pro §8; the arms differ:

1. **Human-authored anchors** - the bootstrap corpus compositions populated for the brief; the
   absolute premium band.
2. **The cheap-route system** - the product claim: pinned cheap hosted model + full system.
3. **Frontier baseline** - the best available frontier model through the *same* scaffold,
   retrieval and repair budget; paid, owner-capped per round. This is the parity target, not a
   runtime fallback.
4. **The shipped harness today** - current prompts, no exemplars; the "does the system actually
   move anything" control.

Human judgement follows Pro §8.3 including the panel and degraded-panel rules; the primary
question becomes: **would you put this on your stream or broadcast as-is after entering your
brand?** Release gates mirror Pro §8.4 with the video-specific zero-tolerance list: no dead-air
holds, no broken loop seams, no missing supplied logo, no illegible text at any reviewed
timestamp, no motion that never resolves to a readable settled state.

Cheapness is a gate, not a footnote: the served route's cost per accepted output is recorded
every round, and a round that only passes on a route too expensive for the hosted tier has not
passed (the Lite economics: ~$0.0003/generation text routes exist; video briefs are longer and
output larger, so the working budget is set from measured Phase 0 usage, not assumed).

---

## 6. Phase 0 - the spike (first implementation slice, queued behind Pro Phase 0)

One question, answered cheaply:

> When a cheap hosted model receives a good brief, the HyperFrames scaffold and two or three
> excellent complete exemplar compositions, does its rendered motion show enough broadcast
> judgement to justify building the specialist system - and how far behind a frontier model on
> the same footing is it?

Protocol, reusing Pro §0 discipline:

- **Zero-token control first:** one known-good hand-authored stinger composition through the
  complete wrapper - scaffold, render, gates, frame strips, MP4, gallery. If the control looks
  broken, the harness is broken (two paid rounds have been voided by exactly this). The control
  also proves the one genuinely new wiring: `video-bench.mjs` gaining an engine option (it
  drives Remotion only today) and virtual-clock frame-strip capture in the bench path.
- **Brief bank:** 12 briefs - 6 stingers (mix of transparent/opaque, one-shot/loop/wipe),
  4 intros, 2 overlay loops - each with a real logo asset and palette, including at least two
  briefs reusing the existing wizard example chips so today's output is directly comparable.
- **Arms:** cheap route with exemplars, cheap route without exemplars (the transfer-vs-taste
  probe, Pro's paired-arm lesson), and - only if the owner approves the extra cap - one frontier
  arm on the same scaffold for an early distance read. One or at most two pinned cheap
  checkpoints, chosen through the existing model discovery/compatibility filter
  (`docs/VIDEO_MODEL_BENCHMARK.md`).
- **Exemplar prerequisite:** at least 6 of the bootstrap corpus compositions (2 per Phase-A
  type) must exist and be owner-reviewed before the spike; authoring them is the pre-spike work
  item and spends no tokens.
- **Review:** anchor-mixed blind gallery of rendered MP4s and frame strips; human notes written
  before machine verdicts are revealed; the go/no-go read mirrors Pro §0.3 - at least half the
  exemplar-arm results show deliberate, coherent motion design worth refining, at least a
  quarter airable or one localized repair away, real variety across the set, scaffold contract
  survives in at least 9 of 12, and passes are not exemplar near-copies. An exemplar arm that
  passes while the no-exemplar arm collapses is transfer, read as ambiguous, probed with the
  second checkpoint.
- **Spend:** cheap-route arms are estimated low single-digit dollars; the optional frontier arm
  dominates any cap. Exact route and cap approved explicitly before the round, per standing
  rule. This document schedules the spike; it does not authorize spend.

**Stop if** the cheap arms show no compositional judgement even with exemplars: then the honest
options are raising the served price, or waiting for cheaper-stronger checkpoints - record the
evidence and stop, rather than building infrastructure to launder a taste gap.

---

## 7. Delivery phases

Phase letters to avoid colliding with Pro's numbered phases in conversation. Nothing before
Phase P touches a product surface; the Student release keeps priority.

- **Phase 0 (spike):** §6. Gate: go/no-go on human review.
- **Phase A (stinger/intro/overlay contract):** harden the scaffold boundary, the three
  `VideoDesignPlan` properties (§2.1), the video-specific gates (§4.2), and the render-set
  builder. Gate: the bootstrap corpus and the promising spike cases compile, validate, render,
  loop and export correctly, and humans confirm the contract did not flatten what passed the
  spike.
- **Phase B (evaluation contract):** rubric, dev bank, locked holdout, fixtures, cost ledger,
  panel - shared with Pro Phase 2 where possible (same reviewers, same gallery tooling, video
  rubric added). Gate: a zero-spend dry run detects seeded defects and calibrates the premium
  band from the anchors.
- **Phase C (cheap-model tournament + retrieval):** systematic cheap-checkpoint comparison on
  the dev bank; exemplar ablation; corpus growth to ~30 compositions. Gate: a pinned cheap
  route holds a high structural-validity rate and human review confirms Phase 0's visual level
  at scale.
- **Phase D (critic + repair + frontier comparison):** calibrated cheap visual critic, seeded
  defect suite (dead air, broken seams, lost logo, unreadable text, stuck poses), locked-holdout
  round against all four §5 arms. Gate: §5 release gates.
- **Phase P (product):** the wizard video strip serves the HyperFrames system route as the
  quality tier; engine default becomes an explicit owner decision; identical fixture/replay path
  in product and bench (Pro's rule: bench quality must survive integration unchanged).
- **Phase E (silent explainers):** only after Phase P for the short types. Needs platform
  vocabulary first - sub-compositions (scenes) in the HyperFrames runtime and a scene/beat
  extension of `VideoDesignPlan` - each grown under the §2.1 evidence rule. Its own brief bank,
  corpus additions and blind round; a stinger verdict transfers nothing.
- **Phase F (fine-tune):** video traces join the Pro Phase 6 dataset under the same entry gate
  and provenance rules; no separate video fine-tune program.

Every phase ends with rendered video in front of humans before its gate is called passed, and
any wrapper change re-runs the zero-token control. Stop rules follow the Pro phase table's
pattern: a contract that starts describing how the video looks, a critic that agrees with the
creator against humans, or a repair loop that needs more than two rounds stops the phase.

---

## 8. Risks specific to video

| risk | test | response |
| --- | --- | --- |
| Harness bug reads as model failure (rAF-frozen panes, ghost stores, stale bench wiring) | zero-token control run, re-run after every wrapper change | fix harness first; a round judged on a broken wrapper is void |
| Cheap models can't hold a long composition in one generation | Phase 0 structural-validity count; output-token ceiling per checkpoint in the compatibility filter | scaffold more / generate less per call before concluding taste failure |
| Frame strips hide bad easing | mandatory rendered MP4 review in every gallery | strips are for defects; MP4s are for judgement |
| Loop seams and cut windows pass gates but fail on air | seam/coverage gates measured on rendered frames + OBS/CasparCG walkthrough in Phase P | the gate list grows from real playout failures, not speculation |
| Exemplar corpus encodes one author's taste | multiple visual directions per type, owner review, concentration diagnosis (Pro §5.4) | commission/curate outside directions before growing the system |
| Cheap route quality decays when the checkpoint is deprecated | pinned checkpoints + the discovery snapshot; re-run the locked gate on any route change | route changes are promotions, never silent swaps |
| Explainer scope creeps into Phase A | §1.2 order is binding; sub-compositions stay banned until Phase E | reject scene-shaped briefs from the early banks |

---

## 9. Relationship to existing work

- `docs/VIDEO_DESIGN_QUALITY_PLAN.md` (2026-07-18) remains the record of the prompt-surgery
  era; its open items (text-clip check, repair-prompt quoting, chip re-pointing) fold into
  Phase A rather than being done twice.
- `docs/VIDEO_MODEL_BENCHMARK.md` is the transport/discovery layer this program selects cheap
  checkpoints through; it stays authoritative for gateway, env and compatibility filtering.
- The readability gates, font bundling, render service, virtual clock and player-host isolation
  are reused as-is; this plan adds no second pipeline.
- The Remotion harness keeps working for its users; it receives fixes, not the new quality
  system. If the program succeeds, Remotion's role narrows to what genuinely needs React
  compositing - an owner decision at Phase P, recorded then.
