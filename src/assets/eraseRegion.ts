// Deterministic baked-text erase for imported artwork (the Import Graphic wizard's Prepare
// step, docs/IMPORT_MVP.md; the NoaCG Pro compiler runs the same machinery over its concept
// crop). The user draws a rectangle over text that was exported INTO
// their design; if the background just outside that rectangle is flat, filling the rectangle
// with that colour removes the text cleanly — no AI, no network, same input always gives the
// same output. When the background is NOT flat (gradient / texture / photo), reconstruction
// would be guesswork, so this module refuses to pretend: it reports non-uniform and the UI
// recommends re-exporting the design without the text.
//
// Everything here works in the artwork's SOURCE pixels (the file's own resolution), never the
// fitted design size — a 2× retina export is erased at 2×, so the cleaned file keeps every
// pixel of sharpness. Mapping to design px is the caller's job.

/** A rectangle in the artwork's SOURCE pixels (never the fitted design space). */
export interface EraseRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * How far apart the background samples may sit and still count as "flat", per 8-bit channel,
 * alpha included. Flat design-tool exports (Canva, Figma, Illustrator) sample identical or
 * ±1–2 counts even across PNG round-trips, while gradients, textures, and photo backdrops
 * blow past 10 within a few pixels. Alpha participates so a soft drop shadow crossing the
 * sample ring fails honestly instead of leaving a visible seam after the fill.
 */
export const FLAT_BG_TOLERANCE = 10;

/** How far outside the rectangle the background is sampled — clear of the text's own
 *  antialiasing, which bleeds a pixel or two past where the user naturally draws. */
const SAMPLE_OFFSET = 3;

export interface EraseSampling {
  /** The fill that was applied: the per-channel mean of the surviving edge samples. On the
   *  type-aware path this is the FIRST text segment's own background — the value a seeded
   *  field's text colour is contrasted against, so it must describe the surface behind the
   *  words, never an average of every surface the lasso happened to cross. */
  fill: { r: number; g: number; b: number; a: number };
  /** Worst per-channel spread that remains AFTER the best available background model: a flat
   *  segment reports its raw spread, a gradient segment the spread left over once the fitted
   *  gradient is subtracted. What "clean" was actually judged against, alpha included (0–255). */
  maxDeviation: number;
  /** True when every filled area had a clean background model: flat, or a smooth gradient the
   *  linear fit reconstructs within FLAT_BG_TOLERANCE. */
  uniform: boolean;
  /** Ring points that actually landed on the image (a rect at the edge loses some). */
  sampleCount: number;
  /** True when any filled area used a fitted gradient rather than one colour. */
  gradient?: boolean;
  /** The type-aware path's per-segment verdict: how many text areas were found in the box and
   *  how many of them sat on a background clean enough to reconstruct. Absent on the legacy
   *  whole-rect path (no type was detected in the box). */
  segments?: { clean: number; total: number };
}

/**
 * The INK the erase removed: the tight bounding box of the pixels that actually differed
 * from the background, in SOURCE pixels. The rectangle the user drew is a loose lasso around
 * the text — it says "somewhere in here" — while this says where the text really sat and how
 * tall it really was, which is what a useful replacement field is built from.
 */
/** One LINE of erased text: an unbroken run of ink rows, and the columns it occupies. A
 *  region the user drew around a name AND its title holds two of these, and each becomes its
 *  own field — they had their own position, width, and size in the design. */
export interface InkLine {
  /** Source px: the line's own ink box. */
  x: number;
  width: number;
  top: number;
  /** `top` down to the BASELINE: the part of the line every glyph shares, with any descender
   *  tail excluded. This is the measurement type size is read from — the full run is ~0.72 em
   *  for "Riva" and ~0.94 em for "Gray", so a size taken from it would be right for one and
   *  30% out for the other, while this is ~0.72 em for both. */
  capHeight: number;
}

export interface RegionInk {
  x: number;
  y: number;
  width: number;
  height: number;
  /** The lines found in the region, top to bottom. Never empty (a region with no ink at all
   *  reports no RegionInk). */
  lines: InkLine[];
}

/** How far a pixel must differ from the sampled background (per 8-bit channel) to count as
 *  ink. Well above FLAT_BG_TOLERANCE's notion of "the same colour", so JPEG ringing and PNG
 *  antialiasing around the glyphs don't inflate the box, and far below the contrast any
 *  legible text has against what it sits on. */
const INK_TOLERANCE = 40;

/** How dense a row must stay, relative to the line's densest row, to still count as above the
 *  baseline. Measured against real type: the rows a whole line shares sit near the peak, while
 *  a descender tail carried by one or two letters of a dozen drops to under a tenth of it. */
const BASELINE_SHARE = 0.35;

/** How many rows tall a run must be to count as a LINE. Below this it is a rule, an underline,
 *  or the edge of something the rectangle clipped — not type worth seeding a field from. */
const MIN_LINE_ROWS = 5;

export interface EraseResult {
  /** The cleaned artwork as a PNG data URL, at the SOURCE dimensions. */
  dataUrl: string;
  sampling: EraseSampling;
  /** What was erased, measured — null when the region held nothing but background. */
  ink: RegionInk | null;
}

/** Decode a data URL into a ready <img> (the only thing that knows the real pixel size). */
function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('That file could not be read as an image.'));
    img.src = dataUrl;
  });
}

/**
 * The sample ring: 16 single-pixel probes just OUTSIDE the rectangle — 5 across the top,
 * 5 across the bottom, 3 down each side. Outside, because the text's antialiasing lives
 * inside the rectangle and would pollute the flatness verdict; a ring, because a background
 * that is flat above the text but a gradient below it must fail, and only points on every
 * side can see that.
 */
function ringPoints(rect: EraseRect): Array<{ x: number; y: number }> {
  const pts: Array<{ x: number; y: number }> = [];
  const top = rect.y - SAMPLE_OFFSET;
  const bottom = rect.y + rect.height + SAMPLE_OFFSET;
  const left = rect.x - SAMPLE_OFFSET;
  const right = rect.x + rect.width + SAMPLE_OFFSET;
  for (let i = 0; i < 5; i++) {
    const x = Math.round(rect.x + (rect.width * i) / 4);
    pts.push({ x, y: top }, { x, y: bottom });
  }
  for (let i = 0; i < 3; i++) {
    const y = Math.round(rect.y + (rect.height * (i + 1)) / 4);
    pts.push({ x: left, y }, { x: right, y });
  }
  return pts;
}

/** One ring probe that landed on the image: where it sat and what it read. */
interface RingProbe {
  x: number;
  y: number;
  v: [number, number, number, number];
}

