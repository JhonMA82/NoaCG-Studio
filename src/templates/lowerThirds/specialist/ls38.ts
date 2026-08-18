// ls38 "Developing Story" — the strap for a story that is still moving.
//
// A running story is the one case where a bulletin has to admit on screen that what it is
// telling you is provisional. The convention that carries the admission is not the kicker word
// on its own — DEVELOPING, UPDATING, MORE TO COME — it is the kicker word TOGETHER with a
// timestamp. "Developing" alone ages badly: a viewer joining at ten past has no way to know
// whether the line under it was written a minute ago or two hours ago, and a graphic that
// cannot answer that question is doing the opposite of what it claims.
//
// So the stamp is a field of its own and it sits on the SAME ROW as the kicker, ruled off from
// the headline above by the accent. The two of them read as one editorial statement about the
// headline's status — "this is provisional, and here is how provisional" — rather than as a
// label and a footnote at opposite ends of the graphic.
//
// The stamp carries the numerals contract even though an operator types it: on a running story
// it is the value that gets retyped most, and a figure that changes on air must not change the
// shape of the graphic around it.
//
// Editorial structure throughout: no panel, a printed rule, whitespace doing the work.

import { paletteById, type TemplateVariant } from '../../../model/wizard';
import { defineVariant } from '../shared';
import { TABULAR_FIGURES, hasLine, slot } from './shared';

