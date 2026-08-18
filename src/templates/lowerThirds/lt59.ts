// lt59 "Byline Serif" - the catalog's FIRST design set in a serif, and its first strap whose
// reading surface is paper rather than a dark panel over the picture.
//
// Both absences were measured, not guessed (docs/CATALOG_VARIETY.md §3, absences 1, 5 and 6):
// zero of 459 designs were set in a serif though two serifs ship bundled and paired for
// numerals, every design was drawn for light text on dark, and seven used any printed texture.
// This one is the byline off a newspaper page - a masthead rule over a section kicker, the
// writer's name in Playfair Display, and the publication set across a folio rule beside it,
// printed on stock rather than floating on glass.
//
// The paper is opaque by construction and the type is near-black, so this strap does NOT depend
// on what is behind it: the contrast is between the ink and the panel, both of which the palette
// owns. That is the difference between a light PALETTE (which 148 designs cannot honour, because
// they have no reading surface to repaint) and a light DESIGN, which draws one.
//
// The two-column folio is what stops it being lt26 in a serif. A newspaper does not stack a
// byline: it sets the writer on the left of the folio rule and the title on the right, and that
// horizontal split is the structure a reader recognises before they read a word of it.

import { paletteById, type TemplateVariant } from '../../model/wizard';
import { maskLine, maskLines } from '../shared/standard';
import { defineVariant } from './shared';

