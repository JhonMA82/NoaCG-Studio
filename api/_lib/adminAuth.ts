// THE ADMIN GATE. Every api/admin/* handler starts here and nothing reaches admin data
// without passing through it (docs/ADMIN.md sections 1 and 4).
//
// THE ONE RULE THIS FILE EXISTS TO ENFORCE: unauthorized is 404, never 403, and always the
// same 404. Absent token, malformed token, expired token, a valid token belonging to a
// normal user, an admin whose own account is suspended, an unconfigured backend, a missing
// service key - all of them answer with the byte-identical body below. A distinct
// "forbidden" would confirm both that an admin system exists and that the endpoint the
// caller guessed is real, and the brief for this surface asks for neither to be learnable.
// The same reasoning already governs the Lite judge endpoint, which answers 'not-found'
// identically for a missing record and someone else's record (src/ai/AGENTS.md).
//
// The gate does NOT trust RLS. It looks the caller up with the service key on every single
// request, so an RLS mistake in a later migration cannot open an endpoint. public.is_admin()
// exists for the other direction - letting a policy grant an admin read access - and is
// never the thing that admits an API call.
//
// There is also no admin session, cookie or token of its own: authorization is re-derived
// per request from the Supabase JWT the browser already holds. Nothing to steal, nothing to
// expire independently, and revoking an admin row takes effect on the next request.

import type { SupabaseClient } from '@supabase/supabase-js';
import { bearerToken, ipHash, json } from './http.js';
import { verifyUser } from './auth.js';
import { hitRateLimit, type RateLimitCaps } from './rateLimit.js';
import { envInt } from './env.js';

export type AdminRole = 'owner' | 'admin' | 'support';

const ROLE_RANK: Record<AdminRole, number> = { owner: 3, admin: 2, support: 1 };

export interface AdminActor {
  userId: string;
  email: string;
  role: AdminRole;
}

/** The single refusal. Deliberately indistinguishable from a route that does not exist, and
 *  deliberately the only failure shape this module can produce. */
export function adminNotFound(): Response {
  return json({ error: { code: 'not_found', message: 'Not found' } }, 404);
}

function isAdminRole(value: unknown): value is AdminRole {
  return value === 'owner' || value === 'admin' || value === 'support';
}

/** Does `role` satisfy a handler asking for at least `minRole`? Pure, and the only place
 *  the ranking is expressed, so a new role cannot be half-added. */
export function meetsRole(role: AdminRole, minRole: AdminRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minRole];
}

// ── the service-role client ────────────────────────────────────────────────────────────

