// Deterministic field suggestion for imported artwork (the Import Graphic wizard's Text
// step, docs/IMPORT_MVP.md). A student exports an EMPTY backplate — a strap, a card, a
// lower-third panel with nothing written on it — and then has to guess where the text
// belongs. This finds the empty area for them.
//
// No model call, no network, no cost: the panel a designer drew for text is by construction
// the largest run of ONE flat colour in the artwork, so finding it is arithmetic. Same input
// always gives the same fields, which is what lets this run automatically the moment the
// artwork lands rather than behind a button somebody has to trust.
//
// It reports honestly when it finds nothing convincing (a photo, a busy collage, artwork
// whose text is already baked in): the caller falls back to manual placement, which is the
// flow that has always worked. This never erases, moves, or repaints a single pixel — the
// artwork is the user's, and a suggestion is a position, not an edit.
//
// Everything returned is in DESIGN pixels (the fitted artwork space the wizard places in),
// never the file's own resolution: the caller places fields, and placement is design-space.

/** One proposed field: where it goes, how big, and what to call it. */
export interface FieldSuggestion {
  title: string;
  text: string;
  /** Design px, the field's anchor (left edge, text top). */
  x: number;
  y: number;
  fontSize: number;
  /** Contrasts the plate it sits on. */
  color: string;
  weight: number;
}

export interface SuggestResult {
  fields: FieldSuggestion[];
  /** The flat area the fields were placed in, design px — null when none was found. */
  plate: { x: number; y: number; width: number; height: number } | null;
  /** Why there is nothing to offer, for the UI to say out loud. Null on success. */
  refusal: string | null;
}

/** Per-channel distance at which two pixels stop counting as the same flat colour. Wider
 *  than the erase tolerance on purpose: a designed panel often carries a gentle gradient or
 *  a noise overlay, and refusing those would refuse most real artwork. */
const FLAT_TOLERANCE = 24;

/** The analysis raster's width. The plate search is O(pixels) and runs on every artwork
 *  drop, so it works on a downscale and maps the answer back — a panel edge is never one
 *  pixel wide, so nothing that matters survives only at full resolution. */
const PROBE_WIDTH = 320;

/** A plate smaller than this (fraction of the frame) is furniture — a badge, a rule, a
 *  corner tab — not somewhere text was meant to go. */
const MIN_PLATE_WIDTH = 0.18;
const MIN_PLATE_HEIGHT = 0.05;

interface Raster {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('That file could not be read as an image.'));
    img.src = dataUrl;
  });
}

function rasterize(img: HTMLImageElement): Raster | null {
  const scale = Math.min(1, PROBE_WIDTH / Math.max(1, img.naturalWidth));
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, width, height);
  try {
    return { data: ctx.getImageData(0, 0, width, height).data, width, height };
  } catch {
    // A tainted canvas (a cross-origin source) cannot be read. The artwork always arrives as
    // a data URL today, so this is defensive rather than expected.
    return null;
  }
}

/** The most common OPAQUE colours, quantised into 32-per-channel buckets and returned in
 *  descending mass. Several, not one: on a transparent strap the biggest colour IS the panel,
 *  but on a full-frame card it is the BACKDROP the panel sits on, and a design's words go on
 *  the panel. Which candidate is which is decided by where its rectangle lands, below. */
function dominantColors(r: Raster, limit = 5): Array<{ r: number; g: number; b: number }> {
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
  let opaque = 0;
  for (let i = 0; i < r.data.length; i += 4) {
    if (r.data[i + 3] < 200) continue; // translucent edges and the empty frame around a strap
    opaque += 1;
    const key = ((r.data[i] >> 5) << 10) | ((r.data[i + 1] >> 5) << 5) | (r.data[i + 2] >> 5);
    const slot = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    slot.n += 1;
    slot.r += r.data[i];
    slot.g += r.data[i + 1];
    slot.b += r.data[i + 2];
    buckets.set(key, slot);
  }
  // A candidate has to be a real surface: at least a fiftieth of the opaque artwork. Below
  // that it is a rule, a chip or an antialiasing halo, and its "panel" would be furniture.
  const floor = Math.max(16, opaque / 50);
  return [...buckets.values()]
    .filter((slot) => slot.n >= floor)
    .sort((a, b) => b.n - a.n)
    .slice(0, limit)
    .map((slot) => ({
      r: Math.round(slot.r / slot.n),
      g: Math.round(slot.g / slot.n),
      b: Math.round(slot.b / slot.n),
    }));
}