export const lt59: TemplateVariant = defineVariant(
  {
    id: 'lt59',
    category: 'lower-third',
    name: 'Byline Serif',
    styleTag: 'editorial',
    description:
      'A printed byline on paper: a masthead rule, a section kicker, and the name in a display serif beside its folio.',
    maxLines: 4,
    suggestedLines: [
      { title: 'Section', sample: 'CULTURE' },
      { title: 'Name', sample: 'Eleanor Whitfield' },
      { title: 'Role', sample: 'Arts Correspondent' },
      { title: 'Publication', sample: 'The Evening Review' },
    ],
    logo: 'none',
    animationPresets: [
      'line-reveal',
      'mask-wipe',
      'fade',
      'slide-up',
      'slide-left',
      'blur-in',
    ],
    // Broadsheet, not Ivory: this design's surface IS the palette's paper. Swapping it for a
    // dark palette repaints the panel and the ink together, so the strap stays readable - which
    // is the whole reason a light package has to be a design and not a palette bolted on.
    defaultPalette: paletteById('broadsheet'),
    defaultFontId: 'playfair-display',
    defaultZone: 'bottom-left',
  },
  {
    name: 'Byline Serif',
    description:
      'The newspaper byline as a lower third: a printed rule across the top of a paper panel, ' +
      'a wide-tracked section kicker, then the name and role on the left of a folio rule with ' +
      'the publication set on its right.',
    uicolor: '4',
  },
  (o) => ({
    html: `    <!-- Byline Serif: masthead rule / section, then the byline beside its folio. -->
    <div class="lower-third-box">
      <!-- The masthead rule. Editorial structure is a RULE, not a chip - it draws first. -->
      <div class="lower-third-accent"></div>
      <!-- The section kicker, in its own full-width row above the folio split. -->
      <div class="lower-third-head">
${maskLines([maskLine('lower-third', o, 0, 'lower-third-section', '        ')])}
      </div>
      <!-- The byline column: who is speaking and what they do. -->
      <div class="lower-third-byline">
${maskLines([
  maskLine('lower-third', o, 1, 'lower-third-writer', '        '),
  maskLine('lower-third', o, 2, 'lower-third-role', '        '),
])}
      </div>
      <!-- The folio column: the masthead the byline belongs to, across a printed rule. -->
      <div class="lower-third-folio">
${maskLines([maskLine('lower-third', o, 3, 'lower-third-publication', '        ')])}
      </div>
    </div>`,
    css: `/* The paper stock, laid out as a printed folio: the kicker and its rule run the full
   measure, then the byline and the publication split the line below them. Opaque by
   construction, so the ink reads against the panel and never against the picture. */
.lower-third-box {
  display: grid;  /* the folio is a two-column structure, not a stack */
  grid-template-columns: auto auto;  /* each column takes exactly the width of its own content */
  align-items: stretch;  /* so the folio rule runs the full height of the byline beside it */
  min-width: calc(560px * var(--scale));  /* the broadcast strap floor - the void fills past the text */
  padding: calc(24px * var(--scale)) calc(34px * var(--scale)) calc(26px * var(--scale));  /* printed-page margins */
  background-color: var(--panel-bg);  /* the palette's paper - repaints with the palette */
  background-image: repeating-linear-gradient(0deg, color-mix(in srgb, var(--text-color) 4%, transparent) 0 1px, transparent 1px calc(4px * var(--scale)));  /* the print register: a faint ruled texture, the way stock takes ink */
  border-radius: var(--panel-radius);  /* the family's corner language (editorial: square) */
  box-shadow: var(--panel-shadow);  /* one soft lift off the picture */
}

/* The masthead rule - full width of the panel, drawn before anything is read. */
.lower-third-accent {
  grid-column: 1 / -1;  /* the rule runs across both columns */
  width: 100%;  /* spans the whole printed measure */
  height: var(--accent-weight);  /* the family's printed-rule weight */
  margin-bottom: calc(14px * var(--scale));  /* clear air under the rule before the kicker */
  background: var(--accent);  /* the one accent dose in the design */
  transform-origin: left center;  /* the reveal draws the rule from the spine outward */
  will-change: transform;  /* hints the exact property the entrance animates */
}

/* The kicker's own row. It is a wrapper rather than the span itself because the grid ITEMS are
   the mask divs, not the #fN spans inside them - a span cannot claim a column it is not in. */
.lower-third-head {
  grid-column: 1 / -1;  /* the kicker titles the whole folio, not one column of it */
}

/* The section kicker - wide-tracked caps in the accent, the masthead's own voice. */
.lower-third-section {
  font-size: calc(21px * var(--scale) * var(--type-scale));  /* label scale, above the broadcast floor */
  font-weight: 600;  /* firm enough for small caps to carry at this size */
  line-height: 1.2;  /* one tight label row */
  letter-spacing: var(--label-tracking);  /* the family's masthead tracking */
  text-transform: uppercase;  /* a section is set in caps whatever the operator types */
  color: var(--label-color);  /* the family's label colour - editorial accents its kickers */
}

/* The byline column. min-width:0 is load-bearing - a grid item refuses to shrink by default,
   which is exactly what pushes a long name past the paper's edge. */
.lower-third-byline {
  min-width: 0;  /* lets a long name wrap instead of widening the strap */
  max-width: calc(560px * var(--scale));  /* an extreme name wraps in its OWN column */
  margin-top: calc(10px * var(--scale));  /* separates the byline from the kicker above it */
}

/* The name - the design's whole reason to exist, and the catalog's first serif display line. */
.lower-third-writer {
  font-size: calc(56px * var(--scale) * var(--type-scale));  /* display scale for a two-line-capable name */
  font-weight: var(--display-weight);  /* editorial sets a name rather than shouting it */
  line-height: 1.06;  /* big serif type sits tight */
  letter-spacing: var(--display-tracking);  /* large display type tightens slightly */
  color: var(--text-color);  /* the ink */
}

/* The role - what the byline says under the name in print. */
.lower-third-role {
  margin-top: calc(8px * var(--scale));  /* a printed line's worth of air */
  font-size: calc(26px * var(--scale) * var(--type-scale));  /* secondary voice, comfortably above the floor */
  font-weight: 400;  /* the reading weight */
  line-height: 1.3;  /* prose leading - this line is read, not scanned */
  color: var(--text-dim);  /* secondary ink */
}

/* The folio - the publication, set across the printed rule that divides the two columns. */
.lower-third-folio {
  display: flex;  /* so the publication centres against the byline, while the RULE stretches */
  flex-direction: column;  /* one line, but it may wrap to two */
  justify-content: center;  /* the masthead sits on the byline block's centre line */
  min-width: 0;  /* the folio may shrink rather than push the strap off frame */
  max-width: calc(300px * var(--scale));  /* a long masthead wraps inside its own column */
  margin-top: calc(10px * var(--scale));  /* the two columns start on the same line */
  margin-left: calc(30px * var(--scale));  /* the gutter between the byline and the rule */
  padding-left: calc(30px * var(--scale));  /* air between the rule and the words */
  border-left: 1px solid color-mix(in srgb, var(--text-color) 26%, transparent);  /* the folio rule */
}

/* The publication - the smallest voice, set firm because a masthead is a name. */
.lower-third-publication {
  font-size: calc(22px * var(--scale) * var(--type-scale));  /* the smallest type here, still above the floor */
  font-weight: 500;  /* medium keeps a small masthead crisp */
  line-height: 1.3;  /* may wrap to a second row */
  letter-spacing: 0.08em;  /* small type needs a little air */
  color: var(--text-color);  /* the masthead is ink, not a whisper */
}

/* Any supporting line may be cleared without leaving a hole behind it. */
.lower-third-section:empty,
.lower-third-role:empty,
.lower-third-publication:empty {
  display: none;  /* an empty field takes no space at all */
}`,
    hasAccent: true,
  }),
);
