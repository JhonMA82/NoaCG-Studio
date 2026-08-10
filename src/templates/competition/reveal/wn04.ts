// wn04 "Clean Champion" - the minimal final-result card, sibling of lt01 Hairline. The
// champion and score sit on a soft scrim with one hairline between them; celebration changes
// the rule and type colour instead of flooding the frame. The result press remains unchanged.

import { paletteById, type TemplateVariant } from '../../../model/wizard';
import { compFieldsFor } from '../shared';
import {
  P,
  WINNER_FIELDS,
  WINNER_RUNTIME_JS,
  defineRevealVariant,
  heldResultCss,
  revealStructureCss,
  winnerMarkup,
} from './shared';

export const wn04: TemplateVariant = defineRevealVariant(
  {
    id: 'wn04',
    category: 'reveal',
    name: 'Clean Champion Reveal',
    styleTag: 'minimal',
    description: 'A quiet result card where a hairline separates the champion from the score.',
    maxLines: 3,
    suggestedLines: [
      { title: 'Kicker', sample: 'GRAND FINAL' },
      { title: 'Winner', sample: 'TEAM LIQUID' },
      { title: 'Result', sample: '3 — 1' },
    ],
    logo: 'none',
    animationPresets: ['comp-rise', 'comp-bloom', 'comp-impact'],
    defaultPalette: paletteById('ivory'),
    defaultFontId: 'inter',
    defaultZone: 'mid-center',
  },
  {
    name: 'Clean Champion Reveal',
    description:
      'The minimal final-result card: a soft scrim, the champion in clean display type, the ' +
      'score arriving below a hairline, and a restrained accent celebration.',
    uicolor: '7',
  },
  (o) => ({
    html: winnerMarkup(o),
    fields: compFieldsFor(WINNER_FIELDS, o),
    hasAccent: true,
    revealSteps: [{ name: 'Result Reveal', call: 'revealResult', duration: 0.5 }],
    runtimeExtraJs: WINNER_RUNTIME_JS,
    css: `${revealStructureCss()}

${heldResultCss()}

/* The stage - a soft scrim that leaves the winning picture visible. */
.${P}-box {
  background: linear-gradient(180deg,
    rgba(6, 8, 12, 0.46) 0%,
    rgba(6, 8, 12, 0.76) 100%);
}

/* The accent - one hairline between the identity and the result. */
.${P}-accent {
  height: var(--accent-weight);
  background: var(--accent);
  transform-origin: center;
}

/* The event label. */
.${P}-kicker {
  font-family: var(--font-label);
  font-size: calc(21px * var(--scale) * var(--type-scale));
  font-weight: 600;
  letter-spacing: var(--label-tracking);
  text-transform: uppercase;
  color: var(--label-color);
}

/* The champion - clean type with no panel or effect. */
.${P}-title {
  font-size: calc(88px * var(--scale) * var(--type-scale));
  font-weight: var(--display-weight);
  line-height: 1.04;
  letter-spacing: var(--display-tracking);
  color: var(--text-color);
}

/* The crest stays plateless so an empty slot leaves no mark. */
.${P}-logo {
  background: transparent;
}

/* The score arrives as type, not a filled result slab. */
.${P}-subject {
  font-size: calc(58px * var(--scale) * var(--type-scale));
  font-weight: var(--display-weight);
  line-height: 1;
  color: var(--accent);
  font-variant-numeric: tabular-nums;
  font-family: var(--font-numeric);
}

/* The beaten side and event note sit in the quiet label voice. */
.${P}-runner {
  font-size: calc(22px * var(--scale) * var(--type-scale));
  font-weight: 600;
  letter-spacing: var(--label-tracking);
  text-transform: uppercase;
  color: var(--text-dim);
}

.${P}-note {
  font-size: calc(20px * var(--scale) * var(--type-scale));
  font-weight: 600;
  letter-spacing: var(--label-tracking);
  text-transform: uppercase;
  color: var(--text-dim);
}

/* Celebration remains minimal: the champion and the hairline take the accent. */
.${P}-celebrating .${P}-title {
  color: var(--accent);
}

.${P}-celebrating .${P}-accent {
  width: calc(800px * var(--scale));
}`,
  }),
);
