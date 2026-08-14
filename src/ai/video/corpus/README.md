# The video exemplar corpus

Complete, hand-authored HyperFrames compositions. They exist for two jobs at once
(`docs/NOACG_VIDEO_PLAN.md` §3):

1. **The retrieval corpus.** The plan's core mechanism is retrieving two or three *complete*
   exemplars per brief, not design-DNA cards. Video has none today beyond five offline stub
   samples, which is the program's largest structural gap.
2. **The anchor arm of every blind gallery.** These are the human-authored premium band that
   model output is judged against, so they have to be genuinely good, not merely valid.

They live under `src/` rather than `benchmarks/` because retrieval will import them (`?raw`)
at runtime, and the bench reads the same files - so the anchor arm and the retrieval corpus
cannot drift apart. **Nothing imports them yet.**

## Stingers

The first goal of the whole video program is one usable 2 s stinger, so stingers are the first
type in the corpus. Its acceptance contract is `docs/NOACG_VIDEO_PLAN.md` §2.2 and every file
here is authored against it.

| file | direction | mechanism | how the mark is used |
| --- | --- | --- | --- |
| `stingers/replay-slab.html` | aggressive sports; the "to slow-motion replay" reference case | one heavy skewed slab drives across behind a bright accent edge | the mark lands on the slab oversized and drops into the lockup |
| `stingers/aperture-bands.html` | precise editorial / news | eight vertical bands close the frame from alternating edges | the same eight columns open off the mark, so the reveal is the cover's own motion |
| `stingers/logo-punch.html` | the mark drives the exit | the field bursts out of a point, then breaks into three slabs | the mark punches out of the burst, then through the lens, taking the field with it |
| `stingers/ink-sweep.html` | no panel at all | ten ragged bands of brand ink stroke across, then retreat the way they came | the cover is the brand's own ink; the mark lands on it and is carried out by it |
| `stingers/radial-bloom.html` | ornamented; the corpus's richest surface | a disc opens from a point, four rings of 120 repeated glowing elements bloom and turn, then the whole thing irises shut | the mark is the still centre of a turning pattern |
| `stingers/halftone-cut.html` | printed texture | two panels close on a diagonal seam, one carrying a halftone dot field and one diagonal hatching | the mark sits above the seam, which underlines the lockup |
| `stingers/type-slam.html` | typographic | a band slams open from the frame's centre line, with an accent disc and ring in the negative space | the word is the hero, set in two weights on one line; the mark tops it |

Seven files, seven genuinely different *mechanisms* - lateral wipe, tiled close, burst and
shatter, painted trail, radial bloom and iris, diagonal two-panel close, and a horizontal
opening from the centre line - because a corpus of variations on one move teaches a model
nothing about the type. They also give a switcher seven different **reveal shapes** to cut
behind, on every axis a frame has.

**The last three come from measured evidence rather than taste.** The reference teardown
(`benchmarks/video/v1/STINGER-REFERENCE-TEARDOWN.md`) named the techniques that make commercial
packs read as designed, and `radial-bloom`, `halftone-cut` and `type-slam` are its top three:
radial repetition with glow, hatched and halftone fills, and one heavy word against one light
word at the same size. `radial-bloom`'s 120 ring elements are BUILT by a loop rather than typed
out; a loop is exactly as deterministic, and 120 hand-written divs would be unreadable.

### The rules they are held to (owner review, 2026-08-13)

Binding, and the reason the second version of these files looks different from the first
(plan §2.4):

1. **The mark goes on the field, never on a plate.** A logo in a box is a picture of a logo.
   The tone answer is that a brand supplies a field colour suited to its own mark's ink.
2. **The cover is an event, not a parked panel.** Nothing in the covered stretch is static.
3. **The mark helps produce the cover** wherever the design allows.
4. **The cover comes first. Nothing but the covering surface appears over the live picture -
   including the mark.** A mark on the feed has no controlled background, so an outline mark
   is a few thin strokes over unknown video and reads as a fault. On the way out, nothing
   emerges from behind the retreating cover onto the incoming picture either. The covering
   surface's own leading edge is not decoration and is fine.
5. **The cover need not be a rectangle** - but it must be a full cover. A graphic that only
   flies over without covering is a logo sting, a different type.
6. **Nothing goes behind the mark, including a shape that is "part of the design".**
   `type-slam` first put its accent disc behind the lockup and Kestrel's volt wordmark on a
   volt disc vanished outright - rule 1's failure mode is total, not subtle.
7. **Size the mark's BOX, and let the image fill it.** `max-width: 100%` only ever shrinks an
   image, so every mark rendered at its own SVG size - about 120 px in a 300 px slot - and the
   whole corpus read as empty. `width: 100%; height: 100%; object-fit: contain` is the pattern.

### The shared vocabulary

Every stinger declares the same six composition variables, so a brand swap is one set of
values regardless of which exemplar was retrieved:

| variable | type | what it is |
| --- | --- | --- |
| `logo` | image | the brand mark, bound with `data-var-src` into a fixed slot |
| `label` | string | the word (`REPLAY`, a programme name) |
| `kicker` | string | the small line under it |
| `brandDeep` | color | the colour of the covering surface |
| `brandAccent` | color | edges, rules and the kicker |
| `brandInk` | color | the type |

`type-slam` reads `label` and `kicker` as the two halves of one phrase - heavy then light -
rather than as a title and a subtitle. Same two variables, a different typographic job.

