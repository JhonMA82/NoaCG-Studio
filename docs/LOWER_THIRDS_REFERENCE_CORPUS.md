# The lower-thirds reference corpus - what is in it, what it measured, and what to do with it

Source folder: `C:\claude\NoaCG-Studio\example-lowerthirds` (not in the repo - it is ~170 MB of
commercial packs and showreels). This document is the repo-side record: what the material contains,
what a first pass actually measured off it, and the ranked plan for turning it into harness work.

**Read `docs/DESIGN_PRINCIPLES.md` first.** Everything below is organised by its ranking - remove
the decision > make it measurable > state a boundary > state a judgement - because this project has
already measured that prose moves a defect rate by roughly zero. A corpus is not teaching material
by default. It becomes teaching material only at levels 1-3.

---

## 1. What is actually in the folder

| Item | Format | Usable how |
| --- | --- | --- |
| `lower-third-showreel.mp4` | 1920x1080, 30 fps, 214 s | **Primary design corpus.** The "TYPO Pack" motion-graphics library. ~35-45 distinct name-title treatments, most shown settled for 2-4 s over live footage. Exact count is Phase A work. |
| `sport-graphic-showreel.mp4` | 960x540, 25 fps, 109 s | **Primary field-set corpus.** An Envato football package: match clock + score bug, team-vs-team strap, player strap, substitution, card, goals list, stats panel, sponsor bug - several on screen at once. Low resolution; good for structure and field vocabulary, not for type measurement. |
| `Clean-Lower-Thirds-Play-FX/…/*.mogrt` x8 | Premiere Motion Graphics Template (a ZIP) | **Fully machine-readable.** `definition.json` is the operator-facing parameter contract; `thumb.png` is a still. Read directly - no Premiere needed. |
| `gradient-lower-thirds-lepelka/…/Element NN.mov` x40 | QuickTime RLE, ARGB, 1920x1080, 4.63 s | **Fully machine-readable motion.** Straight alpha. Per-frame alpha bounding box gives the real timing curve of each shape build. |
| `social-media-lower-thirds-media-stock/*.aep` | After Effects binary project | **Partially readable.** Comp/layer names parse out of the `Utf8` chunks (verified). Keyframes and geometry do not, without AE. Low priority. |
| `Support/Tutorial.mp4`, `Media-Links.txt` | - | Font and asset provenance only. Fonts named: Unbounded (SemiBold), Albert Sans (Light / ExtraLight). |

**On the After Effects and Premiere packs:** the mogrts and the alpha MOVs are worth more than the
AEP, and both are already readable without opening Adobe. Do not spend effort on the AEP. If more
fidelity is wanted later, the cheap owner-side action is rendering the ten to fifteen designs we
actually pick (§5), not the whole pack.

---

## 2. What the first pass measured

### 2.1 The professional operator contract (exact, from the eight mogrt definitions)

Every one of the eight ships the same shape. Comp is inferred as 3840x2160 (every "global"
control defaults to 1920,1080 and the type sizes only make sense at that scale).

```
Global Settings   position, scale, rotation          (the whole graphic, one handle)
Text 1            source text + font + size + position + scale + rotation + line spacing
Text 2            same
Text 3            same
Elements Settings position + scale per decorative element (Line, Box, Image)
Color Settings    one colour per element and per text run
```

Measured type sizes (px in a 2160-tall comp, and as a fraction of frame height):

| Pack | Text 1 | Text 2 | Text 3 | T2 as % frame H | step T2:T3 |
| --- | --- | --- | --- | --- | --- |
| 01 | 125 | 165 | 90 | 7.6% | 1.83 |
| 02 | 125 | 165 | 75 | 7.6% | 2.20 |
| 03 | 125 | 165 | 65 | 7.6% | 2.54 |
| 04 | 110 | 165 | 80 | 7.6% | 2.06 |
| 05 | 140 | 85 (2 lines) | - | 6.5% | 1.65 |
| 06 | 140 | 170 | 45 | 7.9% | 3.78 |

Three findings that are worth more than they look:

- **The dominant line is 7.6% of frame height, and it is the SURNAME, not the first name.** The
  same 165 px on five of six packs, hand-set. Our catalog's floor work
  (`scripts/type-floor.mjs`) has never been compared against an external band.
- **The type step is 1.8-3.8, not the 1.2-1.5 a generated design tends to reach for.** Principle 1
  in `DESIGN_PRINCIPLES.md` says a 10% difference reads as a mistake and a 40% one reads as intent;
  this corpus says the professional interval is nearer 100-280%.
