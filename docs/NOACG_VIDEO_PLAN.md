# NoaCG Video - frontier-level graphic video from cheap models

**OWNER-APPROVED DIRECTION, SCHEDULED BEHIND PRO PHASE 0.** Decided 2026-08-11: the video
generators (the "Video or animation with AI" surface) must produce broadcast-grade stingers,
intros, overlay animations and - later - silent explainer videos from a prompt plus the user's
logo and style guide, at frontier-model output quality, **served by cheap hosted models**. The
plan is written now; its first paid spike runs only after the Pro Phase 0 spike has run, so the
two programs share harness lessons and never compete for paid rounds.

**FIRST GOAL, narrowed by the owner 2026-08-13: ONE usable 2 s stinger transition.** Its
acceptance contract is **§2.2** and its reference case is a sports "to slow-motion replay"
sting. Everything else in this plan waits behind it; a stinger that works on air is the proof
the rest of the program is worth building.

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
2. **Intro / opener** (5-15 s, opaque, title + brand, music optional as a user-supplied file
   muxed into the output at render/export time - never generated. **No such mux path exists
   today**: the HyperFrames validator correctly bans `<audio>` inside compositions and the
   render manifest/worker carry no audio at all, so building the mux is named Phase A platform
   work, not an assumed capability).
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
  slot is part of the scaffold, not a prompt suggestion). Building this input is real Phase A
  work: today's video harness consumes no project brand at all.
- **"Style guide" v1 boundary:** the style input is the structured brand kit - logo, palette,
  typefaces, and the brief's own words. A freeform style guide (a PDF, reference frames,
  "match this look") has no ingestion path in this plan's early phases: cheap text routes
  cannot read it, and a vision route costs real money per generation. Reference-image style
  ingestion is a named later item (after Phase P, costed like the critic), so the product
  promise and the plan cannot quietly diverge.
- Audio never lives inside the composition (determinism). A user-supplied audio file may be
  attached to a render/export job and muxed into the output file - the Phase A mux path above.
  Stingers ship with their SFX or they are not stream-usable; a silent stinger export must be
  an explicit user choice, not a platform limitation.
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

### 2.2 The stinger acceptance contract (binding)

**The first goal of this whole program, narrowed by the owner on 2026-08-13: ONE stinger
transition, about 2 s, good enough to put on air immediately.** Everything else in the plan
waits behind it. The reference case is a sports "to slow-motion replay" stinger, because that
is the highest-volume real use of the type. This subsection is the bar that stinger is measured
against; it is what Phase A hardens and what §4.2's gates enforce.

**What a stinger IS** (four properties; all four are acceptance criteria, not preferences):

1. **Length 2-3 s, no longer. 2.0 s is the target.** Anything longer stops being a transition.
2. **It fully covers the frame for a clear window in the middle.** That window is where the
   video feed is swapped. Without it the transition reads as a jump cut, which is the whole
   failure the type exists to avoid. This is the §2.1 `cut window` property; it exists exactly
   for this, and the value has to be **reported to the operator in frames**, not merely
   validated.
   **Full cover is a SPAN, not an instant.** The switcher's trigger point is one frame, but
   the graphic has to be 100% opaque across the WHOLE frame for a span of frames around it:
   any gap, soft edge or sub-pixel seam lets the outgoing feed flash through, which is exactly
   the artifact the stinger exists to hide. The gate therefore measures **opacity per pixel on
   every frame of the span, never an average alpha** - an average passes a frame with a
   one-pixel transparent seam down the middle, and that seam is visible on air.
3. **The first frames and the last frames are completely empty (fully transparent).** This is
   what makes the animation appear out of, and disappear back into, the live picture. It is
   non-negotiable and it is a hard gate: alpha at frame 0 and at the final frame must be 100%
   transparent **across the whole frame**, not merely "mostly".
4. **A logo animating in - the company's or the programme's - is the conventional payload**,
   and it is the product promise: the same stinger must work in a client's own mark and colour
   world. A stinger that only looks good with one logo has proved nothing, so every corpus
   stinger is authored around a logo variable and reviewed against **five different brand
   marks** (§3.1).

