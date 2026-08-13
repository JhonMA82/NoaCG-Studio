// PHASE 0 SPIKE - the zero-token CONTROL and the gallery's blind ANCHORS
// (docs/NOACG_PRO_PLAN.md §0.1, §0.2).
//
// BENCH-ONLY (see exemplars.ts for the deletion condition).
//
// THE CONTROL is the first thing that runs and the reason this file exists first. Before any
// token is spent, one known-good HAND-AUTHORED lower third goes through the complete wrapper
// - scaffold contract, render set, deterministic gates, motion capture, gallery. If the
// control looks broken, the harness is broken. Two paid rounds have already been mis-read as
// model failure when the platform was at fault (docs/AI_ATTEMPTS.md: a gateway that refused
// correctly-encoded structured output; a style patch that collapsed the root to 0x0), and
// every gate stayed green through both. The control rerun is MANDATORY after any change to
// the wrapper, not just before the first round.
//
// THE ANCHORS are what stops the human read from happening cold. §0.2 requires the review
// gallery to blind-mix a few adapt-first outputs and strong catalog graphics among the
// candidates, so "coherent, deliberate composition" is judged against visible references
// rather than against a memory of one. Both anchor kinds are free: a catalog graphic is
// `variant.create()`, and an adapt-first output is the offline stub, which is the SAME
// grounded compile path (keyword -> DesignSpec -> specToTemplate) the product runs, minus
// the model call.

import { variantById } from '../../templates/catalog';
import { assembleGroundedTemplate } from '../litePipeline';
import { VETTED_EXEMPLAR_IDS } from './exemplars';
import { fillBrandMark, type SpikeBrand } from './brand';
import type { DesignSpec } from '../designSpec';
import type { SpxTemplate } from '../../model/types';
import type { SpikeBrief } from './run';

/** What every anchor and the control is, for the key file the human reads AFTER judging. */
export type AnchorKind = 'control' | 'catalog' | 'adapt-first';

export interface SpikeAnchor {
  id: string;
  kind: AnchorKind;
  /** Human-readable provenance, revealed only with the key. */
  provenance: string;
  template: SpxTemplate;
  data: Record<string, string>;
  stressData: Record<string, string>;
  /** Set on the mark-fill control: which field carries the brand mark, so the runner points
   *  the rendered mark measurement at it - the same measurement every candidate gets. */
  markFieldId?: string;
}

/**
 * The control brief. Ordinary on purpose - the control measures the WRAPPER, so anything
 * unusual about the graphic would make a broken strip ambiguous.
 */
export const CONTROL_BRIEF: SpikeBrief = {
  brief: 'Control run - a hand-authored house lower third, no model involved.',
  name: 'Alexandra Riva',
  title: 'Chief Political Correspondent',
};

/** The control design: `lt11` House Strap - the house lower third, the one design whose
 *  correct appearance everyone working on this repo already knows by sight. */
const CONTROL_VARIANT_ID = 'lt11';

/** Stress text is what §0.2 asks the human to review beside the normal case, and it is also
 *  what the mid-air `update()` cue writes during the motion capture: a strap that survives
 *  its entrance and breaks on the first real name is a strap that breaks on air. */
export function stressFor(brief: SpikeBrief): Record<string, string> {
  return {
    f0: `${brief.name} de la Cruz-Whittington`,
    f1: `${brief.title}, Southern Bureau and Election Desk`,
  };
}

export function dataFor(brief: SpikeBrief): Record<string, string> {
  return { f0: brief.name, f1: brief.title };
}

/** Field values for an arbitrary template: the brief's two lines against whatever text
 *  fields the design actually declares, so an anchor with a logo slot or a third line is
 *  still driven rather than left on its design defaults. */
function driveData(template: SpxTemplate, values: string[]): Record<string, string> {
  const text = template.fields.filter((f) => f.ftype === 'textfield' || f.ftype === 'textarea');
  return Object.fromEntries(
    text.map((f, i) => [f.field, values[i] ?? String(f.value ?? '')]),
  );
}

/**
 * The zero-token control: a real catalog design created with the control brief's own lines,
 * exactly as the wizard would build it.
 */
export function controlAnchor(): SpikeAnchor {
  const variant = variantById(CONTROL_VARIANT_ID);
  if (!variant) throw new Error(`spike control: variant ${CONTROL_VARIANT_ID} is gone from the catalog`);
  const template = variant.create({
    lines: [
      { title: 'Name', sample: CONTROL_BRIEF.name },
      { title: 'Role', sample: CONTROL_BRIEF.title },
    ],
  });
  const stress = stressFor(CONTROL_BRIEF);
  return {
    id: 'control',
    kind: 'control',
    provenance: `hand-authored catalog design ${variant.id} "${variant.name}"`,
    template,
    data: driveData(template, [CONTROL_BRIEF.name, CONTROL_BRIEF.title]),
    stressData: driveData(template, [stress.f0, stress.f1]),
  };
}

