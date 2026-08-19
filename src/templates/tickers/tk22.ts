// tk22 "Market Decks" - the markets strip as a DOUBLE DECKER: the lead quote held still on the
// top deck, every other instrument crawling underneath it. Glass family, sibling of tk03 "Glass
// Flip" and lt08 "Frosted Card".
//
// The shape is the one a business channel settles on, and for the same reason a news channel
// settles on it (tk20 "Split Deck"): a crawl cannot hold the number a viewer tuned in for,
// because it is only on screen for a few seconds every minute, and a fixed strip cannot hold a
// market, because a market is fifty instruments. So the lead index sits still on the top deck
// while the rest run past below it.
//
// What makes it a different graphic from tk06 "House Markets" and tk14 "Market Board" rather
// than a re-skin: those are ONE deck, and every quote in them is equal. Here the lead quote is a
// separate register - set larger, on its own deck, with the session's own stamp beside it - and
// the crawl is subordinate to it. The type is mono and tabular on BOTH decks, so a level that
// reprints every few seconds never changes the strip's width.
//
// The delta colours are the fixed market pair (BRAND-MANUAL §3), never the accent, and the
// arrow repeats what the sign says: a viewer who cannot tell red from green still reads the
// direction.

import { paletteById, type TemplateVariant } from '../../model/wizard';
import { fontById, labelFontFaceCss } from '../../model/fonts';
import { defineTickerVariant } from './shared';

