// pc04 "Clean Player" - the minimal competitor card, sibling of lt01 Hairline. The portrait
// stays plateless, identity sits beside one hairline, and the stats arrive as ruled columns.
// The Continue press and MVP state are the same as every other player-card design.

import { paletteById, type TemplateVariant } from '../../../model/wizard';
import { compFieldsFor } from '../shared';
import {
  PLAYER_FIELDS,
  PLAYER_RUNTIME_JS,
  P,
  defineMatchupVariant,
  playerMarkup,
  playerStructureCss,
} from './shared';

export const pc04: TemplateVariant = defineMatchupVariant(
  {
    id: 'pc04',
    category: 'matchup',
    name: 'Clean Player',
    styleTag: 'minimal',
    description: 'A panel-free competitor card with a hairline identity block and ruled stats.',
    maxLines: 3,
    suggestedLines: [
      { title: 'Name', sample: 'S1MPLE' },
      { title: 'Role / team', sample: 'AWPER · NAVI' },
      { title: 'Tagline', sample: 'PLAYER OF THE SERIES' },
    ],
    logo: 'none',
    animationPresets: ['comp-rise', 'comp-bloom', 'comp-impact'],
    defaultPalette: paletteById('ivory'),
    defaultFontId: 'inter',
    defaultZone: 'mid-center',
  },
  {
    name: 'Clean Player',
    description:
      'The minimal competitor card: a plateless portrait, identity beside a hairline, and ' +
      'stats revealed as quiet ruled columns on the Continue press.',
    uicolor: '7',
  },
  (o) => ({
    html: playerMarkup(o),
    fields: compFieldsFor(PLAYER_FIELDS, o),
    hasAccent: true,
    revealSteps: [{ name: 'Stats', call: 'revealStats', duration: 0.5 }],
    runtimeExtraJs: PLAYER_RUNTIME_JS,
    css: `${playerStructureCss()}

/* The stage - a restrained scrim that lets the portrait and live picture breathe. */
.${P}-box {
  padding: 0 9%;
  background: linear-gradient(180deg,
    rgba(6, 8, 12, 0.38) 0%,
    rgba(6, 8, 12, 0.7) 100%);
  align-items: flex-start;
}

/* The accent - one hairline down the identity block's reading edge. */
.${P}-accent {
  position: absolute;
  left: 8%;
  top: 28%;
  bottom: 28%;
  width: var(--accent-weight);
  background: var(--accent);
  transform-origin: left center;
}

/* The portrait has no plate; an empty slot leaves no visible box. */
.${P}-portrait {
  margin-left: calc(25px * var(--scale));
  background: transparent;
}

/* The tagline is set as small caps over a hairline, never a chip. */
.${P}-tagline {
  padding-bottom: calc(7px * var(--scale));
  border-bottom: var(--accent-weight) solid var(--accent);
  color: var(--accent);
  font-family: var(--font-label);
  font-size: calc(20px * var(--scale) * var(--type-scale));
  font-weight: 700;
  letter-spacing: var(--label-tracking);
  text-transform: uppercase;
}

/* The player name. */
.${P}-name {
  font-size: calc(78px * var(--scale) * var(--type-scale));
  font-weight: var(--display-weight);
  line-height: 1.04;
  letter-spacing: var(--display-tracking);
  color: var(--text-color);
}

/* The role and team line. */
.${P}-role {
  font-size: calc(22px * var(--scale) * var(--type-scale));
  font-weight: 600;
  letter-spacing: var(--label-tracking);
  text-transform: uppercase;
  color: var(--text-dim);
}

/* Each revealed stat is a ruled column rather than a tile. */
.${P}-stat {
  padding: calc(12px * var(--scale)) calc(22px * var(--scale));
  border-left: 1px solid rgba(255, 255, 255, 0.16);
}

.${P}-stat-value {
  font-size: calc(46px * var(--scale) * var(--type-scale));
  font-weight: var(--display-weight);
  line-height: 1;
  color: var(--accent);
  font-variant-numeric: tabular-nums;
  font-family: var(--font-numeric);
}

.${P}-stat-label {
  font-size: calc(20px * var(--scale) * var(--type-scale));
  font-weight: 600;
  letter-spacing: var(--label-tracking);
  text-transform: uppercase;
  color: var(--text-dim);
}

/* MVP remains quiet: the tagline fills and the portrait takes one accent rule. */
.${P}-mvp .${P}-tagline {
  padding: calc(6px * var(--scale)) calc(16px * var(--scale));
  border-bottom: 0;
  background: var(--accent);
  color: var(--accent-ink);
}

.${P}-mvp .${P}-portrait {
  box-shadow: inset var(--accent-weight) 0 0 var(--accent);
}`,
  }),
);