**Where the cut window is declared.** Until `VideoDesignPlan` exists (Phase A), a composition
declares it on its own root, in composition seconds:

```html
<div id="root" data-composition-id="main" data-start="0"
     data-width="1920" data-height="1080" data-duration="2"
     data-cut-start="0.46" data-cut-end="1.12">
```

Phase A promotes those two attributes to the plan's `cutWindow` property unchanged, so the
corpus does not have to be rewritten. Nothing else about the design goes on the root.

**The frame arithmetic that makes "empty head and tail" testable.** The renderer seeks frames
`0 .. N-1`, so **frame 0 is t = 0 exactly and the LAST frame is t = (N-1)/fps, not t =
duration**. An exit that finishes at the declared duration therefore still paints on the last
rendered frame. The corpus resolves this by completing every exit at **1.92 s inside a 2.00 s
composition**, which leaves at least one fully clear frame at 25, 30, 50 and 60 fps
(last frame = 1.960 / 1.967 / 1.980 / 1.983 s). Entrances start from off-canvas positions
under `overflow: hidden` on the root, with a travel margin wider than the frame, so blur and
shadow tails are clipped too and frame 0 is empty by construction rather than by a fade.

**How the numbers map onto an ATEM** (the switcher this format targets). A stinger there is a
media-pool clip keyed over the background, and the switcher cuts or mixes the background
underneath it. Four settings, and our reported numbers feed three of them:

| ATEM setting | What it is | What we report |
| --- | --- | --- |
| Clip Duration | length of the clip in frames, **1-250** | total frames = round(2.00 x fps) |
| Trigger Point | the frame at which the background cut/mix begins | first fully covered frame + 2 frames of safety |
| Mix Rate | length of that mix under the animation | 0 (a hard cut) up to the cut window's own length |
| Pre-Roll | frames trimmed off the head of the clip | 0 - our head is already empty by contract |

The settings are interdependent: **Trigger Point + Mix Rate cannot exceed Clip Duration**, and
Pre-Roll + Clip Duration cannot exceed 255. The 250-frame Clip Duration ceiling alone caps a
60 fps stinger at 4.16 s, which is an independent reason the type is 2-3 s.

**The media-pool frame budget is per model and it is the real constraint.** Blackmagic states
that "depending on the model, motion graphics clips for animations and stingers can be up to
720 frames in 720HD, 360 frames in 1080HD and 90 frames in 2160 Ultra HD"; the ATEM Mini
Extreme is quoted at 400 frames in 1080HD, while an ATEM 1 M/E Production Studio 4K holds
about 180 frames at 1080 **shared between both clips**. So the binding worst case at 1080 is
roughly 90-180 frames, and a 2.00 s stinger costs 50 / 60 / 100 / 120 frames at 25 / 30 / 50 /
60 fps. Two consequences: 2 s at 50 fps fits every 1080 model in that range and still leaves
room for a second clip on the smallest pool, and the frame count must be **reported per fps**
rather than assumed - the same composition is a comfortable clip at 25 fps and an
over-budget one at 60 fps on the smallest pool.

**Delivery format.** The real target is a **transparent PNG sequence**, which is what a media
pool imports. That path already ships (`docs/RENDER.md`): PNG sequence ZIP (`frame-00000.png`,
zero-padded, STORE zip) and ProRes 4444 with alpha, both **signed-in tier only** (anonymous
users get mp4/webm/png-still), both capped at 30 s. So this is a path to **verify, not to
build**. Two things are genuinely unverified and are named Phase-A checks rather than assumed:

- ATEM's *stills* side accepts PNG, TGA, BMP, GIF, JPEG and TIFF, but the **video (clip) side
  is conventionally fed an uncompressed TGA sequence**; whether ATEM Software Control imports
  our PNG sequence into the clip side at all is untested.
- ATEM expects PNG transparency **premultiplied against black** (Blackmagic ships a Photoshop
  export plug-in precisely because a straight save often is not), and Remotion writes straight
  (unpremultiplied) alpha. Whether our frames need a premultiply pass is untested.

Neither is a build; both are a short test on the owner's hardware, and both must happen before
"exports to an ATEM" is claimed anywhere in the product. **For review during development, judge
the MP4** - it is easier to look at, and PNG-sequence correctness is a separate, later check.

