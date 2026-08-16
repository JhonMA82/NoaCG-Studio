// THE PACKAGE - which graphics one design language renders, and what each of them is measured
// against (docs/NOACG_PRO_PLAN.md §15.9).
//
// Phase A's claim, stated in `src/ai/AGENTS.md` and in Pro's own promise, is that a model decides
// a design LANGUAGE and the platform renders it across every graphic type a show needs. Until
// Phase B that claim had been tested on ONE type, which is a lower-third generator with a plan
// attached. This file is the list the claim is actually about.
//
// THE TWO NEW TYPES WERE PICKED FROM THE REGISTRY, NOT FROM TASTE. `src/templates/types/` records
// how many of the 60 reference formats ask for each graphic, and the order is not a matter of
// opinion: lower third 52, sponsor bug 37, countdown 30, topic card 29, title card 23. So the two
// types a show cannot go on air without, after the strap, are the SPONSOR BUG and the COUNTDOWN -
// and they happen to be the two that stress the claim hardest, which is the argument for trusting
// the frequency figure rather than second-guessing it:
//
//   * they span the package's whole footprint range - a corner mark a fifth of the frame wide, a
//     strap along the bottom, a clock panel with an 80px display element;
//   * one is mark-led with a single line, one is text-led with two, one has a primary element no
//     operator types;
//   * and all three are on screen in the same programme, often within a minute of each other,
//     which is what makes "do these belong to each other" a question a person can actually answer.
//
// ── THE INSTRUMENT THRESHOLDS ARE PER TYPE, AND THEY ARE MEASURED ─────────────────────────────
//
// Every calibrated number in `spike/spacingCheck.ts` and `spike/proportionCheck.ts` was taken on
// the lower-third catalog, and both instruments accept an override for every one of them - which
// is what makes a per-type calibration a set of ARGUMENTS rather than an edit to a shared gate.
// `node scripts/pro-type-calibrate.mjs` is the sweep that produced the numbers below: it renders
// the catalog's own shipped designs for each type and reports what the lower third's thresholds
// say about them. Where a shipped design fails a lower-third threshold, the threshold is what is
// wrong for that type, not the design.

import type { SpxTemplate } from '../../../model/types';
import type { LineSpec } from '../../../model/wizard';
import type { DesignLanguage } from './contract';
import { composeFromLanguage, type ComposeOptions, type ComposedGraphic } from './compose';
import { composeBugFromLanguage } from './composeBug';
import { composeTimerFromLanguage } from './composeTimer';
import { GRAPHIC_METRICS, PRO_GRAPHIC_IDS, type ProGraphicId } from './structure';

export type { ProGraphicId };
export { PRO_GRAPHIC_IDS };

/**
 * The instrument thresholds this graphic type is judged against.
 *
 * Structurally a subset of `SpacingOptions` / `ProportionOptions`, re-declared rather than
 * imported: `pro/` may not import the bench-only `spike/` (the layering rule stated in
 * prompt.ts), and the runner is the composition root that holds both halves. An absent key means
 * "the lower third's calibrated value is right for this type too", which is the honest default -
 * a threshold copied and renamed is a second number that can drift from the one it came from.
 */
export interface GraphicInstruments {
  spacing?: {
    paddingFloorRatio?: number;
    paddingSkewFactor?: number;
    lineGapCeilingRatio?: number;
    ruleGapFloorRatio?: number;
    markGapFloorRatio?: number;
    markGapCeilingRatio?: number;
  };
  proportion?: {
    typeRatioFlat?: number;
    typeRatioThin?: number;
    markScaleCeiling?: number;
    panelFillFloor?: number;
    footprintCeiling?: number;
  };
}

export interface ProGraphicSpec {
  id: ProGraphicId;
  /** The graphic-type registry id this composes through. */
  typeId: string;
  /** What a human reading a gallery calls it. */
  label: string;
  /** The class prefix its category emits, for the instruments and the mark field. */
  prefix: string;
  /** How many of the 60 reference formats ask for this graphic - the registry's own figure, and
   *  the reason this type is in the package at all. */
  frequency: number;
  /** Whether a brand mark has anywhere to go. The countdown type declares `logo: 'none'`. */
  takesMark: boolean;
  instruments: GraphicInstruments;
  compose(language: DesignLanguage, options: ComposeOptions): ComposedGraphic;
}

