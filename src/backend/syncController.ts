// The sync controller (Era 5.2): the stateful glue between the app and the pure sync engine. Holds
// the provider instances, guards that sync only runs when a backend is configured AND the user is
// signed in, debounces pushes after local edits, serializes overlapping runs, and publishes a
// status other UI can subscribe to. Everything no-ops in offline mode, so the offline app is
// untouched.

import { isBackendConfigured } from './config';
import { consumeDeliberateSignOut, getAccessToken, subscribeAuth } from './auth';
import { LocalStorageProvider } from './storage';
import { SupabaseProvider } from './supabaseProvider';
import { runSync, type SyncResult } from './sync';
import { purgeOldTombstones } from '../model/packets';
import { purgeOldShowTombstones } from '../model/shows';
import { purgeOldVideoTombstones } from '../model/videoProject';
import { purgeOldGraphicTombstones } from '../model/library';

export type SyncPhase = 'offline' | 'syncing' | 'synced' | 'error';
export interface SyncState {
  phase: SyncPhase;
  detail?: string;
  last?: SyncResult;
}

const local = new LocalStorageProvider();
const remote = new SupabaseProvider();

let state: SyncState = { phase: 'offline' };
const listeners = new Set<(s: SyncState) => void>();

function setState(next: SyncState): void {
  state = next;
  listeners.forEach((fn) => fn(next));
}

export function getSyncState(): SyncState {
  return state;
}

export function onSyncState(cb: (s: SyncState) => void): () => void {
  listeners.add(cb);
  cb(state);
  return () => {
    listeners.delete(cb);
  };
}

/** Sync can run only with a configured backend AND a live session. */
async function canSync(): Promise<boolean> {
  if (!isBackendConfigured()) return false;
  return (await getAccessToken()) !== null;
}

let running = false;
let queued = false;

/**
 * Callers who asked for a sync WHILE ONE WAS ALREADY RUNNING, waiting to be told that a pass
 * covering their call has finished. They are answered by the pass that starts AFTER them (the
 * coalesced one `queued` asks for), never by the one that was already in flight.
 *
 * THE DISTINCTION IS THE WHOLE POINT, and skipping it cost R2.4 on production. A pass lists the
 * cloud once, near its start; a record created after that list is not in it. `await syncNow()`
 * used to return an already-resolved promise in this branch, so a caller that meant "pull, then
 * look again" looked again having pulled nothing. The deep link `noacg save` prints is exactly
 * that caller: the studio boots, its sign-in pass is already running, the graphic was saved a
 * second ago, and the re-check after the "sync" missed it and redirected to Home. It arrived
 * about five seconds later, with the URL long since rewritten.
 */
let waiting: Array<() => void> = [];

/** Answer every waiter. Called when a pass finishes and when no pass can run at all — a waiter
 *  that hangs is worse than one told "nothing came", because its caller waits forever. */
function answer(list: Array<() => void>): void {
  for (const resolve of list) resolve();
}

/**
 * Run a sync now (guarded, serialized). Safe to call anytime; no-ops when it can't sync.
 *
 * RESOLVES WHEN A PASS THAT COULD SEE THE CALLER'S DATA HAS COMPLETED - which is the promise
 * every caller already assumed it was making. See `waiting` above for what that costs when it
 * is not true.
 */
