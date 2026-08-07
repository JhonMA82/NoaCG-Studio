// What is actually IN browser storage, measured — so a "storage is full" message can name the
// things worth removing instead of asking the user to guess.
//
// Everything durable in an offline build lives in the DURABLE STORE (model/durableStore.ts):
// the graphics library, the productions, the video projects, the working slots, the looks. A
// template rides its assets as data URLs and a library record additionally carries its BASELINE
// (a second copy of the same template), so a handful of image-heavy graphics used to exhaust a
// ~5 MB localStorage quota in one evening. That is the failure the acceptance pass hit, and it
// silently blocked every save.
//
// THE FOUR MULTIPLIERS, since this is where they are written down: an uploaded image is base64
// (+33%), a stored string costs two bytes per character (×2), a library record keeps the Reset
// baseline (×2), and the template's own HTML/CSS/JS is only 30–60 KB of any of it. Two are now
// closed: an image larger than the frame is shrunk AT IMPORT (`assets/imageImport.ts`), so a
// 4000px press-kit crest no longer arrives at full size, and the documents moved OFF
// localStorage into IndexedDB — the same layer (the browser, offline, no account), with a quota
// in gigabytes instead of megabytes, which is what makes the remaining two multipliers a matter
// of tidiness rather than a wall. The numbers below therefore stay useful for naming what is
// big; `storageEstimate()` (durableStore.ts) is what says how much room is actually left.
//
// This module only READS. Nothing here deletes anything — the dialog it feeds names candidates
// and the user removes them through the surfaces that already own deletion (Home's library rows,
// the saved-videos modal, a production's own page).

import { DURABLE_KEYS, durable } from './durableStore';

const GRAPHICS_KEY = 'spx-gfx-graphics';
const SHOWS_KEY = 'spx-gfx-shows';
const VIDEO_SAVED_KEY = 'spx-gfx-video-saved';
const VIDEO_CURRENT_KEY = 'spx-gfx-video-project';
const PROJECT_KEY = 'spx-gfx-project';
const PACKETS_KEY = 'spx-gfx-packets';

/** One named thing the user could remove, with what it costs. */
export interface StorageItem {
  /** 'graphic' | 'production' | 'video' — which surface deletes it. */
  kind: 'graphic' | 'production' | 'video';
  name: string;
  bytes: number;
}

export interface StorageReport {
  /** Total bytes held under every `spx-gfx-*` key. */
  totalBytes: number;
  /** Per-area totals, largest first, for the areas a user can act on. */
  areas: { label: string; bytes: number }[];
  /** The individual records worth removing, largest first. */
  items: StorageItem[];
}

/** A stored string costs two bytes per UTF-16 code unit; the key is stored too. */
function entryBytes(key: string, value: string): number {
  return (key.length + value.length) * 2;
}

function readRaw(key: string): string {
  try {
    return durable.getItem(key) ?? '';
  } catch {
    return '';
  }
}

/** Bytes of one record, measured the way it is actually stored (its own JSON, inside the list). */
function recordBytes(record: unknown): number {
  try {
    return JSON.stringify(record).length * 2;
  } catch {
    return 0;
  }
}

/** Records the storage report can name. Deliberately structural — this module never imports the
 *  model types, so a shape change there can never make a diagnostic throw. */
type NamedRecord = { name?: unknown; deleted?: unknown };

function namedItems(raw: string, kind: StorageItem['kind']): StorageItem[] {
  if (!raw) return [];
  try {
    const list = JSON.parse(raw) as NamedRecord[];
    if (!Array.isArray(list)) return [];
    return list
      .filter((r) => r && !r.deleted)
      .map((r) => ({
        kind,
        name: typeof r.name === 'string' && r.name.trim() ? r.name : 'Untitled',
        bytes: recordBytes(r),
      }));
  } catch {
    return [];
  }
}

/**
 * Measure what is stored right now — the durable documents plus the small `spx-gfx-*`
 * preferences still kept in localStorage, so the total is what this profile actually costs.
 * Safe to call from a render: it reads a handful of keys and parses them.
 */
export function measureStorage(): StorageReport {
  let totalBytes = 0;
  for (const key of DURABLE_KEYS) {
    totalBytes += entryBytes(key, readRaw(key));
  }
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith('spx-gfx-')) continue;
      // A durable key still IN localStorage is the degraded fallback (no IndexedDB here), and
      // the loop above already counted it — counting it twice would overstate every total.
      if ((DURABLE_KEYS as readonly string[]).includes(key)) continue;
      totalBytes += entryBytes(key, localStorage.getItem(key) ?? '');
    }
  } catch {
    // A locked-down browser (storage disabled) reports nothing rather than throwing.
  }

  const graphicsRaw = readRaw(GRAPHICS_KEY);
  const showsRaw = readRaw(SHOWS_KEY);
  const videoSavedRaw = readRaw(VIDEO_SAVED_KEY);

  const areas = [
    { label: 'Saved graphics', bytes: entryBytes(GRAPHICS_KEY, graphicsRaw) },
    { label: 'Productions', bytes: entryBytes(SHOWS_KEY, showsRaw) },
    { label: 'Saved videos', bytes: entryBytes(VIDEO_SAVED_KEY, videoSavedRaw) },
    {
      label: 'The graphic and video you have open',
      bytes:
        entryBytes(PROJECT_KEY, readRaw(PROJECT_KEY)) +
        entryBytes(VIDEO_CURRENT_KEY, readRaw(VIDEO_CURRENT_KEY)),
    },
    { label: 'Retired packages', bytes: entryBytes(PACKETS_KEY, readRaw(PACKETS_KEY)) },
  ]
    .filter((a) => a.bytes > 0)
    .sort((a, b) => b.bytes - a.bytes);

  const items = [
    ...namedItems(graphicsRaw, 'graphic'),
    ...namedItems(showsRaw, 'production'),
    ...namedItems(videoSavedRaw, 'video'),
  ].sort((a, b) => b.bytes - a.bytes);

  return { totalBytes, areas, items };
}

/** Human bytes, one decimal past a megabyte so two candidates never read as the same size. It
 *  reaches GB because it now also formats the BROWSER'S QUOTA, which on a desktop profile is
 *  measured in gigabytes - "2812.6 MB" is a number nobody reads as "plenty of room". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
