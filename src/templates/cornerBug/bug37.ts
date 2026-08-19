// bug37 "House Temp" — the compact corner temperature bug of the WEATHER mini-pack
// (lt62 / ig37 / bug37), sibling of bug05 "House Ident" / lt11 "House Strap": the amber
// bar inside the void panel, the temperature in tabular figures, and the place as a tiny
// mono caps label under it. The mark a channel leaves in the corner through a whole show.
//
// THE FIELD TITLES ARE AN API. The Production Data API (docs/DATA_API.md) addresses fields
// by their titles, and scripts/weather-feed.mjs — the Open-Meteo connector — posts exactly
// these labels: "Temperature", "Place" (the same vocabulary as lt62's strap). Retitling a
// field here breaks the live feed of every production using it. The template stays dumb: it
// renders whatever strings arrive.

import { paletteById, type TemplateVariant } from '../../model/wizard';
import { fontById, labelFontFaceCss } from '../../model/fonts';
import { maskLine } from '../shared/standard';
import { defineBugVariant } from './shared';

export const bug37: TemplateVariant = defineBugVariant(
  {
    id: 'bug37',
    category: 'corner-bug',
    name: 'House Temp',
    styleTag: 'noacg',
    description: 'The house temperature bug: a big tabular figure over a tiny mono place label.',
    maxLines: 2,
    suggestedLines: [
      { title: 'Temperature', sample: '21°' },
      { title: 'Place', sample: 'HELSINKI' },
    ],
    logo: 'none',
    animationPresets: ['slide-left', 'fade', 'blur-in', 'slide-up', 'slide-down', 'pop-spring'],
    defaultPalette: paletteById('noacg'),
    defaultFontId: 'space-grotesk',
    defaultZone: 'top-right',
  },
  {
    name: 'House Temp',
    description:
      'The house corner temperature bug: the amber edge bar inside the void panel, the ' +
      'temperature in tabular figures so the feed can repaint it without the box twitching, ' +
      'and the place as a tiny tracked mono label. Drive it by hand or live through the ' +
      'Production Data API.',
    uicolor: '4',
  },
  (o) => ({
    html: `    <!-- House Temp: [amber bar] [temperature over its place label]. -->
    <div class="corner-bug-box">
      <!-- The accent bar lives INSIDE the panel, so it travels with it on every entrance. -->
      <div class="corner-bug-accent"></div>
      <div class="corner-bug-text">
${maskLine('corner-bug', o, 0, 'corner-bug-temp', '        ')}
${maskLine('corner-bug', o, 1, 'corner-bug-place', '        ')}
      </div>
    </div>`,
    css: `${labelFontFaceCss(fontById('jetbrains-mono'))}

/* The accent bar — the house's single colour moment, fused to the panel's left edge.
   It sits inside the panel so entrance presets carry the two as one piece. */
.corner-bug-accent {
  position: absolute;              /* pinned inside the panel */
  left: 0;                         /* flush with the panel's left edge */
  top: 0;                          /* …from the top… */
  bottom: 0;                       /* …to the bottom: the bar is the panel's height */
  width: var(--accent-weight);     /* the family's bar thickness */
  background: var(--accent);       /* the one accent colour */
  box-shadow: var(--accent-glow);  /* the house glow, on the accent only */
}

/* The panel — the house void tint, drawn small: a corner mark, not a strap. */
.corner-bug-box {
  position: relative;              /* the accent bar positions against this */
  padding: calc(14px * var(--scale)) calc(22px * var(--scale));  /* even air inside the panel */
  padding-left: calc(22px * var(--scale) + var(--accent-weight));  /* clear the accent bar */
  background: var(--panel-bg);     /* the void panel */
  backdrop-filter: var(--panel-blur);  /* the family's backdrop treatment */
  -webkit-backdrop-filter: var(--panel-blur);  /* Safari spelling of the same effect */
  border-radius: var(--panel-radius);  /* the house panel is square-cornered */
  box-shadow: var(--panel-shadow); /* the family's lift */
}

/* The text column — the figure over its place label. */
.corner-bug-text {
  display: flex;                   /* the two lines stack… */
  flex-direction: column;          /* …top to bottom */
  text-align: left;                /* both lines hug the same edge (overrides the zone) */
}

/* The temperature (f0) — the numerals contract: the feed repaints this figure, so its
   digits must all hold one width or the corner mark twitches on every update. */
.corner-bug-temp {
  font-family: var(--font-numeric);  /* a face whose digits are all one width */
  font-variant-numeric: tabular-nums;  /* ask that face for its tabular figures */
  font-size: calc(34px * var(--scale) * var(--type-scale));  /* compact — a mark, not a headline */
  font-weight: var(--display-weight);  /* the family's display weight */
  line-height: 1;                  /* a lone figure sits tight */
  color: var(--text-color);        /* primary text */
}

/* The place (f1) — the mono house label voice, tiny (the corner-bug 16px floor exception). */
.corner-bug-place {
  margin-top: calc(5px * var(--scale));  /* the two lines read as one lockup */
  font-family: var(--font-label);  /* the house mono label face */
  font-size: calc(16px * var(--scale) * var(--type-scale));   /* tiny label size */
  font-weight: 500;                /* medium keeps tracked caps crisp */
  line-height: 1.25;               /* air if it wraps */
  letter-spacing: var(--label-tracking);  /* the house label tracking */
  text-transform: uppercase;       /* label voice */
  color: var(--label-color);       /* the house carries the accent in the label */
}`,
    hasAccent: true,
  }),
);
