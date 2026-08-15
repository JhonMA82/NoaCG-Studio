// PHASE A's COMPOSER - a design language in, a real house-shaped SpxTemplate out, deterministic
// and token-free (docs/NOACG_PRO_PLAN.md §15.5).
//
// IT COMPOSES THROUGH THE CATALOG'S OWN ASSEMBLER, and that is the load-bearing decision. §16
// settled what happens when Pro builds a document of its own: the model's panel was GOOD and the
// platform's raster reconstruction destroyed it. `defineVariant` + `assembleStandard` are the
// path every hand-authored lower third and every Lite generation already take, so a Phase A
// graphic inherits, for free and by construction:
//
//   * the `:root` style contract, so the Style panel retints it;
//   * `width: fit-content` + the category's auto-fit cap on the box, so THE PANEL IS SIZED BY ITS
//     TEXT and text can never escape it - the §15.2 failure that read as the roomiest padding;
//   * the mask idiom, `overflow-wrap` and `text-wrap: balance`, so a long name wraps inside the
//     panel instead of running onto the picture;
//   * the marked NOACG_ANIM region through the parity-proven importer, so the timeline dock edits
//     the motion rather than showing it read-only;
//   * the SPX definition, the field contract, zones, the shared logo slot, and export readiness.
//
// The model contributes none of that and never sees it. Its whole answer is `DesignLanguage`
// (contract.ts), resolved into numbers by `resolveSpacing` (structure.ts), and spent here on
// colour, weight, case, tracking, corner, accent form and motion. There is no code path from a
// model answer to a geometry value.

import { clampLitePalette } from '../../liteContract';
import { defineVariant, lineMasks } from '../../../templates/lowerThirds/shared';
import type { AssetFile, Resolution, SpxTemplate } from '../../../model/types';
import type { L3Design } from '../../../templates/lowerThirds/shared';
import type { LineSpec, Palette, ResolvedOptions, TemplateVariant } from '../../../model/wizard';
import { accentPlan, resolveSpacing, type ResolvedSpacing } from './structure';
import type { DesignLanguage } from './contract';

export interface ComposeOptions {
  /** The lines the graphic carries. Content, never design. */
  lines: LineSpec[];
  resolution?: Resolution;
  fps?: number;
  /** A brand mark to seat, as the shared slot expects it. */
  logo?: { assetPath: string; images: AssetFile[] } | null;
}

export interface ComposedGraphic {
  template: SpxTemplate;
  /** The variant the template was created from - re-creatable with other lines, zones or a
   *  different scale, which is what makes a Phase A result an ordinary catalog citizen. */
  variant: TemplateVariant;
  spacing: ResolvedSpacing;
  /** Anything the platform decided FOR the language, said out loud. */
  notes: string[];
  /** The furniture repairs the palette needed, in Lite's own adjustment vocabulary. Empty is
   *  the normal case; a round that never reports one is not measuring legibility. */
  adjustments: string[];
}

/** #rrggbb plus an alpha, as an rgba() a decade-old CasparCG build still parses. No color-mix:
 *  the auto-fit cap next door carries a comment about exactly this, and a panel that silently
 *  drops its background on an old engine is a graphic nobody can read. */
