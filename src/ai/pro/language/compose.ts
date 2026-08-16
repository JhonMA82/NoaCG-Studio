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

import { defineVariant, lineMasks } from '../../../templates/lowerThirds/shared';
import type { Resolution, SpxTemplate } from '../../../model/types';
import type { L3Design } from '../../../templates/lowerThirds/shared';
import type { LineSpec, ResolvedOptions, TemplateVariant } from '../../../model/wizard';
import { accentPlan, resolveSpacing, type ResolvedSpacing } from './structure';
import type { DesignLanguage, LanguagePalette } from './contract';
import {
  markKnockCss,
  markTreatmentFor,
  panelSurface,
  platePlan,
  platformNotes,
  readableInkOn,
  resolvePalette,
  wizardPalette,
  type BrandPalette,
  type MarkTreatment,
  type ProLogo,
} from './paint';

export interface ComposeOptions {
  /** The lines the graphic carries. Content, never design. */
  lines: LineSpec[];
  resolution?: Resolution;
  fps?: number;
  /** A brand mark to seat, as the shared slot expects it. */
  logo?: ProLogo | null;
  /**
   * The customer's OWN colours, when they stated any. Identity (accent, panel) is copied from
   * here verbatim and the model gets no vote on it; furniture is repaired for legibility. See
   * `resolvePalette` in paint.ts for why this is the platform's job and not the prompt's.
   */
  brandPalette?: BrandPalette | null;
  /**
   * PAINT THE MARK'S COLUMN when its ink cannot read on the panel the language chose.
   *
   * **DEFAULT ON since 2026-08-15 (owner's ruling, docs/NOACG_PRO_PLAN.md §15.8).** What was
   * ruled on is the TRIGGER, not the policy: `markFieldFor` fires only on a SINGLE-INK mark
   * (`MarkProbe.inkSpread` under `MARK_SINGLE_INK_SPREAD`) that measures under the contrast
   * floor on the chosen panel, which over the 18-cell round is once - on the institutional
   * monogram the owner himself named as making the graphic look unfinished. The two coloured
   * roundels the older mean-luminance signal flagged are left alone, because a rendered A/B
   * showed the field made both WORSE and the blind read had passed them.
   *
   * The standing no-plate rule (2026-08-14) was written when the platform did NOT own the
   * composition, where a well could only ever be a patch over someone else's design. Phase A
   * changes that premise: the platform draws the whole composition and knows the mark's ink
   * before the panel colour is chosen, so this is a designed band (`align-self: stretch`, a
   * segment of the panel) rather than a rectangle pasted behind a logo.
   *
   * It stays an OPTION rather than becoming unconditional so a caller measuring the composition
   * without a repair - an A/B, a future re-ruling - can still ask for that.
   */
  markField?: boolean;
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

/** The design body: platform structure, language paint. */
function buildDesign(
  language: DesignLanguage,
  palette: LanguagePalette,
  s: ResolvedSpacing,
  o: ResolvedOptions,
  markField: string,
): L3Design {
  const plan = accentPlan(language.accent.form);
  const surface = panelSurface(language, palette);
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
  /* THE BLOCK HUGS ITS OWN WORDS, and it takes a WIDTH to do it rather than an alignment.
     "align-self: flex-start" was the first attempt and it is inert here: when the design carries
     a mark, the shared logo slot gathers the lines into a plain block container, where a
     cross-axis alignment means nothing - so the block stretched to the NAME's width and a
     two-letter role sat in a full-width bar. The owner's blind read named it: "the orange
     background should scale with the text length". */
  width: fit-content;
  max-width: 100%;                  /* …but never wider than the panel it sits in */
  border-radius: ${px(Math.min(s.cornerPx, 8))};  /* the package's corner language, kept tight */
  /* NO INSET ON THE LEADING EDGE, so the block's edge, its words and the primary line above
     all sit on ONE axis. An inset there has to be paid for somewhere: the first attempt padded
     both sides and pushed the supporting line 8px off the name's axis, and pulling the block
     back by the same amount only moved the near-miss onto the block's own edge (measured, both
     times, by the alignment instrument on the free control run). The trailing edge aligns with
     nothing, so that is where the words get their air. */
  padding: ${px(Math.round(s.lineGapPx / 2))} ${px(s.lineGapPx)} ${px(Math.round(s.lineGapPx / 2))} 0;
}
/* The block's INK is measured, not designed: white or black, whichever reads on this accent. */
.lower-third-mask + .lower-third-mask > span { color: ${readableInkOn(palette.accent)}; }`
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
  color: var(--text-dim);           /* present, and subordinate${language.accent.form === 'block' ? ' - overridden on the accent block below, where the ink is measured' : ''} */
  margin-top: ${px(s.lineGapPx)};  /* the platform's line gap — the two lines read as one unit */${surface.value === 'transparent' && language.accent.form !== 'block' ? '\n  text-shadow: 0 2px 10px rgba(0, 0, 0, 0.75);  /* a super with no panel still has to read */' : ''}
}`;

