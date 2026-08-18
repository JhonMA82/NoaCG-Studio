// ls37 "Breaking Line" — the restrained breaking strap.
//
// The house version of this graphic (lt12 House Breaking) does what most packages do: a solid
// accent plate stacked on a headline panel, the urgency turned all the way up. That is the
// right answer for a channel whose brand IS the urgency, and the wrong one for a broadcaster
// whose credibility is the product — a public service bulletin, a financial channel, a
// university newsroom. Those organisations still need the mark, and they need it to look like
// a claim rather than an advert for itself.
//
// So this is the same graphic with every loud element taken out and nothing added back. The
// label is an OUTLINED chip, not a filled plate: the accent draws the line around the word
// instead of flooding behind it, which reads as marking rather than shouting. The one filled
// accent surface on the whole strap is a rule down its left edge, the width of a hairline. And
// the headline is the only large thing here, because in a breaking graphic the headline is the
// only thing anybody is reading.
//
// The label stays its own SPX field for the same reason it does in the house design: BREAKING,
// DEVELOPING, JUST IN and URGENT are different editorial claims, and an operator must be able
// to change the claim without retyping the story.

import { paletteById, type TemplateVariant } from '../../../model/wizard';
import { defineVariant } from '../shared';
import { hasLine, slot } from './shared';