/** The probes of a rectangle's ring that exist on the image. */
function collectRing(
  px: Uint8ClampedArray,
  imageWidth: number,
  imageHeight: number,
  rect: EraseRect,
): RingProbe[] {
  const probes: RingProbe[] = [];
  for (const p of ringPoints(rect)) {
    if (p.x < 0 || p.y < 0 || p.x >= imageWidth || p.y >= imageHeight) continue;
    const at = (p.y * imageWidth + p.x) * 4;
    probes.push({ x: p.x, y: p.y, v: [px[at], px[at + 1], px[at + 2], px[at + 3]] });
  }
  return probes;
}

/**
 * Sample the ring around a rectangle and turn it into the flatness verdict + the fill. One
 * implementation, because the erase and the baked-text SCAN below must never disagree about
 * whether a region's background is flat or what colour it is. Points off the image are
 * skipped — a design cropped at the frame edge is legitimate, and the verdict comes from the
 * points that exist.
 */
function sampleRing(
  px: Uint8ClampedArray,
  imageWidth: number,
  imageHeight: number,
  rect: EraseRect,
): EraseSampling {
  const probes = collectRing(px, imageWidth, imageHeight, rect);
  const lo = [255, 255, 255, 255];
  const hi = [0, 0, 0, 0];
  const sum = [0, 0, 0, 0];
  for (const p of probes) {
    for (let c = 0; c < 4; c++) {
      const v = p.v[c];
      if (v < lo[c]) lo[c] = v;
      if (v > hi[c]) hi[c] = v;
      sum[c] += v;
    }
  }
  const sampleCount = probes.length;
  const maxDeviation = sampleCount ? Math.max(...hi.map((v, c) => v - lo[c])) : 255;
  const uniform = sampleCount > 0 && maxDeviation <= FLAT_BG_TOLERANCE;
  const mean = sum.map((v) => (sampleCount ? Math.round(v / sampleCount) : 0));
  // A near-invisible fill is really a transparent background (a PNG with the design floating
  // on air) — write true transparency instead of a faintly tinted veil over it.
  const fill =
    mean[3] <= 8
      ? { r: 0, g: 0, b: 0, a: 0 }
      : { r: mean[0], g: mean[1], b: mean[2], a: mean[3] };
  return { fill, maxDeviation, uniform, sampleCount };
}

// ─── The background MODEL a fill reconstructs ──────────────────────────────────────────────
//
// A flat background is the model `v = mean`; a smooth gradient is the model
// `v = a + bx·x + by·y` per channel, fitted to the ring's probes by least squares. Both are
// judged by the same number — the worst per-channel deviation the model leaves unexplained —
// against the same FLAT_BG_TOLERANCE, so "smooth gradient" is exactly "flat, once the plane
// is subtracted" and nothing gets looser. A texture, a photo, or a surface BOUNDARY (panel
// edge inside the ring) leaves residuals far past the tolerance and still refuses honestly:
// a linear plane cannot model a step.

/** A fitted linear background field: value(x, y) per channel, plus what it failed to explain. */
interface BgField {
  /** 'flat' fills one colour; 'gradient' fills the fitted plane per pixel. */
  kind: 'flat' | 'gradient';
  /** Worst per-channel deviation the model leaves across the probes (0–255). */
  deviation: number;
  /** The mean colour — the fill for 'flat', and the representative colour for 'gradient'
   *  (what a seeded field's text colour is contrasted against). */
  mean: { r: number; g: number; b: number; a: number };
  /** The model's value at a pixel, rounded, alpha-snapped like the flat fill. */
  at(x: number, y: number): [number, number, number, number];
}

/** Fit the flat model, then — only if flat fails — the linear-gradient model. Null when
 *  neither explains the probes within FLAT_BG_TOLERANCE (a busy background). */
function fitBackground(probes: RingProbe[]): BgField | null {
  if (probes.length === 0) return null;
  const lo = [255, 255, 255, 255];
  const hi = [0, 0, 0, 0];
  const sum = [0, 0, 0, 0];
  for (const p of probes) {
    for (let c = 0; c < 4; c++) {
      const v = p.v[c];
      if (v < lo[c]) lo[c] = v;
      if (v > hi[c]) hi[c] = v;
      sum[c] += v;
    }
  }
  const mean = sum.map((v) => Math.round(v / probes.length));
  const meanFill =
    mean[3] <= 8
      ? { r: 0, g: 0, b: 0, a: 0 }
      : { r: mean[0], g: mean[1], b: mean[2], a: mean[3] };
  const flatDeviation = Math.max(...hi.map((v, c) => v - lo[c]));
  if (flatDeviation <= FLAT_BG_TOLERANCE) {
    const flat: [number, number, number, number] = [meanFill.r, meanFill.g, meanFill.b, meanFill.a];
    return { kind: 'flat', deviation: flatDeviation, mean: meanFill, at: () => flat };
  }

  // The gradient fit needs enough probes to be a measurement rather than an echo, and spread
  // in BOTH axes — a rect at the image edge can lose a whole side of its ring, and a plane
  // fitted to three collinear points would extrapolate garbage into the fill.
  if (probes.length < 8) return null;
  const cx = probes.reduce((n, p) => n + p.x, 0) / probes.length;
  const cy = probes.reduce((n, p) => n + p.y, 0) / probes.length;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const p of probes) {
    sxx += (p.x - cx) * (p.x - cx);
    syy += (p.y - cy) * (p.y - cy);
    sxy += (p.x - cx) * (p.y - cy);
  }
  const det = sxx * syy - sxy * sxy;
  if (sxx < 4 || syy < 4 || det < 1e-3) return null;

  const a: number[] = [];
  const bx: number[] = [];
  const by: number[] = [];
  for (let c = 0; c < 4; c++) {
    let svx = 0;
    let svy = 0;
    let sv = 0;
    for (const p of probes) {
      sv += p.v[c];
      svx += p.v[c] * (p.x - cx);
      svy += p.v[c] * (p.y - cy);
    }
    // Least squares for v = a + bx·(x-cx) + by·(y-cy), per channel over the shared geometry.
    bx[c] = (svx * syy - svy * sxy) / det;
    by[c] = (svy * sxx - svx * sxy) / det;
    a[c] = sv / probes.length;
  }
  const valueAt = (x: number, y: number, c: number) =>
    Math.max(0, Math.min(255, Math.round(a[c] + bx[c] * (x - cx) + by[c] * (y - cy))));
  let deviation = 0;
  for (const p of probes) {
    for (let c = 0; c < 4; c++) {
      const d = Math.abs(p.v[c] - valueAt(p.x, p.y, c));
      if (d > deviation) deviation = d;
    }
  }
  if (deviation > FLAT_BG_TOLERANCE) return null;
  return {
    kind: 'gradient',
    deviation,
    mean: meanFill,
    at(x: number, y: number): [number, number, number, number] {
      const alpha = valueAt(x, y, 3);
      // The same transparency snap as the flat fill: a near-invisible model value is a
      // transparent background, and writing colour under alpha ≤ 8 bleeds through scaling
      // filters as a fringe.
      if (alpha <= 8) return [0, 0, 0, 0];
      return [valueAt(x, y, 0), valueAt(x, y, 1), valueAt(x, y, 2), alpha];
    },
  };
}