function serviceKey(): string {
  return (process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
}

function serviceUrl(): string {
  return (process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? '').trim();
}

/** True when this deployment can run an admin surface at all. An offline or self-hosted
 *  instance with no Supabase configuration has no users to administer, so /admin is simply
 *  not there - the same posture isBackendConfigured() gives the browser. */
export function adminConfigured(): boolean {
  return Boolean(serviceUrl() && serviceKey());
}

let cached: SupabaseClient | null = null;

/** The RLS-bypassing client. Never handed to a handler that has not already passed the
 *  gate, and never reachable from the browser: this module is under api/ and the key it
 *  reads has no VITE_ fallback, so it cannot be bundled. */
export async function adminDb(): Promise<SupabaseClient> {
  if (cached) return cached;
  const url = serviceUrl();
  const key = serviceKey();
  if (!url || !key) throw new Error('admin: SUPABASE_URL + SUPABASE_SECRET_KEY required');
  const { createClient } = await import('@supabase/supabase-js');
  cached = createClient(url, key, { auth: { persistSession: false } });
  return cached;
}

/** Test seam: drop the memoized client so a test can change the environment. */
export function resetAdminDb(): void {
  cached = null;
}

// ── the burst gate ─────────────────────────────────────────────────────────────────────
// In front of the JWT verification, which is a network round trip to Supabase. Without it,
// an unauthenticated flood at /api/admin/* would cost one getUser() call per request even
// though every one of them ends in the same 404.

function adminRateCaps(): RateLimitCaps {
  return {
    windowMs: Math.max(1, envInt('ADMIN_RATE_WINDOW_SEC', 60)) * 1000,
    max: envInt('ADMIN_RATE_MAX', 120),
  };
}

// ── the gate ───────────────────────────────────────────────────────────────────────────

export type AdminGate = { ok: true; actor: AdminActor } | { ok: false; response: Response };

/**
 * Authorize an admin request. Returns the actor, or the one refusal.
 *
 * `minRole` is the LOWEST role that may perform the action. Read surfaces take 'support';
 * anything that changes a user's access takes 'admin'; role management itself takes 'owner'.
 * A handler that forgets to state one gets 'support', which is the least privileged default
 * and therefore the safe way to be wrong.
 */
export async function requireAdmin(req: Request, minRole: AdminRole = 'support'): Promise<AdminGate> {
  if (!hitRateLimit(`admin:${ipHash(req)}`, adminRateCaps(), Date.now()).allowed) {
    return { ok: false, response: adminNotFound() };
  }
  if (!adminConfigured()) return { ok: false, response: adminNotFound() };

  const user = await verifyUser(bearerToken(req));
  if (!user) return { ok: false, response: adminNotFound() };

  let row: { role?: unknown } | null;
  try {
    const db = await adminDb();
    const { data, error } = await db
      .from('admin_users')
      .select('role')
      .eq('user_id', user.userId)
      .maybeSingle();
    if (error) return { ok: false, response: adminNotFound() };
    row = data;
  } catch {
    // Infrastructure down. Fail CLOSED, and fail as the same 404 - an outage must not
    // become a way to tell an admin route from a missing one.
    return { ok: false, response: adminNotFound() };
  }

  if (!row || !isAdminRole(row.role)) return { ok: false, response: adminNotFound() };
  if (!meetsRole(row.role, minRole)) return { ok: false, response: adminNotFound() };

  return { ok: true, actor: { userId: user.userId, email: await actorEmail(user.userId), role: row.role } };
}

/** The actor's email, for the audit snapshot. Best effort: a lookup failure must not turn a
 *  legitimate admin action into an error, so it degrades to an empty string. */
async function actorEmail(userId: string): Promise<string> {
  try {
    const db = await adminDb();
    const { data } = await db.auth.admin.getUserById(userId);
    return data?.user?.email ?? '';
  } catch {
    return '';
  }
}

// ── the audit trail ────────────────────────────────────────────────────────────────────

export interface AuditEntry {
  /** Dotted verb: 'user.suspend', 'plan.update', 'grant.revoke', 'system.set'. */
  action: string;
  targetType?: 'user' | 'plan' | 'grant' | 'system' | 'template' | 'feedback' | '';
  targetId?: string;
  /** One human-readable line for the log view. */
  summary?: string;
  /** Structured context. Content-free of secrets: ids, names and numbers only. */
  detail?: Record<string, unknown>;
}

/**
 * Record one admin action, in the same request that performed it.
 *
 * Deliberately NOT throwing: a mutation that succeeded and then failed to log is still a
 * mutation, and turning it into a 500 would tell the operator their change did not happen
 * when it did. The failure is surfaced on the server console instead, and the table has no
 * UPDATE or DELETE grant, so what does land cannot be rewritten afterwards.
 */
export async function writeAudit(req: Request, actor: AdminActor, entry: AuditEntry): Promise<void> {
  try {
    const db = await adminDb();
    const { error } = await db.from('admin_audit_log').insert({
      actor_id: actor.userId,
      actor_email: actor.email,
      actor_role: actor.role,
      action: entry.action,
      target_type: entry.targetType ?? '',
      target_id: entry.targetId ?? '',
      summary: entry.summary ?? '',
      detail: entry.detail ?? {},
      ip_hash: ipHash(req),
    });
    if (error) console.error('admin audit write failed:', error.message);
  } catch (error) {
    console.error('admin audit write failed:', error instanceof Error ? error.message : String(error));
  }
}
