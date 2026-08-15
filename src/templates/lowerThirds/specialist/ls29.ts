// ls29 "Field Report" — the reporter, the place, and the time, in one strap.
//
// The correspondent's own graphic. It differs from a studio strap in exactly one structural
// way, and that difference is the whole design: the LOCATION is not a subtitle, it is a
// dateline. In print a dateline sits apart from the byline, in caps, ahead of the copy —
// "KYIV —" — and broadcast inherited the convention. So here the place is set in the house
// mono above the name, in the accent, with the clock beside it on the same rail: where and
// when together, then who.
//
// The clock reads the playout machine's time. That is correct for a gallery cutting its own
// show, and it is the reason a reporter strap can stay up through a long live without
// anybody having to remember to update it.
//
// The optional mark is the CHANNEL's, at the closing end of the strap — where a rolling news
// bug sits — on the panel's own surface, so it takes the package's colour like everything else.

import { paletteById, type TemplateVariant } from '../../../model/wizard';
import { fontById, labelFontFaceCss } from '../../../model/fonts';
import { defineVariant } from '../shared';
import { TABULAR_FIGURES, hasLine, liveClockJs, slot } from './shared';

const CLOCK_ELEMENT = 'lower-third-clock';

// ── THE MARK'S COLUMN, AND WHY THESE THREE NUMBERS ARE DECLARED TOGETHER ──────────────────
//
// The bug's width, its clear space from the words, and the words' own measure. They are consts
// because the third is computed from the first two: with the slot on, the panel's cap is WIDENED
// by the mark's column instead of the mark's column being taken out of the words' measure. Written
// as three literals in three rules, the arithmetic silently desyncs the first time one of them
// moves - which is exactly how the bug below was measured into existence.
const MARK_WIDTH_PX = 136;
const MARK_CLEAR_PX = 34;
const MEASURE_PX = 871;