/**
 * fitBackground, with one second chance: drop the worst third of the probes and fit again.
 *
 * A ring is 16 blind samples, and real designs put furniture NEAR text — a hairline rule one
 * pad short of the descenders, an accent bar a word-space from the first letter — so one side
 * of the ring can land on ink-like furniture while the surface under the text is perfectly
 * flat. The trim drops the probes farthest from the per-channel MEDIAN (the robust centre a
 * minority cannot drag) and refits; a model that only exists because of the trim is honest
 * ONLY together with the fill-zone verification in eraseRegionFlat, which checks that the
 * box's own pixels are mostly the model's background — the case the trim must not admit is a
 * box straddling two surfaces, where the "outliers" are half the truth. That case fails the
 * zone check on its own bulk.
 */
function fitBackgroundTrimmed(probes: RingProbe[]): { field: BgField | null; trimmed: boolean } {
  const full = fitBackground(probes);
  if (full) return { field: full, trimmed: false };
  if (probes.length < 12) return { field: null, trimmed: false };
  const median = (values: number[]): number => {
    const s = [...values].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  };
  const centre = [0, 1, 2, 3].map((c) => median(probes.map((p) => p.v[c])));
  const scored = probes
    .map((p) => ({ p, d: Math.max(...p.v.map((v, c) => Math.abs(v - centre[c]))) }))
    .sort((a, b) => a.d - b.d);
  const kept = scored.slice(0, probes.length - Math.ceil(probes.length / 3)).map((s) => s.p);
  if (kept.length < 8) return { field: null, trimmed: false };
  return { field: fitBackground(kept), trimmed: true };
}

/** How many stroke edges per row a column span must average to read as TYPE rather than
 *  furniture sharing the rows: a solid shape (panel edge, accent bar, rule crossing the box)
 *  contributes ~2 transitions per row and a slanted boundary 1–2, while even a short word is
 *  2 per glyph stem — four glyphs clear this several times over. */
const MIN_SEGMENT_EDGES_PER_ROW = 5;

/** One area the erase will fill: a run of type on ONE surface, with the surface's model. */
interface EraseSegment {
  /** Which text line (band) the segment belongs to, top to bottom. */
  band: number;
  /** The padded box that gets filled, clamped to the user's rect. */
  box: EraseRect;
  /** The background model — null when the ring around this segment is busy. */
  field: BgField | null;
  /** The fill actually applied (the model's mean; for a busy ring, the probe mean). */
  mean: { r: number; g: number; b: number; a: number };
  /** Raw flat spread across the probes — what the warning reports for a busy ring. */
  rawDeviation: number;
  probeCount: number;
}

/** Every contiguous column span carrying edges, gaps up to `gap` allowed (a word space) —
 *  the plural of widestSpan, because one line can hold several separate pieces of type. */
function allSpans(
  counts: Int32Array,
  offset: number,
  gap: number,
): Array<{ x0: number; x1: number; mass: number }> {
  const spans: Array<{ x0: number; x1: number; mass: number }> = [];
  let start = -1;
  let last = -1;
  let mass = 0;
  const close = () => {
    if (start !== -1) spans.push({ x0: offset + start, x1: offset + last, mass });
  };
  for (let i = 0; i < counts.length; i++) {
    if (counts[i] === 0) continue;
    if (start === -1 || i - last > gap) {
      close();
      start = i;
      mass = 0;
    }
    last = i;
    mass += counts[i];
  }
  close();
  return spans;
}

/**
 * The type inside the user's rect, as fillable segments: stroke-edge bands (the scan's own
 * discriminator, which needs no background estimate and so cannot be fooled by a lasso that
 * crosses two surfaces) split into per-line column spans, each padded and given its own ring.
 * Furniture sharing the rows — a divider, a panel edge, an accent bar — fails the
 * edges-per-row floor and is left standing.
 */
function segmentsOf(
  px: Uint8ClampedArray,
  imageWidth: number,
  imageHeight: number,
  rect: EraseRect,
): EraseSegment[] {
  const bands = bandsOf(
    rowEdges(px, imageWidth, rect.x, rect.x + rect.width, rect.y, rect.y + rect.height),
    rect.y,
  );
  const segments: EraseSegment[] = [];
  bands.forEach((band, bandIndex) => {
    const cols = colEdges(
      px,
      imageWidth,
      rect.x,
      rect.x + rect.width,
      band.top,
      band.top + band.height,
    );
    const gap = Math.max(8, Math.round(band.height * 0.6));
    for (const span of allSpans(cols, rect.x, gap)) {
      if (span.mass / band.height < MIN_SEGMENT_EDGES_PER_ROW) continue;
      // The pad covers the glyphs' antialiasing and the ascender/descender rows thin enough
      // to drop under the band threshold; the ring then probes SAMPLE_OFFSET beyond it. The
      // box never grows past the user's rect — the lasso is the user's authority.
      //
      // Each side's pad is CAPPED before the nearest surface BOUNDARY, so the ring's probes
      // can only ever read the surface the text itself sits on. The hazard is real furniture
      // drawn close to the words — the hairline rule between a name and its title crosses the
      // whole span one row below the descenders, and a probe row landing on it poisons the
      // verdict with a deviation no model can explain. Horizontal edge counts cannot see a
      // horizontal rule (inside the span it is constant colour), so the test is the
      // TRANSVERSE one: a row (column) where the pixel row above/beside differs across more
      // than half the span is a boundary, and the pad stops short of it.
      const spanW = span.x1 - span.x0 + 1;
      const crossesRow = (y: number): boolean => {
        if (y <= 0 || y >= imageHeight) return false;
        let n = 0;
        let at = (y * imageWidth + span.x0) * 4;
        let above = at - imageWidth * 4;
        for (let x = span.x0; x <= span.x1; x++, at += 4, above += 4) {
          let d = 0;
          for (let c = 0; c < 4; c++) d = Math.max(d, Math.abs(px[at + c] - px[above + c]));
          if (d > EDGE_TOLERANCE) n++;
        }
        return n > spanW * 0.5;
      };
      const crossesCol = (x: number): boolean => {
        if (x <= 0 || x >= imageWidth) return false;
        let n = 0;
        let at = (band.top * imageWidth + x) * 4;
        const stride = imageWidth * 4;
        for (let y = band.top; y < band.top + band.height; y++, at += stride) {
          let d = 0;
          for (let c = 0; c < 4; c++) d = Math.max(d, Math.abs(px[at + c] - px[at - 4 + c]));
          if (d > EDGE_TOLERANCE) n++;
        }
        return n > band.height * 0.5;
      };
      const cappedPad = (desired: number, unsafeAt: (d: number) => boolean): number => {
        for (let d = 1; d <= desired + SAMPLE_OFFSET; d++) {
          if (unsafeAt(d)) return Math.max(2, d - SAMPLE_OFFSET - 1);
        }
        return desired;
      };
      const wantY = Math.max(3, Math.round(band.height * 0.3));
      const wantX = Math.max(3, Math.round(band.height * 0.15));
      const padTop = cappedPad(wantY, (d) => crossesRow(band.top - d + 1));
      const padBottom = cappedPad(wantY, (d) => crossesRow(band.top + band.height - 1 + d));
      const padLeft = cappedPad(wantX, (d) => crossesCol(span.x0 - d));
      const padRight = cappedPad(wantX, (d) => crossesCol(span.x1 + d));
      const bx0 = Math.max(rect.x, span.x0 - padLeft);
      const by0 = Math.max(rect.y, band.top - padTop);
      const bx1 = Math.min(rect.x + rect.width, span.x1 + 1 + padRight);
      const by1 = Math.min(rect.y + rect.height, band.top + band.height + padBottom);
      const box: EraseRect = { x: bx0, y: by0, width: bx1 - bx0, height: by1 - by0 };
      const probes = collectRing(px, imageWidth, imageHeight, box);
      const { field } = fitBackgroundTrimmed(probes);
      const lo = [255, 255, 255, 255];
      const hi = [0, 0, 0, 0];
      const sum = [0, 0, 0, 0];
      for (const p of probes) {
        for (let c = 0; c < 4; c++) {
          const v = p.v[c];
          if (v < lo[c]) lo[c] = v;
          if (v > hi[c]) hi[c] = v;
          sum[c] += v;
        }
      }
      const m = sum.map((v) => (probes.length ? Math.round(v / probes.length) : 0));
      const mean =
        field?.mean ??
        (m[3] <= 8 ? { r: 0, g: 0, b: 0, a: 0 } : { r: m[0], g: m[1], b: m[2], a: m[3] });
      segments.push({
        band: bandIndex,
        box,
        field,
        mean,
        rawDeviation: probes.length ? Math.max(...hi.map((v, c) => v - lo[c])) : 255,
        probeCount: probes.length,
      });
    }
  });
  return segments;
}

