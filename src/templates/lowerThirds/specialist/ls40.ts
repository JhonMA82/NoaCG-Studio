// ls40 "Chamber Strap" — the official register: who is speaking, under what affiliation, and
// to which item of business.
//
// Parliamentary, council and court coverage is the one place a name strap is a RECORD rather
// than a caption. Three facts have to be on screen together and none of them can be folded
// into another: the person, the affiliation or case they appear under, and the item of
// business being taken. A viewer joining mid-session gets no other cue — there is no presenter
// to reintroduce the room, and the pictures are a person at a desk for two hours.
//
// So the affiliation gets its own cell on the name's row, marked off by a printed rule the way
// a party or a case number is set in an order paper, and the SECTION line closes the block
// under a divider: the item is not a subtitle of the person, it is the context both of them
// sit inside, and it stays on screen while speakers change.
//
// The register is editorial and deliberately unglamorous: a flat ink surface, printed rules,
// one accent used only on the small tracked caps. No chips — a chamber graphic that looks like
// a sports lower third undermines the thing it is recording.

import { paletteById, type ResolvedOptions, type TemplateVariant } from '../../../model/wizard';
import { sampleName } from '../../shared/sampleNames';
import { defineVariant } from '../shared';

/** One masked line placed into a named GRID CELL.
 *
 *  The grid ITEMS here are the masks, so the placement class has to sit on the mask rather
 *  than on the span the pack's shared `slot()` classes — otherwise every rule that assigns a
 *  column would be addressing the wrong box. */
function cell(
  o: ResolvedOptions,
  index: number,
  cellClass: string,
  textClass: string,
  indent = '      ',
): string {
  const line = o.lines[index];
  if (!line) return ''; // the operator removed this line — the grid closes over it
  return (
    `${indent}<!-- ${line.title} (f${index}) — SPX writes this field's value straight into the element. -->\n` +
    `${indent}<div class="lower-third-mask ${cellClass}"><span id="f${index}" class="${textClass}">${line.sample}</span></div>`
  );
}

