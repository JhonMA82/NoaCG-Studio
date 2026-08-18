// ls39 "Fact Check" — the claim, and the ruling on it.
//
// The debate-night and campaign-coverage graphic. It has one structural requirement that
// separates it from every other strap in this pack: the VERDICT is operator text, never a
// state the design knows about. TRUE, FALSE, MISLEADING, PARTLY TRUE, UNPROVEN, NEEDS CONTEXT
// — every fact-checking desk uses its own ladder, several use more than five rungs, and the
// wording is editorial policy that changes between elections. A design that hard-codes three
// verdict states would be telling a newsroom what its rulings may be, and would need a code
// change the first time an editor added one.
//
// The colour is neutral for the same reason. A red plate under FALSE and a green one under
// TRUE looks helpful and is a trap: the operator can type a verdict the colour contradicts,
// and a strap whose plate says one thing while its word says another is worse than no strap.
// So there is ONE accent, the same behind every ruling, and the ruling is the word.
//
// The composition is the sport family's layered slab: a skewed accent plate carrying the
// verdict, sitting on a square slab carrying the claim it rules on. The claim itself is set in
// sentence case rather than the family's heavy caps — it is a sentence somebody said, and caps
// would make it a slogan.

import { paletteById, type TemplateVariant } from '../../../model/wizard';
import { defineVariant } from '../shared';
import { hasLine, slot } from './shared';

