// THE SPACING instrument - panel padding and inter-element gaps, measured as RATIOS OF TYPE
// SIZE (docs/DESIGN_PRINCIPLES.md §4 proportion, §9 white space).
//
// BENCH-ONLY (see exemplars.ts for the deletion condition).
//
// THE DEFECT THIS MEASURES is the one the owner's blind reads keep naming, in their words:
// "too much space beneath ... we need a taste check for how much padding and margin the text
// and the banner should have"; "the name text too close to the line and it's too tight ... too
// big for the banner so it looks crammed"; "a bit too much space between the logo and the
// text"; "the text is on top of the line. It's all crammed in". Across two rounds, every failed
// or repair-needed item names proportion, white space or alignment and almost nothing else.
// Alignment already has an instrument (axisCheck.ts). This is the other two.
//
// WHY RATIOS AND NOT PIXELS. A 24px gap is generous beside 16px text and cramped beside 64px
// text, and every graphic here carries a --scale knob plus a --type-scale knob that move them
// independently. An absolute threshold would therefore measure the knobs rather than the
// design. The unit is the PRIMARY TYPE SIZE - the largest painted text in the composition -
// because that is what a viewer's eye normalises against, and because it is what "proportion"
// means: size relationships between parts, not sizes.
//
// WHAT IT DOES NOT DO. It does not gate. It reports numbers and named findings beside the
// frame, exactly as the axis instrument and the rendered mark gate do, and the §0.2 human read
// stays the verdict. Two reasons, both learned here: a spacing judgement flips on the brief's
// world (the same plate was praised on two briefs and called broken on a third), and a gate
// that fails a deliberate full-bleed composition would be teaching designs to be timid.

import { paints } from './brand';

/** A painted child closer to its panel edge than this many TYPE SIZES reads as cramped.
 *  Calibrated against the 90 hand-authored catalog lower thirds - see the calibration script. */
export const PADDING_FLOOR_RATIO = 0.28;
/** Opposite sides differing by more than this FACTOR read as lopsided rather than composed -
 *  the "too much space beneath" note. Only applied when both sides carry real padding: a
 *  deliberate bleed (one side at ~0) is a composition, not an imbalance. */
export const PADDING_SKEW_FACTOR = 2.6;
/** Below this, a side is a BLEED - the design is running to the edge on purpose, so it is
 *  excluded from both the floor and the skew test rather than counted as the tightest side. */
export const BLEED_RATIO = 0.06;
/** Total horizontal padding at or below this many type sizes means the panel HUGS its content,
 *  so its left/right balance is a real spacing decision. Above it the panel is a BAND whose
 *  width was chosen, and its unused side is composition rather than padding. */
export const HUG_TOTAL_RATIO = 4;
/** Consecutive text lines closer than this many of the SMALLER line's type sizes are crowded.
 *
 *  ZERO on purpose: only an actual OVERLAP counts. Line-height supplies the leading INSIDE each
 *  box, so adjacent text boxes touching at exactly 0 is ordinary typography, not crowding - the
 *  catalog sweep found lt12 and lt06 shipping at 0 and neither has ever been complained about.
 *  A floor above zero flags correct designs; the gap ratio is still REPORTED for every pair, so
 *  a human comparing two candidates can see who is tighter without the instrument pretending
 *  that tighter is wrong. */
export const LINE_GAP_FLOOR_RATIO = 0;
/** …and further apart than this have stopped reading as one block. */
export const LINE_GAP_CEILING_RATIO = 1.4;
/** A text line closer than this many of its own type sizes to one of the design's rules or
 *  accents is crowding it. Set under the catalog's own tightest shipped pairing. */
export const RULE_GAP_FLOOR_RATIO = 0.12;
/** At or under this the text is TOUCHING the rule on purpose, which is a composition the
 *  catalog ships (lt39). Crowding lives strictly between this and the floor above. */
export const RULE_CONTACT_RATIO = 0.02;
/** The mark's gap to the nearest text, as a ratio of the MARK's height: below is crowded,
 *  above is adrift. The brand manual's clear space is a quarter of the mark's height, so the
 *  floor sits at that and the ceiling is where a lockup stops reading as a lockup. */
export const MARK_GAP_FLOOR_RATIO = 0.25;
export const MARK_GAP_CEILING_RATIO = 1.6;
/** An element spanning nearly the whole frame is a backdrop, not a composition member. */
const BACKDROP_WIDTH_PX = 1728; // 90% of 1920, the same cut axisCheck makes

export interface SpacingFinding {
  /** The audit's code vocabulary: padding-tight, padding-lopsided, lines-crowded,
   *  lines-adrift, mark-crowded, mark-adrift. */
  code: string;
  /** Human-readable, with the numbers that produced it. */
  detail: string;
}

