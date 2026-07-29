// /api/admin/grants - temporary access grants and permanent per-user overrides.
//
//   POST { action: 'create', userId, kind, key, value, expiresAt?, reason }
//   POST { action: 'revoke', id }
//
// ONE table, two meanings: an expiry makes the row a temporary grant, its absence makes the
// row a permanent override that outranks the plan. That is the whole difference, and keeping
// them together is what keeps the precedence order stateable in one line.
//
// The list is not here - a user's grants come back with their detail view, because a grant
// only ever makes sense next to the access it modifies.

import { apiError, json, readJson } from '../_lib/http.js';
import { adminDb, adminNotFound, requireAdmin, writeAudit } from '../_lib/adminAuth.js';
import { FEATURE_LABELS, LIMIT_LABELS, isFeatureKey, isLimitKey } from '../../src/entitlements/contract.js';

const MAX_BODY_BYTES = 4_000;

export default {
  async fetch(req: Request): Promise<Response> {
    const gate = await requireAdmin(req, 'admin');
    if (!gate.ok) return gate.response;
    if (req.method !== 'POST') return adminNotFound();

    let body: Record<string, unknown>;
    try {
      body = await readJson<Record<string, unknown>>(req, MAX_BODY_BYTES);
    } catch {
      return apiError('invalid', 'Malformed request.', 400);
    }

    const db = await adminDb();

    if (body.action === 'revoke') {
      const id = typeof body.id === 'string' ? body.id : '';
      if (!id) return apiError('invalid', 'A grant id is required.', 400);

      // Revoking stamps rather than deletes, so "why did this user lose access on the 3rd"
      // stays answerable after the fact.
      const { data, error } = await db
        .from('user_grants')
        .update({ revoked_at: new Date().toISOString() })
        .eq('id', id)
        .is('revoked_at', null)
        .select('user_id, kind, key')
        .maybeSingle();
      if (error) return apiError('internal', 'The grant could not be revoked.', 500);
      if (!data) return apiError('invalid', 'That grant does not exist, or is already revoked.', 400);

      await writeAudit(req, gate.actor, {
        action: 'grant.revoke',
        targetType: 'user',
        targetId: String(data.user_id),
        summary: `revoked the ${data.key} ${data.kind} grant`,
        detail: { grantId: id, key: data.key, kind: data.kind },
      });
      return json({ ok: true });
    }

    if (body.action !== 'create') return apiError('invalid', 'Unknown action.', 400);

    const userId = typeof body.userId === 'string' ? body.userId : '';
    if (!userId) return apiError('invalid', 'A user id is required.', 400);

    const kind = body.kind === 'quota' ? 'quota' : body.kind === 'feature' ? 'feature' : null;
    if (!kind) return apiError('invalid', 'A grant is either a feature or a quota.', 400);

    const key = typeof body.key === 'string' ? body.key : '';
    // The key set is CODE, so it is validated against the contract rather than against a
    // database constraint - a CHECK would need a migration every time a feature is added.
    if (kind === 'feature' && !isFeatureKey(key)) return apiError('invalid', 'Unknown feature.', 400);
    if (kind === 'quota' && !isLimitKey(key)) return apiError('invalid', 'Unknown allowance.', 400);

    let value: boolean | number | null;
    if (kind === 'feature') {
      if (typeof body.value !== 'boolean') return apiError('invalid', 'A feature grant is on or off.', 400);
      value = body.value;
    } else if (body.value === null) {
      value = null; // clears back to the plan's number
    } else if (typeof body.value === 'number' && Number.isFinite(body.value) && body.value >= 0 && body.value <= 1_000_000) {
      value = Math.floor(body.value);
    } else {
      return apiError('invalid', 'An allowance grant needs a number between 0 and 1000000.', 400);
    }

    let expiresAt: string | null = null;
    if (body.expiresAt !== null && body.expiresAt !== undefined && body.expiresAt !== '') {
      if (typeof body.expiresAt !== 'string') return apiError('invalid', 'The expiry must be a date.', 400);
      const parsed = Date.parse(body.expiresAt);
      // A past expiry would create a row that never applies - almost certainly a typo, and
      // silently accepting it means an operator believing they granted something.
      if (!Number.isFinite(parsed) || parsed <= Date.now()) {
        return apiError('invalid', 'The expiry must be in the future.', 400);
      }
      expiresAt = new Date(parsed).toISOString();
    }

    const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 500) : '';

    const { error } = await db.from('user_grants').insert({
      user_id: userId,
      kind,
      key,
      value: { value },
      reason,
      expires_at: expiresAt,
      created_by: gate.actor.userId,
    });
    if (error) return apiError('internal', 'The grant could not be created.', 500);

    const label = kind === 'feature' ? FEATURE_LABELS[key as keyof typeof FEATURE_LABELS] : LIMIT_LABELS[key as keyof typeof LIMIT_LABELS];
    await writeAudit(req, gate.actor, {
      action: expiresAt ? 'grant.create' : 'override.create',
      targetType: 'user',
      targetId: userId,
      summary: `${expiresAt ? 'granted' : 'overrode'} ${label} = ${String(value)}${expiresAt ? ` until ${expiresAt.slice(0, 10)}` : ''}`,
      detail: { kind, key, value, expiresAt, reason },
    });

    return json({ ok: true });
  },
};
