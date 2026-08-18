// ls35 "Caller Strap" — the person who is on the line rather than in the room.
//
// A contributor joining by phone, satellite phone or a bad video link is a different editorial
// object from a guest on the sofa, and the strap has to say so. If it does not, the audience
// reads a black screen or a frozen frame as a fault in the broadcast instead of as the
// expected picture for a voice call, and a newsroom fields complaints about it.
//
// So the CALL TYPE leads and it is a field, not a baked word: PHONE, LINE, SATELLITE, VIDEO
// LINK, ON THE LINE — every organisation words it differently and several word it differently
// per bulletin. A state's word is a field.
//
// The waveform is the second half of the same claim, made visually. It is DRAWN and it is
// STATIC: a bar chart of the audio a viewer cannot see, in the house amber, sitting where a
// picture would be. Deliberately not animated — a moving meter that is not driven by real
// audio is a lie about the signal, and a graphic that pretends to measure something it cannot
// reach is worse than one that simply marks the format.

import { paletteById, type TemplateVariant } from '../../../model/wizard';
import { sampleName } from '../../shared/sampleNames';
import { defineVariant } from '../shared';
import { hasLine, slot } from './shared';

/** The drawn waveform's bar heights, at 1080p reference. Uneven on purpose — an even comb
 *  reads as an equaliser graphic, and a symmetric one reads as a logo. */
const WAVE_BARS = [18, 34, 52, 40, 62, 30, 44, 22];