export interface SpacingReport {
  /** The panel the measurements are relative to, when one was found. */
  panel: string | null;
  /** The primary type size in px - the unit everything below is expressed in. */
  typeSizePx: number | null;
  /** Padding per side, in TYPE SIZES, rounded to 2dp. Null when no panel was found. */
  padding: { top: number; right: number; bottom: number; left: number } | null;
  /** Gaps between consecutive stacked text lines, in type sizes. */
  lineGaps: number[];
  /** The mark's gap to the nearest text, in mark heights, when a mark is present. */
  markGap: number | null;
  findings: SpacingFinding[];
}

export interface Painted {
  el: Element;
  desc: string;
  rect: { left: number; right: number; top: number; bottom: number };
  fontSizePx: number;
  isText: boolean;
  hasSurface: boolean;
}

function describe(el: Element): string {
  const id = el.id ? `#${el.id}` : '';
  const cls = el.classList.length ? `.${[...el.classList].join('.')}` : '';
  return `${el.tagName.toLowerCase()}${id}${cls}`;
}

function hasOwnText(el: Element): boolean {
  for (const node of el.childNodes) {
    if (node.nodeType === Node.TEXT_NODE && (node.textContent ?? '').trim()) return true;
  }
  return false;
}

function opaqueBackground(style: CSSStyleDeclaration): boolean {
  const bg = style.backgroundColor;
  if (!bg || bg === 'transparent') return Boolean(style.backgroundImage && style.backgroundImage !== 'none');
  if (/rgba\([^)]*,\s*0(\.\d+)?\)/.test(bg)) {
    const alpha = parseFloat(bg.match(/,\s*([\d.]+)\s*\)$/)?.[1] ?? '1');
    return alpha > 0.15;
  }
  return true;
}

export function collectPainted(doc: Document): Painted[] {
  const win = doc.defaultView;
  if (!win) return [];
  const out: Painted[] = [];
  for (const el of doc.body.querySelectorAll('*')) {
    const style = win.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') continue;
    if (parseFloat(style.opacity) < 0.05) continue;
    if (!paints(el, style)) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    out.push({
      el,
      desc: describe(el),
      rect: { left: r.left, right: r.right, top: r.top, bottom: r.bottom },
      fontSizePx: parseFloat(style.fontSize) || 0,
      isText: hasOwnText(el) && el.tagName !== 'IMG',
      hasSurface: opaqueBackground(style),
    });
  }
  return out;
}

/**
 * THE PANEL is the innermost surface that holds the composition.
 *
 * Not simply the largest background: a full-frame scrim would win that and every measurement
 * would then be relative to the frame, which is a different question. Take the SMALLEST
 * painted surface that still contains at least two other painted elements - that is the thing
 * a viewer reads as "the box", and on a house-contract graphic it resolves to the `-box`
 * element without needing to know the prefix.
 */
export function findPanel(items: Painted[]): Painted | null {
  const contains = (a: Painted, b: Painted): boolean =>
    a !== b && a.rect.left <= b.rect.left + 1 && a.rect.right >= b.rect.right - 1
    && a.rect.top <= b.rect.top + 1 && a.rect.bottom >= b.rect.bottom - 1;
  const candidates = items
    .filter((p) => p.hasSurface && (p.rect.right - p.rect.left) < BACKDROP_WIDTH_PX)
    .filter((p) => items.filter((q) => contains(p, q)).length >= 2)
    .sort((a, b) => (a.rect.right - a.rect.left) * (a.rect.bottom - a.rect.top)
      - (b.rect.right - b.rect.left) * (b.rect.bottom - b.rect.top));
  return candidates[0] ?? null;
}

