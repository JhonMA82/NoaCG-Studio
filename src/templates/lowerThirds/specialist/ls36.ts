// ls36 "Dateline Slate" — where the footage is, to the decimal, and what the hour is there.
//
// The documentary and long-form location super. It is not a news locator: a bulletin says
// "KYIV" because the audience needs a place name, while a field-report slate says exactly
// where the camera stood and what time it was standing there. That is a production record as
// much as a caption — it is what the edit, the archive and the rights log will be checked
// against later — which is why the coordinates are set in a monospaced face: a figure that is
// going to be read back digit by digit should be set like one.
//
// The hour is COMPUTED, never typed. A slate that carries a hand-typed time is wrong the
// moment the strap stays up longer than expected, and on a remote shoot the machine cutting
// the programme is rarely in the same zone as the picture. So the operator sets a UTC offset
// in a hidden input-only field (the ls30 pattern, shared zoneClockJs runtime) and the design
// does the arithmetic on every tick — one template for any location on earth.
//
// The family's rules hold throughout: no panel edge anywhere, a single 1px hairline as the
// only drawn element, light type opened up with positive tracking, and readability from a
// lateral scrim rather than from a box.

import { paletteById, type TemplateVariant } from '../../../model/wizard';
import { MONO_STACK, fontById, labelFontFaceCss } from '../../../model/fonts';
import { dataSourceCss } from '../../shared/base';
import { defineVariant } from '../shared';
import { TABULAR_FIGURES, hasLine, slot, zoneClockJs } from './shared';

const CLOCK_ELEMENT = 'lower-third-clock';

