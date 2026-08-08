// lt58 'Clean Call' - the MINIMAL call-to-action strap. The ask stays direct, but the
// treatment defers to the picture: a hairline, a small action label, and two clear text lines.

import { paletteById, type TemplateVariant } from '../../model/wizard';
import { maskLine, maskLines } from '../shared/standard';
import { defineVariant } from './shared';

export const lt58: TemplateVariant = defineVariant(
  {
    id: 'lt58',
    category: 'lower-third',
    name: 'Clean Call',
    styleTag: 'minimal',
    description:
      'A quiet call-to-action: a hairline label, the target, and one reason line.',
    maxLines: 3,
    suggestedLines: [
      { title: 'Action', sample: 'Join us' },
      { title: 'Target', sample: 'noacg.studio/community' },
      { title: 'Detail', sample: 'Free templates and production notes' },
    ],
    logo: 'none',
    animationPresets: [
      'line-reveal',
      'slide-up',
      'fade',
      'mask-wipe',
      'slide-left',
      'blur-in',
    ],
    defaultPalette: paletteById('ivory'),
    defaultFontId: 'inter',
    defaultZone: 'bottom-left',
  },
  {
    name: 'Clean Call',
    description:
      'A minimal call-to-action led by a fine accent rule, with a tracked action label over the target and one supporting line.',
    uicolor: '2',
  },
  (o) => ({
    html: `    <!-- Clean Call: hairline / action label / target / detail. -->
    <div class="lower-third-box">
      <div class="lower-third-accent"></div>
${maskLines([
  maskLine('lower-third', o, 0, 'lower-third-action', '      '),
  maskLine('lower-third', o, 1, 'lower-third-target', '      '),
  maskLine('lower-third', o, 2, 'lower-third-detail', '      '),
])}
    </div>`,
    css: `/* A soft scrim protects the copy without turning the strap into a panel. */
.lower-third-box {
  min-width: calc(470px * var(--scale));  /* reserves the footprint needed by doubled-text stress */
  padding: calc(20px * var(--scale)) calc(28px * var(--scale));  /* gives content broadcast-safe breathing room */
  background: linear-gradient(90deg, rgba(7, 9, 13, 0.74), rgba(7, 9, 13, 0.2));  /* provides the family surface or contrast this element needs */
}

/* The one structural mark: a family-weight hairline. */
.lower-third-accent {
  width: calc(82px * var(--scale));  /* fixes the authored horizontal footprint */
  height: var(--accent-weight);  /* fixes the authored vertical footprint */
  margin-bottom: calc(12px * var(--scale));  /* preserves the authored hierarchy and fixed broadcast footprint */
  background: var(--accent);  /* provides the family surface or contrast this element needs */
  transform-origin: left center;  /* makes the preset reveal grow from the structural edge */
  will-change: transform;  /* hints the exact property the entrance animates */
}

/* This rule preserves the family hierarchy and the graphic's stable broadcast footprint. */
.lower-third-action {
  font-size: calc(20px * var(--scale) * var(--type-scale));  /* sets the hierarchy while staying above the broadcast floor */
  font-weight: 700;  /* separates this voice without introducing another typeface */
  line-height: 1.2;  /* keeps wrapped copy compact but readable */
  letter-spacing: var(--label-tracking);  /* uses tracking to reinforce the family voice */
  text-transform: uppercase;  /* normalizes the label register regardless of input case */
  color: var(--label-color);  /* assigns the intended hierarchy and contrast role */
}

/* The primary message carries the strongest scale because it must read first at a glance. */
.lower-third-target {
  margin-top: calc(5px * var(--scale));  /* separates this voice from the one above it */
  font-size: calc(40px * var(--scale) * var(--type-scale));  /* sets the hierarchy while staying above the broadcast floor */
  font-weight: var(--display-weight);  /* separates this voice without introducing another typeface */
  line-height: 1.12;  /* keeps wrapped copy compact but readable */
  letter-spacing: var(--display-tracking);  /* uses tracking to reinforce the family voice */
  color: var(--text-color);  /* assigns the intended hierarchy and contrast role */
}

/* The supporting line stays secondary but above the broadcast readability floor. */
.lower-third-detail {
  margin-top: calc(7px * var(--scale));  /* separates this voice from the one above it */
  font-size: calc(21px * var(--scale) * var(--type-scale));  /* sets the hierarchy while staying above the broadcast floor */
  font-weight: 400;  /* separates this voice without introducing another typeface */
  line-height: 1.3;  /* keeps wrapped copy compact but readable */
  color: var(--text-dim);  /* assigns the intended hierarchy and contrast role */
}`,
    hasAccent: true,
  }),
);