export const ls35: TemplateVariant = defineVariant(
  {
    id: 'ls35',
    category: 'lower-third',
    name: 'Caller Strap',
    styleTag: 'noacg',
    description: 'A caller on the line: call-type chip, drawn waveform, name and location.',
    maxLines: 3,
    suggestedLines: [
      { title: 'Call type', sample: 'Phone' },
      { title: 'Caller', sample: sampleName('ls35') },
      { title: 'Location', sample: 'Reporting from Odesa' },
    ],
    logo: 'none',
    // Slide left: the strap arrives along the rail's own axis, the way a house lower third
    // does — the caller is joining the programme, not interrupting it.
    animationPresets: ['slide-left', 'line-reveal', 'mask-wipe', 'fade', 'slide-up', 'blur-in'],
    defaultPalette: paletteById('noacg'),
    defaultFontId: 'space-grotesk',
    defaultZone: 'bottom-left',
  },
  {
    name: 'Caller Strap',
    description:
      'The remote-contributor strap: a CALL TYPE chip (phone, line, satellite — whatever the ' +
      'bulletin calls it, as its own SPX field), a drawn waveform standing in for the picture ' +
      'there isn’t, and the caller with where they are. The waveform is deliberately static: an ' +
      'animated meter not driven by real audio would be a claim about the signal.',
    uicolor: '6',
  },
  (o) => {
    // The waveform is the design's own furniture — one bar per entry, each given its height by
    // an :nth-child rule below, so the markup stays free of inline styles and an editor can
    // change the shape by editing eight numbers in the CSS.
    const wave = WAVE_BARS.map(() => '        <div class="lower-third-wavebar"></div>').join('\n');

    return {
      html: `    <!-- The strap: [house bar] [drawn waveform] | [call-type chip · location] over [caller]. -->
    <div class="lower-third-box">
      <div class="lower-third-accent"></div>
      <!-- The waveform — drawn furniture, not data. Static by design (see the file header). -->
      <div class="lower-third-wave" aria-hidden="true">
${wave}
      </div>
      <div class="lower-third-text">
        <div class="lower-third-headrow">
${hasLine(o, 0) ? `          <div class="lower-third-mask lower-third-chipwrap"><span id="f0" class="lower-third-chip">${o.lines[0].sample}</span></div>\n` : ''}${slot(o, 2, 'lower-third-extra', '          ')}
        </div>
${slot(o, 1, 'lower-third-name', '        ')}
      </div>
    </div>`,

      css: `/* The strap — the house void, blurred, with the 8px amber bar fused to its left edge.

   Three declared tracks rather than a flex row: the bar and the waveform well are FIXED
   furniture whose width must not answer to the words, and stating them as columns says so
   once instead of repeating flex-none on every cell. */
.lower-third-box {
  display: grid;                    /* bar, waveform, words — one horizontal run */
  grid-template-columns: var(--accent-weight) auto minmax(0, 1fr);  /* two fixed tracks, then the words */
  align-items: stretch;             /* the bar and the waveform run the strap's full height */
  background: var(--panel-bg);      /* the house void */
  backdrop-filter: var(--panel-blur);  /* the family's panel treatment */
  -webkit-backdrop-filter: var(--panel-blur);  /* Safari spelling of the same effect */
  box-shadow: var(--panel-shadow);  /* the family's deep lift */
  min-width: calc(600px * var(--scale));  /* a broadcast-width strap even behind a short name */
}

/* The house bar — the family's signature accent edge, and this design's accent NODE. Its
   width is the grid track's; the declaration here is what the track was sized from. */
.lower-third-accent {
  width: var(--accent-weight);      /* the family's 8px bar */
  background: var(--accent);        /* the one accent surface */
  box-shadow: var(--accent-glow);   /* the restrained house glow, on the accent only */
  transform-origin: center top;     /* line-reveal draws the bar downward */
}

/* The waveform well — a fixed column beside the bar, so a long name can never squeeze the
   motif and the motif can never set the strap's height. */
.lower-third-wave {
  display: flex;                    /* the bars in a row… */
  align-items: center;              /* …centred on the strap's midline… */
  justify-content: center;          /* …and centred in their own well */
  gap: calc(5px * var(--scale));    /* the comb's spacing */
  width: calc(112px * var(--scale));  /* wide enough to read as a waveform at broadcast size */
  padding: 0 calc(22px * var(--scale)) 0 calc(24px * var(--scale));
  box-sizing: content-box;          /* the width above is the BARS' room, padding on top of it */
}

/* One bar. The heights come from the :nth-child rules below — uneven, so the comb reads as
   audio rather than as an equaliser graphic. */
.lower-third-wavebar {
  width: calc(4px * var(--scale));  /* a thin stroke */
  border-radius: calc(2px * var(--scale));  /* rounded ends, like a meter's */
  background: var(--accent);        /* the same amber as the bar — one colour, two doses */
  opacity: 0.85;                    /* a shade back from the bar, so the bar still leads */
}
.lower-third-wavebar:nth-child(1) { height: calc(${WAVE_BARS[0]}px * var(--scale)); }  /* the comb's shape, */
.lower-third-wavebar:nth-child(2) { height: calc(${WAVE_BARS[1]}px * var(--scale)); }  /* eight numbers, */
.lower-third-wavebar:nth-child(3) { height: calc(${WAVE_BARS[2]}px * var(--scale)); }  /* edit them freely — */
.lower-third-wavebar:nth-child(4) { height: calc(${WAVE_BARS[3]}px * var(--scale)); }  /* nothing else reads */
.lower-third-wavebar:nth-child(5) { height: calc(${WAVE_BARS[4]}px * var(--scale)); }  /* them. */
.lower-third-wavebar:nth-child(6) { height: calc(${WAVE_BARS[5]}px * var(--scale)); }
.lower-third-wavebar:nth-child(7) { height: calc(${WAVE_BARS[6]}px * var(--scale)); }
.lower-third-wavebar:nth-child(8) { height: calc(${WAVE_BARS[7]}px * var(--scale)); }

/* The words. */
.lower-third-text {
  display: flex;                    /* the head row over the caller… */
  flex-direction: column;           /* …top to bottom */
  justify-content: center;          /* vertically centred against the waveform */
  min-width: 0;                     /* let it shrink so long names wrap instead of overflowing */
  padding: calc(20px * var(--scale)) calc(44px * var(--scale)) calc(22px * var(--scale)) 0;
}

/* The head row — the call-type chip and where the caller is, on one baseline. */
.lower-third-headrow {
  display: flex;                    /* chip and location in a row… */
  flex-wrap: wrap;                  /* …wrapping only if the location runs long */
  align-items: center;              /* the chip's plate centred against the location's text */
  gap: calc(15px * var(--scale));
  margin-bottom: calc(10px * var(--scale));  /* air above the caller's name */
  min-width: 0;                     /* allow shrinking */
}
.lower-third-headrow > .lower-third-mask {
  display: flex;                    /* each value hugs its own text… */
  min-width: 0;                     /* …and may shrink */
}

/* The chip's wrapper carries the plate's bound, so a sentence typed into the call type
   clips inside the chip instead of pushing the location off the strap. */
.lower-third-chipwrap {
  max-width: calc(300px * var(--scale));  /* the widest a call-type wording ever needs */
  overflow: hidden;                 /* the clip is what makes the max-width real (bench) */
}

/* The call type (f0) — a solid amber plate in dark mono caps: the house label voice. */
.lower-third-chip {
  display: block;                   /* so the width bound and the ellipsis apply */
  max-width: calc(300px * var(--scale));  /* the wrapper's inner width — the measured cap */
  padding: calc(7px * var(--scale)) calc(17px * var(--scale));
  background: var(--accent);        /* the one solid accent surface */
  font-family: var(--font-label);   /* the family's mono label face */
  font-size: calc(20px * var(--scale) * var(--type-scale));  /* small — urgency is contrast, not size */
  font-weight: 700;                 /* bold mono caps read as a stamp */
  line-height: 1.15;                /* one tight chip row */
  letter-spacing: var(--label-tracking);  /* the family's label tracking */
  text-transform: uppercase;        /* PHONE, whatever the operator types */
  color: var(--accent-ink);         /* dark ink on the amber plate */
  white-space: nowrap;              /* the chip never wraps… */
  overflow: hidden;                 /* …and a too-long value is clipped… */
  text-overflow: ellipsis;          /* …with an honest ellipsis */
}

/* Where the caller is (f2) — reference, beside the chip rather than under the name. A hair
   larger than the chip beside it: the chip is a format marker and this is a fact about the
   contribution, so the reading order between them has to be unambiguous. */
.lower-third-extra {
  font-size: calc(22px * var(--scale) * var(--type-scale));  /* just above the chip's voice */
  font-weight: 400;                 /* regular — reference, not billing */
  line-height: 1.3;                 /* room if it wraps */
  letter-spacing: 0.01em;           /* a hair of air; nothing like the chip's tracking */
  color: var(--text-dim);           /* dimmed — never the primary ink twice */
}

/* The caller (f1) — the strap's headline. */
.lower-third-name {
  font-size: calc(45px * var(--scale) * var(--type-scale));  /* headline size (values are 1080p reference) */
  font-weight: var(--display-weight);  /* the family's display weight */
  line-height: 1.1;                 /* big text sits tight */
  letter-spacing: var(--display-tracking);  /* the family's display tracking */
  color: var(--text-color);         /* primary text color */
}`,
      hasAccent: true,
    };
  },
);
