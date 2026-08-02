// The SHOW data layer (Phase 5). A show is the rundown-level unit: an ORDERED set of
// graphics that run together on air (bug + lower third + ticker), each keeping its own
// state machine. Its control page aggregates every graphic's controls — the single-graphic
// case is just a show of one. Shows reuse the packet manager's storage conventions
// (localStorage, updatedAt for LWW sync, soft-delete tombstones) so the cloud sync engine
// can adopt the kind without a second pattern.

import type { SpxTemplate } from './types';
import type { SavedGraphic } from './packets';
import { uuid } from './id';

/**
 * One prepared, orderable data row of a production — "what airs next", not a graphic.
 * Cues are data rows OVER the graphic pool (`Show.graphics`): many cues may point at the
 * same pool graphic (`sourceId`), which is how one lower third airs Anna at cue 2 and Ben
 * at cue 7 without a second copy of the template (docs/CLOUD_PLAYOUT.md §2).
 */
export interface ShowCue {
  id: string;
  /** The pool entry this cue drives (SavedGraphic.id). */
  sourceId: string;
  /** The operator-facing name — "Anna Andersson — Presenter". */
  label: string;
  /** fieldId -> value, the cue's prepared data. A cue OWNS its values (an entry is only a
   *  starting point — editing a cue never writes back to a ControlEntry). */
  values: Record<string, string>;
  /** Operator note shown in the rundown. */
  note?: string;
}

export interface Show {
  id: string;
  name: string;
  /** The graphic POOL, in layer order — which templates the production can air, each once. */
  graphics: SavedGraphic[];
  /** The cue rundown, in playout order (docs/CLOUD_PLAYOUT.md). ADDITIVE OPTIONAL — an older
   *  build reads and rewrites the record untouched; absent = no cues authored. */
  cues?: ShowCue[];
  /** The hosted control page's capability slug, once published (control/hostedControl.ts).
   *  Kept on the record so the URL survives reloads and the show export can bake the hosted
   *  receiver into its graphics. Rotating/unpublishing clears it. */
  hostedSlug?: string;
  /** The browser-output URL's capability slug, once published (docs/CLOUD_PLAYOUT.md §3).
   *  ADDITIVE OPTIONAL, stripped from conflict copies exactly like hostedSlug. */
  outputSlug?: string;
  /** When the hosted pages were last published (ISO). The output payload is PINNED at publish,
   *  so updatedAt > publishedAt means the renderer and operators run an older snapshot — the
   *  production page's "changes not yet published" hint reads exactly this. */
  publishedAt?: string;
  /** When the show last changed (ISO). Bumped on every mutation; drives cloud sync (LWW). */
  updatedAt: string;
  /** Soft-delete tombstone (hidden from the UI, kept so the delete syncs). See Packet.deleted. */
  deleted?: boolean;
}

const SHOWS_KEY = 'spx-gfx-shows';

const nowIso = () => new Date().toISOString();

/** See packets.ts BACKFILL_TS — a stable old timestamp for records saved before updatedAt. */
const BACKFILL_TS = '1970-01-01T00:00:00.000Z';

function notifyDataChanged(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('spx-data-changed'));
  }
}

function saveAll(list: Show[]): string | null {
  try {
    localStorage.setItem(SHOWS_KEY, JSON.stringify(list));
    notifyDataChanged();
    return null;
  } catch {
    return 'Browser storage is full — remove a graphic from the show or delete an old show.';
  }
}

/** All shows INCLUDING tombstones — for the sync engine. Back-fills a stable sync timestamp. */
export function loadAllShows(): Show[] {
  try {
    const list = JSON.parse(localStorage.getItem(SHOWS_KEY) ?? '[]') as Show[];
    return list.map((s) => (s.updatedAt ? s : { ...s, updatedAt: BACKFILL_TS }));
  } catch {
    return [];
  }
}

/** Live shows for the UI (tombstones hidden). */
export function loadShows(): Show[] {
  return loadAllShows().filter((s) => !s.deleted);
}

export function createShow(name: string): Show[] {
  const all = loadAllShows();
  all.push({ id: uuid(), name: name.trim() || 'Untitled show', graphics: [], updatedAt: nowIso() });
  saveAll(all);
  return all.filter((s) => !s.deleted);
}