/** The unit: the largest painted text in the composition. */
export function primaryTypeSize(items: Painted[]): number | null {
  const sizes = items.filter((p) => p.isText && p.fontSizePx > 0).map((p) => p.fontSizePx);
  return sizes.length ? Math.max(...sizes) : null;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface SpacingOptions {
  paddingFloorRatio?: number;
  paddingSkewFactor?: number;
  bleedRatio?: number;
  lineGapFloorRatio?: number;
  lineGapCeilingRatio?: number;
  ruleGapFloorRatio?: number;
  markGapFloorRatio?: number;
  markGapCeilingRatio?: number;
  /** The brand mark's field id, when the graphic carries one. */
  markFieldId?: string | null;
}

export function measureSpacing(doc: Document, options: SpacingOptions = {}): SpacingReport {
  const floor = options.paddingFloorRatio ?? PADDING_FLOOR_RATIO;
  const skew = options.paddingSkewFactor ?? PADDING_SKEW_FACTOR;
  const bleed = options.bleedRatio ?? BLEED_RATIO;
  const lineFloor = options.lineGapFloorRatio ?? LINE_GAP_FLOOR_RATIO;
  const lineCeiling = options.lineGapCeilingRatio ?? LINE_GAP_CEILING_RATIO;
  const ruleFloor = options.ruleGapFloorRatio ?? RULE_GAP_FLOOR_RATIO;
  const markFloor = options.markGapFloorRatio ?? MARK_GAP_FLOOR_RATIO;
  const markCeiling = options.markGapCeilingRatio ?? MARK_GAP_CEILING_RATIO;

  const report: SpacingReport = {
    panel: null, typeSizePx: null, padding: null, lineGaps: [], markGap: null, findings: [],
  };

  const items = collectPainted(doc);
  const typeSize = primaryTypeSize(items);
  if (!typeSize) return report;
  report.typeSizePx = round2(typeSize);

  // ── Panel padding ───────────────────────────────────────────────────────────────────
  const panel = findPanel(items);
  if (panel) {
    report.panel = panel.desc;
    const inside = items.filter((p) => p !== panel
      && p.rect.left >= panel.rect.left - 1 && p.rect.right <= panel.rect.right + 1
      && p.rect.top >= panel.rect.top - 1 && p.rect.bottom <= panel.rect.bottom + 1);
    if (inside.length) {
      const union = {
        left: Math.min(...inside.map((p) => p.rect.left)),
        right: Math.max(...inside.map((p) => p.rect.right)),
        top: Math.min(...inside.map((p) => p.rect.top)),
        bottom: Math.max(...inside.map((p) => p.rect.bottom)),
      };
      const pad = {
        top: round2((union.top - panel.rect.top) / typeSize),
        right: round2((panel.rect.right - union.right) / typeSize),
        bottom: round2((panel.rect.bottom - union.bottom) / typeSize),
        left: round2((union.left - panel.rect.left) / typeSize),
      };
      report.padding = pad;

      // A side under the bleed ratio is deliberate contact with the edge, not tightness.
      const sides = Object.entries(pad).filter(([, v]) => v >= bleed);
      const tight = sides.filter(([, v]) => v < floor);
      if (tight.length) {
        report.findings.push({
          code: 'padding-tight',
          detail: `${tight.map(([s, v]) => `${s} ${v}`).join(', ')} type sizes `
            + `(floor ${floor}) - the content is crammed against its panel`,
        });
      }
      // VERTICAL skew always; HORIZONTAL only when the panel hugs its content.
      //
      // The catalog taught this: lt55 and ls15 carry a fixed-width BAND with left-aligned text,
      // so their right "padding" is 6.7 and 6.9 type sizes of empty band. Read as padding that
      // is a 10x imbalance; read as design it is a strap that runs to a chosen width, which is
      // one of the most ordinary shapes in broadcast. Unused band is not a spacing error, and a
      // check that says otherwise would be telling every full-width design to shrink. The
      // owner's actual complaint - "too much space beneath" - is vertical, where a panel really
      // is expected to sit evenly on its own content.
      const hugsHorizontally = pad.left + pad.right <= HUG_TOTAL_RATIO;
      const axes: (readonly ['top', 'bottom'] | readonly ['left', 'right'])[] = hugsHorizontally
        ? [['top', 'bottom'], ['left', 'right']]
        : [['top', 'bottom']];
      for (const [a, b] of axes) {
        const va = pad[a];
        const vb = pad[b];
        if (va < bleed || vb < bleed) continue;
        const [hi, lo] = va >= vb ? [va, vb] : [vb, va];
        if (lo > 0 && hi / lo > skew) {
          report.findings.push({
            code: 'padding-lopsided',
            detail: `${a} ${va} vs ${b} ${vb} type sizes (${round2(hi / lo)}x, limit ${skew}x)`
              + ' - the panel is not centred on its own content',
          });
        }
      }
    }
  }

  // ── Gaps between stacked text lines ─────────────────────────────────────────────────
  const lines = items.filter((p) => p.isText && p.fontSizePx > 0)
    .sort((a, b) => a.rect.top - b.rect.top);
  for (let i = 1; i < lines.length; i += 1) {
    const above = lines[i - 1];
    const below = lines[i];
    // Only consecutive lines that actually stack (their x-ranges overlap) form a block.
    const overlapX = Math.min(above.rect.right, below.rect.right) - Math.max(above.rect.left, below.rect.left);
    if (overlapX <= 0) continue;
    const gapPx = below.rect.top - above.rect.bottom;
    const unit = Math.min(above.fontSizePx, below.fontSizePx);
    const ratio = round2(gapPx / unit);
    report.lineGaps.push(ratio);
    if (gapPx < 0) {
      report.findings.push({
        code: 'lines-crowded',
        detail: `${above.desc} and ${below.desc} OVERLAP by ${round2(-gapPx)}px - text on top of text`,
      });
    } else if (ratio < lineFloor) {
      report.findings.push({
        code: 'lines-crowded',
        detail: `${above.desc} to ${below.desc} gap ${ratio} type sizes (floor ${lineFloor})`,
      });
    } else if (ratio > lineCeiling) {
      report.findings.push({
        code: 'lines-adrift',
        detail: `${above.desc} to ${below.desc} gap ${ratio} type sizes (ceiling ${lineCeiling})`
          + ' - the lines have stopped reading as one block',
      });
    }
  }

  // ── Text against the design's own RULES and accents ─────────────────────────────────
  //
  // THIS is what the owner's notes are actually about. "The name text too close to the line and
  // it's too tight", "the text is on top of the line" - the "line" is the accent rule, not a
  // sibling text line, and the first version of this instrument only ever paired text with
  // text, so it could not have seen either complaint. A rule is a non-text painted element that
  // does not CONTAIN the text (its panel does, and a panel is not a collision).
  const rules = items.filter((p) => !p.isText && p.el.tagName !== 'IMG' && p !== panel);
  for (const line of lines) {
    for (const rule of rules) {
      const contains = rule.rect.left <= line.rect.left + 1 && rule.rect.right >= line.rect.right - 1
        && rule.rect.top <= line.rect.top + 1 && rule.rect.bottom >= line.rect.bottom - 1;
      if (contains) continue;
      const dx = Math.max(rule.rect.left - line.rect.right, line.rect.left - rule.rect.right, 0);
      const dy = Math.max(rule.rect.top - line.rect.bottom, line.rect.top - rule.rect.bottom, 0);
      if (dx > 0 && dy > 0) continue;          // diagonal neighbours never collide
      // TOUCHING IS NOT OVERLAPPING. lt39 bolts its name to a solid accent block on purpose -
      // zero gap, by design, and the first version called it text sitting ON the rule. Overlap
      // has to be a real intersection on BOTH axes, so measure the intersection rather than
      // inferring it from a zero distance.
      const ox = Math.min(line.rect.right, rule.rect.right) - Math.max(line.rect.left, rule.rect.left);
      const oy = Math.min(line.rect.bottom, rule.rect.bottom) - Math.max(line.rect.top, rule.rect.top);
      const overlapping = ox > 1 && oy > 1;
      const gapPx = Math.max(dx, dy);
      const ratio = round2(gapPx / line.fontSizePx);
      if (overlapping) {
        report.findings.push({
          code: 'text-over-rule',
          detail: `${line.desc} sits ON ${rule.desc} - text over the design's own rule`,
        });
      } else if (ratio > RULE_CONTACT_RATIO && ratio < ruleFloor) {
        // A BAND, not a floor - the same shape axisCheck's text near-miss already uses, and for
        // the same reason. Zero gap is deliberate contact (lt39 bolts its name to a solid accent
        // block and ships that way); the defect is text sitting NEAR a rule without touching it,
        // which is what "too close to the line and it's too tight" describes.
        report.findings.push({
          code: 'text-crowds-rule',
          detail: `${line.desc} sits ${ratio} type sizes from ${rule.desc}`
            + ` (crowding band ${RULE_CONTACT_RATIO}-${ruleFloor}; touching is a composition)`,
        });
      }
    }
  }

  // ── The mark's gap to the text it stands beside ─────────────────────────────────────
  if (options.markFieldId) {
    const mark = items.find((p) => p.el.id === options.markFieldId);
    const text = items.filter((p) => p.isText);
    if (mark && text.length) {
      const markH = mark.rect.bottom - mark.rect.top;
      const gaps = text.map((t) => {
        const dx = Math.max(mark.rect.left - t.rect.right, t.rect.left - mark.rect.right, 0);
        const dy = Math.max(mark.rect.top - t.rect.bottom, t.rect.top - mark.rect.bottom, 0);
        return Math.max(dx, dy) || Math.min(dx, dy);
      });
      const nearest = Math.min(...gaps);
      const ratio = round2(nearest / Math.max(1, markH));
      report.markGap = ratio;
      if (ratio < markFloor) {
        report.findings.push({
          code: 'mark-crowded',
          detail: `the mark sits ${ratio} of its own height from the nearest text `
            + `(clear space floor ${markFloor})`,
        });
      } else if (ratio > markCeiling) {
        report.findings.push({
          code: 'mark-adrift',
          detail: `the mark sits ${ratio} of its own height from the nearest text `
            + `(ceiling ${markCeiling}) - it has stopped belonging to the lockup`,
        });
      }
    }
  }

  return report;
}