export const ls40: TemplateVariant = defineVariant(
  {
    id: 'ls40',
    category: 'lower-third',
    name: 'Chamber Strap',
    styleTag: 'editorial',
    description: 'Speaker, affiliation or case, and the item of business — the official register.',
    maxLines: 4,
    suggestedLines: [
      { title: 'Speaker', sample: sampleName('ls40') },
      { title: 'Party or case', sample: 'EPP · Finland' },
      { title: 'Office', sample: 'Rapporteur' },
      { title: 'Section', sample: 'Committee on Foreign Affairs · Item 4' },
    ],
    logo: 'none',
    // Mask wipe: the printed surface arrives whole. A record should not assemble itself in
    // front of the viewer — the block is one document, revealed.
    animationPresets: ['mask-wipe', 'line-reveal', 'fade', 'slide-up', 'blur-in', 'slide-left'],
    defaultPalette: paletteById('vermilion'),
    defaultFontId: 'archivo',
    defaultZone: 'bottom-left',
  },
  {
    name: 'Chamber Strap',
    description:
      'The parliamentary and court register: the speaker with their affiliation or case marked ' +
      'off beside the name, their office under it, and the ITEM OF BUSINESS closing the block ' +
      'under a divider — because the item is the context the speakers sit inside, not a ' +
      'subtitle of any one of them. Flat ink, printed rules, no chips: a chamber graphic that ' +
      'looks like a sports strap undermines what it records.',
    uicolor: '3',
  },
  (o) => ({
    html: `    <!-- The register: [printed rule] over [speaker | affiliation] over [office] over
         [divider + item of business]. -->
    <div class="lower-third-box">
      <div class="lower-third-accent"></div>
${cell(o, 0, 'lower-third-namecell', 'lower-third-name')}
${cell(o, 1, 'lower-third-partycell', 'lower-third-party')}
${cell(o, 2, 'lower-third-officecell', 'lower-third-title')}
${cell(o, 3, 'lower-third-sectioncell', 'lower-third-section')}
    </div>`,

    css: `/* The register — a flat printed surface, square-cornered, laid out as a two-column grid:
   the name takes the room it needs and the affiliation tracks its own width beside it. */
.lower-third-box {
  display: grid;                    /* the name row is two cells, the rest span both */
  grid-template-columns: minmax(0, 1fr) auto;  /* words take the room; the affiliation hugs */
  align-items: center;              /* the affiliation sits on the name's centre line */
  column-gap: calc(30px * var(--scale));  /* the affiliation's clear space from the name */
  padding: calc(24px * var(--scale)) calc(44px * var(--scale)) calc(26px * var(--scale)) calc(34px * var(--scale));
  background: var(--panel-bg);      /* the family's flat printed surface (ink) */
  box-shadow: var(--panel-shadow);  /* the page's lift off the picture */
  min-width: calc(600px * var(--scale));  /* a broadcast-width record even behind a short name */
  max-width: calc(1020px * var(--scale));  /* a committee title wraps here, never past the frame */
}

/* The printed rule across the head of the block — the family's structure, and this design's
   accent NODE, so the line-reveal preset and the step reveals have a real element to draw. */
.lower-third-accent {
  grid-column: 1 / -1;              /* the full width of the record */
  height: var(--accent-weight);     /* the family's 2px rule weight */
  margin-bottom: calc(18px * var(--scale));  /* air between the rule and the name */
  background: var(--accent);        /* the design's one accent surface */
  transform-origin: left center;    /* line-reveal draws it from this end */
}

/* The speaker's cell. */
.lower-third-namecell {
  grid-column: 1;                   /* always the words' track, whatever the operator left in */
  min-width: 0;                     /* let it shrink so a long name wraps instead of overflowing */
}

/* The speaker (f0) — the block's one large voice, set rather than shouted. */
.lower-third-name {
  font-size: calc(46px * var(--scale) * var(--type-scale));  /* headline size (values are 1080p reference) */
  font-weight: var(--display-weight);  /* the family's display weight — set, not shouted */
  line-height: 1.1;                 /* big text sits tight */
  letter-spacing: var(--display-tracking);  /* the family's display tracking */
  color: var(--text-color);         /* primary text color */
}

/* The affiliation's cell — marked off by a printed rule, the way a party or a case number is
   set in an order paper. A rule and not a chip: this family's structure is rules. */
.lower-third-partycell {
  grid-column: 2;                   /* always the affiliation's track */
  justify-self: end;                /* closes the row at the record's right edge */
  padding-left: calc(20px * var(--scale));  /* the rule's clear space */
  border-left: var(--accent-weight) solid var(--accent);  /* the marginal rule */
  max-width: calc(340px * var(--scale));  /* an affiliation is short; longer clips inside its cell */
  overflow: hidden;                 /* the clip is what makes the max-width real (bench) */
}

/* The affiliation or case (f1) — tracked caps in the accent: the record's reference voice. */
.lower-third-party {
  display: block;                   /* so the width bound and the ellipsis apply */
  max-width: calc(320px * var(--scale));  /* the cell's inner width — the measured cap */
  font-size: calc(21px * var(--scale) * var(--type-scale));  /* a reference mark, not a line */
  font-weight: 700;                 /* bold — tracked caps at this size need the weight */
  line-height: 1.3;                 /* single tight label row */
  letter-spacing: var(--label-tracking);  /* 0.24em — the family's masthead tracking */
  text-transform: uppercase;        /* EPP · FINLAND, whatever the operator types */
  color: var(--label-color);        /* the family's label colour (the accent) */
  white-space: nowrap;              /* an affiliation never wraps… */
  overflow: hidden;                 /* …and a too-long one is clipped… */
  text-overflow: ellipsis;          /* …with an honest ellipsis */
}

/* The office's cell — under the name, across the whole record. */
.lower-third-officecell {
  grid-column: 1 / -1;              /* the full width — it belongs to the person, not to a column */
  min-width: 0;                     /* allow shrinking */
  margin-top: calc(6px * var(--scale));  /* name + office read as one unit */
}

/* The office (f2) — the second reading voice. */
.lower-third-title {
  font-size: calc(26px * var(--scale) * var(--type-scale));  /* clearly below the name */
  font-weight: 400;                 /* regular weight; contrast comes from the name */
  line-height: 1.3;                 /* secondary text gets room to breathe */
  color: var(--text-dim);           /* dimmed — never the primary ink twice */
}

/* The item of business (f3) — closed off under a divider, because it is the context the
   speakers sit inside rather than a subtitle of any one of them. */
.lower-third-sectioncell {
  grid-column: 1 / -1;              /* the full width of the record */
  min-width: 0;                     /* allow shrinking */
  margin-top: calc(18px * var(--scale));  /* air above the divider */
  padding-top: calc(15px * var(--scale));  /* …and inside it, above the words */
  border-top: 1px solid color-mix(in srgb, var(--text-color) 20%, transparent);  /* the divider */
}

/* The section line (f3) — the quietest voice in the record, and the one that outlives the
   speaker on screen. */
.lower-third-section {
  font-size: calc(21px * var(--scale) * var(--type-scale));  /* the smallest voice in the block */
  font-weight: 500;                 /* medium — a reference line still has to hold */
  line-height: 1.35;                /* room if a committee title wraps */
  letter-spacing: 0.02em;           /* a touch of air, nothing like the affiliation's tracking */
  color: var(--text-dim);           /* dimmed — the accent belongs to the affiliation alone */
}`,
    hasAccent: true,
  }),
);