/** Largest all-true axis-aligned rectangle in a binary mask (the classic histogram walk,
 *  O(width × height)). The mask is "this pixel is the plate colour", so the answer is the
 *  biggest unbroken run of panel — which is exactly the room the design left for text. */
function largestRect(mask: Uint8Array, width: number, height: number) {
  const heights = new Int32Array(width);
  let best = { x: 0, y: 0, width: 0, height: 0, area: 0 };
  const stack: number[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) heights[x] = mask[y * width + x] ? heights[x] + 1 : 0;
    stack.length = 0;
    for (let x = 0; x <= width; x++) {
      const h = x === width ? 0 : heights[x];
      while (stack.length && heights[stack[stack.length - 1]] >= h) {
        const top = stack.pop()!;
        const barHeight = heights[top];
        const left = stack.length ? stack[stack.length - 1] + 1 : 0;
        const area = barHeight * (x - left);
        if (area > best.area) best = { x: left, y: y - barHeight + 1, width: x - left, height: barHeight, area };
      }
      stack.push(x);
    }
  }
  return best;
}

/** White or near-black, whichever reads better on the plate (WCAG relative luminance). */
function contrastColor(rgb: { r: number; g: number; b: number }): string {
  const chan = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * chan(rgb.r) + 0.7152 * chan(rgb.g) + 0.0722 * chan(rgb.b);
  return luminance > 0.45 ? '#101216' : '#ffffff';
}

/**
 * Propose text fields for artwork, in DESIGN pixels. `designWidth`/`designHeight` are the
 * fitted size the wizard places in; the analysis itself runs on the file's own pixels and
 * the answer is mapped back, so a 2× export proposes the same fields a 1× one does.
 */
