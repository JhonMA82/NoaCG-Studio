// End-credits scaffolding. Credits are data-driven: one textarea field (f0) holds the whole
// credit list — "Role | Name" per line, a line WITHOUT a pipe is a section heading, a blank
// line starts a new section — and f1 holds the year/copyright line. The template's JS parses
// that text into rows at runtime, so operators edit credits without touching code.
//
// Structure contract:
//   <div class="credits">                 root — positioned by zone; opacity:0 until play()
//     <div class="credits-box">           the viewport (overflow hidden); presets fade this
//       <div id="credits-track">          rows injected by rebuildCredits()
//     </div>
//     hidden #f0 / #f1 sources SPX writes into
//   </div>
// Every track ends with the .credits-end block: logo placeholder + year (per the brief).

import type { SpxField, SpxTemplate } from '../../model/types';
import { definitionScriptBlock } from '../../model/spxDefinition';
import { resolveEasing } from '../../model/easings';
import {
  resolveOptions,
  type ResolvedOptions,
  type TemplateVariant,
  type WizardOptions,
} from '../../model/wizard';
import {
  baseSettings,
  computeScale,
  dataSourceCss,
  documentHtml,
  ESCAPE_HTML_JS,
  maskImageCss,
  resetCanvasCss,
  resolveHeadingFont,
  rootVarsCss,
  setFieldValueJs,
  zoneCssText,
} from '../shared/base';
import type { PresetConfig } from '../lowerThirds/animPresets';
import type { AnimData } from '../../blocks/animData';
import { convertToDataRegion } from '../shared/standard';
import { creditsPresetById } from './creditsPresets';
import { CREDITS_MOTION_JS } from './creditsMotion';
import { resolveTokens, type ThemeTokens, type TokenOverrides } from '../../model/themeTokens';

export interface CreditsDesign {
  /** Inner HTML of .credits — must contain .credits-box > #credits-track. */
  html: string;
  /** Variant CSS (.credits-box sizing, row styles, end-block styles). */
  css: string;
  /**
   * JS defining renderCreditRow(entry) and renderEndBlock(yearHtml, logoSrc) — the
   * variant's row markup. entry is one of
   *   { type: 'credit',  role, name }   a "Role | Name" line
   *   { type: 'heading', text }         the line that opens a section
   *   { type: 'entry',   text }         any other pipe-less line (a name on a wall)
   * A builder must answer all three; see parseCredits in the runtime below.
   */
  rowBuilderJs: string;
  /**
   * Where this design disagrees with its style family's shape tokens
   * (model/themeTokens.ts). Every entry is conformance debt - DESIGN_LANGUAGE §8's rule is
   * "reuse the exact token values, don't improvise new ones per category".
   */
  tokens?: TokenOverrides;
}

export interface CreditsMeta {
  name: string;
  description: string;
  uicolor: string;
}

/** Paint the whole programme behind every ending/list design. */
function creditsBackgroundCss(family: TemplateVariant['styleTag']): string {
  const familyLight: Record<TemplateVariant['styleTag'], string> = {
    minimal: `radial-gradient(circle at 24% 18%, color-mix(in srgb, var(--accent) 10%, transparent), transparent 34%),
    linear-gradient(145deg, rgba(255, 255, 255, 0.025), transparent 48%)`,
    editorial: `linear-gradient(90deg, transparent 0 9%, color-mix(in srgb, var(--accent) 25%, transparent) 9% 9.1%, transparent 9.1%),
    radial-gradient(circle at 74% 20%, rgba(255, 255, 255, 0.065), transparent 38%)`,
    cinematic: `linear-gradient(180deg, rgba(0, 0, 0, 0.78), transparent 24% 72%, rgba(0, 0, 0, 0.82)),
    radial-gradient(ellipse at 50% 42%, color-mix(in srgb, var(--accent) 8%, transparent), transparent 54%)`,
    sport: `linear-gradient(118deg, transparent 0 60%, color-mix(in srgb, var(--accent) 12%, transparent) 60% 74%, transparent 74%),
    linear-gradient(138deg, rgba(255, 255, 255, 0.04), transparent 38%)`,
    glass: `radial-gradient(circle at 22% 22%, color-mix(in srgb, var(--accent) 16%, transparent), transparent 36%),
    radial-gradient(circle at 78% 74%, rgba(255, 255, 255, 0.08), transparent 40%)`,
    noacg: `radial-gradient(circle at 76% 26%, color-mix(in srgb, var(--accent) 18%, transparent), transparent 34%),
    linear-gradient(126deg, transparent 0 64%, rgba(246, 166, 35, 0.05) 64% 64.25%, transparent 64.25%)`,
  };

  return `/* Opaque programme background - credits are an ending scene, not a floating card. */
.credits-background {
  position: absolute;              /* fills the output frame */
  inset: 0;                        /* edge to edge */
  overflow: hidden;                /* ambient light stays inside the programme */
  background-color: #070a0f;       /* guaranteed opaque neutral base */
  background-image: ${familyLight[family]};  /* one family-specific light treatment */
  pointer-events: none;            /* decorative only */
  will-change: transform, opacity; /* entrance and exit fade this layer */
}

.credits-ambient {
  position: absolute;              /* a soft light pool behind the list */
  inset: 4%;                       /* transform-safe inset keeps the idle field on canvas */
  background: radial-gradient(circle at 8% 84%, color-mix(in srgb, var(--accent) 16%, transparent), transparent 66%);
  filter: blur(calc(42px * var(--scale)));  /* atmospheric, not a graphic shape */
  opacity: 0.7;                    /* restrained under long-form reading */
  will-change: transform;          /* the idle drift is transform-only */
}

.credits-grid {
  position: absolute;              /* full-frame structural texture */
  inset: 0;                        /* edge to edge */
  background-image:
    linear-gradient(rgba(255, 255, 255, 0.02) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.02) 1px, transparent 1px);
  background-size: calc(120px * var(--scale)) calc(120px * var(--scale));  /* slow visual rhythm */
  ${maskImageCss('linear-gradient(90deg, #000, transparent 74%)', 'texture stays quieter by the list edge')}
  opacity: ${family === 'sport' || family === 'noacg' ? '0.62' : '0.3'};  /* stronger for broadcast-control families */
}`;
}

