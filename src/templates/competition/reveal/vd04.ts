// vd04 "Frost Verdict" - the glass ruling card, sibling of lt08 Frosted Card. The prompt and
// ruling share a frosted panel; the verdict mark sits in a rounded glass medallion and the
// result colours its accent ring. The type's one judged state and verdict field do not change.

import { paletteById, type TemplateVariant } from '../../../model/wizard';
import { compFieldsFor } from '../shared';
import {
  P,
  VERDICT_FIELDS,
  VERDICT_RUNTIME_JS,
  defineRevealVariant,
  revealStructureCss,
  verdictMarkup,
} from './shared';

export const vd04: TemplateVariant = defineRevealVariant(
  {
    id: 'vd04',
    category: 'reveal',
    name: 'Frost Verdict Reveal',
    styleTag: 'glass',
    description: 'A frosted ruling card with the verdict held in a softly-ringed medallion.',
    maxLines: 3,
    suggestedLines: [
      { title: 'Prompt', sample: 'IS THAT ANSWER CORRECT?' },
      { title: 'Answer', sample: 'THE RED PLANET IS MARS' },
      { title: 'Note', sample: 'CONFIRMED BY THE JUDGES' },
    ],
    logo: 'none',
    animationPresets: ['comp-bloom', 'comp-impact', 'comp-rise'],
    defaultPalette: paletteById('frost'),
    defaultFontId: 'manrope',
    defaultZone: 'mid-center',
  },
  {
    name: 'Frost Verdict Reveal',
    description:
      'The glass ruling card: a cool stage, the prompt on a frosted panel, and the verdict ' +
      'inside a rounded medallion whose ring takes the ruling colour.',
    uicolor: '2',
  },
  (o) => ({
    html: verdictMarkup(o),
    fields: compFieldsFor(VERDICT_FIELDS, o),
    hasAccent: true,
    runtimeExtraJs: VERDICT_RUNTIME_JS,
    css: `${revealStructureCss()}

/* The stage - a cool wash behind the frosted ruling surface. */
.${P}-box {
  background: linear-gradient(160deg,
    rgba(14, 20, 30, 0.8) 0%,
    rgba(8, 12, 20, 0.92) 60%,
    rgba(6, 9, 15, 0.96) 100%);
}

/* The prompt and ruling share one softly-rounded glass panel. */
.${P}-head,
.${P}-body {
  padding: calc(32px * var(--scale)) calc(50px * var(--scale));
  border-radius: var(--panel-radius);
  background: var(--panel-bg);
  backdrop-filter: var(--panel-blur);
  -webkit-backdrop-filter: var(--panel-blur);
  box-shadow: var(--panel-shadow), var(--panel-keyline);
}

.${P}-body {
  margin-top: calc(18px * var(--scale));
}

/* The accent - a rounded seam whose colour follows the ruling. */
.${P}-accent {
  height: var(--accent-weight);
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent) 55%, transparent);
  transform-origin: center;
}

/* The prompt label. */
.${P}-kicker {
  font-family: var(--font-label);
  font-size: calc(22px * var(--scale) * var(--type-scale));
  font-weight: 700;
  letter-spacing: var(--label-tracking);
  text-transform: uppercase;
  color: var(--label-color);
}

/* What is being ruled on. */
.${P}-title {
  font-size: calc(53px * var(--scale) * var(--type-scale));
  font-weight: var(--display-weight);
  line-height: 1.1;
  letter-spacing: var(--display-tracking);
  color: var(--text-color);
}

/* The mark rests in a softly-keylined glass medallion. */
.${P}-mark {
  display: flex;
  align-items: center;
  justify-content: center;
  width: calc(190px * var(--scale));
  height: calc(190px * var(--scale));
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.1);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.16);
  font-size: calc(132px * var(--scale) * var(--type-scale));
  font-weight: var(--display-weight);
  line-height: 1;
  color: var(--text-dim);
}

/* The ruling word is an accent pill with the family's opaque ink. */
.${P}-word {
  padding: calc(8px * var(--scale)) calc(24px * var(--scale));
  border-radius: 999px;
  background: var(--accent);
  color: var(--accent-ink);
  font-size: calc(26px * var(--scale) * var(--type-scale));
  font-weight: 700;
  letter-spacing: var(--label-tracking);
  text-transform: uppercase;
}

/* The supporting note. */
.${P}-note {
  font-size: calc(20px * var(--scale) * var(--type-scale));
  font-weight: 600;
  letter-spacing: var(--label-tracking);
  text-transform: uppercase;
  color: var(--text-dim);
}

/* Correct uses the project accent and rings the medallion. */
.${P}-correct .${P}-mark {
  color: var(--accent);
  background: rgba(255, 255, 255, 0.16);
  box-shadow: inset 0 0 0 calc(3px * var(--scale)) var(--accent);
}
.${P}-correct .${P}-accent {
  background: var(--accent);
}

/* Incorrect stays signal red whatever the project accent is. */
.${P}-incorrect .${P}-mark {
  color: #e63946;
  box-shadow: inset 0 0 0 calc(3px * var(--scale)) #e63946;
}
.${P}-incorrect .${P}-word,
.${P}-incorrect .${P}-accent {
  background: #e63946;
}
.${P}-incorrect .${P}-word {
  color: #ffffff;
}`,
  }),
);