export const ls39: TemplateVariant = defineVariant(
  {
    id: 'ls39',
    category: 'lower-third',
    name: 'Fact Check',
    styleTag: 'sport',
    description: 'A claim on a slab, with the desk’s ruling on a skewed plate above it.',
    maxLines: 3,
    suggestedLines: [
      { title: 'Verdict', sample: 'Misleading' },
      { title: 'Claim', sample: 'Waiting times have halved since the last election' },
      { title: 'Claimed by', sample: 'Said at the leaders’ debate' },
    ],
    logo: 'none',
    // Snap stinger: the plate slams in and settles. A ruling should land, and the sport
    // family's entrance is the one in the bank that does exactly that.
    animationPresets: ['snap-stinger', 'slide-left', 'mask-wipe', 'pop-spring', 'fade', 'slide-up'],
    defaultPalette: paletteById('royal'),
    defaultFontId: 'saira',
    defaultZone: 'bottom-left',
  },
  {
    name: 'Fact Check',
    description:
      'The fact-check strap: the claim on a square slab with the desk’s ruling on a skewed ' +
      'accent plate above it. The VERDICT is operator text, never a built-in state — every ' +
      'desk runs its own ladder (true, misleading, partly true, unproven, needs context) and ' +
      'the wording is editorial policy. The plate colour is neutral and identical for every ' +
      'ruling, so a plate can never contradict the word on it.',
    uicolor: '4',
  },
  (o) => ({
    html: `    <!-- The strap: [skewed verdict plate] over [square claim slab]. -->
    <div class="lower-third-box">
      <!-- The plate is unconditional — it carries this design's accent node, which the
           animation data keyframes by selector. Only the RULING inside it is a field. -->
      <div class="lower-third-verdict">
        <div class="lower-third-accent"></div>
${hasLine(o, 0) ? `        <div class="lower-third-mask"><span id="f0" class="lower-third-name">${o.lines[0].sample}</span></div>\n` : ''}      </div>
      <div class="lower-third-claim">
${slot(o, 1, 'lower-third-title', '        ')}
${slot(o, 2, 'lower-third-extra', '        ')}
      </div>
      <!-- The tail: a short accent tab closing the slab, cut to the same angle the plate
           leans at, so the two accent moments read as one shape. Drawn furniture. -->
      <div class="lower-third-tail" aria-hidden="true"></div>
    </div>`,

    css: `/* The stack — the plate above the slab, both hugging the left edge. */
.lower-third-box {
  display: flex;                    /* plate over slab… */
  flex-direction: column;           /* …top to bottom */
  align-items: flex-start;          /* both blocks hug the left edge */
}

/* The verdict plate. The word sits level while its plate leans, which is the sport family's
   slab idiom done the readable way round: skewing the type as well costs legibility on the
   one word the whole graphic exists to deliver. */
.lower-third-verdict {
  position: relative;               /* the plate below is positioned against this box */
  display: flex;                    /* the ruling sits inside the plate */
  margin-left: calc(12px * var(--scale));  /* room for the lean's overhang at the bottom-left */
  padding: calc(9px * var(--scale)) calc(30px * var(--scale)) calc(10px * var(--scale));
  max-width: calc(560px * var(--scale));  /* a ruling is one or two words; longer clips inside */
}

/* The plate itself — this design's accent NODE, drawn as a leaning slab behind the ruling. */
.lower-third-accent {
  position: absolute;               /* fills the verdict box, behind the word */
  inset: 0;                         /* …exactly */
  transform: skewX(-8deg);          /* the sport family's lean */
  transform-origin: center;         /* leans about its own middle, so it stays put */
  background: var(--accent);        /* the ONE accent surface — identical for every ruling */
  box-shadow: var(--panel-shadow);  /* the family's hard offset shadow */
}

/* The ruling (f0) — level, heavy, and clipped: a sentence typed here ellipsizes inside its
   plate rather than laying the plate out wider than the slab (the bench measures layout). */
.lower-third-verdict > .lower-third-mask {
  position: relative;               /* stacks above the absolutely positioned plate */
  min-width: 0;                     /* let the bound below actually bind */
}
.lower-third-name {
  display: block;                   /* so the width bound and the ellipsis apply */
  max-width: calc(500px * var(--scale));  /* the plate's inner width — the measured cap */
  font-size: calc(32px * var(--scale) * var(--type-scale));  /* the ruling reads from the back row */
  font-weight: var(--display-weight);  /* the family's display weight (800) */
  line-height: 1.3;                 /* one plate row, with room for the face's full ascent —
                                       tighter and the span's own ellipsis clip eats into it */
  letter-spacing: var(--label-tracking);  /* the family's tracked-caps voice */
  text-transform: uppercase;        /* MISLEADING, whatever the desk types */
  color: var(--accent-ink);         /* the family's ink for text ON accent */
  white-space: nowrap;              /* the ruling never wraps… */
  overflow: hidden;                 /* …and a too-long one is clipped… */
  text-overflow: ellipsis;          /* …with an honest ellipsis */
}

/* The claim slab — square, solid, and the widest thing on the graphic. */
.lower-third-claim {
  padding: calc(22px * var(--scale)) calc(44px * var(--scale)) calc(24px * var(--scale)) calc(34px * var(--scale));
  background: var(--panel-bg);      /* the family's solid slab */
  box-shadow: var(--panel-shadow);  /* the same hard offset as the plate */
  min-width: calc(600px * var(--scale));  /* a broadcast-width slab even behind a short claim */
  max-width: calc(1000px * var(--scale));  /* a claim wraps here rather than crossing the frame */
}

/* The tail — cut with clip-path rather than skewed, because a skew would drag its left edge
   off the slab it is closing. The angle matches the plate's lean, so both accent moments read
   as one shape rather than as two decisions. */
.lower-third-tail {
  width: calc(190px * var(--scale));  /* a tab, not a bar across the slab */
  height: calc(9px * var(--scale));  /* the family's slab weight, at its thinnest */
  clip-path: polygon(0 0, 100% 0, calc(100% - 9px) 100%, 0 100%);  /* the plate's -8deg edge */
  background: var(--accent);        /* the same accent as the plate — one colour, two doses */
}

/* The claim (f1) — sentence case on purpose: this is a sentence somebody said, and the
   family's heavy caps would turn a quotation into a slogan. */
.lower-third-title {
  font-size: calc(34px * var(--scale) * var(--type-scale));  /* headline size (values are 1080p reference) */
  font-weight: 600;                 /* semibold: present without shouting over the ruling */
  line-height: 1.3;                 /* a sentence needs leading, and a condensed face needs more */
  letter-spacing: var(--display-tracking);  /* the family's display tracking */
  color: var(--text-color);         /* primary text color */
}

/* Where the claim was made (f2) — the attribution, and the first line to drop. */
.lower-third-extra {
  font-size: calc(20px * var(--scale) * var(--type-scale));  /* the smallest voice on the slab */
  font-weight: 500;                 /* medium keeps tracked caps crisp at this size */
  line-height: 1.3;                 /* single tight label line */
  letter-spacing: var(--label-tracking);  /* the family's label tracking */
  text-transform: uppercase;        /* SAID AT THE LEADERS' DEBATE, whatever is typed */
  color: var(--text-dim);           /* dimmed — the accent belongs to the plate alone */
  margin-top: calc(11px * var(--scale));  /* its own beat below the claim */
}`,
    hasAccent: true,
  }),
);
