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
const ATTRIBUTION_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const HOST_RE = /^[a-z0-9][a-z0-9.-]{0,127}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export interface FunnelEventInput {
  event: unknown;
  visitorId: unknown;
  source?: unknown;
  medium?: unknown;
  campaign?: unknown;
  referrerHost?: unknown;
  detail?: unknown;
}

export interface FunnelEventRow {
  event: FunnelEvent;
  visitorId: string;
  userId: string | null;
  source: string | null;
  medium: string | null;
  campaign: string | null;
  referrerHost: string | null;
  detail: string | null;
}

function slug(value: unknown, pattern: RegExp): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().toLowerCase();
  return pattern.test(trimmed) ? trimmed : null;
}

/** Normalize one reported event, or null when it is not a shape we store. Only `event`
 *  and `visitorId` are required; every attribution field independently degrades to null
 *  rather than rejecting the row, so one malformed UTM parameter never costs a datapoint. */
export function funnelEventRow(input: FunnelEventInput, userId: string | null): FunnelEventRow | null {
  const event = FUNNEL_EVENTS.find((name) => name === input.event);
  if (!event) return null;
  const visitorId = slug(input.visitorId, UUID_RE);
  if (!visitorId) return null;
  return {
    event,
    visitorId,
    userId,
    source: slug(input.source, ATTRIBUTION_RE),
    medium: slug(input.medium, ATTRIBUTION_RE),
    campaign: slug(input.campaign, ATTRIBUTION_RE),
    referrerHost: slug(input.referrerHost, HOST_RE),
    detail: slug(input.detail, DETAIL_RE),
  };
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
      source: row.source,
      medium: row.medium,
      campaign: row.campaign,
      referrer_host: row.referrerHost,
      detail: row.detail,
    });
    if (error) console.warn('Funnel event write failed:', error.message);
  } catch (error) {
    console.warn('Funnel event write failed:', error instanceof Error ? error.message : error);
  }
}