/** The tight ink box of one segment against its own background model — the segment is a
 *  single line by construction, so this is measureInk's per-run math without the run split. */
function segmentInk(
  px: Uint8ClampedArray,
  imageWidth: number,
  seg: EraseSegment,
): { line: InkLine | null; mass: number; zone: { bg: number; ink: number; total: number } } {
  const bgAt = seg.field ? seg.field.at : () => [seg.mean.r, seg.mean.g, seg.mean.b, seg.mean.a];
  const { box } = seg;
  const rows = new Array<number>(box.height).fill(0);
  const cols = new Array<number>(box.width).fill(0);
  const zone = { bg: 0, ink: 0, total: box.width * box.height };
  for (let ry = 0; ry < box.height; ry++) {
    let at = ((box.y + ry) * imageWidth + box.x) * 4;
    for (let rx = 0; rx < box.width; rx++, at += 4) {
      const bg = bgAt(box.x + rx, box.y + ry);
      let diff = 0;
      for (let c = 0; c < 4; c++) diff = Math.max(diff, Math.abs(px[at + c] - bg[c]));
      if (diff > INK_TOLERANCE) {
        rows[ry]++;
        cols[rx]++;
        zone.ink++;
      } else if (diff <= FLAT_BG_TOLERANCE * 2) {
        zone.bg++;
      }
    }
  }
  const inked = (counts: number[]) => {
    let first = -1;
    let last = -1;
    for (let i = 0; i < counts.length; i++) {
      if (counts[i] < 2) continue;
      if (first === -1) first = i;
      last = i;
    }
    return first === -1 ? null : { first, last };
  };
  const yRange = inked(rows);
  const xRange = inked(cols);
  const mass = rows.reduce((n, v) => n + v, 0);
  if (!yRange || !xRange || yRange.last - yRange.first + 1 < MIN_LINE_ROWS) {
    return { line: null, mass, zone };
  }
  // The baseline: the lowest row still carrying a real share of the densest row's ink —
  // the same descender split measureInk documents.
  const peak = Math.max(...rows.slice(yRange.first, yRange.last + 1));
  let baseline = yRange.first;
  for (let i = yRange.first; i <= yRange.last; i++) {
    if (rows[i] >= peak * BASELINE_SHARE) baseline = i;
  }
  return {
    line: {
      x: box.x + xRange.first,
      width: xRange.last - xRange.first + 1,
      top: box.y + yRange.first,
      capHeight: baseline - yRange.first + 1,
    },
    mass,
    zone,
  };
}

/**
 * Erase the baked-in TEXT inside the rectangle. The rect the user draws is a loose lasso, so
 * the erase finds the type inside it (stroke-edge bands — the scan's discriminator), gives
 * each piece its own padded box and its own ring, and reconstructs each piece's OWN
 * background: one colour where it is flat, a fitted plane where it is a smooth gradient.
 * Everything that is not type — a divider, a chip, a panel edge the lasso crossed — is left
 * standing, which is what lets a box drawn over a whole strap erase the words and keep the
 * design.
 *
 * A rect in which no type is detected falls back to filling the whole rectangle (the way to
 * remove a logo or an ornament), with the same flat-then-gradient model. Either way the
 * filled result is always returned — "continue anyway" applies exactly what the warning
 * preview showed. Deterministic: same input + rect ⇒ the same output bytes.
 */