export const tk22: TemplateVariant = defineTickerVariant(
  {
    id: 'tk22',
    category: 'ticker',
    name: 'Market Decks',
    styleTag: 'glass',
    description: 'A markets double-decker: the lead quote held still above a crawl of instruments.',
    maxLines: 3,
    suggestedLines: [
      {
        title: 'Instruments',
        sample: [
          'AAPL 175.20 +1.10%',
          'GOOGL 130.55 -0.80%',
          'NVDA 118.42 +2.35%',
          'OMXH25 4218.60 +1.24%',
          'BRENT 82.40 -1.05%',
          'EUR/USD 1.0842 +0.12%',
        ].join('\n'),
      },
      { title: 'Session', sample: 'Markets' },
      { title: 'Lead quote', sample: 'DJIA  34,567.89  +120.34  (+0.35%)' },
    ],
    logo: 'none',
    animationPresets: ['ticker-marquee'],
    defaultPalette: paletteById('frost'),
    defaultFontId: 'manrope',
    defaultZone: 'bottom-center',
  },
  {
    name: 'Market Decks',
    description:
      'The markets double-decker: a session chip and the lead quote held still on the top deck, ' +
      'and every other instrument crawling below. Type one "SYMBOL LEVEL +1.24%" per line - the ' +
      'crawl splits each into a symbol, a level and a signed delta, and gives the delta an arrow ' +
      'as well as its colour. Both decks are set in tabular figures, so a level that reprints ' +
      'every few seconds never moves the strip.',
    uicolor: '5',
  },
  (o) => ({
    html: `    <!-- Market Decks: lead quote held still on top, the rest of the market crawling below. -->
    <div class="ticker-box">
      <!-- The top deck - the session chip and the one quote that stays put. -->
      <div class="ticker-deck">
        <div class="ticker-label"><span id="f1">${o.lines[1]?.sample || 'Markets'}</span></div>
        <div class="ticker-lead"><span id="f2">${o.lines[2]?.sample || 'DJIA  34,567.89  +120.34  (+0.35%)'}</span></div>
      </div>
      <!-- The lower deck - everything else, travelling. -->
      <div class="ticker-viewport">
        <div id="ticker-track"></div>
      </div>
    </div>`,
    css: `${labelFontFaceCss(fontById('jetbrains-mono'))}

/* The slab - a translucent, blurred, rounded bar holding two decks. The glass family's panel at
   strip proportions: the radius and the blur are the family's, the height is this design's. */
.ticker-box {
  display: flex;                   /* the two decks… */
  flex-direction: column;          /* …stacked */
  width: calc(1680px * var(--scale));  /* near full-width, inside the safe areas */
  background: var(--panel-bg);     /* the family's translucent panel */
  border-radius: var(--panel-radius);  /* the family's radius */
  box-shadow: var(--panel-shadow), var(--panel-keyline);  /* soft wide lift + the 1px inner edge */
  backdrop-filter: var(--panel-blur);  /* the family's blur, safe when a theme sets none */
  overflow: hidden;                /* the crawl and the radius agree at the corners */
  will-change: opacity;            /* hint the browser: the preset fades this */
}

/* The top deck - the session chip and the lead quote, divided from the crawl by a hairline. */
.ticker-deck {
  display: flex;                   /* chip left, quote filling the rest */
  align-items: center;             /* both on one centre line */
  gap: calc(26px * var(--scale));  /* air between the chip and the quote */
  min-height: calc(64px * var(--scale));  /* the deck's height - a FLOOR, so a wrapped quote fits */
  padding: calc(6px * var(--scale)) calc(30px * var(--scale));  /* the deck's frame, with air for a second line */
  border-bottom: 1px solid rgba(255, 255, 255, 0.16);  /* the keyline dividing the decks */
}

/* The session chip - a soft accent capsule, the glass family's label treatment. */
.ticker-label {
  display: flex;                   /* centre the word in the chip */
  align-items: center;             /* vertical centring */
  flex-shrink: 0;                  /* never squeezed by the quote beside it */
  padding: calc(5px * var(--scale)) calc(18px * var(--scale));  /* a tight capsule */
  border-radius: 999px;            /* the pill idiom - frame-anchored, so not scaled */
  background: color-mix(in srgb, var(--accent) 26%, transparent);  /* a tint, not a fill */
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 55%, transparent);  /* the keyline */
  font-size: calc(21px * var(--scale) * var(--type-scale));  /* label scale, above the type floor */
  font-weight: 700;                /* small caps need weight to hold */
  letter-spacing: var(--label-tracking);  /* the family's label tracking */
  text-transform: uppercase;       /* reads as a session stamp, whatever they type */
  color: var(--accent);            /* the accent as ink on its own tint */
  white-space: nowrap;             /* the chip never wraps */
}

/* The lead quote - the number the strip exists for, in mono tabular figures. */
.ticker-lead {
  min-width: 0;                    /* lets a long quote shrink rather than push the chip */
  font-family: var(--font-numeric);  /* a face whose digits are all one width */
  font-size: calc(30px * var(--scale) * var(--type-scale));  /* the loudest voice on the strip */
  font-weight: 700;                /* the lead is stated, not murmured */
  letter-spacing: 0.01em;          /* mono figures need a hair of air */
  font-variant-numeric: tabular-nums;  /* the level reprints without moving the deck */
  color: var(--text-color);        /* primary text colour */
}
/* THE LEAD WRAPS, it is never trimmed. A market lead is a quote an operator may write long
   ("DJIA 34,567.89 +120.34 (+0.35%) - best session since March"), and both ways of refusing
   that are worse than letting it run to a second line: trimming it hides the half that moved,
   and nowrap pushes it out of a strip whose own overflow then cuts it mid-figure. So this is
   the auto-fit pattern - a cap plus wrapping - and the deck below grows to hold it. */
.ticker-lead > span {
  display: block;                  /* so the cap and the wrapping apply to the line's own box */
  max-width: calc(1120px * var(--scale));  /* the width the deck can give a quote */
  overflow-wrap: break-word;       /* an unbroken run of figures breaks rather than overflowing */
  text-wrap: balance;              /* a wrapped quote gets even rows */
}

/* The lower deck - the crawl's window. */
.ticker-viewport {
  display: flex;                   /* so the track can be vertically centred */
  align-items: center;             /* items sit on the deck's centre line */
  height: calc(58px * var(--scale));  /* the crawl deck's stated height */
  overflow: hidden;                /* the marquee window - items vanish at the edges */
}

/* The track - one endless row of instruments. */
#ticker-track {
  display: inline-flex;            /* instruments in a single row, width = content */
  align-items: baseline;           /* symbol, level and delta share a baseline */
  white-space: nowrap;             /* never wrap - the track is one continuous line */
  padding-left: calc(30px * var(--scale));  /* the crawl starts under the chip, not at the edge */
  will-change: transform;          /* the marquee animates x every frame */
}

/* One instrument - symbol, level, delta. */
.ticker-item {
  display: inline-flex;            /* the three parts sit on one line */
  align-items: baseline;           /* on one baseline */
  gap: calc(13px * var(--scale));  /* air between the three parts */
  margin-right: calc(54px * var(--scale));  /* generous air between instruments */
  font-family: var(--font-numeric);  /* the same figures as the deck above */
  font-size: calc(25px * var(--scale) * var(--type-scale));  /* subordinate to the lead quote */
  font-variant-numeric: tabular-nums;  /* even digits across every instrument */
  color: var(--text-color);        /* primary text colour */
}
.ticker-symbol {
  font-weight: 700;                /* the symbol anchors the group */
  letter-spacing: 0.02em;          /* short all-caps tickers need a little air */
}
.ticker-level {
  font-weight: 400;                /* regular - read, not scanned */
  color: var(--text-dim);          /* secondary: the delta is what people look for */
}

/* The delta - the direction. FIXED semantic market colours (BRAND-MANUAL §3), NOT the accent:
   green stays green and red stays red whatever palette the project is in. The arrow and the
   sign carry the same information, so colour is never the only signal. */
.ticker-up   { color: #4ac47a; font-weight: 600; }  /* gains */
.ticker-down { color: #e57a7d; font-weight: 600; }  /* losses */
.ticker-flat { color: var(--text-dim); font-weight: 600; }  /* unchanged */`,
    // renderTickerItem(text): "SYMBOL LEVEL +D%" - the trailing signed token becomes the delta;
    // whatever is before it splits into symbol and level at the last space. An item written any
    // other way renders whole, so a typo never makes a quote disappear.
    rowBuilderJs: `// renderTickerItem(text): one instrument - symbol, level, and a signed delta with an arrow.
function renderTickerItem(text) {
  var m = text.match(/^(.*\\S)\\s+([+\\-\\u2212]?[\\d.,]+%?)$/);
  if (!m) return '<span class="ticker-item">' + text + '</span>';
  var delta = m[2];
  var head = m[1];
  var sign = delta.charAt(0);
  var dir = sign === '+' ? 'ticker-up' : (sign === '-' || sign === '\\u2212') ? 'ticker-down' : 'ticker-flat';
  // The arrow duplicates the sign on purpose: direction must survive a viewer who cannot tell
  // the two colours apart.
  var arrow = dir === 'ticker-up' ? '\\u25B2' : dir === 'ticker-down' ? '\\u25BC' : '\\u2013';
  // Split the head into symbol and level at the LAST space, so "FTSE 100 8104.88" keeps its
  // two-word symbol.
  var cut = head.lastIndexOf(' ');
  var symbol = cut > 0 ? head.slice(0, cut) : head;
  var level = cut > 0 ? head.slice(cut + 1) : '';
  return '<span class="ticker-item">' +
         '<span class="ticker-symbol">' + symbol + '</span>' +
         (level ? '<span class="ticker-level">' + level + '</span>' : '') +
         '<span class="' + dir + '">' + arrow + ' ' + delta + '</span>' +
         '</span>';
}`,
    doubleItems: true,
    tokens: { labelTracking: '0.14em' },
  }),
);
