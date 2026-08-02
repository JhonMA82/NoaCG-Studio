// /api/admin/user - one account.
//
//   GET  ?id=<uuid>                    the detail view
//   POST { id, action, ... }           suspend | reactivate | assign-plan | reset-allowance
//
// Every action here changes what someone else can do, so every action needs 'admin' and
// every action writes an audit row before returning. The read is 'support'.

import { apiError, json, readJson } from '../http.js';
import { adminDb, adminNotFound, requireAdmin, writeAudit, type AdminActor } from '../adminAuth.js';
import { getUserDetail } from '../adminUsers.js';

const MAX_BODY_BYTES = 4_000;

type Action = 'suspend' | 'reactivate' | 'assign-plan' | 'reset-allowance' | 'set-internal';

interface ActionBody {
  id?: unknown;
  action?: unknown;
  reason?: unknown;
  planId?: unknown;
  expiresAt?: unknown;
}

function isAction(value: unknown): value is Action {
  return value === 'suspend' || value === 'reactivate' || value === 'assign-plan'
    || value === 'reset-allowance' || value === 'set-internal';
}

/** An ISO instant strictly in the future, or null. Anything else is rejected rather than
 *  coerced: a mistyped expiry that silently means "never" is the worst possible outcome for
 *  a temporary grant. */
function futureInstant(value: unknown): string | null | undefined {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') return undefined;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || parsed <= Date.now()) return undefined;
  return new Date(parsed).toISOString();
}

