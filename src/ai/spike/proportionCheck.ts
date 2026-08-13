// THE PROPORTION instrument - size RELATIONSHIPS between the parts and the whole
// (docs/DESIGN_PRINCIPLES.md §4).
//
// BENCH-ONLY (see exemplars.ts for the deletion condition).
//
// THE DEFECT THIS MEASURES, again in the owner's own words from the blind reads: "the text is
// too big for the banner so it looks crammed"; "the logo is not aligned to anything and it
// takes half the screen"; "the box is way too big"; "the logo box is vertical … the text is
// small in the middle … the box is too big". Every one of those is a RATIO between two things
// that were sized independently - and the principle names the cause exactly: never size a
// container first and pour text into it.
//
// FOUR RATIOS, each answering one of those complaints:
//
//   1. TYPE RATIO - the second line's size against the first's. Too near 1 and the hierarchy
//      is not expressed by size at all; too far and the supporting line stops being readable
//      at broadcast distance.
//   2. MARK SCALE - the mark's height against the primary type size. A mark is sized against
//      the text it stands beside, never against the frame, which is what "it takes half the
//      screen" gets wrong.
//   3. PANEL FILL - the content's area against the panel's. A low fill is the oversized box;
//      a very high one is the crammed banner. One number, both complaints, opposite ends.
//   4. FRAME FOOTPRINT - the panel's area against the whole frame. A lower third that covers
//      half the picture has stopped being a lower third.
//
// The unit is always another measured thing, never a pixel count, for the reason spacingCheck
// gives: two independent scale knobs mean an absolute threshold measures the knobs.
//
// It REPORTS and does not gate, like every instrument beside it. The thresholds come from the
// catalog sweep (scripts/spike-proportion-calibrate.mjs), not from taste.

import { collectPainted, findPanel, primaryTypeSize, round2, type Painted } from './spacingCheck';

/** The supporting line's type size against the primary's. Above this the two sizes are so close
 *  that size is carrying no hierarchy; the catalog's own spread sits well below it (p50 0.48,
 *  p95 0.63). */
export const TYPE_RATIO_FLAT = 0.86;
/** …but AT OR ABOVE this the two lines are optically the SAME size, which is a deliberate peer
 *  pairing rather than a failed hierarchy - the specialist pack's interview straps set two
 *  names equal on purpose ("two names, no titles"), and ls20/ls27/ls28 ship at 0.94-0.95. So
 *  flat is a BAND, not a ceiling, exactly as the contrast principle describes it: a ~10%
 *  difference reads as a mistake, an optically identical pair reads as intent. */
export const TYPE_RATIO_PEER = 0.93;
/** …and below this the supporting line has stopped being readable beside its heading. */
export const TYPE_RATIO_THIN = 0.28;
/** The mark's height against the primary type size. A mark at the text's own height reads as a
 *  lockup; far above it the mark has become the graphic. */
export const MARK_SCALE_CEILING = 3.2;
/** Content area over panel area. Below this the panel is carrying mostly nothing.
 *
 *  THERE IS DELIBERATELY NO CEILING beside it, and the measurement says why. The owner's two
 *  "crammed" items fill 0.94 and 0.89 - but so does the catalog: a ceiling at 0.85 flags 14 of
 *  the 45 shipped designs that have a panel, and 0.95 still flags 3. Fill cannot separate a
 *  crammed graphic from a tight one, and both of those complaints are already caught by
 *  spacingCheck (padding-tight, text-over-rule), which measures the thing that actually differs.
 *  A ceiling here would fail a third of the catalog to re-report what the instrument next door
 *  already found. */
export const PANEL_FILL_FLOOR = 0.18;
/** The panel's share of the 1920x1080 frame. A lower third above this has stopped being one.
 *  Calibrated: the catalog's largest is 0.09 and 0.10 flags NONE of it, while the owner's "the
 *  box is way too big" sits at 0.12. */
export const FOOTPRINT_CEILING = 0.1;

const FRAME_AREA = 1920 * 1080;

export interface ProportionFinding {
  code: string;
  detail: string;
}

export interface ProportionReport {
  /** Every painted text size in the composition, largest first, in px. */
  typeSizes: number[];
  /** Second-largest over largest, when there are at least two. */
  typeRatio: number | null;
  /** The mark's height in primary type sizes, when a mark is present. */
  markScale: number | null;
  /** Content area over panel area, when a panel was found. */
  panelFill: number | null;
  /** Panel area over frame area, when a panel was found. */
  footprint: number | null;
  findings: ProportionFinding[];
}