**Transparent background VIDEO output (recorded, deliberately not tested yet).** WebM with
alpha and ProRes 4444 already exist in the export table and are the path a vMix/OBS/NLE user
takes instead of a media pool. They need their own verification round (alpha survival, codec
support per host, colour under the compositor). That is not part of this first goal and must
not be folded into it.

**The hard gates this contract implies** (built in the §4.2 work item, measured on rendered
frames, never on markup):

- **head/tail alpha:** every pixel of frame 0 and of frame N-1 is fully transparent;
- **cut-window coverage:** every pixel is fully opaque on **every frame** of the declared
  span - measured per pixel, never as an average or a sampled centre point;
- **duration honesty:** the timeline's length matches the declared duration, and the declared
  cut window lies inside it.

All three are silent killers on air and none of them is visible in a still, which is why they
are machine gates rather than review notes.

**The acceptance question for the first goal** is not a rubric: *would the owner cut to a
replay behind this, on air, today, in their own brand?* One yes is the milestone.

### 2.3 The delivery standard is a PICKED SETTING, never a prompt line

A stinger is only correct at the frame rate of the switcher that plays it, so the delivery
standard is a hard property of the customer's hardware, not a creative choice. **It must be a
control on a video surface, and it must never be something the user types into a brief.** A
user who has to remember to say "50 fps" will forget, and the failure is invisible until the
sequence drifts against the switcher on air. Keeping it out of the brief also keeps format out
of the model's hands entirely, which is the §2 division of labour.

- **The value already exists.** `FPS_OPTIONS` (`src/model/projectFormat.ts:134`) is
  `[25, 30, 50, 60]`, so the owner's 1080p50 ATEM is already a supported project format.
- **The gap is UI.** A video project's fps is only *displayed* today (VideoAppShell,
  SavedVideoProjects, VideoPlayerFrame) and is editable on no video creation or settings
  surface. The SPX side already has the control it needs - an fps `<select>` in
  `src/components/render/RenderPanel.tsx` - and the video path has no equivalent.
- **What to build:** a delivery-standard picker on the video creation surface, using **named
  presets**, because "1080p50" is what a broadcast user knows and "50" is not:
  **1080p50 (PAL/EBU), 1080p25, 1080p60, 1080p30**. The choice is project data and flows into
  preview, render and export, exactly like the SPX project format.

**KNOWN LIMITATION, deliberately not solved now:** `FPS_OPTIONS` is integer-only, so the
1000/1001 rates **59.94 and 29.97 do not exist anywhere in the platform**, and a US or Japan
customer therefore cannot deliver a correct stinger today. It is recorded here rather than
fixed because it reaches the project format, the render service and the frame budget at once;
scope it when the first non-PAL customer is real.

### 2.4 Design rules the corpus is held to (owner review, 2026-08-13)

The first three exemplars were reviewed and called usable; three rules came out of that review,
and they bind everything authored afterwards - including anything a model is later asked to
produce.

**1. The mark goes on the field. Never on a plate.** A logo framed in a box is a picture of a
logo. Nothing may sit behind the mark to make it legible - not a card, not a panel, not a
rounded chip. The tone answer is that the brand supplies a **field colour that suits its own
mark's ink**: a dark-ink monogram gets a light field, a light-ink lockup gets a dark one. Where
a design's surface genuinely cannot carry a mark, the honest answer is that the design refuses
that mark - the same conclusion the Lite brand work reached about slot surfaces - not that the
mark gets a sticker. The first version of the corpus declared a `brandPlate` variable for
exactly this; it is deleted, and `scripts/stinger-review.mjs` refuses to build a composition
that reintroduces one.

**2. The cover must be an EVENT, not a parked panel.** A surface that slides in and then sits
still for the length of the window is a slate with a wipe on each end. The frame should be
filled by something that keeps happening - a reveal that runs through the window, a burst, a
shatter, a distraction that earns the cut. Nothing in the covered stretch may be static.

