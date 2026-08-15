# The lower-thirds reference corpus - research notes

Source: `C:\claude\NoaCG-Studio\example-lowerthirds` (~170 MB, not in the repo). Two commercial
showreels, eight Premiere motion-graphics templates, forty alpha shape elements, one After Effects
project.

**Status: RESEARCH. Nothing here proposes building anything.** Pro and Lite have work in flight;
this document exists so that when they land, the next decision is informed by measurement rather
than by impression. It is deliberately general - the goal is knowledge that applies to any graphic
we make, not a plan to copy these particular designs.

Read `docs/DESIGN_PRINCIPLES.md` first. This document's whole method comes from it: a design claim
is worth something when a script can read it off a frame, and worth roughly nothing when it is
prose in a prompt.

---

## 1. The headline result

I expected the corpus to show our catalog was measurably off - too big, too flat, too colourful,
too slow. Measured, it is off on **one** axis out of five, and it is not one of those.

| Axis | Professional corpus | Our catalog | Verdict |
| --- | --- | --- | --- |
| Type step (supporting ÷ primary size) | 0.47 median, 8 mogrt packs | p50 **0.48**, p05 0.35, p95 0.63 | **match** |
| Frame footprint (graphic bbox ÷ frame area) | ~0.023 median, range 0.009-0.048 | p50 **0.04**, p95 0.06, max 0.09 | ~1.7x larger; ranges overlap |
| Chromatic accents on one graphic | 1 accent + white; no design in either reel carries three hues | token contract is `--accent`, **singular** | **match, structurally** |
| Entrance duration | 0.63 s rise (p50), settling ~0.8-1.2 s | build span p50 **1.05 s**, range 0.51-1.99 | comparable |
| **Entrance curve shape** | **p50 = `power2.out`**; sharpest of 22 elements is 0.79 at quarter-time | **5 of 8 presets are sharper than anything measured**; `expo.out` sits outside the corpus range entirely | **differs** |

Catalog figures: the stored sweep in `benchmarks/pro/v1/spike/proportion-calibration.json`
(90 designs) and the preset timings in `src/templates/lowerThirds/animPresets.ts`. Corpus figures
are measured in §3.

So the perceived quality gap is **not** in the geometry the last rounds instrumented. That is a
useful negative result, and it points somewhere specific (§5).

---

## 2. What is in the folder, and what is machine-readable

| Item | Readable? | What it yields |
| --- | --- | --- |
| `lower-third-showreel.mp4` (1920x1080, 30 fps, 214 s) | frames | The "TYPO Pack": ~35-45 distinct editorial name-title treatments over live footage. |
| `sport-graphic-showreel.mp4` (960x540, 25 fps, 109 s) | frames | An Envato football package: clock/score bug, team strap, player strap, substitution, cards, goals list, stats panel, sponsor bug - **several on screen at once**. |
| `Clean-Lower-Thirds-*/*.mogrt` x8 | **fully** - it is a ZIP | `definition.json` is the operator parameter contract, exact type sizes, exact colours. No Adobe needed. |
| `gradient-lower-thirds-*/Element NN.mov` x40 | **fully** - QuickTime RLE, straight alpha ARGB | Per-frame alpha bounding box gives real motion timing and curve shape. |
| `social-media-*/*.aep` | partially | Comp and layer names parse out of the `Utf8` chunks (verified). Keyframes and geometry do not. **Not worth further effort.** |

On the packs: the mogrts and the alpha MOVs give more than the AEP does and need no Adobe
application. Nothing needs to be opened or exported by hand at this stage.

---

## 3. What was measured, and how

### 3.1 The professional operator contract (exact, from eight `definition.json` files)

All eight ship an identical shape. Comp inferred as 3840x2160 (every global control defaults to
1920,1080 and the type sizes only make sense at that scale).

