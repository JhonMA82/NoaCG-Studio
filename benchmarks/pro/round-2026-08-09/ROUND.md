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

## The budget fix is VERIFIED (and cost 4x the estimate)

`outputBudget(4000)` -> `7000`, re-run against the exact archived concept that truncated:
**1/1 succeeded, 14 regions, $0.0322.** Fourteen regions is far more than the ~2,200-token
document the old 4,000 was sized against, which is the whole explanation.

Two things that number is worth beyond the pass. It is the **dearest interpretation seen** -
the round's range was $0.0068-0.0178 - so `portrait-logo` costs about $0.099 all-in, the closest
any brief has come to the $0.15 ceiling and evidence the ceiling sits in the right place. And it
was estimated at ~$0.008 beforehand, four times under: interpretation cost tracks REGION COUNT,
not brief length, and nothing had measured that before.

`scripts/pro-interpret-probe.mjs` gained `--concept=<png>` to make this possible at all. The
concept worth re-interpreting is by definition one whose interpretation failed, and a failed
brief saves no fixture - so the image only exists in the out-dir and the archive. Copying it into
`benchmarks/pro/v1/fixtures/<id>/` to make the probe see it OVERWRITES a good fixture's concept
and leaves that fixture's `interpretation.json` describing an image that is no longer there.
Nothing checks that pair, so the corruption would be silent and would poison every later free
run. (Written from experience: this session did exactly that and caught it before it landed.)

## What the frames show (all 10 read)

| Brief | Machine | By eye |
|---|---|---|
| `corporate` | PASS 1.00 | **Usable.** Clean, legible, proportionate. Dead space right of the text and an empty logo well on the left, but this would air. |
| `gradient-accent` | PASS 1.00 | **Usable.** Gradient survived. Type is small for broadcast and the panel carries dead space, but nothing is wrong. |
| `news-public` | PASS 1.00 | **Degraded.** The concept centred the name over a hairline rule in a panel that hugged the text. The compile left-aligned both lines at roughly half the drawn size, dropped the rule entirely, flattened the gradient to one blue, and stretched the panel to three times the width the text needs. Recognisably the same idea, none of the craft. |
| `high-contrast` | PASS 1.00 | **BROKEN.** The baked name from the artwork is still on screen ABOVE the rebuilt panel - "Sam Peterson" appears twice, once as clipped white letters behind the graphic and once as live text inside it. |
| `minimalist` | PASS 1.00 | **BROKEN.** Every line doubled and overlapping, the whole graphic crushed into a ~320x200 box in the bottom-left corner with the artwork clipping it. Unreadable. |
| `long-name` | PASS 1.00 | **Usable.** A 46-character name fits and stays legible - the case the brief exists for. Dead space below the text. |
| `multiline-title` | PASS 1.00 | **Degraded.** Legible and un-ghosted, but the type is very small in a large dark panel and the title renders on one line. |
| `entertainment` | PASS 1.00 | **BROKEN.** The baked name ghosts below the rebuilt panel and a strip of raw concept backdrop is visible around it. |
| `non-latin` | PASS 1.00 | **BROKEN.** The baked Greek name sits large behind the live one - the Japanese title line survives, the name is doubled. |
| `empty-optional` | PASS 0.67 | **BROKEN.** Baked "Nora Lindqvist" and "Correspondent" at full size with the live text overlaid small on top of them. Unreadable. |

**Final tally, all ten read: 3 usable, 2 degraded, 5 BROKEN.** That is the same 5-in-12 rate the
2026-08-08 round hit, reproduced after the scoring fix.

**The dominant failure is ONE defect, not five.** Four of the five broken results show the
artwork's baked text through or behind the live text. The erase is computed against the concept's
own pixels and the panel is rebuilt at a different scale, so what was supposed to be covered no
longer is. Fixing the scale is therefore likely to fix most of the visible breakage too - which
makes it the single highest-value change on this list, not merely a fidelity nicety.

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
3. **Fix the cause: STOP ASKING THE MODEL FOR A BACKDROP.** (Owner, 2026-08-09, correcting two
   earlier readings in this file - first that the fix belonged in `normalize.ts`, then that it
   was a three-way trade between size and sharpness. Both treated the concept's FRAMING as
   fixed. It is not, and it is ours to choose.)

   `proConceptPrompt` currently asks for "a premium broadcast television lower-third graphic,
   rendered in a **full 1920x1080 frame** … over a dark, softly blurred, neutral **studio
   backdrop**". The model answers at ~1376x768 whatever we ask for, so we are spending most of a
   fixed pixel budget painting a backdrop we then crop away and discard. `minimalist` put 23% of
   the width on the actual graphic and binned the other 77%.

   Ask for the graphic ALONE, tightly framed, and the same 1376px carries the strap instead of
   the scenery. Then choose its size and placement on the 1920x1080 canvas as a separate
   decision rather than inheriting them from wherever the model happened to put it. A strap
   drawn at 1376px and placed at, say, 1150px wide is a DOWNSCALE - sharp, with the size
   correct. That is the requirement ("correct size, always sharp"), and neither half costs the
   other.

   What this replaces: root `--scale` alone is a pure stretch and is ruled out; asking for a
   larger output is still unavailable (the gateway's image call carries `modalities` and no size
   parameter, `api/_lib/aiGateway.ts`); composing at the concept's own resolution is unnecessary
   once the framing is tight.

   Expect this to fix most of the visible breakage as well, not just fidelity: four of the five
   broken frames are baked-text ghosts, and there is no baked backdrop to show through once the
   concept is the graphic alone.

   Both halves need re-benching - a prompt change invalidates the fixtures, so budget a fresh
   paid round (~$0.95). The gate says whether the size landed; sharpness is an eye judgement on
   the frames.
4. **Only then** re-open whether the reconstruction path is viable. Judging it on these numbers
   would repeat the mistake the re-diagnosis identified - the approach has still not been fairly
   tested, because the compiler is losing designs the model got right.

**Not evidence about NoaCG Lite.** Separate projects, separate quality bars (src/ai/AGENTS.md).
