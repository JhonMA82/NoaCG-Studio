// tk21 "Editorial Desk" - the editorial news ticker and sibling of lt25 "Masthead".
// It holds one complete story at a time so the ticker type's timer, pause and skip controls
// remain genuine. Printed rules, flat ink and whitespace replace the usual chip-and-rail look.

import { paletteById, type TemplateVariant } from '../../model/wizard';
import { defineTickerVariant } from './shared';

export const TK21_ITEMS_SAMPLE = [
  'Rail services resume after overnight repairs',
  'Council approves the riverside protection plan',
  'Museum extends the summer exhibition through September',
  'Public hearing begins at 18:30 in Assembly Hall',
].join('\n');

export const tk21: TemplateVariant = defineTickerVariant(
  {
    id: 'tk21',
    category: 'ticker',
    name: 'Editorial Desk Ticker',
    styleTag: 'editorial',
    description: 'One news line at a time on a flat ink strip framed by printed rules.',
    maxLines: 2,
    suggestedLines: [
      {
        title: 'Ticker items',
        sample: TK21_ITEMS_SAMPLE,
      },
      { title: 'Label', sample: 'THE EVENING DESK' },
    ],
    logo: 'none',
    animationPresets: ['ticker-rotate'],
    defaultPalette: paletteById('vermilion'),
    defaultFontId: 'archivo',
    defaultZone: 'bottom-center',
  },
  {
    name: 'Editorial Desk Ticker',
    description:
      'The news ticker in the lt25 Masthead family: a wide-tracked desk label, one complete ' +
      'story held long enough to read, and exact 2 px printed rules on a flat ink surface.',
    uicolor: '1',
  },
  (o) => ({
    html: `    <!-- Editorial Desk: masthead label above one timed story. -->
    <div class="ticker-box">
      <div class="ticker-masthead">
        <span id="f1">${o.lines[1]?.sample || 'THE EVENING DESK'}</span>
      </div>
      <div class="ticker-rule"></div>
      <div class="ticker-viewport">
        <div id="ticker-track"></div>
      </div>
    </div>`,
    css: `/* The desk strip - flat ink, square edges and no glass treatment. */
.ticker-box {
  display: grid;                   /* masthead above the story */
  grid-template-columns: auto auto minmax(0, 1fr); /* label, rule and story share one line */
  align-items: stretch;            /* every part fills the strip height */
  width: min(calc(1640px * var(--scale)), 100vw); /* safe-area news width, never past the frame */
  min-height: calc(102px * var(--scale)); /* long stories can wrap and grow */
  max-width: min(calc(1640px * var(--scale)), 100vw); /* the L size hits the frame edge, not beyond */
  background: var(--panel-bg);     /* flat printed ink */
  border-top: var(--accent-weight) solid var(--accent); /* exact editorial 2 px rule */
  border-bottom: var(--accent-weight) solid var(--accent); /* matching printed close */
  border-radius: var(--panel-radius); /* exact editorial zero */
  box-shadow: var(--panel-shadow); /* restrained lift */
}

/* The desk name - a masthead, not an accent-filled chip. */
.ticker-masthead {
  display: flex;                   /* centre the label */
  align-items: center;             /* vertical centre */
  padding: calc(20px * var(--scale)) calc(31px * var(--scale)); /* generous print spacing */
  font-size: calc(20px * var(--scale) * var(--type-scale)); /* broadcast-safe label */
  font-weight: 700;                /* crisp caps */
  line-height: 1.3;                /* tracked caps breathe */
  letter-spacing: var(--label-tracking); /* exact editorial 0.24em */
  text-transform: uppercase;       /* masthead voice */
  color: var(--label-color);       /* accent-coloured label */
  white-space: nowrap;             /* the masthead stays one line */
}
.ticker-masthead span {
  max-width: calc(430px * var(--scale)); /* an extreme desk name ellipsizes instead of */
  overflow: hidden;                      /* pushing the whole strip past the frame */
  text-overflow: ellipsis;
}

/* The column rule - the single vertical organising mark. */
.ticker-rule {
  width: var(--accent-weight);     /* exact editorial 2 px */
  margin: calc(19px * var(--scale)) 0; /* rule never touches the outer rules */
  background: var(--accent);       /* single accent colour */
}

.ticker-viewport {
  display: flex;                   /* centre the current story */
  align-items: center;             /* vertical centre */
  min-width: 0;                    /* story wraps instead of stretching the grid */
  padding: calc(18px * var(--scale)) calc(35px * var(--scale)); /* reading air */
  text-align: left;                /* fixed editorial reading edge */
}

.ticker-item {
  font-size: calc(31px * var(--scale) * var(--type-scale)); /* story reading size */
  font-weight: var(--display-weight); /* exact editorial 600 */
  line-height: 1.25;               /* supports a two-row headline */
  letter-spacing: var(--display-tracking); /* exact editorial -0.015em */
  color: var(--text-color);        /* primary ink */
}`,
    rowBuilderJs: `// renderTickerItem(text): one complete story held by the rotator.
function renderTickerItem(text) {
  return '<span class="ticker-item">' + text + '</span>';
}`,
    doubleItems: false,
  }),
);
