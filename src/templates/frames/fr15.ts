// fr15 "Signal HUD" - the technical surround: a head-up display drawn AROUND the shot for a
// gameplay stream, an esports desk, a launch feed or a science demonstration. Sport family,
// sibling of lt05 "Angle Slab" and fr03 "Volt Split".
//
// WINDOW GEOMETRY, in 1920 x 1080 design pixels - put the camera or gameplay source here:
//   x 200 - y 84 - width 1520 - height 855  (a 16:9 window inside the safe area)
// The interior is transparent. Everything the frame draws sits outside that rectangle except
// the corner assemblies, which overlap its edge by their own line weight the way a bracket does.
//
// Why it is a different frame from fr01 "House Cam" rather than the same one in another colour:
// fr01 states the shot with four identical brackets and hangs a nameplate off it. This one is
// an INSTRUMENT - the corners are asymmetric assemblies (a chamfered keyline, a run of circuit
// traces, a cluster of hex nodes), each corner carries its own readout, and a ruled data rail
// runs under the window with the tick marks a scale is read against. The frame is not chrome
// around the picture here; it is the equipment the picture is coming through.
//
// Every glow lives on the DRAWN chrome (keylines, nodes, the rail), never on a text line: the
// name and role sit inside `.frame-mask` reveal wrappers whose overflow would clip a glow in
// half, which reads as a rendering fault rather than as light.

import { paletteById, type TemplateVariant } from '../../model/wizard';
import { fontById, labelFontFaceCss } from '../../model/fonts';
import { defineFrameVariant } from './shared';

