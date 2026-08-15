// WHAT THE LANGUAGE PAINTS WITH - the colour decisions every Phase A graphic shares
// (docs/NOACG_PRO_PLAN.md §15.5, §15.9).
//
// It exists because Phase B made one language render THREE graphics. The surface treatment, the
// brand palette contract, the measured ink and the mark's reading field are the same questions in
// a lower third, a sponsor bug and a countdown, and a second copy of any of them is how two
// graphics in one package come to disagree about the customer's own colours - which is the exact
// failure the coherence claim is about.
//
// Nothing here decides geometry (structure.ts) or markup (the per-graphic composers). It answers
// three questions and no others: what surface the words sit on, which colours are the customer's
// and which are the platform's, and whether the mark can be read on the surface the language
// chose.

import { contrastRatio, parseCssColor } from '../../../blocks/cssVars';
import { applyLiteBrandPalette, clampLitePalette } from '../../liteContract';
import type { AssetFile } from '../../../model/types';
import type { Palette } from '../../../model/wizard';
import type { DesignLanguage, LanguagePalette } from './contract';
import { accentPlan, type ResolvedSpacing } from './structure';

/** A brand mark to seat, as the shared slot expects it. `inkLuminance`, `inkSpread` and `backing`
 *  are the content-free facts `probeMark` measures; they are what the mark FIELD decides on. */
export interface ProLogo {
  assetPath: string;
  images: AssetFile[];
  inkLuminance?: number;
  inkSpread?: number;
  backing?: 'transparent' | 'own-field';
}

/**
 * THE REQUESTED BRAND PALETTE - identity verbatim, furniture legible.
 *
 * RATIFIED ON LITE 2026-08-13 AND MISSING FROM PRO UNTIL 2026-08-15 (`docs/AI_LITE_BRAND_PLAN.md`
 * §3.1, `src/ai/AGENTS.md`). When the customer states their colours, those colours ARE the
 * graphic's: the model gets no vote on them, because "exactly the brand's colours" is the whole
 * product claim and it can fail three silent ways through a model echo - a near-miss hex, an
 * omitted palette that lets a default carry, and a legibility repair deleting the package.
 *
 * Pro asked the model to return the palette and stated the brand in PROSE (`pro/brief.ts`
 * `proBrandSection`), which is a decision expressed where nothing can check it. The prompt still
 * describes the brand - a language decision needs to know what world it is in - but the platform
 * now copies the identity over whatever came back, and RECORDS the divergence.
 *
 * What that changes about the record: the §15.8 round's 26-of-30 blind read measured the PROSE
 * version, so it says nothing about how faithfully a stated palette now lands.
 */
export type BrandPalette = LanguagePalette;

export interface ResolvedPalette {
  /** The four roles, after identity is copied and furniture is repaired. */
  palette: LanguagePalette;
  /** Every divergence from what was asked for, in Lite's own adjustment vocabulary. */
  adjustments: string[];
}

/**
 * The colours this graphic is actually drawn in.
 *
 * With no requested brand this is exactly what Phase A always did - the model's four roles with
 * the furniture brought up to the contrast floor against its own panel. With one, the identity
 * (accent and panel) is the REQUEST's, taken verbatim, and the furniture goes through the same
 * ladder. `applyLiteBrandPalette` is imported rather than re-implemented for the reason a second
 * legibility ladder is always wrong: two answers that can disagree about one customer's colours.
 */
export function resolvePalette(
  language: DesignLanguage,
  brand?: BrandPalette | null,
): ResolvedPalette {
  if (!brand) return clampLitePalette(language.palette);
  return applyLiteBrandPalette(brand, language.palette);
}

/**
 * The ink that READS on a surface - white or black, whichever measures better.
 *
 * The block accent form used to print the supporting line in `var(--panel-bg)`, on the reasoning
 * that the panel's own colour would look deliberate against the accent. It does not measure:
 * the owner's blind read named it twice on the two graphics that used the form (*"black text on
 * an orange background is not so good"*), and a dark plum on a bright orange is exactly the pair
 * that argument produces. The panel colour is a DESIGN answer to a LEGIBILITY question, which is
 * the class of decision the platform exists to take off the model.
 */
export function readableInkOn(surface: string): string {
  const bg = parseCssColor(surface);
  if (!bg) return '#000000';
  const white = parseCssColor('#ffffff');
  const black = parseCssColor('#000000');
  if (!white || !black) return '#000000';
  return contrastRatio(white, bg) >= contrastRatio(black, bg) ? '#ffffff' : '#000000';
}

/** #rrggbb plus an alpha, as an rgba() a decade-old CasparCG build still parses. No color-mix:
 *  the auto-fit cap next door carries a comment about exactly this, and a panel that silently
 *  drops its background on an old engine is a graphic nobody can read. */
