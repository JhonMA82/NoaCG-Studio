// Stinger archetypes — the mechanism round. The first ten transitions all cover the frame by
// TRAVEL (slabs, bands, columns); these eight add the covering mechanisms broadcast stinger
// packs actually trade in: an iris bloom, a spinning kaleidoscope, an organic blob roll, a HUD
// grid, a chevron train, a full-frame word, a light gradient drift and a white flash. Two of
// them ride the new scale/rotation presets (transition-iris / transition-spin); the rest shape
// their covering surfaces and ride the travel presets.
//
// Same authoring contract as premiumArchetypes.ts: every design's REST pose is the fully
// covered cut point, every panel carries .transition-premium-panel so resetTransitionPanels()
// restores the authored geometry after the out, and the transition TYPE's timer machine does
// the clearing.
//
// Centre-anchored surfaces (the discs and rotors) size themselves in vmax, not px: the frame
// diagonal is ~114.7vmax at 16:9, so a 125vmax disc covers every corner at any resolution —
// a fixed px disc drawn for 1080p would leave 4K corners bare.

import { archetype, panelBase } from './premiumArchetypes';
import type { TemplateVariant } from '../../model/wizard';

/** Label base for designs that do not use panelBase (their covers are shaped, not full-rect). */
function labelCss(extra = ''): string {
  return `.transition-label {
  font-family: var(--font-label);
  font-size: calc(72px * var(--scale) * var(--type-scale));
  font-weight: var(--display-weight);
  line-height: 1;
  letter-spacing: var(--display-tracking);
  text-transform: uppercase;
  color: var(--text-color);
  text-shadow: 0 8px 34px rgba(0, 0, 0, 0.42);
${extra}}
.transition-mask {
  overflow: visible;                    /* stinger presets animate the mark, not text inside it */
  padding-block: calc(12px * var(--scale));  /* full-size display glyphs stay inside the reveal */
  margin-block: calc(-12px * var(--scale));  /* preserve the lockup's authored centre */
}
.transition-label:empty { display: none; }`;
}

/** A centre-anchored covering disc: large enough for the frame diagonal at every resolution. */
function discCss(selector: string, size: string, background: string): string {
  return `${selector} {
  left: 50%;                       /* centre-anchored… */
  top: 50%;
  width: ${size};                  /* …and sized against the frame diagonal (~114.7vmax) */
  height: ${size};
  margin-left: calc(${size} / -2); /* centred without a CSS transform — GSAP owns transform */
  margin-top: calc(${size} / -2);
  border-radius: 50%;              /* a disc: rotation and overshoot can never bare a corner */
  background: ${background};
}`;
}

// ── tr11 · Orbit Burst — concentric discs bloom from the centre ─────────────────────────────
const orbit = archetype({
  id: 'tr11',
  name: 'Orbit Burst',
  description: 'Concentric discs bloom from the centre until the frame is covered, then collapse onto the new picture.',
  styleTag: 'minimal',
  paletteId: 'signal',
  fontId: 'archivo',
  sample: 'UP NEXT',
  presets: ['transition-iris', 'transition-spin', 'transition-sweep'],
  design: () => ({
    html: `    <div class="transition-box">
      <div class="transition-panel transition-premium-panel orbit-a"></div>
      <div class="transition-panel transition-premium-panel orbit-b"></div>
      <div class="transition-panel transition-premium-panel orbit-c"></div>
      <div class="transition-mark"><div class="transition-mask">
        <span id="f0" class="transition-label">UP NEXT</span>
      </div></div>
    </div>`,
    css: `/* Three flat discs, largest underneath: at rest the big one covers the frame and the
   smaller two read as concentric rings — the whole design is circles and one accent. */
${discCss('.orbit-a', '125vmax', 'var(--accent)')}
${discCss('.orbit-b', '78vmax', 'var(--panel-bg)')}
${discCss('.orbit-c', '42vmax', 'color-mix(in srgb, var(--accent) 22%, var(--panel-bg))')}
.orbit-c {
  /* The innermost disc holds the lockup, so it gets the one drawn edge. */
  box-shadow: inset 0 0 0 calc(2px * var(--scale)) color-mix(in srgb, var(--text-color) 24%, transparent);
}
${labelCss()}`,
  }),
});

