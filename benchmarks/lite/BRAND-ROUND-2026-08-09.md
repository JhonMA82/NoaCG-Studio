# The first brand round - 2026-08-09

**Spent $0.0048 across four passes** (`brand-v14` 5 briefs, `brand-v14b` 2 re-runs, `brand-v14c`
5 briefs, `brand-v14d` 5 briefs confirming the contrast rule). Frames archived and verified at
`C:/claude/noacg-lite-eval-archive/brand-v14c-2026-08-09` (54 files, 3 structured).

The first time NoaCG Lite has been asked to ADD something to a graphic rather than reproduce
one. Bank: `scripts/ai-lite-brand-fixtures.mjs` (5 servable lower-third briefs, each with a real
mark and the brand colours it arrives with; 3 briefs held back for categories Lite cannot serve).

Prior work this stands on: `BRAND-AUDIT-2026-08-09.md` (the free geometry audit) and
`docs/AI_LITE_PLAN.md` §7.

## What the round bought

**Machine-valid said 5 of 5 on every pass. The frames say 1 of 5** - and one of those four turned out to be a defect in the bank rather than in the product (§3). That gap IS the result, and
it is the fourth time this profile has produced it (§4 of the plan). Every row: `fieldCount: 3`,
`ruleCodes: []`, `warningCodes: []`, motion settled.

| brief | mark | chassis | frame verdict |
|---|---|---|---|
| `brand-sports-badge` | square crest | lt05 | **good** - legible size, correct clear space, brand accent, right hierarchy |
| `brand-news-wordmark` | dark-ink wordmark | lt11 | mark effectively **invisible** - dark ink on the brand's dark panel |
| `brand-knockout-only` | knockout wordmark | lt11 | mark effectively **invisible** - white ink on the light paper panel |
| `brand-university-banner` | 13:1 rail | lt11 | mark clipped mid-word - **the FIXTURE's fault, not the product's** (§3) |
| `brand-creator-shield` | portrait shield | lt15 | not read in this pass |

## Three defects, each with a mechanism and an owner

### 1. A prompt line without a schema property is an instruction the model cannot obey. (PLATFORM, fixed)

The first pass placed **no mark at all, on five of five**, while reporting every generation
machine-usable. The prompt said "set `useLogoSlot`"; the Lite spec object is
`additionalProperties: false` and **did not carry that property**, so emitting it would have been
a schema refusal. The model did the only thing it could.

This is the `zone` rule in the file already, read from the other side: that note says a property
the model still emits cannot be deleted. The mirror is now written beside it - a property the
PROMPT asks for and the schema omits is dead teaching. Both halves ship together or neither does.

Fixed: `useLogoSlot` added to the schema, optional. Re-run placed a mark on 5 of 5.

### 2. `surface: 'palette'` is not actionable, and it is the metadata's own fault. (PLATFORM, fixed)

