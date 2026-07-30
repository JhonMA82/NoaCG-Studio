// The one thing the admin surface publishes OUTWARD: a maintenance notice, plus the list of
// features currently switched off instance-wide.
//
// Both are things a visitor experiences anyway - a disabled feature disappears, a paused
// service refuses - so publishing them costs nothing and lets the app explain itself instead
// of appearing broken. Everything else in system_settings stays server-side.
//
// Read through a SECURITY DEFINER RPC (migration 0019) rather than a table policy, so the
// exposed shape is fixed in the database and cannot widen by someone adding a column.

import { getSupabase } from './supabase';
import { isBackendConfigured } from './config';

export interface SystemNotice {
  message: string;
  level: 'info' | 'warning';
  until: string | null;
}

export interface PublicSystemState {
  notice: SystemNotice | null;
  disabledFeatures: string[];
}

const NONE: PublicSystemState = { notice: null, disabledFeatures: [] };

/** Fetch the public system state. Never throws and never blocks the app: an offline build,
 *  an unreachable backend, or an instance that has not applied migration 0019 all resolve to
 *  "nothing to say", which is also the correct answer. */
export async function loadSystemNotice(): Promise<PublicSystemState> {
  if (!isBackendConfigured()) return NONE;
  try {
    const sb = await getSupabase();
    if (!sb) return NONE;
    const { data, error } = await sb.rpc('public_system_notice');
    if (error || !data || typeof data !== 'object') return NONE;

    const row = data as { notice?: unknown; disabledFeatures?: unknown };
    const notice = row.notice && typeof row.notice === 'object' && !Array.isArray(row.notice)
      ? (row.notice as Record<string, unknown>)
      : null;
    const message = typeof notice?.message === 'string' ? notice.message.trim() : '';
    // An expiry in the past means the notice has already stopped applying. The server checks
    // this too; doing it here as well means a cached response cannot resurrect an old notice.
    const until = typeof notice?.until === 'string' ? notice.until : null;
    const expired = until ? Date.parse(until) <= Date.now() : false;

    return {
      notice: message && !expired
        ? { message: message.slice(0, 500), level: notice?.level === 'warning' ? 'warning' : 'info', until }
        : null,
      disabledFeatures: Array.isArray(row.disabledFeatures)
        ? row.disabledFeatures.filter((entry): entry is string => typeof entry === 'string')
        : [],
    };
  } catch {
    return NONE;
  }
}
