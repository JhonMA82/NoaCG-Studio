// lt62 "House Weather" — the current-conditions lower third of the WEATHER mini-pack
// (lt62 / ig37 / bug37), sibling of lt11 "House Strap": the amber bar and void blur panel,
// a mono place kicker, the temperature huge on the numerals contract, the condition beside
// it, and a mono wind line beneath.
//
// THE FIELD TITLES ARE AN API. The Production Data API (docs/DATA_API.md) addresses fields by
// their titles, and scripts/weather-feed.mjs — the Open-Meteo connector — posts exactly these
// labels: "Place", "Temperature", "Condition", "Wind". Retitling a field here breaks the live
// feed of every production using it; the whole pack shares the same vocabulary on purpose.
// The template stays dumb: it renders whatever strings arrive (the operator can type "Sunny"
// as easily as the feed can) — the WMO-code wording lives in the connector, never here.

import { paletteById, type TemplateVariant } from '../../model/wizard';
import { fontById, labelFontFaceCss } from '../../model/fonts';
import { maskLine } from '../shared/standard';
import { defineVariant } from './shared';

export const lt62: TemplateVariant = defineVariant(
  {
    id: 'lt62',
    category: 'lower-third',
    name: 'House Weather',
    styleTag: 'noacg',
    description: 'The house weather strap: place, a big tabular temperature, condition and wind.',
    maxLines: 4,
    suggestedLines: [
      { title: 'Place', sample: 'HELSINKI' },
      { title: 'Temperature', sample: '21°' },
      { title: 'Condition', sample: 'Partly cloudy' },
      { title: 'Wind', sample: 'SW 4 m/s' },
    ],
    logo: 'none',
    animationPresets: ['line-reveal', 'slide-up', 'mask-wipe', 'fade', 'slide-down', 'flip-3d'],
    defaultPalette: paletteById('noacg'),
    defaultFontId: 'space-grotesk',
    defaultZone: 'bottom-left',
  },
  {
    name: 'House Weather',
    description:
      'The house current-conditions weather strap: the amber accent bar against the void blur ' +
      'panel, the place as a tracked mono kicker, the temperature huge in tabular figures with ' +
      'the condition reading beside it, and the wind as a quiet mono line. Drive it by hand or ' +
      'live from a feed through the Production Data API.',
    uicolor: '4',
  },
  (o) => ({
    html: `    <!-- House Weather: [amber bar] | [void panel: place, temp + condition, wind]. -->
    <div class="lower-third-accent"></div>
    <div class="lower-third-box">
${maskLine('lower-third', o, 0, 'lower-third-place', '      ')}
      <!-- The reading line: temperature and condition sit on one baseline. -->
      <div class="lower-third-reading">
${maskLine('lower-third', o, 1, 'lower-third-temp', '        ')}
${maskLine('lower-third', o, 2, 'lower-third-cond', '        ')}
      </div>
${maskLine('lower-third', o, 3, 'lower-third-wind', '      ')}
    </div>`,
    css: `${labelFontFaceCss(fontById('jetbrains-mono'))}

/* The accent bar — the house 8px amber edge with its one restrained glow. */
.lower-third-accent {
  position: absolute;               /* pinned inside the positioned .lower-third root */
  left: 0;                          /* at the very left edge */
  top: 0;                           /* full panel height… */
  bottom: 0;                        /* …top to bottom */
  width: var(--accent-weight);      /* the family's bar weight */
  background: var(--accent);        /* the one accent surface */
  box-shadow: var(--accent-glow);   /* the family's glow — follows the accent color */
  will-change: transform;           /* hint the browser: presets grow this bar in */
}

/* The panel — the house void: near-black, translucent, softly blurring the video. */
.lower-third-box {
  margin-left: var(--accent-weight);        /* starts where the accent bar ends */
  min-width: calc(600px * var(--scale));    /* the strap floor — a broadcast-width bar; the void fills past the text */
  padding: calc(22px * var(--scale)) calc(52px * var(--scale)) calc(22px * var(--scale)) calc(34px * var(--scale));
  background: var(--panel-bg);      /* void rgba(10,12,16,.86) by default */
  backdrop-filter: var(--panel-blur);       /* the family's backdrop treatment */
  -webkit-backdrop-filter: var(--panel-blur);  /* Safari spelling of the same effect */
  box-shadow: var(--panel-shadow);  /* one deep lifting shadow */
}

/* The place (f0) — the house label voice: mono, caps, tracked wide, in the accent color. */
.lower-third-place {
  font-family: var(--font-label);   /* the family's label face */
  font-size: calc(22px * var(--scale) * var(--type-scale));  /* label scale (1080p reference) */
  font-weight: 500;                 /* medium keeps tracked caps crisp */
  line-height: 1.2;                 /* tight — it is a kicker, not a paragraph */
  letter-spacing: var(--label-tracking);  /* wide tracking — the label breathes */
  text-transform: uppercase;        /* reads as a technical label */
  color: var(--label-color);        /* the label carries the accent, not a second white */
}

/* The reading line — temperature and condition share one baseline. */
.lower-third-reading {
  display: flex;                    /* the two sit side by side… */
  align-items: baseline;            /* …on one shared baseline */
  gap: calc(20px * var(--scale));   /* clear air between the figure and its word */
  margin-top: calc(10px * var(--scale));  /* place → reading: they read as one unit */
}

/* The temperature (f1) — the strap's one huge voice, on the numerals contract:
   a live figure repaints on every feed tick, so its digits must all hold one width. */
.lower-third-temp {
  font-family: var(--font-numeric); /* a face whose digits are all one width */
  font-variant-numeric: tabular-nums;  /* ask that face for its tabular figures */
  font-size: calc(72px * var(--scale) * var(--type-scale));  /* the headline figure */
  font-weight: var(--display-weight);  /* full display weight */
  line-height: 1;                   /* a lone big figure sits tight */
  letter-spacing: -0.01em;          /* large glyphs tighten slightly */
  color: var(--text-color);         /* primary text color */
}

/* The condition (f2) — the word beside the figure, clearly subordinate. */
.lower-third-cond {
  font-size: calc(32px * var(--scale) * var(--type-scale));  /* under half the figure's size */
  font-weight: 500;                 /* medium — present without competing */
  line-height: 1.2;                 /* a touch of air if it wraps */
  color: var(--text-dim);           /* dimmed — never full white twice */
}

/* The wind (f3) — the small mono print at the bottom of the strap. */
.lower-third-wind {
  font-family: var(--font-label);   /* the house mono label face */
  font-variant-numeric: tabular-nums;  /* the wind figure repaints on feed ticks too */
  font-size: calc(20px * var(--scale) * var(--type-scale));  /* the quietest voice (at the floor) */
  font-weight: 500;                 /* medium keeps tracked caps crisp */
  line-height: 1.25;                /* air if it wraps */
  letter-spacing: var(--label-tracking);  /* the house label tracking */
  text-transform: uppercase;        /* label voice */
  color: var(--text-dim);           /* quiet — the temperature carries the strap */
  margin-top: calc(12px * var(--scale));  /* reading → wind: a real break */
}`,
    hasAccent: true,
  }),
);