// ── tr12 · Kaleido Pulse — a neon rotor spins up to cover ───────────────────────────────────
const kaleido = archetype({
  id: 'tr12',
  name: 'Kaleido Pulse',
  description: 'A radial kaleidoscope rotor spins up over the frame, pulses, and spins on out.',
  styleTag: 'sport',
  paletteId: 'volt',
  fontId: 'saira',
  sample: 'ROUND TWO',
  presets: ['transition-spin', 'transition-iris', 'transition-slam'],
  design: () => ({
    html: `    <div class="transition-box">
      <div class="transition-panel transition-premium-panel kaleido-base"></div>
      <div class="transition-panel transition-premium-panel kaleido-rotor">
        <svg class="kaleido-rings" viewBox="0 0 1000 1000" aria-hidden="true">
          <!-- One motif mirrored the way a kaleidoscope mirrors: rings of dashes and two
               nested hexagons. Rotation is what animates; the drawing itself is still. -->
          <circle cx="500" cy="500" r="430" class="kaleido-dash"></circle>
          <circle cx="500" cy="500" r="320" class="kaleido-dot"></circle>
          <circle cx="500" cy="500" r="210" class="kaleido-dash"></circle>
          <polygon points="500,180 777,340 777,660 500,820 223,660 223,340" class="kaleido-hex"></polygon>
          <polygon points="500,320 656,410 656,590 500,680 344,590 344,410" class="kaleido-hex kaleido-hex-accent"></polygon>
        </svg>
      </div>
      <div class="transition-mark"><div class="transition-mask">
        <span id="f0" class="transition-label">ROUND TWO</span>
      </div></div>
    </div>`,
    css: `/* A dark base disc covers; the rotor disc above it carries the ring drawing. Both are
   radially symmetric, so the spin preset can never bare a corner mid-rotation. */
${discCss('.kaleido-base', '125vmax', 'radial-gradient(circle, #14170f 0%, #0a0c07 62%, #050604 100%)')}
${discCss('.kaleido-rotor', '125vmax', 'transparent')}
.kaleido-rings {
  position: absolute;
  inset: 0;                        /* the SVG fills its rotor disc */
  width: 100%;
  height: 100%;
}
.kaleido-rings circle,
.kaleido-rings polygon {
  fill: none;
  stroke: color-mix(in srgb, var(--accent) 72%, transparent);
  stroke-width: 3;
}
.kaleido-dash { stroke-dasharray: 34 22; }          /* segmented outer rings */
.kaleido-dot  { stroke-dasharray: 4 30; stroke-width: 8; stroke-linecap: round; }
.kaleido-hex  { stroke-width: 4; }
.kaleido-hex-accent {
  stroke: var(--accent);
  filter: drop-shadow(0 0 12px color-mix(in srgb, var(--accent) 55%, transparent));
}
${labelCss(`  padding: calc(14px * var(--scale)) calc(34px * var(--scale));
  background: var(--accent);
  color: var(--accent-ink);
  transform: skewX(-8deg);         /* the family lean — static, so GSAP never fights it */
`)}`,
  }),
});

