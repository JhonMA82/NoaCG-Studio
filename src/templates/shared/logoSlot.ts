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

// ── THE WELL IS GONE (owner decision, 2026-08-14) ─────────────────────────────────────
//
// A mark whose ink could not read on the design's own surface used to be given a painted well
// underneath - a fixed near-white or near-black rectangle. It worked, in the sense that a
// contrast meter passed it, and it is exactly what the owner refused on sight in the matrix
// gallery: the mark stopped being part of the lower third and became a logo pasted on top of
// it, in a white box that no design ever drew.
//
// The ladder above it stays: a mark that cannot read on the chosen chassis gets a chassis whose
// surface suits it (`logo_chassis_reselected`). What the well used to catch was the case no
// chassis can fix, because the tone that defeats the mark is the USER's package rather than the
// design's - a dark-ink mark on a dark brand palette. There is no drawn answer to that inside
// the catalog, and the two answers that remain are both worse than they look:
//
//   · dropping the mark breaks the promise the whole brand slot exists to make, and does it
//     silently, on the one element the customer is most certain about;
//   · pasting a well on breaks the composition, which is what this decision refuses.
//
// So the mark stays where the design puts it and the pairing is RECORDED instead
// (`logo_ink_unreadable_on_surface` in the semantic validator). The honest fix belongs with the
// brand kit - a channel with a dark-only mark needs its knockout version for a dark package -
// and the ledger is what will say how often that actually happens.
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
 * So for straps only, the box becomes a TWO-COLUMN, ONE-ROW grid: the mark in column one, and
 * everything the design already emits gathered into column two as a single stack.
 *
 * ── WHY THE DESIGN'S CHILDREN ARE WRAPPED ─────────────────────────────────────────────
 *
 * The first version left them as direct children of the box and gave the mark
 * `grid-row: 1 / -1` to span them. **That span is a no-op, and it was measured as one.** A
 * negative row line counts back from the end of the EXPLICIT grid, and this rule declares
 * columns only - so with no explicit row track `-1` resolves to line 1, the end is not after
 * the start, and the browser falls back to a single row. The mark therefore sat in ROW ONE,
 * beside the NAME rather than beside the stack, and it sized that row:
 *
 *   · lt11 with a square mark grew 147.3px -> 158.6px (+7.7%), lt02 113.4 -> 120.9 (+6.6%),
 *     lt05 133.5 -> 137.8 - a strap spending height again, through the back door;
 *   · and the mark's centre sat 19-28px ABOVE the text stack's centre on every strap measured
 *     (0.28-0.80 of the mark's own height), which is the owner's "logo centred, empty space
 *     underneath" note arriving as geometry.
 *
 * There is no count-free way to span an unknown number of implicit rows, so the rows are
 * removed from the problem instead: the design's own children go into one `.{prefix}-lockup`
 * div, the box holds exactly two items, and one row is all there is to centre against. Finding
 * the box's matching close tag is not the obstacle it once looked like - `boxCloseIndex` below
 * already does it, because the mark is inserted there.
 *
 * The wrapper also RETIRES the renumbering hazard rather than dodging it: the design's children
 * keep their positions 1..n inside it, so an `nth-child` rule the design wrote about its own
 * children means what it always meant, wherever the mark goes. The mark also stays INSIDE the
 * box on purpose: the presets animate `.{prefix}-box`, so a mark placed beside the box as its
 * sibling would sit still while the strap moved.
 */
function sideBySideCss(prefix: string): string {
  if (prefix !== 'lower-third') return '';
  return `

/* The mark sits BESIDE the words, never above them (see the note in shared/logoSlot.ts). */
.${prefix}-box {
  display: grid;                   /* two columns, ONE row: the mark, then the design's stack */
  /* minmax(0, 1fr), not a plain 1fr: an fr track has a MIN-CONTENT floor, so the words refuse
     to shrink and the strap grows past its own width cap instead - measured as
     lite-hold-overflow on lt25 with a long academic role beside a wide lockup, twice. The
     mark's column takes the width its shape needs and the text column absorbs the rest. */
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;             /* the mark is centred against the WHOLE stack */
  /* The clear space is the mark's own margin (below), never a gap between the TRACKS: a track
     is charged its gap whether or not anything is in it, so a slot the operator has left empty
     would shift the words sideways. Measured: 26px on lt11 while the gap was ours, and 10px on
     lt02, whose own 10px gap reached the columns the moment ours was gone. The design's ROW gap
     is untouched, and the lockup below inherits it. */
  column-gap: 0;
}
/* Both placed explicitly: the stack comes FIRST in the markup (the mark is appended last, so
   the design's own children are never renumbered), and only an explicit area puts the mark on
   the left of something that precedes it. */
.${prefix}-box > .${prefix}-logo { grid-area: 1 / 1; }
.${prefix}-box > .${prefix}-lockup { grid-area: 1 / 2; }
.${prefix}-lockup {
  display: grid;                   /* the design's own lines, stacked as its box stacked them */
  /* …including whatever row gap that box declared. The box is one row now, so its own gap has
     nothing left to space; inheriting is what keeps a design like lt36 or lt47 spacing its
     lines exactly as it did before the slot existed. */
  row-gap: inherit;
  min-width: 0;                    /* a long line shrinks here instead of widening the strap */
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
 * The margin below the mark becomes a margin BESIDE it, and the fixed height becomes a CAP. A
 * fixed height would hand a portrait crest the power to set the strap's height again through its
 * own aspect - the exact failure this whole change is about, arriving through the back door.
 *
 * THE CLEAR SPACE IS THE MARK'S MARGIN, not the box's `column-gap`, and that is the difference
 * between an empty slot costing nothing and an empty slot shifting the words. A slot the
 * operator has not filled hides its `<img>`, which stops it being a grid item - but the column
 * TRACK survives, and a gap between tracks is charged whether or not either holds anything. The
 * margin disappears with the element it is on, so a strap with the slot switched on and no file
 * in it lays out exactly like a strap with no slot at all.
 */
function sideBySideSizeCss(prefix: string): string {
  if (prefix !== 'lower-third') return '';
  return `

/* On a strap the mark is bounded, never leading: it may take width, and only as much height as
   the words beside it already occupy. */
.${prefix}-logo {
  height: auto;                    /* the artwork no longer dictates a row height */
  max-height: calc(68px * var(--scale));  /* …and can never out-grow the two lines beside it */
  /* 132px, in line with what the designs that hand-author a side slot chose for themselves
     (lt30 124, lt37 126, ls29 136). It was 190 for one round and that was too greedy for a
     SHARED slot: on lt25, whose measure is narrow, the column took the width a long academic
     role needed and the identity lines wrapped - bench-line-wrap twice, surfacing as
     lite-hold-overflow. A slot every design inherits has to be modest, because it cannot know
     which design's measure it is spending. */
  max-width: calc(132px * var(--scale));
  margin: 0 calc(26px * var(--scale)) 0 0;  /* the mark's clear space from the words */
}`;
}

/**
 * Inject the shared logo slot into a design: the <img> inside the .{prefix}-box, its placeholder
 * CSS, and the filelist field (id after every user field). Returns the design untouched when the
 * box wrapper can't be found — never a broken layout.
 *
 * TWO ARRANGEMENTS, decided by the CATEGORY (the prefix), never per design:
 *
 *   - LOWER THIRDS place the mark BESIDE the text - a leading column, centred on the whole
 *     stack, with the design's own children gathered into one `.{prefix}-lockup` beside it.
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

  const markHtml = (indent: string): string =>
    `\n${indent}<!-- Logo (image field ${logoField}) — ${beside ? 'sits beside the stack above, centred on it' : 'a band above the text'}. Empty = hidden. -->` +
    `\n${indent}<img id="${logoField}" class="${prefix}-logo"${logoPath ? ` src="${logoPath}"` : ' style="display: none"'} alt="" />`;

  // WHERE the mark goes in the markup is not a formatting choice, and on a strap it is not the
  // front. A design addresses its own children positionally - lt02 drops every line after the
  // first below its underline with `.lower-third-mask:nth-child(n + 2)` - so an <img> inserted
  // as the FIRST child renumbers all of them and the name lands under the rule. Measured: that
  // is exactly what happened, and nothing but the frame showed it.
  //
  // As the LAST child it renumbers nothing, because every existing child keeps its index. The
  // grid below then places it in the first column regardless of source order, which is what grid
  // placement is for.
  let html: string;
  if (beside) {
    // A strap gathers the design's own children into one lockup first (see sideBySideCss): the
    // box then holds exactly two items in one row, which is the only shape the mark can be
    // centred against without knowing how many rows the design draws.
    const closeAt = boxCloseIndex(design.html, at);
    if (closeAt < 0) return design;
    const openEnd = at + boxOpen.length;
    const raw = design.html.slice(openEnd, closeAt);
    // The design's own markup, one level deeper - re-indented rather than left hanging, because
    // the code the wizard writes is code the user opens (principle 2).
    const inner = raw.replace(/\s+$/, '').replace(/\n/g, '\n  ');
    const closeIndent = /\n([ \t]*)$/.exec(raw)?.[1] ?? '      ';
    html = `${design.html.slice(0, openEnd)}
${closeIndent}  <!-- Everything the design draws, kept together so the mark sits beside the whole stack. -->
${closeIndent}  <div class="${prefix}-lockup">${inner}
${closeIndent}  </div>${markHtml(`${closeIndent}  `)}
${closeIndent}${design.html.slice(closeAt)}`;
  } else {
    const insertAt = at + boxOpen.length;
    html = design.html.slice(0, insertAt) + markHtml('      ') + design.html.slice(insertAt);
  }

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
}${sideBySideSizeCss(prefix)}`;


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
