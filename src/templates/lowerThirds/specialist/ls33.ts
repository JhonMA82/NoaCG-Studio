// ls33 "Quote Strap" — the strap whose subject is a SENTENCE, not a person.
//
// Every newsroom runs this graphic and almost none of them run it as a name tag. When a
// bulletin puts a quotation on screen it is because the words are the story: a minister's
// exact phrasing, a court's wording, a line from a statement nobody is going to read out. So
// the quoted line is the headline and the person is the attribution beneath it — the inverse
// of a speaker strap, where the name leads and what they said never appears at all.
//
// Two things follow from that, and both are printed-page conventions rather than broadcast
// ones. The quotation opens with a DRAWN mark, oversized and set in the accent, because a
// reader needs to know at a glance that these are somebody else's words and not the
// programme's. And the attribution is separated from the quotation by a hairline, the way a
// pull-quote is ruled off from its credit in a magazine — a colon or a dash would read as
// part of the sentence.
//
// The surface is PAPER rather than ink. Editorial is the one family whose panel may be a flat
// printed surface, and a quotation is the moment to spend it: the graphic is asking the viewer
// to read a sentence, which is a page's job rather than a screen's.

import { paletteById, type TemplateVariant } from '../../../model/wizard';
import { sampleName } from '../../shared/sampleNames';
import { defineVariant } from '../shared';
import { hasLine, slot } from './shared';