function rgba(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** The surface the words sit on, per the language's panel treatment. */
function panelSurface(language: DesignLanguage): { value: string; blur: boolean; note: string } {
  switch (language.shape.panel) {
    case 'solid':
      return { value: language.palette.panel, blur: false, note: 'a solid surface' };
    case 'translucent':
      return { value: rgba(language.palette.panel, 0.82), blur: false, note: 'a translucent surface' };
    case 'none':
      return { value: 'transparent', blur: false, note: 'no surface - the words sit on the picture' };
    case 'blurred':
    default:
      return { value: rgba(language.palette.panel, 0.72), blur: true, note: 'a blurred surface' };
  }
}

/**
 * The palette the `:root` contract is written from - IDENTITY verbatim, FURNITURE legible.
 *
 * The split is Lite's, ratified there and imported rather than re-implemented (a second copy of
 * a legibility ladder is how two answers come to disagree): **accent and panel are the model's
 * and are never touched**, while **text and textDim are the platform's** and are brought up to
 * the contrast floor against the panel by `clampLitePalette`'s three rungs.
 *
 * THE FIRST PAID CELL IS WHY THIS IS HERE. The model took the Aldervale Institute's own palette
 * faithfully - navy panel, parchment text, and the brand's "Slate" for the supporting line. Slate
 * is specified as supporting text ON PARCHMENT; on the navy it reads at about 1.9:1, and the role
 * line was barely there. That is not a taste failure to teach away, it is a measurable boundary
 * the platform can simply own - which is the whole of §15.3's ranking.
 *
 * Only the panel's TREATMENT alpha is applied afterwards, so the repair reasons about the colour
 * the words actually sit on.
 */
function paletteFor(language: DesignLanguage, surface: string): { palette: Palette; adjustments: string[] } {
  const repaired = clampLitePalette({
    accent: language.palette.accent,
    panel: language.palette.panel,
    text: language.palette.text,
    textDim: language.palette.textDim,
  });
  return {
    palette: {
      id: 'pro-language',
      name: language.name,
      styleTags: ['noacg'],
      accent: repaired.palette.accent,
      text: repaired.palette.text,
      textDim: repaired.palette.textDim,
      panel: surface,
    },
    adjustments: repaired.adjustments,
  };
}

/** The design body: platform structure, language paint. */
function buildDesign(language: DesignLanguage, s: ResolvedSpacing, o: ResolvedOptions): L3Design {
  const plan = accentPlan(language.accent.form);
  const surface = panelSurface(language);
  const heading = language.typography;
  const upper = (c: 'as-written' | 'caps') => (c === 'caps' ? 'uppercase' : 'none');
  const px = (n: number) => `calc(${n}px * var(--scale))`;
  const typePx = (n: number) => `calc(${n}px * var(--scale) * var(--type-scale))`;

  // The accent element, where the form puts one. `edge-bar` is pinned to the root and lives
  // OUTSIDE the panel's padding, so it cannot crowd the words; the two rules sit inside the
  // panel, one platform clear space from the text.
  const accentEl = plan.element
    ? `    <!-- The accent: ${plan.note}. -->\n    <div class="lower-third-accent"></div>\n`
    : '';
  const insideAccent = language.accent.form === 'top-rule' || language.accent.form === 'underline';

  const html = `    <!-- ${language.name}: the platform's lower-third structure - ${plan.note}.
         Structure and spacing are platform-owned; the design language decides how it reads. -->
${language.accent.form === 'edge-bar' ? accentEl : ''}    <div class="lower-third-box">
${language.accent.form === 'top-rule' ? accentEl : ''}${lineMasks(o)}
${language.accent.form === 'underline' ? accentEl : ''}    </div>`;

  const accentCss = language.accent.form === 'edge-bar'
    ? `/* The accent bar — fused to the panel's leading edge, outside its padding, so it is a
   member of the composition rather than something the words have to make room for. */
.lower-third-accent {
  position: absolute;               /* pinned inside the positioned .lower-third root */
  left: 0;                          /* at the very left edge */
  top: 0;                           /* full panel height… */
  bottom: 0;                        /* …top to bottom */
  width: ${px(s.accentPx)};  /* the language's accent weight */
  background: var(--accent);        /* the one accent surface */
  border-radius: ${px(s.cornerPx)} 0 0 ${px(s.cornerPx)};  /* the package's corner language */
  will-change: transform;           /* hint the browser: presets grow this bar in */
}`
    : insideAccent
      ? `/* The accent rule — inside the panel, one platform clear space from the words. The gap is
   ${s.ruleGapPx}px at scale 1, which is well clear of the crowding band the spacing instrument
   measures; text sitting ON a rule is a composition this form does not draw. */
.lower-third-accent {
${language.accent.form === 'top-rule'
  ? `  align-self: stretch;              /* a rule across the top spans the words beneath it.
                                       IT NEEDS A WIDTH FROM SOMEWHERE: the panel is a flex
                                       column aligned to the reading edge, and an empty div in
                                       one has no content to be as wide as - which is why this
                                       accent was INVISIBLE on two of the four languages until
                                       the free control run rendered them. */`
  : `  width: ${px(Math.round(s.supportingPx * 2.4))};  /* a SHORT rule, deliberately shorter than
                                       either line. Stretching it to the text column instead put
                                       its end 5px past the name's last glyph - a rule that
                                       almost lines up with the words reads as a mistake, which
                                       is exactly what the alignment instrument reported. */`}
  height: ${px(s.accentPx)};  /* the language's accent weight */
  background: var(--accent);        /* the one accent surface */
  border-radius: ${px(Math.min(s.cornerPx, s.accentPx))};  /* a rule rounds to its own thickness at most */
  margin-${language.accent.form === 'top-rule' ? 'bottom' : 'top'}: ${px(s.ruleGapPx)};  /* the platform's clear space */
  will-change: transform;           /* hint the browser: presets grow this rule in */
}`
      : language.accent.form === 'block'
        ? `/* The accent BLOCK — the supporting line sits on the accent itself. Contact is the
   composition here, which is why there is no gap to clear: the words are ON the block by
   design, the way the catalog's own slab straps are drawn.

   The selector is "a mask preceded by another mask", so a one-line graphic keeps its name off
   the block: the accent backs the SUPPORTING line, and with no supporting line there is
   nothing for it to back. */
.lower-third-mask + .lower-third-mask {
  background: var(--accent);        /* the block the supporting line reads on */
  border-radius: ${px(Math.min(s.cornerPx, 8))};  /* the package's corner language, kept tight */
  /* NO INSET ON THE LEADING EDGE, so the block's edge, its words and the primary line above
     all sit on ONE axis. An inset there has to be paid for somewhere: the first attempt padded
     both sides and pushed the supporting line 8px off the name's axis, and pulling the block
     back by the same amount only moved the near-miss onto the block's own edge (measured, both
     times, by the alignment instrument on the free control run). The trailing edge aligns with
     nothing, so that is where the words get their air. */
  padding: ${px(Math.round(s.lineGapPx / 2))} ${px(s.lineGapPx)} ${px(Math.round(s.lineGapPx / 2))} 0;
  align-self: flex-start;           /* the block is as wide as its words, never the panel */
}`
        : '/* This language carries no accent SHAPE — the accent colour lives in the type alone. */';

  // ONE TYPEFACE, and no second @font-face. The heading face the language chose sets both lines,
  // because a label font nothing references still ships its bytes into every export - the
  // dangling-asset class one door over, arriving as dead weight rather than a broken reference.
  const css = `${accentCss}

/* The panel — ${surface.note}. It is \`width: fit-content\` (the category's auto-fit rule), so
   it is SIZED BY its own text: a longer name widens it and then wraps inside it, and content
   cannot end up outside the box it was drawn for. Padding is ${s.padVPx}px / ${s.padHPx}px at
   scale 1 — equal on opposite sides, which is what keeps the panel centred on its content. */
.lower-third-box {
  display: flex;                    /* the lines stack as one block */
  flex-direction: column;           /* …top to bottom */
  align-items: flex-start;          /* …aligned to the reading edge */
  ${language.accent.form === 'edge-bar' ? `margin-left: ${px(s.accentPx)};  /* starts where the accent bar ends */\n  ` : ''}padding: ${px(s.padVPx)} ${px(s.padHPx)};
  background: var(--panel-bg);      /* the language's surface */
  border-radius: ${px(s.cornerPx)};${language.accent.form === 'edge-bar' ? `\n  border-top-left-radius: 0;        /* the accent bar carries this corner */\n  border-bottom-left-radius: 0;` : ''}${surface.blur ? '\n  backdrop-filter: blur(18px);      /* the surface softens the picture behind it */\n  -webkit-backdrop-filter: blur(18px);  /* Safari spelling of the same effect */' : ''}
}

/* The primary line — the moment a viewer reads first. */
.lower-third-name {
  font-size: ${typePx(s.headingPx)};  /* the package's primary size (1080p reference) */
  font-weight: ${s.headingWeight};                /* the language's heading weight */
  line-height: 1.05;                /* big text sits tight */
  letter-spacing: ${s.headingTracking};        /* the package's tracking */
  text-transform: ${upper(heading.headingCase)};
  color: var(--text-color);         /* primary text */${surface.value === 'transparent' ? '\n  text-shadow: 0 2px 12px rgba(0, 0, 0, 0.75);  /* a super with no panel still has to read */' : ''}
}

/* The supporting line — subordinate by ${Math.round((s.supportingPx / s.headingPx) * 100)}% of the primary size, which is
   how hierarchy is expressed here: by size relationship, never by a second colour doing the work. */
.lower-third-title,
.lower-third-extra {
  font-size: ${typePx(s.supportingPx)};  /* the package's supporting size */
  font-weight: ${s.supportingWeight};                /* the language's supporting weight */
  line-height: 1.3;                 /* a touch of air if it wraps */
  letter-spacing: ${s.supportingTracking};        /* tracked wider than the heading — the label voice */
  text-transform: ${upper(heading.supportingCase)};
  color: ${language.accent.form === 'block' ? 'var(--panel-bg)' : 'var(--text-dim)'};  /* ${language.accent.form === 'block' ? 'reads on the accent block' : 'present, and subordinate'} */
  margin-top: ${px(s.lineGapPx)};  /* the platform's line gap — the two lines read as one unit */${surface.value === 'transparent' && language.accent.form !== 'block' ? '\n  text-shadow: 0 2px 10px rgba(0, 0, 0, 0.75);  /* a super with no panel still has to read */' : ''}
}`;

  return { html, css, hasAccent: plan.element };
}

/** Whether the language's accent form emits a `.PREFIX-accent` element at all. */
function hasAccentElement(language: DesignLanguage): boolean {
  return accentPlan(language.accent.form).element;
}

/**
 * The `TemplateVariant` this language IS. Built rather than looked up: Phase A's claim is that
 * one language renders across every graphic type, and a variant is the unit the wizard, the
 * timeline, the Style panel, the exporters and the control layer all already speak.
 */
export function variantForLanguage(language: DesignLanguage): TemplateVariant {
  const s = resolveSpacing(language);
  return defineVariant(
    {
      id: 'pro-language',
      typeId: 'lower-third',
      category: 'lower-third',
      name: language.name,
      styleTag: 'noacg',
      description: language.rationale,
      maxLines: 2,
      suggestedLines: [
        { title: 'Name', sample: 'Alexandra Riva' },
        { title: 'Title', sample: 'Chief Political Correspondent' },
      ],
      logo: 'optional',
      animationPresets: [s.preset, 'line-reveal', 'slide-up', 'mask-wipe', 'fade'],
      defaultPalette: paletteFor(language, panelSurface(language).value).palette,
      defaultFontId: language.typography.fontId,
      defaultZone: 'bottom-left',
    },
    {
      name: language.name,
      description: language.rationale,
      uicolor: '4',
    },
    (o) => buildDesign(language, s, o),
  );
}

/**
 * Render a graphic in this language. Deterministic, token-free, and the same function the paid
 * round and the zero-token control both call - a control that does not run the code under test
 * is not a control (docs/AI_ATTEMPTS.md, the $0.25 lesson).
 */
export function composeFromLanguage(language: DesignLanguage, options: ComposeOptions): ComposedGraphic {
  const s = resolveSpacing(language);
  const variant = variantForLanguage(language);
  // Every divergence from what the model asked for, said out loud. A repair the ledger cannot
  // count is a promise nobody can check (the Lite brand rule, `docs/AI_LITE_BRAND_PLAN.md` §3.2).
  const adjustments = paletteFor(language, panelSurface(language).value).adjustments;
  const notes = [
    `structure and spacing: platform-owned (${language.density} density -`
    + ` ${s.padVPx}/${s.padHPx}px padding, ${s.lineGapPx}px line gap, at scale 1)`,
    `accent: ${accentPlan(language.accent.form).note}`,
    `surface: ${panelSurface(language).note}`,
    `motion: ${language.motion.character} at ${language.motion.pace} pace → preset ${s.preset}`,
  ];
  if (!hasAccentElement(language) && language.accent.form !== 'none') {
    notes.push('the accent is drawn without a .lower-third-accent element, so the entrance'
      + ' animates the panel and its lines rather than a separate shape');
  }
  if (adjustments.length) notes.push(`palette furniture repaired: ${adjustments.join(', ')}`);
  const template = variant.create({
    lines: options.lines,
    ...(options.resolution ? { resolution: options.resolution } : {}),
    ...(options.fps ? { fps: options.fps } : {}),
    animation: { presetId: s.preset, speed: s.speed, easing: 'auto', steps: false },
    ...(options.logo
      ? { logoEnabled: true, logoAssetPath: options.logo.assetPath, importedImages: options.logo.images }
      : {}),
  });
  return { template, variant, spacing: s, notes, adjustments };
}
