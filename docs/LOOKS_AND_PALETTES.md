# Looks and palettes — why the catalog reads as one product, and what it would cost not to

> **Superseded on the measurement, 2026-08-09 — read `CATALOG_VARIETY.md` first.** This note
> counted the three DECLARED axes (style family, palette, typeface) and concluded the catalog
> ships "sixteen combinations". That holds — four (family, palette, typeface) triples cover 75% of
> 459 designs — but it is not where the sameness lives. Measured off the EMITTED code, the style
> family explains 1–3% of a design's typography, 5% of its layout and 5% of its drawn parts; the
> graphic CATEGORY explains 26–54% of each. Two consequences overturn §4 below: **a new style
> family buys a panel treatment, not a design direction**, and **editorial is not the cheapest new
> look — it measures as sitting inside minimal** (nearest-minimal distance 0.21, against minimal's
> own internal 0.24). The anti-slop rules in this note are unaffected and still binding.

Status: **a note, not a plan.** Written 2026-08-08 from a measurement taken while filling the kit
matrix (`KIT_MATRIX_GAPS.md`). Nothing here is scheduled. It exists so the next person to reach
for "add a style family" starts from the numbers rather than from taste.

Owner's framing, and the bar this note is held to: *you should not be able to tell a graphic is
ours just by looking at it* — and every look we add has to be good, not filler.

## The measurement

Counted across the whole catalog (459 designs), not sampled:

| axis | what ships | what the catalog actually uses |
|---|---|---|
| style families | 6 declared | `minimal` 189 designs, `noacg` 158, `glass` 155, `sport` 155 — then `editorial` 28, `cinematic` 21 |
| palettes | 14 curated | `ivory` 141 references, `noacg` 138, `frost` 112, `volt` 110 — **80% of every palette reference is those four**; the other ten share 125 |
| typefaces | 17 bundled | four do nearly all the work: Space Grotesk, Inter, Oswald, Manrope |
| panel treatment | – | **12 of 14 palettes are a dark panel with white text.** Only Porcelain and Broadsheet are light |

## The actual cause — the three axes are welded together

A design's family, its palette and its typeface are independent knobs that in practice move as
one. The convention is 1:1 and unbroken: `noacg`→NoaCG Amber→Space Grotesk, `minimal`→Ivory→
Inter, `sport`→Volt→Oswald, `glass`→Frost→Manrope. Pick a family and you have picked all three.

So "looks like NoaCG" is not one amber accent. It is **four shapes × four palettes × four faces,
almost always on a dark translucent panel** — and a user browsing 459 designs meets those same
sixteen combinations over and over.

**The capability is already there; the DEFAULTS are what is monotone.** The wizard offers all
fourteen palettes to every design (`StyleStep` sorts the family's own first and shows the rest),
custom hex/rgba is supported, and any bundled face can be swapped. A user who touches the Style
step escapes the sixteen combinations immediately. A user who accepts the defaults never does —
and the defaults are what a browse grid, a prerendered template page and a screenshot show.

Two consequences worth stating plainly:

- **19 of 21 kits declare no `paletteId`**, so a kit built today arrives in each design's own
  default — which is one of those same four palettes. Newsroom (Ivory) and Talk Show (Frost) are
  the only two that impose a look, and they were fixed for a *coherence* complaint: their
  graphics used to arrive in four palettes at once.
- The coherence fix and the sameness problem pull in opposite directions on the same knob. **Per
  KIT: one palette, imposed. Per CATALOG: many palettes, varied.** Both are true, and the lever
  that satisfies both is a kit-level palette over per-design defaults that are *not* all the same.

## What it would cost

Cheapest first. The first three are config and the last one is not.

1. **More palettes** — pure config in `model/wizard.ts` `PALETTES`. Cheap, and the biggest single
   gap is tonal, not hue: the catalog is nearly all dark-panel/white-text, so **light-panel,
   low-saturation and print-register palettes** buy more apparent difference than another bright
   accent would. **Never picked by eye** — the Vermilion entry records the standard: a deeper red
   measured 4.2:1 on the ink panel, under the 4.5:1 a caption needs, so the shipped value is the
   one that clears ~5.2:1.
2. **Spread the per-design defaults inside a family** — also config, one field per design
   (`defaultPalette`). This is what makes a browse grid stop looking like four products, and it
   is safe *because* kits impose their own palette on top. Every changed default re-records the
   catalog baselines, so it is a deliberate, reviewable diff rather than a silent one.
3. **Give the other 19 kits a `paletteId`** — one line each, and the promise of "one unified look"
   is currently unmet for 19 of 21 kits.
4. **A new style FAMILY is not config, deliberately.** It needs a `FAMILY_TOKENS` row (panel
   blur/radius/shadow/keyline, accent weight and glow, label and display treatment) *and* a
   design per graphic type before a kit can resolve into it — 65 types today. `editorial` and
   `cinematic` are the honest evidence: both have a tokens row, palettes, Browse chips and real
   designs, and both cover fewer than 30 designs, which is why no kit resolves into either.
   **Finishing ONE of them to kit grade is the cheapest new look we can ship**, and it is still
   roughly 118 designs at the full six gates.

## The anti-slop rules (these are the point)

A look added badly is worse than a look not added — it makes the catalog bigger and the product
cheaper-looking at the same time.

- **A family with no designs is a dead knob.** `validatePacks` fails a pack pointing at an
  unfilled cell precisely so a theme cannot be added as a config lie.
- **Every new design passes the same gates as every old one**: the six promotion gates
  (`GRAPHIC_TYPES.md` §5), the type floor, the overflow sweep, field coverage, numerals and the
  catalog calibration tripwire. These MEASURE the rendered graphic, because every source-level
  check would have passed a catalog that was visibly broken.
- **A palette is measured, not chosen.** Contrast against the panel it will actually sit on, at
  the size the smallest text using it will actually be.
- **A family is a coherent information system, not a skin.** `DESIGN_LANGUAGE.md` §8 holds the
  per-family cross-category tokens; the override map beside them is conformance debt whose size
  is the metric. A "look" that is a colour swap with the same shapes underneath will read as the
  same product in a different colour — which is the complaint this note exists for.
- **The house look stays the house look.** `noacg` is the brand's own on-air voice
  (`NoaCG-Brand-Kit/BRAND-MANUAL.md`); the goal is that it stops being the only voice, not that
  it gets diluted.

## What this note is not

Not a proposal to fill `editorial` and `cinematic` now, and not a request to add palettes before
someone decides how many looks the product wants to carry. It is the measurement plus the price
list, so that decision can be made with both in hand.
