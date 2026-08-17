// ls34 "Translation Strap" — one sentence in two languages, and the graphic that says which
// is which.
//
// The interpreted interview, the foreign ministry statement, the bilingual parliament, the
// international press conference. The broadcast convention is the same everywhere: the words
// as they were SPOKEN sit above, quieter and smaller, and the translation the audience is
// actually reading sits below in the primary voice. Reversing that pair is not a style choice
// — it tells the viewer the translation is the original, which is exactly the claim a
// responsible bulletin must not make by accident.
//
// The part most designs get wrong is the LANGUAGE TAG. It is almost always burned into the
// artwork or hard-coded in the CSS, so a strap drawn for Ukrainian cannot carry Arabic without
// a designer. Here each line carries its own tag as a real SPX field: a state's word is a
// field, so the same template serves any language pair an operator can type, and a bulletin
// that switches sources between takes retags without opening the code.
//
// The two rows are separated by the accent rule rather than by spacing alone, because the two
// lines say the same thing and a viewer skimming needs the seam to be unmistakable.

import { paletteById, type ResolvedOptions, type TemplateVariant } from '../../../model/wizard';
import { defineVariant } from '../shared';

/** One masked line placed into a named GRID CELL.
 *
 *  The pack's shared `slot()` puts its class on the SPAN, which is right for a design whose
 *  layout is a stack. Here the grid ITEMS are the masks, so the placement class has to sit on
 *  the mask — otherwise every rule that assigns a column would be addressing the wrong box. */
function cell(
  o: ResolvedOptions,
  index: number,
  cellClass: string,
  textClass: string,
  indent = '      ',
): string {
  const line = o.lines[index];
  if (!line) return ''; // the operator removed this line — the grid simply closes over it
  return (
    `${indent}<!-- ${line.title} (f${index}) — SPX writes this field's value straight into the element. -->\n` +
    `${indent}<div class="lower-third-mask ${cellClass}"><span id="f${index}" class="${textClass}">${line.sample}</span></div>`
  );
}

