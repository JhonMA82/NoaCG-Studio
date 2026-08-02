# Creative Mode - the reference round, 2026-08-02

The first round in which the pilot's reference briefs were actually given their references.
**$0.106 total** ($0.082 for the eight-brief round, $0.024 to re-run the two reference briefs
after a defect it exposed).

## What was wrong before this round

Four briefs in the bank have said **"the attached mood board"**, **"plate attached"** and
**"the attached poster"** since the bank was written. The rig passed `images: []` and no
references at all. **Every round ever run told the model to follow an attachment that did not
exist** - including two briefs (`lt-mood-board`, `lt-busy-plate`) the reviewer later rejected.

## The wiring

The staged pipeline's designing stages are text models by choice - that is what makes arm C
cost a tenth of the control - so a picture cannot be handed to them. Stage 3 reads every
attachment ONCE with a vision model into structured words, and those words ride the concept,
spec and style calls alike. Purpose decides what may be said: `mood` gives colour and texture
and explicitly no arrangement, `layout` gives arrangement and no artwork, `plate` is what the
graphic must survive rather than anything to draw.

Reference fixtures are SYNTHESISED (`scripts/creative-reference-fixtures.mjs`), not collected.
Real broadcast graphics belong to whoever made them, and more importantly a mood board carries
no composition - a real design used as a "mood" reference would smuggle a layout in and leave
the experiment unreadable, because a good result could not be told from copying the picture.

**A defect this exposed, fixed mid-round:** the reading has to REPLACE the picture, not
accompany it. The first attempt read the references correctly and then failed every brief that
had one - all three arms, instantly - because the raw image blocks were still in the message
and a text route rejects the request outright rather than ignoring the image. Arm A is the
frozen control and its code may not be touched, so the rig no longer hands it references at
all; the asymmetry is stated below.

## Do references land? YES, measurably

`lt-mood-board`, arm C. The fixture is warm papery ochres. The spec that came back:

```
--text-color: #513C2A   (dark brown ink)
--panel-bg:   #DDCAB8   (warm cream paper)
```

That is the reference, read correctly and carried into the design contract. `lt-busy-plate`
picked up a text shadow, which is the plate reading's legibility advice landing. **The
mechanism works.** This is the first evidence in the pilot that a taste input can reach the
output at all.

## And the result is still unairworthy - for a reason worth having

The mood-board frame renders dark brown text on the dark bench plate, less legible than the
round before it. Not because the model chose badly - the spec is *correct*, ink on paper - but
because **`--panel-bg` is declared and never painted.** The only `background` in the generated
stylesheet is `transparent` on the body. The scaffold publishes a panel colour as a variable
and leaves painting the panel to the style stage, which frequently does not.

So a reference that was read perfectly produced a WORSE frame, because the platform declared a
paper colour and drew no paper. The same defect explains the reviewer's note on a frame from
the previous round - *"readability may be weak unless the text has a dark outline or shadow"* -
and their note on another - *"no plate"*.

**This is a platform fault, deterministic and small**: a spec that declares a panel colour and
a design that paints no background on the box should get the panel painted for it. It sits
exactly where `templates/pack4/skin.ts` `panelCss` already lives.

## Gates (8-brief round, before the mid-round fix)

| arm | completed | validity | structurally complete | style landed | diversity | $/attempt |
|---|---|---|---|---|---|---|
| A | 6/8 | 83% | 33% | n/a | n/a | $0.0082 |
| C | 6/8 | 33% | 83% | 67% | **100%** | $0.0013 |
| D | 6/8 | 50% | 67% | 100% | 83% | $0.0034 |

The two failures per arm are the reference briefs killed by the image-block defect; the
re-run of those two came back 6/6 valid. Concept diversity at 100% on arm C is its best
reading in any round.

**Attribution caveat, stated where the numbers are:** on a brief carrying a reference, arm A
receives nothing and the staged arms receive a vision reading. The control is the frozen coder
on a text route - it cannot consume a picture, and handing it one fails the brief outright. So
a reference brief compares a pipeline that can see against one that cannot, and C-vs-A is not
single-variable there. It is single-variable on the other 17 briefs.

## Next

1. **Paint the declared panel.** The smallest fix with the clearest evidence behind it in this
   whole pilot: a colour the design contract declares and nothing draws. Free to implement and
   free to verify by recompiling the archived specs.
2. Then re-run the reference briefs - a mood reference on a graphic that paints its paper is
   the actual test of whether references improve output, and this round could not run it.
3. The vocabulary ruling (§3.3 / §4) still gates the composition faults, which references did
   not touch: the frames are still centred text with no plate and no hierarchy.
4. `vs-plate` and `vs-transform-ref` carry fixtures now and have never been run with them.
