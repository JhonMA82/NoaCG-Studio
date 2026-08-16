// THE PLATFORM'S SIDE OF PHASE A - the structure and the spacing the model never touches
// (docs/NOACG_PRO_PLAN.md §15.5).
//
// THE ONE IDEA IN THIS FILE: every size here is a RATIO OF THE PRIMARY TYPE SIZE, which is the
// unit the instruments measure in (spacingCheck.ts, proportionCheck.ts). The platform therefore
// composes in the same language the measurements are taken in, and a threshold is cleared BY
// CONSTRUCTION rather than by inspection. That is the difference between this and three rounds of
// teaching: `padding-tight` cannot fire on a graphic whose padding is defined as 1.2x the floor.
//
// The margins, stated so a later edit can see what it is spending (all against the calibrated
// thresholds in the instruments, at the WORST density/step combination this file can produce):
//
//   padding-tight        floor 0.28 type sizes  · tightest here 0.34   (compact, vertical)
//   padding-lopsided     limit 2.6x             · here exactly 1.0x - opposite sides are equal
//   lines-adrift         ceiling 1.4            · widest here 0.83     (airy + a strong step)
//   text-crowds-rule     band 0.02-0.12         · nearest rule 0.45    (a rule inside the panel)
//   type-ratio-thin      floor 0.28             · smallest step 0.36
//   type-ratio-flat      band 0.86-0.93         · largest step 0.62
//   panel-oversized      fill floor 0.18        · lowest here ~0.47    (the panel hugs its text)
//   footprint-large      ceiling 0.10 of frame  · largest here ~0.071  (at the auto-fit cap)
//   mark-oversized       ceiling 3.2 type sizes · here 1.2
//   mark-crowded/adrift  band 0.35-2.1          · here 0.48 seated, 0.72 with a mark band
//                                                 (MEASURED on the rendered composition, not
//                                                 derived: `markGapPx` is the slot's gap, and
//                                                 the band adds half of it again as the field's
//                                                 own padding. The line this replaced said "0.4
//                                                 of the mark's height" and both real readings
//                                                 were 0.31 and 0.46 - a stated margin nobody
//                                                 had rendered.)
//   text-escapes-panel   -                      · structurally impossible: the box is
//                                                 `width: fit-content` with the category's
//                                                 auto-fit cap, so it is SIZED BY its text
//
// The last line is the whole point of Phase A. The five failures §15.2 decomposed were all panel
// layout, and four of them are gone here by construction rather than by a check: a panel sized by
// its own text cannot be overflowed, a rule placed by the platform cannot be sat on, a graphic
// anchored in the type's own zone cannot be stranded in a corner, and a mark column capped
// against the type size cannot inflate the composition.
//
// WHAT THE MODEL DECIDES is which of these arrangements to use and what it looks like - see
// contract.ts. Nothing in this file is reachable from the model's answer except by picking one of
// the named enum values, each of which resolves here.
//
// ── PHASE B: THE SAME RATIOS, MORE THAN ONE GRAPHIC (docs/NOACG_PRO_PLAN.md §15.9) ──────────
//
// A channel does not need a lower third; it needs a lower third, a sponsor bug and a countdown
// that visibly belong to each other. Every ratio above is therefore expressed against a PER-TYPE
// anchor (`GRAPHIC_METRICS[id].primaryPx`) rather than against one hard-coded 54px heading: a
// corner bug's caption is small and a countdown's clock is huge, and holding them to the same
// absolute size would be sameness rather than coherence.
//
// TWO NUMBERS DELIBERATELY DO NOT SCALE WITH THE ANCHOR, and that is the sibling rule made
// structural (docs/DESIGN_LANGUAGE.md §8, "reuse the exact token values across categories"): the
// ACCENT's thickness and the CORNER radius are one value for the whole package, resolved against
// `PACKAGE_UNIT_PX`. The catalog already works this way - lt11, gt05 and bug03 all draw their bar
// from the family's single `--accent-weight` - and it is what makes three graphics read as one
// system instead of as three graphics that happen to share a palette.

