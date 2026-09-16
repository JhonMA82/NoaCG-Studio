// The production's LIVE data tree - runtime state, deliberately NOT part of the Show record.
//
// WHY THIS FILE EXISTS AT ALL: `Show` syncs record-level last-write-wins with conflict copies,
// and a conflict copy drops the production's capability slugs (docs/INTERACTIVE_PLAYOUT_PLAN.md
// D3). Live values move at feed rate - a clock, a score during a period - so writing them into
// the show document would bump `updatedAt` per tick, push a document sync per tick, and make a
// two-operator production mint a conflict copy that unpublishes itself mid-show. The authored
// SEED lives on the record (it is authored, it should travel, it should be exported and
// duplicated); what is true right now lives here.
//
// Plain localStorage, not the durable IndexedDB store: this is small, per-machine, never
// synced, and it changes often enough that queueing every write into the durable store's
// commit path would be churn with nothing to show for it. It survives a reload, which is the
// one durability property runtime state actually needs.

import type { JsonObject } from './productionData';

const KEY = 'spx-gfx-production-data';

/** The localStorage key the tree lives under, so another TAB can recognise a write to it.
 *  Exported because the production page listens for `storage` to pick up a value typed on the
 *  Data workspace, which now opens in its own browser tab. */
export const PRODUCTION_DATA_KEY = KEY;

type Store = Record<string, JsonObject>;

function readStore(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Store) : {};
  } catch {
    // A corrupted or unreadable key is an empty tree, never a crash on the way into a
    // production page: the seed can always restore it (`Reset`).
    return {};
  }
}

function writeStore(store: Store): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    // Quota or a private-mode refusal. The in-memory tree keeps working for this session; the
    // alternative - throwing into the operator's edit - would be worse on air.
  }
}

/** This production's live tree. Absent = it has not been started, which reads as `{}`. */
export function loadLiveData(showId: string): JsonObject {
  const value = readStore()[showId];
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

/** Replace this production's live tree. */
export function saveLiveData(showId: string, data: JsonObject): void {
  const store = readStore();
  store[showId] = data;
  writeStore(store);
}

/** Forget this production's live tree entirely (a deleted production, or a hard clear). */
export function clearLiveData(showId: string): void {
  const store = readStore();
  if (!(showId in store)) return;
  delete store[showId];
  writeStore(store);
}

// ── The operator's SPACE mode (docs/PLAYOUT_DASHBOARD.md §2, "Two Space modes"). ──
//
// A person's habit, not a property of the production: it lives here beside the live tree for
// the same reasons - plain localStorage, per machine, never synced - and it needs no version
// because it is one word with a safe default. An unknown value reads as the default.

export type SpaceMode = 'take' | 'preview-then-take';

/** The localStorage key the mode lives under; another tab listens for a write to it. */
export const SPACE_MODE_KEY = 'spx-gfx-space-mode';

/** The mode this browser last chose, or the default when it never chose. */
export function loadSpaceMode(): SpaceMode {
  try {
    return localStorage.getItem(SPACE_MODE_KEY) === 'preview-then-take' ? 'preview-then-take' : 'take';
  } catch {
    return 'take';
  }
}

/** Remember the mode for this browser. A refused write only means the choice lasts one session. */
export function saveSpaceMode(mode: SpaceMode): void {
  try {
    localStorage.setItem(SPACE_MODE_KEY, mode);
  } catch {
    // Quota or a private-mode refusal: the page keeps the mode in memory until it closes.
  }
}
