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

I expected the corpus to show our catalog was measurably off - too big, too flat, too colourful -
and it does not. **On every axis this project already instruments, our catalog is already inside
the professional band.**

| Axis | Professional corpus | Our catalog | Verdict |
| --- | --- | --- | --- |
| Type step (supporting ÷ primary size) | ~0.47 median, 8 mogrt packs | p50 **0.48**, p05 0.35, p95 0.63 | **match** |
| Frame footprint (graphic bbox ÷ frame area) | ~0.023 median, range 0.009-0.048 | p50 **0.04**, p95 0.06, max 0.09 | we run ~1.7x larger; ranges overlap heavily |
| Chromatic accents on one graphic | 1 accent + white. No design in either reel carries three hues | token contract is `--accent`, **singular** | **match, structurally** |

Catalog figures are the stored sweep in `benchmarks/pro/v1/spike/proportion-calibration.json`
(90 designs). Corpus figures are measured in §3.

So the perceived quality gap is **not** in the geometry we spent the last rounds instrumenting.
That is a useful negative result, and it points somewhere specific (§5).

---

## 2. What is in the folder, and what is machine-readable

| Item | Readable? | What it yields |
| --- | --- | --- |
| `lower-third-showreel.mp4` (1920x1080, 30 fps, 214 s) | frames | The "TYPO Pack": ~35-45 distinct editorial name-title treatments over live footage. |
| `sport-graphic-showreel.mp4` (960x540, 25 fps, 109 s) | frames | An Envato football package: clock/score bug, team strap, player strap, substitution, cards, goals list, stats panel, sponsor bug - **several on screen at once**. |
| `Clean-Lower-Thirds-*/*.mogrt` x8 | **fully** - it is a ZIP | `definition.json` is the operator parameter contract, exact type sizes, exact colours. No Adobe needed. |
| `gradient-lower-thirds-*/Element NN.mov` x40 | **fully** - QuickTime RLE, straight alpha ARGB | Per-frame alpha bounding box gives real motion timing. |
| `social-media-*/*.aep` | partially | Comp and layer names parse out of the `Utf8` chunks (verified). Keyframes and geometry do not. **Not worth further effort.** |

On the packs: the mogrts and the alpha MOVs give more than the AEP does and need no Adobe
application. There is no need to open or export anything by hand at this stage.

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
for every rule and box, `#F8EDE3` for every text run.

Incidentally: the dominant line is the **surname**, not the first name, on five of six.

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

Method limits, stated because the numbers will be quoted: this is an ink bounding box, our
`proportionCheck` measures a **panel rect**; the dilation inflates the editorial heights; and only
two packs were measured.

### 3.3 Motion

`ffmpeg -vf "alphaextract,cropdetect=limit=8:round=2:reset=1"` over the alpha elements, alpha bbox
area per frame normalized to its own peak, then rising segments detected. 26 of 40 files yielded a
clean curve.

- substantive build completes in **0.6 - 0.9 s** (median 0.63 s), with a low-amplitude settle tail
  running out to ~1.2 s on the ones that have it
- on `Element 01` the normalized progress at quarter / half / three-quarter of the build is
  **0.08 / 0.62 / 0.94** - an asymmetric curve matching no stock GSAP ease (`power3.inOut` reads
  0.06 / 0.50 / 0.94 and `power3.out` reads 0.58 / 0.88 / 0.98). A hand-drawn bezier.

**What this cannot tell us:** each `.mov` is ONE shape to be composited, so nothing here measures
the stagger between parts. Stagger would have to come from the reels, where the footage moves.

### 3.4 The device inventory (observed, not measured)

The recurring move across the TYPO reel is **the split name**: one name, two typographic
treatments butted together with no space - `SAM`+`ROSE`, `PETER`+`LANE`, `JOHN`+`FLOYD`,
`ROBERT`+`DAVIES`, `KIAN`+`SHARPE`. Bold accent-coloured against light white, usually heavy
against thin as well. Role line beneath, tracked uppercase, tiny.

That single device carries a large fraction of the pack. Everything else is a short inventory: a
filled accent block behind or interrupting a word; a hairline rule; bracket corners; a skewed
panel; a circle enclosure; a speech-bubble tail.

**And most of these designs have no panel at all** - bare type on footage. That matters in §5.

---

## 4. The sports reel is about a different thing

It is not a design reference; the design is plain. It is a reference for **what a broadcast
package is**: clock and score bug persistent top-left, player strap in and out, stats panel, cards,
substitutions, sponsor bug - three or four live at once, driven from a rundown.

A mogrt pack structurally cannot do that. Our production/control/output layers can. That is a
product-surface observation, not a design one, and it is worth keeping separate from the quality
question.

---

## 5. Where the gap actually is - hypothesis, stated as a hypothesis

Three axes checked, three matches (§1). So the plausible remaining explanations are the ones
nothing in the harness touches:

1. **Half our catalog has no panel, and the proportion instrument is blind there.** 45 of 90
   designs return `footprint: null` and `panelFill: null` because `findPanel` finds nothing. Most
   of the professional corpus is panel-less too. So on the design family both we and they favour,
   our headline proportion instrument measures **nothing at all**.
2. **The corpus's distinguishing property is a per-design IDEA, and we measure only geometry.**
   The split name is not a ratio. It is a decision to treat one string as two typographic objects.
   A design can be geometrically perfect and have no idea in it - which is the exact shape of the
   owner's Phase 0 verdict, *"fine … just quite simple/boring"*.
3. **Motion character is unmeasured.** We have a duration and a curve shape from the corpus
   (§3.3) and no comparable number from our own catalog.

If (2) is right it reframes the model question directly. A frontier model asked in a chat window
for "a lower third" invents a device, because nothing constrains it and it is being judged as a
picture. The same model inside our harness is asked for a template conforming to a class spine, a
marked animation region, an `fN`-to-DOM field map and a type floor, and is gated on geometry - and
the safe answer to all of that is a correct, plain panel. **We would be selecting for the thing we
measure.** That is consistent with every entry in `docs/AI_ATTEMPTS.md`: four rounds of correctness
fixes produced *"correct, plain graphics; correctness was never what was missing"*.

**This is a hypothesis built on three negative measurements. It is not proven**, and the experiment
that would test it is §6.

---

## 6. The experiment that separates model from harness

Never run in this repo. The one frontier arm on record (`AI_ATTEMPTS.md`, 2026-08-02:
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

**The confound to control, and the reason it must run through the gallery rather than by eye:** a
graphic asked for in chat is judged as a picture - alone, at browser size, on a background of its
own choosing, with a short pleasant name. Ours is judged over live footage, at broadcast distance,
with real name lengths, under an SPX field contract. All four arms have to be rendered and shown
identically or the experiment measures the viewing conditions.

Costs real money (~$2 at 6 briefs, ~$4 at 12). **Not authorized; not run.**

---

## 7. Free work this unlocks, when the time comes

Listed so it is on record, not proposed for now.

- **Measure our own catalog's motion** (duration, curve shape at quarter/half/three-quarter) off
  the anim data, and compare against §3.3. Free, no model, no browser.
- **Ask why `findPanel` is null on half the catalog**, and whether a panel-less design has any
  proportion measurement it could have. This is the biggest hole in the instrument set.
- **Harvest the corpus stills** into an indexed reference set, so any future calibration has an
  external population to compare against instead of only our own catalog.

And one thing to keep refusing: **do not put corpus frames or corpus principles into a prompt as
inspiration.** Measured twice already - a judgement written as prose moved the mark-surface defect
rate by nothing, and four paid Lite rounds took pass rate from 47% to 27% by adding defensible
prompt lines.
