// ls17 "Lectern" — the academic speaker strap.
//
// Two things make an academic credit different from a corporate one, and both are structural
// rather than decorative.
//
// First, POST-NOMINALS are their own field. "Prof. Ama Boateng, PhD, FRSC" is a name plus a
// list of qualifications that a department will insist on and that changes independently of
// the name; jammed into one textfield it wraps in the wrong place and sets at the wrong size.
// Here it trails the name on the same baseline, smaller and dimmed, so a long list degrades
// gracefully instead of pushing the name onto two rows.
//
// Second, the INSTITUTION carries the authority — it is why this person is being shown — so
// it is set apart under a rule rather than trailing the job title as an afterthought. The
// optional mark belongs to that same authority, so it sits at the END of the credit, on the
// panel's own surface: a university crest is multi-colour artwork and a tinted block behind it
// fights the crest's own field.

import { paletteById, type TemplateVariant } from '../../../model/wizard';
import { defineVariant } from '../shared';
import { hasLine, slot } from './shared';

// ── THE MARK'S COLUMN, AND WHY THESE THREE NUMBERS ARE DECLARED TOGETHER ──────────────────
//
// The mark area's width, its clear space from the words, and the credit's own measure. The third
// is computed from the first two: with the slot on, the panel's cap is WIDENED by the mark's
// column rather than the mark's column being taken out of the words' measure. Written as three
// literals in three rules, that arithmetic desyncs the first time one of them moves.
const MARK_WIDTH_PX = 150;
const MARK_CLEAR_PX = 38;
const MEASURE_PX = 894;