import type {
  AccentForm,
  AccentWeight,
  Density,
  DesignLanguage,
  MotionCharacter,
  MotionPace,
  TypeStep,
  TypeWeight,
} from './contract';
import type { AnimPresetId, AnimSpeed } from '../../../model/wizard';

/**
 * The primary type size at 1080p, in px, before `--scale` and `--type-scale`.
 *
 * The house strap's own number (lt11), so a Phase A graphic reads at the size the catalog reads
 * at rather than at a size invented here. Everything below is a multiple of it.
 */
export const HEADING_PX = 54;

/**
 * The PACKAGE's reference size - the unit the two cross-graphic constants are resolved against.
 *
 * It is the lower third's own anchor because the strap is the graphic every package is judged by
 * and the one type the calibration was taken on; making it a separate constant is what stops a
 * later edit to one graphic's anchor from silently re-weighting the accent on all three.
 */
export const PACKAGE_UNIT_PX = HEADING_PX;

/** The graphic types Pro composes. Ordered by the registry's own frequency figure - how many of
 *  the 60 reference formats ask for that graphic (`src/templates/types/registry.ts`), which is
 *  what "a show cannot go on air without it" is answered by here rather than by taste. */
export const PRO_GRAPHIC_IDS = ['lower-third', 'sponsor-bug', 'countdown'] as const;
export type ProGraphicId = (typeof PRO_GRAPHIC_IDS)[number];

/**
 * What a graphic TYPE contributes to the resolved spacing: its own type anchor, its own mark
 * geometry, and the presets its category actually draws.
 *
 * The mark numbers are the SHARED SLOT's, not this file's - `templates/shared/logoSlot.ts` draws
 * the mark and the two arrangements it draws are the category's decision, never the language's.
 * They are restated here because the mark FIELD (compose's measured neutral band) has to pad to
 * the band the platform actually paints; a value invented here would pad to a band that is not
 * there.
 */
export interface GraphicMetrics {
  /** The primary type size at 1080p, before `--scale` and `--type-scale`. */
  primaryPx: number;
  /**
   * Whether this graphic draws TWO type sizes, so the language's `step` has something to step.
   *
   * A sponsor bug carries one line and there is nothing for a hierarchy to be expressed between,
   * so its caption is set at the primary size and takes the package's LABEL voice - the same
   * weight, case and tracking a lower third's role line and a countdown's label take. Stepping a
   * single line down from itself would be a size decision with no relationship in it, and it
   * would hand the weight floor a number nothing paints.
   */
  steppedSecondary: boolean;
  /** The mark's painted height and its clear space, or null for a type that carries no mark. */
  mark: { heightPx: number; gapPx: number } | null;
  /** Motion character to a real preset, per category. A preset the category never drew for is a
   *  different graphic rather than a different feeling, so each map stays inside the type's own
   *  declared preset set (`GraphicType.capabilities.animationPresets`). */
  motion: Record<MotionCharacter, AnimPresetId>;
}

