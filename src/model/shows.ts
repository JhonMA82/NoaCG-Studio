// The SHOW data layer (Phase 5). A show is the rundown-level unit: an ORDERED set of
// graphics that run together on air (bug + lower third + ticker), each keeping its own
// state machine. Its control page aggregates every graphic's controls — the single-graphic
// case is just a show of one. Shows reuse the packet manager's storage conventions
// (localStorage, updatedAt for LWW sync, soft-delete tombstones) so the cloud sync engine
// can adopt the kind without a second pattern.

import type { SpxTemplate } from './types';
import type { SavedGraphic } from './packets';
import type { ProjectBrand } from './brand';
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
  /** Format stamp. Absent = a pre-stamp record, normalized to 2 on read and written on every
   *  save. A no-op today - it exists so a FUTURE breaking change has a field to bump and
   *  migrate on (AGENTS.md rule 6); 2 matches the packet lineage this store follows. */
  version?: 2;
  /** The production's LOOK (palette + font + style family) - the unified brand its graphics
   *  share. Set when a kit creates the production or from the first graphic added; the wizard
   *  pre-applies it when creating a graphic FOR this production. Absent = none chosen (the
   *  global project brand stays the default outside a production). ADDITIVE OPTIONAL - an
   *  older build reads and rewrites the record untouched. */
  look?: ProjectBrand;
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

/** All shows INCLUDING tombstones — for the sync engine. Back-fills a stable sync timestamp
 *  and normalizes the format stamp on read (pure read-shape: no updatedAt bump, so a record
 *  never looks freshly edited just because a newer build read it). */
export function loadAllShows(): Show[] {
  try {
    const list = JSON.parse(localStorage.getItem(SHOWS_KEY) ?? '[]') as Show[];
    return list.map((s) => ({ ...s, version: 2 as const, updatedAt: s.updatedAt || BACKFILL_TS }));
  } catch {
    return [];
  }
}

/** Live shows for the UI (tombstones hidden). */
export function loadShows(): Show[] {
  return loadAllShows().filter((s) => !s.deleted);
}

/** The live productions whose pool holds a copy of this LIBRARY graphic (SavedGraphic's
 *  `graphicId` back-link) - "in 2 productions" on a Home row, and the guard that says what a
 *  library delete would orphan. */
export function productionsContaining(graphicId: string): Show[] {
  return loadShows().filter((s) => s.graphics.some((g) => g.graphicId === graphicId));
}

export function createShow(name: string): Show[] {
  createShowNamed(name);
  return loadShows();
}

/** Create a production and return the RECORD itself - the wizard's kit and Finish doors need
 *  the new id to navigate to, and `createShow` above only returns the list. */
export function createShowNamed(name: string): Show {
  const show: Show = {
    id: uuid(),
    name: name.trim() || 'Untitled production',
    version: 2,
    graphics: [],
    updatedAt: nowIso(),
  };
  const all = loadAllShows();
  all.push(show);
  saveAll(all);
  return show;
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
    // The playout layer (docs/PLAYOUT_DASHBOARD.md §5). A REPLACEMENT keeps whatever the
    // operator chose — re-adding an edited graphic must not silently move it off its layer
    // mid-show. A NEW graphic takes the next free number from 20 up, so no two graphics of a
    // production ever start on one layer: two on the same layer replace each other on air, and
    // there is no reason to begin from a state the operator then has to repair.
    layer: existing >= 0 ? graphicLayer(show.graphics[existing]) : nextFreeLayer(show.graphics),
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

/** Set (or clear, with undefined) the production's unified look. */
export function setShowLook(showId: string, look: ProjectBrand | undefined): Show[] {
  return patchShow(showId, (show) => {
    if (look) show.look = look;
    else delete show.look;
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
// ── Playout layers (docs/PLAYOUT_DASHBOARD.md §5) ──────────────────────────────────────────
//
// A pool graphic airs on a layer NUMBER the operator types, not on one derived from its
// position in the pool. CasparCG offers 1-100 and a teaching install's rundowns live around
// 20, so counting starts there: the first graphic is 20, the next 21, and so on. Distinct by
// construction (owner decision, 2026-08-05) — two graphics on one layer replace each other on
// air, and nothing is gained by starting from a state the operator has to repair. The number
// stays fully editable; nobody has to think about it.

/** Where the count starts, and what a record saved before the field reads as. */
export const DEFAULT_PLAYOUT_LAYER = 20;
/** The range CasparCG accepts, and therefore the range the control offers. */
export const MIN_PLAYOUT_LAYER = 1;
export const MAX_PLAYOUT_LAYER = 100;

/** A pool graphic's layer — the stored number, or the default for a record saved before the
 *  field existed (additive-optional read, root AGENTS.md rule 6). */
export function graphicLayer(graphic: Pick<SavedGraphic, 'layer'>): number {
  const n = Number(graphic.layer);
  return Number.isFinite(n) && n >= MIN_PLAYOUT_LAYER && n <= MAX_PLAYOUT_LAYER
    ? Math.round(n)
    : DEFAULT_PLAYOUT_LAYER;
}

/** The lowest layer no graphic of the pool is using, from the default upward — what the
 *  duplicate-layer warning offers as its one-click fix. */
export function nextFreeLayer(graphics: Pick<SavedGraphic, 'layer'>[]): number {
  const used = new Set(graphics.map(graphicLayer));
  for (let n = DEFAULT_PLAYOUT_LAYER; n <= MAX_PLAYOUT_LAYER; n++) if (!used.has(n)) return n;
  for (let n = MIN_PLAYOUT_LAYER; n < DEFAULT_PLAYOUT_LAYER; n++) if (!used.has(n)) return n;
  return DEFAULT_PLAYOUT_LAYER;
}

/**
 * Which pool graphics SHARE a layer, keyed by that layer. Two graphics on one layer evict each
 * other the moment both are taken - in CasparCG, in SPX, and in the browser output alike - so
 * the surface says so rather than letting it be found live (docs/PLAYOUT_DASHBOARD.md §5).
 * Defaulting everything to one number is the deliberate choice; this is what keeps it honest.
 */
export function duplicateLayers(graphics: SavedGraphic[]): Map<number, SavedGraphic[]> {
  const byLayer = new Map<number, SavedGraphic[]>();
  for (const g of graphics) {
    const layer = graphicLayer(g);
    byLayer.set(layer, [...(byLayer.get(layer) ?? []), g]);
  }
  return new Map([...byLayer].filter(([, gs]) => gs.length > 1));
}

/** Set one pool graphic's playout layer. Out-of-range values clamp rather than refuse — the
 *  control is a number input and a half-typed "1" must not be rejected mid-keystroke. */
export function setShowGraphicLayer(showId: string, graphicId: string, layer: number): Show[] {
  const all = loadAllShows();
  const show = all.find((s) => s.id === showId && !s.deleted);
  const graphic = show?.graphics.find((g) => g.id === graphicId);
  if (show && graphic) {
    const clamped = Math.min(MAX_PLAYOUT_LAYER, Math.max(MIN_PLAYOUT_LAYER, Math.round(layer) || DEFAULT_PLAYOUT_LAYER));
    graphic.layer = clamped;
    show.updatedAt = nowIso();
    saveAll(all);
  }
  return all.filter((s) => !s.deleted);
}

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
