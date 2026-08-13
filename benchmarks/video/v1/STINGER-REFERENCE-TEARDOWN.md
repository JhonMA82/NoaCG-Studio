# Stinger reference teardown, 2026-08-13

Thirteen commercial stingers and showreels supplied by the owner, measured frame by frame with
`node scripts/stinger-teardown.mjs` and then looked at. Eight are ProRes 4444 with real alpha,
so the alpha numbers below are read off the delivered files rather than inferred. The rest are
flattened recordings, useful for mechanism and timing only.

This exists because three rounds of owner review found problems in the corpus that no machine
check of ours could see, all of them in the first half second. Guessing what a good stinger
does is what produced those rounds. Everything below is what real ones actually do.

Source files live outside the repo (they are licensed stock); the measurement output is
regenerated on demand into the gitignored `stinger-teardown-out/`.

---

## 1. The measured numbers

Alpha read per pixel, per frame, at full resolution. "Cover" is the longest run of frames with
**zero non-opaque pixels in the interior** - a hairline along the outermost 2 px is tolerated,
because it hides a cut perfectly on air and demanding literal 100% would reject clips that
demonstrably work.

| clip | fps | frames | length | head empty | tail empty | cover frames | cover | peak opaque | interior gaps at peak |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Bubbly Reveal (Pinks) | 30 | 102 | 3.40 s | 1 | 28 | 37 | 1.23 s | 100% | 0 |
| Kaleidoscope Reveal (Red) | 25 | 53 | 2.12 s | 0 | 3 | 31 | 1.24 s | 100% | 0 |
| Flat White (Blue) | 30 | 64 | 2.13 s | 1 | 15 | 16 | 0.53 s | 100% | 0 |
| Circle Rotation (Green) | 30 | 62 | 2.07 s | 1 | 11 | 4 | 0.13 s | 100% | 0 |
| Skewed Strips (Red) | 30 | 57 | 1.90 s | 2 | 3 | 3 | 0.10 s | 100% | 0 |
| Slide Reveal (Yellow) | 30 | 52 | 1.73 s | 2 | 11 | **0** | never | 99.986% | 297 |
| Tech Wipe (Teal) | 24 | 32 | 1.33 s | 1 | 5 | **0** | never | 99.663% | 5 874 |
| Horizontal Wipe (Blue) | 25 | 29 | 1.16 s | 0 | 9 | **0** | never | 99.150% | 15 840 |

### What that says

**Length: 1.2 to 2.1 s, with one outlier at 3.4 s.** Six of eight are between 1.16 and 2.13 s.
The 2.00 s target in `docs/NOACG_VIDEO_PLAN.md` §2.2 is right in the middle of the market, and
the plan's "2-3 s, no longer" is if anything generous.

**Frame rate is baked per file: 24, 25 and 30 all appear in one pack.** Nobody ships one clip
that serves every standard - which is the argument for §2.3's delivery-standard picker, made
by the market rather than by us.

**The full-cover window is SHORT and it varies enormously: 0.10 s to 1.24 s.** Two of the
clips cover for three and four frames respectively. That is the strongest possible evidence for
§2.4 rule 2: a stinger is not a panel that arrives and waits, it is a thing passing through,
and the cut is taken in the moment it happens to be closed. Our corpus declares 0.46-1.12 s
(0.66 s) and actually covers for longer than that, so we are conservative by comparison - which
is the right side to be on, but it also means we have room to spend more of the clip on motion.

**Three of eight NEVER fully cover the frame.** Not marginally: Horizontal Wipe leaves 15 840
interior pixels showing at its best frame, Tech Wipe 5 874. On an ATEM those would flash the
outgoing picture through the middle of the transition. Slide Reveal misses by 452 pixels, which
is an antialiased seam where two shapes meet (297 pixels once the 12-bit alpha is read through
an 8-bit path, 452 read natively - the verdict is the same either way) - exactly the defect the
corpus's overlap rule
(tiles overlapping by 2-20 px, surfaces overhanging the frame) exists to prevent. **Commercial
products ship this defect.** Our §2.2 coverage gate is stricter than the market, and the
teardown is the evidence that the gate is worth having rather than pedantry.

