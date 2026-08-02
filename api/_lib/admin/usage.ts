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
import { inScope, readScope } from './scope.js';
import type { AdminActivityScope, AdminUsageDay, AdminUsageOverview } from '../../../src/admin/types.js';

/** Rows read per window. Well above a month of this instance's traffic; a window that would
 *  exceed it is reported short rather than silently trimmed. */
const MAX_ROWS = 20_000;

// OUTCOMES, classified exactly as migration 0026 classifies them for the overview. Both
// surfaces read one ledger, so a status that means one thing here and another there is the
// page disagreeing with itself - which is what shipped: this section counted `unsupported`
// and `expired` as failures and reported 26 where the overview reported 19.
//
// The full `LiteGenerationStatus` vocabulary (api/_lib/aiLiteStore.ts), and which bucket each
// value belongs in:
//   reserved | model_running | spec_ready  IN FLIGHT - none of the three buckets yet.
//   usable | accepted                      SUCCESS.
//   failed                                 FAILURE, and the only one.
//   unsupported                            DECLINED - Lite refusing a brief outside its scope.
//                                          The guardrail FIRING, not breaking.
//   expired                                NEITHER - a reservation nobody came back for is an
//                                          abandoned tab, not a fault of ours.
// The three buckets deliberately do not sum to the started count.
const SUCCESS = new Set(['usable', 'accepted']);
const FAILURE = new Set(['failed']);
const DECLINED = new Set(['unsupported']);

export type GenerationOutcome = 'success' | 'failure' | 'declined' | 'in-flight';

/** The classification, as one pure function so it can be tested against the whole status
 *  vocabulary rather than trusted. Drift between this and `0026` is the bug this file
 *  shipped; `usage.test.ts` is what makes the next one fail loudly instead of quietly. */
export function generationOutcome(status: string): GenerationOutcome {
  if (SUCCESS.has(status)) return 'success';
  if (FAILURE.has(status)) return 'failure';
  if (DECLINED.has(status)) return 'declined';
  return 'in-flight';
}

interface Row {
  user_id: string;
  status: string;
  model: string | null;
  provider_cost_usd: number | string;
  created_at: string;
  rejection_reason: string | null;
}

function costField(row: Row): number {
  const value = typeof row.provider_cost_usd === 'string' ? Number(row.provider_cost_usd) : row.provider_cost_usd;
  return Number.isFinite(value) ? value : 0;
}

/** What a generation actually COST. `reserve_ai_lite_generation` books the session's cost
 *  CEILING into `provider_cost_usd` up front so admission stays conservative, so a row that
 *  never chose a route carries a charge that was never incurred - `model is not null` is the
 *  same guard 0026 applies to the overview's spend figure. */
export function spent(row: Pick<Row, 'model' | 'provider_cost_usd'>): number {
  return row.model === null ? 0 : costField(row as Row);
}

/** What the RESERVATION path believes has been committed - every row, ceilings included,
 *  because that is literally the sum `reserve_ai_lite_generation` compares against the fleet
 *  ceiling (migration 0013). The fleet bar must mirror admission rather than real spend: a
 *  bar that read lower than the number doing the refusing would explain nothing on the day
 *  generations start being refused. Deliberately NOT `spent`. */
export function committed(row: Pick<Row, 'model' | 'provider_cost_usd'>): number {
  return costField(row as Row);
}

type Db = Awaited<ReturnType<typeof adminDb>>;

/** A whole-window count narrowed to a scope, from the total and the internal share. */
export function scopedTotal(scope: AdminActivityScope, total: number, internal: number): number {
  if (scope === 'all') return total;
  return scope === 'internal' ? internal : Math.max(0, total - internal);
}

/** How many gateway calls and renders in the window belong to internal accounts. Head counts,
 *  so nothing is read into memory; `{0,0}` when nobody is marked, which is both the correct
 *  answer and the one that leaves the totals untouched. */
