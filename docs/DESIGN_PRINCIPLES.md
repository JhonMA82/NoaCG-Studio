# Design Principles

The WHY layer under `docs/DESIGN_LANGUAGE.md`. That file holds the house's specific numbers -
this one holds the general principles those numbers implement, stated so they apply to ANY
graphic we make: a lower third, a full-frame card, a scoreboard, a stinger, a corner bug.

**Read `docs/DESIGN_LANGUAGE.md` for what to type. Read this for what to ask.**

## Why this file exists at all (read before adding to it)

A cheap model already knows these twelve words. It can define every one of them, and it will
happily tell you a composition needs better hierarchy. **What it does not do is apply them under
constraint** - and this repository has measured that difference twice in one day:

- The mark-surface rule written as a JUDGEMENT ("the surface must be a compositional element,
  not a bounding box") moved the defect rate by nothing: 9/18 boxed untaught, 8/12 taught.
- The same concern written as a BOUNDARY ("do not draw a backing; the seat is the platform's")
  took clean marks from 2/12 to 8/11.
- Taking the decision away entirely - the platform places the mark - took it to 10/12.

So the ranking this file is organised by, and the one to keep applying:

1. **Remove the decision.** The platform decides and the model cannot get it wrong. Strongest,
   and the reason `applyLogoSlot` and `fillBrandMark` exist.
2. **Make it measurable.** A number a script reads off the rendered frame, reported per
   generation - `measureRenderedMark`, `axisCheck`, `type-floor`, `overflow-sweep`.
3. **State it as a boundary.** "Never do X" beats "make X good", because the second asks for
   taste and the first asks for compliance.
4. **State it as a judgement.** Weakest. Use only where nothing above can reach - and expect it
   to move a rate by roughly zero.

**Adding a principle here as prose is not teaching it.** A principle earns its place in the
harness when it reaches level 1, 2 or 3. Level 4 is a note to a human reviewer, which is a
legitimate but different job.

## What the owner's blind reads actually fail on

Worth stating before the list, because it decides the order of work. Across the 2026-08-13
brand round and the seated round, the owner's own words on every failed or repair-needed
item name **proportion, white space and alignment** - and almost nothing else:

- "too much space beneath … we need a taste check for how much padding and margin"
- "the name text too close to the line and it's too tight … too big for the banner so it looks
  crammed"
- "the logo is not aligned to anything and it takes half the screen"
- "the box is way too big. The logo is not aligned with the text"
- "the text is on top of the line. It's all crammed in"

Colour and motion are almost never the complaint; when they are mentioned it is praise ("the
black and white gives it a nice contrast", "the animation looks pretty good"). **The failure
surface is geometry, and geometry is measurable.** Principles 4, 5, 9 and 12 below are
therefore the ones worth spending on first.

---

## 1. Contrast

**What it is:** deliberate difference - in tone, size, weight, colour, shape or direction - so
that unlike things read as unlike.

**In a graphic:** the name outranks the role because it is heavier and larger, not because it is
higher up. Text survives over moving footage because its background is genuinely darker, not
slightly darker.

**How to apply:** make every difference decisive. If two things differ, they should differ
obviously; a 10% size difference reads as a mistake, a 40% one reads as intent. Never rely on
colour alone for a distinction - weight and size still work on a monochrome monitor.

**Testable:** contrast ratios against the surface actually painted (WCAG 4.5:1 for primary text,
3:1 for non-text marks). We already measure this for text and for brand marks.

## 2. Balance

**What it is:** visual weight distributed so the composition does not feel like it is falling
over. Symmetrical (mirrored), asymmetrical (unequal but counterweighted), or radial.

**In a graphic:** a heavy left-anchored panel wants something on the right - even empty space
that is deliberately empty. A mark on one side and a long name on the other balance; a mark on
one side and nothing else does not.

**How to apply:** pick one and commit. Asymmetric is usually right for broadcast because the
frame is shared with live pictures, but an asymmetric layout still needs its counterweight.

**Testable, partly:** the painted bounding boxes' centre of mass against the frame's. Not built.

## 3. Emphasis

**What it is:** one element wins. The eye goes somewhere first, and that somewhere is chosen.

**In a graphic:** the person's name. Everything else - role, mark, accent, timestamp - supports
it and must not compete with it.

**How to apply:** decide the ONE thing before drawing, then make everything else quieter. Two
emphases is none. An element that is neither the emphasis nor support of it should be deleted -
"the orange circle is just there" is this principle failing.

**Testable, partly:** largest painted text area should belong to the declared primary field.
Not built; cheap to build.

## 4. Proportion

**What it is:** the size relationships between parts, and between parts and the whole.

**In a graphic:** the mark is sized relative to the text it stands beside, not to the frame. The
panel is sized to its content plus its air - not the reverse.

**How to apply:** size things by RATIO, not by absolute value: a subhead at 0.5-0.6 of the
heading, a mark whose height matches the text block it accompanies, a panel whose width follows
its longest line. Never size a container first and pour text into it - that is how "the text is
too big for the banner so it looks crammed" happens.

**Testable:** yes, and this is the highest-value unbuilt gate. Ratio of text block height to
panel height, mark height to text height, panel area to frame area. All readable off the
rendered frame.

## 5. Hierarchy

**What it is:** the order in which things are meant to be read, made visible.

**In a graphic:** name, then role, then affiliation. A viewer who reads only the first line
still gets the point.

**How to apply:** rank the content before styling it, then express the rank with size, weight
and position - the three that survive at broadcast distance. Do not express rank with colour
alone. Every level of hierarchy costs air: a rank the layout cannot afford should be cut, not
squeezed.

**Testable, partly:** monotonic decrease in type size down the declared field order. Cheap.

## 6. Repetition

**What it is:** the same decision made the same way every time it recurs.

**In a graphic:** one corner radius, one accent weight, one gap value, one easing pair - across
the graphic and across the whole package of graphics for a show.

**How to apply:** decide once, reuse. This is what the `:root` variable contract IS: repetition
enforced by construction, which is why a hardcoded colour outside `:root` is a real defect and
not a style nit.

**Testable:** yes, already - the code audit counts hardcoded colours and raw pixel values, and
a raw value is a repetition failure wearing a code-quality costume.

## 7. Rhythm

**What it is:** repetition with intentional variation, so a sequence has a beat rather than a
drone.

**In a graphic:** a stagger - lines arriving 80ms apart rather than together or randomly. A
scoreboard's rows sharing a cadence. Rhythm is mostly a MOTION principle for us.

**How to apply:** vary one dimension while holding the rest. Equal intervals are a pattern;
intervals that accelerate or ease are a rhythm. Entrances should feel like one gesture with
parts, not several animations that happen to overlap.

**Testable, partly:** stagger intervals are already keyframe data we can read.

## 8. Pattern

**What it is:** a repeated motif that becomes a surface or a system.

**In a graphic:** a hairline grid, a dot field, a repeated chevron, a scanline texture. Rare in
broadcast and easy to overdo - pattern competes with the live picture behind it.

**How to apply:** if a pattern appears, it should be the quietest thing on screen and it should
have a reason. A texture that neither carries brand nor separates layers is decoration, and
decoration is the first thing to cut.

**Testable:** no. Human read.

## 9. White space

**What it is:** the emptiness. Not leftover - allocated.

**In a graphic:** padding inside a panel, the gap between mark and text, the space between the
graphic and the frame edge, the space AROUND the whole graphic in the live picture.

**How to apply:** treat air as a component with a size. Give related things less of it and
unrelated things more - proximity is what says "these belong together". Clear space around a
brand mark is non-negotiable and is usually specified by the brand itself (we use a quarter of
the mark's height). When a layout is crowded the answer is less content, not less air.

**Testable: BUILT** - `src/ai/spike/spacingCheck.ts`, calibrated by
`scripts/spike-spacing-calibrate.mjs` over the 90 catalog lower thirds. Panel padding, gaps
between stacked lines, gaps between text and the design's own rules, and the mark's clear space,
all as ratios of type size. **1/90 catalog base rate**, and it catches three of the four spacing
complaints in the owner's blind notes - including the one they asked for by name ("too much
space beneath" fires as `padding-lopsided` on exactly that item). See the calibration notes at
the end of this file for what it deliberately does not measure.

## 10. Movement

**What it is:** how the composition leads the eye, in space and over time.

**In a graphic:** entrance order IS reading order. The eye should arrive where the hierarchy
says it should, and motion should deliver information rather than announce itself.

**How to apply:** animate in the order you want things read. Motion serves the composition -
if removing an animation loses nothing, remove it. Exits are faster than entrances because
nobody needs to read something leaving.

**Testable, partly:** entrance order against declared field order is readable from the keyframe
data. The QUALITY of motion stays a human read, which is why the review gallery now plays
clips.

## 11. Variety

**What it is:** enough difference to hold attention.

**In a graphic:** the least important principle for us, and the most dangerous. Broadcast
graphics are seen for eight seconds and must be instantly legible; variety is what makes a
design interesting on a portfolio page and cluttered on air.

**How to apply:** get variety ACROSS a package - different graphic types looking genuinely
different - not within a single graphic. Inside one graphic, variety is spent on the one
emphasis and nowhere else.

**Testable:** across the catalog, yes - `catalog-sameness.mjs` measures the opposite failure.

## 12. Unity

**What it is:** everything looks like it belongs to the same thing, made by the same hand.

**In a graphic:** shared alignment, shared spacing scale, shared type family, shared corner
language. Unity is what "the logo is not aligned to anything" violates.

**How to apply:** align everything to something. Every edge should either line up with another
edge or be clearly, deliberately offset - the near-miss is what reads as broken, which is why
our alignment-axis instrument flags near-misses rather than misalignment. A brand mark must sit
ON the design's grid, not merely near it.

**Testable:** yes, already - `axisCheck.ts`, calibrated over 90 catalog lower thirds.

---

## The short version

If you can only hold four: **hierarchy** decides what is read first, **proportion** decides how
big it is relative to everything else, **white space** decides whether it can breathe, and
**unity** decides whether it lines up with anything. Those four are where every failed review
item in this project has landed. Contrast keeps it legible. The rest are refinements on top.

## What the spacing gate learned from the catalog (2026-08-13)

The first version of `spacingCheck.ts` flagged 5 of 90 shipped designs. Every one was the
instrument being wrong, and each correction is a rule worth keeping:

- **A band's unused side is not padding.** `lt55` and `ls15` carry a fixed-width strap with
  left-aligned text, so their right "padding" is ~6.8 type sizes of empty band - read as a 10x
  imbalance. Horizontal balance is only a spacing question when the panel HUGS its content;
  otherwise the width was chosen. Vertical balance is always fair game, and that is where the
  owner's complaint actually lives.
- **Touching text boxes are ordinary typography.** `lt12` and `lt06` ship with adjacent lines at
  exactly 0 gap, because line-height supplies the leading INSIDE each box. A floor above zero
  fails correct designs; only a real overlap is a defect. The ratio is still reported.
- **Touching is not overlapping.** `lt39` bolts its name to a solid accent block on purpose. A
  zero distance is contact; overlap has to be a measured intersection on both axes.
- **The "line" in the owner's notes is the accent rule, not a sibling text line.** The first
  version only ever paired text with text and so could not have seen either of the two
  complaints it was built for. Text-versus-rule is the measurement that matters.

And what it will not chase: B-19's "maybe a bit too much space between the logo and the text"
measures 0.91 mark-heights - **identical to three items the same reviewer praised**. Same
geometry, opposite verdicts. Tightening the ceiling to catch it would flag all three, so the
instrument stays quiet and the judgement stays human. That is the same honest limit the
bounding-box-well check carries, and it is the boundary between principles 2 and 4 above.

Sources for the general principles, kept so the vocabulary is not invented here:
[Toptal, The 12 Principles of Design](https://www.toptal.com/designers/ui/principles-of-design),
[Superside, Principles of Design](https://www.superside.com/blog/principles-of-design-guide),
[Interaction Design Foundation / UXPin, Elements and Principles](https://www.uxpin.com/studio/blog/basic-elements-design/).
Broadcast specifics (title-safe geometry, entrance timing, type roles):
[Motion Array, Broadcast Design Terms](https://motionarray.com/learn/motion-design/broadcast-design-terms/),
[Title-safe area guide](https://handcraftedpen.co.uk/title-safe-area/).
