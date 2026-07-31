// The NEUTRAL structural skeleton (docs/CREATIVE_MODE_PLAN.md §4, the anti-anchoring rule):
// what the CREATE path's coder arm is shown INSTEAD of a finished catalog design.
//
// The F3 diagnosis is that the custom route's one worked example is a complete catalog
// design, and a cheap model reads a complete design as compositional guidance because it is
// the only design language it is shown. The engineering contracts still have to be taught by
// example - that is what the example is FOR - so this is those contracts and nothing else: a
// root, a box, one accent, two masked lines, the runtime, the marked region. There is no
// look here to copy, deliberately.
//
// It is a bare SpxTemplate, deliberately NOT a TemplateVariant: it goes straight into the
// coder's example slot (`coderSystemPrompt`), it is not in the catalog, it is not browsable,
// and no user ever creates it.

import type { SpxTemplate } from '../../model/types';
import { DEFAULT_SETTINGS } from '../../model/types';
import { definitionScriptBlock } from '../../model/spxDefinition';
import { fontById, fontFaceCss, fontStack } from '../../model/fonts';
import { documentHtml, resetCanvasCss, runtimeJs } from '../../templates/shared/base';

const PREFIX = 'graphic';

const HTML_BODY = `  <!-- The root wrapper: absolutely positioned, hidden until play() reveals it. -->
  <div class="${PREFIX}">
    <!-- The stage element. This exact -box class, alone on the element, is how the editor
         finds the design's parts. -->
    <div class="${PREFIX}-box">
      <!-- A one-off accent element, when the design has one. -->
      <div class="${PREFIX}-accent"></div>

      <!-- Heading (f0) — SPX writes this field's value straight into the element. -->
      <div class="${PREFIX}-mask"><span id="f0" class="${PREFIX}-heading">Heading</span></div>

      <!-- Supporting line (f1). -->
      <div class="${PREFIX}-mask"><span id="f1" class="${PREFIX}-support">Supporting line</span></div>
    </div>
  </div>`;

const CSS = `/* A STRUCTURE example, not a design. Every rule here exists to show a contract:
   the style variables, the scale math, the mask that makes a line reveal possible.
   Nothing about how it looks is guidance — compose your own. */

/* ── Style contract: change these variables to retint the whole graphic. ── */
:root {
  --accent: #f6a623;
  --text-color: #ffffff;
  --text-dim: rgba(183, 188, 196, 0.95);
  --panel-bg: rgba(10, 12, 16, 0.86);
  --font-heading: FONT_STACK;
  --scale: 1;
  --type-scale: 1;
}

FONT_FACE

RESET_CANVAS

/* ── Root position (anchor zone) ── */
.${PREFIX} {
  position: absolute;
  left: 120px;
  bottom: 119px;
  opacity: 0;                      /* hidden until play() runs the entrance */
}

.${PREFIX}-box {
  position: relative;
  width: fit-content;              /* the box hugs its text */
  max-width: min(calc(800px * var(--scale)), 1680px);
  padding: calc(18px * var(--scale)) calc(26px * var(--scale));
  background: var(--panel-bg);
  will-change: transform, opacity;
}

.${PREFIX}-accent {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: calc(6px * var(--scale));
  background: var(--accent);
}

.${PREFIX}-mask {
  overflow: hidden;                /* lines animate in from behind this mask */
}
.${PREFIX}-mask > span {
  display: inline-block;
  overflow-wrap: break-word;
}

.${PREFIX}-heading {
  font-size: calc(48px * var(--scale) * var(--type-scale));
  font-weight: 700;
  line-height: 1.1;
  color: var(--text-color);
}

.${PREFIX}-support {
  font-size: calc(26px * var(--scale) * var(--type-scale));
  font-weight: 400;
  line-height: 1.25;
  color: var(--text-dim);
}
`;

/** The marked region in the AUTHORING shape - the legacy GSAP grammar the platform converts
 *  deterministically at intake (convertEmittedRegion), which is the same grammar every
 *  catalog preset is authored in. */
const ANIMATION_REGION = `/* == ANIMATION == (edit between these markers) */
var animSpeed = 1;                 // the template's speed knob
var easeIn = 'power3.out';
var easeOut = 'power2.in';

// buildInTimeline(): the entrance. play() calls it.
function buildInTimeline() {
  var tl = gsap.timeline();
  tl.set('.${PREFIX}', { opacity: 1 });
  tl.fromTo('.${PREFIX}-box', { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.5 / animSpeed, ease: easeIn });
  tl.fromTo('.${PREFIX}-heading', { yPercent: 110 }, { yPercent: 0, duration: 0.45 / animSpeed, ease: easeIn }, '-=0.35');
  tl.fromTo('.${PREFIX}-support', { yPercent: 110 }, { yPercent: 0, duration: 0.45 / animSpeed, ease: easeIn }, '-=0.3');
  return tl;
}

// buildOutTimeline(): the exit. stop() calls it. Exits run faster than entrances.
function buildOutTimeline() {
  var tl = gsap.timeline();
  tl.to('.${PREFIX}-box', { opacity: 0, y: 16, duration: 0.35 / animSpeed, ease: easeOut });
  tl.set('.${PREFIX}', { opacity: 0 });
  return tl;
}
/* == END ANIMATION == */`;

/** The example arm B studies instead of a catalog design. */
export function neutralSkeletonTemplate(): SpxTemplate {
  const font = fontById('inter');
  const fields = [
    { field: 'f0', ftype: 'textfield' as const, title: 'Heading', value: 'Heading' },
    { field: 'f1', ftype: 'textfield' as const, title: 'Supporting line', value: 'Supporting line' },
  ];
  const settings = { ...DEFAULT_SETTINGS, description: 'Structure example', playlayer: '7', webplayout: '7', steps: '1', uicolor: '1' };
  return {
    name: 'Structure example',
    type: 'blank',
    resolution: { width: 1920, height: 1080, label: '1080p' },
    fps: 25,
    html: documentHtml({
      title: 'Structure example',
      definitionBlock: definitionScriptBlock(settings, fields),
      body: HTML_BODY,
    }),
    css: CSS
      .replace('FONT_STACK', fontStack(font))
      .replace('FONT_FACE', fontFaceCss(font))
      .replace('RESET_CANVAS', resetCanvasCss({ width: 1920, height: 1080, label: '1080p' })),
    js: runtimeJs('Structure example', ANIMATION_REGION),
    fields,
    settings,
    assets: [],
    layers: fields.map((f) => ({ id: f.field, type: 'text' as const, label: f.title, fieldId: f.field, text: f.value, styles: {} })),
  };
}

/** The skeleton carries its ANIMATION region already in the AUTHORING shape, so nothing
 *  re-emits a catalog preset over it - that would put a catalog design's choreography back
 *  into the one file that exists to stay neutral. */
export const NEUTRAL_SKELETON_PREFIX = PREFIX;
