// GET /api/admin/overview - is the product working, is anyone using it, and what is it costing.
//
// This is the landing section, so it is also the one most likely to be read quickly and acted
// on. That shapes every decision in here:
//
// NOTHING IS ESTIMATED. Every figure is a count of rows the product already writes. Where a
// question cannot be answered from those rows it is NOT answered - `notTracked` names it on
// the page instead, because an absent metric that goes unexplained reads as a zero, and a zero
// is something an operator acts on.
//
// THE AGGREGATION IS IN SQL. `funnel_events` takes a row per page load, and this endpoint
// needs six windows of it at once; reading it into the function and counting in JavaScript is
// the shape that stops working first (docs/ADMIN.md §6). The three functions in migration
// 0024 do the counting where the indexes are, and this handler only decides WHICH WINDOWS -
// which is also why the reporting timezone lives in TypeScript (periods.ts) and nowhere else.
//
// IT DEGRADES, IT DOES NOT FAIL. A database that has not had 0024 applied answers
// `available: false` and the page says the aggregation is not installed. A failed system read
// costs the fleet line, not the dashboard. Nothing here can take /admin down.
//
// CONTENT-FREE, like every other admin surface: counts, ids, enumerated slugs and money. No
// prompt, brief, project name, template body, imported asset or free-text feedback can reach
// this response - the ledgers it reads deliberately cannot hold any (docs/FUNNEL_EVENTS.md,
// src/ai/AGENTS.md). Free text a user deliberately WROTE has its own table and its own
// section (`user_feedback`, migration 0028); it never joins these aggregates.
//
// IT COUNTS OTHER PEOPLE BY DEFAULT. `?scope=` picks external (the default), internal or all
// (migration 0027). Without it every number on this instance was a number about its own
// operator: all 43 Lite generations, 92 of 93 gateway calls, every render and four of six
// creates were produced while building and testing the product. The scope is echoed back so
// the page can say which one it is showing - a filtered total that does not announce itself is
// worse than an unfiltered one.

import { json, methodGuard } from '../http.js';
import { requireAdmin, adminDb } from '../adminAuth.js';
import { liteProfile } from '../aiLiteProfile.js';
import { reportTimezone, reportingPeriods, type Period } from './periods.js';
import { readScope } from './scope.js';
import type {
  AdminActivityScope,
  AdminLedgerId,
  AdminOverviewMetrics,
  AdminOverviewMixEntry,
  AdminOverviewResponse,
  AdminOverviewState,
  AdminOverviewWindow,
} from '../../../src/admin/types.js';

/** What an operator will look for and not find. Named rather than omitted: the difference
 *  between "nobody exported anything" and "we never counted" is the whole value of the page. */
const NOT_TRACKED = [
  'Export failures. The funnel records an export only once the package reaches the disk, so '
    + 'every export figure is a success count and no success RATE can be computed from it.',
  'Which template or category a graphic was made from. The creation event records the DOOR '
    + '(catalog, AI, import, blank, kit, video), not the variant - so per-template popularity '
    + 'is not available from this ledger.',
  'Video projects created before the release that added the event. Earlier periods read zero '
    + 'because nothing was counting, not because nobody made one.',
  'Local preview and local export activity. Only cloud renders reach a server, and the funnel '
    + 'is inert for anyone self-hosting, opted out, or sending Do Not Track.',
];

interface WindowRow {
  new_accounts: number | string;
  active_visitors: number | string;
  active_accounts: number | string;
  visits: number | string;
  signups: number | string;
  graphics_created: number | string;
  videos_created: number | string;
  creating_visitors: number | string;
  first_time_creators: number | string;
  anonymous_creates: number | string;
  signed_in_creates: number | string;
  anonymous_graphics: number | string;
  anonymous_creators: number | string;
  exports: number | string;
  exporting_visitors: number | string;
  anonymous_exports: number | string;
  ai_generations: number | string;
  ai_successes: number | string;
  ai_failures: number | string;
  ai_declined: number | string;
  ai_users: number | string;
  ai_cost_usd: number | string;
  gateway_managed: number | string;
  gateway_byo: number | string;
  anonymous_gateway_calls: number | string;
  gateway_managed_cost_usd: number | string;
  gateway_failures: number | string;
  renders_started: number | string;
  renders_delivered: number | string;
  renders_failed: number | string;
  render_median_ms: number | string | null;
}

/** bigint and numeric both arrive as STRINGS through PostgREST. Adding one as a string
 *  concatenates, and rendering one unconverted shows a plausible-looking number that is
 *  actually text - so every field goes through here. */
