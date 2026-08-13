// PHASE 1 BRAND ROUND - the ALIGNMENT-AXIS instrument (docs/PRO_PHASE1_HANDOFF.md §4).
//
// BENCH-ONLY (see exemplars.ts for the deletion condition).
//
// The defect this measures: two Phase 0 results were flagged by a human and passed every gate -
// a panel not aligned to its own accent line, and a SKEWED accent bar sweeping across the
// panel's straight left edge (painted edge x≈101-138 against a panel edge at 120) while the
// name and kicker sat at ~168 and ~155, a near-miss pair. The runtime bench measures overlap
// and overflow; nothing asks whether independent elements SHARE an axis.
//
// THE INSTRUMENT, learned from two that failed:
//
//   - A whole-frame "leftmost painted pixel per row" scan was tried in Phase 0 and is the
//     WRONG tool - it reported the defective frame as having one clean axis, and flagged the
//     hand-authored control for its drop shadow. So measure per ELEMENT
//     (getBoundingClientRect includes transforms - a skewed bar's box IS its painted sweep).
//   - A first per-element version flagged edge CLUSTERS a few px apart, and the calibration
//     sweep over the 90 hand-authored catalog lower thirds showed why that is also wrong:
//     ragged text makes near edges MEANINGLESS on the unaligned side. Two left-aligned lines
//     of similar length put their RIGHT edges a few px apart by coincidence (23 catalog pairs
//     inside 40px), and a centered pair does it symmetrically on both sides. The defect pair -
//     the name at 168 and the kicker at 155 - is aligned on NO side: not left, not right, not
//     centre. That absence is the signal.
//
// THE RULES, calibrated against benchmarks/pro/v1/spike/axis-calibration.json (the
// supportingLineChars doctrine - replace an adjective with a measurement):
//
//   - TEXT vs TEXT (both elements paint only their own text): a near-miss is a gap of
//     4-16px on one side while the OPPOSITE edges do not align and the CENTRES do not align.
//     Sub-4px is optical tuning (lt56 sets an arrow 2.9px off its label on purpose).
//   - EVERYTHING ELSE (panels, accents, marks): a near-miss is a gap of up to 6px. The
//     catalog carries deliberate sibling offsets from 8px up (lt11's accent outdents its
//     panel by exactly 8), so a wider tolerance here reads designed composition as defect.
//   - SKEW STRADDLE: an element whose transform actually shears or rotates (matrix b/c
//     nonzero - a settled GSAP entrance leaves an identity matrix on everything, which the
//     first control run caught) and whose painted sweep crosses another element's straight
//     edge. One instance in the whole catalog, so it is reported nearly raw.
//
// It REPORTS; it does not gate (§0.2 keeps the read human). Each finding names both elements
// and the numbers, so a reviewer can dismiss a designed offset in seconds.

import { paints } from './brand';

/** Two edges within this are ONE axis (sub-pixel layout jitter, rounding). */
export const EDGE_EQUAL_PX = 1.5;
/** Non-text near-miss ceiling: above this is composition, below it (and above equal) is a
 *  near-miss. Calibrated: 8px starts the catalog's deliberate accent outdents. */
export const NEAR_MISS_PX = 6;
/** Text-vs-text band: the Phase 0 defect pair sat 13px apart; optical tuning sits under 4. */
export const TEXT_NEAR_MISS_MIN_PX = 4;
export const TEXT_NEAR_MISS_MAX_PX = 16;
/** Elements only pair within this vertical distance - axes are read within a composition's
 *  neighbourhood, not across the whole frame. */
export const VERTICAL_NEIGHBOUR_PX = 160;
/** An element spanning nearly the whole frame is a backdrop, not a composition member. */
const BACKDROP_WIDTH_PX = 1728; // 90% of 1920

export interface AxisNearMiss {
  side: 'left' | 'right';
  gapPx: number;
  a: { el: string; value: number };
  b: { el: string; value: number };
  /** Both elements paint only text - the pair judged under the text band. */
  textPair: boolean;
  /** 'parent-child' is usually a padding inset; calibration showed none inside the bands,
   *  so one that appears is worth a look. */
  relationship: 'parent-child' | 'sibling';
}

export interface SkewStraddle {
  skewed: string;
  spanPx: [number, number];
  crossesEdgeOf: string;
  edgeValue: number;
  side: 'left' | 'right';
}

export interface AxisReport {
  elements: number;
  nearMisses: AxisNearMiss[];
  skewStraddles: SkewStraddle[];
}

interface Measured {
  el: Element;
  desc: string;
  rect: { left: number; right: number; top: number; bottom: number };
  /** The transform actually shears or rotates (not a settled identity/translate/scale). */
  skewed: boolean;
  /** Paints its own text and nothing else - the ragged-edge rules apply. */
  isText: boolean;
}

function describe(el: Element): string {
  const id = el.id ? `#${el.id}` : '';
  const cls = el.classList.length ? `.${[...el.classList].join('.')}` : '';
  return `${el.tagName.toLowerCase()}${id}${cls}`;
}

/**
 * A transform only counts as SKEW when its matrix shears or rotates (b or c nonzero). A
 * settled GSAP entrance leaves `matrix(1, 0, 0, 1, 0, 0)` on everything it animated, so
 * testing `transform !== 'none'` flagged straight text spans as skewed (the first control
 * run caught it). Pure translation and scale keep a box's painted edge on its AABB edge, so
 * neither is the defect this hunts.
 */