async function setState(
  req: Request,
  actor: AdminActor,
  userId: string,
  state: 'active' | 'suspended',
  reason: string,
): Promise<Response> {
  const db = await adminDb();

  // An admin who suspends themselves locks the instance out of its own controls. The check
  // is here rather than in the UI because the UI is not a security boundary.
  if (state === 'suspended' && userId === actor.userId) {
    return apiError('invalid', 'You cannot suspend your own account.', 400);
  }

  const { error } = await db
    .from('user_accounts')
    .upsert(
      { user_id: userId, state, reason, changed_by: actor.userId, changed_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    );
  if (error) return apiError('internal', 'The account state could not be changed.', 500);

  // The database policies stop writes immediately; this stops the session from being
  // refreshed. Neither can invalidate an access token that has already been issued - see
  // docs/ADMIN.md section 6, which states the window rather than hiding it.
  const banned = await db.auth.admin.updateUserById(userId, {
    ban_duration: state === 'suspended' ? '876000h' : 'none',
  });
  if (banned.error) console.error('admin ban toggle failed:', banned.error.message);

  await writeAudit(req, actor, {
    action: state === 'suspended' ? 'user.suspend' : 'user.reactivate',
    targetType: 'user',
    targetId: userId,
    summary: state === 'suspended' ? `suspended${reason ? `: ${reason}` : ''}` : 'reactivated',
    detail: { reason, sessionRevoked: !banned.error },
  });

  return json({ ok: true, state, sessionRevoked: !banned.error });
}

export default {
  async fetch(req: Request): Promise<Response> {
    const gate = await requireAdmin(req, req.method === 'GET' ? 'support' : 'admin');
    if (!gate.ok) return gate.response;

    if (req.method === 'GET') {
      const id = new URL(req.url).searchParams.get('id') ?? '';
      if (!id) return apiError('invalid', 'A user id is required.', 400);
      try {
        const detail = await getUserDetail(id);
        // An unknown id and a deleted one answer the same way, for the same reason every
        // other refusal on this surface does.
        return detail ? json(detail) : adminNotFound();
      } catch (error) {
        console.error('admin user detail failed:', error instanceof Error ? error.message : error);
        return apiError('internal', 'Could not read that account.', 500);
      }
    }

    if (req.method !== 'POST') return adminNotFound();

    let body: ActionBody;
    try {
      body = await readJson<ActionBody>(req, MAX_BODY_BYTES);
    } catch {
      return apiError('invalid', 'Malformed request.', 400);
    }

    const userId = typeof body.id === 'string' ? body.id : '';
    if (!userId) return apiError('invalid', 'A user id is required.', 400);
    if (!isAction(body.action)) return apiError('invalid', 'Unknown action.', 400);
    const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 500) : '';

    const db = await adminDb();

    if (body.action === 'suspend') return setState(req, gate.actor, userId, 'suspended', reason);
    if (body.action === 'reactivate') return setState(req, gate.actor, userId, 'active', reason);

    // set-internal: is this OUR account - development, testing, a demo?
    //
    // It changes NO ACCESS. Nothing in `src/entitlements/` reads it, no RLS policy names it,
    // and marking an account internal neither grants nor withdraws a single thing. All it does
    // is move that account's rows out of the default admin usage scope (migration 0027), so
    // the dashboard reports what other people are doing rather than what we did while building
    // it. That is why it sits beside suspension rather than beside a grant: same table, same
    // audit trail, entirely different kind of switch.
    //
    // It needs 'admin' like every other action here - not because it is dangerous, but because
    // it changes what every other admin then reads, and a metric quietly reshaped by somebody
    // with read-only access is worse than one anybody can change loudly.
    if (body.action === 'set-internal') {
      const value = (body as { internal?: unknown }).internal;
      if (typeof value !== 'boolean') return apiError('invalid', 'internal must be true or false.', 400);
      const { error } = await db
        .from('user_accounts')
        // Upsert, because a row here exists only once an admin has touched the account -
        // marking an untouched one is the normal case, not the exception. Only the two keys
        // below are written, so an existing row keeps its `state`: marking a suspended account
        // internal must never quietly reactivate it.
        .upsert({ user_id: userId, internal: value }, { onConflict: 'user_id', ignoreDuplicates: false });
      if (error) return apiError('internal', 'The internal mark could not be changed.', 500);

      await writeAudit(req, gate.actor, {
        action: value ? 'user.internal.mark' : 'user.internal.clear',
        targetType: 'user',
        targetId: userId,
        summary: value
          ? `marked internal${reason ? `: ${reason}` : ''} - excluded from the default usage scope`
          : 'no longer internal - counted as an ordinary user again',
        detail: { internal: value, reason },
      });
      return json({ ok: true, internal: value });
    }

    if (body.action === 'assign-plan') {
      const expiresAt = futureInstant(body.expiresAt);
      if (expiresAt === undefined) return apiError('invalid', 'The expiry must be a future date.', 400);

      // planId null clears the assignment, returning the user to the default plan. That is a
      // real operation, not a missing argument, so it is spelled explicitly.
      if (body.planId === null) {
        const { error } = await db.from('user_plans').delete().eq('user_id', userId);
        if (error) return apiError('internal', 'The plan could not be cleared.', 500);
        await writeAudit(req, gate.actor, {
          action: 'user.plan.clear',
          targetType: 'user',
          targetId: userId,
          summary: 'returned to the default plan',
        });
        return json({ ok: true });
      }

      const planId = typeof body.planId === 'string' ? body.planId : '';
      if (!planId) return apiError('invalid', 'A plan id is required.', 400);

      const plan = await db.from('plans').select('key, name, status').eq('id', planId).maybeSingle();
      if (!plan.data) return apiError('invalid', 'That plan does not exist.', 400);
      if (plan.data.status === 'archived') {
        return apiError('invalid', 'That plan is archived. Reactivate it before assigning it.', 400);
      }

      const { error } = await db.from('user_plans').upsert(
        {
          user_id: userId,
          plan_id: planId,
          assigned_by: gate.actor.userId,
          assigned_at: new Date().toISOString(),
          expires_at: expiresAt,
          note: reason,
        },
        { onConflict: 'user_id' },
      );
      if (error) return apiError('internal', 'The plan could not be assigned.', 500);

      await writeAudit(req, gate.actor, {
        action: 'user.plan.assign',
        targetType: 'user',
        targetId: userId,
        summary: `assigned ${plan.data.name}${expiresAt ? ` until ${expiresAt.slice(0, 10)}` : ''}`,
        detail: { planKey: plan.data.key, expiresAt, reason },
      });
      return json({ ok: true });
    }

    // reset-allowance: forgive the window rather than raise the ceiling.
    //
    // The allowance is COMPUTED from the ledger (rows in the last day / 30 days), so there is
    // no counter to zero. Expiring the user's live reservations and marking their recent
    // starts as expired would rewrite accounting history, which the ledger exists to prevent.
    // Instead this drops a temporary quota grant that lasts 24 hours - the user gets their
    // allowance back, the ledger stays true, and the reason is recorded.
    const bump = Number(
      typeof (body as { amount?: unknown }).amount === 'number' ? (body as { amount: number }).amount : 10,
    );
    if (!Number.isFinite(bump) || bump < 1 || bump > 10_000) {
      return apiError('invalid', 'The extra allowance must be between 1 and 10000.', 400);
    }
    const expires = new Date(Date.now() + 86_400_000).toISOString();
    const rows = ['aiDailyStarts', 'aiDailySuccesses'].map((key) => ({
      user_id: userId,
      kind: 'quota',
      key,
      value: { value: Math.floor(bump) },
      reason: reason || 'allowance reset',
      expires_at: expires,
      created_by: gate.actor.userId,
    }));
    const { error } = await db.from('user_grants').insert(rows);
    if (error) return apiError('internal', 'The allowance could not be adjusted.', 500);

    await writeAudit(req, gate.actor, {
      action: 'user.allowance.reset',
      targetType: 'user',
      targetId: userId,
      summary: `daily AI allowance set to ${Math.floor(bump)} for 24 hours`,
      detail: { amount: Math.floor(bump), expiresAt: expires, reason },
    });
    return json({ ok: true, expiresAt: expires });
  },
};
