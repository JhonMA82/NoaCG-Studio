// The MANAGED NoaCG Pro profile: what a hosted Pro generation may cost, how many a user gets,
// and which routes NoaCG's own key will serve. The third task profile, parsed the same clamped,
// typo-tolerant way as the first two (see aiLiteProfile.ts for the shared env readers).
//
// WHY A PROFILE AND NOT JUST A KEY. Pro already reached the managed gateway - api/ai/generate.ts
// hands out `managedAiKey` to any signed-in caller whose plan allows `ai.pro`, and every
// signed-in account allows it by default (src/entitlements/contract.ts DEFAULT_SIGNED_IN_PLAN).
// What did NOT exist was an allowance: no quota, no fleet ceiling, and a per-generation cost
// ceiling enforced only in the BROWSER, which is a cost control rather than a bound
// (src/ai/pro/pipeline.ts ProCostCeilingError). At a measured $0.0777 a generation - 86% of it
// one flat image charge - that is an open tap on a surface with no revenue behind it.
//
// ENABLED IS OFF BY DEFAULT, deliberately, exactly like AI_LITE_ENABLED. Turning hosted Pro on
// spends real money per generation on NoaCG's key; that is an owner decision made against a
// price, not a side effect of deploying this file. Off, the endpoints answer `profile_disabled`
// and the browser falls back to the behaviour it had before: a BYO key, or the offline stub.
//
// THE ENGINE IS NOT ASSUMED. Nothing here names a concept image, an interpretation or a
// reconstruction step. `maxCallsPerGeneration` is the only shape this profile takes on Pro's
// pipeline, and it is a bound rather than a description - docs/NOACG_PRO_PLAN.md §15 replaced
// the engine, and an allowance that had to be rewritten with it would have been built wrong.
//
// FUNDING AN UNUSED ROUTE IS NOT FREE, which is the correction this file carries since
// 2026-08-15 (plan §16, "Defect 2"). The list below is ANDed by `resolveProGate`: every funded
// route must be priced, catalog-approved and not switched off from /admin, or hosted Pro is
// unavailable to everyone. While it read `[concept, interpret]` - the two stages of the RETIRED
// concept-and-reconstruct engine - disabling the image model from the admin surface would have
// taken the whole tier down for a pipeline that never calls it. A funded route is therefore a
// route the product SPENDS on, and today that is exactly one: Phase A's design-language call.

import type { GatewayRoutingPolicy, ModelPrice } from './aiGateway.js';
import { approvedModelPrices } from './aiModelCatalog.js';
import { boolEnv, envRoute, intEnv, numberEnv } from './aiLiteProfile.js';
import { PRO_MAX_GENERATION_COST_USD, PRO_STANDARD_ROUTES } from '../../src/ai/pro/contract.js';
import type { ModelRoute } from '../../src/ai/modelTypes.js';

/**
 * How long a Pro reservation may hold its FLEET slot without the server hearing from it, and
 * how a caller that finds every slot taken should wait.
 *
 * THE PROBLEM THIS SOLVES IS A CLASSROOM. Thirty students press Create within a few seconds of
 * each other; the fleet has far fewer slots than that; and the reservation endpoint answered
 * `shared_capacity` immediately, so most of the room saw an error rather than a queue. Lite has
 * had the answer since its first production round (`aiLiteRateLimit.ts`): retry the ADMISSION
 * with jitter, and hold the slot on a SHORT lease so a dead browser stops owning capacity.
 *
 * Pro needed both, and the second is the one that makes the first work. A Pro reservation was
 * booked for the profile's whole `expiryMs` - fifteen minutes - because unlike Lite the model
 * calls happen in the BROWSER, so nothing server-side marked the work finished. Retrying into a
 * fleet whose slots are held for fifteen minutes is just a slower error. The slot is now leased
 * for one call at a time and RENEWED by every settled call, so a live generation keeps its seat
 * and an abandoned one frees it within a lease.
 *
 * **The spacing follows the first MEASURED turnover.** The original 8 s default was a guess;
 * the first real slot turnover through this route measured 62 s (docs/NOACG_PRO_PLAN.md), and
 * Lite's own rule - space at about half the turnover, so three attempts straddle one full
 * cycle - puts the spacing near 31 s. With that, three attempts cover ~62 s of queue, exactly
 * one slot cycle, where 8 s spacing had a student give up at 24 s against a 62 s cycle and a
 * 30-seat room still mostly saw `shared_capacity`. Still env-tunable without a deploy
 * (`AI_PRO_RETRY_SPACING_MS`, clamped 0.5-60 s), and `POST /api/ai/pro-outcome` keeps
 * recording `runtime_ms` so the number can keep following the fleet's real behaviour.
 * The in-function wait this buys (~62 s worst case) sits well inside the platform's 300 s
 * function budget.
 */