export async function eraseRegionFlat(dataUrl: string, rect: EraseRect): Promise<EraseResult> {
  const img = await loadImage(dataUrl);
  const w = img.naturalWidth;
  const h = img.naturalHeight;

  // Clamp the rect to the image — the UI clamps too, but a stale rect after a re-upload
  // must degrade to a smaller fill, never to a getImageData exception.
  const x0 = Math.max(0, Math.min(w - 1, Math.round(rect.x)));
  const y0 = Math.max(0, Math.min(h - 1, Math.round(rect.y)));
  const x1 = Math.max(x0 + 1, Math.min(w, Math.round(rect.x + rect.width)));
  const y1 = Math.max(y0 + 1, Math.min(h, Math.round(rect.y + rect.height)));
  const clamped: EraseRect = { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not available in this browser.');
  ctx.drawImage(img, 0, 0);
  const image = ctx.getImageData(0, 0, w, h);
  const px = image.data;

  // Fill by mutating the pixel data directly: fillRect would COMPOSITE a semi-transparent
  // fill over the text underneath, leaving it ghosted through — writing the bytes replaces it.
  const fillBox = (box: EraseRect, at: (x: number, y: number) => [number, number, number, number]) => {
    for (let y = box.y; y < box.y + box.height; y++) {
      let o = (y * w + box.x) * 4;
      for (let x = box.x; x < box.x + box.width; x++, o += 4) {
        const v = at(x, y);
        px[o] = v[0];
        px[o + 1] = v[1];
        px[o + 2] = v[2];
        px[o + 3] = v[3];
      }
    }
  };

  const segments = segmentsOf(px, w, h, clamped);
  if (segments.length === 0) {
    // No type in the box — the whole-rect fill (a logo, an ornament), flat or gradient.
    const probes = collectRing(px, w, h, clamped);
    const flat = sampleRing(px, w, h, clamped);
    const field = fitBackground(probes);
    const fill = field?.mean ?? flat.fill;
    const bgAt: (x: number, y: number) => [number, number, number, number] = field
      ? field.at
      : () => [fill.r, fill.g, fill.b, fill.a];
    const ink = measureInk(px, w, clamped, bgAt);
    fillBox(clamped, bgAt);
    ctx.putImageData(image, 0, 0);
    return {
      dataUrl: canvas.toDataURL('image/png'),
      sampling: {
        fill,
        maxDeviation: field ? field.deviation : flat.maxDeviation,
        uniform: field !== null,
        sampleCount: flat.sampleCount,
        gradient: field?.kind === 'gradient' || undefined,
      },
      ink,
    };
  }

  // Measure each segment's ink BEFORE its fill removes it, then fill segment by segment.
  const measured = segments.map((seg) => ({ seg, ink: segmentInk(px, w, seg) }));
  for (const { seg } of measured) {
    fillBox(seg.box, seg.field ? seg.field.at : () => [seg.mean.r, seg.mean.g, seg.mean.b, seg.mean.a]);
  }
  ctx.putImageData(image, 0, 0);

  // A segment is CLEAN when its ring produced a model AND the box's own pixels verify it:
  // mostly the model's background, ink a minority. The verification is what keeps the
  // trimmed fit honest — a box straddling two surfaces has a plausible ring model (the
  // trim shed the other surface's probes) but its bulk contradicts it.
  const cleanSeg = (m: (typeof measured)[number]): boolean =>
    m.seg.field !== null &&
    m.ink.zone.bg >= m.ink.zone.total * 0.4 &&
    m.ink.zone.ink <= m.ink.zone.total * 0.5;

  // One InkLine per BAND — a line with two separated pieces (a name beside a chip) still
  // seeds one field, spanning both, sized by its heaviest piece.
  const lines: InkLine[] = [];
  const bandCount = Math.max(...segments.map((s) => s.band)) + 1;
  for (let b = 0; b < bandCount; b++) {
    const inBand = measured.filter((m) => m.seg.band === b && m.ink.line);
    if (inBand.length === 0) continue;
    const heaviest = inBand.reduce((best, m) => (m.ink.mass > best.ink.mass ? m : best));
    const lo = Math.min(...inBand.map((m) => m.ink.line!.x));
    const hi = Math.max(...inBand.map((m) => m.ink.line!.x + m.ink.line!.width));
    lines.push({
      x: lo,
      width: hi - lo,
      top: Math.min(...inBand.map((m) => m.ink.line!.top)),
      capHeight: heaviest.ink.line!.capHeight,
    });
  }
  const withLines = measured.filter((m) => m.ink.line);
  const ink: RegionInk | null = lines.length
    ? {
        x: Math.min(...lines.map((l) => l.x)),
        y: Math.min(...lines.map((l) => l.top)),
        width:
          Math.max(...lines.map((l) => l.x + l.width)) - Math.min(...lines.map((l) => l.x)),
        height:
          Math.max(...withLines.map((m) => m.ink.line!.top + m.ink.line!.capHeight)) -
          Math.min(...lines.map((l) => l.top)),
        lines,
      }
    : null;

  const clean = measured.filter(cleanSeg).length;
  const worst = (m: (typeof measured)[number]): number =>
    cleanSeg(m) ? m.seg.field!.deviation : m.seg.field ? m.seg.rawDeviation : m.seg.rawDeviation;
  const first = segments[0];
  return {
    dataUrl: canvas.toDataURL('image/png'),
    sampling: {
      fill: first.mean,
      maxDeviation: Math.max(...measured.map(worst)),
      uniform: clean === measured.length,
      sampleCount: segments.reduce((n, s) => n + s.probeCount, 0),
      gradient: measured.some((m) => cleanSeg(m) && m.seg.field?.kind === 'gradient') || undefined,
      segments: { clean, total: measured.length },
    },
    ink,
  };
}

/** The pad band a padded crop keeps on each side of a design unit, in SOURCE pixels. */
export interface RingPad {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface MatteResult {
  /** The matted artwork as a PNG data URL — the INPUT unchanged when `uniform` is false. */
  dataUrl: string;
  /** True when the whole band counted as flat and the matte was applied. */
  uniform: boolean;
  /** Worst per-channel spread across the band's pixels, alpha included (0–255). */
  maxDeviation: number;
}

/**
 * Make the artwork's outer PAD BAND transparent. A padded crop keeps a thin ring of the
 * source image around the design so an imprecise region edge is never shaved — but that ring
 * is the concept's own backdrop, and over real video it shows. Where the ENTIRE band is flat
 * (nothing but backdrop, within FLAT_BG_TOLERANCE) it is safely disposable, so it is written
 * as true transparency and the video shows through instead.
 *
 * Unlike eraseRegionFlat, a non-flat verdict returns the artwork UNTOUCHED: the erase backs a
 * preview with a "use it anyway" button, while this runs unattended inside a compiler — a
 * refusal must cost nothing. Deterministic: same input + pads ⇒ the same output bytes.
 */
export async function matteRingTransparent(dataUrl: string, pad: RingPad): Promise<MatteResult> {
  const img = await loadImage(dataUrl);
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const left = Math.max(0, Math.min(w, Math.round(pad.left)));
  const top = Math.max(0, Math.min(h, Math.round(pad.top)));
  const right = Math.max(0, Math.min(w - left, Math.round(pad.right)));
  const bottom = Math.max(0, Math.min(h - top, Math.round(pad.bottom)));
  if (left === 0 && top === 0 && right === 0 && bottom === 0) {
    return { dataUrl, uniform: true, maxDeviation: 0 };
  }

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not available in this browser.');
  ctx.drawImage(img, 0, 0);
  const image = ctx.getImageData(0, 0, w, h);
  const px = image.data;

  const inBand = (x: number, y: number) =>
    x < left || x >= w - right || y < top || y >= h - bottom;

  const lo = [255, 255, 255, 255];
  const hi = [0, 0, 0, 0];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!inBand(x, y)) continue;
      const at = (y * w + x) * 4;
      for (let c = 0; c < 4; c++) {
        const v = px[at + c];
        if (v < lo[c]) lo[c] = v;
        if (v > hi[c]) hi[c] = v;
      }
    }
  }
  const maxDeviation = Math.max(...hi.map((v, c) => v - lo[c]));
  if (maxDeviation > FLAT_BG_TOLERANCE) return { dataUrl, uniform: false, maxDeviation };

  // Write fully transparent BLACK, not just alpha 0 — a stray colour under zero alpha can
  // still bleed through scaling filters as a fringe.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!inBand(x, y)) continue;
      const at = (y * w + x) * 4;
      px[at] = 0;
      px[at + 1] = 0;
      px[at + 2] = 0;
      px[at + 3] = 0;
    }
  }
  ctx.putImageData(image, 0, 0);
  return { dataUrl: canvas.toDataURL('image/png'), uniform: true, maxDeviation };
}

