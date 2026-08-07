// WHAT AN UPLOADED PICTURE COSTS, and what to do about it at the door.
//
// An image lands in `template.assets` as a base64 data URL, and that is three multipliers deep
// before anything is saved (docs/SAVED_CONTENT_MODEL.md, model/storageHealth.ts): base64 is
// +33%, localStorage stores UTF-16 so every character costs two bytes, and a saved graphic keeps
// a second copy of its template as the Reset baseline. A phone photograph dropped onto a logo
// slot therefore costs several megabytes of a five-megabyte quota, and the library fills after
// roughly ten graphics.
//
// This module is the cheapest of the fixes and the only one a user never has to know about: an
// image is DECODED at import and, if it is bigger than the frame it will be drawn in, re-encoded
// at a sane size. The rules are deliberately conservative, because the alternative to a slightly
// heavier file is a graphic that looks wrong on air:
//
//   * SVG is never touched. It is vector, it is already small, and rasterising it would be a
//     downgrade in every direction.
//   * The longest edge is capped at the FRAME's own long edge (1920). Nothing drawn on a
//     1920x1080 canvas can use more pixels than that, so this cannot cost visible quality.
//   * The format never changes. A PNG stays a PNG (alpha survives) and a JPEG stays a JPEG, so
//     the asset's path, its extension and every reference to it are exactly what they were.
//   * The result is used ONLY IF IT IS SMALLER. Re-encoding can grow a file - a heavily
//     optimised PNG re-encoded by a browser canvas usually does - and an import that made a
//     picture bigger would be a bug wearing an optimisation's clothes.

import { fileToDataUrl, isDataUrl, parseDataUrl } from './assetUtils';

/** The default frame's long edge. An image larger than the frame it is drawn in has nowhere to
 *  put the pixels — so the cap FOLLOWS the graphic's own resolution wherever the caller knows
 *  it (a 4K project keeps 4K images), and falls back to 1920 where it does not: a logo slot on
 *  a 1080 frame is the overwhelming case, and it is the one that fills a browser quota. */
export const MAX_IMAGE_EDGE = 1920;

/** JPEG quality for a re-encode. 0.85 is the usual "no visible difference" line, and this only
 *  ever applies to an image that was already a JPEG. */
const JPEG_QUALITY = 0.85;

/** What an import did, in the words a surface can show. `null` = nothing worth saying. */
export interface ImageImportNote {
  fromBytes: number;
  toBytes: number;
  fromEdge: number;
  toEdge: number;
}

export interface ImportedImage {
  data: string;
  note: ImageImportNote | null;
}

const approxBytes = (dataUrl: string): number => {
  const parsed = parseDataUrl(dataUrl);
  // base64 carries 3 bytes per 4 characters; padding is close enough for a size REPORT.
  return parsed ? Math.round((parsed.base64.length * 3) / 4) : dataUrl.length;
};

function decode(dataUrl: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    // A file the browser cannot decode is not an error here: it is simply not resizable, and
    // the original bytes go through untouched exactly as they did before this existed.
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

/**
 * Read an image File for storage in `template.assets`, shrinking it when it is larger than the
 * frame. Falls back to the original bytes on any doubt - an unknown type, a failed decode, a
 * canvas that produced nothing, or a result that came out bigger.
 */
export async function importImageFile(file: File, maxEdge = MAX_IMAGE_EDGE): Promise<ImportedImage> {
  const original = await fileToDataUrl(file);
  return shrinkImageDataUrl(original, maxEdge);
}

/** The same rules applied to a data URL that is already in hand (a paste, a drop, a re-import). */
export async function shrinkImageDataUrl(dataUrl: string, maxEdge = MAX_IMAGE_EDGE): Promise<ImportedImage> {
  const parsed = isDataUrl(dataUrl) ? parseDataUrl(dataUrl) : null;
  const mime = parsed?.mime ?? '';
  // SVG keeps its own counsel; anything that is not a raster type we can re-encode is left
  // alone rather than guessed at.
  if (mime !== 'image/png' && mime !== 'image/jpeg') return { data: dataUrl, note: null };

  const img = await decode(dataUrl);
  if (!img || !img.naturalWidth || !img.naturalHeight) return { data: dataUrl, note: null };
  const longest = Math.max(img.naturalWidth, img.naturalHeight);
  if (longest <= maxEdge) return { data: dataUrl, note: null };

  const scale = maxEdge / longest;
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return { data: dataUrl, note: null };
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, width, height);

  let next: string;
  try {
    next = canvas.toDataURL(mime, mime === 'image/jpeg' ? JPEG_QUALITY : undefined);
  } catch {
    return { data: dataUrl, note: null };
  }
  const before = approxBytes(dataUrl);
  const after = approxBytes(next);
  // NEVER GROW. A browser canvas re-encode of an already-optimised PNG regularly comes out
  // larger, and "import made it bigger" is the one outcome this must not have.
  if (!isDataUrl(next) || after >= before) return { data: dataUrl, note: null };
  return {
    data: next,
    note: { fromBytes: before, toBytes: after, fromEdge: longest, toEdge: Math.max(width, height) },
  };
}

/** The note in the words a panel shows: "3.4 MB → 480 KB (4000px → 1920px)". */
export function describeImageImport(note: ImageImportNote): string {
  const kb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`);
  return `${kb(note.fromBytes)} → ${kb(note.toBytes)} (${note.fromEdge}px → ${note.toEdge}px)`;
}
