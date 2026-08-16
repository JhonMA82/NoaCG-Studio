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
  /** The fill that was applied: the per-channel mean of the surviving edge samples. */
  fill: { r: number; g: number; b: number; a: number };
  /** Worst per-channel spread across the samples, alpha included (0–255). */
  maxDeviation: number;
  /** True when the background counts as flat: samples within FLAT_BG_TOLERANCE. */
  uniform: boolean;
  /** Ring points that actually landed on the image (a rect at the edge loses some). */
  sampleCount: number;
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
  const lo = [255, 255, 255, 255];
  const hi = [0, 0, 0, 0];
  const sum = [0, 0, 0, 0];
  let sampleCount = 0;
  for (const p of ringPoints(rect)) {
    if (p.x < 0 || p.y < 0 || p.x >= imageWidth || p.y >= imageHeight) continue;
    const at = (p.y * imageWidth + p.x) * 4;
    for (let c = 0; c < 4; c++) {
      const v = px[at + c];
      if (v < lo[c]) lo[c] = v;
      if (v > hi[c]) hi[c] = v;
      sum[c] += v;
    }
    sampleCount++;
  }
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

/**
 * Flat-fill the rectangle with the background sampled around it. Always returns the filled
 * result, even when the samples disagree — "continue anyway" applies exactly what the
 * warning preview showed. Deterministic: same input + rect ⇒ the same output bytes.
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

  const sampling = sampleRing(px, w, h, clamped);
  const fill = sampling.fill;

  // Measure the ink BEFORE the fill removes it (see RegionInk).
  const ink = measureInk(px, w, clamped, fill);

  // Fill by mutating the pixel data directly: fillRect would COMPOSITE a semi-transparent
  // fill over the text underneath, leaving it ghosted through — writing the bytes replaces it.
  for (let y = clamped.y; y < clamped.y + clamped.height; y++) {
    let at = (y * w + clamped.x) * 4;
    for (let x = 0; x < clamped.width; x++, at += 4) {
      px[at] = fill.r;
      px[at + 1] = fill.g;
      px[at + 2] = fill.b;
      px[at + 3] = fill.a;
    }
  }
  ctx.putImageData(image, 0, 0);

  return { dataUrl: canvas.toDataURL('image/png'), sampling, ink };
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
  fill: { r: number; g: number; b: number; a: number },
): RegionInk | null {
  const bg = [fill.r, fill.g, fill.b, fill.a];
  const rows = new Array<number>(rect.height).fill(0);
  const cols = new Array<number>(rect.width).fill(0);
  for (let ry = 0; ry < rect.height; ry++) {
    let at = ((rect.y + ry) * imageWidth + rect.x) * 4;
    for (let rx = 0; rx < rect.width; rx++, at += 4) {
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
    for (let x = x0; x < x1 - 1; x++, at += 4) if (edgeAt(px, at, at + 4) > EDGE_TOLERANCE) n++;
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
      if (edgeAt(px, at, at + 4) > EDGE_TOLERANCE) out[x - x0]++;
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
  const ink = measureInk(px, w, scan, sampleRing(px, w, h, scan).fill);
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
