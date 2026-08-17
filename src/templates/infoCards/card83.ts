// card83 "Stacked Words" - the opener where the type IS the graphic: three words locked into one
// block at 150, 240 and 200px, with the subtitle set VERTICALLY down the spine beside them.
//
// This one is aimed at two absences at once, and they are the two the catalog had least of
// (docs/CATALOG_VARIETY.md §3):
//   - absence 8, type as the composition. 16 designs of 459 go over 110px and none of them makes
//     the words the whole picture; here there is no panel furniture at all beyond one hairline,
//     and the three words are the layout.
//   - absence 9, vertical or rotated type. `writing-mode` was used by ZERO designs. The spine
//     label is the obvious broadcast use for it - a book spine, a poster margin, a film title
//     card - and it also solves a real problem, which is where a subtitle goes when the words
//     have taken the whole frame.
//
// The words are three FIELDS rather than one, because a stacked composition is set line by line:
// an operator typing "THE LONG NIGHT" into one field would get whatever the wrap decided, and
// the whole point is that the author chooses the break.

import { paletteById, type TemplateVariant } from '../../model/wizard';
import { maskLine, maskLines } from '../shared/standard';
import { defineCardVariant } from './shared';

export const card83: TemplateVariant = defineCardVariant(
  {
    id: 'card83',
    category: 'info-card',
    name: 'Stacked Words',
    styleTag: 'editorial',
    description:
      'A type-only opener: three words locked into one block, with the subtitle set vertically down the spine.',
    maxLines: 4,
    suggestedLines: [
      { title: 'Word 1', sample: 'THE' },
      { title: 'Word 2', sample: 'LONG' },
      { title: 'Word 3', sample: 'NIGHT' },
      { title: 'Spine', sample: 'A DOCUMENTARY IN FOUR PARTS' },
    ],
    logo: 'none',
    animationPresets: [
      'line-reveal',
      'mask-wipe',
      'slide-up',
      'fade',
      'blur-in',
      'slide-left',
    ],
    defaultPalette: paletteById('vermilion'),
    defaultFontId: 'anton',
    defaultZone: 'mid-center',
  },
  {
    name: 'Stacked Words',
    description:
      'A title opener built entirely from type: three words stacked at different sizes with the ' +
      'middle one in the accent, a hairline spine down the left edge, and the subtitle set ' +
      'vertically along it.',
    uicolor: '4',
  },
  (o) => ({
    html: `    <!-- Stacked Words: the vertical spine, then the three words that ARE the composition. -->
    <div class="info-card-box">
      <!-- The spine rail. It is a wrapper rather than the span itself because the grid ITEM is
           the mask div, and a rotated line needs a box it can be centred inside. -->
      <div class="info-card-rail">
${maskLines([maskLine('info-card', o, 3, 'info-card-spine', '        ')])}
      </div>
      <!-- The word stack. Three fields, because the author chooses where the line breaks. -->
      <div class="info-card-stack">
${maskLines([
  maskLine('info-card', o, 0, 'info-card-word-a', '        '),
  maskLine('info-card', o, 1, 'info-card-word-b', '        '),
  maskLine('info-card', o, 2, 'info-card-word-c', '        '),
])}
      </div>
    </div>`,
    css: `/* No panel furniture: an ink surface, a spine, and the words. The two columns are the
   spine and the stack, and the spine's column is sized by the rotated text inside it. */
.info-card-box {
  display: grid;  /* the spine and the word stack are columns */
  grid-template-columns: auto minmax(0, 1fr);  /* the spine hugs its rotated line; the words take the rest */
  align-items: stretch;  /* the spine runs the full height of the stack beside it */
  column-gap: calc(34px * var(--scale));  /* the margin between the spine and the first letter */
  /* The panel hugs the block. A fixed measure was the first draft and it was wrong: the words
     ARE the composition, so a panel wider than them reads as an empty half-frame rather than
     as a poster. The cap is what a very long word is allowed to grow to. */
  width: fit-content;  /* the ink surface is exactly as big as the words on it */
  max-width: calc(1460px * var(--scale));  /* overrides the category cap: a long word may run this wide */
  padding: calc(46px * var(--scale)) calc(56px * var(--scale));  /* the printed margin around the block */
  text-align: left;  /* the composition is asymmetric - the spine is on one edge, so the words hang off it */
  background: var(--panel-bg);  /* the flat printed ink surface - editorial never uses a chip */
  border-radius: var(--panel-radius);  /* the family's corner language (editorial: square) */
  box-shadow: var(--panel-shadow);  /* one soft lift off the picture */
}

/* The spine rail - the drawn edge of the card. It stretches to the words' own height, and the
   rotated line is centred in it; if the line is LONGER than the words it sets the height
   instead, which is why nothing here is a fixed height (an invisible fixed box is how a rail
   ends up clipping its own text). */
.info-card-rail {
  display: flex;  /* so the rotated line can be centred against the word stack */
  align-items: center;  /* the spine label sits on the stack's centre line */
  padding-left: calc(20px * var(--scale));  /* air between the hairline and the letters */
  border-left: 1px solid color-mix(in srgb, var(--text-color) 30%, transparent);  /* the spine's own rule */
}

/* The spine. writing-mode turns the line on its side and the 180 degree rotation makes it
   read bottom-to-top, which is the direction a printed spine is set in. */
.info-card-mask > .info-card-spine {
  display: block;  /* a rotated line needs a block box to take a height */
  writing-mode: vertical-rl;  /* the line is set down the edge rather than across the card */
  transform: rotate(180deg);  /* so it reads bottom-to-top, the way a spine is printed */
  font-size: calc(24px * var(--scale) * var(--type-scale));  /* label scale, above the broadcast floor */
  font-weight: 400;  /* Anton ships one weight; tracking does the label work */
  letter-spacing: var(--label-tracking);  /* the family's wide masthead tracking */
  text-transform: uppercase;  /* a spine label is set in caps */
  text-wrap: initial;  /* balanced wrapping means nothing on a single vertical line */
  color: var(--label-color);  /* the family's label colour - editorial accents its kickers */
}

/* The word stack. Nothing separates the rows: the tight leading is what locks the three
   words into one printed block instead of three lines of text. */
.info-card-stack {
  min-width: 0;  /* a grid item refuses to shrink by default; this is what lets a long word wrap */
  align-self: center;  /* the block sits on the spine's centre line */
}

/* The three words. Different sizes, one baseline grid, no space between them. */
.info-card-word-a,
.info-card-word-b,
.info-card-word-c {
  line-height: 0.86;  /* the words lock together as one block, not as three rows */
  letter-spacing: -0.02em;  /* poster-scale type closes up */
  text-transform: uppercase;  /* the opener is set in caps whatever the operator types */
  font-weight: 400;  /* Anton's single weight - size alone carries the hierarchy here */
}

/* The opening word - the smallest of the three, so the block reads from a quiet start. */
.info-card-word-a {
  font-size: calc(150px * var(--scale) * var(--type-scale));  /* well past the catalog's usual ceiling */
  color: var(--text-dim);  /* the quiet start: secondary ink */
}

/* The middle word carries the accent, and it is the largest thing on the card. */
.info-card-word-b {
  font-size: calc(240px * var(--scale) * var(--type-scale));  /* the composition's peak */
  color: var(--accent);  /* the one accent dose, spent on the word that matters */
}

/* The closing word settles back to ink. */
.info-card-word-c {
  font-size: calc(200px * var(--scale) * var(--type-scale));  /* between the other two - the block steps down */
  color: var(--text-color);  /* primary text colour */
}

/* Any word may be cleared - a two-word title is a shorter block, not a hole. */
.info-card-word-a:empty,
.info-card-word-b:empty,
.info-card-word-c:empty,
.info-card-spine:empty {
  display: none;  /* an empty field takes no space at all */
}`,
    hasAccent: false,
  }),
);
