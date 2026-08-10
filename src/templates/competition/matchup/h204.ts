// h204 "Frost Compare" - the glass head-to-head board, sibling of lt08 Frosted Card. Each
// competitor and each stat row sits on a translucent surface, with rounded share bars and an
// accent ring on the highlighted side. Data, measured bars and state transitions are unchanged.

import { paletteById, type TemplateVariant } from '../../../model/wizard';
import { compFieldsFor } from '../shared';
import {
  H2H_FIELDS,
  H2H_RUNTIME_JS,
  P,
  defineMatchupVariant,
  h2hMarkup,
  h2hStructureCss,
} from './shared';

export const h204: TemplateVariant = defineMatchupVariant(
  {
    id: 'h204',
    category: 'matchup',
    name: 'Frost Compare Matchup',
    styleTag: 'glass',
    description: 'A frosted comparison board with glass rows and softly-rounded share bars.',
    maxLines: 3,
    suggestedLines: [
      { title: 'Side A', sample: 'TEAM LIQUID' },
      { title: 'Side B', sample: 'NAVI' },
      { title: 'Title', sample: 'HEAD TO HEAD' },
    ],
    logo: 'none',
    animationPresets: ['comp-cascade', 'comp-bloom', 'comp-rise'],
    defaultPalette: paletteById('frost'),
    defaultFontId: 'manrope',
    defaultZone: 'mid-center',
  },
  {
    name: 'Frost Compare Matchup',
    description:
      'The glass comparison board: frosted competitor cards, softly-keylined stat rows, ' +
      'rounded share bars, and a brighter accent-ringed side when the operator highlights it.',
    uicolor: '2',
  },
  (o) => ({
    html: h2hMarkup(o),
    fields: compFieldsFor(H2H_FIELDS, o),
    hasAccent: true,
    runtimeExtraJs: H2H_RUNTIME_JS,
    css: `${h2hStructureCss()}

/* The stage - a cool wash behind the glass comparison surfaces. */
.${P}-box {
  justify-content: flex-start;
  padding: 9% 6%;
  background: linear-gradient(160deg,
    rgba(14, 20, 30, 0.8) 0%,
    rgba(8, 12, 20, 0.92) 60%,
    rgba(6, 9, 15, 0.96) 100%);
}

/* The accent - a soft rounded rule under the title. */
.${P}-accent {
  height: var(--accent-weight);
  border-radius: 999px;
  background: linear-gradient(90deg,
    color-mix(in srgb, var(--accent) 18%, transparent),
    color-mix(in srgb, var(--accent) 90%, transparent) 50%,
    color-mix(in srgb, var(--accent) 18%, transparent));
  transform-origin: center;
}

/* The title carries the glass label voice. */
.${P}-event {
  font-family: var(--font-label);
  font-size: calc(25px * var(--scale) * var(--type-scale));
  font-weight: 700;
  letter-spacing: var(--label-tracking);
  text-transform: uppercase;
  color: var(--label-color);
}

/* Each competitor sits on a compact frosted card. */
.${P}-head-side {
  padding: calc(22px * var(--scale)) calc(26px * var(--scale));
  border-radius: var(--panel-radius);
  background: var(--panel-bg);
  backdrop-filter: var(--panel-blur);
  -webkit-backdrop-filter: var(--panel-blur);
  box-shadow: var(--panel-shadow), var(--panel-keyline);
}

.${P}-name {
  font-size: calc(45px * var(--scale) * var(--type-scale));
  font-weight: var(--display-weight);
  line-height: 1.06;
  letter-spacing: var(--display-tracking);
  color: var(--text-color);
}

/* Crest slots are glass plates until a file lands in them. */
.${P}-logo {
  border-radius: calc(18px * var(--scale));
  background: rgba(255, 255, 255, 0.1);
  padding: calc(10px * var(--scale));
}
.${P}-logo.has-image {
  background: transparent;
}

/* Each measured stat row sits on a quiet translucent tile. */
.${P}-row {
  padding: calc(12px * var(--scale)) calc(18px * var(--scale));
  border-radius: calc(14px * var(--scale));
  background: rgba(255, 255, 255, 0.09);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.13);
}

.${P}-row-value {
  font-size: calc(36px * var(--scale) * var(--type-scale));
  font-weight: var(--display-weight);
  line-height: 1;
  color: var(--text-dim);
}

.${P}-row-lead {
  color: var(--accent);
}

.${P}-row-label {
  font-size: calc(20px * var(--scale) * var(--type-scale));
  font-weight: 700;
  letter-spacing: var(--label-tracking);
  text-transform: uppercase;
  color: var(--text-dim);
}

/* Share bars are softly-rounded tracks inside the stat tile. */
.${P}-row-track {
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.12);
  overflow: hidden;
}
.${P}-row-fill {
  border-radius: 999px;
  background: var(--accent);
}
.${P}-row-track-b .${P}-row-fill {
  background: rgba(255, 255, 255, 0.62);
}

/* Highlighting dims the other side and rings the selected competitor card. */
.${P}-lead-a .${P}-head-side[data-side="B"],
.${P}-lead-b .${P}-head-side[data-side="A"] {
  opacity: 0.4;
  box-shadow: var(--panel-keyline);
}

.${P}-lead-a .${P}-head-side[data-side="A"],
.${P}-lead-b .${P}-head-side[data-side="B"] {
  background: rgba(255, 255, 255, 0.16);
  box-shadow: var(--panel-shadow), inset 0 0 0 calc(3px * var(--scale)) var(--accent);
}

.${P}-lead-a .${P}-row-a,
.${P}-lead-b .${P}-row-b {
  color: var(--accent);
}`,
  }),
);
