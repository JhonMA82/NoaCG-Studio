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
 * ── A STRAP SPENDS WIDTH, NEVER HEIGHT ────────────────────────────────────────────────
 *
 * The shared slot leads the box, so the mark takes its own ROW and the text starts below it.
 * On a card that is right - a card is a block and a mark above its heading is ordinary. On a
 * LOWER THIRD it is wrong, and measurably so: with a mark, `lt02` grew 83% taller, `lt25` 74%,
 * `lt15` 67%, `lt05` 63%, `lt11` 57% and `lt32` 36%, while every design that sets its mark
 * beside the words (lt41, lt49, ls12, ls17, ls29) grew only in width. A lower third is a
 * horizontal format; height is the one dimension it cannot spend, and turning a strap into a
 * block is the same mistake the Pro harness measured on its own concepts.
 *
 * So for straps only, the box becomes a two-column grid: the mark in column one spanning every
 * row, everything else the design already emits stacked in column two, in source order.
 *
 * GRID rather than flex, and column assignment by rule rather than by wrapping the design's
 * content, because this helper serves every 'optional'-logo design in the category and cannot
 * know any one of their box layouts. Flex would make each existing child a column of its own;
 * wrapping them would mean finding the box's matching close tag by string surgery. Auto-placement
 * alone would drop the second child beside the mark and the third UNDER it - hence the explicit
 * span and the `:not()` rule, which are what make this safe for a design this file has never
 * seen. The mark also stays INSIDE the box on purpose: the presets animate `.{prefix}-box`, so a
 * mark placed beside the box as its sibling would sit still while the strap moved.
 */
function sideBySideCss(prefix: string): string {
  if (prefix !== 'lower-third') return '';
  return `

/* The mark sits BESIDE the words, never above them (see the note in shared/logoSlot.ts). */
.${prefix}-box {
  display: grid;                   /* two columns: the mark, then everything the design draws */
  grid-template-columns: auto 1fr; /* the mark takes only the width its own shape needs */
  align-items: center;             /* the mark is centred against the whole stack */
  column-gap: calc(26px * var(--scale));  /* the mark's clear space from the words */
}
.${prefix}-box > .${prefix}-logo {
  grid-column: 1;                  /* the mark's own column… */
  grid-row: 1 / -1;                /* …spanning every row the design emits */
}
.${prefix}-box > *:not(.${prefix}-logo) {
  grid-column: 2;                  /* everything else stacks beside it, in source order */
}`;
}

/**
 * The index of the `</div>` that closes the box opened at `from`, or -1 when the markup does not
 * resolve - in which case the caller leaves the design untouched rather than guessing.
 *
 * A depth counter over `<div`/`</div>`, with HTML COMMENTS skipped: every design in this category
 * comments its own structure, and a comment that mentions a div would otherwise close the box
 * early and put the mark in the middle of the markup.
 */
function boxCloseIndex(html: string, from: number): number {
  let depth = 0;
  for (let i = from; i < html.length; i += 1) {
    if (html.startsWith('<!--', i)) {
      const end = html.indexOf('-->', i);
      if (end < 0) return -1;
      i = end + 2;
    } else if (html.startsWith('</div>', i)) {
      depth -= 1;
      if (depth === 0) return i;
      i += 5;
    } else if (html.startsWith('<div', i)) {
      depth += 1;
      i += 3;
    }
  }
  return -1;
}

/**
 * The strap's own sizing for the mark, overriding the leading-row rule above it - which is why
 * it is emitted AFTER that rule rather than beside the grid rules: same selector, same
 * specificity, so order is what decides.
 *
 * The margin below the mark goes (it was clear space for a row that no longer exists; the grid's
 * column gap is the clear space now), and the fixed height becomes a CAP. A fixed height would
 * hand a portrait crest the power to set the strap's height again through its own aspect - the
 * exact failure this whole change is about, arriving through the back door.
 */
