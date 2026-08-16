// PHASE B's ZERO-TOKEN CONTROL - the two new graphic types through the real composers
// (docs/NOACG_PRO_PLAN.md §15.9).
//
// The rule this exists under is the one this repo has now paid for four times
// (docs/AI_ATTEMPTS.md): a control that does not run the code under test is not a control. So the
// four hand-written languages in `stub.ts` go through `composeGraphic` - the identical function a
// model answer takes - and the only thing missing is the call that would have written them. Two
// paid rounds were read as model failure when the platform was at fault; the composer for a NEW
// graphic type has exactly the same exposure, and it costs nothing to find out first.
//
// IT COVERS THE NEW TYPES ONLY, deliberately. The strap's four control rows already exist in
// `spike/anchors.ts` and their measurements are the §15.5 table this round is compared against;
// re-composing them here would either duplicate every row or quietly move a baseline. What is new
// is measured here, what is old is measured where it always was.
//
// THE MARK IS SEATED ON EVERY BUG, not on one. On a strap the mark is an addition to a
// composition that works without it, which is why the strap's control seats one; on a sponsor bug
// the mark IS the graphic, and a markless bug is a composition the product never produces.

import type { AssetFile, SpxTemplate } from '../../../model/types';
import type { DesignLanguage } from './contract';
import { STUB_LANGUAGES } from './stub';
import { composeGraphic, packageLines, PRO_GRAPHICS, type ProGraphicId } from './graphics';
import type { ProLogo } from './paint';

/** The same shape the spike's own anchors carry, so the runner captures them identically.
 *  Declared here rather than imported: `pro/` may not import the bench-only `spike/`. */
export interface ProControlAnchor {
  id: string;
  kind: string;
  provenance: string;
  template: SpxTemplate;
  data: Record<string, string>;
  stressData: Record<string, string>;
  markFieldId?: string;
  /** Which graphic of the package this is, so the runner can pass its instrument thresholds. */
  graphic: ProGraphicId;
}

/** The control's words. Ordinary on purpose - a control measures the WRAPPER, so anything
 *  unusual about the content would make a broken graphic ambiguous. */
const CONTROL_SHOW = {
  name: 'Priya Raghunathan',
  title: 'Senior Research Fellow',
  channel: 'Northgate Sport',
};
const STRESS_SHOW = {
  name: 'Priya Raghunathan-Vasquez',
  title: 'Senior Research Fellow, Centre for Comparative Media Policy',
  channel: 'Northgate Sport & Community Network',
};

/** A brand mark as the bench holds it, narrowed to what a composer needs. */
export interface ControlMark {
  path: string;
  dataUrl: string;
  probe: { backing: 'own-field' | 'transparent'; inkLuminance: number; inkSpread?: number };
}

function logoFrom(mark: ControlMark): ProLogo {
  const images: AssetFile[] = [{ path: mark.path, data: mark.dataUrl }];
  return {
    assetPath: mark.path,
    images,
    // THE MEASURED INK travels with the file, because the composer decides the mark field on it
    // (`markFieldFor`). Omitting these numbers would leave the control composing a graphic the
    // product does not - the exact way a control stops being one.
    backing: mark.probe.backing,
    inkLuminance: mark.probe.inkLuminance,
    ...(typeof mark.probe.inkSpread === 'number' ? { inkSpread: mark.probe.inkSpread } : {}),
  };
}

/** Field values for a composed template: the show's own words against whatever text fields the
 *  graphic declares, plus the mark path in the slot the platform minted. */
function driveData(
  template: SpxTemplate,
  values: string[],
  markPath: string | null,
): Record<string, string> {
  const out: Record<string, string> = {};
  const text = template.fields.filter((f) => f.ftype === 'textfield' || f.ftype === 'textarea');
  text.forEach((f, i) => { out[f.field] = values[i] ?? String(f.value ?? ''); });
  if (markPath) {
    const slot = template.fields.find((f) => f.ftype === 'filelist');
    // The mark rides the update payload as well as the baked src - SPX resends every field's
    // value, so the captured hold exercises the runtime's own setFieldValue path too.
    if (slot) out[slot.field] = markPath;
  }
  return out;
}

function anchorFor(
  language: DesignLanguage,
  graphic: ProGraphicId,
  mark: ControlMark | null,
): ProControlAnchor {
  const spec = PRO_GRAPHICS[graphic];
  const logo = spec.takesMark && mark ? logoFrom(mark) : null;
  const { template, spacing, notes } = composeGraphicWithLines(language, graphic, CONTROL_SHOW, logo);
  const slot = logo ? template.fields.find((f) => f.ftype === 'filelist')?.field : undefined;
  const slug = language.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const anchor: ProControlAnchor = {
    id: `language-${graphic}-${slug}`,
    kind: 'design-language',
    provenance: `Phase B: platform-composed ${spec.label.toLowerCase()} in the hand-written`
      + ` "${language.name}" design language (${notes.join('; ')}); padding`
      + ` ${spacing.padVPx}/${spacing.padHPx}px, line gap ${spacing.lineGapPx}px, type`
      + ` ${spacing.headingPx}/${spacing.supportingPx}px`,
    template,
    data: driveData(template, linesOf(graphic, CONTROL_SHOW), logo ? logo.assetPath : null),
    stressData: driveData(template, linesOf(graphic, STRESS_SHOW), logo ? logo.assetPath : null),
    graphic,
  };
  return slot ? { ...anchor, markFieldId: slot } : anchor;
}

function linesOf(graphic: ProGraphicId, show: typeof CONTROL_SHOW): string[] {
  return packageLines(graphic, show).map((line) => line.sample);
}

/** Compose one graphic with the package's own line set - the seam the anchors and the paid
 *  runner share, so a control row and a paid row differ only by where the language came from. */
function composeGraphicWithLines(
  language: DesignLanguage,
  graphic: ProGraphicId,
  show: { name: string; title: string; channel?: string | null },
  logo: ProLogo | null,
) {
  return composeGraphic(graphic, language, {
    lines: packageLines(graphic, show),
    ...(logo ? { logo } : {}),
  });
}

/**
 * The four stub languages across the two NEW graphic types - eight rows, zero tokens, measured by
 * the same instruments a paid round is scored by.
 */
export function newTypeAnchors(mark?: ControlMark | null): ProControlAnchor[] {
  const out: ProControlAnchor[] = [];
  for (const graphic of ['sponsor-bug', 'countdown'] as const) {
    for (const language of STUB_LANGUAGES) out.push(anchorFor(language, graphic, mark ?? null));
  }
  return out;
}

export { composeGraphicWithLines };