export const GRAPHIC_METRICS: Record<ProGraphicId, GraphicMetrics> = {
  // 52 of 60 formats. The strap: two lines, a mark beside them, the calibration's own subject.
  'lower-third': {
    primaryPx: HEADING_PX,
    steppedSecondary: true,
    // 1.2 type sizes tall, its clear space 0.4 of that - the numbers the §15.8 round measured,
    // and 26px of clear space is exactly the shared slot's own `MARK_CLEAR_PX`.
    mark: { heightPx: Math.round(HEADING_PX * 1.2), gapPx: Math.round(HEADING_PX * 1.2 * 0.4) },
    motion: { snap: 'slide-up', glide: 'mask-wipe', reveal: 'line-reveal', fade: 'fade' },
  },
  // 37 of 60 - second only to the lower third. A mark and a caption, parked in a corner for as
  // long as the segment runs, so the MARK is the graphic and the caption is subordinate to it.
  'sponsor-bug': {
    // 24px, the largest caption the four shipped bugs draw (bug03; the other three set 16px).
    // A bug is read at a glance from across a room, and the catalog's smallest is the size the
    // §15.8 blind read already called out on a supporting line ("too thin and small").
    primaryPx: 24,
    steppedSecondary: false,
    // The shared slot's stacked band: 64px tall with 20px of clear space beneath it
    // (`applyLogoSlot`). Not ours to choose - stated so the mark field pads to what is painted.
    mark: { heightPx: 64, gapPx: 20 },
    // The corner-bug type declares fade / slide-up / blur-in / pop-spring. A bug has no line to
    // reveal from behind a mask, so `reveal` resolves out of a blur - the glass entrance the
    // category already ships (bug01).
    motion: { snap: 'pop-spring', glide: 'slide-up', reveal: 'blur-in', fade: 'fade' },
  },
  // 30 of 60. A labelled clock counting down to zero, pausable on air - and the one of the three
  // whose primary element is not a line the operator types.
  countdown: {
    // The clock, at gt05's own display size. The label steps down from it exactly as a lower
    // third's role line steps down from the name, which is the point: one type step, one package.
    primaryPx: 80,
    steppedSecondary: true,
    mark: null,   // the countdown type declares `logo: 'none'` - there is no slot to fill
    // The game-timer category draws exactly two entrances, so three characters resolve onto the
    // quieter one. That is honest rather than lossy: a category that never drew a glide has no
    // glide, and inventing one would be a different graphic (see GraphicMetrics.motion).
    motion: {
      snap: 'timer-run',
      glide: 'timer-line-reveal',
      reveal: 'timer-line-reveal',
      fade: 'timer-line-reveal',
    },
  },
};

/** How far the supporting line steps down. The catalog's own distribution (p50 0.48, p95 0.63)
 *  read off `scripts/spike-proportion-calibrate.mjs`, not chosen by taste. */
const STEP_RATIO: Record<TypeStep, number> = { subtle: 0.62, clear: 0.48, strong: 0.36 };

/** Padding and the gap between lines, per density, as ratios of the heading size.
 *  Opposite sides are always EQUAL, which is what retires `padding-lopsided` structurally. */
const DENSITY_SPACE: Record<Density, { padV: number; padH: number; lineGap: number }> = {
  compact: { padV: 0.34, padH: 0.46, lineGap: 0.14 },
  balanced: { padV: 0.46, padH: 0.62, lineGap: 0.20 },
  airy: { padV: 0.62, padH: 0.86, lineGap: 0.30 },
};

/** The accent's thickness, as a ratio of the heading size. */
const ACCENT_RATIO: Record<AccentWeight, number> = { hairline: 0.06, medium: 0.15, heavy: 0.3 };

/** The clear space between a rule that sits INSIDE the panel and the text beside it. Well above
 *  the 0.12 crowding band, and never zero - `touching is a composition` is a decision the
 *  catalog's own designs make, not one to fall into by accident. */
const RULE_GAP_RATIO = 0.45;

/** Corner radii in px at scale 1. `pill` is a capsule, capped by the browser at half the height. */
const CORNER_PX = { sharp: 0, soft: 6, round: 16, pill: 999 } as const;

/** Letter-spacing, in em, for the two lines. Caps lines take the wider half of each pair,
 *  because tracked caps is the label voice and untracked caps is a mistake. */
const TRACKING_EM = {
  tight: { heading: '-0.02em', supporting: '0.04em' },
  normal: { heading: '0em', supporting: '0.08em' },
  wide: { heading: '0.02em', supporting: '0.16em' },
} as const;

/** CSS font weights. */
const WEIGHT: Record<TypeWeight, number> = {
  regular: 400, medium: 500, semibold: 600, bold: 700, black: 900,
};