export const ls37: TemplateVariant = defineVariant(
  {
    id: 'ls37',
    category: 'lower-third',
    name: 'Breaking Line',
    styleTag: 'minimal',
    description: 'An outlined breaking label over one headline — the restrained breaking strap.',
    maxLines: 2,
    suggestedLines: [
      { title: 'Label', sample: 'Breaking' },
      { title: 'Headline', sample: 'Coalition talks reach a midnight deadline' },
    ],
    logo: 'none',
    // Line reveal: the edge rule draws first and the headline rises behind it. The mark is
    // established before the claim is made, which is the editorial order.
    animationPresets: ['line-reveal', 'mask-wipe', 'slide-up', 'fade', 'blur-in', 'slide-left'],
    defaultPalette: paletteById('signal'),
    defaultFontId: 'libre-franklin',
    defaultZone: 'bottom-left',
  },
  {
    name: 'Breaking Line',
    description:
      'The restrained breaking strap: an OUTLINED label chip over a single headline on a quiet ' +
      'panel, with one hairline of accent down the left edge. The sober sibling of lt12 House ' +
      'Breaking — same claim, none of the shouting — for a bulletin whose credibility rather ' +
      'than whose urgency is the brand. The label is its own field, so BREAKING, JUST IN and ' +
      'DEVELOPING are one keystroke apart.',
    uicolor: '2',
  },
  (o) => ({
    html: `    <!-- The strap: [accent edge rule] | [outlined label] over [the headline]. -->
    <div class="lower-third-box">
      <div class="lower-third-accent"></div>
      <div class="lower-third-text">
        <!-- The label row: the outlined mark, then a hairline running out to the strap's edge
             — the newsroom's "label, then rule" motif. The rule is drawn whether or not the
             operator kept the word, so the row never collapses to nothing. -->
        <div class="lower-third-labelrow">
${hasLine(o, 0) ? `          <div class="lower-third-mask lower-third-labelwrap"><span id="f0" class="lower-third-label">${o.lines[0].sample}</span></div>\n` : ''}          <div class="lower-third-hairline"></div>
        </div>
${slot(o, 1, 'lower-third-name', '        ')}
      </div>
    </div>`,

    css: `/* The panel — quiet and square: everything this design says, it says with the headline. */
.lower-third-box {
  display: flex;                    /* the edge rule beside the words, never above them */
  align-items: stretch;             /* the rule runs the panel's full height */
  background: var(--panel-bg);      /* the minimal family's quiet panel */
  box-shadow: var(--panel-shadow);  /* the family's panel lift */
  min-width: calc(600px * var(--scale));  /* a broadcast-width strap even behind a short headline */
  max-width: calc(1000px * var(--scale));  /* a headline wraps here rather than crossing the frame */
}

/* The edge rule — the ONE filled accent surface on the strap, and its accent NODE. */
.lower-third-accent {
  flex: none;                       /* never squeezed */
  width: var(--accent-weight);      /* the family's hairline weight */
  background: var(--accent);        /* the one accent surface */
  transform-origin: center top;     /* line-reveal draws the rule downward */
}

.lower-third-text {
  min-width: 0;                     /* let it shrink so a long headline wraps instead of overflowing */
  padding: calc(22px * var(--scale)) calc(48px * var(--scale)) calc(26px * var(--scale)) calc(30px * var(--scale));
}

/* The label row — the mark, then the rule that runs out to the strap's right edge. */
.lower-third-labelrow {
  display: flex;                    /* the mark and the rule on one line */
  align-items: center;              /* the rule sits on the chip's centre line */
  gap: calc(18px * var(--scale));   /* the mark's clear space from the rule */
  margin-bottom: calc(15px * var(--scale));  /* air between the row and the headline */
}

/* The hairline — neutral, not accent: the accent is spent on the edge rule and the outline,
   and a third dose of it would be the two-accent look this family exists to avoid. */
.lower-third-hairline {
  flex: 1 1 auto;                   /* takes whatever room the mark leaves */
  height: 1px;                      /* a hairline, drawn at one device pixel */
  min-width: calc(60px * var(--scale));  /* always reads as a rule, even behind a long label */
  background: color-mix(in srgb, var(--text-color) 22%, transparent);  /* a whisper of the ink */
}

/* The label's wrapper carries the bound, so a sentence typed into the label clips inside the
   chip rather than laying out wider than the strap (the bench measures the layout box). */
.lower-third-labelwrap {
  display: flex;                    /* the chip hugs its own word */
  flex: none;                       /* the rule gives way to the mark, never the other way */
  max-width: calc(420px * var(--scale));  /* the widest an editorial claim ever needs */
  overflow: hidden;                 /* the clip is what makes the max-width real (bench) */
}

/* The label (f0) — OUTLINED, not filled: the accent draws the line around the word instead of
   flooding behind it, which is the whole difference between this strap and the house one. */
.lower-third-label {
  display: block;                   /* so the width bound and the ellipsis apply */
  max-width: calc(420px * var(--scale));  /* the wrapper's inner width — the measured cap */
  padding: calc(5px * var(--scale)) calc(15px * var(--scale));
  border: 1px solid var(--accent);  /* the outline — the mark, drawn rather than flooded */
  border-radius: calc(2px * var(--scale));  /* the minimal family's 0–2px corner, at its limit */
  font-size: calc(20px * var(--scale) * var(--type-scale));  /* a mark, not a headline */
  font-weight: 700;                 /* bold — tracked caps at this size need the weight */
  line-height: 1.2;                 /* one tight chip row */
  letter-spacing: var(--label-tracking);  /* the family's label tracking */
  text-transform: uppercase;        /* BREAKING, whatever the operator types */
  color: var(--accent);             /* the word takes the accent, the panel keeps its own dark */
  white-space: nowrap;              /* the mark never wraps… */
  overflow: hidden;                 /* …and a too-long one is clipped… */
  text-overflow: ellipsis;          /* …with an honest ellipsis */
}

/* The headline (f1) — the only large thing on the graphic, because it is the only thing being
   read. Set at semibold rather than heavy: this design marks the story, it does not shout it. */
.lower-third-name {
  font-size: calc(42px * var(--scale) * var(--type-scale));  /* headline size (values are 1080p reference) */
  font-weight: 600;                 /* semibold: present without shouting */
  line-height: 1.16;                /* wrapped headlines stay compact */
  color: var(--text-color);         /* primary text color */
}`,
    hasAccent: true,
  }),
);
