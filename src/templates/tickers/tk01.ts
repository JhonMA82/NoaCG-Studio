// tk01 "News Strip" — the classic minimal news ticker, sibling of lt02 (Underline).
// A full-width dark bar with a 2px accent TOP border (lt02's underline motif turned into
// the strip's edge), a solid accent label block on the left, and items travelling through
// the viewport on the right. Restrained, newsroomy, timeless.

import { paletteById, type TemplateVariant } from '../../model/wizard';
import { defineTickerVariant } from './shared';

export const tk01: TemplateVariant = defineTickerVariant(
  {
    id: 'tk01',
    category: 'ticker',
    name: 'News Strip',
    styleTag: 'minimal',
    description: 'Full-width minimal news bar with an accent top border and label block.',
    maxLines: 2,
    suggestedLines: [
      {
        title: 'Ticker items',
        sample: [
          'Welcome to tonight’s live show',
          'Guest lineup announced for next week',
          'Send your questions with #ontheair',
          'Tickets for the summer tour are on sale now',
        ].join('\n'),
      },
      { title: 'Label', sample: 'NEWS' },
    ],
    logo: 'none',
    animationPresets: ['ticker-marquee'],
    defaultPalette: paletteById('signal'),
    defaultFontId: 'inter',
    defaultZone: 'bottom-center',
  },
  {
    name: 'News Strip',
    description:
      'The classic minimal news strip: a full-width dark bar edged by a 2px accent top ' +
      'border (the lt02 underline motif), a solid accent label block on the left, and ' +
      'items looping endlessly to its right. Restrained and timeless.',
    uicolor: '2',
  },
  (o) => ({
    // Strip = label block (left) + marquee viewport (right). The track is filled by
    // rebuildTicker(); the label span (#f1) is written directly by update().
    html: `    <!-- News Strip: accent label left, endless marquee right. -->
    <div class="ticker-box">
      <!-- The label block — the strip's single accent moment. -->
      <div class="ticker-label"><span id="f1">${o.lines[1]?.sample || 'NEWS'}</span></div>
      <!-- The scrolling window — rebuildTicker() injects the items into the track. -->
      <div class="ticker-viewport">
        <div id="ticker-track"></div>
      </div>
    </div>`,
    css: `/* The strip: a full-width dark bar; the accent top border is the lt02 underline motif. */
.ticker-box {
  display: flex;                   /* label left, viewport filling the rest */
  align-items: stretch;            /* the label block spans the full strip height */
  width: calc(1680px * var(--scale));  /* near full-width, inside the safe areas */
  height: calc(90px * var(--scale));   /* the strip's fixed height */
  overflow: hidden;                /* nothing paints past the band - a ticker runs full-bleed
                                      or carries EQUAL margins, never one (the owner rule the
                                      2026-08-19 read restated on this design) */
  background: var(--panel-bg);     /* near-black bar — never pure #000 */
  border-top: var(--accent-weight) solid var(--accent);  /* the strip's authored accent weight */
  will-change: opacity;            /* hint the browser: the preset fades this */
}

/* The label block — solid accent, light ink. The family's accent-ink (the panel hue) sat on
   the signal red at 4.46:1 and the 2026-08-19 blind read failed it twice in the same words:
   "red background, black text - I don't think that works". White on that red is the newsroom
   convention (every BREAKING band), and at this size and weight it clears the large-text
   floor. The block is also BOUNDED: an operator label longer than a third of the strip trims
   with an ellipsis instead of displacing the viewport out of the band. */
.ticker-label {
  display: flex;                   /* center the label text inside the block */
  align-items: center;             /* vertical centering */
  flex-shrink: 0;                  /* never squeezed by the scrolling viewport */
  max-width: calc(560px * var(--scale));  /* a label is a tag - it never becomes the strip */
  padding: 0 calc(35px * var(--scale));  /* generous horizontal breathing room */
  background: var(--accent);       /* the one solid accent surface */
  font-size: calc(24px * var(--scale) * var(--type-scale)); /* kicker scale — clear of the size warning band */
  font-weight: 700;                /* bold so the small caps carry */
  letter-spacing: var(--label-tracking);  /* the label block's authored tracking */
  text-transform: uppercase;       /* reads as a tag, whatever the operator types */
  color: var(--text-color);        /* light ink on the accent block - the read's ruling */
}

/* The label text itself: one line, trimmed with an ellipsis past the block's cap. */
.ticker-label > span {
  overflow: hidden;                /* everything past the cap is cut... */
  text-overflow: ellipsis;         /* ...and the cut is marked */
  white-space: nowrap;             /* a tag is one line, whatever is typed into it */
}

/* The scrolling window — items travel through it and clip at its edges. */
.ticker-viewport {
  flex-grow: 1;                    /* take all the strip width the label leaves */
  overflow: hidden;                /* the marquee window — items vanish at the edges */
  display: flex;                   /* so the track can be vertically centered */
  align-items: center;             /* items sit on the strip's centerline */
}

/* The track — one endless row of items; the marquee preset slides its x. */
#ticker-track {
  display: inline-flex;            /* items in a single row, width = content */
  align-items: center;             /* items and separators share a baseline zone */
  white-space: nowrap;             /* never wrap — the track is one continuous line */
  will-change: transform;          /* the marquee animates x every frame */
}

/* One news item — quiet, readable, subordinate to nothing. */
.ticker-item {
  font-size: calc(28px * var(--scale) * var(--type-scale)); /* comfortable reading size at travel speed */
  font-weight: 500;                /* a touch of presence without shouting */
  color: var(--text-color);        /* primary text color */
}

/* The dot between items — dimmed punctuation, never a second accent. */
.ticker-sep {
  margin: 0 calc(35px * var(--scale)); /* even air on both sides of the dot */
  font-size: calc(20px * var(--scale) * var(--type-scale)); /* small — a pause, not a bullet point */
  color: var(--text-dim);          /* dimmed so the items stay the focus */
}`,
    // renderTickerItem(text): the markup for ONE item — text plus its trailing dot,
    // so the doubled track reads as an even, endless chain.
    tokens: {
      accentWeight: 'calc(3px * var(--scale))',
      labelTracking: '0.12em',
    },
    rowBuilderJs: `// renderTickerItem(text): one item followed by a small dim dot separator.
function renderTickerItem(text) {
  return '<span class="ticker-item">' + text + '</span>' +
         '<span class="ticker-sep">\\u2022</span>';
}`,
    // Marquee design: the items render twice so sliding one set length loops seamlessly.
    doubleItems: true,
  }),
);