export const PRO_GRAPHICS: Record<ProGraphicId, ProGraphicSpec> = {
  'lower-third': {
    id: 'lower-third',
    typeId: 'lower-third',
    label: 'Lower third',
    prefix: 'lower-third',
    frequency: 52,
    takesMark: true,
    // The type every threshold in both instruments was calibrated on - so it overrides nothing,
    // and any override appearing here later would mean the calibration itself had moved.
    instruments: {},
    compose: composeFromLanguage,
  },
  'sponsor-bug': {
    id: 'sponsor-bug',
    typeId: 'sponsor-bug',
    label: 'Sponsor bug',
    prefix: 'corner-bug',
    frequency: 37,
    takesMark: true,
    instruments: {
      spacing: {
        // MEASURED: the shared clear-space floor flags HALF the shipped bugs - bug01 sits 0.12 of
        // its mark's height from the caption (10px under an 84px mark) and bug02 0.20 (12px under
        // 60px). Both are the design being right rather than crowded: a corner mark is a compact
        // lockup where a strap is a horizontal one, and 0.25 of an 84px mark is 21px of air
        // inside a tile a fifth of the frame wide. Set under the catalog with a margin, not on
        // its tightest design; Phase A's own bug sits at 0.31, three times this floor.
        markGapFloorRatio: 0.1,
      },
      proportion: {
        // A BUG'S MARK IS THE GRAPHIC, and 3.2 primary type sizes is a strap's answer to "is the
        // logo taking over". MEASURED over the four shipped bugs the mark runs 1.67x to 5.25x the
        // caption, and the two the strap's ceiling flags (bug01 5.25, bug04 4.81) are both a
        // small caption under a mark rather than a mark beside a headline. Phase A's own bugs
        // come in at 2.1x-2.7x, so this ceiling bounds the catalog and never binds the composer.
        markScaleCeiling: 5.5,
        // NOTHING ELSE IS OVERRIDDEN, and the sweep is why. A panel-fill floor for the tile was
        // written here on the reasoning that a bug is mostly mark and mostly air; measured, the
        // shipped bug fills 0.56 of its tile and Phase A's fill 0.70-0.78, so the strap's 0.18
        // floor was never near firing. An override nothing needs is a second number that can
        // drift from the one it was copied from.
      },
    },
    compose: composeBugFromLanguage,
  },
  countdown: {
    id: 'countdown',
    typeId: 'countdown',
    label: 'Countdown',
    prefix: 'game-timer',
    frequency: 30,
    takesMark: false,
    instruments: {
      spacing: {
        // MEASURED: gt05, the HOUSE countdown, reads 0.26 type sizes of top padding against a
        // 0.28 floor - 21px over an 80px clock. The floor is a strap's, where the unit is a 54px
        // name; a clock panel's unit is a display element half again as tall, so the same
        // absolute air measures tighter. Phase A's tightest density puts 27px there (0.34), so
        // this covers the catalog and never covers the composer.
        paddingFloorRatio: 0.24,
      },
      proportion: {
        // The catalog's own timers step their label further down from the clock than a strap ever
        // steps its role line: MEASURED, gt01 0.20, gt02 0.25, gt05 0.25, gt06 0.34 - three of
        // the four under the strap's 0.28 "thin" floor. That is the type rather than a defect: a
        // clock is read from across a room and its label is a caption on it. Phase A's own step
        // never goes below 0.36 and measures 0.38-0.63 here, so the floor is lowered to cover the
        // CATALOG rather than to excuse the composer.
        typeRatioThin: 0.18,
      },
      // TWO SHIPPED READINGS ARE LEFT FLAGGED ON PURPOSE, because one design is not a
      // calibration: gt01's clock sits 0.11 type sizes from its accent (inside the 0.02-0.12
      // crowding band - an almost-touch really does read as a mistake, and Phase A's rule gap is
      // 0.45), and gt06's label-to-clock gap is 1.5 against a 1.4 ceiling. Moving a threshold to
      // silence a single design is how an instrument stops measuring anything.
    },
    compose: composeTimerFromLanguage,
  },
};

/** The package, in the registry's frequency order. */
export const PRO_GRAPHIC_LIST: ProGraphicSpec[] = PRO_GRAPHIC_IDS.map((id) => PRO_GRAPHICS[id]);

/**
 * Render one graphic of the package. The single seam a caller composing a whole SET goes through,
 * so "one language, N graphics" is one loop rather than three call sites that can drift.
 */
export function composeGraphic(
  id: ProGraphicId,
  language: DesignLanguage,
  options: ComposeOptions,
): ComposedGraphic {
  return PRO_GRAPHICS[id].compose(language, options);
}

/**
 * WHAT EACH GRAPHIC SAYS, from one show's own facts.
 *
 * A package is judged as a set, so the words have to be the set's: the strap names the person on
 * camera, the bug names the channel or partner that is on screen all segment, and the countdown
 * names what the viewer is waiting for. Deriving all three from one input here is what keeps a
 * gallery row an actual programme rather than three graphics carrying three unrelated captions.
 */
export function packageLines(
  id: ProGraphicId,
  show: { name: string; title: string; channel?: string | null },
): LineSpec[] {
  switch (id) {
    case 'sponsor-bug':
      return [{ title: 'Caption', sample: show.channel?.trim() || 'ON AIR' }];
    case 'countdown':
      return [{ title: 'Label', sample: 'STARTING IN' }];
    case 'lower-third':
    default:
      return [
        { title: 'Name', sample: show.name },
        { title: 'Title', sample: show.title },
      ];
  }
}

/** The primary type size each graphic paints, for a gallery caption that can be checked. */
export function graphicAnchorPx(id: ProGraphicId): number {
  return GRAPHIC_METRICS[id].primaryPx;
}

/** One graphic of a composed package, WITH the type it is - so a member can name itself rather
 *  than be identified by its position in a list an unticked box has already shifted. */
export interface ProPackageMember {
  id: ProGraphicId;
  template: SpxTemplate;
}

/**
 * NAME EVERY MEMBER FOR WHAT IT IS, once there is more than one of them.
 *
 * A composed graphic takes the design LANGUAGE's name, which is right for a single result and
 * useless for a set: three thumbnails captioned "Harbour Nightly", three library rows of that
 * name, and three same-named folders inside one export. **The name is the export slug and the
 * template FOLDER an operator reads in the playout server** (src/export/AGENTS.md), so this is
 * not a caption - it is what makes a package operable once it leaves the wizard.
 *
 * A package of ONE is returned untouched: there is nothing to tell apart, and the
 * single-graphic ending's name placeholder is shipped behaviour.
 *
 * It lives HERE rather than in the wizard step that calls it because the rule is testable only
 * where it can be reached - the Pro door exists on a configured deployment and nowhere else, so
 * a rule buried in that component is pinned by a suite CI never runs.
 */
export function namedPackage(
  members: ProPackageMember[],
  languageName: string,
): ProPackageMember[] {
  if (members.length < 2) return members;
  return members.map((member) => ({
    ...member,
    template: {
      ...member.template,
      name: `${languageName} ${PRO_GRAPHICS[member.id].label.toLowerCase()}`,
    },
  }));
}
