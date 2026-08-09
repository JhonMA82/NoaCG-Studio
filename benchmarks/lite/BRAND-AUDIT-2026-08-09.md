# Brand-mark absorption, measured — 2026-08-09

**Spent nothing.** No model call, no token, no provider. Every number here comes from
`node scripts/ai-lite-brand-audit.mjs`, which renders the real catalog design through the real
assembler with a real mark in its slot, settles it, and reads the painted frame back. Raw
results: `brand-audit-2026-08-09-favourable.json`, `brand-audit-2026-08-09-adverse.json`.

The brief, the thresholds and the mechanism decision this round supports are
`docs/AI_LITE_PLAN.md` §7. This file is the measurement only.

## What was measured

13 logo-capable lower thirds (`TemplateVariant.logo !== 'none'`) x 5 mark shapes
(`scripts/ai-lite-brand-fixtures.mjs`): a 4:1 wordmark in dark ink, the same wordmark as a white
knockout, a 1:1 club crest with its own field, a 10:1 institution rail, and a portrait shield.
Each pair also renders the same chassis with the same palette and NO logo, so "the mark cost the
name a second line" is a comparison rather than a guess.

Two pairings, because one of them was not enough:

- **favourable** — each mark gets the package a sensible user would bring it (a knockout mark on
  a dark package, a dark-ink mark on a light one).
- **adverse** (`--palette sand`) — a brand whose ACCENT is pale. This exists because the first
  pass could not fail a knockout mark at all: nearly every catalog logo well is painted in the
  ACCENT, so a white mark on the "light package" was still landing on `paper`'s dark green.
  **The palette that fights a mark is decided by the surface the SLOT paints, not by the
  package's overall lightness** — which is itself a finding, and it invalidated the first run's
  clean contrast column.

## The result

|  | favourable | adverse |
|---|---|---|
| pairs that absorbed the mark | **14 of 65** | **19 of 65** |
| chassis clean on every mark | **0 of 13** | **0 of 13** |

By mark shape (favourable pairing, out of 13 chassis):

| mark | clean | what happens |
|---|---|---|
| club crest, 1:1 | **10 / 13** | the shape every slot was actually drawn for |
| shield, portrait | 4 / 13 | fits, but its dark field fails to separate on 8 chassis |
| wordmark 4:1, dark ink | **0 / 13** | letterboxes to a 16–35px strip in a square well |
| wordmark 4:1, knockout | **0 / 13** | same geometry; contrast only differs |
| institution rail 10:1 | **0 / 13** | paints a **6–14px hairline** — the mark is a smear |

**No lower third in this catalog can carry a wordmark or a horizontal lockup at a legible size.**
The widest painted lockup measured anywhere in the run is 140px x 35px (`ls18`), and every other
chassis lands between 64 and 88px wide. That is the round's headline, and it is a CATALOG fact,
not a model one: the slots are near-squares between 52 and 140 design pixels on their long edge,
and `object-fit: contain` does exactly what it promises with a 10:1 source inside one.

Failures by cause:

| code | favourable | adverse | meaning |
|---|---|---|---|
| `below-min-size` | 33 | 33 | painted mark under 32px tall (crest-shaped) or 96px wide (lockup) |
| `ink-contrast` | 5 | **24** | a transparent mark's ink under 3:1 against the surface it composites onto |
| `cropped` | 9 | 9 | `object-fit: cover` cut the mark (`lt08`, `ls25`) |
| `field-separation` | 8 | 0 | a mark carrying its own field under 1.5:1 against the surface |
| `clear-space` | 8 | 8 | a neighbour closer than a quarter of the mark's painted height |
| `collision` | 4 | 4 | a neighbour's box overlaps the mark's (`ls18`) |
| `house-accent-survives` | 0 | 0 | see the honesty note below |

Per chassis, clean pairs of the five marks — `favourable`/`adverse`, so `2/2` means two of five
under each pairing and `0/0` means the chassis never absorbed any mark:

```
lt07 2/2   lt08 1/1   lt23 2/2   lt29 2/2   lt36 1/2   lt41 0/0   lt47 1/2
lt49 1/2   lt53 1/2   lt54 1/2   ls10 2/2   ls18 0/0   ls25 0/0
```

## Three defects worth naming individually

1. **The shared logo slot and `lt08` violate the platform's OWN as-is contract.**
   `src/ai/assetIntegrity.ts` rejects a design that puts `border-radius`, a crop or
   `object-fit: cover` on a picture the user marked "use it as it is" — a brand logo is exactly
   that. `templates/shared/logoSlot.ts`, the slot EVERY future `logo: 'optional'` design
   inherits with zero code, writes `border-radius: var(--panel-radius)`. `lt08` writes both a
   radius and `object-fit: cover`. The two contracts have never met because no path has yet sent
   a protected upload into a catalog logo slot. Fix the slots, not the screen.
2. **`ls25`'s slot is a picture well, not a mark well.** `object-fit: cover` with the comment
   "the right choice for a square cover" — correct for a portrait, wrong for a crest, and the
   variant declares `logo: 'optional'` so nothing distinguishes them. A logo slot and a photo
   slot are two capabilities wearing one name.
3. **`sb09` (scoreboard, `logo: 'built-in'`) paints nothing when handed a mark.** It draws TWO
   crest slots and reads neither `logoAssetPath` nor `logoEnabled`. Not a lower-third problem
   today; it is what "widen Lite to scoreboards" runs into on the first brief, and the audit
   reported it in one line without anybody looking.

## Honesty about the instrument

A check that has never fired is not evidence. What this round can and cannot claim:

- **Fired with both a pass and a fail:** `below-min-size`, `cropped`, `clear-space`,
  `collision`, `ink-contrast`, `field-separation`, `no-slot-field` / `no-slot-element` (30 times,
  on the six audited Lite chassis — see below), `not-painted` (`sb09`).
- **`house-accent-survives` reports clean on all 65 pairs and that column is VACUOUS on this
  bank.** No lower third in the catalog hard-codes `#f6a623` (`grep` confirms; the literal-amber
  designs `docs/CATALOG_VARIETY.md` §5.1 names are scoreboards and holding screens). The check
  was mutation-proved instead: `--palette houseAmberProbe` makes it fire on `lt07` and `lt23`.
  It is carried for the widening, where it stops being vacuous.
- **Never fired at all:** `aspect-distorted` (nothing in the catalog sets `object-fit: fill` on a
  logo), `outside-box`, `outside-safe-area`, `logo-costs-text`. Treat those four as unproven
  wiring, not as clean results.

## The finding that decides the mechanism

`node scripts/ai-lite-brand-audit.mjs --lite` — **all six audited NoaCG Lite chassis are
`logo: 'none'`. 30 of 30 pairs report `no-slot-field no-slot-element`.**

Lite cannot place a mark at all today, in any design, by any mechanism. So the first question is
not "can the model place a logo well" — no model choice reaches a slot that does not exist. It is
"which designs get a slot, and what shape of mark can a slot honestly hold". Both are measurable,
and this round measured them.
