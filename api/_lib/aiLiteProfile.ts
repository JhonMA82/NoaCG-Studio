import type { GatewayRoutingPolicy, ModelPrice } from './aiGateway.js';
import { approvedModelPrices } from './aiModelCatalog.js';
import type { AiProviderId, ModelRoute } from '../../src/ai/modelTypes.js';
import { LITE_AI_CATEGORIES } from '../../src/ai/liteContract.js';
import type { LitePublicLimits } from '../../src/ai/liteTypes.js';

// Shared AI-profile env readers: exported because every managed task profile
// (aiImportAnalysisProfile.ts is the second) parses its knobs the same clamped,
// typo-tolerant way - a malformed value falls back rather than removing a guard.
export const intEnv = (name: string, fallback: number, min: number, max: number): number => {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, Math.round(parsed))) : fallback;
};

export const numberEnv = (name: string, fallback: number, min: number, max: number): number => {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
};

export const boolEnv = (name: string, fallback = false): boolean => {
  const value = process.env[name]?.trim().toLowerCase();
  if (!value) return fallback;
  return value === '1' || value === 'true' || value === 'yes' || value === 'on';
};

export function envRoute(providerName: string | undefined, modelName: string | undefined, fallback: ModelRoute): ModelRoute {
  const provider = providerName?.trim() as AiProviderId | undefined;
  const model = modelName?.trim();
  return provider && ['anthropic', 'openai', 'vercel'].includes(provider) && model
    ? { provider, model }
    : fallback;
}

/** The audited PROVIDER SLUGS a managed call may be served by (`google`, `vertex`, `bedrock`,
 *  …). Vercel AI Gateway's `only` filter takes provider slugs where OpenRouter's took endpoint
 *  names, so the list is shorter and coarser - but it still answers the question the audit is
 *  about, which is who runs the weights and at what precision. Retention is no longer part of
 *  this list's job: `zeroDataRetention` covers it, gateway-side. */
function providerSlugs(): string[] {
  return (process.env.AI_LITE_GATEWAY_PROVIDERS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, 8);
}

function priceOverrides(): Record<string, ModelPrice> {
  try {
    const parsed = JSON.parse(process.env.AI_LITE_PRICING_JSON ?? '{}') as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const prices: Record<string, ModelPrice> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
      const entry = value as Record<string, unknown>;
      const input = Number(entry.inputPerMillion);
      const output = Number(entry.outputPerMillion);
      if (
        key.length <= 240
        && Number.isFinite(input) && input >= 0 && input <= 100
        && Number.isFinite(output) && output >= 0 && output <= 100
      ) prices[key] = { inputPerMillion: input, outputPerMillion: output };
    }
    return prices;
  } catch {
    return {};
  }
}

export interface LiteProfile {
  id: 'lite';
  enabled: boolean;
  promptVersion: string;
  primary: ModelRoute;
  fallback: ModelRoute;
  prices: Record<string, ModelPrice>;
  gatewayProviders: string[];
  requireZdr: boolean;
  structuredMode: 'json-schema' | 'tool';
  maxProviderCostUsd: number;
  dailySuccesses: number;
  monthlySuccesses: number;
  dailyStarts: number;
  monthlyStarts: number;
  maxConcurrentPerUser: number;
  maxConcurrentFleet: number;
  dailyFleetSpendUsd: number;
  maxAttempts: 2;
  outputTokens: number;
  repairOutputTokens: number;
  estimatedInputTokens: number;
  timeoutMs: number;
  expiryMs: number;
  qualityPriorMinSamples: number;
  qualityPriorWindowDays: number;
  limits: LitePublicLimits;
  supportedCategories: string[];
  overrideUserIds: string[];
  /** The skin experiment: the model may restyle the neutral canvas chassis with bounded
   *  CSS. Off by default — turning it on widens the schema, teaches it in the prompt, and
   *  needs the larger output budget below. The browser reverts a failing skin on its own. */
  skinEnabled: boolean;
  /** The skin VISION JUDGE: one server-owned vision call scoring the rendered hold frame.
   *  Off by default; independent of skinEnabled so the judge can be staged separately. */
  judgeEnabled: boolean;
  judgeRoute: ModelRoute;
  judgeMaxCostUsd: number;
  /** How many judgements ONE generation may book. The judge spends real money against a
   *  record the caller already owns, so without a cap a single old generation id is an
   *  unbounded spend handle - the per-IP burst limiter is not an entitlement. */
  judgeMaxPerGeneration: number;
  judgeOutputTokens: number;
  judgeEstimatedInputTokens: number;
  /** Minimum every judge axis must reach for a pass (1-5). Calibrate against blind review
   *  before trusting it in production - see docs/AI_LITE_BENCHMARK.md. */
  judgeThreshold: number;
}