**Head and tail: 0-2 frames empty at the head, 3-28 at the tail.** Two clips paint something on
frame 0. So the market treats the empty-head rule as approximate. Our contract is stricter and
should stay so - a few stray pixels on frame 0 are invisible, but "invisible" is not a property
a gate can check, and the strict version costs nothing to author.

---

## 2. The design vocabulary, and what it is made of

Every mechanism in the alpha clips is reproducible in HTML/CSS/GSAP. None of them needs 3D.

| clip | mechanism | how it would be built here |
| --- | --- | --- |
| Skewed Strips (Red) | angled parallelogram strips in two tones, staggered in from the top right, out to the bottom left | `skewX` on absolutely positioned bars, staggered `x`/`y` - this is `replay-slab`'s family |
| Flat White (Blue) | one flat colour field sweeps in; a white bar crosses it; the field exits as a narrowing column | two divs and a `scaleX`; the whole clip is three moves |
| Circle Rotation (Green) | a dot grows to a white disc, a black disc grows inside it, then a green one, then it shrinks away | three `border-radius: 50%` divs and sequential `scale` - this is `logo-punch`'s burst, done as nested colours |
| Bubbly Reveal (Pinks) | organic gradient blobs, growing discs, swinging arcs, gradient ribbons | layered `radial-gradient` circles, blob shapes, rotating SVG stroke arcs |
| Kaleidoscope Reveal (Red) | radial array of hexagons, dot rings and dashes, glowing, rotating, closing to an iris | repeated elements at N angles and radii with `filter: drop-shadow` glow |
| Typo/Transitions pack (showreel) | flat or gradient field, one heavy word plus one light word, circles - some hatched - outline rectangles, chevron pairs, halftone dot grids, thin rules | pure CSS; this is the closest thing in the set to what our catalog already does |

**The only class we cannot build today is the illustrated one.** The two streamer stingers
(`transition1`, `transition2`) cover the frame with a painted artwork panel - a machined metal
gate with an extruded glowing logo, and a retro CRT set with the mark on its screen. Those are
raster illustrations with motion applied, not code. That is the "amazing 3D stuff" gap, and
§4 below is the honest answer to it.

**One technique in the recordings is not available to us at all:** both streamer clips blur and
push the underlying feed as the stinger passes. A stinger is an alpha overlay keyed over the
program bus - it cannot touch what is behind it. Those blurs are OBS scene transitions running
underneath, not part of the graphic. Worth knowing before someone tries to copy the look and
concludes our output is flat.

---

## 3. What to take from this into the corpus

Ordered by what it would buy:

1. **Two-tone nested growth** (Circle Rotation). Cheapest mechanism in the set and reads as
   expensive: shapes growing through each other from a point, each a different brand tone. Our
   `logo-punch` burst is one colour; three tones in sequence is a much stronger beat.
2. **A light bar crossing the field** (Flat White). One high-contrast bar sweeping over the
   covering surface, at right angles to its travel. Three of the eight use some version of it.
3. ~~**Radial repetition with glow** (Kaleidoscope).~~ **DONE** - `radial-bloom` in the corpus.
   The single highest richness-per-line technique available: one shape repeated at N angles and
   radii, rotating, with a glow. 120 elements built by a loop, four rings turning at different
   rates and directions, the glow applied once per ring rather than per element, and an iris
   close for a reveal shape nothing else in the corpus has.
4. ~~**Hatched and halftone fills** (showreel).~~ **DONE** - `halftone-cut` in the corpus.
   Circles and panels filled with diagonal stripes or dot grids. Pure CSS
   (`repeating-linear-gradient`, a tiled `radial-gradient`) and it instantly reads as a designed
   pack rather than flat colour.