export const ls33: TemplateVariant = defineVariant(
  {
    id: 'ls33',
    category: 'lower-third',
    name: 'Quote Strap',
    styleTag: 'editorial',
    description: 'A quoted line set as the headline, ruled off from the person it belongs to.',
    maxLines: 3,
    suggestedLines: [
      { title: 'Quote', sample: 'We will not put the timetable before the evidence.' },
      { title: 'Name', sample: sampleName('ls33') },
      { title: 'Role', sample: 'Minister for Transport' },
    ],
    logo: 'none',
    // Mask wipe: the paper unrolls and the sentence is simply there — a quotation should not
    // arrive in pieces, because a half-revealed sentence reads as a different sentence.
    animationPresets: ['mask-wipe', 'fade', 'line-reveal', 'slide-up', 'blur-in', 'slide-left'],
    defaultPalette: paletteById('broadsheet'),
    defaultFontId: 'source-serif-4',
    defaultZone: 'bottom-left',
  },
  {
    name: 'Quote Strap',
    description:
      'The quotation strap: the quoted line set as the graphic’s headline on a flat paper ' +
      'surface, opened by a drawn quote mark and ruled off from the attribution beneath it. ' +
      'Built for the case where the WORDS are the story — a minister’s phrasing, a court’s ' +
      'wording — so the sentence leads and the speaker is the credit line.',
    uicolor: '1',
  },
  (o) => {
    // The attribution row holds the name and the role on one baseline behind a drawn middot,
    // and disappears entirely when the operator has left neither — an unattributed quotation
    // (a court document, a leaked note) is a real broadcast case, not a broken graphic.
    const creditRow =
      hasLine(o, 1) || hasLine(o, 2)
        ? `      <div class="lower-third-creditrow">
${slot(o, 1, 'lower-third-title', '        ')}
${slot(o, 2, 'lower-third-role', '        ')}
      </div>
`
        : '';

    return {
      html: `    <!-- The card: [drawn quote mark] | [the quotation] over [hairline] over [attribution]. -->
    <div class="lower-third-box">
      <!-- The quote mark is DRAWN, not typed: it is punctuation the design owns, so it is
           never one of the operator's fields and never travels with the text. -->
      <div class="lower-third-quotemark" aria-hidden="true">&ldquo;</div>
      <div class="lower-third-text">
${slot(o, 0, 'lower-third-name', '        ')}
        <div class="lower-third-accent"></div>
${creditRow}      </div>
    </div>`,

      css: `/* The card — a flat printed surface, square-cornered: editorial's panel is a PAGE, not
   a chip. Paper rather than ink, because the graphic's job is to be read.

   Laid out as a two-column grid rather than a row, because that is what a HANGING quote mark
   needs: the mark keeps its own track at whatever size it is set, and the sentence beside it
   wraps against a column edge that never moves. In a flex row the mark's own width would
   feed back into the text's measure as the type scale changed. */
.lower-third-box {
  display: grid;                    /* the quote mark beside the sentence, never above it */
  grid-template-columns: auto minmax(0, 1fr);  /* the mark hugs; the sentence takes the rest */
  align-items: start;               /* the mark hangs from the quotation's first line */
  column-gap: calc(20px * var(--scale));  /* the mark's clear space from the words */
  padding: calc(34px * var(--scale)) calc(48px * var(--scale)) calc(32px * var(--scale)) calc(38px * var(--scale));
  background: var(--panel-bg);      /* the family's flat printed surface */
  box-shadow: var(--panel-shadow);  /* the page's lift off the picture */
  min-width: calc(600px * var(--scale));  /* a broadcast-width card even behind a short quote */
  max-width: calc(940px * var(--scale));  /* a sentence wraps here rather than crossing the frame */
}

/* The drawn quote mark — oversized, in the accent, and pulled up so its shoulder sits on the
   quotation's cap height the way a hanging quote does in print. */
.lower-third-quotemark {
  flex: none;                       /* never squeezed by a long sentence */
  font-size: calc(96px * var(--scale) * var(--type-scale));  /* display size — this is a drawn mark */
  font-weight: 700;                 /* solid enough to read as printed punctuation */
  line-height: 0.72;                /* pulls the glyph up onto the first line's cap height */
  color: var(--accent);             /* the design's one accent surface */
  user-select: none;                /* decoration, not text anyone needs to select */
}

.lower-third-text {
  min-width: 0;                     /* let it shrink so a long sentence wraps instead of overflowing */
}

/* The quotation (f0) — the graphic's headline, set at reading weight rather than shouted. */
.lower-third-name {
  font-size: calc(42px * var(--scale) * var(--type-scale));  /* headline size (values are 1080p reference) */
  font-weight: var(--display-weight);  /* the family's display weight — set, not shouted */
  line-height: 1.22;                /* a sentence needs leading; a name does not */
  letter-spacing: var(--display-tracking);  /* the family's display tracking */
  color: var(--text-color);         /* primary text color */
}

/* The hairline — the printed rule between the words and whose they are. It is this design's
   accent NODE, so the line-reveal preset and the step reveals have a real element to draw. */
.lower-third-accent {
  width: calc(96px * var(--scale));  /* a short printed rule, not a divider across the page */
  height: var(--accent-weight);     /* the family's 2px rule weight */
  margin: calc(22px * var(--scale)) 0 calc(16px * var(--scale));  /* air on both sides of the rule */
  background: var(--accent);        /* the same accent as the quote mark — one colour, two doses */
  transform-origin: left center;    /* line-reveal draws it from this end */
}

/* The attribution row — the name and the role on one baseline, joined by a drawn middot. */
.lower-third-creditrow {
  display: flex;                    /* name and role in a row… */
  flex-wrap: wrap;                  /* …wrapping only if both run long */
  align-items: baseline;            /* one shared baseline */
  gap: calc(12px * var(--scale));   /* the drawn middot sits in this gap */
  min-width: 0;                     /* allow shrinking */
}
.lower-third-creditrow > .lower-third-mask {
  display: flex;                    /* each value hugs its own text… */
  min-width: 0;                     /* …and may shrink */
}

/* The speaker (f1) — the credit, not the subject. */
.lower-third-title {
  font-size: calc(26px * var(--scale) * var(--type-scale));  /* clearly below the quotation */
  font-weight: 600;                 /* semibold — a name still has to hold its own */
  line-height: 1.25;                /* room if the name wraps */
  color: var(--text-color);         /* primary text color */
}

/* The role (f2) — the quietest voice, and the first line an operator drops. Set in ITALIC
   sentence case rather than the pack's usual tracked caps: this card is a printed page, and a
   printed attribution has never been shouted. Caps would also fight the drawn quote mark for
   the one loud element the composition allows. */
.lower-third-role {
  font-size: calc(20px * var(--scale) * var(--type-scale));  /* the smallest thing on the card */
  font-style: italic;               /* the attribution's print convention */
  font-weight: 500;                 /* medium — italics thin out at regular weight */
  line-height: 1.3;                 /* single tight credit line */
  color: var(--label-color);        /* the family's label colour (the accent) */
}

/* The middot is DRAWN and only between the two, so a name with no role has no dangling
   separator after it. */
.lower-third-creditrow > .lower-third-mask + .lower-third-mask::before {
  content: "·";                     /* the join, owned by the design */
  margin-right: calc(12px * var(--scale));  /* balances the flex gap on the other side */
  color: var(--text-dim);           /* quieter than the words it joins */
}`,
      hasAccent: true,
    };
  },
);
