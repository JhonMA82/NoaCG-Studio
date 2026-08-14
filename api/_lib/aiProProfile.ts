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
// pipeline, and it is a bound rather than a description - docs/NOACG_PRO_PLAN.md §15 replaces
// the current engine, and an allowance that had to be rewritten with it would be built wrong.

import type { GatewayRoutingPolicy, ModelPrice } from './aiGateway.js';
import { approvedModelPrices } from './aiModelCatalog.js';
import { boolEnv, envRoute, intEnv, numberEnv } from './aiLiteProfile.js';
import { PRO_MAX_GENERATION_COST_USD, PRO_STANDARD_ROUTES } from '../../src/ai/pro/contract.js';
import type { ModelRoute } from '../../src/ai/modelTypes.js';

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
   *  them; this profile only says which are funded, priced and audited. */
  routes: ModelRoute[];
  prices: Record<string, ModelPrice>;
  gatewayProviders: string[];
  requireZdr: boolean;
  /** The whole generation's ceiling, every model call together. Mirrors the browser's
   *  PRO_MAX_GENERATION_COST_USD so the two cannot disagree about what a Pro run may cost. */
  maxProviderCostUsd: number;
  /** How many model calls ONE reservation may pay for. Today's pipeline makes two; the rest is
   *  headroom for transient provider retries, and it is a hard bound rather than a guess -
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
  const concept = envRoute(
    process.env.AI_PRO_CONCEPT_PROVIDER,
    process.env.AI_PRO_CONCEPT_MODEL,
    PRO_STANDARD_ROUTES.concept,
  );
  const interpret = envRoute(
    process.env.AI_PRO_INTERPRET_PROVIDER,
    process.env.AI_PRO_INTERPRET_MODEL,
    PRO_STANDARD_ROUTES.interpret,
  );
  return {
    id: 'pro',
    enabled: boolEnv('AI_PRO_ENABLED'),
    // Bumped whenever the hosted contract changes what a generation is held to, so ledger rows
    // stay attributable to the rules that produced them. Same single-source rule as Lite's:
    // the literal below IS the version and `.env.example` ships the variable commented out.
    promptVersion: (process.env.AI_PRO_PROMPT_VERSION ?? 'pro-hosted-v1').trim().slice(0, 64) || 'pro-hosted-v1',
    routes: [concept, interpret],
    // The base table IS the approved-route catalog's audited price snapshot; there is no env
    // price override for Pro, because approving a route is the task registry's job and a
    // per-deployment price edit on a funded surface is how a ceiling quietly stops binding.
    prices: approvedModelPrices(),
    gatewayProviders: providerSlugs(),
    requireZdr: boolEnv('AI_PRO_REQUIRE_ZDR', true),
    maxProviderCostUsd: numberEnv('AI_PRO_MAX_COST_USD', PRO_MAX_GENERATION_COST_USD, 0.001, 1),
    maxCallsPerGeneration: intEnv('AI_PRO_MAX_CALLS', 4, 1, 20),
    // The default allowance is deliberately small. At the measured $0.0777 a generation, three
    // starts a day is about €0.21 of NoaCG's money per user per day, and the target price is
    // ~€0.10 a graphic (~€10 per 100) - so these numbers are what "hosted Pro is free while
    // there is nothing to buy" costs, and they are the knob to move when that changes.
    dailyStarts: intEnv('AI_PRO_DAILY_STARTS', 3, 0, 500),
    monthlyStarts: intEnv('AI_PRO_MONTHLY_STARTS', 10, 0, 5000),
    dailySuccesses: intEnv('AI_PRO_DAILY_SUCCESSES', 2, 0, 500),
    monthlySuccesses: intEnv('AI_PRO_MONTHLY_SUCCESSES', 8, 0, 5000),
    maxConcurrentPerUser: intEnv('AI_PRO_USER_CONCURRENCY', 1, 1, 10),
    maxConcurrentFleet: intEnv('AI_PRO_FLEET_CONCURRENCY', 4, 1, 200),
    dailyFleetSpendUsd: numberEnv('AI_PRO_FLEET_DAILY_SPEND_USD', 5, 0.01, 10_000),
    // An image call is slow, and the whole generation shares one reservation lease.
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