There is deliberately **no plate colour**. A slot with an aspect-agnostic box and
`object-fit: contain` is all the geometry a mark needs; the tone is the brand's field colour,
supplied with the mark it has to suit.

### The numbers every file repeats, and why they are those numbers

- **Duration 2.00 s**, cut window **0.46 s to 1.12 s**, every exit finished by **1.92 s**.
- 1.92 and not 2.00 because the renderer seeks frames `0 .. N-1`, so the last frame is
  `t = (N-1)/fps` - 1.960 / 1.967 / 1.980 / 1.983 s at 25 / 30 / 50 / 60 fps. An exit that
  finished at the declared duration would still be painting on the last frame, and the
  empty-tail rule is non-negotiable.
- Frame 0 is empty **by construction, never by a fade**: everything either starts outside the
  frame under `overflow: hidden` on `#root`, or starts at `scaleY: 0`, which paints nothing.
- The declared cut window is **conservative at both ends** - each design is already covering
  before 0.46 s and is still covering after 1.12 s. The window is what the operator gets, so
  it must be a promise the composition beats, not one it just meets.
- Each file's header comment carries the ATEM Clip Duration, cut-window frames and Trigger
  Point at 25 / 30 / 50 / 60 fps, because the operator sets frames and never seconds.

### Reviewing them

```bash
node scripts/stinger-review.mjs
```

Zero tokens, no dev server, no browser automation. It writes one standalone, fully offline page
per stinger - each able to swap between all five brand marks
(`benchmarks/video/v1/MARKS.md`) live - plus a contact sheet that scrubs all seven at once, so
the brand swap can actually be looked at rather than asserted. Each full-size page also carries
a quick in-page geometry check.

### Gating them

```bash
node scripts/stinger-gate.mjs                  # all seven at 50 fps
node scripts/stinger-gate.mjs --fps 25 --mark the-ledger
node scripts/stinger-gate.mjs --only ink-sweep --keep-frames
```

**This is the real §2.2 gate and it measures pixels, not boxes.** It drives a headless browser,
seeks each composition's own paused timeline exactly as the renderer does, screenshots every
frame with alpha, and reads the alpha plane PER PIXEL - never an average, because an average
passes a one-pixel transparent seam down the middle of the frame and that seam is visible on
air. It answers three questions and exits non-zero on any failure:

- **head and tail:** frame 0 and frame N-1 fully transparent across the whole frame;
- **cut-window coverage:** every frame of the declared window opaque everywhere, with
  non-opaque pixels split into BORDER (the outer 2 px, edge softness nobody sees) and INTERIOR
  (a real hole, and an automatic failure);
- **duration honesty:** the timeline ends at or before `(N-1)/fps`.

It also writes a frame strip around the window's edges, a contact sheet, and the per-frame
alpha series as JSON. **The measurement is shared verbatim with `scripts/stinger-teardown.mjs`**
(`scripts/lib/stingerAlpha.mjs`), which reads commercial clips - so the corpus is judged by the
same instrument as the stingers people buy, and cannot come to pass a gate the market fails.

### Measured 2026-08-13, on rendered pixels

All seven, 4 of 4 gates, at 50 fps with the hardest mark in the swap set:

| composition | declared window | actually covered | interior gaps |
| --- | --- | --- | --- |
| `replay-slab` | frames 23-56 | 8-78 | 0 |
| `aperture-bands` | frames 23-56 | 20-74 | 0 |
| `logo-punch` | frames 23-56 | 15-71 | 0 |
| `ink-sweep` | frames 23-56 | 19-74 | 0 |
| `radial-bloom` | frames 23-56 | 8-79 | 0 |
| `halftone-cut` | frames 23-56 | 10-77 | 0 |
| `type-slam` | frames 23-56 | 7-84 | 0 |

Every declared window sits well inside what is actually covered, and the STRICT count - every
pixel of every frame literally opaque, border included - equals the airable one in all seven.
For comparison, three of the eight commercial clips in the teardown never cover at all, one of
them leaving 15 840 interior pixels showing at its best frame.

**Mutation-tested, so the passes are not vacuous.** A copy of `replay-slab` with its cut window
moved to 0.02-0.30 s and its slab started 3000 px closer failed exactly as it should: frame 0
painting 90.6% of the frame, and 2 of 15 declared frames uncovered. The real exit code is 1 -
checked without a pipe, because `| tail` reports the tail's status and hides the failure.

### Watching the motion

```bash
node scripts/stinger-gate.mjs --mp4 --mark kestrel-athletic
```

Two clips per stinger, because they answer different questions:

- **`<id>-oncut.mp4` is the test.** The graphic keyed over MOVING footage, with the programme
  cut from one source to a visibly different one at exactly the Trigger Point we tell the
  operator to set. If the cut is hidden, the stinger does its job; if you can see it, the cover
  window is wrong no matter what the gate said. The two sources are synthetic on purpose -
  deterministic, no licence, and so obviously different that a cut which survives them is
  hidden behind anything.
- **`<id>-alpha.mp4`** is the graphic alone over a checkerboard, for judging the motion without
  a background arguing with it.

Both run 0.7 s of pre-roll, the 2 s stinger, and 1.3 s of post-roll.

**They are browser captures**, one screenshot per frame off the composition's own paused
timeline - the same seek-per-frame model the render worker uses, but NOT the production render
path. Verifying that path end to end is its own item.

**Still unmeasured:** whether the production render service produces the same pixels, and the
PNG-sequence and ProRes export paths into an ATEM (plan §2.2).