export function liteProfile(): LiteProfile {
  const skinEnabled = boolEnv('AI_LITE_SKIN_ENABLED');
  const primary = envRoute(
    process.env.AI_LITE_PRIMARY_PROVIDER,
    process.env.AI_LITE_PRIMARY_MODEL,
    { provider: 'vercel', model: 'google/gemini-2.5-flash-lite' },
  );
  // NOT qwen3-coder-next, and the reason is arithmetic rather than taste. Lite refuses to
  // start unless the worst case of BOTH routes together fits `AI_LITE_MAX_COST_USD` (0.007),
  // and that model costs 0.50/1.20 per million on this gateway against 0.11/0.80 on
  // OpenRouter - so its worst case alone is 0.0078 and every generation died on
  // `cost_ceiling` before reaching a model. A previous session hit the identical failure with
  // the identical route on OpenRouter (docs/AI_LITE_PLAN.md) and repointed the fallback; the
  // model it moved to has no gateway equivalent, so this picks the cheapest ALREADY-AUDITED
  // catalog entry instead: 0.05/0.20, open-weight (the §15.1 preference), 0.0009 worst case.
  //
  // A fallback's bar is "produces a usable spec when the primary fails", not "wins a bench" -
  // but if it ever becomes the primary, that is a promotion and needs the paid round.
  const fallback = envRoute(
    process.env.AI_LITE_FALLBACK_PROVIDER,
    process.env.AI_LITE_FALLBACK_MODEL,
    { provider: 'vercel', model: 'openai/gpt-oss-20b' },
  );
  const judgeRoute = envRoute(
    process.env.AI_LITE_JUDGE_PROVIDER,
    process.env.AI_LITE_JUDGE_MODEL,
    { provider: 'vercel', model: 'google/gemini-2.5-flash' },
  );
  // The base table IS the approved-route catalog's audited price snapshot. Env
  // overrides may adjust a price, but they cannot approve a route - approval is the
  // task registry's catalog gate (aiTaskRegistry.taskConfigured).
  const prices: Record<string, ModelPrice> = {
    ...approvedModelPrices(),
    ...priceOverrides(),
  };
  return {
    id: 'lite',
    enabled: boolEnv('AI_LITE_ENABLED'),
    // v3: the strap contract restated as shape rather than prohibition (see skinPromptLines).
    // v4: the catalog digest states the supporting line's MEASURED character capacity instead
    //     of an adjective that ranked the designs backwards, and the capacity clause names it.
    // v5: typography.scaleRatio carries the bounds its compile clamps to, and the supporting
    //     line can no longer be enlarged past the size its design authored - measured as the
    //     cause of eleven wrapped identity lines in eighteen (docs/AI_LITE_PLAN.md §1a).
    // v6: scaleRatio goes back to UNBOUNDED on the wire - the gateway rejects an out-of-range
    //     number, and on a clamped field that spends an attempt to do what the clamp does free.
    // v7: animation.speed stops being a NUMERIC ENUM. Google's structured-output schema allows
    //     `enum` only on a string, so Gemini refused the entire request - a 400 before any
    //     generation, which took every Lite call down the moment the managed transport routed
    //     this model to Google. Bounds replace it and the three legal values moved into the
    //     property description; designSpec.ts already dropped anything outside them.
    // The ledger records this per generation, so outcomes stay attributable to the prompt
    // that produced them - bump it whenever the teaching changes, never silently, and bump it
    // HERE and in .env.example together: a partial bump ran v5 text under a v4 label once, and
    // that is worse than not bumping at all.
    promptVersion: (process.env.AI_LITE_PROMPT_VERSION ?? 'lite-lower-third-v7').trim().slice(0, 64) || 'lite-lower-third-v7',
    primary,
    fallback,
    prices,
    gatewayProviders: providerSlugs(),
    // Still true by default, and now with teeth of a different kind: the gateway refuses a ZDR
    // request outright on a plan without the feature, so leaving this on makes Lite fail closed
    // rather than serve to a retaining provider. Turning it off stays what it always was - an
    // explicit, audited, per-deployment decision (docs/AI_PROVIDER_GATEWAY.md).
    requireZdr: boolEnv('AI_LITE_REQUIRE_ZDR', true),
    structuredMode: process.env.AI_LITE_GATEWAY_STRUCTURED_MODE?.trim() === 'tool'
      ? 'tool'
      : 'json-schema',
    maxProviderCostUsd: numberEnv('AI_LITE_MAX_COST_USD', 0.007, 0.0001, 0.1),
    dailySuccesses: intEnv('AI_LITE_DAILY_SUCCESSES', 3, 0, 1000),
    monthlySuccesses: intEnv('AI_LITE_MONTHLY_SUCCESSES', 20, 0, 10_000),
    dailyStarts: intEnv('AI_LITE_DAILY_STARTS', 6, 0, 2000),
    monthlyStarts: intEnv('AI_LITE_MONTHLY_STARTS', 30, 0, 20_000),
    maxConcurrentPerUser: intEnv('AI_LITE_USER_CONCURRENCY', 1, 1, 10),
    maxConcurrentFleet: intEnv('AI_LITE_FLEET_CONCURRENCY', 20, 1, 1000),
    dailyFleetSpendUsd: numberEnv('AI_LITE_FLEET_DAILY_SPEND_USD', 25, 0.01, 100_000),
    maxAttempts: 2,
    // A skin rides as CSS in the same structured call, so the output budget grows with it.
    outputTokens: intEnv('AI_LITE_OUTPUT_TOKENS', skinEnabled ? 3500 : 1500, 200, 8000),
    repairOutputTokens: intEnv('AI_LITE_REPAIR_OUTPUT_TOKENS', skinEnabled ? 2500 : 1000, 200, 4000),
    estimatedInputTokens: intEnv('AI_LITE_MAX_INPUT_TOKENS', 12_000, 1000, 50_000),
    timeoutMs: intEnv('AI_LITE_TIMEOUT_MS', 30_000, 5000, 120_000),
    expiryMs: intEnv('AI_LITE_EXPIRY_MINUTES', 15, 5, 120) * 60_000,
    qualityPriorMinSamples: intEnv('AI_LITE_PRIOR_MIN_SAMPLES', 8, 4, 1000),
    qualityPriorWindowDays: intEnv('AI_LITE_PRIOR_WINDOW_DAYS', 90, 7, 365),
    limits: {
      promptCharacters: intEnv('AI_LITE_PROMPT_CHARACTERS', 2000, 100, 10_000),
      conversationTurns: intEnv('AI_LITE_CONVERSATION_TURNS', 6, 0, 20),
      conversationCharacters: intEnv('AI_LITE_CONVERSATION_CHARACTERS', 6000, 0, 30_000),
      fields: intEnv('AI_LITE_FIELDS', 2, 1, 2),
      logos: 0,
      logoBytes: intEnv('AI_LITE_LOGO_BYTES', 2_000_000, 100_000, 5_000_000),
    },
    supportedCategories: [...LITE_AI_CATEGORIES],
    skinEnabled,
    judgeEnabled: boolEnv('AI_LITE_JUDGE_ENABLED'),
    judgeRoute,
    judgeMaxCostUsd: numberEnv('AI_LITE_JUDGE_MAX_COST_USD', 0.004, 0.0001, 0.1),
    // Three: one judgement plus room for two transient provider retries. Attempts count,
    // not successes - a retry loop must not be able to spin the spend up.
    judgeMaxPerGeneration: intEnv('AI_LITE_JUDGE_MAX_PER_GENERATION', 3, 1, 20),
    judgeOutputTokens: intEnv('AI_LITE_JUDGE_OUTPUT_TOKENS', 400, 100, 2000),
    // One downscaled PNG plus the brief; vision tiles dominate, so keep the estimate fat.
    judgeEstimatedInputTokens: intEnv('AI_LITE_JUDGE_INPUT_TOKENS', 4000, 1000, 20_000),
    judgeThreshold: intEnv('AI_LITE_JUDGE_THRESHOLD', 3, 1, 5),
    overrideUserIds: (process.env.AI_LITE_OVERRIDE_USER_IDS ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
      .slice(0, 100),
  };
}

/** Development/evaluation overrides require a server-validated user id from private config. */
export function liteProfileForUser(profile: LiteProfile, userId: string): LiteProfile {
  if (!profile.overrideUserIds.includes(userId)) return profile;
  return {
    ...profile,
    dailySuccesses: 10_000,
    monthlySuccesses: 10_000,
    dailyStarts: 10_000,
    monthlyStarts: 10_000,
    maxConcurrentPerUser: Math.max(profile.maxConcurrentPerUser, 2),
  };
}

export function routePrice(profile: LiteProfile, routeValue: ModelRoute): ModelPrice | null {
  return profile.prices[`${routeValue.provider}:${routeValue.model}`] ?? null;
}

/**
 * The gateway routing policy for a managed Lite call.
 *
 * The per-request PRICE CAP is gone, and that is the one real loss in the OpenRouter move:
 * `max_price` let the provider itself refuse a route that had become expensive, and Vercel AI
 * Gateway has no equivalent field. What replaces it is `sort: 'cost'` - cheapest eligible
 * provider first, a preference not a cap - plus the three server-side controls that were
 * always there and are now load-bearing on their own: the approved-catalog price snapshot this
 * profile is priced against, `fundedRoutePrice`'s ceiling, and `maxProviderCostUsd`, which is
 * BOOKED before the call and reconciled after it. A price that moves under us now shows up as
 * a ledger overrun rather than a refused request, so the catalog snapshot has to be refreshed
 * deliberately rather than trusted to expire.
 */
export function liteGatewayPolicy(profile: LiteProfile, routeValue: ModelRoute): GatewayRoutingPolicy | undefined {
  if (routeValue.provider !== 'vercel') return undefined;
  if (!routePrice(profile, routeValue) || profile.gatewayProviders.length === 0) return undefined;
  return {
    zeroDataRetention: profile.requireZdr,
    // Pinned on, never configurable - the direct successor to OpenRouter's
    // `data_collection: 'deny'`, which was pinned the same way. It costs nothing on any plan,
    // and it is what a Hobby deployment still gets when the ZDR flag above cannot be honoured:
    // no training on a student's brief, even where zero retention is out of reach.
    disallowPromptTraining: true,
    only: profile.gatewayProviders,
    sort: 'cost',
    tags: ['surface:lite'],
    structuredOutputMode: profile.structuredMode,
  };
}

export function liteProfileConfigured(profile: LiteProfile): boolean {
  const routes = [profile.primary, profile.fallback];
  return routes.every((item) => {
    if (item.provider !== 'vercel') return true;
    return Boolean(routePrice(profile, item)) && profile.gatewayProviders.length > 0;
  });
}

/** The judge fails closed exactly like the generation routes: enabled + priced + (for the
 *  managed gateway) allowlisted, or it does not run at all. */
export function liteJudgeConfigured(profile: LiteProfile): boolean {
  if (!profile.judgeEnabled) return false;
  if (profile.judgeRoute.provider !== 'vercel') return true;
  return Boolean(routePrice(profile, profile.judgeRoute)) && profile.gatewayProviders.length > 0;
}

/** The judge route's gateway policy. It carries its own tag so vision-judge spend separates
 *  from generation spend in the AI Gateway report, which is what the per-route price caps used
 *  to distinguish before the gateway dropped them. */
export function liteJudgePolicy(profile: LiteProfile): GatewayRoutingPolicy | undefined {
  if (profile.judgeRoute.provider !== 'vercel') return undefined;
  if (!routePrice(profile, profile.judgeRoute) || profile.gatewayProviders.length === 0) return undefined;
  return {
    zeroDataRetention: profile.requireZdr,
    disallowPromptTraining: true,
    only: profile.gatewayProviders,
    sort: 'cost',
    tags: ['surface:lite-judge'],
    structuredOutputMode: profile.structuredMode,
  };
}
