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
| `stingers/replay-slab.html` | aggressive sports; the "to slow-motion replay" reference case | one heavy skewed slab drives across behind a bright accent edge | the mark crosses the live picture first, oversized, and the slab arrives behind it |
| `stingers/aperture-bands.html` | precise editorial / news | eight vertical bands close the frame from alternating edges | the same eight columns open off the mark, so the reveal is the cover's own motion |
| `stingers/logo-punch.html` | the mark IS the transition | the field bursts out from behind the flying mark, then breaks into three slabs | the logo produces the cover and destroys it |

Three files, three genuinely different *mechanisms* - lateral wipe, tiled close, burst and
shatter - because a corpus of three variations on one move teaches a model nothing about the
type.

### The rules they are held to (owner review, 2026-08-13)

Binding, and the reason the second version of these files looks different from the first
(plan §2.4):

1. **The mark goes on the field, never on a plate.** A logo in a box is a picture of a logo.
   The tone answer is that a brand supplies a field colour suited to its own mark's ink.
2. **The cover is an event, not a parked panel.** Nothing in the covered stretch is static.
3. **The mark helps produce the cover** wherever the design allows.

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
(`benchmarks/video/v1/marks/MARKS.md`) live - plus a contact sheet that scrubs all three at
once, so the brand swap can actually be looked at rather than asserted.

Each full-size page also carries a **geometry check** (top right, `run`). It answers two of
§2.2's three questions with the strongest instrument a plain browser page has, and it is
explicit about which:

- **Empty head and tail is proved exactly.** An axis-aligned bounding box is a *superset* of
  the painted area, so "no box of any painting element touches the frame" leaves nothing to
  argue with.
- **Cut-window coverage is SAMPLED.** `elementsFromPoint` honours every transform and clip
  exactly, but it is asked on a 16 px grid over every frame of the declared window, so it
  cannot see a hairline seam. **It is not the pixel gate.**
- **Duration honesty** compares the timeline's own length against `(N-1)/fps`.

The check refuses to run in a viewport with no layout, because every loop in it then completes
without testing anything - a false pass that looks exactly like a real one.

### Measured 2026-08-13 (second version, after the owner review)

All three, 4 of 4 checks, over every frame of the declared window at 8160 sample points per
frame:

| composition | fps | result |
| --- | --- | --- |
| `replay-slab` | 50 | frame 0 empty, frame 99 empty, frames 23-56 covered, timeline 1.920 s vs last frame 1.980 s |
| `aperture-bands` | 25 | frame 0 empty, frame 49 empty, frames 12-28 covered, timeline 1.850 s vs last frame 1.960 s |
| `logo-punch` | 60 | frame 0 empty, frame 119 empty, frames 28-67 covered, timeline 1.920 s vs last frame 1.983 s |

Each was also probed at times where it *should* fail (mid-transition, before the cover closes,
after it opens) and failed there, so none of the four passes is vacuous.

**Still unmeasured:** per-pixel alpha on rendered frames, which is the real §2.2 gate and the
next work item (plan §4.2), and motion quality, which per the plan's own rule is judged from a
rendered MP4 and never from a scrubbed pane.