- **Two colours, total.** All eight ship `#7D6E83` (a muted violet-grey) for every rule/box and
  `#F8EDE3` (a warm off-white) for every text run. Not two per design - two across the pack.

The TYPO reel says the same thing louder: one saturated accent (magenta, cyan, green, yellow,
orange - one per design) plus white, and nothing else. No design in the reel carries three hues.

### 2.2 The one repeated compositional device

Across the whole TYPO reel the recurring move is **the split name**: one name, two typographic
treatments butted together with no space - `SAM`+`ROSE`, `PETER`+`LANE`, `JOHN`+`FLOYD`,
`ROBERT`+`DAVIES`, `KIAN`+`SHARPE`. Bold accent-coloured against light white, or heavy against
thin, usually both. The role line sits under it, tracked uppercase, tiny.

That is one archetype carrying maybe two-thirds of the pack. The remaining devices are a short
inventory: a filled accent block behind or beside a word; a hairline rule above/below; bracket
corners; a skewed/italic panel; a circle enclosure; a speech-bubble tail. **A dozen or so
primitives, recombined.** That is an inventory a platform can own, not a judgement a model has to
make (§4).

### 2.3 Motion, measured off the alpha

`Element 01.mov` (a bar build), alpha bounding box per frame via
`ffmpeg -vf "alphaextract,cropdetect=limit=8:round=2:reset=1"`. Right edge pinned, left edge
travels 791 px:

- settles at ~frame 38 of 30 fps = **~1.23 s**
- normalized progress at quarter / half / three-quarter time: **0.08 / 0.62 / 0.94**

Two things follow. The entrance is **about twice as long as a generated graphic typically writes**
(0.4-0.6 s), and the curve is asymmetric - a slow lead-in, an early crossing of the midpoint, then
a long settle tail. It matches no stock GSAP ease: `power3.inOut` would read 0.06 / 0.50 / 0.94 and
`power3.out` 0.58 / 0.88 / 0.98. It is a hand-drawn bezier.

Caveat, stated because the number will be quoted: the first ~10 frames are below cropdetect's lock
threshold, so the lead-in is the least reliable part of the curve. Doing this properly across all
40 elements is Phase A work, not a finished result.

### 2.4 The sport reel is a different corpus and a more valuable one for us

It is not a design reference - the design is plain red/cyan with a hard-edged skew. It is a
**field-set and simultaneity reference**, and simultaneity is the thing a template gallery cannot
sell and a playout platform can:

- clock + score bug (top left), persistent
- team-vs-team strap with two crests
- player strap (number / name / role) with a crest chip
- substitution (on/off), card (yellow/red), goals list
- a full stats panel: two team names, a score line, eight labelled stat rows
- sponsor bug

Three or four of those are on screen simultaneously in most frames. That is a PRODUCTION with
layers, driven from a rundown - exactly what `docs/CLOUD_PLAYOUT.md` and the control layer exist
for, and exactly what a mogrt pack structurally cannot do.

---

## 3. Why this matters more than "new templates"

The instruments this project built - `spacingCheck`, `proportionCheck`, `axisCheck`, `type-floor`,
`catalog-sameness` - are all **calibrated on our own 90 catalog lower thirds**. Read
`DESIGN_PRINCIPLES.md` §"What the spacing gate learned": every threshold was set by what does not
fire on our catalog.

That makes them a **conformance measure, not a quality measure.** They can tell a generation it is
unlike our catalog. They cannot tell our catalog it is unlike good work. If the catalog is
consistent and merely fine - and the owner's own Phase 0 read was *"quite simple/boring"* - then
every instrument certifies fine, and every generation that passes them is fine.

**This corpus is the first external reference set the project would have.** That is its highest
value, above templates and far above prompt examples.

---

## 4. The plan, ranked by `DESIGN_PRINCIPLES.md`

### Phase A - build the corpus (free, no tokens)

- **A1. Harvest.** Cut one settled still per distinct treatment out of both reels into
  `benchmarks/reference/lowerthirds/`, with an index recording source, timecode and a one-line
  description. Target ~45 from the TYPO reel, ~12 from the sport reel.
- **A2. Motion.** Run the alpha-bbox measurement (§2.3) over all 40 `Element*.mov`, emitting
  duration + normalized progress at quarter/half/three-quarter per element. One script, no model.
- **A3. Field contracts.** Commit the eight mogrt parameter trees as a comparison target for our
  own `DataFields` shapes.

Nothing here needs a model, an API key, or a paid round.

### Phase B - REBUILD, do not measure pixels (level 1 + level 2)

The instruments need a DOM. The corpus is pixels. The naive move is to build a second, pixel-side
measurement stack - which would be a new instrument with its own calibration problem.