function count(value: number | string | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const parsed = typeof value === 'string' ? Number(value) : value;
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value: number | string | null | undefined): number {
  return Number(count(value).toFixed(6));
}

function metrics(row: WindowRow): AdminOverviewMetrics {
  return {
    newAccounts: count(row.new_accounts),
    activeVisitors: count(row.active_visitors),
    activeAccounts: count(row.active_accounts),
    visits: count(row.visits),
    signups: count(row.signups),
    graphicsCreated: count(row.graphics_created),
    videosCreated: count(row.videos_created),
    creatingVisitors: count(row.creating_visitors),
    firstTimeCreators: count(row.first_time_creators),
    anonymousCreates: count(row.anonymous_creates),
    signedInCreates: count(row.signed_in_creates),
    anonymousGraphics: count(row.anonymous_graphics),
    anonymousCreators: count(row.anonymous_creators),
    exports: count(row.exports),
    exportingVisitors: count(row.exporting_visitors),
    anonymousExports: count(row.anonymous_exports),
    aiGenerations: count(row.ai_generations),
    aiSuccesses: count(row.ai_successes),
    aiFailures: count(row.ai_failures),
    aiDeclined: count(row.ai_declined),
    aiUsers: count(row.ai_users),
    aiCostUsd: money(row.ai_cost_usd),
    gatewayManaged: count(row.gateway_managed),
    gatewayByo: count(row.gateway_byo),
    anonymousGatewayCalls: count(row.anonymous_gateway_calls),
    gatewayManagedCostUsd: money(row.gateway_managed_cost_usd),
    gatewayFailures: count(row.gateway_failures),
    rendersStarted: count(row.renders_started),
    rendersDelivered: count(row.renders_delivered),
    rendersFailed: count(row.renders_failed),
    // Null, not zero: "nothing completed" and "every render was instant" are different
    // answers and only one of them is good news.
    renderMedianMs: row.render_median_ms === null || row.render_median_ms === undefined
      ? null
      : count(row.render_median_ms),
  };
}

type Db = Awaited<ReturnType<typeof adminDb>>;

/** One window, or null when the aggregation could not be read. Deliberately not throwing:
 *  a comparison span that fails must cost the comparison, not the whole dashboard. */
async function readWindow(
  db: Db,
  from: Date,
  to: Date,
  scope: AdminActivityScope,
): Promise<AdminOverviewMetrics | null> {
  const { data, error } = await db.rpc('admin_overview_window', {
    p_from: from.toISOString(),
    p_to: to.toISOString(),
    p_scope: scope,
  });
  if (error || !data) return null;
  const row = (Array.isArray(data) ? data[0] : data) as WindowRow | undefined;
  return row ? metrics(row) : null;
}