// ── tr13 · Bloom Roll — organic covers roll up over the frame ───────────────────────────────
const bloom = archetype({
  id: 'tr13',
  name: 'Bloom Roll',
  description: 'Soft organic covers roll up over the frame in layers and lift away again.',
  styleTag: 'glass',
  paletteId: 'orchid',
  fontId: 'sora',
  sample: 'WELCOME BACK',
  presets: ['transition-sweep', 'transition-iris'],
  design: () => ({
    html: `    <div class="transition-box">
      <div class="transition-panel transition-premium-panel bloom-back"></div>
      <div class="transition-panel transition-premium-panel bloom-front">
        <span class="bloom-pearl bloom-pearl-a"></span>
        <span class="bloom-pearl bloom-pearl-b"></span>
        <span class="bloom-pearl bloom-pearl-c"></span>
      </div>
      <div class="transition-mark"><div class="transition-mask">
        <span id="f0" class="transition-label">WELCOME BACK</span>
      </div></div>
    </div>`,
    css: `/* Two over-tall covers whose TOP edge is a drawn curve: risen to the cut point they
   overfill the frame, and while they travel the curve reads as a rolling blob. The
   gradient stays adjacent-hue — the accent and a deeper mix of itself. */
.bloom-back,
.bloom-front {
  left: -4%;                       /* wider than the frame both sides… */
  width: 108%;
  top: -34%;                       /* …and taller by more than the crown's deepest dip, */
  height: 152%;                    /* so the curved top can never bare a frame corner */
}
.bloom-back {
  border-radius: 52% 48% 0 0 / 16% 12% 0 0;   /* the organic crown — shallow, corner-safe */
  background: linear-gradient(120deg,
    color-mix(in srgb, var(--accent) 55%, var(--panel-bg)) 0%,
    var(--panel-bg) 78%);
}
.bloom-front {
  border-radius: 44% 56% 0 0 / 10% 15% 0 0;   /* a different crown, so the layers read */
  background: linear-gradient(135deg,
    var(--accent) 0%,
    color-mix(in srgb, var(--accent) 46%, var(--panel-bg)) 100%);
}
/* Three pearls float on the front cover — the one decorative dose. */
.bloom-pearl {
  position: absolute;
  border-radius: 50%;
  background: color-mix(in srgb, var(--text-color) 26%, transparent);
}
.bloom-pearl-a { left: 16%; top: 30%; width: calc(120px * var(--scale)); height: calc(120px * var(--scale)); }
.bloom-pearl-b { right: 14%; top: 22%; width: calc(64px * var(--scale)); height: calc(64px * var(--scale)); }
.bloom-pearl-c {
  left: 68%; bottom: 18%;
  width: calc(180px * var(--scale)); height: calc(180px * var(--scale));
  background: transparent;
  box-shadow: inset 0 0 0 calc(2px * var(--scale)) color-mix(in srgb, var(--text-color) 30%, transparent);
}
${labelCss()}`,
  }),
});

// ── tr14 · Signal Grid — a HUD band wipe with a dot matrix ──────────────────────────────────
const signalGrid = archetype({
  id: 'tr14',
  name: 'Signal Grid',
  description: 'A broadcast HUD cover: signal bands, a dot matrix and a locked centre chip.',
  styleTag: 'noacg',
  paletteId: 'noacg',
  fontId: 'space-grotesk',
  sample: 'LIVE SIGNAL',
  presets: ['transition-wipe', 'transition-slam', 'transition-sweep'],
  design: () => ({
    html: `    <div class="transition-box">
      <div class="transition-panel transition-premium-panel">
        <div class="grid-band grid-band-top"></div>
        <div class="grid-band grid-band-bottom"></div>
        <div class="grid-matrix grid-matrix-left"></div>
        <div class="grid-matrix grid-matrix-right"></div>
      </div>
      <div class="transition-mark"><div class="transition-mask">
        <span id="f0" class="transition-label">LIVE SIGNAL</span>
      </div></div>
    </div>`,
    css: `${panelBase('linear-gradient(180deg, #10151d 0%, #0a0e14 52%, #07090d 100%)')}
/* Two amber signal bands frame the centre — the rectangular sibling of tr05's reticle. */
.grid-band {
  position: absolute;
  left: 0;
  right: 0;
  height: calc(10px * var(--scale));
  background: var(--accent);
  box-shadow: var(--accent-glow);
}
.grid-band-top { top: 22%; }
.grid-band-bottom { bottom: 22%; }
/* Dot matrices, drawn with a repeating gradient so there is nothing to keep in sync. */
.grid-matrix {
  position: absolute;
  width: calc(260px * var(--scale));
  height: calc(120px * var(--scale));
  background-image: radial-gradient(circle,
    color-mix(in srgb, var(--accent) 60%, transparent) calc(2.5px * var(--scale)),
    transparent calc(3px * var(--scale)));
  background-size: calc(20px * var(--scale)) calc(20px * var(--scale));
}
.grid-matrix-left { left: 6%; top: 8%; }
.grid-matrix-right { right: 6%; bottom: 8%; }
.transition-label {
  padding: calc(16px * var(--scale)) calc(38px * var(--scale));
  background: var(--accent);
  color: var(--accent-ink);
  box-shadow: var(--accent-glow);
}`,
  }),
});