/**
 * The tight box of everything inside `rect` that is not the background `fill`, split into the
 * LINES it holds. Row/column occupancy is enough — glyphs of one text line share every
 * scanline between their cap top and their baseline, so a fully empty row is a real gap
 * between lines, not a gap inside one.
 *
 * A row or column is only counted when at least TWO of its pixels are ink: a single stray
 * pixel is compression noise or a hairline of whatever the rectangle clipped, and letting one
 * decide the box would undo the point of measuring tightly.
 */
function measureInk(
  px: Uint8ClampedArray,
  imageWidth: number,
  rect: EraseRect,
  bgAt: (x: number, y: number) => [number, number, number, number],
): RegionInk | null {
  const rows = new Array<number>(rect.height).fill(0);
  const cols = new Array<number>(rect.width).fill(0);
  for (let ry = 0; ry < rect.height; ry++) {
    let at = ((rect.y + ry) * imageWidth + rect.x) * 4;
    for (let rx = 0; rx < rect.width; rx++, at += 4) {
      const bg = bgAt(rect.x + rx, rect.y + ry);
      let diff = 0;
      for (let c = 0; c < 4; c++) diff = Math.max(diff, Math.abs(px[at + c] - bg[c]));
      if (diff > INK_TOLERANCE) {
        rows[ry]++;
        cols[rx]++;
      }
    }
  }
  const inked = (counts: number[]) => {
    let first = -1;
    let last = -1;
    for (let i = 0; i < counts.length; i++) {
      if (counts[i] < 2) continue;
      if (first === -1) first = i;
      last = i;
    }
    return first === -1 ? null : { first, last };
  };
  const yRange = inked(rows);
  const xRange = inked(cols);
  if (!yRange || !xRange) return null;

  // Split the ink into unbroken row runs — one per line of text the region holds.
  const runs: Array<{ top: number; height: number }> = [];
  let runTop = -1;
  for (let i = yRange.first; i <= yRange.last + 1; i++) {
    const on = i <= yRange.last && rows[i] >= 2;
    if (on && runTop === -1) runTop = i;
    if (!on && runTop !== -1) {
      if (i - runTop >= MIN_LINE_ROWS) runs.push({ top: runTop, height: i - runTop });
      runTop = -1;
    }
  }
  if (runs.length === 0) return null;

  const lines: InkLine[] = runs.map((run) => {
    // The BASELINE of this run: the lowest row still carrying a real share of the line's ink.
    // Every glyph of a line reaches the baseline, so the rows above it are dense; only the few
    // letters with a tail (g j p q y) reach below, which makes the count collapse there. Taking
    // the last row above BASELINE_SHARE of the run's densest row therefore separates the shared
    // part of the line from its descenders — without knowing a thing about the font.
    //
    // Its one blind spot is a string where MOST glyphs descend ("gypsy"): the tail stays dense,
    // the baseline reads low, and the seeded type comes out large. Names and titles are not
    // shaped like that, and the result is still a starting point the user drags.
    const peak = Math.max(...rows.slice(run.top, run.top + run.height));
    let baseline = run.top;
    for (let i = run.top; i < run.top + run.height; i++) {
      if (rows[i] >= peak * BASELINE_SHARE) baseline = i;
    }
    // This line's own columns — the region's overall x-range spans every line at once, and a
    // short title under a long name would inherit the name's width and left edge from it.
    let first = -1;
    let last = -1;
    for (let rx = 0; rx < rect.width; rx++) {
      let n = 0;
      for (let ry = run.top; ry < run.top + run.height; ry++) {
        const at = ((rect.y + ry) * imageWidth + rect.x + rx) * 4;
        const bg = bgAt(rect.x + rx, rect.y + ry);
        let diff = 0;
        for (let c = 0; c < 4; c++) diff = Math.max(diff, Math.abs(px[at + c] - bg[c]));
        if (diff > INK_TOLERANCE && ++n >= 2) break;
      }
      if (n < 2) continue;
      if (first === -1) first = rx;
      last = rx;
    }
    return {
      x: rect.x + (first === -1 ? xRange.first : first),
      width: (first === -1 ? xRange.last - xRange.first : last - first) + 1,
      top: rect.y + run.top,
      capHeight: baseline - run.top + 1,
    };
  });

  return {
    x: rect.x + xRange.first,
    y: rect.y + yRange.first,
    width: xRange.last - xRange.first + 1,
    height: yRange.last - yRange.first + 1,
    lines,
  };
}

// ───────────────────────────────────────────────────────────────────────────────────────────
// The OPENING PROPOSAL: find the baked text before the user draws anything
// ───────────────────────────────────────────────────────────────────────────────────────────
//
// The erase above is the workhorse of the Import Graphic flow — measured, not argued
// (`scripts/import-suggest-audit.mjs`: it answers 9 of 10 designs, including panel-less
// artwork and artwork over footage, where the empty-panel detector answers none). But it only
// ever ran if a student thought to drag a box, so the strongest path in the flow was opt-in by
// accident. This scans the whole artwork and hands the Prepare step a rectangle already drawn
// around the words, which the student then drags, resizes, or accepts.
//
// No model call. That is not a preference: the audit measured the free path answering the
// designs the AI route was proposed for, so paying a model to point at text a row of
// arithmetic already finds would buy nothing.
//
// WHAT SEPARATES TYPE FROM ARTWORK: the count of horizontal STROKE EDGES on a row. A line of
// set text crosses dozens of them — every stem, bowl and serif is two — while the furniture a
// designer draws is made of solid shapes, and a solid shape contributes exactly two edges per
// row however large it is. A strap, an accent bar, a rounded chip, a hairline rule and a
// divider together give a row six or eight; "Alexandra Riva" alone gives forty. That gap is
// the whole detector, and it is what makes it refuse a CLEAN export (nothing baked in) instead
// of inventing a box on the panel.

/** How far two horizontally adjacent pixels must sit apart, per 8-bit channel with alpha
 *  included, to count as a stroke edge. The same order as INK_TOLERANCE — well above JPEG
 *  ringing and glyph antialiasing ramps, far below the contrast legible type must have. */
const EDGE_TOLERANCE = 40;

/** How many stroke edges one row must carry to read as a row OF TYPE. A row crossing four
 *  separate solid shapes carries eight, so the bar sits above that; a name or a title carries
 *  two per glyph stem and clears it several times over. Below this the scan says nothing. */
const MIN_ROW_EDGES = 12;

/** The edge count per row at which the scan is fully confident it is looking at type — about
 *  six glyphs' worth of stems. Confidence ramps linearly up to it and stops. */
