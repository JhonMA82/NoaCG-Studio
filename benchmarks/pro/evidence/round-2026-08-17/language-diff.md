# Two Pro design-language rounds, side by side

Machine counts only - no verdict is written here, and none belongs here (the picture
gallery beside this file is blind on purpose).

| | round A | round B |
| --- | --- | --- |
| directory | `round-2026-08-16` | `round-2026-08-17` |
| route | `vercel:google/gemini-2.5-flash` | `vercel:google/gemini-3.7-flash` |
| captured | 2026-08-15T21:52:39.803Z | 2026-08-17T06:51:38.288Z |
| cells with a language | 18 | 18 |

Cells present in both rounds: **18**.

## 1. Field distributions

`distinct` is how many of the contract's values the round ever used; `entropy` is the
normalized Shannon entropy over those values - 1.00 is a flat spread, 0.00 is one answer
repeated. A high distinct count with a low entropy is a round with one habit and a few
exceptions.

| field | A distinct | A entropy | A spread | B distinct | B entropy | B spread |
| --- | ---: | ---: | --- | ---: | ---: | --- |
| `typography.fontId` | 5 | 0.94 | anton 5, libre-franklin 4, outfit 4, source-serif-4 4, inter 1 | 4 | 1.00 | anton 5, libre-franklin 5, outfit 4, source-serif-4 4 |
| `typography.headingWeight` | 3 | 0.93 | bold 8, semibold 7, regular 3 | 3 | 0.91 | bold 10, regular 4, semibold 4 |
| `typography.supportingWeight` | 4 | 0.67 | regular 12, medium 4, bold 1, semibold 1 | 3 | 0.66 | regular 13, medium 4, semibold 1 |
| `typography.step` | 1 | 0.00 | clear 18 | 1 | 0.00 | clear 18 |
| `typography.headingCase` | 2 | 0.92 | caps 12, as-written 6 | 2 | 0.85 | as-written 13, caps 5 |
| `typography.supportingCase` | 2 | 0.50 | as-written 16, caps 2 | 2 | 1.00 | as-written 9, caps 9 |
| `typography.tracking` | 3 | 0.51 | normal 15, tight 2, wide 1 | 2 | 0.65 | normal 15, tight 3 |
| `shape.corner` | 3 | 0.97 | sharp 8, round 6, soft 4 | 3 | 0.79 | sharp 12, round 3, soft 3 |
| `shape.panel` | 4 | 0.67 | solid 12, blurred 4, none 1, translucent 1 | 2 | 0.31 | solid 17, none 1 |
| `accent.form` | 3 | 0.78 | edge-bar 10, top-rule 7, underline 1 | 3 | 0.75 | edge-bar 11, top-rule 6, underline 1 |
| `accent.weight` | 3 | 0.98 | hairline 8, heavy 5, medium 5 | 3 | 0.99 | hairline 7, medium 6, heavy 5 |
| `density` | 3 | 0.93 | balanced 8, airy 7, compact 3 | 3 | 0.85 | balanced 11, airy 4, compact 3 |
| `motion.character` | 3 | 0.87 | reveal 9, glide 7, snap 2 | 3 | 0.82 | reveal 11, glide 5, snap 2 |
| `motion.pace` | 2 | 0.50 | measured 16, fast 2 | 2 | 0.76 | measured 14, fast 4 |

## 2. Look collapse - how many briefs answered to the same design

The signature is every enum field above; the palette and the name are excluded, so two
cells sharing a signature are the same design in different colours.

| | A | B |
| --- | ---: | ---: |
| cells | 18 | 18 |
| distinct signatures | 18 | 18 |
| largest cluster | 1 | 1 |
| cells sharing a signature with another | 0 | 0 |

Round A: no two cells share a signature.

Round B: no two cells share a signature.

## 3. Palette spread

Distance is OKLab euclidean, over every pair of accents in the round. "Within tolerance"
counts pairs closer than 0.05 - a difference a viewer reads as the same colour.

| | A | B |
| --- | ---: | ---: |
| distinct accents | 6 of 18 | 5 of 18 |
| distinct panels | 7 | 5 |
| mean pairwise accent distance | 0.282 | 0.196 |
| accent pairs within tolerance | 24 of 153 | 28 of 153 |

## 4. Brand adherence

Every cell carries an assigned brand with a named palette and a typeface. This asks
whether the language the model returned used them.

| | A | B |
| --- | ---: | ---: |
| cells with a brand | 18 | 18 |
| accent is a brand hex, exactly | 17/18 (94%) | 18/18 (100%) |
| accent within 0.05 of a brand hex | 18/18 (100%) | 18/18 (100%) |
| panel is a brand hex, exactly | 17/18 (94%) | 18/18 (100%) |
| panel within 0.05 of a brand hex | 18/18 (100%) | 18/18 (100%) |
| typeface is the brand's | 17/18 (94%) | 18/18 (100%) |

Round A: every accent is within tolerance of a brand colour.

Round B: every accent is within tolerance of a brand colour.

## 5. What the composer had to repair

Read off the RECOMPOSED pass, so both rounds are measured by today's composer rather than
by whichever one was live on their capture day. A `palette_*_clamped` code is a language
whose own colours did not clear the legibility floor as returned; `mark_ink_knocked` is the
brand mark being recoloured to read on the panel the language chose.

| | A | B |
| --- | ---: | ---: |
| cells the composer adjusted | 4/18 (22%) | 1/18 (6%) |
| adjustments | palette_text_dim_lightness_clamped 3, mark_ink_knocked 1, palette_text_lightness_clamped 1 | mark_ink_knocked 1 |

## 6. Fallbacks, cost and reasoning

| | A | B |
| --- | ---: | ---: |
| cells that fell back to the house on any field | 0 | 0 |
| round total billed | $0.1070 | $0.1072 |
| per generation | $0.0059 | $0.0060 |
| input tokens | 35838 | 37242 |
| output tokens | 38652 | 21141 |
| reasoning tokens | not recorded at capture time | 17220 = 81% of output |

Fields that fell back - A: none. B: none.

