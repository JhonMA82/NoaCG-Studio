# NoaCG Pro - full brief-bank round, 2026-08-09

The first Pro round run for QUALITY rather than cost. Twelve briefs, the standard gateway
routes, `--save-fixtures` so the interpretations survive this time.

    node scripts/pro-bench.mjs --generate \
      --image-route=vercel:google/gemini-3.1-flash-image \
      --interpret-route=vercel:google/gemini-2.5-flash \
      --max-cost=1.30 --save-fixtures

**Spent $0.940 over 12 briefs.** Archived whole at
`C:\claude\noacg-lite-eval-archive\pro-full-round-2026-08-09` (25 files, verified).
Ten fixtures are committed under `benchmarks/pro/v1/fixtures/`, so every one of these
interpretations replays free from now on - the 2026-08-08 round did not save them and lost
twelve.

## The headline

**The bench reported 10/10 pass, every one at `editability 1.00`. Of the five frames read by
eye, two are usable, one is degraded, and two are broken badly enough to be unairable.**

That is the same disagreement the 2026-08-08 round hit (visibly broken on 5 of 12 while the
gates reported 11 of 12 passing), reproduced after the scoring fix, and it is the finding that
matters: **no gate in this rig measures whether the compiled graphic resembles the concept the
model drew.** `editability` measures how much of the design became editable text, which is a
real and different question - it answers 1.00 for a graphic that is entirely editable and
entirely wrong.

Cost held exactly to the 4-brief baseline: $0.940 / 12 = $0.0783 per generation against the
predicted $0.0777, and the concept image was $0.0671 flat on every brief again.

## What the frames show (5 of 10 read)

| Brief | Machine | By eye |
|---|---|---|
| `corporate` | PASS 1.00 | **Usable.** Clean, legible, proportionate. Dead space right of the text and an empty logo well on the left, but this would air. |
| `gradient-accent` | PASS 1.00 | **Usable.** Gradient survived. Type is small for broadcast and the panel carries dead space, but nothing is wrong. |
| `news-public` | PASS 1.00 | **Degraded.** The concept centred the name over a hairline rule in a panel that hugged the text. The compile left-aligned both lines at roughly half the drawn size, dropped the rule entirely, flattened the gradient to one blue, and stretched the panel to three times the width the text needs. Recognisably the same idea, none of the craft. |
| `high-contrast` | PASS 1.00 | **BROKEN.** The baked name from the artwork is still on screen ABOVE the rebuilt panel - "Sam Peterson" appears twice, once as clipped white letters behind the graphic and once as live text inside it. |
| `minimalist` | PASS 1.00 | **BROKEN.** Every line doubled and overlapping, the whole graphic crushed into a ~320x200 box in the bottom-left corner with the artwork clipping it. Unreadable. |

The two broken ones share a cause worth stating precisely: **the erase and the rebuilt panel are
computed at different scales, so the original baked text is no longer covered by what replaces
it.** That is the `pro-geometry-audit` family of defects (0.72x design-pixel scaling, 0.59x live
text) reaching the screen, not a new one - but a GHOST OF THE NAME is a more serious symptom than
"text is smaller than drawn", because it is duplicated content on air rather than a proportion
mistake.

Every concept image was good. The model drew five broadcast-plausible lower thirds; the compiler
is what lost them. That supports the 2026-08-09 re-diagnosis (`DIAGNOSIS.md` in the
`round-2026-08-08` folder) rather than the older "image-led reconstruction cannot work" reading.

## Two hard failures

- **`sports-live`** - `The design interpretation came back off-shape.` $0.078 spent, concept
  kept. Same brief the 2026-08-08 round flagged for angled panels the schema cannot express.
- **`portrait-logo`** - `The AI response was cut off by the output token limit.` $0.067 spent,
  concept kept. This one is OURS and is fixable: `compileProConcept` asks for
  `outputBudget(4000)` and this brief's interpretation does not fit. A brief that costs a paid
  concept and then throws the interpretation away on a budget we chose is the cheapest bug in
  this list to close.

## The gate now exists (added the same day)

Step 2 below is DONE. `scripts/pro-geometry-audit.mjs` had been measuring this all along and
`pro-bench` never read its answer - the scoring-bug shape the re-diagnosis named, one level up.

Run free over the whole bank, the audit gives **0.72 on ten of eleven fixtures** (0.73 for
`corporate`, whose concept came back 1408 wide), with live text landing near **0.50x** the baked
glyphs it replaces. The ratio reduces to exact arithmetic - `conceptWidth / frameWidth` - because
the design unit's share of the concept and its share of the frame differ by nothing else, so
`proDesignScaleRatio` / `proScaleFaithful` (`src/ai/pro/contract.ts`) compute it without
rendering anything, and `api/_lib/proGeometry.test.ts` pins it in the build gate.

`pro-bench` now prints the ratio on every line and **counts it in `pass`**. The free fixture
replay consequently reads **1/12**, and the one pass is the deterministic STUB, which draws at
frame size and scores 1.00x - the control that shows the gate is measuring rather than simply
failing everything.

The bank did not get worse. The reporting stopped being kind.

## What to do next, in order

1. **Raise the interpretation budget** so a brief cannot lose its paid concept to our own cap
   (`portrait-logo`). Smallest fix, guaranteed value.
2. ~~Make the geometry defect visible to a gate.~~ **Done** - see above.
3. **Fix the cause - and it is a DECISION, not arithmetic.** (This corrects an earlier line here
   that said the fix belongs in `normalize.ts`; checking the code showed that to be too
   confident.) The artwork IS the concept crop, so rendering at the intended size means
   stretching a 1376px-wide raster across 1920px: the graphic gains size and loses sharpness,
   and no coordinate change recovers pixels the image never had. Three routes, none free:
   - **Root `--scale`** - the design unit already multiplies artwork and fields by it together
     (src/components/AGENTS.md "THE DESIGN UNIT"), so this is one value rather than a
     coordinate refactor. Costs sharpness. Probably the right first move, and the gate scores
     it 1.00 immediately.
   - **Ask for a bigger concept** - not available today: the gateway's image call carries
     `modalities` and no size parameter (`api/_lib/aiGateway.ts`), so this needs transport work
     or a different route.
   - **Compose at the concept's own resolution** - honest and sharp, but it makes Pro's output
     frame follow whatever the image model returned, which the rest of the product does not
     expect.

   Whichever is chosen, the gate above is how you will know it landed: a faithful compile
   scores 1.00. Judge sharpness by eye on the same fixtures - the gate cannot see it.
4. **Only then** re-open whether the reconstruction path is viable. Judging it on these numbers
   would repeat the mistake the re-diagnosis identified - the approach has still not been fairly
   tested, because the compiler is losing designs the model got right.

**Not evidence about NoaCG Lite.** Separate projects, separate quality bars (src/ai/AGENTS.md).