export const fr15: TemplateVariant = defineFrameVariant(
  {
    id: 'fr15',
    category: 'frame',
    name: 'Signal HUD',
    styleTag: 'sport',
    description: 'A head-up display around the shot: chamfered corner assemblies, hex nodes, a ruled data rail.',
    maxLines: 4,
    suggestedLines: [
      { title: 'System', sample: 'SIGNAL / CAM 02' },
      { title: 'Status', sample: 'UPLINK STABLE' },
      { title: 'Name', sample: 'Ada Lovelace' },
      { title: 'Detail', sample: 'Flight Systems Lead' },
    ],
    logo: 'none',
    animationPresets: ['frame-draw', 'frame-fade', 'frame-slide'],
    defaultPalette: paletteById('royal'),
    defaultFontId: 'archivo',
    defaultZone: 'mid-center',
  },
  {
    name: 'Signal HUD',
    description:
      'The technical surround: a 16:9 window at x 200, y 84, 1520 x 855 in a 1920 x 1080 ' +
      'frame, held by four chamfered corner assemblies with circuit traces and hex-node ' +
      'clusters, a system readout at the head, a status readout opposite it, and a ruled data ' +
      'rail under the window carrying the nameplate. The window interior is transparent.',
    uicolor: '4',
  },
  (o) => {
    const system = o.lines[0]?.sample || 'SIGNAL / CAM 02';
    const status = o.lines[1]?.sample || 'UPLINK STABLE';
    const name = o.lines[2]?.sample || 'Ada Lovelace';
    const detail = o.lines[3]?.sample || 'Flight Systems Lead';
    return {
      html: `    <div class="frame-box">
      <!-- The camera window: a transparent rectangle held by four corner assemblies. -->
      <div class="frame-window">
        <span class="frame-corner frame-corner-tl"></span>
        <span class="frame-corner frame-corner-tr"></span>
        <span class="frame-corner frame-corner-bl"></span>
        <span class="frame-corner frame-corner-br"></span>
        <!-- The corner ornaments - a hex-node cluster and the circuit trace stepping away from
             it, one per top corner. Drawn as inline SVG because they are LINE ART: a stroked
             path states a honeycomb and a stepped trace exactly, where CSS gradients can only
             approximate them (the first draft did, and painted half-hexagons and floating
             dashes). The stroke follows currentColor, so the accent drives both. -->
        <svg class="frame-ornament frame-ornament-left" viewBox="0 0 300 120" aria-hidden="true">
          <polygon points="36,11 56,22 56,45 36,56 16,45 16,22"></polygon>
          <polygon points="72,31 92,42 92,65 72,76 52,65 52,42"></polygon>
          <polygon points="36,51 56,62 56,85 36,96 16,85 16,62"></polygon>
          <polyline points="104,26 148,26 168,46 244,46"></polyline>
          <circle cx="252" cy="46" r="5"></circle>
        </svg>
        <svg class="frame-ornament frame-ornament-right" viewBox="0 0 300 120" aria-hidden="true">
          <polygon points="36,11 56,22 56,45 36,56 16,45 16,22"></polygon>
          <polygon points="72,31 92,42 92,65 72,76 52,65 52,42"></polygon>
          <polygon points="36,51 56,62 56,85 36,96 16,85 16,62"></polygon>
          <polyline points="104,26 148,26 168,46 244,46"></polyline>
          <circle cx="252" cy="46" r="5"></circle>
        </svg>
      </div>
      <!-- The head readouts - the system on the reading edge, its status opposite. -->
      <div class="frame-readout frame-readout-system">
        <div class="frame-mask"><span id="f0" class="frame-code">${system}</span></div>
      </div>
      <div class="frame-readout frame-readout-status">
        <div class="frame-mask"><span id="f1" class="frame-code">${status}</span></div>
      </div>
      <!-- The data rail under the window: a ruled scale carrying the nameplate. -->
      <div class="frame-rail">
        <div class="frame-rail-ticks"></div>
        <div class="frame-plate">
          <div class="frame-mask"><span id="f2" class="frame-name">${name}</span></div>
          <div class="frame-mask"><span id="f3" class="frame-role">${detail}</span></div>
        </div>
      </div>
    </div>`,

      css: `${labelFontFaceCss(fontById('jetbrains-mono'))}

/* The camera window - the rectangle the switcher fills. The interior stays transparent. */
.frame-window {
  left: calc(200px * var(--scale));     /* window x - see this design's header */
  top: calc(84px * var(--scale));       /* window y */
  width: calc(1520px * var(--scale));   /* window width (16:9 with the height below) */
  height: calc(855px * var(--scale));   /* window height */
  /* A hairline states the whole rectangle so the four corner assemblies read as one frame
     rather than as four marks. It is an INSET shadow, not a border: a border would move the
     window's own box and put the drawn edge out of step with the geometry in the header. */
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 30%, transparent);
}

/* A corner assembly - two arms and a diagonal BRACE across the corner they meet at, which is
   the one shape that separates an instrument frame from a photographer's crop mark. The arms
   are borders and the brace is a short rotated bar, because a clip-path cutting a bordered box
   has to restate every arm's geometry twice and drifts the moment one weight changes.

   The glow is a filter drop-shadow, never a box-shadow: a box-shadow follows the element's BOX,
   so on a corner whose interior is transparent it paints a glowing rectangle around the whole
   shot. A drop-shadow follows what is actually painted - the two arms and the brace. */
.frame-corner {
  position: absolute;              /* each assembly pins to its own corner */
  width: calc(190px * var(--scale));   /* the arm run along the top or bottom… */
  height: calc(120px * var(--scale));  /* …and down the side */
  border: 0 solid var(--accent);   /* the arms are switched on per corner below */
  filter: drop-shadow(0 0 calc(10px * var(--scale)) color-mix(in srgb, var(--accent) 55%, transparent));
}
/* The chamfer - one short bar laid across the corner where the two arms would have met. */
.frame-corner::before {
  content: "";                     /* the drawn chamfer */
  position: absolute;              /* placed at the assembly's own corner */
  width: calc(40px * var(--scale)); /* the cut's length */
  height: calc(3px * var(--scale)); /* the same weight as the arms */
  background: var(--accent);       /* the accent surface */
}
.frame-corner-tl {
  left: calc(-3px * var(--scale));   /* overlap the window edge by the arm's own weight */
  top: calc(-3px * var(--scale));
  border-left-width: calc(3px * var(--scale));   /* the two arms that meet at top-left */
  border-top-width: calc(3px * var(--scale));
}
/* The brace is laid diagonally ACROSS each corner, a hand's width in from where the arms meet -
   the corner-plate motif, and the reason the assembly reads as a bracket bolted on rather than
   as a drawn rectangle. */
.frame-corner-tl::before {
  left: calc(-8px * var(--scale));  /* springing from the vertical arm… */
  top: calc(20px * var(--scale));   /* …down to where the horizontal one starts */
  transform: rotate(-45deg);        /* the 45-degree cut */
  transform-origin: left center;    /* pivot on the vertical arm */
}
.frame-corner-tr {
  right: calc(-3px * var(--scale));
  top: calc(-3px * var(--scale));
  border-right-width: calc(3px * var(--scale));  /* top-right */
  border-top-width: calc(3px * var(--scale));
}
.frame-corner-tr::before {
  right: calc(-8px * var(--scale)); /* mirrored: springing from the right arm */
  top: calc(20px * var(--scale));
  transform: rotate(45deg);         /* the mirrored cut */
  transform-origin: right center;   /* pivot on the vertical arm */
}
.frame-corner-bl {
  left: calc(-3px * var(--scale));
  bottom: calc(-3px * var(--scale));
  border-left-width: calc(3px * var(--scale));   /* bottom-left */
  border-bottom-width: calc(3px * var(--scale));
}
.frame-corner-bl::before {
  left: calc(-8px * var(--scale));
  bottom: calc(20px * var(--scale));
  transform: rotate(45deg);         /* the cut, mirrored vertically */
  transform-origin: left center;
}
.frame-corner-br {
  right: calc(-3px * var(--scale));
  bottom: calc(-3px * var(--scale));
  border-right-width: calc(3px * var(--scale));  /* bottom-right */
  border-bottom-width: calc(3px * var(--scale));
}
.frame-corner-br::before {
  right: calc(-8px * var(--scale));
  bottom: calc(20px * var(--scale));
  transform: rotate(-45deg);        /* the cut, mirrored both ways */
  transform-origin: right center;
}

/* The corner ornaments - the hex-node cluster and its circuit trace, as stroked line art. */
.frame-ornament {
  position: absolute;              /* placed inside the window's top corners */
  top: calc(34px * var(--scale));  /* clear of the corner arms */
  width: calc(300px * var(--scale));   /* the ornament's footprint… */
  height: calc(120px * var(--scale));  /* …in both directions (the SVG's own viewBox) */
  color: var(--accent);            /* the stroke colour every shape below inherits */
  opacity: 0.72;                   /* instrument furniture never competes with the shot */
}
.frame-ornament-left { left: calc(46px * var(--scale)); }   /* inside the top-left assembly */
.frame-ornament-right { right: calc(46px * var(--scale)); transform: scaleX(-1); }  /* mirrored */
/* Line art, not fills: a filled hexagon over a live picture is a blob, an outlined one is a node. */
.frame-ornament polygon,
.frame-ornament polyline,
.frame-ornament circle {
  fill: none;                      /* the shot shows through every shape */
  stroke: currentColor;            /* the accent, inherited from the ornament */
  stroke-width: 2;                 /* a hairline at the SVG's own scale */
  vector-effect: non-scaling-stroke;  /* the weight stays constant however the frame scales */
}
/* The middle node of each cluster is the lit one - a single point of emphasis per corner. */
.frame-ornament polygon:nth-of-type(2) {
  fill: color-mix(in srgb, var(--accent) 22%, transparent);  /* a tint, never a solid */
}

/* The head readouts - mono telemetry lines above the window, one at each end. */
.frame-readout {
  position: absolute;              /* placed against the .frame root, in design px */
  top: calc(40px * var(--scale));  /* on the band above the window */
  display: flex;                   /* the line sits on the readout's baseline */
  align-items: center;             /* vertically centred in the band */
  gap: calc(10px * var(--scale));  /* between the tick and the words */
}
.frame-readout-system { left: calc(200px * var(--scale)); }   /* aligned with the window's left edge */
.frame-readout-status { right: calc(200px * var(--scale)); }  /* aligned with its right edge */
/* Each readout opens with a short accent tick, so a bare line never floats unattached. */
.frame-readout::before {
  content: "";                     /* the drawn tick */
  width: calc(22px * var(--scale)); /* short */
  height: calc(3px * var(--scale)); /* a rule, not a bar */
  background: var(--accent);       /* the accent surface */
  box-shadow: 0 0 calc(12px * var(--scale)) color-mix(in srgb, var(--accent) 50%, transparent);
}
.frame-code {
  max-width: calc(560px * var(--scale));  /* a long readout wraps rather than running on */
  font-family: var(--font-label);  /* the mono telemetry face */
  font-size: calc(22px * var(--scale) * var(--type-scale));  /* label scale, above the type floor */
  font-weight: 700;                /* bold keeps small caps legible over a moving picture */
  line-height: 1.25;               /* compact label leading */
  letter-spacing: var(--label-tracking);  /* the family's label tracking */
  text-transform: uppercase;       /* a readout is always caps */
  color: var(--accent);            /* the instrument's own colour */
}

/* The data rail - a ruled scale under the window, and the nameplate's ground. */
.frame-rail {
  position: absolute;              /* placed against the .frame root, in design px */
  left: calc(200px * var(--scale)); /* aligned with the window's left edge */
  bottom: calc(24px * var(--scale)); /* on the band below the window, clear of its bottom edge */
  display: flex;                   /* ticks then plate… */
  flex-direction: column;          /* …stacked */
  align-items: flex-start;         /* both hang from the rail's left edge */
  gap: calc(10px * var(--scale));  /* the rule and the words read as one unit */
  text-align: left;                /* the anchor zone centres its content - the rail does not:
                                      a scale and its readout are read from one edge */
}

/* The tick scale - evenly repeated marks under a hairline, the way an instrument rules a range. */
.frame-rail-ticks {
  width: calc(660px * var(--scale));  /* the scale's run */
  height: calc(14px * var(--scale));  /* the tick height */
  background:
    linear-gradient(90deg, var(--accent), color-mix(in srgb, var(--accent) 15%, transparent)) top left / 100% calc(2px * var(--scale)) no-repeat,
    repeating-linear-gradient(90deg, color-mix(in srgb, var(--accent) 70%, transparent) 0 calc(2px * var(--scale)), transparent calc(2px * var(--scale)) calc(26px * var(--scale))) bottom left / 100% calc(9px * var(--scale)) no-repeat;
}

/* The nameplate - the one place on the frame set in the display face rather than the mono one. */
.frame-plate {
  display: flex;                   /* name over detail… */
  flex-direction: column;          /* …stacked */
  gap: calc(4px * var(--scale));   /* the two lines read as one unit */
  will-change: transform, opacity; /* hint the browser: the plate settles in after the chrome */
}
.frame-name {
  max-width: calc(620px * var(--scale));  /* a very long name wraps rather than running on */
  font-size: calc(40px * var(--scale) * var(--type-scale));  /* nameplate size (1080p reference) */
  font-weight: var(--display-weight);  /* the family's display weight */
  line-height: 1.1;                /* headline leading */
  letter-spacing: var(--display-tracking);  /* the family's display tracking */
  color: var(--text-color);        /* primary text colour */
}
.frame-role {
  max-width: calc(620px * var(--scale));  /* the same wrap cap as the name */
  font-family: var(--font-label);  /* the mono telemetry face, as on the readouts */
  font-size: calc(21px * var(--scale) * var(--type-scale));  /* label scale */
  font-weight: 700;                /* bold keeps small caps legible over video */
  line-height: 1.25;               /* compact label leading */
  letter-spacing: var(--label-tracking);  /* the family's label tracking */
  text-transform: uppercase;       /* reads as a role, whatever the operator types */
  color: var(--text-dim);          /* stepped back from the name above it */
}`,

      fields: [
        { field: 'f0', ftype: 'textfield', title: o.lines[0]?.title || 'System', value: system },
        { field: 'f1', ftype: 'textfield', title: o.lines[1]?.title || 'Status', value: status },
        { field: 'f2', ftype: 'textfield', title: o.lines[2]?.title || 'Name', value: name },
        { field: 'f3', ftype: 'textfield', title: o.lines[3]?.title || 'Detail', value: detail },
      ],
      tokens: {
        // The mono telemetry face is this design's own second typeface, exactly as the house
        // family's label face is: the readouts are instrument text and must not follow the
        // heading font when an operator swaps it.
        fontLabel: `'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace`,
        labelTracking: '0.16em',
      },
    };
  },
);
