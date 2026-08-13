// lt30 "Dateline" — the four-input editorial strap: name, role, organisation and a dateline
// (place, or place and time). The dateline is the line that makes it a news graphic rather than a
// name tag, so it gets the treatment a printed dateline gets: separated from the block above by a
// rule, set in tracked caps, in the accent colour.
//
// Lines three and four share the assembler's `-extra` class, so they are told apart by POSITION
// inside the text column — structural, and therefore safe under field renumbering.
//
// The optional mark sits BESIDE the block, between the rule and the words. A lower third is a
// horizontal format and its height is the scarce dimension: measured, a mark stacked above this
// block made the strap 29% taller, and the same measurement across the catalog put every
// stacking design between +26% and +83% while every design that sets its mark beside the text
// grew only in width. So the mark takes width, which a strap has, and never height, which it
// does not — and it is bounded to the text's own height so a tall crest cannot change the format.

import { paletteById, type TemplateVariant } from '../../model/wizard';
import { defineVariant, lineMasks } from './shared';

export const lt30: TemplateVariant = defineVariant(
  {
    id: 'lt30',
    category: 'lower-third',
    name: 'Dateline',
    styleTag: 'editorial',
    description: 'Name, role and organisation over a ruled dateline — the reporting strap.',
    maxLines: 4,
    suggestedLines: [
      { title: 'Name', sample: 'Alexandra Riva' },
      { title: 'Role', sample: 'Chief Correspondent' },
      { title: 'Organisation', sample: 'Northgate Review' },
      { title: 'Dateline', sample: 'Brussels · Live' },
    ],
    logo: 'optional',
    animationPresets: ['line-reveal', 'mask-wipe', 'fade', 'slide-up', 'slide-down'],
    defaultPalette: paletteById('vermilion'),
    defaultFontId: 'archivo',
    defaultZone: 'bottom-left',
  },
  {
    name: 'Dateline',
    description:
      'The reporting strap: a name and role, the organisation under them, and a ruled dateline ' +
      'closing the block in tracked accent caps. Built for steps mode — reveal the dateline on a ' +
      'Continue when the reporter throws to location. Sibling of lt25 Masthead.',
    uicolor: '2',
  },
  (o) => {
    // A real SPX image field ("filelist"): SPX writes the picked file's path into the <img>,
    // and an empty value hides it (setFieldValue), leaving the placeholder rule.
    const logoField = `f${o.lines.length + o.extraFields.length}`;
    const logoPath = o.logoAssetPath ?? '';
    // The mark sits OUTSIDE .lower-third-text, as its sibling: the dateline row is selected by
    // `:nth-child(4)` inside that column, and a mark added as its first child would renumber
    // every line and move the ruled treatment onto the organisation.
    const mark = o.logoEnabled
      ? `      <!-- The publisher mark (image field ${logoField}). Empty shows the placeholder rule. -->
      <div class="lower-third-markbox${logoPath ? ' has-image' : ''}">
        <div class="lower-third-markrule"></div>
        <img id="${logoField}" class="lower-third-logo"${logoPath ? ` src="${logoPath}"` : ' style="display: none"'} alt="" />
      </div>
`
      : '';

    return {
      html: `    <!-- Dateline: [tall rule] | [mark] | [name / role / organisation] over [ruled dateline]. -->
    <div class="lower-third-accent"></div>
    <div class="lower-third-box">
${mark}      <div class="lower-third-text">
${lineMasks(o, '        ')}
      </div>
    </div>`,

      extraFields: o.logoEnabled
      ? [
          {
            field: logoField,
            ftype: 'filelist' as const,
            title: 'Masthead',
            value: logoPath,
            assetfolder: './images/',
            extension: 'png',
          },
        ]
      : [],

      css: `/* The rule — one tall hairline gathering the whole block. */
.lower-third-accent {
  position: absolute;               /* pinned inside the positioned .lower-third root */
  left: 0;                          /* at the block's left edge */
  top: 0;                           /* the full height of the stack… */
  bottom: 0;                        /* …top to bottom */
  width: var(--accent-weight);      /* the family's printed-rule weight */
  background: var(--accent);        /* the one accent surface in the design */
  will-change: transform;           /* hint the browser: presets animate this rule */
}

/* The text block — no panel; the rule and the whitespace are the structure. */
.lower-third-box {
  ${o.logoEnabled ? `display: flex;                    /* mark and words side by side — never stacked */
  align-items: center;              /* the mark is centred against the whole block */
  gap: calc(30px * var(--scale));   /* the mark's clear space from the words */
  ` : ''}padding-left: calc(35px * var(--scale));  /* room for the rule plus a printed-margin gap */
}

${
      o.logoEnabled
        ? `/* The mark column — BESIDE the words, because height is the dimension a lower third
   cannot spend (see the header). Its width is fixed so a long name never squeezes it, and its
   height is capped below the text block's own so the artwork can never set the strap's height:
   the mark grows this graphic sideways or not at all. */
.lower-third-markbox {
  flex: none;                       /* fixed width; long names never squeeze the mark */
  display: flex;                    /* centre whatever is inside it… */
  align-items: center;              /* …vertically… */
  justify-content: center;          /* …and horizontally */
  width: calc(124px * var(--scale));   /* wide enough that a lockup still reads at width */
  max-height: calc(104px * var(--scale));  /* under a four-row block's height — see above */
}

/* The placeholder — a quiet rule where the mark will be, so an unset slot reads as
   "nothing here yet" rather than as a broken image. */
.lower-third-markrule {
  width: calc(78px * var(--scale));  /* about the width a lockup would take */
  height: calc(3px * var(--scale));  /* a hairline */
  background: var(--text-dim);      /* neutral — the accent belongs to the rule beside it */
  opacity: 0.5;                     /* a placeholder should read as absent, not as content */
}
.lower-third-markbox.has-image .lower-third-markrule {
  display: none;                    /* a picked mark replaces the placeholder */
}

/* The mark itself (the ${logoField} image field — hidden while empty). Both caps are
   explicit lengths rather than percentages: the browser then keeps the artwork's own aspect
   while honouring whichever cap binds, so a 13:1 rail and a portrait shield both land. NO
   plate, no tinted well: the mark is the mark, sitting on the graphic's own ground. */
.lower-third-logo {
  max-width: calc(124px * var(--scale));   /* the column's width — a wide lockup stops here */
  max-height: calc(104px * var(--scale));  /* …and a portrait mark here */
  object-fit: contain;              /* show the whole mark, never crop or distort it */
}

`
        : ''
    }
/* Name (f0) — the block's one heavy element. */
.lower-third-name {
  font-size: calc(60px * var(--scale) * var(--type-scale));  /* headline size (values are 1080p reference) */
  font-weight: var(--display-weight);  /* the family's display weight */
  line-height: 1.05;                /* big text sits tight */
  letter-spacing: var(--display-tracking);  /* the family's display tracking */
  color: var(--text-color);         /* primary text color */
}

/* Role (f1) — the second reading voice. */
.lower-third-title {
  font-size: calc(30px * var(--scale) * var(--type-scale));  /* ≈2:1 below the name — clear hierarchy */
  font-weight: 400;                 /* regular weight; contrast comes from the name */
  line-height: 1.3;                 /* secondary text gets room to breathe */
  color: var(--text-dim);           /* dimmed — never pure white twice */
  margin-top: calc(6px * var(--scale));  /* name + role read as one unit */
}

/* Organisation (f2) — still a reading line, one step quieter than the role. */
.lower-third-extra {
  font-size: calc(25px * var(--scale) * var(--type-scale));  /* below the role, above the dateline */
  font-weight: 400;                 /* regular weight — this line is not a label */
  line-height: 1.3;                 /* secondary text gets room to breathe */
  color: var(--text-dim);           /* dimmed — never pure white twice */
  margin-top: calc(4px * var(--scale));  /* sits close under the role: one credential unit */
}

/* Dateline (f3) — the fourth row changes VOICE: ruled off, tracked caps, accent colour.
   Selected by position, so it works whatever the fields end up numbered. */
.lower-third-text .lower-third-mask:nth-child(4) {
  margin-top: calc(19px * var(--scale));  /* air above the dateline */
  padding-top: calc(16px * var(--scale));  /* …and inside it, above the caps */
  border-top: 1px solid color-mix(in srgb, var(--text-color) 20%, transparent);  /* the printed divider */
}
.lower-third-text .lower-third-mask:nth-child(4) .lower-third-extra {
  font-family: var(--font-label);   /* the family's label face */
  font-size: calc(20px * var(--scale) * var(--type-scale));  /* the smallest voice in the block */
  font-weight: 600;                 /* small caps need weight to stay crisp */
  letter-spacing: var(--label-tracking);  /* the family's label tracking */
  text-transform: uppercase;        /* BRUSSELS · LIVE, whatever the operator types */
  color: var(--label-color);        /* the family's label colour (the accent) */
  margin-top: 0;                    /* the mask's padding already provides the gap */
}`,
      hasAccent: true,
    };
  },
);
