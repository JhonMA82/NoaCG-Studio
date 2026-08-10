// nm04 "Volt Nominees" - the sport nominee reveal, sibling of nm01 House Nominees. Finalists
// sit on hard-edged rows over a near-black gradient, and the winner does not gain an ornament:
// its row FLIPS to the accent slab, which is the loudest thing this family can say without
// moving anything. The shared reveal machine is untouched - suspense, won and out are the same
// three classes every nominee design answers to.

import { paletteById, type TemplateVariant } from '../../../model/wizard';
import { compFieldsFor } from '../shared';
import {
  NOMINEE_FIELDS,
  NOMINEE_RUNTIME_JS,
  P,
  defineRevealVariant,
  nomineeMarkup,
  revealStructureCss,
} from './shared';

export const nm04: TemplateVariant = defineRevealVariant(
  {
    id: 'nm04',
    category: 'reveal',
    name: 'Volt Nominees Reveal',
    styleTag: 'sport',
    description: 'A hard-edged finalist board where the winner takes the accent slab.',
    maxLines: 2,
    suggestedLines: [
      // This board is drawn for a PLAYER award rather than a play of the tournament, which is
      // why its type entry declares its own `samples` (docs/GRAPHIC_TYPES.md, the samples gate).
      { title: 'Category', sample: 'PLAYER OF THE FINAL' },
      { title: 'Kicker', sample: 'THE NOMINEES' },
    ],
    logo: 'none',
    animationPresets: ['comp-impact', 'comp-cascade', 'comp-rise'],
    defaultPalette: paletteById('volt'),
    defaultFontId: 'oswald',
    defaultZone: 'mid-center',
  },
  {
    name: 'Volt Nominees Reveal',
    description:
      'A sport finalist board with hard rows, a heavy category line, and an accent-filled ' +
      'winning state.',
    uicolor: '1',
  },
  (o) => ({
    html: nomineeMarkup(o),
    fields: compFieldsFor(NOMINEE_FIELDS, o),
    hasAccent: true,
    revealSteps: [{ name: 'Reveal', call: 'revealWinner', duration: 0.55 }],
    runtimeExtraJs: NOMINEE_RUNTIME_JS,
    css: `${revealStructureCss()}

/* The board reads as one solid object, not a translucent card: the sport family buys its
   legibility with weight rather than with blur. */
.${P}-box {
  background: linear-gradient(180deg, rgba(7,8,11,.9), rgba(3,4,6,.98));
}

/* The accent rule above the category. Centred origin because the preset grows it outwards
   from the middle of a full-frame board rather than sweeping in from one edge. */
.${P}-accent {
  height: var(--accent-weight);
  background: var(--accent);
  transform-origin: center;
}

/* The kicker is a filled tag rather than a coloured word - it has to survive over the
   gradient's lightest corner. Ink on the accent, never the accent itself. */
.${P}-kicker {
  display: inline-block;
  padding: calc(5px * var(--scale)) calc(14px * var(--scale));
  background: var(--accent);
  font-size: calc(20px * var(--scale) * var(--type-scale));
  font-weight: 700;
  letter-spacing: var(--label-tracking);
  text-transform: uppercase;
  color: var(--accent-ink);
}

/* The award category - the biggest words on screen until the winner lands. */
.${P}-title {
  font-size: calc(53px * var(--scale) * var(--type-scale));
  font-weight: var(--display-weight);
  line-height: 1;
  letter-spacing: var(--display-tracking);
  color: var(--text-color);
}

/* One finalist row. The min-width is a footprint floor: four rows of wildly different name
   lengths must still read as one column, not as a ragged list. */
.${P}-nominee {
  min-width: calc(540px * var(--scale));
  margin-top: calc(7px * var(--scale));
  padding: calc(12px * var(--scale)) calc(18px * var(--scale));
  background: rgba(255,255,255,.07);
  border-left: calc(5px * var(--scale)) solid rgba(255,255,255,.22);
}

.${P}-nominee-name {
  font-size: calc(44px * var(--scale) * var(--type-scale));
  font-weight: var(--display-weight);
  line-height: 1;
  text-transform: uppercase;
  color: var(--text-color);
}

/* The detail line carries the club, the map or the moment - a caption, so it sits at the
   category floor and takes the dim ink. */
.${P}-nominee-detail {
  font-size: calc(20px * var(--scale) * var(--type-scale));
  font-weight: 600;
  letter-spacing: var(--label-tracking);
  text-transform: uppercase;
  color: var(--text-dim);
}

/* ── The machine's three states, applied by class and never by a data update. ── */

/* Suspense dims the whole field so the reveal has somewhere to arrive from. */
.${P}-suspense .${P}-nominee {
  opacity: .45;
}

/* The winner FLIPS to the accent slab: the row itself becomes the announcement. */
.${P}-won {
  opacity: 1;
  background: var(--accent);
  border-left-color: var(--accent);
}

.${P}-won .${P}-nominee-name,
.${P}-won .${P}-nominee-detail {
  color: var(--accent-ink);
}

/* The rows that did not win stay legible - a nominee is still a credit. */
.${P}-out {
  opacity: .25;
}`,
  }),
);