function sideBySideSizeCss(prefix: string): string {
  if (prefix !== 'lower-third') return '';
  return `

/* On a strap the mark is bounded, never leading: it may take width, and only as much height as
   the words beside it already occupy. */
.${prefix}-logo {
  height: auto;                    /* the artwork no longer dictates a row height */
  max-height: calc(68px * var(--scale));  /* …and can never out-grow the two lines beside it */
  max-width: calc(190px * var(--scale));  /* a wide rail letterboxes inside this */
  margin-bottom: 0;                /* the grid's column gap is the clear space now */
}`;
}

/**
 * Inject the shared logo slot into a design: the <img> as the first child of the
 * .{prefix}-box, its placeholder CSS, and the filelist field (id after every user field).
 * Returns the design untouched when the box wrapper can't be found — never a broken layout.
 */
export function applyLogoSlot(design: StandardDesign, prefix: string, o: ResolvedOptions): StandardDesign {
  const boxOpen = `<div class="${prefix}-box">`;
  const at = design.html.indexOf(boxOpen);
  if (at < 0) return design;

  const logoField = `f${o.lines.length + o.extraFields.length + (design.extraFields?.length ?? 0)}`;
  const logoPath = o.logoAssetPath ?? '';

  const imgHtml =
    `\n      <!-- Logo (image field ${logoField}) — leads the box as a rounded square. Empty = hidden. -->` +
    `\n      <img id="${logoField}" class="${prefix}-logo"${logoPath ? ` src="${logoPath}"` : ' style="display: none"'} alt="" />`;

  // WHERE the mark goes in the markup is not a formatting choice, and on a strap it is not the
  // front. A design addresses its own children positionally - lt02 drops every line after the
  // first below its underline with `.lower-third-mask:nth-child(n + 2)` - so an <img> inserted
  // as the FIRST child renumbers all of them and the name lands under the rule. Measured: that
  // is exactly what happened, and nothing but the frame showed it.
  //
  // As the LAST child it renumbers nothing, because every existing child keeps its index. The
  // grid below then places it in the first column regardless of source order, which is what grid
  // placement is for.
  const insertAt = prefix === 'lower-third' ? boxCloseIndex(design.html, at) : at + boxOpen.length;
  const html = insertAt < 0
    ? design.html
    : design.html.slice(0, insertAt) + imgHtml + design.html.slice(insertAt);
  if (insertAt < 0) return design;

  const css = `${design.css}${sideBySideCss(prefix)}

/* The logo: a band leading the box, above the text (hidden while empty). Sized by HEIGHT with
   the width left free, so each mark takes exactly the room its own shape needs.

   It was a 56px SQUARE until 2026-08-09, and measured that was false advertising: a square well
   holds a crest and reduces a 4:1 wordmark to a 20px strip and a 10:1 sponsor rail to about 8px
   - and most real brands are wordmarks, so "bring your logo" was true for a shape most users do
   not have (benchmarks/lite/BRAND-AUDIT-2026-08-09.md). A fixed height with an auto width also
   reserves NO empty width when the mark is narrow, which is the trap DESIGN_LANGUAGE §5 names.
   Only a mark past ~4:1 reaches the cap and letterboxes, which is the honest outcome for one.

   NO radius and NO crop, deliberately - a brand mark's corners belong to the brand, and this is
   the slot every 'optional' design inherits. src/ai/assetIntegrity.ts refuses both on a picture
   the user marked "use it as it is", which is what a logo is. */
.${prefix}-logo {
  display: block;                  /* its own row — the text starts below it */
  height: calc(64px * var(--scale));  /* the mark's height is what a viewer reads it by */
  width: auto;                     /* …and its width follows its own proportions */
  max-width: calc(260px * var(--scale));  /* the cap a very wide rail letterboxes inside */
  margin-bottom: calc(20px * var(--scale));  /* clear space: a quarter of the mark's height */
  object-fit: contain;             /* show the whole logo, never crop a wide wordmark */
}${sideBySideSizeCss(prefix)}${plateCss(prefix, o)}`;

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