**3. The mark should help PRODUCE the cover wherever the design allows.** The strongest form of
this type is one where the logo is the mechanism: it flies in over the live picture and the
field bursts out from behind it, or it grows until the frame is gone. `logo-punch` in the
corpus is the demonstration; `replay-slab` is the softer version of the same idea - the mark
crosses the picture first and the slab arrives behind it.

**4. Before the cover, the mark is ALONE on the live picture.** Nothing else may paint over the
outgoing feed during the entrance - no accent streak, no expanding outline, no flourish. On the
feed, a viewer has no way to tell decoration from a fault, so anything that is not the mark
reads as an artifact. Found the expensive way: `logo-punch` ran an accent streak and an
expanding accent ring ahead of its burst and both were read on review as "blue outlines flying
in, definitely a mistake". Decoration is legal only once the frame is covered. **The covering
surface's own leading edge is not an exception** - the accent rule on `replay-slab`'s slab and
on `ink-sweep`'s bands is the boundary of the cover itself, and reads as the wipe. What the
rule forbids is a free-floating flourish with nothing behind it.

**The same rule applies on the way OUT, against the incoming picture.** A lockup that emerges
from behind the retreating cover is the identical defect one beat later. `ink-sweep` keeps it
structural rather than remembered: the lockup exits 2600 px on the same duration and ease as
the ink's 2500 px, so it cannot outrun the edge it hides behind.

**5. The cover does not have to be a full-frame rectangle** - but it does have to be a full
cover. These two are easy to confuse. §2.2's coverage gate is non-negotiable for a stinger used
as a TRANSITION, because the switcher cuts underneath it; what is free is the *shape and origin*
of the covering surface. A mark's own ink flooding out from its silhouette, a solid emblem
scaled past the frame edges, a burst - all of these satisfy the gate without a panel arriving
and parking. `ink-sweep` is the corpus's demonstration: the mark is the brush tip and brand ink
lays down behind it in ragged bands, so you only ever see cover where the mark has already
been. **The honest limit:** a mark made of outlines and strokes (Aldervale's rings, Kestrel's
skeleton letterforms) has no solid mass to fill a frame with, so a design that covers using the
mark's own silhouette has to declare which mark shapes it can take, exactly as §2.4 rule 1
makes a design declare the ink tone it can take. That is why `ink-sweep` covers with ink the
mark LAYS DOWN rather than with the mark itself - the trail works for every mark in the swap
set. A logo that only flies over the picture without ever covering is a **logo sting**, a
different graphic type - useful, and worth its own entry in the §1.2 order, but it cannot be
sold as a transition.

**A sixth rule, about the review rig rather than the design:** review one composition per page
with a **mark picker**, never one page per mark. The rig's first version wrote 3 x 5 pages and
four of every five added nothing, because the marks were all used the same way - the extra
pages showed the same animation with a different picture in it. Per-mark variants earn their
place only when the design does something different with each mark.

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

**Where it lives:** `src/ai/video/corpus/`, one directory per graphic-video type, one complete
`.html` composition per exemplar, plus a `README.md` recording what each one is for and which
direction it covers. It sits under `src/` and not under `benchmarks/` because retrieval will
import these files (`?raw`) at runtime; the bench reads the same files, so the anchor arm and
the retrieval corpus can never drift apart. Nothing imports them yet.

### 3.1 The brand-swap arm (why the corpus is authored around a logo variable)