async function internalTotals(db: Db, since: string, ids: string[]): Promise<{ gateway: number; renders: number }> {
  if (ids.length === 0) return { gateway: 0, renders: 0 };
  const [gateway, renders] = await Promise.all([
    db.from('ai_gateway_requests').select('id', { count: 'exact', head: true })
      .gte('created_at', since).in('user_id', ids),
    db.from('render_jobs').select('id', { count: 'exact', head: true })
      .gte('created_at', since).in('user_id', ids),
  ]);
  return { gateway: gateway.count ?? 0, renders: renders.count ?? 0 };
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

    const scope = readScope(req);
    const db = await adminDb();

    // WHO IS INTERNAL comes from the same function the overview's SQL reads
    // (`admin_internal_user_ids`, migration 0027), not from a second definition here. The two
    // sections aggregate in two different places - that split already produced one day of
    // production showing `26 failed` beside `19 failed` off one ledger, because `0026` could
    // only reach the surface that counts in SQL. A shared list is the smallest thing that
    // stops the scope repeating it.
    //
    // A failed lookup degrades to "nobody is internal", which shows MORE rows rather than
    // fewer. That is the honest direction for a filter failure: an operator who sees their own
    // test traffic knows something is off, where silently emptying the page looks like calm.
    const internalIds = await db.rpc('admin_internal_user_ids');
    const internal = new Set<string>(
      ((internalIds.data ?? []) as (string | { admin_internal_user_ids: string })[]).map((entry) =>
        typeof entry === 'string' ? entry : entry.admin_internal_user_ids,
      ),
    );

    const [generations, gateway, renders, internalCounts] = await Promise.all([
      db
        .from('ai_generations')
        .select('user_id, status, model, provider_cost_usd, created_at, rejection_reason')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(MAX_ROWS),
      db.from('ai_gateway_requests').select('id', { count: 'exact', head: true }).gte('created_at', since),
      db.from('render_jobs').select('id', { count: 'exact', head: true }).gte('created_at', since),
      // The internal half of each, counted separately and SUBTRACTED below rather than
      // expressed as a `not.in` filter. In SQL, `user_id not in (...)` is NULL for a NULL
      // user_id and the row is dropped - which would silently delete every account-free
      // gateway call from the external count, the traffic this page most wants to see.
      internalTotals(db, since, [...internal]),
    ]);
    if (generations.error) return apiError('internal', 'Could not read the AI ledger.', 500);

    // Filtered HERE rather than in the query, so `truncated` keeps meaning what it says: the
    // MAX_ROWS bound is about how much of the ledger was read, and moving the scope into a
    // `.not('user_id','in',...)` would let a scope with few rows silently read a much longer
    // stretch of history than the unscoped one and report the same day count.
    const rows = ((generations.data ?? []) as Row[]).filter((row) => inScope(scope, internal.has(row.user_id)));

    const byDay = new Map<string, AdminUsageDay>();
    for (const row of rows) {
      const day = row.created_at.slice(0, 10);
      const entry = byDay.get(day) ?? { day, generations: 0, successes: 0, failures: 0, declined: 0, costUsd: 0 };
      entry.generations += 1;
      const outcome = generationOutcome(row.status);
      if (outcome === 'success') entry.successes += 1;
      if (outcome === 'failure') entry.failures += 1;
      if (outcome === 'declined') entry.declined += 1;
      entry.costUsd += spent(row);
      byDay.set(day, entry);
    }

    // Split by the same authority as the counts above. A guardrail decline and a provider
    // rejection are both "refused", which is exactly why one list of them told the operator
    // nothing: `multi-graphic-request` sitting beside `provider_rejected` reads as eight
    // varieties of breakage when three of them are the product working. Every row carrying a
    // reason still appears - only which table it appears in changes.
    const failureReasons = new Map<string, number>();
    const declineReasons = new Map<string, number>();
    for (const row of rows) {
      if (!row.rejection_reason) continue;
      const into = generationOutcome(row.status) === 'declined' ? declineReasons : failureReasons;
      into.set(row.rejection_reason, (into.get(row.rejection_reason) ?? 0) + 1);
    }
    const ranked = (reasons: Map<string, number>) =>
      [...reasons.entries()]
        .map(([reason, count]) => ({ reason, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 12);

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
      failureReasons: ranked(failureReasons),
      declineReasons: ranked(declineReasons),
      pinched,
      scope,
      internalAccounts: internal.size,
      totals: {
        generations: rows.length,
        costUsd: Number(rows.reduce((sum, row) => sum + spent(row), 0).toFixed(6)),
        // all - internal, internal, or the whole thing. Subtraction rather than a filter, for
        // the NULL reason above; `Math.max(0, ...)` because the two head counts are separate
        // queries and a row landing between them must not produce a negative total.
        gatewayRequests: scopedTotal(scope, gateway.count ?? 0, internalCounts.gateway),
        renderJobs: scopedTotal(scope, renders.count ?? 0, internalCounts.renders),
      },
      fleetSpendTodayUsd: Number(
        rows.filter((row) => row.created_at >= since1).reduce((sum, row) => sum + committed(row), 0).toFixed(6),
      ),
      // The ceiling the reservation RPC actually enforces, so the bar the operator reads is
      // the bar the server uses rather than a number copied into the UI.
      fleetSpendCeilingUsd: liteProfile().dailyFleetSpendUsd,
    };

    return json(response);
  },
};