const CONFIDENT_ROW_EDGES = 24;

/** How many blank rows may sit inside one line of type (a wide letter-spaced cap line can
 *  drop a row between its strokes) before the line is treated as ended. */
const ROW_GAP = 1;

/** How many rows tall a run must be to count as a line — the same argument MIN_LINE_ROWS
 *  makes for the ink measurement: below it, it is a rule or a clipped edge, not type. */
const MIN_TEXT_ROWS = 5;

/** How far apart two lines may sit, as a multiple of the taller one's height, and still be
 *  ONE marked region. A name over its title is the shape of every lower third, and it wants
 *  one box — the erase already measures the lines inside it and seeds a field per line. */
const BLOCK_GAP = 1.2;

/** A candidate wider than this fraction of the artwork, or taller than that one, is not
 *  baked-in text: it is a photograph, a texture, or a whole busy composition, and the honest
 *  answer there is to propose nothing. */
const MAX_BLOCK_WIDTH = 0.85;
const MAX_BLOCK_HEIGHT = 0.4;

/** The air left around the measured type, as a multiple of the tallest line's height — the
 *  loose lasso a person draws. It has to clear the glyphs' own antialiasing AND leave the
 *  ring's probes (SAMPLE_OFFSET beyond it) on real background. */
const PROPOSAL_PAD = 0.3;

/** Below this the scan proposes NOTHING and names the rule instead. A rectangle drawn around
 *  the wrong thing costs more than an empty canvas: the student has to notice it is wrong,
 *  work out why, and undo it, where an empty canvas only asks them to drag. */
const MIN_CONFIDENCE = 0.45;

/** The scan raster's pixel budget. 1920×1080 is under it and is measured untouched; a 4K or
 *  larger upload is scanned on a downscale and the answer mapped back, because type scales
 *  with the export and its stroke edges survive the reduction. */
const SCAN_MAX_PIXELS = 2_500_000;

/** A rectangle the scan believes holds baked-in text, in the artwork's SOURCE pixels. */
export interface EraseProposal {
  rect: EraseRect;
  /** 0–1: how sure the scan is that this is type rather than artwork. Never below
   *  MIN_CONFIDENCE — a weaker candidate is refused instead of shown. */
  confidence: number;
  /** How many lines of type the region holds — the ink measurement's count, so it is the
   *  number of fields accepting this rectangle would seed. */
  lines: number;
}

export interface EraseProposalResult {
  proposal: EraseProposal | null;
  /** Which rule refused, in the words the UI says out loud. Null when a rectangle is offered. */
  refusal: string | null;
}

/** The widest per-channel gap between a pixel and its right neighbour, alpha included. */
function edgeAt(px: Uint8ClampedArray, a: number, b: number): number {
  let d = 0;
  for (let c = 0; c < 4; c++) {
    const v = Math.abs(px[a + c] - px[b + c]);
    if (v > d) d = v;
  }
  return d;
}

/**
 * A stroke edge at `x` is a transition that SUSTAINS: the pixel differs from its neighbour
 * AND from the pixel past it. A real stem's side crosses into ink and stays there for the
 * stem's width (≥ 2px at any legible size), while compression ringing and upscaler halos
 * around a crisp boundary oscillate — one bright pixel, back to base — and a 1px spike fails
 * the second test. Without this, a re-encoded or AI-upscaled export counts dozens of phantom
 * edges along every rule and panel border, and the row profile reads furniture as type. At
 * the window's last usable column the second test has no pixel to read, so the first decides.
 */
function strokeEdgeAt(px: Uint8ClampedArray, at: number, hasNext2: boolean): boolean {
  if (edgeAt(px, at, at + 4) <= EDGE_TOLERANCE) return false;
  return !hasNext2 || edgeAt(px, at, at + 8) > EDGE_TOLERANCE;
}

/** Stroke edges per ROW inside the window, indexed from `y0`. */
function rowEdges(
  px: Uint8ClampedArray,
  imageWidth: number,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
): Int32Array {
  const out = new Int32Array(Math.max(0, y1 - y0));
  for (let y = y0; y < y1; y++) {
    let n = 0;
    let at = (y * imageWidth + x0) * 4;
    for (let x = x0; x < x1 - 1; x++, at += 4) if (strokeEdgeAt(px, at, x < x1 - 2)) n++;
    out[y - y0] = n;
  }
  return out;
}

/** Stroke edges per COLUMN inside the window, indexed from `x0`. */
function colEdges(
  px: Uint8ClampedArray,
  imageWidth: number,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
): Int32Array {
  const out = new Int32Array(Math.max(0, x1 - x0));
  for (let y = y0; y < y1; y++) {
    let at = (y * imageWidth + x0) * 4;
    for (let x = x0; x < x1 - 1; x++, at += 4) {
      if (strokeEdgeAt(px, at, x < x1 - 2)) out[x - x0]++;
    }
  }
  return out;
}

/** One unbroken run of text rows: a LINE. */
interface TextBand {
  top: number;
  height: number;
  /** Total stroke edges the band carries — its mass, used to rank candidates. */
  edges: number;
}

/** Split a row profile into the bands that read as lines of type. */
function bandsOf(counts: Int32Array, offset: number): TextBand[] {
  const bands: TextBand[] = [];
  let top = -1;
  let last = -1;
  let edges = 0;
  const close = () => {
    if (top !== -1 && last - top + 1 >= MIN_TEXT_ROWS) {
      bands.push({ top: offset + top, height: last - top + 1, edges });
    }
  };
  for (let i = 0; i < counts.length; i++) {
    if (counts[i] < MIN_ROW_EDGES) continue;
    if (top === -1 || i - last > ROW_GAP + 1) {
      close();
      top = i;
      edges = 0;
    }
    last = i;
    edges += counts[i];
  }
  close();
  return bands;
}

/** Group lines that sit close enough together to be one piece of baked text. */
function blocksOf(bands: TextBand[]): TextBand[][] {
  const blocks: TextBand[][] = [];
  let current: TextBand[] = [];
  for (const band of bands) {
    const previous = current[current.length - 1];
    if (previous) {
      const gap = band.top - (previous.top + previous.height);
      if (gap > Math.max(previous.height, band.height) * BLOCK_GAP) {
        blocks.push(current);
        current = [];
      }
    }
    current.push(band);
  }
  if (current.length) blocks.push(current);
  return blocks;
}

/** The widest contiguous span of columns carrying edges, allowing gaps up to `gap` (a word
 *  space). Returns the span with the most edge mass, which is what separates a line of text
 *  from unrelated furniture that happens to share its rows — a divider between two name
 *  zones, a rule running past the words. */
