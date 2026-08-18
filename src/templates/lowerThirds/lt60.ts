// lt60 "Lowercase Quiet" - the strap with no capitals anywhere and no accent bar, where the
// entire hierarchy is carried by WEIGHT.
//
// Two measured absences meet here (docs/CATALOG_VARIETY.md §3, absences 2 and 3): 88.5% of the
// catalog shouts somewhere in uppercase, and five designs of 459 use any weight at or below 300.
// So there was no design a fashion, wellness, arts or design channel could take as its own. The
// answer is not a quieter version of an existing strap - it is a different hierarchy: the name
// is the LIGHTEST thing on the graphic and reads first anyway, because it is four times the size
// of the role beside it.
//
// The composition is a two-column grid rather than the category's usual stack, which is what
// keeps a 200-weight name from looking like a mistake: the role and the show sit in their own
// column behind a hairline, so the eye is given a printed structure to read the lightness
// against. `text-transform: lowercase` is on every line deliberately - a design about case
// cannot leave case to whatever the operator types.

import { paletteById, type TemplateVariant } from '../../model/wizard';
import { maskLine, maskLines } from '../shared/standard';
import { defineVariant } from './shared';

export const lt60: TemplateVariant = defineVariant(
  {
    id: 'lt60',
    category: 'lower-third',
    name: 'Lowercase Quiet',
    styleTag: 'minimal',
    description:
      'No capitals and no accent bar: a light name beside its role, divided by one hairline.',
    maxLines: 3,
    suggestedLines: [
      { title: 'Name', sample: 'ada lindqvist' },
      { title: 'Role', sample: 'host' },
      { title: 'Show', sample: 'the slow hour' },
    ],
    logo: 'none',
    animationPresets: [
      'fade',
      'line-reveal',
      'slide-up',
      'mask-wipe',
      'blur-in',
      'slide-left',
    ],
    defaultPalette: paletteById('ivory'),
    // IBM Plex Sans is the one bundled face that reaches down to weight 100, which is what
    // makes a 200-weight display line possible at all - the other sixteen bottom out at 400.
    defaultFontId: 'ibm-plex-sans',
    defaultZone: 'bottom-left',
  },
  {
    name: 'Lowercase Quiet',
    description:
      'A quiet strap with no capitals: the name set very light and large in the first column, ' +
      'the role and show set small and firm in the second, one hairline between them.',
    uicolor: '2',
  },
  (o) => ({
    html: `    <!-- Lowercase Quiet: name column, hairline, role column. No caps, no accent bar. -->
    <div class="lower-third-box">
${maskLines([
  maskLine('lower-third', o, 0, 'lower-third-quiet-name', '      '),
])}
      <!-- The second column: the role over the show, both small and firm. -->
      <div class="lower-third-aside">
${maskLines([
  maskLine('lower-third', o, 1, 'lower-third-role', '        '),
  maskLine('lower-third', o, 2, 'lower-third-show', '        '),
])}
      </div>
    </div>`,
    css: `/* Two columns, content-sized, with the divider drawn on the second one. A symmetric grid
   would pad a short name out to the divider and strand it; auto columns hug what is in them. */
.lower-third-box {
  display: grid;  /* the composition is a printed two-column structure, not a stack */
  grid-template-columns: auto auto;  /* each column takes exactly the width of its own content */
  align-items: stretch;  /* so the hairline runs the full height of the name beside it */
  column-gap: calc(30px * var(--scale));  /* the gutter between the name and its divider */
  min-width: calc(560px * var(--scale));  /* the broadcast strap floor - the void fills past the text */
  padding: calc(26px * var(--scale)) calc(32px * var(--scale));  /* generous, unhurried margins */
  background: var(--panel-bg);  /* the quiet ink surface the light type reads against */
  border-radius: var(--panel-radius);  /* the family's corner language */
  box-shadow: var(--panel-shadow);  /* one soft lift off the picture */
}

/* The name - the lightest weight in the catalog, and still the first thing read. */
.lower-third-quiet-name {
  min-width: 0;  /* a grid item refuses to shrink by default; this is what lets a long name wrap */
  max-width: calc(620px * var(--scale));  /* an extreme name wraps in its OWN column */
  font-size: calc(58px * var(--scale) * var(--type-scale));  /* display scale - size carries what weight gives up */
  font-weight: 200;  /* the design's whole argument: hierarchy without heaviness */
  line-height: 1.1;  /* light type needs a little more room between rows */
  letter-spacing: 0.005em;  /* light letterforms open very slightly so they do not close up */
  text-transform: lowercase;  /* a design about case never leaves case to the operator */
  color: var(--text-color);  /* primary text colour */
}

/* The second column - held off the name by a hairline, which is the only drawn mark here.
   The rule is STRUCTURAL rather than decorative, so it stays when the words beside it are
   cleared: on this design it plays the part an accent bar plays on every other strap. */
.lower-third-aside {
  display: flex;  /* so the words centre against the name, while the HAIRLINE stretches */
  flex-direction: column;  /* the role over the show */
  justify-content: center;  /* the pair sits on the name's centre line */
  min-width: 0;  /* the column may shrink rather than push the strap off frame */
  max-width: calc(320px * var(--scale));  /* a long role wraps inside its own column */
  padding-left: calc(30px * var(--scale));  /* air between the divider and the words */
  border-left: 1px solid color-mix(in srgb, var(--text-color) 22%, transparent);  /* the one hairline */
}

/* The role - small, firm, and in the accent: the design's single dose of colour. */
.lower-third-role {
  font-size: calc(23px * var(--scale) * var(--type-scale));  /* small, comfortably above the broadcast floor */
  font-weight: 600;  /* the weight contrast IS the hierarchy - 200 against 600 */
  line-height: 1.25;  /* a role may wrap to a second row */
  letter-spacing: 0.01em;  /* a touch of air at this size */
  text-transform: lowercase;  /* the whole graphic stays in lower case */
  color: var(--accent);  /* the accent appears once, on the word that explains the name */
}

/* The show - the same small measure, dropped to the secondary voice. */
.lower-third-show {
  margin-top: calc(6px * var(--scale));  /* the two aside lines read as one unit */
  font-size: calc(21px * var(--scale) * var(--type-scale));  /* the smallest type here, still above the floor */
  font-weight: 400;  /* conversational weight under the firm role */
  line-height: 1.3;  /* prose leading */
  text-transform: lowercase;  /* consistent with every other line */
  color: var(--text-dim);  /* secondary text colour */
}

/* Either aside line may be cleared without leaving a gap behind it. */
.lower-third-role:empty,
.lower-third-show:empty {
  display: none;  /* an empty field takes no space at all */
}`,
    // No .lower-third-accent element: this design's accent dose is the role's colour, and an
    // accent BAR would undo the point of a strap whose only drawn mark is one hairline.
    hasAccent: false,
  }),
);