/** The shared runtime: parse the credits text and rebuild the track (outside the markers). */
function creditsRuntimeJs(name: string, animationBlock: string): string {
  return `// ${name} — generated by NoaCG Studio. SPX calls update(), play(), stop(), next().

${setFieldValueJs}

${ESCAPE_HTML_JS}

// parseCredits(text): three kinds of line, one rule each.
//   "Role | Name"  -> a credit row.
//   a line with no "|" that OPENS a section -> that section's heading.
//   any other line with no "|" -> a plain entry: a name on a wall, a thank-you, a line of
//                                 a schedule the design lays out itself.
// A blank line starts the next section. (The heading rule is positional on purpose: a wall
// of names is one heading followed by names, and a roll's sections already open with theirs,
// so both read correctly from the same text with nothing to mark up.)
//
// Every value here is escaped ON THE WAY OUT of the parser, because the row builders below
// concatenate it into innerHTML. Escaping at this ONE boundary is what makes the design's own
// renderCreditRow() safe to rewrite without having to remember the rule.
function parseCredits(text) {
  var sections = [];
  var current = [];
  text.split('\\n').forEach(function (raw) {
    var line = raw.trim();
    if (line === '') {                       // blank line -> new section
      if (current.length) { sections.push(current); current = []; }
      return;
    }
    var parts = line.split('|');
    if (parts.length >= 2) {
      current.push({
        type: 'credit',
        role: escapeHtml(parts[0].trim()),
        name: escapeHtml(parts.slice(1).join('|').trim())
      });
    } else if (current.length === 0) {
      current.push({ type: 'heading', text: escapeHtml(line) });   // the line that opens a section names it
    } else {
      current.push({ type: 'entry', text: escapeHtml(line) });     // a plain line inside a section
    }
  });
  if (current.length) sections.push(current);
  return sections;
}

// rebuildCredits(): re-render the track from the hidden #f0 / #f1 / #f2 sources.
function rebuildCredits() {
  var track = document.getElementById('credits-track');
  var text = document.getElementById('f0').textContent;
  var year = document.getElementById('f1').textContent;
  // The end-of-credits logo is the image field f2 — a path like "images/logo.png".
  // Empty means "no logo picked yet": the design shows its styled placeholder instead.
  var logo = document.getElementById('f2').textContent.trim() || null;
  var html = '';
  parseCredits(text).forEach(function (section) {
    html += '<div class="credits-page">';     // one block per section (pages preset uses these)
    section.forEach(function (entry) { html += renderCreditRow(entry); });
    html += '</div>';
  });
  // Both escaped: the year is written as markup and the logo path is written INTO an
  // src="..." attribute, so an unescaped quote in either would break out of it.
  html += renderEndBlock(escapeHtml(year), logo ? escapeHtml(logo) : null);
  track.innerHTML = html;
  fitBoardToFrame();               // a board re-fits itself to the frame after every rebuild
}

// fitBoardToFrame(): the price a BOARD pays for showing everything at once.
//
// A roll or a crawl can carry any amount of content because it travels past a fixed window.
// A board cannot: every line is on screen, so a long enough list grows past the frame and the
// last rows simply fall off the bottom, silently. That is the worst possible failure — the
// operator sees a full-looking board and never learns that three names are missing.
//
// So a board shrinks to fit instead. Every dimension in these designs is authored as
// calc(Npx * var(--scale)), which means ONE custom property scales the whole thing — no
// transform, so it can never fight the entrance the preset tweens onto the same element.
// Two passes, because shrinking narrows the box too and text can re-wrap.
//
// Only designs that mark themselves .credits-board opt in; a roll must never be shrunk.
function fitBoardToFrame() {
  var root = document.querySelector('.credits');
  var box = document.querySelector('.credits-box');
  if (!root || !box || !box.classList.contains('credits-board')) return;

  root.style.removeProperty('--scale');          // always measure at the authored size
  var base = parseFloat(getComputedStyle(root).getPropertyValue('--scale')) || 1;
  var maxHeight = document.documentElement.clientHeight * 0.92;   // inside the safe area
  var maxWidth = document.documentElement.clientWidth * 0.92;

  for (var pass = 0; pass < 2; pass++) {
    var height = box.scrollHeight;
    var width = box.scrollWidth;
    if (height <= maxHeight && width <= maxWidth) return;         // already fits
    var ratio = Math.min(maxHeight / height, maxWidth / width);
    var current = parseFloat(root.style.getPropertyValue('--scale')) || base;
    root.style.setProperty('--scale', (current * ratio).toFixed(3));
  }
}

// update(data): SPX sends field values as JSON; write them into the hidden sources,
// then rebuild the visible rows.
function update(data) {
  var fields = (typeof data === 'string') ? JSON.parse(data) : data;
  for (var key in fields) {
    var el = document.getElementById(key);
    if (el) setFieldValue(el, fields[key]);
  }
  rebuildCredits();
}

// play(): rebuild (fresh measurements), then run the motion.
function play() {
  gsap.killTweensOf('*');
  rebuildCredits();
  buildInTimeline();
}

// stop(): take the credits off air.
function stop() {
  gsap.killTweensOf('*');
  buildOutTimeline();
}

// next(): SPX Continue — advance one step along the default path. This design ships
// single-step, so it normally does nothing; it still funnels to the interpreter so a
// template that GROWS a step (or a state machine) stays drivable through the SPX contract.
function next() {
  return (typeof revealNextStep === 'function') ? revealNextStep() : null;
}

// Render once on load so the preview shows content before the first update().
// This file loads in <head>, before the credit elements exist — wait for the DOM.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', rebuildCredits);
} else {
  rebuildCredits();               // DOM already parsed (e.g. an inline preview build)
}
// A DOM-ready measurement measures the FALLBACK typeface; re-fit once the real one swaps in,
// or a board sized against Arial overflows the moment its own face arrives.
if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitBoardToFrame);

${animationBlock}
`;
}

