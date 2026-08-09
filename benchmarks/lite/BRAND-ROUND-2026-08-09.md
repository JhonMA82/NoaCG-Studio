# The first brand round - 2026-08-09

**Spent $0.0037 across three passes** (`brand-v14` 5 briefs, `brand-v14b` 2 re-runs,
`brand-v14c` 5 briefs). Frames archived and verified at
`C:/claude/noacg-lite-eval-archive/brand-v14c-2026-08-09` (54 files, 3 structured).

The first time NoaCG Lite has been asked to ADD something to a graphic rather than reproduce
one. Bank: `scripts/ai-lite-brand-fixtures.mjs` (5 servable lower-third briefs, each with a real
mark and the brand colours it arrives with; 3 briefs held back for categories Lite cannot serve).

Prior work this stands on: `BRAND-AUDIT-2026-08-09.md` (the free geometry audit) and
`docs/AI_LITE_PLAN.md` §7.

## What the round bought

**Machine-valid said 5 of 5 on every pass. The frames say 1 of 5.** That gap IS the result, and
it is the fourth time this profile has produced it (§4 of the plan). Every row: `fieldCount: 3`,
`ruleCodes: []`, `warningCodes: []`, motion settled.

| brief | mark | chassis | frame verdict |
|---|---|---|---|
| `brand-sports-badge` | square crest | lt05 | **good** - legible size, correct clear space, brand accent, right hierarchy |
| `brand-news-wordmark` | dark-ink wordmark | lt11 | mark effectively **invisible** - dark ink on the brand's dark panel |
| `brand-knockout-only` | knockout wordmark | lt11 | mark effectively **invisible** - white ink on the light paper panel |
| `brand-university-banner` | 10:1 rail | lt11 | mark **clipped mid-word** ("NORTHBRIDGE POLYT…") |
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

### 2. `surface: 'palette'` is not actionable, and it is the metadata's own fault. (PLATFORM, open)

Two of the four failures are the same defect mirrored: a dark-ink mark on a dark panel, and a
knockout mark on a light one. Both chassis declare `surface: 'palette'`, which means *the user's
palette decides* - and the model was never asked to compare the mark's ink against the palette's
panel, because nothing gives it that comparison. The prompt rule ("never place a transparent
dark-ink mark on a design whose logo surface is dark") is literally satisfied in both frames.

**The metadata is right and the instruction built on it is not.** `palette` is a statement about
where the surface COMES FROM, not what it will BE, and only the request knows the second half.
The fix is deterministic, not a prompt line: the compile knows the mark's ink and the resolved
panel colour, so it can measure the contrast and refuse or repair - the shape
`clampLitePalette` already uses for text.

### 3. The audit computes where a mark should paint; it never checks that it did. (INSTRUMENT, open)

The clipped rail is the sharper finding, because **the free audit passed that exact chassis and
mark shape.** `paintedImageRect` derives the painted box from `object-fit` arithmetic rather than
reading pixels, so a mark the layout clips is measured as if it were whole. That is this repo's
own rule biting the tool written to enforce it: a gate cannot catch a defect in a dimension it
does not measure.

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
field and the design was drawn for that shape**, and badly in two named, measurable ways that are
both platform work rather than model work. Neither needs a bigger model, a prompt rewrite, or
another paid round to reproduce - the next round should be spent CONFIRMING a fix, not finding
these again.