export const ls17: TemplateVariant = defineVariant(
  {
    id: 'ls17',
    category: 'lower-third',
    name: 'Lectern',
    styleTag: 'minimal',
    description: 'A name with its own post-nominals field, over a position and a set-apart institution.',
    maxLines: 4,
    suggestedLines: [
      { title: 'Name', sample: 'Prof. Ama Boateng' },
      { title: 'Post-nominals', sample: 'PhD, FRSC' },
      { title: 'Position', sample: 'Chair of Atmospheric Chemistry' },
      { title: 'Institution', sample: 'University of Leeds' },
    ],
    logo: 'optional',
    animationPresets: ['fade', 'line-reveal', 'slide-up', 'mask-wipe', 'blur-in', 'slide-down'],
    defaultPalette: paletteById('ivory'),
    defaultFontId: 'inter',
    defaultZone: 'bottom-left',
  },
  {
    name: 'Lectern',
    description:
      'The academic credit: the name with its post-nominals as a separate SPX field trailing ' +
      'on the same baseline, the position beneath, and the institution set apart under a rule ' +
      'because it is the authority the appearance rests on. Splitting the qualifications out ' +
      'keeps a long list from breaking the name across two rows.',
    uicolor: '1',
  },
  (o) => {
    const nameRow = hasLine(o, 0) || hasLine(o, 1)
      ? `        <div class="lower-third-namerow">
${slot(o, 0, 'lower-third-name', '          ')}
${slot(o, 1, 'lower-third-postnom', '          ')}
        </div>
`
      : '';
    // The rule is emitted UNCONDITIONALLY even though the institution under it is optional.
    // It is the design's `.lower-third-accent` node, and the animation data keyframes that
    // node by selector: an element that comes and goes with a field would leave the timeline
    // (and the line-reveal preset) addressing something that isn't there. With no institution
    // it simply closes the strap, which is a finishing mark rather than a dangling rule.
    const institution = `        <div class="lower-third-accent"></div>
${hasLine(o, 3) ? `${slot(o, 3, 'lower-third-extra', '        ')}\n` : ''}`;

    // A real SPX image field; its id comes after every wizard field so nothing collides.
    const logoField = `f${o.lines.length + o.extraFields.length}`;
    const logoPath = o.logoAssetPath ?? '';
    const mark = o.logoEnabled
      ? `      <!-- The institution mark (image field ${logoField}). Empty shows the placeholder rule. -->
      <div class="lower-third-markbox${logoPath ? ' has-image' : ''}">
        <div class="lower-third-markrule"></div>
        <img id="${logoField}" class="lower-third-logo"${logoPath ? ` src="${logoPath}"` : ' style="display: none"'} alt="" />
      </div>
`
      : '';

    return {
      html: `    <!-- The strap: [name + post-nominals, position, ruled institution] | [institution mark]. -->
    <div class="lower-third-box">
      <div class="lower-third-credit">
${nameRow}${slot(o, 2, 'lower-third-title', '        ')}
${institution}      </div>
${mark}    </div>`,

      extraFields: o.logoEnabled
        ? [
            {
              field: logoField,
              ftype: 'filelist',
              title: 'Institution mark',
              value: logoPath,
              assetfolder: './images/',
              extension: 'png',
            },
          ]
        : [],

      css: `/* The panel — quiet, restrained, wide enough for a real job title. */
.lower-third-box {
  display: flex;                    /* the credit, then the institution's mark */
  align-items: center;              /* the mark is centred against the whole credit */
  gap: calc(${MARK_CLEAR_PX}px * var(--scale));   /* the mark's clear space from the words */
  padding: calc(24px * var(--scale)) calc(52px * var(--scale)) calc(26px * var(--scale)) calc(33px * var(--scale));
  background: var(--panel-bg);      /* the minimal family's quiet panel */
  border-radius: var(--panel-radius);  /* the family's corner radius */
  box-shadow: var(--panel-shadow);  /* the family's panel lift */
  /* Academic job titles are long — and with the mark on, the cap is WIDENED by the mark's column
     (${MARK_WIDTH_PX}px + ${MARK_CLEAR_PX}px) rather than being taken out of it. Measured 2026-08-15
     with a crest and two lines: at the bare 894px the panel hit its cap, the name row broke in
     two under its own flex-wrap, and the strap grew 130 -> 168px (+29.2%). The post-nominals field
     exists to keep a long list from breaking the name across two rows; a mark that squeezes the
     measure breaks it anyway. Widened, the credit keeps its whole measure. */
  max-width: calc(${o.logoEnabled ? MEASURE_PX + MARK_WIDTH_PX + MARK_CLEAR_PX : MEASURE_PX}px * var(--scale));
}

/* The credit column — the words, which keep the panel's stated measure to themselves. */
.lower-third-credit {
  min-width: 0;                     /* lets a long chair title wrap instead of overflowing */
}
${
        o.logoEnabled
          ? `
/* The mark area — on the panel's own surface, not in a filled block: a university crest is
   usually multi-colour artwork with its own field, and a tinted block behind it fights that.

   IT DRAWS NOTHING, SO IT MUST NOT SET THE ROW. It was a fixed 112px box until 2026-08-15,
   commented "fixed, so the artwork never sets the panel's height" — true of the artwork, false of
   the box around it: with two lines the credit column is 80px, so the mark area set the panel's
   height itself. A fixed height on invisible furniture is a height floor and nothing else.
   Stretched instead, it is exactly as tall as the credit beside it, and a crest gets MORE room
   than the old box gave it on the four-line content this design is drawn for (146px, against 112).
   The image is absolute for the same reason: an in-flow one contributes its own height to the row
   even under a max-height, which grows the panel through the back door. */
.lower-third-markbox {
  flex: none;                       /* fixed width; a long title never squeezes the mark */
  align-self: stretch;              /* …and exactly the height of the credit beside it */
  position: relative;               /* the mark below positions against this box */
  display: flex;                    /* centre the placeholder inside it… */
  align-items: center;              /* …vertically… */
  justify-content: center;          /* …and horizontally */
  width: calc(${MARK_WIDTH_PX}px * var(--scale));   /* wide enough that a lockup still reads at width */
}

/* The placeholder — a quiet rule where the mark will be, so an unset slot reads as
   "nothing here yet" rather than as a broken image. */
.lower-third-markrule {
  width: calc(62px * var(--scale));  /* about the width a lockup would take */
  height: calc(2px * var(--scale));  /* a hairline */
  background: var(--text-dim);      /* neutral — the accent belongs to the institution line */
  opacity: 0.5;                     /* a placeholder should read as absent, not as content */
}
.lower-third-markbox.has-image .lower-third-markrule {
  display: none;                    /* a picked mark replaces the placeholder */
}

/* The mark itself (the ${logoField} image field — hidden while empty). Out of flow, so its own
   proportions can never set the panel's height (see the mark area above). */
.lower-third-logo {
  position: absolute;               /* out of flow — the artwork sizes to the area, not the reverse */
  inset: 0;                         /* the whole mark area is the crest's box… */
  width: 100%;                      /* …its full width… */
  height: 100%;                     /* …and its full height */
  object-fit: contain;              /* show the whole mark, centred, never cropped or distorted */
}
`
          : ''
      }

/* The name row: name and post-nominals on one baseline. */
.lower-third-namerow {
  display: flex;                    /* name and qualifications in a row… */
  flex-wrap: wrap;                  /* …wrapping only when the pair genuinely doesn't fit */
  align-items: baseline;            /* the qualifications sit on the name's baseline */
  gap: calc(12px * var(--scale));
  min-width: 0;                     /* allow shrinking */
}
.lower-third-namerow > .lower-third-mask {
  display: flex;                    /* each value hugs its own text… */
  min-width: 0;                     /* …and may shrink */
}

/* The name (f0) — the strap's headline. */
.lower-third-name {
  font-size: calc(45px * var(--scale) * var(--type-scale));  /* headline size (values are 1080p reference) */
  font-weight: 600;                 /* semibold: present without shouting */
  line-height: 1.1;                 /* big text sits tight */
  letter-spacing: var(--display-tracking);  /* the family's display tracking */
  color: var(--text-color);         /* primary text color */
}

/* The post-nominals (f1) — a trailing list, not a second name: smaller, dimmed, and
   preceded by a comma the DESIGN draws, so the field holds qualifications and nothing else. */
.lower-third-postnom {
  font-size: calc(22px * var(--scale) * var(--type-scale));  /* half the name — a suffix */
  font-weight: 500;                 /* medium keeps small caps crisp */
  line-height: 1.2;                 /* single tight row */
  letter-spacing: var(--label-tracking);  /* the family's label tracking */
  color: var(--text-dim);           /* dimmed — the name leads */
}
.lower-third-postnom::before {
  content: ",";                     /* the separator is DRAWN, never typed into the field */
  margin-right: calc(7px * var(--scale));  /* the comma hugs the name it follows */
  margin-left: calc(-12px * var(--scale));  /* pulls back through the row gap, so the comma
                                               sits against the name rather than floating */
}

/* The position (f1's neighbour, f2) — the working description. */
.lower-third-title {
  font-size: calc(26px * var(--scale) * var(--type-scale));  /* clearly below the name */
  font-weight: 400;                 /* regular — hierarchy comes from the name's weight */
  line-height: 1.3;                 /* room for a long chair title to wrap */
  color: var(--text-dim);           /* dimmed — never the primary ink twice */
  margin-top: calc(8px * var(--scale));  /* tied to the name row above it */
}

/* The rule above the institution — the graphic's accent node, and the device that sets
   the institution apart from the job title rather than letting it trail on. */
.lower-third-accent {
  width: calc(47px * var(--scale));  /* a short mark, not a rule across the panel */
  height: calc(2px * var(--scale));  /* a hairline */
  background: var(--accent);        /* the one accent surface */
  margin: calc(15px * var(--scale)) 0 calc(13px * var(--scale));  /* air on both sides — the
                                             bottom margin holds even when the rule closes
                                             the strap with no institution under it */
  transform-origin: left center;    /* line-reveal draws it from this end */
}

/* The institution (f3) — the authority line, in the accent and set in caps. */
.lower-third-extra {
  font-size: calc(20px * var(--scale) * var(--type-scale));  /* small, but the sharpest voice */
  font-weight: 600;                 /* semibold — small tracked caps need the weight */
  line-height: 1.25;                /* room if a long institution wraps */
  letter-spacing: var(--label-tracking);  /* the family's label tracking */
  text-transform: uppercase;        /* the institutional voice */
  color: var(--accent);             /* the strap's one coloured line */
}`,
      hasAccent: true,
    };
  },
);
