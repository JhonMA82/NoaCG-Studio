// The shared OPTIONAL logo slot for standard-contract designs. A variant that declares
// `logo: 'optional'` and does not hand-author its own slot gets this one injected at
// create when the user turns the logo on: a real SPX image field ("filelist") bound to an
// <img id="fN"> leading the box — the same recipe card03 hand-authors — so new designs
// support logos with zero per-design code. Designs with a bespoke slot (a badge, a docked
// square) keep their own markup; `designHasLogoSlot` keeps this helper away from them.

import type { ResolvedOptions } from '../../model/wizard';
import type { StandardDesign } from './standard';

/** Whether the design already carries its own logo slot (a filelist field or a
 *  .{prefix}-logo element) — the shared slot must never double-inject. */
export function designHasLogoSlot(design: StandardDesign, prefix: string): boolean {
  return (
    (design.extraFields ?? []).some((f) => f.ftype === 'filelist') ||
    design.html.includes(`${prefix}-logo`)
  );
}

/**
 * The WELL behind the mark, painted only when the design's own surface cannot show it.
 *
 * The neutrals are fixed rather than derived from the palette on purpose: the well exists
 * precisely because the palette's surface is the wrong tone, so deriving it from that palette is
 * how it ends up wrong again. Both clear WCAG's 3:1 non-text floor against a pure white or a
 * pure black mark with room to spare, which is what a knockout and a dark lockup actually are.
 *
 * Padding is the clear space the manual asks for, INSIDE the well - so the mark keeps its own
 * air rather than touching the edge of the thing drawn to hold it. Nothing here reaches the
 * picture: no radius, no crop, no filter, no uneven scale, which is what `assetIntegrity.ts`
 * refuses on a mark the user said to use as it is.
 */
function plateCss(prefix: string, o: ResolvedOptions): string {
  if (!o.logoPlate) return '';
  const fill = o.logoPlate === 'light' ? '#f2f4f7' : '#12161c';
  return `

/* The logo WELL: the mark's own reading surface, because the design's would have hidden it. */
.${prefix}-logo {
  box-sizing: content-box;         /* the padding is clear space, not part of the mark's size */
  padding: calc(10px * var(--scale));  /* clear space between the mark and the well's edge */
  background: ${fill};             /* ${o.logoPlate} well - fixed, never the palette's surface */
}`;
}

/**
 * Inject the shared logo slot into a design: the <img> as the first child of the
 * .{prefix}-box, its placeholder CSS, and the filelist field (id after every user field).
 * Returns the design untouched when the box wrapper can't be found — never a broken layout.
 *
 * TWO ARRANGEMENTS, decided by the CATEGORY (the prefix), never per design:
 *
 *   - LOWER THIRDS place the mark BESIDE the text - a leading column, vertically centred.
 *     The 2026-08-13 Pro brand round's blind review made this a standing rule: "lower thirds
 *     should stay vertically compact - do not place a logo above or below the lower third;
 *     prefer placing the logo beside the text/banner." The stacked band got that exact note
 *     on the hand-authored control itself.
 *   - Everything else (info cards, alerts, public info) keeps the stacked BAND above the
 *     text: a card is a vertical composition and a mark above its heading reads as a header,
 *     not as wasted height - the review rule was about straps, and widening it uninvited
 *     would redesign 70+ cards on a lower-third finding.
 */
export function applyLogoSlot(design: StandardDesign, prefix: string, o: ResolvedOptions): StandardDesign {
  const boxOpen = `<div class="${prefix}-box">`;
  const at = design.html.indexOf(boxOpen);
  if (at < 0) return design;

  const beside = prefix === 'lower-third';
  const logoField = `f${o.lines.length + o.extraFields.length + (design.extraFields?.length ?? 0)}`;
  const logoPath = o.logoAssetPath ?? '';

  const imgHtml =
    `\n      <!-- Logo (image field ${logoField}) — ${beside ? 'leads the box beside the text' : 'a band above the text'}. Empty = hidden. -->` +
    `\n      <img id="${logoField}" class="${prefix}-logo"${logoPath ? ` src="${logoPath}"` : ' style="display: none"'} alt="" />`;

  const insertAt = at + boxOpen.length;
  let html = design.html.slice(0, insertAt) + imgHtml + design.html.slice(insertAt);
  // The beside layout keys on `.has-image`, the class the shared runtime's setFieldValue
  // already toggles on the img's parent. Baking it in when a mark ships at create means the
  // FIRST frame is laid out correctly, before any update() runs - and an empty slot leaves
  // the markup and layout byte-identical to a design with no slot at all.
  if (beside && logoPath) {
    html = html.replace(boxOpen, `<div class="${prefix}-box has-image">`);
  }

  const shared = `  height: calc(64px * var(--scale));  /* the mark's height is what a viewer reads it by */
  width: auto;                     /* …and its width follows its own proportions */
  max-width: calc(260px * var(--scale));  /* the cap a very wide rail letterboxes inside */
  object-fit: contain;             /* show the whole logo, never crop a wide wordmark */`;

  /* Height/width/cap rationale, both arrangements: it was a 56px SQUARE until 2026-08-09, and
     measured that was false advertising - a square well holds a crest and reduces a 4:1
     wordmark to a 20px strip (benchmarks/lite/BRAND-AUDIT-2026-08-09.md). A fixed height with
     auto width reserves NO empty width when the mark is narrow. NO radius and NO crop:
     src/ai/assetIntegrity.ts refuses both on a picture the user said to use as-is. */
  const besideCss = `

/* The logo: a leading column BESIDE the text, vertically centred (hidden while empty).
   The grid engages only through .has-image - the class setFieldValue toggles on the box when
   the slot holds a file - so a design with an empty slot keeps its own layout untouched.
   The mark spans every row its column has, which is what centres it against the whole text
   stack whatever the design's line count. */
.${prefix}-box.has-image {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);  /* the mark's own width, then the text */
  column-gap: calc(20px * var(--scale));       /* clear space beside the mark */
  align-items: center;
  /* The mark's column must not come out of the TEXT's measure - the first cut of this rule
     wrapped identity lines that fit before the mark arrived (the audit's logo-costs-text),
     which is the mark charging the text for its own seat. Widen the cap by the column's
     worst case (the 260px mark cap + the gap) instead: 1080 = the 800px standard measure
     + 280. Fixed rather than derived, because an injected rule cannot read the design's own
     cap; the 1680px ceiling keeps the widest strap inside title-safe. */
  max-width: min(calc(1080px * var(--scale)), 1680px);
}
.${prefix}-box.has-image > *:not(.${prefix}-logo) {
  grid-column: 2;                  /* every text row keeps stacking in the second column */
}
.${prefix}-logo {
  grid-column: 1;
  grid-row: 1 / span 9;            /* span more rows than any design draws — centres the mark */
${shared}
}${plateCss(prefix, o)}`;

  const bandCss = `

/* The logo: a band leading the box, above the text (hidden while empty). */
.${prefix}-logo {
  display: block;                  /* its own row — the text starts below it */
${shared}
  margin-bottom: calc(20px * var(--scale));  /* clear space: a quarter of the mark's height */
}${plateCss(prefix, o)}`;

  const css = `${design.css}${beside ? besideCss : bandCss}`;

  return {
    ...design,
    html,
    css,
    extraFields: [
      ...(design.extraFields ?? []),
      {
        field: logoField,
        ftype: 'filelist',
        title: 'Logo',
        value: logoPath,
        assetfolder: './images/',
        extension: 'png',
      },
    ],
  };
}