  return { html, css: css + markField, hasAccent: plan.element };
}

/**
 * The `TemplateVariant` this language IS. Built rather than looked up: Phase A's claim is that
 * one language renders across every graphic type, and a variant is the unit the wizard, the
 * timeline, the Style panel, the exporters and the control layer all already speak.
 */
export function variantForLanguage(
  language: DesignLanguage,
  markField = '',
  brandPalette?: BrandPalette | null,
): TemplateVariant {
  const s = resolveSpacing(language);
  const { palette } = resolvePalette(language, brandPalette);
  const surface = panelSurface(language, palette);
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
      defaultPalette: wizardPalette(language, palette, surface.value),
      defaultFontId: language.typography.fontId,
      defaultZone: 'bottom-left',
    },
    {
      name: language.name,
      description: language.rationale,
      uicolor: '4',
    },
    (o) => buildDesign(language, palette, s, o, markField),
  );
}

/**
 * Render a LOWER THIRD in this language. Deterministic, token-free, and the same function the
 * paid round and the zero-token control both call - a control that does not run the code under
 * test is not a control (docs/AI_ATTEMPTS.md, the $0.25 lesson).
 *
 * The other graphic types in the package are composed by their own modules and reached through
 * `graphics.ts`; this one keeps its own entry point because it is what the product, the spike's
 * anchors and three specs already call.
 */
export function composeFromLanguage(language: DesignLanguage, options: ComposeOptions): ComposedGraphic {
  const s = resolveSpacing(language);
  const { palette, adjustments: paletteAdjustments } = resolvePalette(language, options.brandPalette);
  const surface = panelSurface(language, palette);
  // ON unless a caller explicitly asks for the un-repaired composition - see `ComposeOptions`.
  const markField = options.markField ?? true;
  const mark: MarkTreatment = markField && options.logo
    ? markTreatmentFor(surface.value, options.logo)
    : { kind: 'none', reason: null };
  const variant = variantForLanguage(
    language,
    mark.kind === 'knock' ? markKnockCss('lower-third', mark) : '',
    options.brandPalette,
  );
  // Every divergence from what was asked for, said out loud. A repair the ledger cannot count is
  // a promise nobody can check (the Lite brand rule, `docs/AI_LITE_BRAND_PLAN.md` §3.2).
  const adjustments = [...paletteAdjustments, ...(mark.kind === 'knock' ? ['mark_ink_knocked'] : [])];
  const notes = platformNotes({
    language, spacing: s, surface, prefix: 'lower-third', adjustments, mark,
    plates: platePlan(language, palette, surface, s),
  });
  const template = variant.create({
    lines: options.lines,
    ...(options.resolution ? { resolution: options.resolution } : {}),
    ...(options.fps ? { fps: options.fps } : {}),
    animation: { presetId: s.preset, speed: s.speed, easing: 'auto', steps: false },
    ...(options.logo
      ? {
        logoEnabled: true,
        logoAssetPath: options.logo.assetPath,
        importedImages: options.logo.images,
        // The class the knock rule targets, emitted only when there IS a knock - so the
        // selector and the declaration always arrive together or not at all.
        ...(mark.kind === 'knock' ? { logoInkKnocked: true } : {}),
      }
      : {}),
  });
  return { template, variant, spacing: s, notes, adjustments };
}