export default {
  async fetch(req: Request): Promise<Response> {
    const gate = await requireAdmin(req, 'support');
    if (!gate.ok) return gate.response;
    const guard = methodGuard(req, 'GET');
    if (guard) return guard;

    const now = new Date();
    const timezone = reportTimezone();
    const periods = reportingPeriods(now, timezone);
    const scope = readScope(req);

    const db = await adminDb();

    // Six window reads, the state read and the mix read, all concurrent. Each is a bounded
    // indexed aggregate rather than a row fetch, so the cost of the page is a fixed number of
    // small queries no matter how far the ledgers have grown.
    const windowReads = await Promise.all(
      periods.map(async (period: Period) => {
        const [current, previous] = await Promise.all([
          readWindow(db, period.from, period.to, scope),
          readWindow(db, period.previousFrom, period.previousTo, scope),
        ]);
        return { period, current, previous };
      }),
    );

    // The fleet bar is measured the way the RESERVATION RPC measures it - a rolling 24 hours
    // over the Lite ledger alone (ai_lite_usage, migration 0010) - and not as the calendar day
    // beside it. They differ by hours and by which ledger counts, and a bar drawn against a
    // ceiling that is enforced on a different number is worse than no bar.
    const rolling24h = await readWindow(db, new Date(now.getTime() - 86_400_000), now, scope);

    const [stateResult, mixResult] = await Promise.all([
      db.rpc('admin_overview_state', { p_scope: scope }),
      db.rpc('admin_overview_mix', {
        p_from: (periods.filter((period) => period.id === 'month')[0] ?? periods[0]).from.toISOString(),
        p_to: now.toISOString(),
        p_scope: scope,
      }),
    ]);

    const stateRow = (Array.isArray(stateResult.data) ? stateResult.data[0] : stateResult.data) as
      | Record<string, number | string | null>
      | undefined;
    const state: AdminOverviewState | null = stateResult.error || !stateRow
      ? null
      : {
          totalAccounts: count(stateRow.total_accounts),
          suspendedAccounts: count(stateRow.suspended_accounts),
          accountsNeverCreated: count(stateRow.accounts_never_created),
          internalAccounts: count(stateRow.internal_accounts),
          activeGrants: count(stateRow.active_grants),
          grantsExpiringSoon: count(stateRow.grants_expiring_soon),
          rendersInFlight: count(stateRow.renders_in_flight),
          rendersOverdue: count(stateRow.renders_overdue),
          accountsSince: (stateRow.accounts_since as string | null) ?? null,
          funnelSince: (stateRow.funnel_since as string | null) ?? null,
          generationsSince: (stateRow.generations_since as string | null) ?? null,
          gatewaySince: (stateRow.gateway_since as string | null) ?? null,
          rendersSince: (stateRow.renders_since as string | null) ?? null,
        };

    // A comparison span that starts before a ledger does is not a comparison - it is this period
    // measured against a stretch of time that ledger was not recording, and the difference
    // renders as growth when what actually changed is that counting began.
    //
    // PER LEDGER, not per window. These were switched on months apart - accounts since the
    // project started, the funnel days ago - so one flag for the whole window would have to be
    // driven by the youngest, and would then withhold a registration trend that is perfectly
    // well evidenced. Each metric declares its ledger on the page, and only the ones counted
    // from a short ledger lose their comparison.
    const floors: [AdminLedgerId, string | null][] = [
      ['accounts', state?.accountsSince ?? null],
      ['funnel', state?.funnelSince ?? null],
      ['lite', state?.generationsSince ?? null],
      ['gateway', state?.gatewaySince ?? null],
      ['render', state?.rendersSince ?? null],
    ];

    /** The ledgers whose first row lands INSIDE the comparison span, so part of that span
     *  predates them. A ledger with no rows at all has no floor to compare against and is left
     *  alone - it reports zero in both spans, and zero against zero is a true "no change". */
    function partialLedgers(previousFrom: Date): AdminLedgerId[] {
      const partial: AdminLedgerId[] = [];
      for (const [id, since] of floors) {
        if (!since) continue;
        const floor = Date.parse(since);
        if (Number.isFinite(floor) && previousFrom.getTime() < floor) partial.push(id);
      }
      return partial;
    }

    const windows: AdminOverviewWindow[] = windowReads
      .filter((entry) => entry.current !== null)
      .map((entry) => ({
        id: entry.period.id,
        from: entry.period.from.toISOString(),
        to: entry.period.to.toISOString(),
        previousFrom: entry.period.previousFrom.toISOString(),
        previousTo: entry.period.previousTo.toISOString(),
        metrics: entry.current as AdminOverviewMetrics,
        previous: entry.previous,
        previousPartialLedgers: partialLedgers(entry.period.previousFrom),
      }));

    const mix: AdminOverviewMixEntry[] = mixResult.error
      ? []
      : ((mixResult.data ?? []) as { bucket: string; key: string; total: number | string }[]).map((row) => ({
          bucket: String(row.bucket),
          key: String(row.key),
          count: count(row.total),
        }));

    // The ceiling itself is read from the live profile rather than copied into the UI, for the
    // same reason: the bar the operator reads has to be the bar the server uses.
    const fleet: AdminOverviewResponse['fleet'] = rolling24h
      ? { spendLast24hUsd: rolling24h.aiCostUsd, ceilingUsd: liteProfile().dailyFleetSpendUsd }
      : null;

    const response: AdminOverviewResponse = {
      scope,
      // Read off the state row, which reports it unfiltered on purpose - and defaults to zero
      // when the aggregation is missing, which is the same answer as "nothing is marked". Both
      // mean the filter is showing everything, and the page says so either way.
      internalAccounts: state?.internalAccounts ?? 0,
      timezone,
      generatedAt: now.toISOString(),
      windows,
      state,
      mix,
      // The whole aggregation is one migration. If none of the six windows came back, this
      // database has not had it applied, and saying so is the only honest answer - a page of
      // zeroes would be indistinguishable from an instance nobody uses.
      available: windows.length > 0,
      fleet,
      notTracked: NOT_TRACKED,
    };

    return json(response);
  },
};