function area(p: Painted): number {
  return Math.max(0, p.rect.right - p.rect.left) * Math.max(0, p.rect.bottom - p.rect.top);
}

export interface ProportionOptions {
  typeRatioFlat?: number;
  typeRatioThin?: number;
  markScaleCeiling?: number;
  panelFillFloor?: number;
  footprintCeiling?: number;
  markFieldId?: string | null;
}

export function measureProportion(doc: Document, options: ProportionOptions = {}): ProportionReport {
  const flat = options.typeRatioFlat ?? TYPE_RATIO_FLAT;
  const thin = options.typeRatioThin ?? TYPE_RATIO_THIN;
  const markCeiling = options.markScaleCeiling ?? MARK_SCALE_CEILING;
  const fillFloor = options.panelFillFloor ?? PANEL_FILL_FLOOR;
  const footprintCeiling = options.footprintCeiling ?? FOOTPRINT_CEILING;

  const report: ProportionReport = {
    typeSizes: [], typeRatio: null, markScale: null, panelFill: null, footprint: null, findings: [],
  };

  const items = collectPainted(doc);
  const primary = primaryTypeSize(items);
  if (!primary) return report;

  // ── 1. Type ratio ───────────────────────────────────────────────────────────────────
  // DISTINCT sizes, not one per element: a design setting three lines at one size has one
  // typographic step, and counting the same number twice would invent a ratio of exactly 1.
  const sizes = [...new Set(items.filter((p) => p.isText && p.fontSizePx > 0)
    .map((p) => Math.round(p.fontSizePx * 10) / 10))].sort((a, b) => b - a);
  report.typeSizes = sizes;
  if (sizes.length >= 2) {
    const ratio = round2(sizes[1] / sizes[0]);
    report.typeRatio = ratio;
    if (ratio > flat && ratio < TYPE_RATIO_PEER) {
      report.findings.push({
        code: 'type-ratio-flat',
        detail: `supporting line is ${ratio} of the heading (flat band ${flat}-${TYPE_RATIO_PEER})`
          + ' - almost the same size, which reads as a mistake rather than as a pair',
      });
    } else if (ratio < thin) {
      report.findings.push({
        code: 'type-ratio-thin',
        detail: `supporting line is ${ratio} of the heading (thin below ${thin})`
          + ' - it has stopped reading beside it',
      });
    }
  }

  // ── 2. Mark scale, against the TEXT it stands beside ────────────────────────────────
  if (options.markFieldId) {
    const mark = items.find((p) => p.el.id === options.markFieldId);
    if (mark) {
      const scale = round2((mark.rect.bottom - mark.rect.top) / primary);
      report.markScale = scale;
      if (scale > markCeiling) {
        report.findings.push({
          code: 'mark-oversized',
          detail: `the mark stands ${scale} primary type sizes tall (ceiling ${markCeiling})`
            + ' - it is sized against the frame rather than against the text',
        });
      }
    }
  }

  // ── 3 and 4. Panel fill and frame footprint ─────────────────────────────────────────
  const panel = findPanel(items);
  if (panel) {
    const panelArea = area(panel);
    report.footprint = round2(panelArea / FRAME_AREA);
    if (report.footprint > footprintCeiling) {
      report.findings.push({
        code: 'footprint-large',
        detail: `the panel covers ${Math.round(report.footprint * 100)}% of the frame `
          + `(ceiling ${Math.round(footprintCeiling * 100)}%)`,
      });
    }
    const inside = items.filter((p) => p !== panel
      && p.rect.left >= panel.rect.left - 1 && p.rect.right <= panel.rect.right + 1
      && p.rect.top >= panel.rect.top - 1 && p.rect.bottom <= panel.rect.bottom + 1);
    if (inside.length && panelArea > 0) {
      // The UNION of the content, not the sum of its parts - overlapping children (a mask over
      // its span) would otherwise total more than the panel they sit in.
      const union = {
        left: Math.min(...inside.map((p) => p.rect.left)),
        right: Math.max(...inside.map((p) => p.rect.right)),
        top: Math.min(...inside.map((p) => p.rect.top)),
        bottom: Math.max(...inside.map((p) => p.rect.bottom)),
      };
      const fill = round2(((union.right - union.left) * (union.bottom - union.top)) / panelArea);
      report.panelFill = fill;
      if (fill < fillFloor) {
        report.findings.push({
          code: 'panel-oversized',
          detail: `the content fills ${Math.round(fill * 100)}% of its panel `
            + `(floor ${Math.round(fillFloor * 100)}%) - the box is bigger than what it holds`,
        });
      }
    }
  }

  return report;
}