/** Insert or replace a whole show by id (the storage seam's put('show'), incl. tombstones). */
export function upsertShow(show: Show): void {
  const all = loadAllShows();
  const i = all.findIndex((s) => s.id === show.id);
  if (i >= 0) all[i] = show;
  else all.push(show);
  saveAll(all);
}

/**
 * Add the current graphic to a show. Same rule as packets: a graphic with the same NAME is
 * replaced in place (adding twice = updating it, keeping its rundown position); a new name
 * appends at the end of the rundown.
 */
export function addGraphicToShow(
  showId: string,
  template: SpxTemplate,
  opts?: { graphicId?: string | null },
): { shows: Show[]; error: string | null } {
  const all = loadAllShows();
  const show = all.find((s) => s.id === showId && !s.deleted);
  if (!show) return { shows: all.filter((s) => !s.deleted), error: 'That show no longer exists.' };
  const existing = show.graphics.findIndex((g) => g.name === template.name);
  const graphic: SavedGraphic = {
    // Replacing by name KEEPS the pool entry's id — cues reference it (ShowCue.sourceId), so
    // updating a graphic must never orphan the cues prepared against it.
    id: existing >= 0 ? show.graphics[existing].id : uuid(),
    name: template.name,
    type: template.type,
    savedAt: nowIso(),
    template,
    // Which LIBRARY record this copy came from, when the document was a saved graphic - the
    // link the hosted control page follows to publish that graphic's entries.
    ...(opts?.graphicId ? { graphicId: opts.graphicId } : {}),
  };
  if (existing >= 0) show.graphics[existing] = graphic;
  else {
    show.graphics.push(graphic);
    // A new pool graphic starts with one cue seeded from its field defaults, so the cue
    // rundown is never empty-but-working (docs/CLOUD_PLAYOUT.md §2).
    show.cues = [
      ...(show.cues ?? []),
      { id: uuid(), sourceId: graphic.id, label: template.name, values: seedValues(template.fields) },
    ];
  }
  show.updatedAt = nowIso();
  return { shows: all.filter((s) => !s.deleted), error: saveAll(all) };
}

export function removeShowGraphic(showId: string, graphicId: string): Show[] {
  const all = loadAllShows();
  const show = all.find((s) => s.id === showId);
  if (show) {
    show.graphics = show.graphics.filter((g) => g.id !== graphicId);
    // Cues over a removed pool graphic have nothing left to drive — they go with it.
    if (show.cues?.length) show.cues = show.cues.filter((c) => c.sourceId !== graphicId);
    show.updatedAt = nowIso();
  }
  saveAll(all);
  return all.filter((s) => !s.deleted);
}

// ── Cues (docs/CLOUD_PLAYOUT.md §2) ──────────────────────────────────────────

/** The mutator envelope, once: resolve the LIVE (non-tombstoned) record, run the mutation,
 *  stamp + persist only when it reports a change, return the visible list. Hand-rolling this
 *  per mutator is how four of the first five cue mutators forgot the tombstone guard. */
function patchShow(showId: string, mutate: (show: Show) => boolean): Show[] {
  const all = loadAllShows();
  const show = all.find((s) => s.id === showId && !s.deleted);
  if (show && mutate(show)) {
    show.updatedAt = nowIso();
    saveAll(all);
  }
  return all.filter((s) => !s.deleted);
}

/** A cue's starting values: the template's own field defaults (what update() falls back to). */
function seedValues(fields: SpxTemplate['fields']): Record<string, string> {
  const values: Record<string, string> = {};
  for (const f of fields) values[f.field] = f.value ?? '';
  return values;
}

/** Append a cue for a pool graphic. `seed` prefills label/values (e.g. from a ControlEntry —
 *  a starting point only; the cue owns its values from here on). */
