// The server-side entitlement loader: rows in, one resolved Entitlement out.
//
// It does no deciding. Precedence, expiry, suspension and the source labels all live in the
// pure contract (src/entitlements/contract.ts), which the browser and the tests use too;
// this module's whole job is fetching the four inputs that contract needs and handing them
// over. Splitting it that way is what keeps "why does this user have access" answerable with
// the same code that granted it.
//
// FAILURE POSTURE: every load failure degrades to the built-in defaults rather than throwing.
// A deployment with no Supabase configuration has no plans to read and must keep working
// exactly as it does today; a deployment whose database is briefly unreachable must not start
// refusing renders because a plans lookup timed out. Both land on DEFAULT_SIGNED_IN_PLAN,
// which is today's behaviour written down - so the degraded answer is the correct answer.
//
// It is also NOT the sign-in check. Callers resolve for whoever they already authenticated:
// pass null for an anonymous request and the anonymous defaults come back.

import {
  enforceableLimit,
  resolveEntitlement,
  type AccountState,
  type Entitlement,
  type GrantShape,
  type PlanShape,
} from '../../src/entitlements/contract.js';
import { adminDb, adminConfigured } from './adminAuth.js';
import { liteProfile, type LiteProfile } from './aiLiteProfile.js';

interface PlanRow {
  key: string;
  name: string;
  features: unknown;
  limits: unknown;
  render_tier: string;
  render_formats: string[] | null;
}

interface GrantRow {
  id: string;
  kind: string;
  key: string;
  value: unknown;
  reason: string | null;
  starts_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
}

/** A jsonb column arrives as `unknown`. Accept only a plain object; anything else (a string, an
 *  array, null) is treated as "the plan sets nothing", which falls through to the defaults. */
function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function toPlan(row: PlanRow): PlanShape {
  const features: PlanShape['features'] = {};
  for (const [key, value] of Object.entries(record(row.features))) {
    if (typeof value === 'boolean') Object.assign(features, { [key]: value });
  }
  const limits: PlanShape['limits'] = {};
  for (const [key, value] of Object.entries(record(row.limits))) {
    if (typeof value === 'number' || value === null) Object.assign(limits, { [key]: value });
  }
  return {
    key: row.key,
    name: row.name,
    features,
    limits,
    renderTier: row.render_tier,
    renderFormats: row.render_formats,
  };
}

function toGrant(row: GrantRow): GrantShape | null {
  if (row.kind !== 'feature' && row.kind !== 'quota') return null;
  // The value column wraps its payload ({"value": …}) so one column can hold either type.
  // A row that does not match that shape is dropped rather than guessed at - a malformed
  // grant must not become an accidental allowance.
  const wrapped = record(row.value);
  if (!('value' in wrapped)) return null;
  const value = wrapped.value;
  if (typeof value !== 'boolean' && typeof value !== 'number' && value !== null) return null;
  return {
    id: row.id,
    kind: row.kind,
    key: row.key,
    value,
    reason: row.reason ?? '',
    startsAt: row.starts_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
  };
}

export interface EntitlementRows {
  accountState: AccountState;
  plan: PlanShape | null;
  grants: GrantShape[];
}

const EMPTY: EntitlementRows = { accountState: 'active', plan: null, grants: [] };

/**
 * Fetch the rows for one user. Exported so the admin surface can show what was loaded next to
 * what it resolved to, which is how a wrong answer becomes debuggable rather than mysterious.
 */
export async function loadEntitlementRows(userId: string): Promise<EntitlementRows> {
  if (!adminConfigured()) return EMPTY;
  try {
    const db = await adminDb();
    const [account, assignment, grants] = await Promise.all([
      db.from('user_accounts').select('state').eq('user_id', userId).maybeSingle(),
      db
        .from('user_plans')
        .select('expires_at, plans!inner(key, name, features, limits, render_tier, render_formats)')
        .eq('user_id', userId)
        .maybeSingle(),
      db
        .from('user_grants')
        .select('id, kind, key, value, reason, starts_at, expires_at, revoked_at')
        .eq('user_id', userId)
        .is('revoked_at', null),
    ]);

    const state = account.data?.state === 'suspended' ? 'suspended' : 'active';

    // An EXPIRED plan assignment is not an assignment. Handling it here rather than in the
    // contract keeps the merge free of a second expiry concept: the contract sees either a
    // plan or no plan, exactly as it does for a user who was never assigned one.
    const assigned = assignment.data as { expires_at: string | null; plans: PlanRow | PlanRow[] } | null;
    const expired = assigned?.expires_at ? Date.parse(assigned.expires_at) <= Date.now() : false;
    const planRow = Array.isArray(assigned?.plans) ? assigned?.plans[0] : assigned?.plans;
    const plan = planRow && !expired ? toPlan(planRow) : null;

    const rows = (grants.data ?? []) as GrantRow[];
    return { accountState: state, plan, grants: rows.map(toGrant).filter((g): g is GrantShape => g !== null) };
  } catch {
    return EMPTY;
  }
}

/**
 * The one call every gated server path makes. `userId` null resolves the anonymous defaults
 * without touching the database.
 */
export async function resolveUserEntitlement(userId: string | null): Promise<Entitlement> {
  if (!userId) {
    return resolveEntitlement({ userId: null, ...EMPTY, now: new Date().toISOString() });
  }
  const rows = await loadEntitlementRows(userId);
  return resolveEntitlement({
    userId,
    ...rows,
    now: new Date().toISOString(),
    // The legacy AI_LITE_OVERRIDE_USER_IDS list, resolved as a source the admin page can name
    // rather than as invisible behaviour. Removed one release after plans ship (docs/ADMIN.md).
    envOverride: liteProfile().overrideUserIds.includes(userId),
  });
}

/**
 * Fold a resolved entitlement's AI allowances into a Lite profile.
 *
 * Only the five numbers a plan can express move; routes, prompts, token budgets, timeouts and
 * the fleet ceilings are deployment configuration and stay where they are. A plan must be able
 * to say "this user gets more generations", not "this user gets a different model" - the model
 * catalog is an audited, benchmarked list (docs/AI_TASK_REGISTRY.md) and an entitlement is not
 * a way around it.
 *
 * A limit of null means inherit, so with no plan configured this returns the profile it was
 * given, unchanged.
 */
export function applyEntitlementToLiteProfile(profile: LiteProfile, entitlement: Entitlement): LiteProfile {
  const pick = (key: Parameters<typeof enforceableLimit>[1], current: number): number => {
    const limit = enforceableLimit(entitlement, key);
    return limit === null ? current : Math.max(0, Math.floor(limit));
  };
  return {
    ...profile,
    dailyStarts: pick('aiDailyStarts', profile.dailyStarts),
    monthlyStarts: pick('aiMonthlyStarts', profile.monthlyStarts),
    dailySuccesses: pick('aiDailySuccesses', profile.dailySuccesses),
    monthlySuccesses: pick('aiMonthlySuccesses', profile.monthlySuccesses),
    // The per-user concurrency floor of 1 is load-bearing: a plan that set it to 0 would make
    // every reservation fail admission with no way for the user to tell why.
    maxConcurrentPerUser: Math.max(1, pick('aiUserConcurrency', profile.maxConcurrentPerUser)),
  };
}
