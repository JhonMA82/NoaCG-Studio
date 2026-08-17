// lt61 "Poster Slab" - the condensed-poster name strap: a given name at label scale over a
// surname set at 92px in Anton, on a slab cut off square at one end.
//
// The absence this answers is docs/CATALOG_VARIETY.md §3 item 4: anton, big-shoulders and
// bebas-neue are bundled to do condensed-poster typography and four designs of 459 use any of
// them. It also takes item 8 partway - the catalog's display size tops out around 52px for a
// fifth of the catalog, and a poster's whole voice is that the name is BIG.
//
// The hierarchy is inverted on purpose: a fight card, a festival bill and a title sequence all
// bill the surname, not the full name, so the given name is a small tracked label above it. That
// is what makes the size jump read as a poster rather than as an oversized lower third.

import { paletteById, type TemplateVariant } from '../../model/wizard';
import { maskLine, maskLines } from '../shared/standard';
import { defineVariant } from './shared';

export const lt61: TemplateVariant = defineVariant(
  {
    id: 'lt61',
    category: 'lower-third',
    name: 'Poster Slab',
    styleTag: 'sport',
    description:
      'A condensed poster billing: the given name small over a surname set very large on a cut slab.',
    maxLines: 4,
    suggestedLines: [
      { title: 'Event', sample: 'MAIN EVENT · SATURDAY' },
      { title: 'Given name', sample: 'MARCUS' },
      { title: 'Surname', sample: 'OKONKWO' },
      { title: 'Billing', sample: 'Middleweight · 18-1-0' },
    ],
    logo: 'none',
    animationPresets: [
      'snap-stinger',
      'mask-wipe',
      'slide-left',
      'line-reveal',
      'pop-spring',
      'fade',
    ],
    defaultPalette: paletteById('signal'),
    defaultFontId: 'anton',
    defaultZone: 'bottom-left',
  },
  {
    name: 'Poster Slab',
    description:
      'The poster billing as a lower third: an accent bar across the top of a screen-printed ' +
      'cut slab, the event head over the given name, the surname set at poster scale in a ' +
      'condensed face, and one billing line beneath.',
    uicolor: '5',
  },
  (o) => ({
    html: `    <!-- Poster Slab: accent bar / given name / surname at poster scale / billing line. -->
    <div class="lower-third-box">
      <!-- The sport family's heavy bar, fused to the top edge of the slab. -->
      <div class="lower-third-accent"></div>
${maskLines([
  maskLine('lower-third', o, 0, 'lower-third-event', '      '),
  maskLine('lower-third', o, 1, 'lower-third-given', '      '),
  maskLine('lower-third', o, 2, 'lower-third-surname', '      '),
  maskLine('lower-third', o, 3, 'lower-third-billing', '      '),
])}
    </div>`,
    css: `/* The slab. The cut on the trailing edge is the poster's one shape decision - a printed
   bill is trimmed, not rounded - and the extra right padding pays for the diagonal. */
.lower-third-box {
  min-width: calc(600px * var(--scale));  /* the broadcast strap floor - the void fills past the text */
  padding: 0 calc(74px * var(--scale)) calc(24px * var(--scale)) calc(34px * var(--scale));  /* the right side pays for the cut */
  background-color: var(--panel-bg);  /* the solid slab this family is built on */
  background-image: repeating-linear-gradient(45deg, color-mix(in srgb, var(--text-color) 4%, transparent) 0 1px, transparent 1px calc(7px * var(--scale)));  /* the screen-print texture a poster is pulled through */
  clip-path: polygon(0 0, 100% 0, calc(100% - 40px * var(--scale)) 100%, 0 100%);  /* the trimmed trailing edge */
}
/* No box-shadow here, and that is the cut's price rather than an omission: clip-path clips a
   box's PAINT, shadow included, so the family's hard offset would simply never be drawn. The
   separation comes from the solid slab instead. */

/* The accent bar, FUSED to the slab's edges - the sport family's rule is that a slab's accent
   meets the panel edge, so the bar reaches past the box's own padding on both sides and its
   trailing end is cut by the same trim as the slab. */
.lower-third-accent {
  margin: 0 calc(-74px * var(--scale)) calc(20px * var(--scale)) calc(-34px * var(--scale));  /* out to the slab's real edges, then clear air below */
  height: var(--accent-weight);  /* the sport family's heavy bar weight */
  background: var(--accent);  /* the one bold accent dose */
  transform-origin: left center;  /* the stinger draws the bar from the leading edge */
  will-change: transform;  /* hints the exact property the entrance animates */
}

/* The event head - what the bill is FOR, printed above the name under its own hairline. */
.lower-third-event {
  display: inline-block;  /* so the hairline is only as wide as the words above it */
  margin-bottom: calc(14px * var(--scale));  /* air between the head and the name below */
  padding-bottom: calc(10px * var(--scale));  /* air between the words and their hairline */
  border-bottom: 1px solid color-mix(in srgb, var(--text-color) 30%, transparent);  /* the bill's own printed rule */
  font-size: calc(22px * var(--scale) * var(--type-scale));  /* the smallest type here, still above the floor */
  font-weight: 400;  /* Anton ships one weight; tracking does the label work */
  line-height: 1.2;  /* one tight head row */
  letter-spacing: 0.16em;  /* a poster's standing head tracks wide */
  text-transform: uppercase;  /* a bill is set in caps */
  color: var(--text-dim);  /* secondary voice: the name is the subject */
}

/* The given name - deliberately the SMALL half of the billing, tracked like a poster's kicker. */
.lower-third-given {
  font-size: calc(26px * var(--scale) * var(--type-scale));  /* label scale, above the broadcast floor */
  font-weight: 400;  /* Anton ships one weight; the size jump is what carries the hierarchy */
  line-height: 1.1;  /* one tight label row */
  letter-spacing: var(--label-tracking);  /* poster kickers track wide */
  text-transform: uppercase;  /* a bill is set in caps whatever the operator types */
  color: var(--accent);  /* the accent's second, small appearance */
}

/* The surname at poster scale. This is the line the design exists for. */
.lower-third-surname {
  margin-top: calc(4px * var(--scale));  /* the two name rows read as one billing block */
  font-size: calc(92px * var(--scale) * var(--type-scale));  /* poster scale - the top of the catalog's range */
  font-weight: 400;  /* Anton's single weight; the face is already the heaviest thing here */
  line-height: 0.94;  /* condensed display type stacks tight when a long name wraps */
  letter-spacing: -0.015em;  /* very big type closes up slightly */
  text-transform: uppercase;  /* the billing is set in caps */
  color: var(--text-color);  /* primary text colour */
}

/* The billing line - the record, the weight class, the venue. */
.lower-third-billing {
  margin-top: calc(12px * var(--scale));  /* clear of the surname's descenders */
  font-size: calc(24px * var(--scale) * var(--type-scale));  /* secondary voice, above the floor */
  font-weight: 400;  /* the reading weight */
  line-height: 1.25;  /* may wrap to a second row */
  letter-spacing: 0.04em;  /* small condensed type needs air to stay legible */
  color: var(--text-dim);  /* secondary text colour */
}

/* An empty head or billing takes no space, so a name-only bill is a shorter slab. */
.lower-third-event:empty,
.lower-third-billing:empty {
  display: none;  /* the operator can clear the line without leaving a hole */
}`,
    hasAccent: true,
  }),
);