const CREDITS_SAMPLE = [
  'PRODUCTION',
  'Director | Alex Rivera',
  'Producer | Sam Chen',
  '',
  'CAMERA',
  'Director of Photography | Maria Santos',
  'Camera Operator | Jonas Berg',
  '',
  'Special thanks to everyone who made this show possible',
].join('\n');

/** Build the complete end-credits SpxTemplate. */
export function assembleCredits(meta: CreditsMeta, design: CreditsDesign, o: ResolvedOptions,
  /** Refine the converted animation data — the seam a graphic TYPE injects its machine
   *  through (see shared/standard.ts composeRefine for the ordering rule). */
  refine?: (data: AnimData) => AnimData,
  /** The design's resolved SHAPE tokens (model/themeTokens.ts). Resolved by the caller,
   *  because the family lives on the VARIANT (styleTag) and this function only sees the
   *  design. Absent = emit no token lines, which is what every template did before they
   *  existed. */
  tokens?: ThemeTokens,
  /** The variant's family selects the programme background's shape language. */
  family: TemplateVariant['styleTag'] = 'minimal',
): SpxTemplate {
  const font = resolveHeadingFont(o);
  const scale = computeScale(o);
  const backgroundCss = creditsBackgroundCss(family);

  // Credits fields: the multi-line credit list, the year line, and the end-block logo
  // (an SPX image field — the operator picks a file from the project's images/ folder).
  const creditsText = o.lines[0]?.sample || CREDITS_SAMPLE;
  const yearText = o.lines[1]?.sample || '© 2026 Your Production';
  const logoPath = o.logoAssetPath ?? '';
  const fields: SpxField[] = [
    { field: 'f0', ftype: 'textarea', title: o.lines[0]?.title || 'Credits', value: creditsText },
    { field: 'f1', ftype: 'textfield', title: o.lines[1]?.title || 'Year / copyright', value: yearText },
    { field: 'f2', ftype: 'filelist', title: 'Logo', value: logoPath, assetfolder: './images/', extension: 'png' },
  ];

  const settings = baseSettings(meta, o, { steps: '1', playlayer: '4', webplayout: '4' });

  const html = documentHtml({
    title: meta.name,
    definitionBlock: definitionScriptBlock(settings, fields),
    body: `  <!-- ${meta.name}. Rows are built by rebuildCredits() from the hidden sources below. -->
  <div class="credits credits--${family}">
    <!-- Full-frame programme background. Ending scenes never float on transparency. -->
    <div class="credits-background" aria-hidden="true">
      <div class="credits-ambient"></div>
      <div class="credits-grid"></div>
    </div>
    <div class="credits-content">
${design.html}
    </div>
    <!-- Hidden data sources — SPX writes the field values here; JS renders them. -->
    <div id="f0" class="noacg-data-source">${creditsText}</div>
    <div id="f1" class="noacg-data-source">${yearText}</div>
    <div id="f2" class="noacg-data-source">${logoPath}</div>
  </div>`,
  });

  const css = `/* ${meta.name} — generated by NoaCG Studio. Edit freely: this file is yours. */

${rootVarsCss(o, font.stack, scale, { tokens, consumerCss: `${backgroundCss}\n${design.css}` })}

${font.face}

${resetCanvasCss(o.resolution)}

/* ── Root position (anchor zone) ── */
.credits {
  position: absolute;
  left: 0;                         /* full-frame endings ignore anchor zones */
  top: 0;                          /* begin at the programme origin */
  width: ${o.resolution.width}px;  /* paint every horizontal pixel */
  height: ${o.resolution.height}px; /* paint every vertical pixel */
  overflow: hidden;                /* content and light stay inside the programme */
  opacity: 0;                      /* hidden until play() runs the entrance */
}

/* ── Design ── */
.credits-content {
  position: absolute;              /* the list still honours its chosen safe-area zone */
${zoneCssText(o.zone, o.nudge, o.resolution)}
  z-index: 1;                      /* content always sits above the programme background */
}

${backgroundCss}

${design.css}

${dataSourceCss}
`;

  const preset = creditsPresetById(o.animation.presetId);
  const ease = resolveEasing(o.animation.easing, preset.autoEase);
  const cfg: PresetConfig = {
    prefix: 'credits',
    lineCount: 2,
    hasAccent: false,
    steps: false,
    speed: o.animation.speed,
    easeIn: ease.easeIn,
    easeOut: ease.easeOut,
  };

  const js = creditsRuntimeJs(
    meta.name,
    `${design.rowBuilderJs}\n\n${CREDITS_MOTION_JS}\n\n${preset.emit(cfg)}`,
  );

  const template: SpxTemplate = {
    name: meta.name,
    type: 'end-credits',
    resolution: o.resolution,
    fps: o.fps,
    html,
    css,
    js,
    fields,
    settings,
    assets: [...o.importedImages, ...(o.customFont ? [o.customFont.asset] : [])],
    layers: [],
  };

  // Timeline v2: convert the emitted region into the NOACG_ANIM data block. The box's fade
  // becomes ordinary keyframes; the measured travel rides across as a `dynamics` segment
  // naming its builder above (docs/DYNAMIC_MOTION_SCOPE.md). The builders themselves sit
  // outside the region and are untouched by the conversion.
  return convertToDataRegion(template, refine);
}

/** The authoring API for end-credits variant modules. */
export function defineCreditsVariant(
  spec: Omit<TemplateVariant, 'create'>,
  meta: CreditsMeta,
  buildDesign: (o: ResolvedOptions) => CreditsDesign,
  /** Optional animation-data refinement (a graphic type's machine rides in here). It is
   *  built per create() because a type's compiled machine depends on the resolved options. */
  refine?: (o: ResolvedOptions) => ((data: AnimData) => AnimData) | undefined,
): TemplateVariant {
  const variant: TemplateVariant = {
    ...spec,
    create(options?: WizardOptions) {
      const o = resolveOptions(variant, options);
      const design = buildDesign(o);
      // The family lives on the variant, the overrides on the design — resolved here
      // because this is the only place that holds both.
      const tokens = resolveTokens(spec.styleTag, design.tokens);
      return assembleCredits(meta, design, o, refine?.(o), tokens, spec.styleTag);
    },
  };
  return variant;
}
