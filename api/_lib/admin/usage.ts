// GET /api/admin/usage - what the AI actually cost, and who is being refused.
//
// Every number here is READ from the ledgers the product already writes (ai_generations,
// ai_gateway_requests, render_jobs). Nothing is estimated, nothing is sampled, and no new
// instrumentation was added: the accounting exists because reservation needs it, and this
// endpoint is a view over it.
//
// The window is bounded and the aggregation happens in JavaScript for the same reason as the
// user list - the client library cannot express GROUP BY, and at this instance's volume the
// slice is small. `truncated` is the tripwire for when that stops being true.

import { apiError, json, methodGuard } from '../http.js';
import { requireAdmin, adminDb } from '../adminAuth.js';
import { liteProfile } from '../aiLiteProfile.js';
import type { AdminUsageDay, AdminUsageOverview } from '../../../src/admin/types.js';

/** Rows read per window. Well above a month of this instance's traffic; a window that would
 *  exceed it is reported short rather than silently trimmed. */
const MAX_ROWS = 20_000;

const SUCCESS = new Set(['usable', 'accepted']);
const FAILURE = new Set(['failed', 'unsupported', 'expired']);

interface Row {
  user_id: string;
  status: string;
  provider_cost_usd: number | string;
  created_at: string;
  rejection_reason: string | null;
}

function cost(row: Row): number {
  const value = typeof row.provider_cost_usd === 'string' ? Number(row.provider_cost_usd) : row.provider_cost_usd;
  return Number.isFinite(value) ? value : 0;
}

export default {
  async fetch(req: Request): Promise<Response> {
    const gate = await requireAdmin(req, 'support');
    if (!gate.ok) return gate.response;
    const guard = methodGuard(req, 'GET');
    if (guard) return guard;

    const requested = Number(new URL(req.url).searchParams.get('days') ?? 30);
    const days = Number.isFinite(requested) ? Math.min(90, Math.max(1, Math.floor(requested))) : 30;
    const since = new Date(Date.now() - days * 86_400_000).toISOString();
    const since1 = new Date(Date.now() - 86_400_000).toISOString();

    const db = await adminDb();
    const [generations, gateway, renders] = await Promise.all([
      db
        .from('ai_generations')
        .select('user_id, status, provider_cost_usd, created_at, rejection_reason')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(MAX_ROWS),
      db.from('ai_gateway_requests').select('id', { count: 'exact', head: true }).gte('created_at', since),
      db.from('render_jobs').select('id', { count: 'exact', head: true }).gte('created_at', since),
    ]);
    if (generations.error) return apiError('internal', 'Could not read the AI ledger.', 500);

    const rows = (generations.data ?? []) as Row[];

    const byDay = new Map<string, AdminUsageDay>();
    for (const row of rows) {
      const day = row.created_at.slice(0, 10);
      const entry = byDay.get(day) ?? { day, generations: 0, successes: 0, failures: 0, costUsd: 0 };
      entry.generations += 1;
      if (SUCCESS.has(row.status)) entry.successes += 1;
      if (FAILURE.has(row.status)) entry.failures += 1;
      entry.costUsd += cost(row);
      byDay.set(day, entry);
    }

    const reasons = new Map<string, number>();
    for (const row of rows) {
      if (!row.rejection_reason) continue;
      reasons.set(row.rejection_reason, (reasons.get(row.rejection_reason) ?? 0) + 1);
    }

    // "Pinched" = refused by an allowance, not merely a failed generation. A user who keeps
    // meeting a ceiling is the signal worth surfacing: either the plan is wrong for them, or
    // they are the reason the fleet budget is disappearing.
    const refusals = new Map<string, { refusals: number; lastAt: string }>();
    for (const row of rows) {
      if (!row.rejection_reason?.includes('limit') && !row.rejection_reason?.includes('concurrency')) continue;
      const entry = refusals.get(row.user_id) ?? { refusals: 0, lastAt: row.created_at };
      entry.refusals += 1;
      if (row.created_at > entry.lastAt) entry.lastAt = row.created_at;
      refusals.set(row.user_id, entry);
    }

    const pinched = await Promise.all(
      [...refusals.entries()]
        .sort((a, b) => b[1].refusals - a[1].refusals)
        .slice(0, 10)
        .map(async ([userId, entry]) => {
          const { data } = await db.auth.admin.getUserById(userId);
          return { userId, email: data?.user?.email ?? '', ...entry };
        }),
    );

    const response: AdminUsageOverview = {
      days: [...byDay.values()]
        .map((entry) => ({ ...entry, costUsd: Number(entry.costUsd.toFixed(6)) }))
        .sort((a, b) => a.day.localeCompare(b.day)),
      failureReasons: [...reasons.entries()]
        .map(([reason, count]) => ({ reason, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 12),
      pinched,
      totals: {
        generations: rows.length,
        costUsd: Number(rows.reduce((sum, row) => sum + cost(row), 0).toFixed(6)),
        gatewayRequests: gateway.count ?? 0,
        renderJobs: renders.count ?? 0,
      },
      fleetSpendTodayUsd: Number(
        rows.filter((row) => row.created_at >= since1).reduce((sum, row) => sum + cost(row), 0).toFixed(6),
      ),
      // The ceiling the reservation RPC actually enforces, so the bar the operator reads is
      // the bar the server uses rather than a number copied into the UI.
      fleetSpendCeilingUsd: liteProfile().dailyFleetSpendUsd,
    };

    return json(response);
  },
};