5. ~~**Two-weight typography** (showreel).~~ **DONE** - `type-slam` in the corpus. One heavy word
   plus one light word of the same size on one baseline, which is the pack's signature; the two
   halves are the composition's two text variables, so a brand rewrites both.
6. **Shorter cover windows, more motion.** The market covers for 0.1-1.2 s. We can spend more
   of the two seconds on things happening and still beat every clip here on coverage.

---

## 4. The artwork gap, and three honest routes to it

The owner's question was whether we can reach the level of the 3D packs. Splitting it:

**Route A - procedural richness, no new dependency.** Most of what reads as "expensive" in the
non-illustrated clips is not 3D at all: glow and bloom (layered `drop-shadow`), gradient meshes
(several `radial-gradient`s over one another), repetition at many radii and angles, and depth
faked with scale plus blur plus parallax between layers. Kaleidoscope Reveal is the proof - it
looks like a rendered effect and is a pattern of flat shapes. **This is the cheapest large step
and it needs no platform work at all**, only better exemplars.

**Route B - the user's own artwork as the covering surface.** The two streamer stingers are
one raster image plus motion. We already have an image variable, an asset pipeline and a
`layout`/`asset` purpose vocabulary. A stinger that takes a full-frame artwork plate and
animates it - shatters it, pushes it, reveals through it - would sit at that level immediately
for any customer who has artwork, and degrade to a flat brand field for anyone who does not.
The Pro concept-image path is a second source of that plate. **This is a real product answer
and it is mostly wiring we already own.**

**Route C - actual 3D.** HyperFrames upstream carries a Three.js runtime adapter, and an
extruded logo with real lighting is a solved problem in the browser. It is compatible with our
render model in principle, because the renderer seeks a paused timeline and a WebGL scene can
be driven from exactly that. What it costs: a bundled 3D library in the offline bundle, a
deterministic-seek proof under the render worker, and a large amount of authoring craft -
lighting and material work is where 3D packs actually spend their money, and no amount of
library gets that for free. **Worth a spike, not worth a plan, until Routes A and B are
exhausted.**

The order is deliberate. Route A costs nothing but taste, Route B is wiring, Route C is a
research project. Doing them in that order also means each one is still useful if the next
never happens.

---

## 5. Reproducing this

```bash
node scripts/stinger-teardown.mjs [inputDir] [outDir]
```

Needs `ffmpeg` and `ffprobe`. Spends nothing, reaches no network. It writes a per-clip contact
sheet, an edge strip around the cover window, the per-frame alpha series as JSON, and
`report.json`.

**The alpha statistics in this script ARE the §4.2 per-pixel gate.** Since 2026-08-13 the
measurement lives in `scripts/lib/stingerAlpha.mjs` and `scripts/stinger-gate.mjs` runs it over
our own rendered frames - same per-pixel opaque/clear counts, same border-versus-interior split
that decides whether a near-miss is edge softness or a hole. One implementation on purpose: two
copies of "is this frame covered" is how the corpus comes to pass a gate the market would fail,
or the reverse.

**A second trap, from running this over PNG sequences:** a screenshot of a fully transparent
frame is encoded as a smaller PNG type than a busy one, so the image demuxer changes pixel
format mid-stream and the filter graph refuses to reinitialise. It stopped after 8 of 100 frames
and reported nothing the caller could see - which would have read as "the composition is 8
frames long". `format=rgba` at the head of the chain normalises it.

**One trap already paid for:** compositing a transparent clip onto an ffmpeg `color` source in a
single filter graph looks correct and is not. `color` runs at its own frame rate, so `overlay`
pairs the first video frame with a dozen background frames and `tile` collects a dozen copies of
it. The first version produced sheets of flat grey, which reads as "the clip is empty" - the
most expensive wrong answer available here. The script now extracts real PNGs, tiles them, and
flattens the finished sheet once.
