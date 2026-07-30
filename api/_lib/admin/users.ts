// /api/admin/users - the account directory.
//
//   GET  ?query=<email substring or user id>   the list
//   POST { email }                             invite
//
// Invite sends Supabase's own invitation email and pre-creates the account. Open signup
// stays open (migration 0006 is untouched): invitation is a convenience for bringing someone
// in with a plan already attached, not a gate. Re-closing signup would be a product change,
// and it is not one this endpoint makes quietly.

import { apiError, json, readJson } from '../http.js';
import { adminDb, adminNotFound, requireAdmin, writeAudit } from '../adminAuth.js';
import { listUsers } from '../adminUsers.js';
import type { AdminUserListResponse } from '../../../src/admin/types.js';

const MAX_BODY_BYTES = 4_000;

/** Conservative, deliberately not RFC 5322: this only has to reject obvious junk before it
 *  reaches the auth service, which does the real validation. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default {
  async fetch(req: Request): Promise<Response> {
    // Reading the directory is a support-level action; creating an account is not.
    const minRole = req.method === 'GET' ? 'support' : 'admin';
    const gate = await requireAdmin(req, minRole);
    if (!gate.ok) return gate.response;

    if (req.method === 'GET') {
      const query = new URL(req.url).searchParams.get('query') ?? '';
      try {
        const result = await listUsers(query);
        return json(result satisfies AdminUserListResponse);
      } catch (error) {
        console.error('admin users list failed:', error instanceof Error ? error.message : error);
        return apiError('internal', 'Could not read the account directory.', 500);
      }
    }

    if (req.method !== 'POST') return adminNotFound();

    let body: { email?: unknown; planId?: unknown };
    try {
      body = await readJson<{ email?: unknown; planId?: unknown }>(req, MAX_BODY_BYTES);
    } catch {
      return apiError('invalid', 'Malformed request.', 400);
    }

    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (!EMAIL.test(email)) return apiError('invalid', 'Enter a valid email address.', 400);

    const db = await adminDb();
    const { data, error } = await db.auth.admin.inviteUserByEmail(email);
    if (error || !data.user) {
      // The auth service's own message is the useful one here (already registered, rate
      // limited, SMTP not configured); an admin is entitled to see it.
      return apiError('invalid', error?.message ?? 'The invitation could not be sent.', 400);
    }

    const planId = typeof body.planId === 'string' && body.planId ? body.planId : null;
    if (planId) {
      const assigned = await db
        .from('user_plans')
        .upsert({ user_id: data.user.id, plan_id: planId, assigned_by: gate.actor.userId }, { onConflict: 'user_id' });
      // The invitation already went out; a failed plan assignment is worth reporting but not
      // worth pretending the invite failed.
      if (assigned.error) console.error('admin invite plan assign failed:', assigned.error.message);
    }

    await writeAudit(req, gate.actor, {
      action: 'user.invite',
      targetType: 'user',
      targetId: data.user.id,
      summary: `invited ${email}`,
      detail: { email, planId },
    });

    return json({ id: data.user.id, email });
  },
};