export function rgba(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

export interface PanelSurface {
  value: string;
  blur: boolean;
  note: string;
}

/** The surface the words sit on, per the language's panel treatment. One answer for the whole
 *  package: a bug drawn on a solid tile beside a strap drawn on a blurred one is two designs. */
export function panelSurface(language: DesignLanguage, palette: LanguagePalette): PanelSurface {
  switch (language.shape.panel) {
    case 'solid':
      return { value: palette.panel, blur: false, note: 'a solid surface' };
    case 'translucent':
      return { value: rgba(palette.panel, 0.82), blur: false, note: 'a translucent surface' };
    case 'none':
      return { value: 'transparent', blur: false, note: 'no surface - the words sit on the picture' };
    case 'blurred':
    default:
      return { value: rgba(palette.panel, 0.72), blur: true, note: 'a blurred surface' };
  }
}

/** The wizard `Palette` the `:root` contract is written from. The surface carries the treatment's
 *  own alpha, so the Style panel retints the graphic the language actually drew. */
export function wizardPalette(
  language: DesignLanguage,
  palette: LanguagePalette,
  surface: string,
): Palette {
  return {
    id: 'pro-language',
    name: language.name,
    styleTags: ['noacg'],
    accent: palette.accent,
    text: palette.text,
    textDim: palette.textDim,
    panel: surface,
  };
}

/** The audited pair from `benchmarks/lite/BRAND-AUDIT-2026-08-09.md` - a fixed neutral, never the
 *  palette whose tone already failed. */
const MARK_FIELD_LIGHT = '#f2f4f7';
const MARK_FIELD_DARK = '#12161c';
/** The same 3:1 the rendered mark gate and the Lite brand audit both measure against. */
const MARK_INK_CONTRAST_FLOOR = 3;
/**
 * How far a mark's ink may spread and still count as ONE ink (`MarkProbe.inkSpread`).
 *
 * MEASURED over the four fixture marks rather than chosen: the two single-ink marks - a volt
 * wordmark and a navy monogram, hues as far apart as the set holds - come in at 0.0021 and
 * 0.0004, and the full-colour roundel at 0.2053. Two orders of magnitude, so this floor sits 24x
 * above the loosest single ink and 4x below the coloured mark, and no plausible drift crosses it.
 *
 * This is the whole reason the field can be trusted. A mean luminance flagged three marks in the
 * Phase A round and the owner's eye agreed with one; the spread is what separates the mark that
 * genuinely vanishes from the one that merely measures badly.
 */
const MARK_SINGLE_INK_SPREAD = 0.05;

/** A colour's relative luminance, read back out of the one contrast function this repo has.
 *  contrast(c, black) = (L + 0.05) / 0.05, so L falls straight out of it - which is cheaper and
 *  safer than a second copy of the luminance formula. */
function luminanceOf(color: string): number | null {
  const parsed = parseCssColor(color);
  const black = parseCssColor('#000000');
  if (!parsed || !black) return null;
  return contrastRatio(parsed, black) * 0.05 - 0.05;
}

function contrastFromLuminance(a: number, b: number): number {
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

export interface MarkField {
  fill: string;
  reason: string;
}

/**
 * The surface the mark needs, or null when it already reads.
 *
 * Deciding this needs nothing from the layout - only the mark's measured ink and the surface the
 * language chose - so it is deterministic, it is here, and it is the SAME answer on every graphic
 * type in the package. A mark that brings its own field reads on anything and is left alone; a
 * transparent one is judged against the surface, and when it falls under the floor the better of
 * the two audited neutrals is chosen BY MEASUREMENT rather than by assuming a dark ink wants the
 * light one (the sunbeam roundel is the counter-example: mid-tone ink that reads 9.4:1 on the
 * dark neutral and 1.8:1 on the light).
 */
export function markFieldFor(surface: string, logo: ProLogo): MarkField | null {
  if (logo.backing === 'own-field' || typeof logo.inkLuminance !== 'number') return null;
  // ONE INK, OR NOTHING. A coloured mark reads by hue and shape, not by the mean luminance the
  // contrast test measures, so a field would be a repair for a defect it does not have - which
  // is exactly what a rendered A/B showed on the Phase A round: the two flagged roundel cells
  // came out WORSE with a field and the owner's blind read had passed both. An older probe with
  // no spread at all is treated as "cannot tell", and cannot tell means do not touch it.
  if (typeof logo.inkSpread !== 'number' || logo.inkSpread > MARK_SINGLE_INK_SPREAD) return null;
  const panel = luminanceOf(surface);
  if (panel === null) return null;   // a panel-free super paints no surface to fail against
  const onPanel = contrastFromLuminance(logo.inkLuminance, panel);
  if (onPanel >= MARK_INK_CONTRAST_FLOOR) return null;
  const light = luminanceOf(MARK_FIELD_LIGHT) ?? 1;
  const dark = luminanceOf(MARK_FIELD_DARK) ?? 0;
  const onLight = contrastFromLuminance(logo.inkLuminance, light);
  const onDark = contrastFromLuminance(logo.inkLuminance, dark);
  const better = onLight >= onDark
    ? { fill: MARK_FIELD_LIGHT, ratio: onLight }
    : { fill: MARK_FIELD_DARK, ratio: onDark };
  return {
    fill: better.fill,
    // An honest failure beats a silent one: if neither neutral clears the floor the field still
    // goes on, as the best surface available, and the reason says so.
    reason: `the mark reads ${onPanel.toFixed(2)}:1 on this panel (floor ${MARK_INK_CONTRAST_FLOOR})`
      + ` - its column carries ${better.fill}, where it reads ${better.ratio.toFixed(2)}:1`,
  };
}

/**
 * The mark's reading field as a BAND of the composition, not a plate around the artwork.
 *
 * TWO ARRANGEMENTS, because the shared slot has two and the field has to fit the one that is
 * drawn (`templates/shared/logoSlot.ts`). On a STRAP the mark is a leading column, so
 * `align-self: stretch` makes its box the full height of the text stack and the field reads as a
 * segment of the panel. Everywhere else the mark is a band ABOVE the text, already its own row,
 * so the field is symmetric padding around it. `object-fit: contain` keeps the artwork
 * undistorted in both (never `cover` - the as-is screen refuses a cropped mark, and rightly).
 *
 * That distinction is the whole of the no-plate rule: the field is only drawable at all because
 * the platform owns this composition and knows the mark's ink before the surface is chosen.
 */
export function markFieldCss(
  prefix: string,
  field: MarkField,
  s: ResolvedSpacing,
): string {
  const inset = Math.round(s.markGapPx / 2);
  // The strap's emit is kept BYTE-IDENTICAL to what the §15.8 round scored: a control that
  // composes something other than what was measured stops being comparable with it.
  const geometry = prefix === 'lower-third'
    ? `  align-self: stretch;              /* the full height of the words beside it: a band, not a box */
  background: ${field.fill};              /* a fixed neutral - never the palette whose tone already failed */
  object-fit: contain;              /* the whole mark, never cropped or stretched */
  padding: 0 calc(${inset}px * var(--scale));  /* its clear space, inside the field */`
    : `  background: ${field.fill};              /* a fixed neutral - never the palette whose tone already failed */
  object-fit: contain;              /* the whole mark, never cropped or stretched */
  box-sizing: content-box;          /* the field grows around the mark, never squeezes it */
  padding: calc(${inset}px * var(--scale));  /* its clear space, on all four sides of the band */`;
  return `
/* == PLATFORM: ${field.reason}. == */
.${prefix}-box > .${prefix}-logo {
${geometry}
}`;
}

/**
 * WHAT THE PLATFORM DECIDED, said out loud - the same four sentences for every graphic in the
 * package, plus whatever it had to repair.
 *
 * One writer for all three types, because these notes are what the result card shows and what
 * `gate.ts` re-reads for the `pro-mark-field` finding; two writers is how the note and the
 * finding come to state different numbers about the same repair.
 */
export function platformNotes(input: {
  language: DesignLanguage;
  spacing: ResolvedSpacing;
  surface: PanelSurface;
  /** The class prefix, for the accent note's honest caveat. */
  prefix: string;
  adjustments: string[];
  field: MarkField | null;
}): string[] {
  const { language, spacing, surface, prefix, adjustments, field } = input;
  const plan = accentPlan(language.accent.form);
  const notes = [
    `structure and spacing: platform-owned (${language.density} density -`
    + ` ${spacing.padVPx}/${spacing.padHPx}px padding, ${spacing.lineGapPx}px line gap, at scale 1)`,
    `accent: ${plan.note}`,
    `surface: ${surface.note}`,
    `motion: ${language.motion.character} at ${language.motion.pace} pace → preset ${spacing.preset}`,
  ];
  if (!plan.element && language.accent.form !== 'none') {
    notes.push(`the accent is drawn without a .${prefix}-accent element, so the entrance`
      + ' animates the panel and its lines rather than a separate shape');
  }
  if (adjustments.length) notes.push(`palette furniture repaired: ${adjustments.join(', ')}`);
  if (field) notes.push(`mark field: ${field.reason}`);
  return notes;
}