export async function suggestFieldsForArtwork(
  dataUrl: string,
  designWidth: number,
  designHeight: number,
): Promise<SuggestResult> {
  const none = (refusal: string): SuggestResult => ({ fields: [], plate: null, refusal });
  let raster: Raster | null;
  try {
    raster = rasterize(await loadImage(dataUrl));
  } catch {
    return none('That artwork could not be read.');
  }
  if (!raster) return none('That artwork could not be measured in this browser.');

  const candidates = dominantColors(raster);
  if (candidates.length === 0) return none('No panel colour stood out in this artwork.');

  // Measure EVERY candidate surface, then choose. A rectangle that reaches three or four
  // frame edges is the backdrop the design sits on, not the place its words go - full-frame
  // artwork (a title card, a strap composited over footage) is exactly the case where the
  // biggest flat area is the thing to ignore. A backdrop is taken only when nothing else
  // qualifies, because on a transparent strap the panel legitimately touches nothing.
  const EDGE = 2; // px of slack: an exported panel rarely lands on the exact pixel column
  type Candidate = { rect: ReturnType<typeof largestRect>; color: { r: number; g: number; b: number } };
  let chosen: Candidate | null = null;
  let fallback: Candidate | null = null;
  for (const color of candidates) {
    // The tolerance is generous so a gently graded or noised panel still reads as one
    // surface - but it must never be so generous that two candidates absorb each other. A
    // dark panel on a dark backdrop is the common case (a title card, a strap over graded
    // footage) and they sit well inside 24 counts of each other, so the widest tolerance
    // claimed the whole frame for whichever it measured first. Half the distance to the
    // nearest other candidate is the widest value that cannot do that.
    const nearest = candidates.reduce((best, other) => {
      if (other === color) return best;
      const d = Math.max(
        Math.abs(other.r - color.r),
        Math.abs(other.g - color.g),
        Math.abs(other.b - color.b),
      );
      return Math.min(best, d);
    }, Number.POSITIVE_INFINITY);
    const tol = Math.min(FLAT_TOLERANCE, Math.max(4, Math.floor(nearest / 2)));
    const mask = new Uint8Array(raster.width * raster.height);
    for (let i = 0, p = 0; i < raster.data.length; i += 4, p++) {
      if (raster.data[i + 3] < 200) continue;
      mask[p] =
        Math.abs(raster.data[i] - color.r) <= tol &&
        Math.abs(raster.data[i + 1] - color.g) <= tol &&
        Math.abs(raster.data[i + 2] - color.b) <= tol
          ? 1
          : 0;
    }
    const rect = largestRect(mask, raster.width, raster.height);
    if (rect.width < raster.width * MIN_PLATE_WIDTH || rect.height < raster.height * MIN_PLATE_HEIGHT) {
      continue;
    }
    const edges =
      (rect.x <= EDGE ? 1 : 0) +
      (rect.y <= EDGE ? 1 : 0) +
      (rect.x + rect.width >= raster.width - EDGE ? 1 : 0) +
      (rect.y + rect.height >= raster.height - EDGE ? 1 : 0);
    const entry = { rect, color };
    if (edges >= 3) {
      if (!fallback || rect.area > fallback.rect.area) fallback = entry;
    } else if (!chosen || rect.area > chosen.rect.area) {
      chosen = entry;
    }
  }
  const picked = chosen ?? fallback;
  if (!picked) {
    return none('No clear empty panel was found — place the fields where you want them.');
  }
  const { rect, color: plateColor } = picked;

  // Back to design px. Rounding out would push a field over the panel's edge, so the plate
  // is rounded IN: every suggestion has to sit inside room that really is empty.
  const sx = designWidth / raster.width;
  const sy = designHeight / raster.height;
  const plate = {
    x: Math.ceil(rect.x * sx),
    y: Math.ceil(rect.y * sy),
    width: Math.floor(rect.width * sx),
    height: Math.floor(rect.height * sy),
  };

  // The layout: a text panel is read from its top-left with a margin, and its two lines are
  // a NAME and a smaller TITLE — the lower-third convention every broadcaster shares, and
  // the same two words the erase seeds and the manual tool already use. A short panel holds
  // one line; there is no third line, because a third guess is a guess too many.
  // The lines are laid out as LINE BOXES, not as font sizes: a placed field's `y` is the top
  // of its rendered box and a text line paints about 1.22× its font-size tall, so sizing the
  // font first and spacing by a fraction of the plate is what makes two lines overlap by a
  // few pixels — which is exactly what a suggestion must never do. Divide the room, then
  // derive each size from the room it got.
  const color = contrastColor(plateColor);
  const inset = Math.max(8, Math.min(Math.round(plate.height * 0.14), Math.round(plate.width * 0.06)));
  const left = plate.x + inset;
  const top = plate.y + inset;
  const contentHeight = plate.height - inset * 2;
  const LINE_BOX = 1.22;
  const twoLines = plate.height >= designHeight * 0.09;

  if (!twoLines) {
    return {
      fields: [
        {
          title: 'Name',
          text: 'Alexandra Riva',
          x: left,
          y: top,
          fontSize: Math.max(10, Math.round(contentHeight / LINE_BOX)),
          color,
          weight: 700,
        },
      ],
      plate,
      refusal: null,
    };
  }

  const nameBox = Math.round(contentHeight * 0.56);
  const gap = Math.round(contentHeight * 0.06);
  const titleBox = contentHeight - nameBox - gap;
  return {
    fields: [
      {
        title: 'Name',
        text: 'Alexandra Riva',
        x: left,
        y: top,
        fontSize: Math.max(10, Math.round(nameBox / LINE_BOX)),
        color,
        weight: 700,
      },
      {
        title: 'Title',
        text: 'Correspondent',
        x: left,
        y: top + nameBox + gap,
        fontSize: Math.max(9, Math.round(titleBox / LINE_BOX)),
        color,
        weight: 500,
      },
    ],
    plate,
    refusal: null,
  };
}
