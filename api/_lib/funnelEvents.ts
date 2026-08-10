// Validation + the write for the growth funnel ledger (docs/FUNNEL_EVENTS.md).
//
// The browser is not trusted to send well-formed analytics: everything below is an
// allowlist, and anything outside it is DROPPED rather than stored as-is. That is what
// keeps the table free of the things it promises not to hold - a client bug (or a curious
// caller) cannot turn `detail` into a URL, a prompt, or an email address.
//
// Writing is best-effort, exactly like the gateway ledger: a funnel failure must never
// break the page that reported it, and a deployment without Supabase keeps no funnel.

import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseSecretKey } from './jobStore.js';

export const FUNNEL_EVENTS = ['visit', 'return', 'signup', 'activation', 'export'] as const;
export type FunnelEvent = (typeof FUNNEL_EVENTS)[number];

/** `detail` is a slug, never free text: a short lowercase token the UI already names
 *  (an export target id, the creation route that produced the first graphic). The regex
 *  is the contract - the migration re-states it as a CHECK so a direct writer cannot
 *  bypass it either. */
const DETAIL_RE = /^[a-z0-9-]{1,40}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export interface FunnelEventInput {
  event: unknown;
  visitorId: unknown;
  detail?: unknown;
}

export interface FunnelWithdrawalInput {
  action: unknown;
  visitorId: unknown;
}

export interface FunnelEventRow {
  event: FunnelEvent;
  visitorId: string;
  userId: string | null;
  detail: string | null;
}

function slug(value: unknown, pattern: RegExp): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().toLowerCase();
  return pattern.test(trimmed) ? trimmed : null;
}

/** Normalize one reported event, or null when it is not a shape we store. Only `event`
 *  and `visitorId` are required. There is deliberately no campaign or referrer input: the
 *  opt-in purpose is product improvement, not acquisition attribution. */
export function funnelEventRow(input: unknown, userId: string | null): FunnelEventRow | null {
  if (!input || typeof input !== 'object') return null;
  const value = input as Partial<FunnelEventInput>;
  const event = FUNNEL_EVENTS.find((name) => name === value.event);
  if (!event) return null;
  const visitorId = slug(value.visitorId, UUID_RE);
  if (!visitorId) return null;
  return {
    event,
    visitorId,
    userId,
    detail: slug(value.detail, DETAIL_RE),
  };
}

/** A withdrawal is accepted only for a syntactically valid browser identifier. */
export function funnelWithdrawalVisitor(input: unknown): string | null {
  if (!input || typeof input !== 'object') return null;
  const value = input as Partial<FunnelWithdrawalInput>;
  if (value.action !== 'withdraw') return null;
  return slug(value.visitorId, UUID_RE);
}

export function funnelLedgerConfigured(): boolean {
  const url = (process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? '').trim();
  return Boolean(url && supabaseSecretKey());
}

let client: SupabaseClient | null = null;
async function sb(): Promise<SupabaseClient> {
  if (client) return client;
  const url = (process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? '').trim();
  const { createClient } = await import('@supabase/supabase-js');
  client = createClient(url, supabaseSecretKey(), { auth: { persistSession: false } });
  return client;
}

export async function recordFunnelEvent(row: FunnelEventRow): Promise<void> {
  if (!funnelLedgerConfigured()) return;
  try {
    const { error } = await (await sb()).from('funnel_events').insert({
      event: row.event,
      visitor_id: row.visitorId,
      user_id: row.userId,
      detail: row.detail,
    });
    if (error) console.warn('Funnel event write failed:', error.message);
  } catch (error) {
    console.warn('Funnel event write failed:', error instanceof Error ? error.message : error);
  }
}


/** Delete this opted-out browser and, when authenticated, every row linked to its account. */
export async function deleteFunnelEvents(visitorId: string, userId: string | null): Promise<void> {
  if (!funnelLedgerConfigured()) return;
  try {
    const db = await sb();
    const query = db.from('funnel_events').delete();
    const { error } = userId
      ? await query.or(`visitor_id.eq.${visitorId},user_id.eq.${userId}`)
      : await query.eq('visitor_id', visitorId);
    if (error) console.warn('Funnel withdrawal failed:', error.message);
  } catch (error) {
    console.warn('Funnel withdrawal failed:', error instanceof Error ? error.message : error);
  }
}