export const ls36: TemplateVariant = defineVariant(
  {
    id: 'ls36',
    category: 'lower-third',
    name: 'Dateline Slate',
    styleTag: 'cinematic',
    description: 'A place, its coordinates in monospace, and the local hour computed from a UTC offset.',
    maxLines: 3,
    suggestedLines: [
      { title: 'Place', sample: 'Longyearbyen, Svalbard' },
      { title: 'Coordinates', sample: '78.2232° N  15.6267° E' },
      { title: 'Zone', sample: 'CEST' },
    ],
    logo: 'none',
    // Fade: the family's own entrance. Nothing travels far and nothing overshoots — a slate
    // that arrives with a move reads as a news graphic, which is the voice this one is not.
    animationPresets: ['fade', 'blur-in', 'line-reveal', 'slide-up', 'mask-wipe', 'slide-left'],
    defaultPalette: paletteById('ember'),
    defaultFontId: 'sora',
    // Anchored TOP-left rather than in the lower third's usual corner. A location slate and a
    // name super routinely need to be on air in the same shot — the contributor is introduced
    // while the place is still established — and a slate that sits where the name goes forces
    // an operator to choose between them. Above the action it never collides, and the
    // documentary convention it comes from puts it there anyway.
    defaultZone: 'top-left',
  },
  {
    name: 'Dateline Slate',
    description:
      'The field-report slate: the place, its coordinates set in a monospaced face because they ' +
      'are read back digit by digit, and the LOCAL hour — computed from a UTC offset the ' +
      'operator sets in a hidden SPX field rather than typed, so it cannot go stale while the ' +
      'strap is up. Set the offset (+1 Svalbard, -3 Patagonia) and the same template serves ' +
      'any location. Sibling of lt35 Letterbox.',
    uicolor: '5',
  },
  (o) => {
    // The offset is INPUT-ONLY: a real SPX field the operator sets, held in a hidden div so
    // the runtime can read it on every tick without it ever being drawn. Its id comes after
    // every wizard field so nothing collides.
    const offsetField = `f${o.lines.length + o.extraFields.length}`;

    return {
      html: `    <!-- The slate: [hairline column] | [place] over [coordinates · local hour · zone]. -->
    <div class="lower-third-box">
      <div class="lower-third-accent"></div>
      <div class="lower-third-text">
${slot(o, 0, 'lower-third-name', '        ')}
        <div class="lower-third-metarow">
${slot(o, 1, 'lower-third-coords', '          ')}
          <!-- The hour — paintZoneClock() (in the JS) computes this from the offset below. -->
          <div class="lower-third-clockcell">
            <span id="${CLOCK_ELEMENT}" class="lower-third-clock">14:32</span>
${hasLine(o, 2) ? `            <div class="lower-third-mask"><span id="f2" class="lower-third-zone">${o.lines[2].sample}</span></div>\n` : ''}          </div>
        </div>
      </div>
    </div>
    <!-- ${offsetField}: this location's UTC offset in hours (+1 Svalbard · 0 Reykjavík · -3
         Patagonia). Input only — the runtime reads it, nothing draws it. Decimals work: 5.75
         for Kathmandu. -->
    <div id="${offsetField}" class="noacg-data-source">1</div>`,

      extraFields: [
        {
          field: offsetField,
          ftype: 'number',
          title: 'UTC offset (hours)',
          value: '1',
        },
      ],

      runtimeExtraJs: zoneClockJs(CLOCK_ELEMENT, offsetField),

      css: `${labelFontFaceCss(fontById('jetbrains-mono'))}

/* The scrim — anchored at the block's left edge and falling away in every direction, so the
   words are readable and the graphic still has no edge anywhere. A purely lateral fade leaves
   a hard top and bottom, which is the panel look this family exists to avoid. */
.lower-third-box {
  display: flex;                    /* the hairline column beside the words, never above them */
  align-items: stretch;             /* the hairline runs the whole block's height */
  gap: calc(26px * var(--scale));   /* the rule's clear space from the type */
  padding: calc(30px * var(--scale)) calc(160px * var(--scale)) calc(30px * var(--scale)) calc(38px * var(--scale));
  background: radial-gradient(ellipse 130% 165% at 0% 50%,
              var(--panel-bg) 0%,
              color-mix(in srgb, var(--panel-bg) 50%, transparent) 50%,
              transparent 100%);    /* darkest at the anchored edge, gone in every direction */
  filter: drop-shadow(0 2px 14px rgba(0, 0, 0, 0.5));  /* the family's separation, on the box */
}

/* The hairline — the only drawn element on the graphic, and its accent NODE. */
.lower-third-accent {
  flex: none;                       /* never squeezed */
  width: var(--accent-weight);      /* the family's 1px hairline */
  background: var(--accent);        /* bone or ember — cinema colour, not signal colour */
  transform-origin: center top;     /* line-reveal draws the rule downward */
}

.lower-third-text {
  min-width: 0;                     /* let it shrink so a long place name wraps */
}

/* The place (f0) — cinema setting: light weight, wide tracking, generous leading. */
.lower-third-name {
  font-size: calc(42px * var(--scale) * var(--type-scale));  /* headline size (values are 1080p reference) */
  font-weight: var(--display-weight);  /* the family's display weight (400 — light, not bold) */
  line-height: 1.18;                /* light type needs more air than heavy type */
  letter-spacing: var(--display-tracking);  /* POSITIVE — the family's type opens up */
  color: var(--text-color);         /* primary text color */
}

/* The record row: the coordinates, then the hour and its zone. */
.lower-third-metarow {
  display: flex;                    /* coordinates and hour in a row… */
  flex-wrap: wrap;                  /* …wrapping only if the coordinates run long */
  align-items: center;              /* the divider and both values share a centre line */
  gap: calc(22px * var(--scale));
  margin-top: calc(18px * var(--scale));  /* the record is its own beat, below the place */
  min-width: 0;                     /* allow shrinking */
}
.lower-third-metarow > .lower-third-mask {
  display: flex;                    /* each value hugs its own text… */
  min-width: 0;                     /* …and may shrink */
}

/* The coordinates (f1) — monospaced on purpose: a figure that will be read back digit by
   digit should be set in a face whose digits hold a column. */
.lower-third-coords {
  font-family: ${MONO_STACK};  /* the design's own bundled mono face */
  font-size: calc(20px * var(--scale) * var(--type-scale));  /* a record line, not a headline */
  font-weight: 400;                 /* regular — mono at weight is hard to read */
  line-height: 1.35;                /* room if the pair wraps */
  letter-spacing: 0.02em;           /* a touch of air between figures */
  color: var(--text-dim);           /* dimmed — never the primary ink twice */
}

/* The hour cell — closed off from the coordinates by a drawn rule, so the two records do not
   read as one long number. */
.lower-third-clockcell {
  display: flex;                    /* the hour and its zone on one baseline */
  align-items: baseline;            /* …sharing it */
  gap: calc(12px * var(--scale));
  padding-left: calc(22px * var(--scale));  /* the rule's clear space */
  border-left: 1px solid color-mix(in srgb, var(--text-color) 22%, transparent);  /* the divider */
}

/* The computed hour. Tabular figures so the minute turning never nudges the row's width. */
.lower-third-clock {
  font-family: ${MONO_STACK};  /* set with the coordinates: both are machine records */
  font-size: calc(30px * var(--scale) * var(--type-scale));  /* reads at a glance */
  font-weight: 400;                 /* regular — the family never sets weight for emphasis */
  line-height: 1.2;                 /* one tight figure */
  letter-spacing: 0.02em;           /* a touch of air between figures */
  ${TABULAR_FIGURES}
  color: var(--text-color);         /* primary text color */
  white-space: nowrap;              /* a clock never wraps */
}

/* The zone (f2) — the family's signature wide tracked caps, and the first line to drop. */
.lower-third-zone {
  font-size: calc(21px * var(--scale) * var(--type-scale));  /* a step above the coordinates:
                                                                a zone is read, coordinates are
                                                                checked */
  font-weight: 500;                 /* medium keeps tracked caps crisp at this size */
  line-height: 1.4;                 /* wide tracking needs matching leading */
  letter-spacing: var(--label-tracking);  /* 0.34em — the family's signature */
  text-transform: uppercase;        /* CEST, whatever the operator types */
  color: var(--label-color);        /* dimmed — colour belongs to the footage in this family */
  white-space: nowrap;              /* a zone abbreviation never breaks */
}

${dataSourceCss}`,
      hasAccent: true,
    };
  },
);
