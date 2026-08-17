# The `gemini-3.7-flash` round - 2026-08-17

**No verdict is written here or anywhere in this folder.** The round exists so that a person can
look at 3.7-flash's output beside the accepted 2.5-flash set and decide, and a machine number
sitting next to an unjudged picture is how a page starts framing it.

## What was run

    node scripts/pro-spike.mjs --generate --route=vercel:google/gemini-3.7-flash \
      --arms=language --divergence-arm=language --max-cost=0.40 \
      --out=benchmarks/pro/evidence/round-2026-08-17

The same 12-brief bank, the same synthetic brands, the same `assignment` and `divergence`
fixture and the same pinned decoding (temperature 0.7, seed 20260811) as
`round-2026-08-16` - so the two rounds differ in the CHECKPOINT and in nothing else that was
chosen. The free control pass ran first and was clean on all 20 items.

## What it produced

18 of 18 cells captured. **`CONTRACT OK` on every one, 0 repair rounds, 0 fields fallen back to
the house language, 0 palette furniture repaired at generation time.** Spent **$0.107** of the
$0.40 ceiling.

## The pictures

- `review.html` - this round alone, blind, with the motion strips and clips.
- `set-gallery.html` - one design language rendered as the whole package, judged as a row.
- **`../two-rounds-blind.html`** - the one that answers the question this round was run for:
  all 36 generations from BOTH rounds in one shuffled list, recomposed through today's composer
  so the composer is not a variable, with nothing on the page saying which round an item came
  from. Write notes into `../two-rounds-notes.md`, then reveal:

      node scripts/pro-round-compare-gallery.mjs \
        benchmarks/pro/evidence/round-2026-08-16 benchmarks/pro/evidence/round-2026-08-17 \
        --out=benchmarks/pro/evidence/two-rounds-blind.html --reveal

  The `blind/` frames it copies are gitignored and rebuilt by that command, so the folder can be
  regenerated from the two rounds for nothing.

## The machine diff

`language-diff.md`, written by `node scripts/pro-language-diff.mjs <roundA> <roundB>` - counts
only. The figures that are not obvious from the ledger:

- **The two rounds billed the same money for opposite reasons.** $0.1070 against $0.1072, over
  18 generations each. 3.7-flash bills 1.5x the completion rate ($3.75/M against $2.50/M) and
  emitted **21,141 output tokens against 38,652** - 45% fewer - so the rate and the volume
  cancel almost exactly.
- **81% of 3.7-flash's output was reasoning** (17,220 of 21,141), for an answer that is about
  200 tokens of enum values. The 2.5-flash round has no reasoning figure at all: the runner did
  not record one until this round, so the diff prints "not recorded at capture time" rather than
  a zero. A single probe on the same brief measured 2.5-flash at 92% (`../probe-2026-08-17/`).
- **Brand adherence went to 18/18 on all three counts** - accent, panel and typeface are the
  assigned brand's own - against 17 of 18 each.
- **Palette and shape variety went the other way.** `shape.panel` entropy 0.31 against 0.67
  (`solid` on 17 of 18 cells against 12 of 18); mean pairwise accent distance 0.196 against
  0.282 in OKLab; 5 distinct accents against 6. `supportingCase` and `motion.pace` moved the
  opposite way.
- **Neither round collapsed**: 18 distinct look signatures out of 18 cells on both sides, where
  a signature is every enum field with the palette and the name removed.
- **`typography.step` is `clear` on all 36 cells across both rounds.** Neither checkpoint has
  ever returned `subtle` or `strong`.
- **The composer had to repair 1 cell of 18 here against 4 of 18 there** - one mark ink knock,
  against three text-dim lightness clamps, a text lightness clamp and the same knock.

## A thing the recompose turned up on the way past

**`--recompose` is not byte-stable on the Anton cells, and that is worth knowing before anyone
reads a frame diff as a composer change.** Recomposing `round-2026-08-16` today moved 3 of its
36 frames against the committed ones - all three kestrel cells, which are the ones set in Anton.
Running the identical command a second time, with no code change in between, moved 2 of the same
3 again:

| frame | pixels differing (>8/255) | share | max channel delta | box |
| --- | ---: | ---: | ---: | --- |
| `long-name.kestrel.hold` | 8,853 | 0.43% | 97 | 136,770 → 1227,960 |
| `sports-live.kestrel.stress` | 7,728 | 0.37% | 65 | 136,791 → 1156,960 |
| `sports-live.kestrel.hold` | 0 | 0% | - | reproduced exactly that time |

Two consecutive runs of the same code disagreeing is what settles it: this is run-to-run
variation, not the composer moving. The differences sit inside the graphic's own bounds and peak
well below saturation, which is the shape a rasterisation difference has rather than a layout
one - **but the mechanism has not been diagnosed and is not claimed here.** `results.json` was
byte-identical across all three runs, so no cell's `recomposedAdjustments` moved; §17.11's
"recomposed byte-for-byte in their adjustments" is a claim about the ledger and it still holds.
The committed 2026-08-16 frames were restored rather than churned, since neither version is more
correct than the other.

## What this round does NOT establish

One round, one bank, one seed, one temperature. The variety figures are counts over 18 cells,
not a distribution, and nothing here has been looked at by a person yet.