/**
 * THE SUPPORTING LINE'S WEIGHT FLOOR, AND WHY IT IS A FUNCTION OF ITS SIZE.
 *
 * The owner's blind read of the first Phase A round (2026-08-15): *"the title is too thin and
 * small for it to be legible"*. That graphic's supporting line was 26px `regular` in the brand's
 * own grey - and it CLEARED the contrast floor at 4.6:1, so no colour repair fired. Contrast was
 * never the defect; a hairline stroke at broadcast distance was.
 *
 * Small text is read by its STEM, not by its colour, so the floor is size-dependent: at the
 * catalog's own median supporting size a regular weight is not enough, and above this size the
 * model's choice stands untouched. It is a boundary rather than a repair - the language still
 * decides the voice, it just cannot ask for a stroke nobody can resolve.
 */
export const SUPPORTING_WEIGHT_FLOOR_BELOW_PX = 30;
export const SUPPORTING_WEIGHT_FLOOR = WEIGHT.medium;

/**
 * A LABEL ON A SOLID SLAB IS A LABEL. The block accent form puts the supporting line ON the
 * accent, where it stops being subordinate text and becomes a badge - so it carries its own,
 * higher floor. Both cells that used this form failed the same blind read (*"black text on an
 * orange background is not so good, and the text is very small"*), and this is the half of that
 * fault that is about weight; `readableInkOn` in compose.ts is the half about colour.
 */
export const BLOCK_LABEL_WEIGHT_FLOOR = WEIGHT.semibold;
/** …and its SIZE floor, for the other half of the same note ("the text is very small"). A line
 *  set on a solid slab of the accent colour is the loudest thing in the composition after the
 *  name; at the bottom of the step range it reads as a caption someone forgot to finish. */
export const BLOCK_LABEL_MIN_PX = 30;

/** The mark's height and its clear space, against the type it stands beside - never against the
 *  frame, which is what "the logo takes half the screen" gets wrong. */
export const MARK_HEIGHT_RATIO = 1.2;
export const MARK_GAP_RATIO = 0.4;

/** Pace is the one motion decision that means the same thing in every category, so unlike the
 *  character map above it is a single table. */
const MOTION_SPEED: Record<MotionPace, AnimSpeed> = { fast: 1.5, measured: 1, slow: 0.75 };

/** Every number the composer needs, resolved from the language. Nothing downstream computes
 *  geometry: it reads this. */
export interface ResolvedSpacing {
  headingPx: number;
  supportingPx: number;
  padVPx: number;
  padHPx: number;
  lineGapPx: number;
  accentPx: number;
  ruleGapPx: number;
  cornerPx: number;
  markHeightPx: number;
  markGapPx: number;
  headingWeight: number;
  supportingWeight: number;
  headingTracking: string;
  supportingTracking: string;
  preset: AnimPresetId;
  speed: AnimSpeed;
}

/**
 * Every number a composer needs, resolved from the language for ONE graphic type.
 *
 * `graphic` defaults to the lower third, which is what keeps the shipped strap byte-identical to
 * the composition the §15.8 blind read scored: at that anchor every expression below reduces to
 * the constant it was before Phase B existed.
 */
