# NoaCG Pro - tight-concept placement round, 2026-08-10

The paid verification round for `pro-interpret-v3`: ask for the graphic alone, interpret its
canvas size and placement separately, preserve native concept pixels, and downscale only.

    node scripts/pro-bench.mjs --generate \
      --image-route=vercel:google/gemini-3.1-flash-image \
      --interpret-route=vercel:google/gemini-2.5-flash \
      --max-cost=1.30 --save-fixtures

**Spent $1.014569 over 12 briefs.** All 12 completed and were saved as fixtures. The whole
26-file output was archived and verified at
`C:\claude\noacg-lite-eval-archive\pro-tight-concept-placement-2026-08-10` (10.63 MiB).

The generic `npm run bench:preflight -- vercel:google/gemini-2.5-flash` command rejected the
route because that preflight only resolves Lite/import-analysis arms. The Pro-specific free
environment check, `node scripts/bench-env.mjs --profile=pro`, passed before the round.

## Result

**Machine: 9/12 pass. Human: 8/12 usable or acceptably degraded, 4/12 broken.**

The placement change is verified on its own terms:

- Every output used a scale at or below 1.00. No source was visibly upscaled or stretched.
- Nine concepts contained enough source pixels for the requested canvas size and were
  downscaled. `sports-live`, `minimalist`, and `multiline-title` stayed at native size and were
  honestly marked `SOURCE-LIMITED`.
- All graphics landed in the lower half and inside the safe canvas bounds.
- The prompt produced graphics rather than studio mockups. It did not always produce a truly
  tight image: several concepts still carried white, grey, or dark backdrop around the strap.

That is real progress over the full-frame concepts, but it did not fix the reconstruction
failure. `corporate`, `minimalist`, and `multiline-title` still show baked text underneath live
text. `portrait-logo` removes the portrait and leaves an empty logo placeholder. Two of those
four broken frames passed the machine gate, so the bench still cannot use `pass` as a proxy for
airability.

## Every frame read

| Brief | Machine | Scale | By eye |
|---|---:|---:|---|
| `news-public` | PASS | 0.49 | **Usable.** Sharp, aligned and clean. The output is smaller and flatter than the drawn panel, but it would air. |
| `sports-live` | SOURCE-LIMITED | 1.00 | **Usable.** Native-resolution 1130px strap, clean live text and no ghosting. The angled concept becomes a rectangle, so fidelity is degraded. |
| `entertainment` | PASS | 0.75 | **Usable.** Clean gradient panel and aligned live fields; the secondary offset panel detail is lost. |
| `corporate` | PASS | 0.86 | **BROKEN.** Baked name and title remain under differently sized live fields. The compiler warned about both ghosts, but `pass` ignored the warnings. |
| `minimalist` | SOURCE-LIMITED | 1.00 | **BROKEN.** The result is crushed into a small bottom-left crop with doubled, clipped text. |
| `portrait-logo` | PASS | 0.77 | **BROKEN.** Placement is sharp, but the portrait becomes a solid circle and the logo remains an empty outlined slot. |
| `long-name` | PASS | 0.92 | **Usable.** The 46-character name remains legible, aligned and unghosted. |
| `multiline-title` | SOURCE-LIMITED | 1.00 | **BROKEN.** Baked and live text overlap inside an excessively shallow crop. |
| `empty-optional` | PASS | 0.74 | **Usable.** Clean, legible and aligned with no optional-field residue. |
| `non-latin` | PASS | 0.59 | **Degraded but usable.** Both scripts survive cleanly; bevel/perspective is flattened and a narrow white edge remains. |
| `high-contrast` | PASS | 0.72 | **Usable.** Clean, proportionate and sharp. |
| `gradient-accent` | PASS | 0.49 | **Usable.** Clean and sharp, though the concept becomes a compact square rather than a conventional strap. |

## What this changes

The old geometry diagnosis and the new placement diagnosis must now stay separate:

1. The old 0.72x canvas arithmetic defect is fixed. Final size is an explicit interpreted
   decision, source pixels are preserved, and scale never exceeds 1.00.
2. Tight prompting improved pixel use enough for nine of twelve briefs, but it did not remove
   baked text from the concepts. A model can still draw text over a non-flat panel even when the
   graphic is tightly framed.
3. Reconstruction remains the blocking defect. Non-flat text cannot be erased safely, flattened
   panels retain it, and the machine gate counts warned ghosting as a pass. The next change should
   make these warnings fail the bench and either produce a clean plate before live reconstruction
   or stop presenting such outputs as usable.

No further paid call is needed to reproduce this result: all twelve concept/interpretation pairs
are committed under `benchmarks/pro/v1/fixtures/`.