```
Global Settings   position / scale / rotation      - the whole graphic on one handle
Text 1/2/3        source text + font + size + position + scale + rotation + line spacing
Elements Settings position + scale per decorative element (Line, Box, Image)
Color Settings    one colour per element and per text run
```

Type sizes in px (2160-tall comp), and the step from the dominant line down to the role line:

| Pack | T1 | T2 | T3 | dominant as % frame H | T3 ÷ T2 |
| --- | --- | --- | --- | --- | --- |
| 01 | 125 | 165 | 90 | 7.6% | 0.55 |
| 02 | 125 | 165 | 75 | 7.6% | 0.45 |
| 03 | 125 | 165 | 65 | 7.6% | 0.39 |
| 04 | 110 | 165 | 80 | 7.6% | 0.48 |
| 05 | 140 | 85 | - | 6.5% | 0.61 |
| 06 | 140 | 170 | 45 | 7.9% | 0.26 |

Median 0.47 against our catalog's p50 of 0.48. Colours: **two across the whole pack** - `#7D6E83`
for every rule and box, `#F8EDE3` for every text run. Incidentally, the dominant line is the
**surname**, not the first name, on five of six.

### 3.2 Frame footprint

Sports reel: mask graphic ink by hue (saturated red / cyan / near-white), erode 1 px, connected
components, bounding box per graphic. Eleven sampled frames.

- individual graphic bbox: **0.9% - 4.8% of frame area**, median ~2.3%
- **1 to 4 graphics on screen simultaneously**; total ink 2% - 10% of the frame
- band heights 4-10% of frame height; widths 13-60% of frame width

Editorial reel: mask on near-white or high-saturation ink over the graded-dark footage, dilate 6 px
to join glyphs, component box. Eighteen sampled frames. Largest graphic per frame ~20% wide x ~12%
tall after backing out the dilation, i.e. **~2.4% of frame area**, range roughly 0.3% - 6%.

Both worlds land in the same place, which is why §1 treats it as one number.

Method limits: this is an ink bounding box while `proportionCheck` measures a **panel rect**; the
dilation inflates the editorial heights; only two packs were measured.

### 3.3 Motion - duration and curve

`ffmpeg -vf "alphaextract,cropdetect=limit=8:round=2:reset=1"` over the alpha elements, alpha bbox
area per frame normalized to its own peak. The rise window is the last frame at ≤2% to the first
frame at ≥98%; 22 of 40 elements resolve one cleanly.

- **rise: p50 0.63 s**, range 0.27 - 0.93 s
- **normalized progress at quarter / half / three-quarter of the rise: p50 0.44 / 0.77 / 0.93**

Against stock GSAP eases evaluated at the same three points:

| ease | ¼ | ½ | ¾ | |
| --- | --- | --- | --- | --- |
| `linear` | 0.25 | 0.50 | 0.75 | |
| `sine.out` | 0.38 | 0.71 | 0.92 | close |
| **`power2.out`** | **0.44** | **0.75** | **0.94** | **the corpus median, near-exactly** |
| `power3.out` | 0.58 | 0.88 | 0.98 | sharper than the corpus median |
| `power4.out` | ~0.68 | ~0.94 | ~0.996 | sharper than every element measured |
| `expo.out` | 0.82 | 0.97 | 0.99 | **outside the corpus range entirely** |

The corpus is not uniform - per-element quarter-time progress spans 0.25 to 0.79, so some builds
are as sharp as `power3.out`. But **nothing measured reaches `expo.out`**, and the centre of the
distribution is a plain quadratic ease-out.

Our own eight presets (`animPresets.ts`, entrance direction): `power3.out` x2, `expo.out` x2,
`power4.out`, `back.out(1.6)`, `power2.out`, `sine.out`. Five of eight are sharper than the corpus
median and two of those are sharper than anything in the corpus at all.

