// aw04 "Clean Award" - the minimal award reveal, sibling of aw03 and the panel-light member of
// the family. A hairline holds the sealed category; when the envelope opens the subject arrives
// at full size with no panel flood behind it, which is how this family says "big" - by making
// room rather than by adding surface. The shared envelope machine is unchanged.

import { paletteById, type TemplateVariant } from '../../../model/wizard';
import { compFieldsFor } from '../shared';
import {
  AWARD_FIELDS,
  AWARD_RUNTIME_JS,
  P,
  awardMarkup,
  defineRevealVariant,
  heldEnvelopeCss,
  revealStructureCss,
} from './shared';

export const aw04: TemplateVariant = defineRevealVariant(
  {
    id: 'aw04',
    category: 'reveal',
    name: 'Clean Award Reveal',
    styleTag: 'minimal',
    description: 'A restrained envelope reveal: a hairline category gives way to the winning name.',
    maxLines: 3,
    suggestedLines: [
      { title: 'Kicker', sample: 'THE AWARD FOR' },
      { title: 'Category', sample: 'OUTSTANDING LIVE PRODUCTION' },
      { title: 'Subject', sample: 'NORTHLIGHT MEDIA' },
    ],
    logo: 'none',
    animationPresets: ['comp-rise', 'comp-bloom', 'comp-impact'],
    defaultPalette: paletteById('ivory'),
    defaultFontId: 'inter',
    defaultZone: 'mid-center',
  },
  {
    name: 'Clean Award Reveal',
    description:
      'A panel-light award reveal with a hairline category and a large unembellished winning name.',
    uicolor: '2',
  },
  (o) => ({
    html: awardMarkup(o),
    fields: compFieldsFor(AWARD_FIELDS, o),
    hasAccent: true,
    revealSteps: [{ name: 'Open Reveal', call: 'openEnvelope', duration: 0.7 }],
    runtimeExtraJs: AWARD_RUNTIME_JS,
    css: `${revealStructureCss()}

${heldEnvelopeCss()}

/* Barely a panel: a scrim that deepens downwards, enough to carry ivory type over live video
   without becoming a card the minimal family would never draw. */
.${P}-box {
  background: linear-gradient(180deg, rgba(6,8,12,.38), rgba(6,8,12,.72));
}

/* The hairline. Centred origin because the preset grows it outwards on a full-frame reveal,
   and because the celebration below widens this same rule rather than replacing it. */
.${P}-accent {
  height: var(--accent-weight);
  background: var(--accent);
  transform-origin: center;
}

.${P}-kicker {
  font-size: calc(20px * var(--scale) * var(--type-scale));
  font-weight: 700;
  letter-spacing: var(--label-tracking);
  text-transform: uppercase;
  color: var(--label-color);
}

/* The category, set in sentence case: this family does not shout the thing being awarded. */
.${P}-title {
  font-size: calc(48px * var(--scale) * var(--type-scale));
  font-weight: var(--display-weight);
  line-height: 1.12;
  letter-spacing: var(--display-tracking);
  color: var(--text-color);
}

/* An empty slot shows nothing at all here - a plate would be the panel this design refuses. */
.${P}-logo.has-image {
  background: transparent;
}

/* The winner. The one place this design is loud, and it buys that with SIZE alone. */
.${P}-subject {
  font-size: calc(94px * var(--scale) * var(--type-scale));
  font-weight: var(--display-weight);
  line-height: 1.02;
  letter-spacing: var(--display-tracking);
  color: var(--text-color);
}

.${P}-note {
  font-size: calc(20px * var(--scale) * var(--type-scale));
  font-weight: 600;
  letter-spacing: var(--label-tracking);
  text-transform: uppercase;
  color: var(--text-dim);
}

/* ── Celebrating: the machine's state after the envelope opens. ── */

/* The rule stretches under the name rather than a new element arriving - one moving part. */
.${P}-celebrating .${P}-accent {
  width: calc(760px * var(--scale));
}

.${P}-celebrating .${P}-subject {
  color: var(--accent);
}`,
  }),
);