export const ls29: TemplateVariant = defineVariant(
  {
    id: 'ls29',
    category: 'lower-third',
    name: 'Field Report',
    styleTag: 'noacg',
    description: 'A dateline and live clock on one rail, with the reporter named beneath.',
    maxLines: 3,
    suggestedLines: [
      { title: 'Dateline', sample: 'Kyiv · Ukraine' },
      { title: 'Reporter', sample: 'Tomas Reid' },
      { title: 'Role', sample: 'Eastern Europe Correspondent' },
    ],
    logo: 'optional',
    animationPresets: ['line-reveal', 'slide-up', 'mask-wipe', 'fade', 'slide-left', 'blur-in'],
    defaultPalette: paletteById('noacg'),
    defaultFontId: 'space-grotesk',
    defaultZone: 'bottom-left',
  },
  {
    name: 'Field Report',
    description:
      'The correspondent strap: the dateline set in the house mono above the name — apart ' +
      'from it, the way print sets a dateline apart from a byline — with a live clock on the ' +
      'same rail, then the reporter and their beat beneath. The clock reads the playout ' +
      'machine’s own time, so it cannot go stale during a long live.',
    uicolor: '4',
  },
  (o) => {
    // A real SPX image field; its id comes after every wizard field so nothing collides.
    const logoField = `f${o.lines.length + o.extraFields.length}`;
    const logoPath = o.logoAssetPath ?? '';
    const bug = o.logoEnabled
      ? `      <!-- The channel mark (image field ${logoField}). Empty shows the placeholder rule. -->
      <div class="lower-third-bug${logoPath ? ' has-image' : ''}">
        <div class="lower-third-markrule"></div>
        <img id="${logoField}" class="lower-third-logo"${logoPath ? ` src="${logoPath}"` : ' style="display: none"'} alt="" />
      </div>
`
      : '';

    return {
      html: `    <!-- House structure: [8px accent bar] | [void panel: dateline rail, reporter] | [channel mark]. -->
    <div class="lower-third-accent"></div>
    <div class="lower-third-box">
      <div class="lower-third-report">
        <div class="lower-third-datelinerow">
${hasLine(o, 0) ? slot(o, 0, 'lower-third-name', '          ') : ''}
          <!-- The clock — paintLowerThirdClock() (in the JS) repaints this as the minute turns. -->
          <span id="${CLOCK_ELEMENT}" class="lower-third-clock">20:14</span>
        </div>
${slot(o, 1, 'lower-third-title', '        ')}
${slot(o, 2, 'lower-third-extra', '        ')}
      </div>
${bug}    </div>`,

      extraFields: o.logoEnabled
      ? [
          {
            field: logoField,
            ftype: 'filelist' as const,
            title: 'Channel mark',
            value: logoPath,
            assetfolder: './images/',
            extension: 'png',
          },
        ]
      : [],

      runtimeExtraJs: liveClockJs(CLOCK_ELEMENT),

      css: `${labelFontFaceCss(fontById('jetbrains-mono'))}

/* The accent bar — 8px, fused to the panel's left edge, with the house's one glow. */
.lower-third-accent {
  position: absolute;               /* pinned inside the positioned .lower-third root */
  left: 0;                          /* at the very left edge */
  top: 0;                           /* full panel height… */
  bottom: 0;                        /* …top to bottom */
  width: var(--accent-weight);      /* the family's bar weight */
  background: var(--accent);        /* the one accent surface */
  box-shadow: var(--accent-glow);   /* the family's accent glow */
  will-change: transform;           /* hint the browser: presets grow this bar in */
}

/* The panel — the house void, starting where the accent bar ends. */
.lower-third-box {
  display: flex;                    /* the report, then the channel mark that closes it */
  align-items: center;              /* the mark is centred against the whole report */
  gap: calc(${MARK_CLEAR_PX}px * var(--scale));   /* the mark's clear space from the words */
  margin-left: calc(9px * var(--scale));    /* starts where the accent bar ends */
  padding: calc(21px * var(--scale)) calc(61px * var(--scale)) calc(28px * var(--scale)) calc(38px * var(--scale));
  background: var(--panel-bg);      /* void rgba(10,12,16,.86) by default */
  backdrop-filter: var(--panel-blur);  /* the family's backdrop treatment */
  -webkit-backdrop-filter: var(--panel-blur);  /* Safari spelling of the same effect */
  box-shadow: var(--panel-shadow);  /* the family's panel lift */
  /* A correspondent's beat runs long - and with the mark on, the cap is WIDENED by the mark's
     column (${MARK_WIDTH_PX}px + ${MARK_CLEAR_PX}px) rather than being taken out of it. Measured
     2026-08-15 with a square crest and two lines: at the bare 871px the panel hit its cap, the
     reporter's name broke across two rows, and the strap grew 139 -> 191px (+37.4%) - a strap
     spending HEIGHT because a logo arrived, which is the one thing a strap cannot do. Widened,
     the words keep their whole measure and the graphic grows sideways instead. */
  max-width: calc(${o.logoEnabled ? MEASURE_PX + MARK_WIDTH_PX + MARK_CLEAR_PX : MEASURE_PX}px * var(--scale));
}

/* The report column — dateline rail, reporter, beat. */
.lower-third-report {
  min-width: 0;                     /* lets a long beat wrap instead of overflowing */
}
${
      o.logoEnabled
        ? `
/* The channel mark — on the panel's own surface at the closing end of the strap, where a
   rolling-news bug sits.

   THE WORDS DECIDE HOW TALL THE STRAP IS, and the bug stretches to whatever they leave. It was a
   fixed 96px box until 2026-08-15, described here as "fixed, so the artwork never sets the strap's
   height" — which was true of the artwork and false of the box holding it: with two lines the
   report column is 90px, so the 96px bug set the row itself. A fixed height is a height FLOOR on a
   piece of furniture that draws nothing, which is the whole trap.

   The mark is laid out INSIDE it absolutely for the same reason one step down: an in-flow image
   contributes its own height to the row even under a max-height, so the artwork would re-grow
   the strap through the back door. Out of flow it contributes nothing, and the crest is as big as
   the words leave room for — 90px beside two lines, 129px beside three, where the old fixed box
   painted 96px in both cases. */
.lower-third-bug {
  flex: none;                       /* fixed width; a long beat never squeezes the mark */
  align-self: stretch;              /* …and exactly the height of the words beside it */
  position: relative;               /* the mark below positions against this box */
  display: flex;                    /* centre the placeholder inside it… */
  align-items: center;              /* …vertically… */
  justify-content: center;          /* …and horizontally */
  width: calc(${MARK_WIDTH_PX}px * var(--scale));   /* wide enough that a lockup still reads at width */
}

/* The placeholder — a quiet rule where the mark will be, so an unset slot reads as
   "nothing here yet" rather than as a broken image. */
.lower-third-markrule {
  width: calc(58px * var(--scale));  /* about the width a lockup would take */
  height: calc(3px * var(--scale));  /* a hairline */
  background: var(--text-dim);      /* neutral — the accent belongs to the dateline */
  opacity: 0.5;                     /* a placeholder should read as absent, not as content */
}
.lower-third-bug.has-image .lower-third-markrule {
  display: none;                    /* a picked mark replaces the placeholder */
}

/* The mark itself (the ${logoField} image field — hidden while empty). Out of flow, so its own
   proportions can never set the strap's height (see the bug above). */
.lower-third-logo {
  position: absolute;               /* out of flow — the artwork sizes to the bug, not the reverse */
  inset: 0;                         /* the whole bug is the mark's box… */
  width: 100%;                      /* …its full width… */
  height: 100%;                     /* …and its full height */
  object-fit: contain;              /* show the whole mark, centred, never cropped or distorted */
}
`
        : ''
    }

/* The dateline rail: where and when, together and apart from the name. */
.lower-third-datelinerow {
  display: flex;                    /* dateline and clock on one row */
  align-items: baseline;            /* one shared baseline */
  gap: calc(16px * var(--scale));   /* the drawn separator sits in this gap */
  min-width: 0;                     /* allow shrinking */
}
.lower-third-datelinerow > .lower-third-mask {
  display: flex;                    /* the dateline hugs its own text… */
  min-width: 0;                     /* …and may shrink */
}

/* The dateline (f0) — the house label voice in the accent. */
.lower-third-name {
  font-family: var(--font-label);   /* the family's label face */
  font-size: calc(20px * var(--scale) * var(--type-scale));  /* a dateline is small by convention */
  font-weight: 500;                 /* medium keeps tracked caps crisp */
  line-height: 1.3;                 /* single tight label line */
  letter-spacing: var(--label-tracking);  /* the family's label tracking */
  text-transform: uppercase;        /* KYIV · UKRAINE, whatever the operator types */
  color: var(--accent);             /* the dateline carries the colour */
}

/* The clock — the same mono voice, dimmed, behind a drawn separator so the pair reads as
   one dateline rather than as two facts. */
.lower-third-clock {
  font-family: var(--font-label);   /* the family's label face */
  font-size: calc(20px * var(--scale) * var(--type-scale));  /* the dateline's own size */
  font-weight: 500;                 /* matches the dateline */
  line-height: 1.3;                 /* matches the dateline */
  letter-spacing: var(--label-tracking);  /* the family's label tracking */
  ${TABULAR_FIGURES}
  color: var(--text-dim);           /* dimmed — the place leads, the time follows */
  white-space: nowrap;              /* a clock never wraps */
}
.lower-third-clock::before {
  content: "·";                     /* the separator is DRAWN, never typed into a field */
  margin-right: calc(16px * var(--scale));  /* balances the flex gap on the other side */
  color: var(--text-dim);           /* the same quiet register */
}

/* The reporter (f1) — the strap's headline, below the dateline. */
.lower-third-title {
  font-size: calc(49px * var(--scale) * var(--type-scale));  /* headline size (values are 1080p reference) */
  font-weight: var(--display-weight);  /* the family's display weight */
  line-height: 1.06;                /* big text sits tight */
  letter-spacing: var(--display-tracking);  /* the family's display tracking */
  color: var(--text-color);         /* primary text color */
  margin-top: calc(12px * var(--scale));  /* a clear break below the dateline rail */
}

/* The beat (f2) — the quiet closing line. */
.lower-third-extra {
  font-size: calc(26px * var(--scale) * var(--type-scale));  /* clearly below the name */
  font-weight: 400;                 /* regular — hierarchy comes from the name's weight */
  line-height: 1.25;                /* room if a long beat wraps */
  color: var(--text-dim);           /* dimmed — never pure white twice */
  margin-top: calc(7px * var(--scale));  /* tied to the name above it */
}`,
      hasAccent: true,
    };
  },
);