/**
 * The MARK-FILL control (the brand round's addition to the zero-token set): a hand-authored
 * catalog design with its shared logo slot turned on, filled with a REAL synthetic brand mark
 * through the SAME `fillBrandMark` every candidate goes through, and measured by the same
 * rendered gate. If this control's mark is broken, missing or unmeasurable, the fill or the
 * measurement is broken - and a paid round would have measured the harness (the Phase 0
 * lesson, twice over). lt11's slot is the shared band (templates/shared/logoSlot.ts), the one
 * every 'optional' design inherits, so the control exercises the canonical slot rather than a
 * bespoke one.
 */
export function markControlAnchor(brand: SpikeBrand): SpikeAnchor {
  const variant = variantById(CONTROL_VARIANT_ID);
  if (!variant) throw new Error(`spike mark control: variant ${CONTROL_VARIANT_ID} is gone from the catalog`);
  if (variant.logo === 'none') {
    throw new Error(`spike mark control: ${CONTROL_VARIANT_ID} no longer declares a logo capability`);
  }
  const bare = variant.create({
    lines: [
      { title: 'Name', sample: CONTROL_BRIEF.name },
      { title: 'Role', sample: CONTROL_BRIEF.title },
    ],
    logoEnabled: true,
  });
  const { template, fill } = fillBrandMark(bare, brand);
  if (!fill.slotFieldId || !fill.path) {
    throw new Error('spike mark control: the shared logo slot was not found by the fill - the fill is broken');
  }
  const stress = stressFor(CONTROL_BRIEF);
  return {
    id: 'control-mark',
    kind: 'control',
    provenance: `hand-authored ${variant.id} "${variant.name}" + shared logo slot, filled with the "${brand.name}" mark by fillBrandMark`,
    template,
    // The mark's path rides the update payload too, so the runtime's own setFieldValue path
    // (src + has-image) is exercised beside the baked src.
    data: { ...driveData(template, [CONTROL_BRIEF.name, CONTROL_BRIEF.title]), [fill.slotFieldId]: fill.path },
    stressData: { ...driveData(template, [stress.f0, stress.f1]), [fill.slotFieldId]: fill.path },
    markFieldId: fill.slotFieldId,
  };
}

/**
 * Strong catalog graphics for the blind gallery.
 *
 * THREE CONSTRAINTS, and the first control run found two of them the hard way:
 *
 *   1. NOT FROM THE EXEMPLAR POOL. An anchor that is also an exemplar would let a near-copy
 *      of an exemplar score as "as good as the anchors" by being the anchor, and §0.3's last
 *      condition is precisely that the promising results are not near-copies.
 *   2. TWO LINES OR MORE. `lt19` Rule Under sat in this list until the control run rendered
 *      it: `maxLines: 1`, so the assembler correctly dropped the supporting line and the
 *      anchor showed a name and nothing else. Judged beside two-line candidates it would
 *      have read as the cleaner composition for having less in it. Asserted below rather
 *      than trusted.
 *   3. A SPREAD - different style families and different shape languages, and across the six
 *      free items as a whole an even split of ZONES (three bottom-left: the control, lt08,
 *      lt40; three bottom-right: lt27, lt42, lt38), because composition is one of the things
 *      §0.2 asks the human to read and six graphics anchored identically would not exercise
 *      it.
 */
const ANCHOR_CATALOG_IDS: readonly string[] = [
  'lt27', // Column Rule - editorial, quiet, panel-free, bottom-right
  'lt08', // Frosted Card - glass, a card rather than a strap, bottom-left
  'lt42', // Right Slam - sport, heavy, bottom-right
];

/**
 * The adapt-first anchors, as hand-written `DesignSpec`s compiled through the REAL grounded
 * path - `assembleGroundedTemplate` = specToTemplate + applyDesignAdjustments +
 * ensureSpecFonts + applySpecOutPreset, the same function `claudeProvider` and every Lite
 * generation compile through. Zero tokens: only the model call that would have WRITTEN the
 * spec is missing, and these specs stand in for it.
 *
 * WHY NOT THE OFFLINE STUB, which was the first attempt. Measured over 20 briefs, the stub
 * reaches exactly four chassis - lt11 on 15 of them, then lt05, lt32 and lt02 - and all four
 * are in the vetted exemplar pool. Its chassis choice is a small keyword table, not
 * retrieval, so a "stub adapt-first anchor" shows the compile path's quality under the
 * stub's judgement and calls it the product's. Writing the spec by hand is the more honest
 * of the two: the compile is real and the choice is stated.
 *
 * The chassis are chosen OUTSIDE the exemplar pool and outside the catalog-anchor list, for
 * the reason in `galleryAnchors` below. The compositional parameters are what makes these
 * adapt-first rather than plain catalog graphics: the deterministic adjustment block is the
 * thing that keeps grounded output diverse (src/ai/AGENTS.md), so an anchor that skipped it
 * would understate what the live path produces.
 */
const ANCHOR_NAME = 'Priya Raghunathan';
const ANCHOR_ROLE = 'Senior Research Fellow';
const ANCHOR_STRESS_NAME = 'Priya Raghunathan-Vasquez';
const ANCHOR_STRESS_ROLE = 'Senior Research Fellow, Centre for Comparative Media Policy';