The product promise is that a client gets a stinger in **their own** mark and colours, so an
exemplar is only proved when the same composition survives a brand swap. Every corpus stinger
therefore declares a logo image variable plus colour variables, and is reviewed with **five
distinct synthetic marks** - swapped live from a picker on the composition's own review page
(§2.4's fourth rule), never as five near-identical pages.

**Each mark brings its own field colour**, which is the entire tone answer now that §2.4 bans
plates: the mark's ink and the field it sits on are supplied together, by the brand.

**They must vary in SHAPE, not just colour** - the slot's job is surviving different aspect
ratios and ink densities, and five recolours of one silhouette prove nothing about whether a
client's mark will fit. The five shape classes:

| class | mark | aspect | why it is in the set |
| --- | --- | --- | --- |
| compact monogram | The Aldervale Institute | 1:1 | the narrowest mark a slot has to fill |
| wide wordmark | Kestrel Athletic | 4.17:1 | the widest; breaks height-driven slots |
| square emblem, fine detail | Sunbeam | 1:1 | thin spokes that vanish when scaled down |
| tall, own opaque field | The Ledger | 0.8:1 | portrait, and it brings its own surface |
| long name, two-part lockup | Northbridge Community Broadcasting | 7.5:1 | the longest name, light ink |

The first four already exist as `benchmarks/pro/v1/spike/marks/*.svg` (built for the Pro brand
round) and are reused rather than duplicated; the fifth and the index of all five live in
`benchmarks/video/v1/marks/`. All five are invented organisations - no real brand marks enter
the repo.

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
- **head/tail alpha (stingers): frame 0 and frame N-1 fully transparent across the whole
  frame** - the §2.2 non-negotiable, and the one gate the frame arithmetic there exists for;
- cut-window coverage: full-frame opacity on every frame of the declared stinger cut span,
  measured per pixel (§2.2 - an average alpha passes a one-pixel seam that flashes on air);
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
output larger, so the working budget is set from measured Phase 0 usage, not assumed). The
ledger counts **tokens and render-service spend** - a repair round that re-renders MP4s costs
sandbox minutes, not just tokens. And the binding affordability constraint is **output
length**, not route price: cheap routes cap output tokens well below what a long composition
needs, which is exactly why explainers are Phase E and why Phase 0 records the output-token
distribution per brief.

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
- **Measurements that outlive the spike:** the output-token distribution per brief and the
  render-service cost per candidate are recorded regardless of the go/no-go verdict - they set
  the §5 affordability budget and the Phase E feasibility read.

**Stop if** the cheap arms show no compositional judgement even with exemplars: then the honest
options are raising the served price, or waiting for cheaper-stronger checkpoints - record the
evidence and stop, rather than building infrastructure to launder a taste gap.

---

## 7. Delivery phases

Phase letters to avoid colliding with Pro's numbered phases in conversation. Nothing before
Phase P touches a product surface; the Student release keeps priority.

- **Phase 0 (spike):** §6. Gate: go/no-go on human review.
- **Phase A (stinger/intro/overlay contract):** the stinger half of this phase is specified by
  **§2.2**, which is the acceptance contract for the program's first goal - including the two
  untested ATEM delivery questions (PNG into the clip side, premultiplied alpha), the
  frames-per-fps report the operator needs, and the **delivery-standard picker** (§2.3 - the
  one product-surface item this phase owns, because a stinger at the wrong frame rate is
  wrong no matter how good it looks). Then harden the scaffold boundary, the three
  `VideoDesignPlan` properties (§2.1), the video-specific gates (§4.2), the render-set
  builder, the project-brand input into the harness (§2 - none exists today), and the
  **audio mux path**: a user-supplied audio file attached to a render/export job via the
  manifest and muxed by the render worker, never an element inside the composition. Gate: the
  bootstrap corpus and the promising spike cases compile, validate, render, loop and export
  correctly - a stinger with attached SFX plays with sound in OBS/vMix - and humans confirm
  the contract did not flatten what passed the spike.
- **Phase B (evaluation contract):** rubric, dev bank, locked holdout, fixtures, cost ledger,
  panel - shared with Pro Phase 2 where possible (same reviewers, same gallery tooling, video
  rubric added). The dev bank includes a **refinement section** - follow-up edits to an
  accepted result ("bigger logo", "slower entrance", "different color world") - because the
  product surface is chat refinement, and a system judged only on first generations has not
  been judged on how users actually use it. The locked holdout stays first-generation. Gate: a
  zero-spend dry run detects seeded defects and calibrates the premium band from the anchors.
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
  extension of `VideoDesignPlan` - each grown under the §2.1 evidence rule. It also needs its
  own **cost model**: a 30-120 s explainer does not fit one cheap generation's output cap, so
  a scene is likely its own generation and cost scales per scene - orchestration (scene plan
  -> per-scene generation -> assembly) and its measured per-explainer cost are part of the
  phase gate, not an afterthought. Its own brief bank, corpus additions and blind round; a
  stinger verdict transfers nothing.
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