**Correcting an earlier claim in this document.** A first pass measured `Element 01` alone at
0.08 / 0.62 / 0.94 and concluded the corpus used a hand-drawn bezier matching no stock ease. That
was the caveat in that pass firing: the element's first ~10 frames sit under cropdetect's lock
threshold, so the lead-in was invented by the measurement. With a proper rise window the same
element reads 0.28 / 0.76 / 0.93, and across 22 elements the answer is `power2.out`.

**What this still cannot tell us:** each `.mov` is ONE shape to be composited, so nothing here
measures stagger between parts. Our own presets stagger at p50 0.10 s (range 0.05-0.16); the
corpus figure would have to come from the reels, where the footage moves.

### 3.4 The device inventory (observed, not measured)

The recurring move across the TYPO reel is **the split name**: one name, two typographic
treatments butted together with no space - `SAM`+`ROSE`, `PETER`+`LANE`, `JOHN`+`FLOYD`,
`ROBERT`+`DAVIES`, `KIAN`+`SHARPE`. Bold accent-coloured against light white, usually heavy
against thin as well. Role line beneath, tracked uppercase, tiny.

That single device carries a large fraction of the pack. Everything else is a short inventory: a
filled accent block behind or interrupting a word; a hairline rule; bracket corners; a skewed
panel; a circle enclosure; a speech-bubble tail.

And most of these designs have no panel at all - bare type on footage. That matters in §4.

---

## 4. Why `findPanel` is null on half the catalog - answered, and it is not a bug

45 of 90 catalog designs return `footprint: null` and `panelFill: null`. Both calibrations agree on
which 45 (90 of 90 rows), so it is one cause, not two instruments disagreeing.

**The cause is that those designs have no panel.** `lt01`'s own stylesheet says so verbatim:

> `/* The text block — deliberately transparent: no panel, whitespace does the work. */`

`.lower-third-box` there sets `padding-left` and nothing else - no background, no surface. Against
`lt11`, which paints `background: var(--panel-bg)` plus a backdrop blur and is found immediately.
`findPanel` is behaving exactly as its own comment promises. The 45 are the bare-type family, and
that is the same family most of the professional corpus belongs to.

**The consequence is the real finding.** Every padding measurement in `spacingCheck` is
panel-relative, and `footprint` and `panelFill` are panel-relative by definition. Counting non-null
measurements per design:

| | designs | non-null measurements per design |
| --- | --- | --- |
| panelled | 45 | **7.7** |
| panel-less | 45 | **1.7** |

A panel-less design is measured 4.5x less. And the owner's most-repeated complaints - *"too much
space beneath"*, *"the box is way too big"*, *"it's all crammed in"* - are all panel-relative, so on
half the catalog **there is no measurement that could catch any of them.**

For context on how quiet the instruments already are: across all 90 designs the spacing sweep fires
one finding total (`lines-adrift`) and the proportion sweep fires none.

So the honest statement is not "the instrument is broken" but "the instrument has no reading for
the design family we and the professionals both favour", and closing that would mean finding a unit
for air that does not require a box - the text block's own bounds, the accent rule, or the
title-safe edge.

---

## 5. The sports reel is about a different thing

Not a design reference; the design is plain. It is a reference for **what a broadcast package is**:
clock and score bug persistent top-left, player strap in and out, stats panel, cards, substitutions,
sponsor bug - three or four live at once, driven from a rundown.

A mogrt pack structurally cannot do that. Our production/control/output layers can. Product-surface
observation, kept separate from the quality question.

---

## 6. Where the gap is - hypothesis, stated as a hypothesis

Five axes checked (§1): four match, one differs modestly. The panel finding (§4) says a further
family of measurements simply does not exist for half our designs. So the plausible remaining
explanations are the ones nothing in the harness touches:

1. **Motion feel, which is the one measured difference.** Five of eight presets snap harder than
   the corpus median, and `expo.out` is outside the corpus's whole range. `.out` curves read as
   "arrive and stop"; a quadratic reads as "arrive and settle". Small, real, cheap to change, and
   the first thing on this list that a number supports.