export function resolveSpacing(
  language: DesignLanguage,
  graphic: ProGraphicId = 'lower-third',
): ResolvedSpacing {
  const metrics = GRAPHIC_METRICS[graphic];
  const space = DENSITY_SPACE[language.density];
  const heading = metrics.primaryPx;
  const supporting = Math.max(
    metrics.steppedSecondary ? Math.round(heading * STEP_RATIO[language.typography.step]) : heading,
    language.accent.form === 'block' ? BLOCK_LABEL_MIN_PX : 0,
  );
  const tracking = TRACKING_EM[language.typography.tracking];
  // The two floors above, applied. Recorded by the caller as an adjustment when either bites.
  const supportingWeight = Math.max(
    WEIGHT[language.typography.supportingWeight],
    supporting < SUPPORTING_WEIGHT_FLOOR_BELOW_PX ? SUPPORTING_WEIGHT_FLOOR : 0,
    language.accent.form === 'block' ? BLOCK_LABEL_WEIGHT_FLOOR : 0,
  );
  // ── THE UNIT IS THE LARGEST PAINTED TYPE SIZE, NOT THE ANCHOR ──────────────────────────
  //
  // `spacingCheck` reports padding as a ratio of the PRIMARY type size it measures on the frame,
  // and on two of the three graphics the anchor IS that size - so this reduced to `heading` and
  // nobody noticed the difference. On a sponsor bug it does not: the caption is the only line,
  // and the block accent form's own size floor (BLOCK_LABEL_MIN_PX) can raise what is painted
  // above the anchor the padding was derived from. Measured on the free per-type sweep: a compact
  // block-accent bug came out at 8px of padding on a 30px caption - 0.27 against a 0.28 floor,
  // `padding-tight`, on a composition whose whole premise is that the threshold is cleared BY
  // CONSTRUCTION. Deriving the unit from what is painted is what makes that true again.
  const unit = Math.max(heading, supporting);
  return {
    headingPx: heading,
    supportingPx: supporting,
    padVPx: Math.round(unit * space.padV),
    padHPx: Math.round(unit * space.padH),
    lineGapPx: Math.round(unit * space.lineGap),
    // Against the PACKAGE unit, not this graphic's anchor - one bar weight for the whole set.
    accentPx: Math.round(PACKAGE_UNIT_PX * ACCENT_RATIO[language.accent.weight]),
    ruleGapPx: Math.round(heading * RULE_GAP_RATIO),
    cornerPx: CORNER_PX[language.shape.corner],
    // The shared slot's own geometry, or the lower third's ratios where it has none to state.
    markHeightPx: metrics.mark?.heightPx ?? Math.round(heading * MARK_HEIGHT_RATIO),
    markGapPx: metrics.mark?.gapPx ?? Math.round(heading * MARK_HEIGHT_RATIO * MARK_GAP_RATIO),
    headingWeight: WEIGHT[language.typography.headingWeight],
    supportingWeight,
    headingTracking: tracking.heading,
    supportingTracking: tracking.supporting,
    preset: metrics.motion[language.motion.character],
    speed: MOTION_SPEED[language.motion.pace],
  };
}

/**
 * WHERE THE ACCENT GOES, per form. The platform draws all of it: which element carries the
 * accent class, what it looks like, and how the panel makes room for it.
 *
 * `edge-bar` is the house arrangement (lt11): the bar is fused to the panel's leading edge and
 * lives OUTSIDE the panel's padding, so it can never crowd the text. `top-rule` and `underline`
 * sit inside, one clear-space away. `block` puts the supporting line on the accent itself, which
 * is the one arrangement where text TOUCHING the accent is the composition rather than a defect
 * (lt39 ships exactly that) - and it is drawn as contact, never as a near miss.
 */
export interface AccentPlan {
  /** Whether a `.PREFIX-accent` ELEMENT is emitted. `block` deliberately does not emit one: the
   *  accent is the supporting line's own surface, so there is no separate shape to animate, and
   *  claiming one would hand the entrance preset an element that does not exist. */
  element: boolean;
  /** Where it sits, for the structure comment a reader of the generated code sees. */
  note: string;
}

export function accentPlan(form: AccentForm): AccentPlan {
  switch (form) {
    case 'edge-bar':
      return { element: true, note: 'a bar fused to the panel\'s leading edge, outside its padding' };
    case 'top-rule':
      return { element: true, note: 'a rule across the top of the panel, one clear space above the words' };
    case 'underline':
      return { element: true, note: 'a rule under the words, one clear space below them' };
    case 'block':
      return { element: false, note: 'a solid block the supporting line sits on' };
    case 'none':
    default:
      return { element: false, note: 'no accent shape - the accent colour lives in the type alone' };
  }
}