export const PRO_DEFAULT_RETRY_SPACING_MS = 31_000;

/** One classroom behind a NAT may submit 60 requests/minute (the Lite figure, same rooms).
 *  Admission polling may never be less bounded than the work it protects, so the attempt count
 *  is the smaller of that headroom and a hard three. */
const CLASSROOM_NAT_REQUESTS_PER_WINDOW = 60;

export interface ProCapacityRetryPlan {
  maxAttempts: number;
  retrySpacingMs: number;
  activeLeaseMs: number;
}

export function proCapacityRetryPlan(profile: ProProfile): ProCapacityRetryPlan {
  const slots = Math.max(1, Math.floor(profile.maxConcurrentFleet));
  const classroomHeadroom = Math.max(1, Math.floor(CLASSROOM_NAT_REQUESTS_PER_WINDOW / slots));
  return {
    maxAttempts: Math.max(1, Math.min(3, classroomHeadroom)),
    retrySpacingMs: intEnv('AI_PRO_RETRY_SPACING_MS', PRO_DEFAULT_RETRY_SPACING_MS, 500, 60_000),
    // ONE call's configured timeout plus an equal margin for the browser work between calls
    // (the downscale, the compile, the runtime bench). Derived from a configured bound rather
    // than from an invented duration, and renewed per settled call - so the number only has to
    // cover the gap between two server touches, never the whole generation.
    activeLeaseMs: Math.max(1, Math.floor(profile.timeoutMs)) * 2,
  };
}

/** The audited provider slugs a managed Pro call may be served by, same shape as Lite's. */
function providerSlugs(): string[] {
  return (process.env.AI_PRO_GATEWAY_PROVIDERS ?? process.env.AI_LITE_GATEWAY_PROVIDERS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, 8);
}

export interface ProProfile {
  id: 'pro';
  enabled: boolean;
  promptVersion: string;
  /** Every route a hosted Pro generation is allowed to spend on. The pipeline picks among
   *  them; this profile only says which are funded, priced and audited.
   *
   *  It stays an ARRAY although Phase A spends one route: `resolveProGate`, `proTaskProfile`
   *  and `proRouteFunded` all read it as a set, and a shape change to say "there is one now"
   *  would have to be undone the first time a stage is added back. */
  routes: ModelRoute[];
  prices: Record<string, ModelPrice>;
  gatewayProviders: string[];
  requireZdr: boolean;
  /** The whole generation's ceiling, every model call together. Mirrors the browser's
   *  PRO_MAX_GENERATION_COST_USD so the two cannot disagree about what a Pro run may cost. */
  maxProviderCostUsd: number;
  /** How many model calls ONE reservation may pay for. Phase A's pipeline makes one; the rest
   *  is headroom for transient provider retries, and it is a hard bound rather than a guess -
   *  without it a generation id is an unbounded spend handle, which is the lesson
   *  `judgeMaxPerGeneration` already paid for. */
  maxCallsPerGeneration: number;
  dailyStarts: number;
  monthlyStarts: number;
  dailySuccesses: number;
  monthlySuccesses: number;
  maxConcurrentPerUser: number;
  maxConcurrentFleet: number;
  dailyFleetSpendUsd: number;
  timeoutMs: number;
  expiryMs: number;
  /** Development/evaluation overrides, server-validated user ids from private config. */
  overrideUserIds: string[];
}