2. **Air on panel-less designs is unmeasured** (§4), on half the catalog and on most of the
   corpus's design family.
3. **The corpus's distinguishing property is a per-design IDEA, and we measure only geometry.**
   The split name is not a ratio. It is a decision to treat one string as two typographic objects.
   A design can be geometrically perfect and have no idea in it - the exact shape of the owner's
   Phase 0 verdict, *"fine … just quite simple/boring"*.

If (3) is right it reframes the model question directly. A frontier model asked in a chat window
for "a lower third" invents a device, because nothing constrains it and it is being judged as a
picture. The same model inside our harness is asked for a template conforming to a class spine, a
marked animation region, an `fN`-to-DOM field map and a type floor, and is gated on geometry - and
the safe answer to all of that is a correct, plain panel. **We would be selecting for the thing we
measure.** That is consistent with every entry in `docs/AI_ATTEMPTS.md`: four rounds of correctness
fixes produced *"correct, plain graphics; correctness was never what was missing"*.

**Still a hypothesis.** The experiment that would test it is §7.

---

## 7. The experiment that separates model from harness

**RUN 2026-08-15** - authorized at $4, spent ~$2.70; design below unchanged. Rig:
`scripts/model-vs-harness.mjs`; record and predeclared readings:
`docs/MODEL_VS_HARNESS_STUDY.md`; round archive
`C:\claude\noacg-lite-eval-archive\model-vs-harness-2026-08-15`. 24 of 24 captured
(6 no-logo briefs x 4 arms, `alibaba/qwen3-coder` + `anthropic/claude-sonnet-5`, all four
arms over one shared real-footage bed). **The owner's blind ballot is PENDING; nothing
visual is claimed until it lands.** The paragraphs below are the design as it stood before
the run, kept because the readings are predeclared against them.

The one frontier arm previously on record (`AI_ATTEMPTS.md`, 2026-08-02:
`claude-sonnet-5`, 8 briefs, $0.7272, 4 of 8 usable) ran **through** the harness, in an era the
same entry flags as invalidated by two platform bugs.

Same briefs, four arms, judged blind in the existing gallery:

| | bare prompt, no harness | full NoaCG harness |
| --- | --- | --- |
| **frontier** | A | D |
| **open (`alibaba/qwen3-coder`)** | B | C |

- **A >> B** - it is the checkpoint. Route quality-critical work to frontier and price it.
- **A ≈ B** - it is not the checkpoint, and no model swap fixes anything.
- **A >> D** - it is the harness: the same model gets worse when constrained. Then the work is
  one ablation at a time, finding which constraint costs the most.
- **A ≈ D** - there is no gap, and the difference is the judging context.

**The confound to control, and why it must run through the gallery rather than by eye:** a graphic
asked for in chat is judged as a picture - alone, at browser size, on a background of its own
choosing, with a short pleasant name. Ours is judged over live footage, at broadcast distance, with
real name lengths, under an SPX field contract. All four arms have to be rendered and shown
identically or the experiment measures the viewing conditions.

Costs real money (~$2 at 6 briefs, ~$4 at 12). **Authorized 2026-08-15 and run - see the
banner at the top of this section.**

---

## 8. What is left

- **Harvest the corpus stills** into an indexed reference set, so future calibration has an
  external population instead of only our own catalog.
- **Find a unit for air that does not need a panel** (§4) - the one instrument hole with a number
  behind it.
- **Decide whether the ease bank should shift** toward the corpus band (§3.3). This is a taste call
  with a measurement attached, not a defect.

And one thing to keep refusing: **do not put corpus frames or corpus principles into a prompt as
inspiration.** Measured twice already - a judgement written as prose moved the mark-surface defect
rate by nothing, and four paid Lite rounds took pass rate from 47% to 27% by adding defensible
prompt lines.