function isSkewedOrRotated(transform: string): boolean {
  if (!transform || transform === 'none') return false;
  const m3d = transform.match(/^matrix3d\(([^)]+)\)/);
  if (m3d) {
    const v = m3d[1].split(',').map((n) => parseFloat(n));
    return Math.abs(v[1]) > 0.001 || Math.abs(v[4]) > 0.001;
  }
  const m = transform.match(/^matrix\(([^)]+)\)/);
  if (!m) return true; // an unresolved keyword form - treat as transformed, honestly
  const v = m[1].split(',').map((n) => parseFloat(n));
  return Math.abs(v[1]) > 0.001 || Math.abs(v[2]) > 0.001;
}

function hasOwnText(el: Element): boolean {
  for (const node of el.childNodes) {
    if (node.nodeType === Node.TEXT_NODE && (node.textContent ?? '').trim()) return true;
  }
  return false;
}

function collect(doc: Document): Measured[] {
  const win = doc.defaultView;
  if (!win) return [];
  const out: Measured[] = [];
  for (const el of doc.body.querySelectorAll('*')) {
    const style = win.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') continue;
    if (parseFloat(style.opacity) < 0.05) continue;
    if (!paints(el, style)) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    if (r.width >= BACKDROP_WIDTH_PX) continue;
    const text = hasOwnText(el);
    const bg = style.backgroundColor && !style.backgroundColor.endsWith(', 0)')
      && style.backgroundColor !== 'transparent' && !/rgba\([^)]*,\s*0(\.0+)?\)/.test(style.backgroundColor);
    const bordered = (parseFloat(style.borderTopWidth) || 0) > 0 && style.borderTopStyle !== 'none';
    out.push({
      el,
      desc: describe(el),
      rect: { left: r.left, right: r.right, top: r.top, bottom: r.bottom },
      skewed: isSkewedOrRotated(style.transform),
      isText: text && !bg && !bordered && el.tagName !== 'IMG',
    });
  }
  return out;
}

function verticalGap(a: Measured, b: Measured): number {
  return Math.max(a.rect.top - b.rect.bottom, b.rect.top - a.rect.bottom, 0);
}

export interface AxisOptions {
  equalPx?: number;
  nearMissPx?: number;
  textMinPx?: number;
  textMaxPx?: number;
  verticalNeighbourPx?: number;
}

/**
 * Measure one settled rendered frame for near-miss axes and skew straddles. Pure DOM reads;
 * the caller mounts the document. Options exist for the CALIBRATION sweep - a round always
 * runs the committed defaults.
 */
export function measureAxes(doc: Document, options: AxisOptions = {}): AxisReport {
  const equalPx = options.equalPx ?? EDGE_EQUAL_PX;
  const nearMissPx = options.nearMissPx ?? NEAR_MISS_PX;
  const textMinPx = options.textMinPx ?? TEXT_NEAR_MISS_MIN_PX;
  const textMaxPx = options.textMaxPx ?? TEXT_NEAR_MISS_MAX_PX;
  const verticalPx = options.verticalNeighbourPx ?? VERTICAL_NEIGHBOUR_PX;

  const measured = collect(doc);
  const report: AxisReport = { elements: measured.length, nearMisses: [], skewStraddles: [] };

  for (let i = 0; i < measured.length; i++) {
    for (let j = i + 1; j < measured.length; j++) {
      const a = measured[i];
      const b = measured[j];
      if (verticalGap(a, b) > verticalPx) continue;
      const textPair = a.isText && b.isText;
      const centreGap = Math.abs(
        (a.rect.left + a.rect.right) / 2 - (b.rect.left + b.rect.right) / 2,
      );
      for (const side of ['left', 'right'] as const) {
        const gap = Math.abs(a.rect[side] - b.rect[side]);
        if (gap <= equalPx) continue; // aligned - the good outcome
        if (textPair) {
          if (gap < textMinPx || gap > textMaxPx) continue;
          // Ragged-edge suppression: a pair aligned on its OTHER side (or centred) makes this
          // side's nearness a length coincidence, not a missed axis.
          const other = side === 'left' ? 'right' : 'left';
          const otherGap = Math.abs(a.rect[other] - b.rect[other]);
          if (otherGap <= equalPx || centreGap <= equalPx) continue;
        } else if (gap > nearMissPx) {
          continue;
        }
        const related = a.el.contains(b.el) || b.el.contains(a.el);
        report.nearMisses.push({
          side,
          gapPx: Math.round(gap * 10) / 10,
          a: { el: a.desc, value: Math.round(a.rect[side] * 10) / 10 },
          b: { el: b.desc, value: Math.round(b.rect[side] * 10) / 10 },
          textPair,
          relationship: related ? 'parent-child' : 'sibling',
        });
      }
    }
  }

  // The skew family: an actually-skewed element whose painted sweep CROSSES another
  // element's straight edge - the accent bar over the panel edge. Ancestry is NOT excluded:
  // the Phase 0 bar was inside the very panel whose edge it swept across.
  for (const m of measured) {
    if (!m.skewed) continue;
    for (const o of measured) {
      if (o === m || o.skewed) continue;
      if (verticalGap(m, o) > 0) continue; // a sweep crosses edges it overlaps, not neighbours
      for (const side of ['left', 'right'] as const) {
        const edge = o.rect[side];
        if (edge > m.rect.left + 2 && edge < m.rect.right - 2) {
          report.skewStraddles.push({
            skewed: m.desc,
            spanPx: [Math.round(m.rect.left), Math.round(m.rect.right)],
            crossesEdgeOf: o.desc,
            edgeValue: Math.round(edge * 10) / 10,
            side,
          });
        }
      }
    }
  }

  return report;
}