const ADAPT_ANCHOR_SPECS: readonly { brief: string; spec: DesignSpec }[] = [
  {
    brief: 'a bold lower third for a live esports tournament caster',
    spec: {
      fit: 'catalog',
      reason: 'A high-energy competitive strap; the sport family carries the structure.',
      name: 'Caster Strap',
      summary: 'Condensed, high-contrast caster identification with a hard accent edge.',
      category: 'lower-third',
      variantId: 'lt40',
      lines: [
        { title: 'Caster', sample: ANCHOR_NAME },
        { title: 'Role', sample: ANCHOR_ROLE },
      ],
      typography: { scaleRatio: 1.6, headingWeight: 'black', kickerCase: 'caps', tracking: 'tight' },
      density: 'compact',
      shape: { corner: 'sharp', accentForm: 'block' },
      motionCharacter: 'a fast snap that settles hard; nothing bounces',
    },
  },
  {
    brief: 'a restrained lower third for a documentary about coastal erosion',
    spec: {
      fit: 'catalog',
      reason: 'A quiet documentary super; the cinematic family carries the structure.',
      name: 'Coastal Super',
      summary: 'Low-contrast documentary super with generous air and a hairline rule.',
      category: 'lower-third',
      // `lt34` Title Strap was here and the control run rejected it: it is a CENTRED title
      // treatment, so the anchor's name wrapped across two lines with a gap under it and read
      // as a title card rather than a strap. A weak anchor is worse than no anchor - it lowers
      // the bar a candidate is judged against. `lt38` Fade Rule is the quiet cinematic super
      // the brief actually describes.
      variantId: 'lt38',
      lines: [
        { title: 'Name', sample: ANCHOR_NAME },
        { title: 'Role', sample: ANCHOR_ROLE },
      ],
      typography: { scaleRatio: 1.35, headingWeight: 'regular', kickerCase: 'as-written', tracking: 'wide' },
      density: 'airy',
      shape: { corner: 'sharp', accentForm: 'hairline', panel: 'none' },
      motionCharacter: 'a slow resolved fade that never pulls focus from the picture',
    },
  },
];

function anchorFrom(id: string, kind: AnchorKind, provenance: string, template: SpxTemplate): SpikeAnchor {
  return {
    id,
    kind,
    provenance,
    template,
    data: driveData(template, [ANCHOR_NAME, ANCHOR_ROLE]),
    stressData: driveData(template, [ANCHOR_STRESS_NAME, ANCHOR_STRESS_ROLE]),
  };
}

export async function galleryAnchors(): Promise<SpikeAnchor[]> {
  const anchors: SpikeAnchor[] = [];
  // Seeded with the control's own design AND the whole vetted exemplar pool.
  //
  // The pool exclusion is the same rule as constraint 1 above, applied where the control run
  // showed it also bites: the first fixed anchor set drew `lt05` and `lt32` from the stub,
  // and both are exemplars. A candidate that near-copies its exemplar would then be judged
  // beside that very design, and the reviewer has no way to tell "as good as the anchor"
  // from "is the anchor" - which is exactly the §0.3 condition the anchors exist to inform.
  const used = new Set<string>([CONTROL_VARIANT_ID, ...VETTED_EXEMPLAR_IDS]);

  for (const id of ANCHOR_CATALOG_IDS) {
    const variant = variantById(id);
    if (!variant) throw new Error(`spike anchors: catalog design ${id} is gone - pick a replacement`);
    if (variant.maxLines < 2) {
      throw new Error(
        `spike anchors: ${id} "${variant.name}" carries ${variant.maxLines} line(s) - an anchor `
        + 'judged beside two-line candidates must be able to hold two lines',
      );
    }
    used.add(id);
    anchors.push(anchorFrom(
      `anchor-catalog-${id}`,
      'catalog',
      `catalog design ${id} "${variant.name}"`,
      variant.create({
        lines: [
          { title: 'Name', sample: ANCHOR_NAME },
          { title: 'Role', sample: ANCHOR_ROLE },
        ],
      }),
    ));
  }

  for (const [i, entry] of ADAPT_ANCHOR_SPECS.entries()) {
    const chassis = entry.spec.variantId ?? '(none)';
    if (used.has(chassis)) {
      throw new Error(
        `spike anchors: adapt-first anchor ${i + 1} uses chassis ${chassis}, which is already an `
        + 'exemplar, the control or a catalog anchor - pick one outside those sets',
      );
    }
    const variant = variantById(chassis);
    if (!variant) throw new Error(`spike anchors: chassis ${chassis} is gone - pick a replacement`);
    if (variant.maxLines < 2) {
      throw new Error(`spike anchors: chassis ${chassis} "${variant.name}" cannot hold two lines`);
    }
    used.add(chassis);
    const { template } = assembleGroundedTemplate(entry.spec);
    anchors.push(anchorFrom(
      `anchor-adapt-${i + 1}`,
      'adapt-first',
      `adapt-first grounded compile on chassis ${chassis} "${variant.name}" for: ${entry.brief}`,
      template,
    ));
  }

  return anchors;
}