**Instead: hand-author 12-15 of the corpus designs as real NoaCG templates.** One piece of work,
three payoffs:

1. Every existing instrument runs on them for free and exactly, producing the **external
   calibration bands** §3 says we are missing. Then: where does our catalog's type step, panel
   padding, footprint and mark scale sit against work the owner already agrees is good?
2. They are **new catalog templates**, which was the second ask.
3. They are **known-good exemplars that are not already in the catalog** - which matters, because
   the exemplar block is the one thing the ablation proved buys something real
   (`AI_ATTEMPTS.md`: 12/12 vs 1/12 editable timelines) and it currently retrieves only our own
   designs.

Rebuild is also the honest test of the platform: a design we cannot rebuild in the current
template contract is a gap in the contract, and finding those is worth the exercise on its own.

### Phase C - the archetype inventory (level 1: remove the decision)

§2.2 says the pack is a dozen primitives recombined, and the memory record of the Pro premise
reckoning already points the same way: *retire "the model composes a panel", aim at "the model
decides a design LANGUAGE, the platform renders it"*. The corpus supplies the inventory
**measured rather than invented**:

- name treatments (split-weight, split-colour, split-both, single, stacked)
- accent forms (filled block, hairline rule, bracket corners, enclosure, skew)
- anchor and stack geometry
- the two-colour rule

The model picks archetype + tokens; the platform draws it. That is the same shape as
`fillBrandMark`, which is the only intervention in this repo's history that moved a defect rate
by a lot (2/12 -> 10/12).

### Phase D - what NOT to do

- **Do not put corpus frames in a prompt as inspiration.** Measured twice already: a judgement
  written as prose moves nothing (`DESIGN_PRINCIPLES.md`, opening section).
- **Do not add prose principles from the corpus to any prompt.** Same reason. Four paid Lite
  rounds already measured added prompt lines taking pass rate 47% -> 27%.
- **Do not chase both worlds at once.** The TYPO world (centered editorial name titles, one
  accent, huge type) and the sport world (dense data, persistent bugs, many simultaneous layers)
  have almost nothing in common. Pick one for the first pass.

---

## 5. The experiment that answers "are open models just worse"

**It has never been run in this repo.** The one frontier arm on record (`AI_ATTEMPTS.md`,
2026-08-02: `claude-sonnet-5`, 8 briefs, $0.7272, 4 of 8 usable) ran *through the harness*, and
ran in an era the same entry flags as invalidated by two platform bugs. So the repo has no
measurement separating "the checkpoint is weaker" from "the harness costs quality".

The 2x2 that separates them, on the same 6 briefs, judged blind in the existing gallery:

| | bare prompt, no harness | full NoaCG harness |
| --- | --- | --- |
| **frontier** | A | D |
| **open (`alibaba/qwen3-coder`)** | B | C |

Readings:

- **A >> B** - it is the model. Route quality-critical work to frontier and price it.
- **A ≈ B** - it is not the model. Whatever the gap is, it is downstream of the checkpoint.
- **A >> D** - it is the harness: the same model gets worse when constrained. Then the work is
  finding which constraint costs the most, one ablation at a time.
- **A ≈ D** - there is no gap, and what differs is the judging context (see below).

**The confound worth naming up front.** A lower third asked for in a chat window is judged as a
picture: rendered alone, at browser size, on whatever background it chose, with a short pleasant
name. Ours is judged over live footage, at broadcast distance, with real name lengths, under an
SPX field contract and a type floor. Some of the felt gap is that difference, and the 2x2 controls
for it only if all four arms are rendered and shown identically - which the blind gallery already
does, and which is why the experiment must run through the gallery rather than by eye.

**Cost:** roughly $2 total - arms B and C are ~$0.03 a generation on the pinned checkpoint, arms A
and D roughly $0.09. That needs an explicit go-ahead before anything runs.

---

## 6. What the owner can do that nobody else can

1. **The blind read on the 2x2.** It is the only thing that answers the question, and it cannot be
   delegated.
2. **A good / not-good pass over the ~45 harvested stills** (§A1). Twenty minutes, and it gives
   Phase B's calibration a label column instead of an assumption that everything commercial is good.
3. **Pick the world** - editorial name titles or sports data (§Phase D).
4. **Render the ten to fifteen chosen designs from the packs** to alpha MOV or PNG sequence, but
   only after §B has picked them, and only if the showreel still is not clean enough. The
   `Element*.mov` files already cover the motion question, so this is a fidelity nicety, not a
   blocker.
5. **The owner's blind read still owed on `pro-instruments-round-qwen3-coder-2026-08-13`** is
   older and higher-priority than any of this.
