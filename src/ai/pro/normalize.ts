// Deterministic normalization of a Pro interpretation into a compile PLAN. Same doctrine
// as importAnalysis/normalize.ts: NO model output reaches the compiler unclamped - the
// schema bounds the shape, this bounds the meaning. The TEXT math is not duplicated: text
// regions run through the import-analysis normalizer itself, so cap-height sizing, width
// fitting, weight snapping and slot margins mean exactly one thing in this codebase.

import { normalizeAnalysis, type FieldProposal } from '../importAnalysis/normalize';
import type { ImportAnalysisRegion, ImportedGraphicAnalysisV1 } from '../importAnalysis/contract';
import {
  PRO_FONT_IDS,
  PRO_LIMITS,
  resolveProCanvasPlacement,
  type ProCanvasPlacement,
  type ProInterpretationV1,
  type ProRegion,
  type ProTreatment,
} from './contract';

/** Below this a region is noise, not a plan input (the import-analysis floor). */
const CONFIDENCE_FLOOR = 0.35;

/** A reconstructed shape, in DESIGN px of the FULL concept frame (the compiler shifts
 *  everything into the cropped unit's space). */
export interface ProPanelPlan {
  x: number;
  y: number;
  w: number;
  h: number;
  shape: 'panel' | 'accent-bar';
  /** A complete CSS background value (solid color or linear-gradient). */
  fillCss: string;
  radiusPx: number;
  opacity: number;
}

/** What became of one interpreted region - the editability report's raw material. */
export interface ProRegionOutcome {
  kind: ProRegion['kind'];
  /** The treatment AFTER clamping - what the compiler will actually do. */
  treatment: ProTreatment;
  label: string;
  note: string;
}