// ── tr15 · Chevron Train — a train of arrowheads slams across ───────────────────────────────
const chevron = archetype({
  id: 'tr15',
  name: 'Chevron Train',
  description: 'A train of interlocking chevrons slams across the frame and carries on out.',
  styleTag: 'sport',
  paletteId: 'inferno',
  fontId: 'oswald',
  sample: 'HIGHLIGHTS',
  presets: ['transition-slam', 'transition-wipe'],
  design: () => ({
    html: `    <div class="transition-box">
      <div class="transition-panel transition-premium-panel chev chev-lead"></div>
      <div class="transition-panel transition-premium-panel chev chev-2"></div>
      <div class="transition-panel transition-premium-panel chev chev-3"></div>
      <div class="transition-panel transition-premium-panel chev chev-4"></div>
      <div class="transition-panel transition-premium-panel chev chev-5"></div>
      <div class="transition-mark"><div class="transition-mask">
        <span id="f0" class="transition-label">HIGHLIGHTS</span>
      </div></div>
    </div>`,
    css: `/* Five over-tall chevron slabs. Each one's arrow tip overlaps the next one's notch, so
   the resting train is a sealed cover; the lead slab has no notch, because a notch on the
   frame's own left edge would be a hole in the cut point. */
.chev {
  top: -5%;
  height: 110%;
  width: 38%;
  clip-path: polygon(0 0, 78% 0, 100% 50%, 78% 100%, 0 100%, 22% 50%);
}
.chev-lead {
  clip-path: polygon(0 0, 78% 0, 100% 50%, 78% 100%, 0 100%);   /* flat back, arrow front */
  left: -2%;
  background: var(--accent);
}
.chev-2 { left: 20%; background: #10090b; }
.chev-3 { left: 42%; background: color-mix(in srgb, var(--accent) 82%, #10090b); }
.chev-4 { left: 64%; background: #10090b; }
.chev-5 { left: 86%; width: 40%; background: var(--accent); }
${labelCss(`  padding: calc(12px * var(--scale)) calc(30px * var(--scale));
  background: #10090b;             /* the train is loud, so the lockup sits on quiet ink */
`)}`,
  }),
});

// ── tr16 · Word Slam — the label IS the cover motif ─────────────────────────────────────────
const wordSlam = archetype({
  id: 'tr16',
  name: 'Word Slam',
  description: 'A full-frame editorial word: the label lands huge on an ink band across the page.',
  styleTag: 'editorial',
  paletteId: 'broadsheet',
  fontId: 'libre-franklin',
  sample: 'SPORT',
  presets: ['transition-slam', 'transition-wipe'],
  design: () => ({
    html: `    <div class="transition-box">
      <div class="transition-panel transition-premium-panel word-page"></div>
      <div class="transition-panel transition-premium-panel word-band"></div>
      <div class="transition-mark"><div class="transition-mask">
        <span id="f0" class="transition-label">SPORT</span>
      </div></div>
    </div>`,
    css: `/* A printed page and one ink band: type does the work, the way a section front does.
   The band is a covering panel of its own, so the slam brings the page, then the band,
   then the word — three beats from two surfaces and a mark. */
.word-page {
  inset: 0;
  background: var(--panel-bg);
}
/* Hairline folio rules, drawn on the page so they travel with it. */
.word-page::before,
.word-page::after {
  content: '';
  position: absolute;
  left: 6%;
  right: 6%;
  height: calc(2px * var(--scale));
  background: color-mix(in srgb, var(--text-color) 34%, transparent);
}
.word-page::before { top: 12%; }
.word-page::after { bottom: 12%; }
.word-band {
  left: -2%;                       /* over-wide, so travel never shows a band edge */
  width: 104%;
  top: 33%;
  height: 34%;
  background: var(--accent);
}
${labelCss(`  font-size: calc(168px * var(--scale) * var(--type-scale));
  letter-spacing: -0.01em;         /* display size tightens, the editorial way */
  color: var(--accent-ink);
  text-shadow: none;               /* ink on a printed band casts no glow */
`)}`,
  }),
});