function widestSpan(counts: Int32Array, offset: number, gap: number): { x0: number; x1: number; mass: number } | null {
  let best: { x0: number; x1: number; mass: number } | null = null;
  let start = -1;
  let last = -1;
  let mass = 0;
  const close = () => {
    if (start === -1) return;
    if (!best || mass > best.mass) best = { x0: offset + start, x1: offset + last, mass };
  };
  for (let i = 0; i < counts.length; i++) {
    if (counts[i] === 0) continue;
    if (start === -1 || i - last > gap) {
      close();
      start = i;
      mass = 0;
    }
    last = i;
    mass += counts[i];
  }
  close();
  return best;
}

/**
 * Scan the whole artwork for baked-in text and propose the rectangle to erase.
 *
 * Deterministic and offline: the same file always gives the same rectangle. It is a PROPOSAL,
 * never an edit — nothing is filled until the user accepts it — and the Prepare step re-runs
 * it after every applied erase, so a design carrying a name, a title and a scoreline offers
 * them one at a time rather than guessing at all of them at once.
 */
export async function proposeEraseRect(dataUrl: string): Promise<EraseProposalResult> {
  const refuse = (refusal: string): EraseProposalResult => ({ proposal: null, refusal });

  let img: HTMLImageElement;
  try {
    img = await loadImage(dataUrl);
  } catch {
    return refuse('That artwork could not be read.');
  }
  const sourceW = img.naturalWidth;
  const sourceH = img.naturalHeight;
  const shrink = Math.min(1, Math.sqrt(SCAN_MAX_PIXELS / Math.max(1, sourceW * sourceH)));
  const w = Math.max(1, Math.round(sourceW * shrink));
  const h = Math.max(1, Math.round(sourceH * shrink));
  /** Source px per scan px — 1 for anything under the budget. */
  const k = sourceW / w;

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return refuse('That artwork could not be measured in this browser.');
  ctx.drawImage(img, 0, 0, w, h);
  let px: Uint8ClampedArray;
  try {
    px = ctx.getImageData(0, 0, w, h).data;
  } catch {
    // A tainted canvas. The artwork always arrives as a data URL today, so this is defensive.
    return refuse('That artwork could not be measured in this browser.');
  }

  const bands = bandsOf(rowEdges(px, w, 0, w, 0, h), 0);
  if (bands.length === 0) {
    return refuse(
      'No row of this artwork carries the dense stroke edges set type makes, so nothing here reads as baked-in text.',
    );
  }

  // The strongest piece of text on the artwork. A second one is not guessed at now: accepting
  // this rectangle re-runs the scan against the cleaned artwork, which offers the next.
  const blocks = blocksOf(bands);
  const block = blocks.reduce((best, b) =>
    b.reduce((n, x) => n + x.edges, 0) > best.reduce((n, x) => n + x.edges, 0) ? b : best,
  );
  const blockTop = block[0].top;
  const blockBottom = block[block.length - 1].top + block[block.length - 1].height;
  const lineHeight = Math.max(...block.map((b) => b.height));

  // Which COLUMNS of those rows are the text. Taking the first and last edge on each row
  // instead would stretch the box across anything sharing the line — the divider on a
  // two-person strap sits 200 px past the name and would be swallowed with it.
  const span = widestSpan(colEdges(px, w, 0, w, blockTop, blockBottom), 0, Math.max(8, Math.round(lineHeight * 0.6)));
  if (!span) return refuse('The rows that looked like text carry no columns of ink.');

  // Re-read the rows through that column span alone: a row that only qualified because of
  // furniture beside the words drops out here, which is what keeps the box on the text.
  const trimmed = bandsOf(rowEdges(px, w, span.x0, span.x1 + 1, blockTop, blockBottom), blockTop);
  if (trimmed.length === 0) {
    return refuse('The columns that looked like text hold no row dense enough to be a line.');
  }
  const top = trimmed[0].top;
  const bottom = trimmed[trimmed.length - 1].top + trimmed[trimmed.length - 1].height;
  const blockW = span.x1 - span.x0 + 1;
  const blockH = bottom - top;

  if (blockW > w * MAX_BLOCK_WIDTH || blockH > h * MAX_BLOCK_HEIGHT) {
    return refuse(
      'The busy area covers most of the artwork, which reads as a photograph or a texture rather than baked-in text.',
    );
  }

  const pad = Math.max(4, Math.round(Math.max(...trimmed.map((b) => b.height)) * PROPOSAL_PAD));
  const x0 = Math.max(0, span.x0 - pad);
  const y0 = Math.max(0, top - pad);
  const scan: EraseRect = {
    x: x0,
    y: y0,
    width: Math.min(w, span.x1 + 1 + pad) - x0,
    height: Math.min(h, bottom + pad) - y0,
  };

  // Cross-check against the OTHER measurement in this file — the ink the erase itself would
  // remove, read against the background the ring samples. Two independent readings of the
  // same pixels: one counts stroke edges, one counts occupancy. A candidate the ink cannot
  // see at all is not a candidate, and a disagreement about how many lines are there is worth
  // paying for in confidence rather than hiding.
  const scanFill = sampleRing(px, w, h, scan).fill;
  const scanBg: [number, number, number, number] = [scanFill.r, scanFill.g, scanFill.b, scanFill.a];
  const ink = measureInk(px, w, scan, () => scanBg);
  if (!ink) {
    return refuse('That region measured no ink against its own background — there is nothing there to erase.');
  }

  const edgeMean = trimmed.reduce((n, b) => n + b.edges, 0) / Math.max(1, blockH);
  const density = Math.min(1, edgeMean / CONFIDENT_ROW_EDGES);
  const aspect = blockW / Math.max(1, blockH);
  // Set text is wider than it is tall — one line always, a stacked pair usually. A candidate
  // that is not is more likely a logo, an icon or a chart than a name.
  const shape = aspect >= 1.5 ? 1 : aspect >= 1 ? 0.7 : 0.4;
  const agree = ink.lines.length === trimmed.length ? 1 : 0.75;
  const confidence = Math.round(density * shape * agree * 100) / 100;
  if (confidence < MIN_CONFIDENCE) {
    return refuse(
      `The clearest candidate scored ${confidence.toFixed(2)} against a ${MIN_CONFIDENCE} bar ` +
        `(${Math.round(edgeMean)} stroke edges per row across ${Math.round(blockW * k)}×${Math.round(blockH * k)} px), ` +
        'which is too close to ordinary artwork to draw a box for you.',
    );
  }

  // Back to the file's own pixels, rounded OUTWARD: a proposal that is a pixel tight leaves a
  // rim of the old glyphs behind, while a pixel loose costs nothing.
  const rect: EraseRect = {
    x: Math.max(0, Math.floor(scan.x * k)),
    y: Math.max(0, Math.floor(scan.y * k)),
    width: 0,
    height: 0,
  };
  rect.width = Math.min(sourceW, Math.ceil((scan.x + scan.width) * k)) - rect.x;
  rect.height = Math.min(sourceH, Math.ceil((scan.y + scan.height) * k)) - rect.y;

  return { proposal: { rect, confidence, lines: ink.lines.length }, refusal: null };
}
