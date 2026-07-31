// Deterministic normalization of a Pro interpretation into a compile PLAN. Same doctrine
// as importAnalysis/normalize.ts: NO model output reaches the compiler unclamped - the
// schema bounds the shape, this bounds the meaning. The TEXT math is not duplicated: text
// regions run through the import-analysis normalizer itself, so cap-height sizing, width
// fitting, weight snapping and slot margins mean exactly one thing in this codebase.

import { normalizeAnalysis, type FieldProposal } from '../importAnalysis/normalize';
import type { ImportAnalysisRegion, ImportedGraphicAnalysisV1 } from '../importAnalysis/contract';
import { PRO_FONT_IDS, PRO_LIMITS, type ProInterpretationV1, type ProRegion, type ProTreatment } from './contract';

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
  fields: FieldProposal[];
  /** The confident text regions' own boxes (full-frame px) - what the compiler checks
   *  panel coverage against when deciding whether baked placeholder text survives. */
  textRects: { x: number; y: number; w: number; h: number }[];
  panels: ProPanelPlan[];
  /** The logo region, when one was reported (design px, full-frame space). */
  logo: { x: number; y: number; w: number; h: number } | null;
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
  if (region.kind === 'panel') {
    const fill = region.panel?.fill;
    const fillOk = fill
      && (fill.kind === 'solid'
        ? HEX.test(fill.color ?? '')
        : HEX.test(fill.from ?? '') && HEX.test(fill.to ?? ''));
    return region.treatment === 'rebuild-shape' && fillOk && region.confidence >= CONFIDENCE_FLOOR
      ? 'rebuild-shape'
      : region.treatment === 'flattened' ? 'flattened' : 'keep-asset';
  }
  // Logos, images and decorative work stay raster in v1; the model's own 'flattened'
  // uncertainty is preserved so the report can distinguish deliberate from unsure.
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
    left = Math.min(left, rect.x);
    top = Math.min(top, rect.y);
    right = Math.max(right, rect.x + rect.w);
    bottom = Math.max(bottom, rect.y + rect.h);

    if (region.kind === 'text') textRects.push(rect);
    if (treatment === 'rebuild-shape' && region.kind === 'panel' && region.panel) {
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
  const unit = right > left && bottom > top
    ? {
        x: Math.max(0, left - pad),
        y: Math.max(0, top - pad),
        w: Math.min(frame.width, right + pad) - Math.max(0, left - pad),
        h: Math.min(frame.height, bottom + pad) - Math.max(0, top - pad),
      }
    : { x: 0, y: 0, w: frame.width, h: frame.height };
  if (unit.w === frame.width && unit.h === frame.height && interpretation.regions.length > 0) {
    warnings.push('No confident regions were reported, so the whole frame was kept as the design unit.');
  }

  const logoRegion = interpretation.regions.find(
    (region) => region.kind === 'logo' && region.confidence >= CONFIDENCE_FLOOR,
  );

  return {
    graphicType: interpretation.graphicType,
    graphicTypeConfidence: clamp01(interpretation.graphicTypeConfidence),
    frame,
    unit,
    fields: analyzed.fields,
    textRects,
    // Larger panels paint first so an accent bar drawn over the strap stays visible.
    panels: panels.sort((a, b) => b.w * b.h - a.w * a.h),
    logo: logoRegion ? pxRect(logoRegion, frame) : null,
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