export const ls34: TemplateVariant = defineVariant(
  {
    id: 'ls34',
    category: 'lower-third',
    name: 'Translation Strap',
    styleTag: 'minimal',
    description: 'The spoken line above its translation, each carrying its own language tag.',
    maxLines: 4,
    suggestedLines: [
      { title: 'Spoken language', sample: 'UKR' },
      { title: 'As spoken', sample: 'Ми не будемо вести переговори під тиском.' },
      { title: 'Translated language', sample: 'ENG' },
      { title: 'Translation', sample: 'We will not negotiate under pressure.' },
    ],
    logo: 'none',
    // Slide up: both rows arrive together, because they are one statement. A staggered reveal
    // would show the original alone for a beat, which is the one reading this graphic must not
    // produce.
    animationPresets: ['slide-up', 'fade', 'mask-wipe', 'line-reveal', 'blur-in', 'slide-left'],
    defaultPalette: paletteById('ivory'),
    defaultFontId: 'inter',
    // Centred, unlike almost every strap in this pack. A translation is read the way a
    // subtitle is read, and a subtitle sits under the middle of the picture — an interpreted
    // answer arriving at the left margin sends the viewer's eye somewhere it is not used to
    // looking. The panel is centre-ANCHORED; the words inside it stay left-aligned, because
    // two stacked sentences of different lengths centred against each other read as ragged.
    defaultZone: 'bottom-center',
  },
  {
    name: 'Translation Strap',
    description:
      'The interpreted-speech strap: the line as it was spoken above, the translation below in ' +
      'the primary voice, and a LANGUAGE TAG on each as its own SPX field — so one template ' +
      'serves any language pair without a designer. The order is the broadcast convention and ' +
      'not a preference: the translation must never be presented as the original.',
    uicolor: '1',
  },
  (o) => ({
    html: `    <!-- The panel: a two-column grid — [language tag] [line] — with the accent rule
         between the spoken row and the translated one. -->
    <div class="lower-third-box">
${cell(o, 0, 'lower-third-tagcell', 'lower-third-tag')}
${cell(o, 1, 'lower-third-linecell', 'lower-third-title')}
      <div class="lower-third-accent"></div>
${cell(o, 2, 'lower-third-tagcell', 'lower-third-tag')}
${cell(o, 3, 'lower-third-linecell', 'lower-third-name')}
    </div>`,

    css: `/* The panel — a two-column grid: the tags track their own width, the lines take the rest.
   The tag column is content-sized so a three-letter code and a full language name both fit
   without either padding the other out. */
.lower-third-box {
  display: grid;                    /* tags beside lines… */
  grid-template-columns: auto minmax(0, 1fr);  /* …tag column hugs, line column takes the rest */
  align-items: baseline;            /* each tag sits on its own line's baseline */
  column-gap: calc(22px * var(--scale));  /* the tag's clear space from the words */
  row-gap: calc(6px * var(--scale));  /* the rows are one statement — keep them close */
  padding: calc(24px * var(--scale)) calc(44px * var(--scale)) calc(26px * var(--scale)) calc(32px * var(--scale));
  background: var(--panel-bg);      /* the minimal family's quiet panel */
  border-radius: var(--panel-radius);  /* the family's corner radius */
  box-shadow: var(--panel-shadow);  /* the family's panel lift */
  min-width: calc(600px * var(--scale));  /* a broadcast-width strap even behind a short line */
  max-width: calc(980px * var(--scale));  /* two sentences wrap here rather than crossing frame */
}

/* The tag column — right-aligned against the words and closed by a printed rule, the way a
   marginal note is set off from the text it annotates. The rule is what stops the codes from
   reading as the first word of their own sentence. */
.lower-third-tagcell {
  grid-column: 1;                   /* always the tag track, whatever the operator left in */
  justify-self: end;                /* the codes align to the line column's left edge */
  padding-right: calc(20px * var(--scale));  /* the rule's clear space from the code */
  border-right: 1px solid color-mix(in srgb, var(--text-color) 20%, transparent);  /* the margin rule */
}

/* The line column. */
.lower-third-linecell {
  grid-column: 2;                   /* always the words' track */
  min-width: 0;                     /* let it shrink so a long sentence wraps instead of overflowing */
}

/* The language tags (f0, f2) — bounded and clipped: a tag is a code or one word, so a
   sentence typed in here ellipsizes inside its own cell rather than stealing the line
   column's width (the runtime bench measures the layout box, not the paint). */
.lower-third-tag {
  display: block;                   /* so the width bound and the ellipsis apply */
  max-width: calc(188px * var(--scale));  /* the widest a language label ever needs */
  font-size: calc(20px * var(--scale) * var(--type-scale));  /* a reference mark, not a line */
  font-weight: 700;                 /* bold — three tracked caps need the weight */
  line-height: 1.3;                 /* single tight label row */
  letter-spacing: var(--label-tracking);  /* the family's label tracking */
  text-transform: uppercase;        /* UKR, ENG — whatever the operator types */
  color: var(--label-color);        /* the family's label colour — quiet, it is a reference */
  white-space: nowrap;              /* a language code never wraps… */
  overflow: hidden;                 /* …and a too-long one is clipped… */
  text-overflow: ellipsis;          /* …with an honest ellipsis */
}

/* The spoken line (f1) — smaller and dimmed: it is what was SAID, not what is being read. */
.lower-third-title {
  font-size: calc(26px * var(--scale) * var(--type-scale));  /* clearly under the translation */
  font-weight: 400;                 /* regular — the quieter of the two voices */
  line-height: 1.3;                 /* room if the sentence wraps */
  color: var(--text-dim);           /* dimmed — never the primary ink twice */
}

/* The accent rule — the seam between the languages, and this design's accent NODE, so the
   line-reveal preset and the step reveals have a real element to draw. It spans BOTH columns
   because the seam belongs to the statement, not to one of its halves. */
.lower-third-accent {
  grid-column: 1 / -1;              /* the full width of the grid */
  height: var(--accent-weight);     /* the family's hairline weight */
  margin: calc(12px * var(--scale)) 0;  /* equal air above and below the seam */
  background: var(--accent);        /* the design's one accent surface */
  transform-origin: left center;    /* line-reveal draws it from this end */
}

/* The translation (f3) — the primary voice: this is the line the audience is reading. */
.lower-third-name {
  font-size: calc(36px * var(--scale) * var(--type-scale));  /* headline size (values are 1080p reference) */
  font-weight: 600;                 /* semibold: present without shouting */
  line-height: 1.24;                /* a sentence needs leading; a name does not */
  letter-spacing: var(--display-tracking);  /* the family's display tracking */
  color: var(--text-color);         /* primary text color */
}`,
    hasAccent: true,
  }),
);