export const ls38: TemplateVariant = defineVariant(
  {
    id: 'ls38',
    category: 'lower-third',
    name: 'Developing Story',
    styleTag: 'editorial',
    description: 'A kicker and an updated-at stamp over a running headline, on a printed rule.',
    maxLines: 3,
    suggestedLines: [
      { title: 'Kicker', sample: 'Developing' },
      { title: 'Headline', sample: 'Rail operators withdraw the revised timetable' },
      { title: 'Updated at', sample: 'Updated 14:32' },
    ],
    logo: 'none',
    // Line reveal: the rule draws first and the words rise behind it — the editorial family's
    // signature, where the rule IS the entrance.
    animationPresets: ['line-reveal', 'mask-wipe', 'fade', 'slide-up', 'blur-in', 'slide-down'],
    defaultPalette: paletteById('vermilion'),
    defaultFontId: 'ibm-plex-sans',
    // Right-anchored, and mirrored rather than merely moved: the rule closes the block on the
    // outside edge and the type is ragged-left. A developing flag and a speaker strap are
    // routinely on air together — the story is still moving while somebody is being
    // introduced — so this one is drawn to sit BESIDE a left-anchored lower third instead of
    // fighting it for the same corner.
    defaultZone: 'bottom-right',
  },
  {
    name: 'Developing Story',
    description:
      'The running-story strap: a kicker (DEVELOPING, UPDATING, MORE TO COME — its own field) ' +
      'beside an UPDATED-AT stamp, ruled off above the headline. The stamp is the point: a ' +
      'provisional label with no time on it cannot tell a viewer joining late how provisional ' +
      'the line is. No panel — a printed rule and whitespace, the editorial way. Sibling of ' +
      'lt30 Dateline.',
    uicolor: '2',
  },
  (o) => {
    // The status row holds the kicker and the stamp on one baseline, and is emitted only when
    // the operator kept at least one of them — a headline running on its own is a legitimate
    // late state of the same story. The stamp's own cell carries the printed rule that marks
    // it off from the claim beside it, so the class has to sit on the MASK rather than on the
    // span the pack's shared `slot()` classes.
    const stamp = hasLine(o, 2)
      ? `        <!-- ${o.lines[2].title} (f2) — SPX writes this field's value straight into the element. -->
        <div class="lower-third-mask lower-third-stampcell"><span id="f2" class="lower-third-stamp">${o.lines[2].sample}</span></div>\n`
      : '';
    const statusRow =
      hasLine(o, 0) || hasLine(o, 2)
        ? `      <div class="lower-third-statusrow">
${slot(o, 0, 'lower-third-kicker', '        ')}
${stamp}      </div>
`
        : '';

    return {
      html: `    <!-- The block: [the headline] over [printed rule] over [kicker · updated-at stamp]. -->
    <div class="lower-third-box">
${slot(o, 1, 'lower-third-name', '      ')}
      <div class="lower-third-accent"></div>
${statusRow}    </div>`,

      css: `/* The block — NO panel, and MIRRORED: right-anchored, so the type is ragged-left and the
   rule closes the block on the outside edge. Editorial structure is a rule and the whitespace
   around it; the drop shadow is what keeps light type readable over a bright picture. */
.lower-third-box {
  padding: calc(4px * var(--scale)) 0;
  text-align: right;                /* a right-anchored graphic right-aligns (DESIGN_LANGUAGE §1) */
  filter: drop-shadow(0 calc(3px * var(--scale)) calc(16px * var(--scale)) rgba(0, 0, 0, 0.55));
  max-width: calc(1000px * var(--scale));  /* a headline wraps here rather than crossing frame */
}

/* The headline (f1) — the graphic's one large voice, set rather than shouted. */
.lower-third-name {
  font-size: calc(42px * var(--scale) * var(--type-scale));  /* headline size (values are 1080p reference) */
  font-weight: var(--display-weight);  /* the family's display weight — set, not shouted */
  line-height: 1.18;                /* wrapped headlines stay compact */
  letter-spacing: var(--display-tracking);  /* the family's display tracking */
  color: var(--text-color);         /* primary text color */
}

/* The printed rule — the family's structure, and this design's accent NODE, so the line-reveal
   preset and the step reveals have a real element to draw. It sits at the OUTSIDE edge, which
   is what makes this a mirrored design rather than a moved one. */
.lower-third-accent {
  width: calc(150px * var(--scale));  /* a printed rule under the headline, not a full divider */
  height: var(--accent-weight);     /* the family's 2px rule weight */
  margin: calc(19px * var(--scale)) 0 calc(15px * var(--scale)) auto;  /* air above and below; pinned right */
  background: var(--accent);        /* the design's one accent surface */
  transform-origin: right center;   /* line-reveal draws it from the anchored end */
}

/* The status row — the kicker and the stamp on one baseline: one editorial statement about
   the headline's standing, not a label and a footnote at opposite ends of the graphic. */
.lower-third-statusrow {
  display: flex;                    /* kicker and stamp in a row… */
  flex-wrap: wrap;                  /* …wrapping only if both run long */
  justify-content: flex-end;        /* closing at the anchored edge, with the rest of the block */
  align-items: baseline;            /* one shared baseline */
  gap: calc(16px * var(--scale));
  min-width: 0;                     /* allow shrinking */
}
.lower-third-statusrow > .lower-third-mask {
  display: flex;                    /* each value hugs its own text… */
  min-width: 0;                     /* …and may shrink */
}

/* The kicker (f0) — the masthead voice: tracked caps in the accent colour. Bounded, because
   an editorial claim is one or two words and a sentence typed here would run the row past the
   headline it belongs to. */
.lower-third-kicker {
  display: block;                   /* so the width bound and the ellipsis apply */
  max-width: calc(400px * var(--scale));  /* the widest an editorial claim ever needs */
  font-size: calc(21px * var(--scale) * var(--type-scale));  /* a mark, not a line */
  font-weight: 700;                 /* bold — tracked caps at this size need the weight */
  line-height: 1.3;                 /* single tight label row */
  letter-spacing: var(--label-tracking);  /* 0.24em — the family's masthead tracking */
  text-transform: uppercase;        /* DEVELOPING, whatever the operator types */
  color: var(--label-color);        /* the family's label colour (the accent) */
  white-space: nowrap;              /* the mark never wraps… */
  overflow: hidden;                 /* …and a too-long one is clipped… */
  text-overflow: ellipsis;          /* …with an honest ellipsis */
}

/* The stamp's cell — marked off from the kicker by a printed rule rather than by a middot,
   because the two are different KINDS of statement: one is the newsroom's claim about the
   story, the other is the clock. */
.lower-third-stampcell {
  padding-left: calc(16px * var(--scale));  /* the rule's clear space */
  border-left: 1px solid color-mix(in srgb, var(--text-color) 24%, transparent);  /* the divider */
}

/* The stamp (f2) — the same size as the kicker but dimmed and untracked, so the pair reads as
   claim-then-qualifier. Tabular figures because this is the value that gets retyped on air,
   and a changing figure must not change the shape of the row around it. */
.lower-third-stamp {
  font-size: calc(20px * var(--scale) * var(--type-scale));  /* the smallest voice in the block */
  font-weight: 500;                 /* medium — a figure needs a little weight to hold */
  line-height: 1.3;                 /* matches the kicker's rhythm */
  letter-spacing: 0.03em;           /* a touch of air, nothing like the kicker's tracking */
  ${TABULAR_FIGURES}
  color: var(--text-dim);           /* dimmed — never the accent twice on one row */
  white-space: nowrap;              /* a timestamp never wraps */
}

/* The rule belongs to the PAIR, not to the stamp: with the kicker deleted the stamp is the
   only thing on the row and a rule hanging off its left edge would read as a defect. */
.lower-third-statusrow > .lower-third-stampcell:first-child {
  padding-left: 0;                  /* no clear space… */
  border-left: none;                /* …and no rule, when there is nothing to divide from */
}`,
      hasAccent: true,
    };
  },
);