export interface ProPlan {
  graphicType: ProInterpretationV1['graphicType'];
  graphicTypeConfidence: number;
  frame: { width: number; height: number };
  /** The design UNIT: the region union the compiler crops the concept to. */
  unit: { x: number; y: number; w: number; h: number };
  /** Independent final-canvas decision. Source geometry remains in unit coordinates. */
  placement: ProCanvasPlacement;
  /** The pad the unit ACTUALLY carries per side (crop px). A side is padded so an imprecise
   *  region edge is never shaved — but where the union edge is owned entirely by rebuilt
   *  OPAQUE panels, the CSS panel repaints that edge anyway, so the pad is dropped: cropping
   *  tight there loses nothing and removes both the concept-backdrop ring and any
   *  misregistered baked panel bleed (the §10 peek). */
  unitPad: { left: number; top: number; right: number; bottom: number };
  fields: FieldProposal[];
  /** The confident text regions' own boxes (full-frame px) - what the compiler checks
   *  panel coverage against when deciding whether baked placeholder text survives. */
  textRects: { x: number; y: number; w: number; h: number }[];
  panels: ProPanelPlan[];
  /** The logo region, when one was reported (design px, full-frame space). `outcomeIndex`
   *  addresses its line in `outcomes` - one outcome is pushed per interpreted region, in
   *  order, so the compile can report against the region the slot was actually placed over
   *  rather than the first one that happens to be a logo. */
  logo: { x: number; y: number; w: number; h: number; outcomeIndex: number } | null;
  animation: { presetId: 'design-fade' | 'design-slide' | 'design-pop' | 'design-blur'; speed: 0.75 | 1 | 1.5 };
  warnings: string[];
  outcomes: ProRegionOutcome[];
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

function pxRect(region: ProRegion, frame: { width: number; height: number }) {
  const x = clamp01(region.bbox.x);
  const y = clamp01(region.bbox.y);
  const w = Math.min(clamp01(region.bbox.w), 1 - x);
  const h = Math.min(clamp01(region.bbox.h), 1 - y);
  return {
    x: Math.round(x * frame.width),
    y: Math.round(y * frame.height),
    w: Math.round(w * frame.width),
    h: Math.round(h * frame.height),
  };
}

const HEX = /^#[0-9a-fA-F]{6}$/;

/** The clamped treatment - what the compiler will do, whatever the model proposed. The
 *  wire schema deliberately does not constrain the fill's colours (contract.ts state
 *  economy), so missing or non-hex colours demote the panel here. */
function resolveTreatment(region: ProRegion): ProTreatment {
  if (region.kind === 'text') return 'rebuild-text';
  // 'decorative' rides the same branch as 'panel' WHEN it carries reconstructable geometry:
  // models file accent bars and divider rules under decorative (every 2026-07-31 fixture
  // does), and keeping those raster left pad rings and blocked full reconstruction for
  // shapes CSS renders exactly. A decorative region WITHOUT geometry still stays raster.
  if (region.kind === 'panel' || (region.kind === 'decorative' && region.panel)) {
    const fill = region.panel?.fill;
    const fillOk = fill
      && (fill.kind === 'solid'
        ? HEX.test(fill.color ?? '')
        : HEX.test(fill.from ?? '') && HEX.test(fill.to ?? ''));
    return region.treatment === 'rebuild-shape' && fillOk && region.confidence >= CONFIDENCE_FLOOR
      ? 'rebuild-shape'
      : region.treatment === 'flattened' ? 'flattened' : 'keep-asset';
  }
  // Logos, images and geometry-less decoration stay raster in v1; the model's own
  // 'flattened' uncertainty is preserved so the report can distinguish deliberate from unsure.
  return region.treatment === 'flattened' ? 'flattened' : 'keep-asset';
}

function outcomeNote(kind: ProRegion['kind'], treatment: ProTreatment): string {
  if (treatment === 'rebuild-text') return 'Rebuilt as a live, operator-editable text field.';
  if (treatment === 'rebuild-shape') return 'Reconstructed as an editable CSS shape layer.';
  if (kind === 'logo') return 'Kept as image pixels (a replaceable logo slot is placed over it when requested).';
  if (treatment === 'flattened') return 'Left in the artwork - the interpretation was not confident enough to rebuild it.';
  return 'Kept as image pixels in the artwork, by design.';
}

function outcomeLabel(region: ProRegion, index: number): string {
  const title = region.suggestedTitle?.trim().slice(0, 80);
  if (title) return title;
  const names: Record<ProRegion['kind'], string> = {
    text: 'Text', logo: 'Logo', image: 'Image', panel: 'Panel', decorative: 'Decoration',
  };
  return `${names[region.kind]} ${index + 1}`;
}

/** The import-analysis VIEW of the pro interpretation's text regions: structurally the same
 *  region shape, so the one field normalizer serves both tasks. */
function analysisView(interpretation: ProInterpretationV1): ImportedGraphicAnalysisV1 {
  return {
    version: 1,
    graphicType: 'lower-third',
    graphicTypeConfidence: clamp01(interpretation.graphicTypeConfidence),
    canvas: { aspect: 16 / 9 },
    regions: interpretation.regions
      .filter((region) => region.kind === 'text')
      .map((region) => ({
        kind: 'text' as const,
        bbox: region.bbox,
        confidence: region.confidence,
        role: region.role,
        suggestedTitle: region.suggestedTitle?.slice(0, 80),
        sampleText: region.sampleText?.slice(0, 200),
        align: region.align,
        // The wire leaves the font id a plain string (contract.ts state economy);
        // resolve it against the real id set here, degrading to "the design's default".
        // fontSizeNorm is DROPPED deliberately: the 2026-07-31 paid round showed models
        // free-associate its meaning (bbox height as an image fraction in one answer,
        // 0.6 "of the region" in the next), and a wrong size stacks the name into the
        // title. The measured bbox height IS the deterministic size source - exactly the
        // erase-seed rule the shared field normalizer applies when no claim is carried.
        typography: region.typography
          ? {
              ...region.typography,
              fontSizeNorm: undefined,
              suggestedFontId: (PRO_FONT_IDS as readonly string[]).includes(region.typography.suggestedFontId ?? '')
                ? (region.typography.suggestedFontId as (typeof PRO_FONT_IDS)[number])
                : null,
            } as ImportAnalysisRegion['typography']
          : undefined,
      })),
    warnings: [],
  };
}

export function normalizeProInterpretation(
  raw: ProInterpretationV1,
  frame: { width: number; height: number },
  mintId: () => string,
): ProPlan {
  // The caps the wire schema no longer carries (contract.ts state economy) land here.
  const interpretation: ProInterpretationV1 = {
    ...raw,
    regions: raw.regions.slice(0, PRO_LIMITS.maxRegions),
    warnings: raw.warnings.map((warning) => warning.slice(0, 300)),
  };
  const analyzed = normalizeAnalysis(
    analysisView(interpretation),
    { path: '', width: frame.width, height: frame.height },
    mintId,
  );

  const panels: ProPanelPlan[] = [];
  const textRects: ProPlan['textRects'] = [];
  const outcomes: ProRegionOutcome[] = [];
  const warnings = interpretation.warnings.slice(0, 8);
  /** Every confident region's rect, flagged when it is a rebuilt OPAQUE panel — the edge
   *  ownership the per-side pad decision below reads. */
  const edgeRects: Array<{ x: number; y: number; w: number; h: number; rebuiltOpaque: boolean }> = [];

  // The unit: every confident region's union, padded so the crop never shaves an edge
  // pixel off the strap. Empty (a report with no usable regions) degrades to the whole
  // frame with a warning rather than an impossible zero-size crop.
  let left = Number.POSITIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let right = 0;
  let bottom = 0;

  interpretation.regions.forEach((region, index) => {
    const treatment = resolveTreatment(region);
    outcomes.push({
      kind: region.kind,
      treatment,
      label: outcomeLabel(region, index),
      note: outcomeNote(region.kind, treatment),
    });
    if (region.confidence < CONFIDENCE_FLOOR) return;
    const rect = pxRect(region, frame);
    if (rect.w <= 2 || rect.h <= 2) return;
    // Only a shape-carrying region (panel, or decorative with geometry) can resolve to
    // rebuild-shape, so the treatment alone says this rect's edge is repainted by CSS.
    edgeRects.push({
      ...rect,
      rebuiltOpaque: treatment === 'rebuild-shape'
        && Math.min(1, Math.max(0, region.panel?.opacity ?? 1)) >= 0.95,
    });
    left = Math.min(left, rect.x);
    top = Math.min(top, rect.y);
    right = Math.max(right, rect.x + rect.w);
    bottom = Math.max(bottom, rect.y + rect.h);

    if (region.kind === 'text') textRects.push(rect);
    if (treatment === 'rebuild-shape' && region.panel) {
      // Models sometimes file ONE strap twice - a 'panel' and a 'decorative' twin with the
      // same box (the corporate fixture does). One CSS layer is enough: a duplicate would
      // double-paint a translucent fill, and the twin's outcome is honestly 'rebuilt' either
      // way because this layer reconstructs it.
      if (panels.some((existing) =>
        Math.abs(existing.x - rect.x) <= 1 && Math.abs(existing.y - rect.y) <= 1
        && Math.abs(existing.w - rect.w) <= 1 && Math.abs(existing.h - rect.h) <= 1)) {
        return;
      }
      const geometry = region.panel;
      // The wire schema deliberately carries no number bounds (contract.ts), so the angle
      // is folded into 0..360 here like every other value is clamped here. resolveTreatment
      // already proved the colours the kind requires are present and hex.
      const angle = geometry.fill.kind === 'gradient'
        ? ((Math.round(geometry.fill.angleDeg ?? 90) % 360) + 360) % 360
        : 0;
      const fillCss = geometry.fill.kind === 'solid'
        ? (geometry.fill.color ?? '#000000').toLowerCase()
        : `linear-gradient(${angle}deg, ${(geometry.fill.from ?? '#000000').toLowerCase()}, ${(geometry.fill.to ?? '#000000').toLowerCase()})`;
      panels.push({
        ...rect,
        shape: geometry.shape,
        fillCss,
        radiusPx: Math.round(Math.min(0.5, Math.max(0, geometry.radiusNorm ?? 0)) * rect.h),
        opacity: Math.min(1, Math.max(0, geometry.opacity ?? 1)),
      });
    }
  });

  const pad = Math.round(frame.height * 0.015);
  // A side keeps its pad only when a region that is NOT a rebuilt opaque panel owns part of
  // the union edge there (text, a logo, a flattened panel — raster the crop must not shave).
  // A rebuilt-opaque-panel edge is repainted by its CSS layer, so the pad is dropped and the
  // crop lands exactly on the interpreted edge.
  const sidePad = (owns: (rect: { x: number; y: number; w: number; h: number }) => boolean) =>
    edgeRects.filter(owns).every((rect) => rect.rebuiltOpaque) ? 0 : pad;
  const pads = {
    left: sidePad((rect) => rect.x <= left + 1),
    top: sidePad((rect) => rect.y <= top + 1),
    right: sidePad((rect) => rect.x + rect.w >= right - 1),
    bottom: sidePad((rect) => rect.y + rect.h >= bottom - 1),
  };
  const unit = right > left && bottom > top
    ? {
        x: Math.max(0, left - pads.left),
        y: Math.max(0, top - pads.top),
        w: Math.min(frame.width, right + pads.right) - Math.max(0, left - pads.left),
        h: Math.min(frame.height, bottom + pads.bottom) - Math.max(0, top - pads.top),
      }
    : { x: 0, y: 0, w: frame.width, h: frame.height };
  // What the crop actually carries per side (frame clamping can shrink a pad).
  const unitPad = right > left && bottom > top
    ? {
        left: left - unit.x,
        top: top - unit.y,
        right: unit.x + unit.w - right,
        bottom: unit.y + unit.h - bottom,
      }
    : { left: 0, top: 0, right: 0, bottom: 0 };
  if (unit.w === frame.width && unit.h === frame.height && interpretation.regions.length > 0) {
    warnings.push('No confident regions were reported, so the whole frame was kept as the design unit.');
  }

  // The index, not just the region: `outcomes` holds one entry per interpreted region in the
  // same order, so this IS the outcome line the placed slot belongs to.
  const logoIndex = interpretation.regions.findIndex(
    (region) => region.kind === 'logo' && region.confidence >= CONFIDENCE_FLOOR,
  );
  const placement = resolveProCanvasPlacement(
    { width: unit.w, height: unit.h },
    interpretation.canvasPlacement,
  );
  if (!placement) {
    throw new Error('The interpreted design unit has no usable size for canvas placement.');
  }

  return {
    graphicType: interpretation.graphicType,
    graphicTypeConfidence: clamp01(interpretation.graphicTypeConfidence),
    frame,
    unit,
    placement,
    unitPad,
    fields: analyzed.fields,
    textRects,
    // Larger panels paint first so an accent bar drawn over the strap stays visible.
    panels: panels.sort((a, b) => b.w * b.h - a.w * a.h),
    logo: logoIndex >= 0
      ? { ...pxRect(interpretation.regions[logoIndex], frame), outcomeIndex: logoIndex }
      : null,
    animation: {
      presetId: interpretation.animation?.presetId ?? 'design-slide',
      // Snap to the three real speeds: the schema bounds a RANGE (Google's structured
      // output rejects number enums), and the preset system knows exactly these values.
      speed: ([0.75, 1, 1.5] as const).reduce((best, candidate) =>
        Math.abs(candidate - (interpretation.animation?.speed ?? 1)) < Math.abs(best - (interpretation.animation?.speed ?? 1))
          ? candidate
          : best, 1 as 0.75 | 1 | 1.5),
    },
    warnings,
    outcomes,
  };
}