export function addShowCue(
  showId: string,
  sourceId: string,
  seed?: { label?: string; values?: Record<string, string>; note?: string },
): { shows: Show[]; cueId: string | null } {
  let cueId: string | null = null;
  const shows = patchShow(showId, (show) => {
    const source = show.graphics.find((g) => g.id === sourceId);
    if (!source) return false;
    const cue: ShowCue = {
      id: uuid(),
      sourceId,
      label: seed?.label?.trim() || source.name,
      values: { ...seedValues(source.template.fields), ...(seed?.values ?? {}) },
      ...(seed?.note ? { note: seed.note } : {}),
    };
    show.cues = [...(show.cues ?? []), cue];
    cueId = cue.id;
    return true;
  });
  return { shows, cueId };
}

/** Patch a cue's label / values / note in place. Values merge per field. */
export function updateShowCue(
  showId: string,
  cueId: string,
  patch: { label?: string; values?: Record<string, string>; note?: string | null },
): Show[] {
  return patchShow(showId, (show) => {
    const cue = show.cues?.find((c) => c.id === cueId);
    if (!cue) return false;
    if (patch.label !== undefined) cue.label = patch.label;
    if (patch.values) cue.values = { ...cue.values, ...patch.values };
    if (patch.note === null) delete cue.note;
    else if (patch.note !== undefined) cue.note = patch.note;
    return true;
  });
}

/** Move a cue one slot up or down the rundown (the moveShowGraphic swap, over cues). */
export function moveShowCue(showId: string, cueId: string, dir: -1 | 1): Show[] {
  return patchShow(showId, (show) => {
    const cues = show.cues;
    if (!cues) return false;
    const i = cues.findIndex((c) => c.id === cueId);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= cues.length) return false;
    [cues[i], cues[j]] = [cues[j], cues[i]];
    return true;
  });
}

export function removeShowCue(showId: string, cueId: string): Show[] {
  return patchShow(showId, (show) => {
    if (!show.cues?.some((c) => c.id === cueId)) return false;
    show.cues = show.cues.filter((c) => c.id !== cueId);
    return true;
  });
}

/** Record (or clear, with undefined) a show's browser-output slug after (un)publishing.
 *  Publishing also stamps publishedAt; clearing removes it (nothing is live any more). */
export function setShowOutputSlug(showId: string, slug: string | undefined): Show[] {
  return patchShow(showId, (show) => {
    if (slug) {
      show.outputSlug = slug;
      show.publishedAt = nowIso();
    } else {
      delete show.outputSlug;
      delete show.publishedAt;
    }
    return true;
  });
}

/** Move a graphic one slot up or down the rundown. */
export function moveShowGraphic(showId: string, graphicId: string, dir: -1 | 1): Show[] {
  const all = loadAllShows();
  const show = all.find((s) => s.id === showId);
  if (show) {
    const i = show.graphics.findIndex((g) => g.id === graphicId);
    const j = i + dir;
    if (i >= 0 && j >= 0 && j < show.graphics.length) {
      const g = show.graphics[i];
      show.graphics[i] = show.graphics[j];
      show.graphics[j] = g;
      show.updatedAt = nowIso();
      saveAll(all);
    }
  }
  return all.filter((s) => !s.deleted);
}

/** Record (or clear, with undefined) a show's hosted control slug after (un)publishing. */
export function setShowHostedSlug(showId: string, slug: string | undefined): Show[] {
  const all = loadAllShows();
  const show = all.find((s) => s.id === showId);
  if (show) {
    if (slug) show.hostedSlug = slug;
    else delete show.hostedSlug;
    show.updatedAt = nowIso();
    saveAll(all);
  }
  return all.filter((s) => !s.deleted);
}

/** Delete = tombstone (strip payload, keep the id + fresh timestamp) so the delete syncs. */
export function deleteShow(showId: string): Show[] {
  const all = loadAllShows();
  const show = all.find((s) => s.id === showId);
  if (show) {
    show.deleted = true;
    show.graphics = [];
    show.updatedAt = nowIso();
  }
  saveAll(all);
  return all.filter((s) => !s.deleted);
}

/** Drop local tombstones older than the cutoff (the sync controller's coordinated purge). */
export function purgeOldShowTombstones(beforeIso: string): void {
  const all = loadAllShows();
  const kept = all.filter((s) => !s.deleted || s.updatedAt >= beforeIso);
  if (kept.length !== all.length) saveAll(kept);
}