export async function syncNow(): Promise<void> {
  if (!(await canSync())) {
    setState({ phase: 'offline' });
    // RELEASING THE WAITERS HERE IS ONLY HONEST WHEN NOTHING IS COMING. This branch is reached
    // by any caller at any moment - a debounced push, a boot pass fired while the session is
    // still being read - and a pass that is running or queued will still answer them. Releasing
    // on somebody else's "I cannot sync" told a deep-link lookup the cloud had answered when
    // nothing had been asked yet, and it went to Home while its record was seconds away.
    // If sync really is over, the queued pass reaches this branch with both flags down and
    // releases them then, so nobody waits forever either.
    //
    // ONE WINDOW REMAINS, deliberately: the re-dispatch below clears `queued` and then awaits
    // `canSync()` inside the new call, and a third caller arriving inside that await sees both
    // flags down. Closing it needs the pass chain to be one object rather than two booleans,
    // which is a change to make when something needs it. A caller that acts on a release must
    // therefore check that a pass really did run - `backend/graphicWhenSynced.ts` reads the
    // phase for exactly this reason, and anything new here should do the same.
    if (!running && !queued) {
      answer(waiting);
      waiting = [];
    }
    return;
  }
  if (running) {
    queued = true; // coalesce: one more pass after the current finishes
    return new Promise<void>((resolve) => {
      waiting.push(resolve);
    });
  }
  running = true;
  // Everyone who asked DURING the previous pass is answered when this one finishes; everyone
  // who asks during THIS pass goes into the fresh list and waits for the next.
  const answered = waiting;
  waiting = [];
  setState({ phase: 'syncing' });
  try {
    // Sync's own pull-writes dispatch 'spx-data-changed' too; that's fine — runSync is idempotent,
    // so the extra pass they schedule finds nothing to do. Not suppressing them means a genuine
    // user edit that lands DURING a sync is never swallowed and gets its own follow-up pass.
    const result = await runSync(local, remote);
    // Coordinated tombstone purge: drop deletes older than the grace period from BOTH sides (same
    // cutoff), so a purged tombstone can't be re-pulled. 90 days is generous; a device offline
    // longer than that could resurrect a delete — an acceptable edge for a beta. Best-effort.
    try {
      const cutoff = new Date(Date.now() - 90 * 86_400_000).toISOString();
      await remote.purgeTombstones(cutoff);
      purgeOldTombstones(cutoff);
      purgeOldShowTombstones(cutoff);
      purgeOldVideoTombstones(cutoff);
      purgeOldGraphicTombstones(cutoff);
    } catch {
      // Never fail a sync on cleanup.
    }
    if (result.failures.length > 0) {
      // The pass completed and the bookmark advanced, but some records could not be applied —
      // surface them (SyncStatus shows the detail as its tooltip). They retry next pass.
      const shown = result.failures.slice(0, 3).map((f) => `${f.kind} "${f.name}": ${f.message}`);
      const extra = result.failures.length > shown.length ? '; …' : '';
      setState({
        phase: 'error',
        detail: `${result.failures.length} record${result.failures.length === 1 ? '' : 's'} failed to sync — ${shown.join('; ')}${extra}`,
        last: result,
      });
    } else {
      setState({ phase: 'synced', last: result });
    }
  } catch (e) {
    setState({ phase: 'error', detail: e instanceof Error ? e.message : String(e) });
  } finally {
    running = false;
    answer(answered);
    if (queued) {
      queued = false;
      // Through syncNow, not the body directly: the session can have ended while this pass ran,
      // and that early return is also what releases the waiters this pass did not answer.
      void syncNow();
    }
  }
}

let debounce: ReturnType<typeof setTimeout> | null = null;
function scheduleSync(): void {
  if (debounce) clearTimeout(debounce);
  debounce = setTimeout(() => void syncNow(), 2500);
}

let started = false;

/** Begin auto-sync: a pass whenever a session arrives, then a debounced push after every local
 *  data change. No-op in offline mode (never even attaches the listener). Idempotent.
 *
 *  SIGNING IN IS A SYNC TRIGGER. The app mounts signed out — its own session is read
 *  asynchronously, and a fresh browser has none at all — so the pass this used to fire at mount
 *  always found `canSync()` false and parked the status at 'offline'. Nothing then re-ran it: a
 *  user who signed in and made no edit saw no status chip, pushed nothing, and (on a new machine,
 *  the reason to sign in at all) pulled none of their work back. Sign-OUT is the mirror: the
 *  status must fall back to 'offline' rather than leave a stale "Synced" claiming an account the
 *  session no longer has. Only a CHANGE in signed-in-ness acts — a token refresh is not a
 *  reason to re-sync. */
export function startAutoSync(): void {
  if (started || typeof window === 'undefined' || !isBackendConfigured()) return;
  started = true;
  window.addEventListener('spx-data-changed', scheduleSync);
  let wasSignedIn: boolean | null = null;
  subscribeAuth((auth) => {
    const signedIn = auth.status === 'signed-in' && !!auth.user;
    if (signedIn === wasSignedIn) return;
    const hadSession = wasSignedIn === true;
    wasSignedIn = signedIn;
    if (signedIn) {
      void syncNow();
      return;
    }
    setState({ phase: 'offline' });
    // A session that DIES (refresh token expired or revoked) used to end here silently: the
    // chip fell to 'offline' and nothing said why, so sync just stopped. Surface it — unless
    // the user pressed Sign out themselves, which is the same transition and not a problem.
    // The event (not a direct UI import — backend never imports components) is answered in
    // App.tsx with the sign-in prompt; local work is untouched either way.
    if (hadSession && !consumeDeliberateSignOut()) {
      window.dispatchEvent(new CustomEvent('spx-session-expired'));
    }
  });
}