Two of the four failures are the same defect mirrored: a dark-ink mark on a dark panel, and a
knockout mark on a light one. Both chassis declare `surface: 'palette'`, which means *the user's
palette decides* - and the model was never asked to compare the mark's ink against the palette's
panel, because nothing gives it that comparison. The prompt rule ("never place a transparent
dark-ink mark on a design whose logo surface is dark") is literally satisfied in both frames.

**The metadata is right and the instruction built on it is not.** `palette` is a statement about
where the surface COMES FROM, not what it will BE, and only the request knows the second half.
**Fixed twice, and the second shape was bought with the confirming round.** Shipped first as a
refusal, it turned both frames into `generation_failed` - the repair round could not save either,
which is precisely what the palette floor's own note three lines above it in the code already
said. A rule that converts a bad graphic into no graphic is worse than the defect.

It is APPLIED now, in the order that costs the user least: re-pick a chassis whose logo surface
suits the mark, and when the catalog has none, paint the mark its own well. Both are recorded as
adjustments, never errors, and the mark is never dropped.

**The first version of that repair traded one invisible element for another, and only a FRAME
showed it.** It moved a knockout mark from lt11 to lt02, the mark became perfectly legible - and
the NAME disappeared, because lt02 is panel-less (that is *why* its logo surface is the picture)
and the user's light-package text had been drawn for a panel. Every machine check passed. This is
`docs/CATALOG_VARIETY.md` §5.3 arriving from a direction nobody was watching: a design with no
reading surface a palette can repaint cannot receive a light package, and a repair that moves one
there breaks the graphic it was fixing. The re-pick now refuses a panel-less candidate whenever
the package is light.

**With today's six chassis the re-pick can never fire**, because no design offers a logo surface
in the opposite tone to its own package. Without a third answer that left every unreadable
pairing dropping the mark - so there is one: the shared slot paints a WELL behind it.

| mark ink | package | outcome |
|---|---|---|
| dark | dark | **light well**, mark shown |
| light | light | **dark well**, mark shown |
| light | dark | fine, untouched |
| dark | light | fine, untouched |
| (own field) | either | never fires |

The well is fixed neutral rather than derived from the palette - the palette's surface is the
wrong tone by definition here, so deriving from it is how it comes out wrong again - and its
padding is the clear space the brand manual asks for, inside the well. Nothing reaches the
picture: no radius, no crop, no filter, no uneven scale, which is exactly the set
`assetIntegrity.ts` refuses on a mark the user said to use as it is. Both plated cases were read
on screen: a knockout in a dark well on a light package, and a dark lockup in a light well on a
dark one, each with its text intact.

The re-pick branch stays because a design whose logo surface is the opposite tone to its package
is still the better answer when one exists - a well is a repair, not a design. Drawing one is
the remaining catalog task, and `logo_plated` in the ledger counts how often it would pay.

### 3. The clipped rail was MY FIXTURE, not the product. (BANK, fixed - and this entry was wrong)

**Corrected 2026-08-09, after the diagnosis.** As first written this entry blamed the audit for
passing a mark the product had clipped. Both halves of that were false, and the correction is
worth more than the claim was.

Measured: `banner-wide` declared a `viewBox` of `0 0 960 96` around a text run whose bounding box
ends at **x=1242**. The SVG clipped its own wordmark before anything downstream saw it. The
product placed the mark correctly - `260x20`, `object-fit: contain`, inside its box, clear space
intact - and the audit was RIGHT to pass it. There was no platform defect and no instrument blind
spot; there was a malformed fixture, and it rendered as a cut-off logo that looked exactly like a
placement bug.

**A bank is an instrument, and a broken fixture does not read as a broken fixture - it reads as a
broken product.** Everything the audit says is measured through these five files, so they now get
checked first: `scripts/ai-lite-brand-audit.mjs` renders each mark alone before touching a
chassis and compares every drawn node's bounding box against the viewBox, plus the declared
`natural` size against it. A fault aborts with exit 2 rather than producing numbers. Mutation-
proved by restoring the 960 viewBox: `<text> spans 124..1242 x 16..83 outside its 960x96 viewBox`.

The rail is a 13:1 lockup now (`1280x96`), which is what it always was.

## What is NOT a defect

- **The brand colours land.** Every frame carries the brief's accent and panel; the house amber
  appears nowhere.
- **The chassis choices are reasonable.** Sport slab for the club, house strap for news, frost
  for the creator.
- **The first pass's inverted name/team ordering did not reproduce** in `brand-v14c`, so read it
  as sampling rather than a systematic content bug.

## One gate defect found on the way (fixed)

`multi-graphic-request` matched the bare word **`package`**, and refused 2 of 5 briefs before any
model call - for free, but in production that is the user's generation gone. In broadcast a
package IS the show's look ("our light paper package"), which is exactly the vocabulary a brand
brief arrives in. It also bought nothing when it fired correctly: Lite returns one result by
construction. Narrowed to the explicitly plural forms.

## The state this leaves

Lite can now place a brand mark, and does. It places it **well when the mark brings its own
field and the design was drawn for that shape**, and badly in one named, measurable way that is
platform work rather than model work. Every defect this round found is now fixed or corrected, and
the repair has been read on screen as well as in code - which is how its own first version was
caught breaking the text it was meant to leave alone.

**Every brief in the bank now ends with the mark on screen and the text readable**, whichever tone
the brand owns. What is left is a catalog gap rather than a software one: no Lite chassis offers a
logo surface in the opposite tone to its own package, so the well does the work a design should.
A well is a repair, not a design. `logo_plated` in the ledger counts how often that missing design
would have paid for itself.
