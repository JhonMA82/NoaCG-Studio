# The five brand marks of the stinger brand-swap set

The product promise is that a client gets a stinger in **their own** mark and colour world, so
a corpus stinger is only proved when the same composition survives a brand swap
(`docs/NOACG_VIDEO_PLAN.md` §3.1). Every corpus stinger is reviewed against all five of these,
swapped live from the picker on its own review page - not as five near-identical pages, which
is what the rig did first and what the owner correctly called wasted (§2.4).

**They vary in SHAPE, not only in colour.** The logo slot's job is surviving different aspect
ratios and ink densities; five recolours of one silhouette would prove nothing about whether a
real client's mark fits. Each entry below is a different failure the slot has to survive.

| shape class | mark | natural size | aspect | ink | its field colour | file |
| --- | --- | --- | --- | --- | --- | --- |
| compact monogram | The Aldervale Institute | 120x120 | 1.00 | deep navy | light `#EDEAE3` | `../../../pro/v1/spike/marks/aldervale-institute.svg` |
| wide wordmark | Kestrel Athletic | 500x120 | 4.17 | volt | dark `#12161A` | `../../../pro/v1/spike/marks/kestrel-athletic.svg` |
| square emblem, fine detail | Sunbeam | 120x120 | 1.00 | warm orange + cream spokes | dark `#241004` | `../../../pro/v1/spike/marks/sunbeam.svg` |
| tall, brings its own field | The Ledger | 96x120 | 0.80 | mono, full-bleed ink slab | light `#EDE9E1` | `../../../pro/v1/spike/marks/the-ledger.svg` |
| long name, two-part lockup | Northbridge Community Broadcasting | 900x120 | 7.50 | light | dark `#0C2233` | `northbridge-community-broadcasting.svg` |

**A mark and its field colour are supplied together**, because no stinger puts a mark on a
plate (`docs/NOACG_VIDEO_PLAN.md` §2.4). A dark-ink monogram asks for a light field; a
light-ink lockup asks for a dark one. The field colours above are what
`scripts/stinger-review.mjs` applies when the mark is picked.

Four of the five were built for the NoaCG Pro brand round and are **reused, not duplicated** -
one mark that changes must change in one place. Only the long-name lockup is new here, because
the Pro set had no mark whose failure mode is sheer width of *text*.

All five are invented organisations. **No real brand mark enters this repo.**

## What each one is meant to break

- **Aldervale** - the narrowest mark. A slot that sizes by width leaves it tiny; its ink is
  dark, so it disappears on any dark stinger field unless the slot declares a light surface.
- **Kestrel** - wide and skewed. A slot that sizes by height overflows it sideways.
- **Sunbeam** - fine radial spokes. They alias into mush below roughly 90 px, which is a
  scale failure no still frame at full size will show.
- **The Ledger** - portrait, and it paints its own opaque field, so clear space around it is
  visible as a hard rectangle against anything it sits on.
- **Northbridge** - a 34-character name in one line at 7.5:1. It is the mark that proves a
  slot was sized around a monogram.