export function proProfile(): ProProfile {
  const language = envRoute(
    process.env.AI_PRO_LANGUAGE_PROVIDER,
    process.env.AI_PRO_LANGUAGE_MODEL,
    PRO_STANDARD_ROUTES.language,
  );
  return {
    id: 'pro',
    enabled: boolEnv('AI_PRO_ENABLED'),
    // Bumped whenever the hosted contract changes what a generation is held to, so ledger rows
    // stay attributable to the rules that produced them. Same single-source rule as Lite's:
    // the literal below IS the version and `.env.example` ships the variable commented out.
    promptVersion: (process.env.AI_PRO_PROMPT_VERSION ?? 'pro-hosted-v1').trim().slice(0, 64) || 'pro-hosted-v1',
    routes: [language],
    // The base table IS the approved-route catalog's audited price snapshot; there is no env
    // price override for Pro, because approving a route is the task registry's job and a
    // per-deployment price edit on a funded surface is how a ceiling quietly stops binding.
    prices: approvedModelPrices(),
    gatewayProviders: providerSlugs(),
    requireZdr: boolEnv('AI_PRO_REQUIRE_ZDR', true),
    maxProviderCostUsd: numberEnv('AI_PRO_MAX_COST_USD', PRO_MAX_GENERATION_COST_USD, 0.001, 1),
    maxCallsPerGeneration: intEnv('AI_PRO_MAX_CALLS', 4, 1, 20),
    // The default allowance is deliberately small. It was set against the RETIRED engine's
    // $0.0777 a generation, where three starts a day was about €0.21 of NoaCG's money per user
    // per day; Phase A measured $0.0039 (plan §16), so the same three starts now cost about a
    // cent. The numbers are left where they are rather than widened here - what a free tier
    // hands out is an owner decision against the target price (~€0.10 a graphic), not a
    // consequence of the engine getting cheaper - but they are the knob, and they are now
    // twenty times more conservative than they read.
    dailyStarts: intEnv('AI_PRO_DAILY_STARTS', 3, 0, 500),
    monthlyStarts: intEnv('AI_PRO_MONTHLY_STARTS', 10, 0, 5000),
    dailySuccesses: intEnv('AI_PRO_DAILY_SUCCESSES', 2, 0, 500),
    monthlySuccesses: intEnv('AI_PRO_MONTHLY_SUCCESSES', 8, 0, 5000),
    maxConcurrentPerUser: intEnv('AI_PRO_USER_CONCURRENCY', 1, 1, 10),
    maxConcurrentFleet: intEnv('AI_PRO_FLEET_CONCURRENCY', 4, 1, 200),
    dailyFleetSpendUsd: numberEnv('AI_PRO_FLEET_DAILY_SPEND_USD', 5, 0.01, 10_000),
    // Generous on purpose: the whole generation shares one reservation lease, and this number
    // is also half of `activeLeaseMs` below. Phase A's measured runtime is ~10 s.
    timeoutMs: intEnv('AI_PRO_TIMEOUT_MS', 120_000, 5000, 300_000),
    expiryMs: intEnv('AI_PRO_EXPIRY_MINUTES', 15, 5, 120) * 60_000,
    overrideUserIds: (process.env.AI_PRO_OVERRIDE_USER_IDS ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
      .slice(0, 100),
  };
}

/** Development/evaluation overrides require a server-validated user id from private config. */
export function proProfileForUser(profile: ProProfile, userId: string): ProProfile {
  if (!profile.overrideUserIds.includes(userId)) return profile;
  return {
    ...profile,
    dailyStarts: 1000,
    monthlyStarts: 1000,
    dailySuccesses: 1000,
    monthlySuccesses: 1000,
    maxConcurrentPerUser: Math.max(profile.maxConcurrentPerUser, 2),
  };
}

export function proRoutePrice(profile: ProProfile, route: ModelRoute): ModelPrice | null {
  return profile.prices[`${route.provider}:${route.model}`] ?? null;
}

/** Is this route one the hosted profile funds? The gateway proxy asks before it hands out the
 *  managed key, so an env repoint at an unpriced or unapproved model is refused rather than
 *  billed. A non-gateway provider is out of scope here: those are BYO routes by definition. */
export function proRouteFunded(profile: ProProfile, route: ModelRoute): boolean {
  if (route.provider !== 'vercel') return false;
  return profile.routes.some((allowed) => allowed.provider === route.provider && allowed.model === route.model)
    && Boolean(proRoutePrice(profile, route))
    && profile.gatewayProviders.length > 0;
}

/** The gateway routing policy for a managed Pro call. Pro already had one through
 *  `surfaceRoutePolicy`; this is the profile-owned version, carrying the same ZDR and
 *  no-training posture plus the audited provider allowlist Lite has always sent. */
export function proGatewayPolicy(profile: ProProfile, route: ModelRoute): GatewayRoutingPolicy | undefined {
  if (route.provider !== 'vercel') return undefined;
  if (!proRoutePrice(profile, route) || profile.gatewayProviders.length === 0) return undefined;
  return {
    zeroDataRetention: profile.requireZdr,
    disallowPromptTraining: true,
    only: profile.gatewayProviders,
    sort: 'cost',
    tags: ['surface:pro'],
  };
}