// ── tr17 · Gradient Drift — a light, airy gradient field ────────────────────────────────────
const gradientDrift = archetype({
  id: 'tr17',
  name: 'Gradient Drift',
  description: 'A light gradient field drifts over the frame with a few floating circles — the soft cut.',
  styleTag: 'cinematic',
  paletteId: 'mint',
  fontId: 'outfit',
  sample: 'COMING UP',
  presets: ['transition-sweep', 'transition-iris'],
  design: () => ({
    html: `    <div class="transition-box">
      <div class="transition-panel transition-premium-panel drift-field">
        <span class="drift-ring drift-ring-a"></span>
        <span class="drift-ring drift-ring-b"></span>
        <span class="drift-dot"></span>
      </div>
      <div class="transition-mark"><div class="transition-mask">
        <span id="f0" class="transition-label">COMING UP</span>
      </div></div>
    </div>`,
    css: `/* One over-sized cover carrying an adjacent-hue gradient — the catalog's light, airy
   voice, so the field mixes the accent with PAPER, never with the dark panel (routing
   through --panel-bg turned the middle of the drift into a void). The circles are
   hairline rings, not confetti: two rings and one dot. */
.drift-field {
  inset: -4%;                      /* over-cover: blur travel must never show an edge */
  background: linear-gradient(118deg,
    color-mix(in srgb, var(--accent) 20%, #f4f6f4) 0%,
    color-mix(in srgb, var(--accent) 42%, #eef2ef) 52%,
    color-mix(in srgb, var(--accent) 72%, #dde7e0) 100%);
}
.drift-ring {
  position: absolute;
  border-radius: 50%;
  box-shadow: inset 0 0 0 calc(2px * var(--scale)) color-mix(in srgb, var(--accent) 46%, #23312a);
}
.drift-ring-a { left: 12%; top: 16%; width: calc(220px * var(--scale)); height: calc(220px * var(--scale)); }
.drift-ring-b { right: 10%; bottom: 14%; width: calc(340px * var(--scale)); height: calc(340px * var(--scale)); }
.drift-dot {
  position: absolute;
  right: 24%;
  top: 24%;
  width: calc(56px * var(--scale));
  height: calc(56px * var(--scale));
  border-radius: 50%;
  background: color-mix(in srgb, var(--accent) 82%, #1d2a23);
}
${labelCss(`  font-weight: 300;                /* the light voice — weight, not size */
  letter-spacing: 0.14em;
  color: color-mix(in srgb, var(--accent) 38%, #1d2a23);  /* ink for a paper-light field */
  text-shadow: none;               /* a light field needs no lift */
`)}`,
  }),
});

// ── tr18 · Flash Frame — the white flash cut ────────────────────────────────────────────────
const flashFrame = archetype({
  id: 'tr18',
  name: 'Flash Frame',
  description: 'A soft white flash with one hairline flare — the fastest, quietest cut cover.',
  styleTag: 'cinematic',
  paletteId: 'porcelain',
  fontId: 'inter',
  sample: 'STAY WITH US',
  presets: ['transition-sweep', 'transition-wipe'],
  design: () => ({
    html: `    <div class="transition-box">
      <div class="transition-panel transition-premium-panel flash-field">
        <span class="flash-flare"></span>
      </div>
      <div class="transition-mark"><div class="transition-mask">
        <span id="f0" class="transition-label">STAY WITH US</span>
      </div></div>
    </div>`,
    css: `/* The classic flash-to-white, drawn: a near-white cover and one horizontal flare. The
   label sits in quiet tracked caps; clear the field and the :empty rule collapses it, which
   leaves the flash saying nothing — the traditional form. */
.flash-field {
  inset: -4%;                      /* over-cover: the sweep's blur must never show an edge */
  background: radial-gradient(circle at 50% 46%,
    var(--panel-bg) 0%,
    color-mix(in srgb, var(--panel-bg) 88%, var(--accent)) 100%);
}
.flash-flare {
  position: absolute;
  left: 4%;
  right: 4%;
  top: 62%;                        /* below the lockup — a flare through the words is a strike-out */
  height: calc(2px * var(--scale));
  background: color-mix(in srgb, var(--accent) 55%, var(--text-color));
  box-shadow: 0 0 calc(28px * var(--scale)) calc(4px * var(--scale))
    color-mix(in srgb, var(--accent) 22%, transparent);
}
${labelCss(`  font-size: calc(44px * var(--scale) * var(--type-scale));
  font-weight: 500;
  letter-spacing: 0.2em;
  text-shadow: none;               /* dark type on a light field casts no glow */
`)}`,
  }),
});

export const stingerTransitionArchetypes: TemplateVariant[] = [
  orbit,
  kaleido,
  bloom,
  signalGrid,
  chevron,
  wordSlam,
  gradientDrift,
  flashFrame,
];
