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
//   mark-crowded/adrift  band 0.25-1.6          · here 0.4 of the mark's height
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

/**
 * Motion character to a real preset. The lower third's declared preset set is the ceiling here:
 * a preset the category never drew for is a different graphic, not a different feeling.
 */
const MOTION_PRESET: Record<MotionCharacter, AnimPresetId> = {
  snap: 'slide-up',
  glide: 'mask-wipe',
  reveal: 'line-reveal',
  fade: 'fade',
};

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

export function resolveSpacing(language: DesignLanguage): ResolvedSpacing {
  const space = DENSITY_SPACE[language.density];
  const heading = HEADING_PX;
  const supporting = Math.max(
    Math.round(heading * STEP_RATIO[language.typography.step]),
    language.accent.form === 'block' ? BLOCK_LABEL_MIN_PX : 0,
  );
  const tracking = TRACKING_EM[language.typography.tracking];
  // The two floors above, applied. Recorded by the caller as an adjustment when either bites.
  const supportingWeight = Math.max(
    WEIGHT[language.typography.supportingWeight],
    supporting < SUPPORTING_WEIGHT_FLOOR_BELOW_PX ? SUPPORTING_WEIGHT_FLOOR : 0,
    language.accent.form === 'block' ? BLOCK_LABEL_WEIGHT_FLOOR : 0,
  );
  return {
    headingPx: heading,
    supportingPx: supporting,
    padVPx: Math.round(heading * space.padV),
    padHPx: Math.round(heading * space.padH),
    lineGapPx: Math.round(heading * space.lineGap),
    accentPx: Math.round(heading * ACCENT_RATIO[language.accent.weight]),
    ruleGapPx: Math.round(heading * RULE_GAP_RATIO),
    cornerPx: CORNER_PX[language.shape.corner],
    markHeightPx: Math.round(heading * MARK_HEIGHT_RATIO),
    markGapPx: Math.round(heading * MARK_HEIGHT_RATIO * MARK_GAP_RATIO),
    headingWeight: WEIGHT[language.typography.headingWeight],
    supportingWeight,
    headingTracking: tracking.heading,
    supportingTracking: tracking.supporting,
    preset: MOTION_PRESET[language.motion.character],
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
