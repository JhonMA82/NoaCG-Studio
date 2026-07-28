import type { ModelPrice, OpenRouterRoutingPolicy } from './aiGateway.js';
import { approvedModelPrices } from './aiModelCatalog.js';
import type { AiProviderId, ModelRoute } from '../../src/ai/modelTypes.js';
import { LITE_AI_CATEGORIES } from '../../src/ai/liteContract.js';
import type { LitePublicLimits } from '../../src/ai/liteTypes.js';

const intEnv = (name: string, fallback: number, min: number, max: number): number => {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, Math.round(parsed))) : fallback;
};

const numberEnv = (name: string, fallback: number, min: number, max: number): number => {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
};

const boolEnv = (name: string, fallback = false): boolean => {
  const value = process.env[name]?.trim().toLowerCase();
  if (!value) return fallback;
  return value === '1' || value === 'true' || value === 'yes' || value === 'on';
};

function route(providerName: string | undefined, modelName: string | undefined, fallback: ModelRoute): ModelRoute {
  const provider = providerName?.trim() as AiProviderId | undefined;
  const model = modelName?.trim();
  return provider && ['anthropic', 'openai', 'openrouter'].includes(provider) && model
    ? { provider, model }
    : fallback;
}

function providerEndpoints(): string[] {
  return (process.env.AI_LITE_OPENROUTER_PROVIDERS ?? '')
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
  openRouterProviders: string[];
  requireZdr: boolean;
  openRouterStructuredMode: 'json-schema' | 'tool';
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
  const primary = route(
    process.env.AI_LITE_PRIMARY_PROVIDER,
    process.env.AI_LITE_PRIMARY_MODEL,
    { provider: 'openrouter', model: 'google/gemini-2.5-flash-lite' },
  );
  const fallback = route(
    process.env.AI_LITE_FALLBACK_PROVIDER,
    process.env.AI_LITE_FALLBACK_MODEL,
    { provider: 'openrouter', model: 'qwen/qwen3-coder-next' },
  );
  const judgeRoute = route(
    process.env.AI_LITE_JUDGE_PROVIDER,
    process.env.AI_LITE_JUDGE_MODEL,
    { provider: 'openrouter', model: 'google/gemini-2.5-flash' },
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
    promptVersion: (process.env.AI_LITE_PROMPT_VERSION ?? 'lite-lower-third-v2').trim().slice(0, 64) || 'lite-lower-third-v2',
    primary,
    fallback,
    prices,
    openRouterProviders: providerEndpoints(),
    requireZdr: boolEnv('AI_LITE_REQUIRE_ZDR', true),
    openRouterStructuredMode: process.env.AI_LITE_OPENROUTER_STRUCTURED_MODE?.trim() === 'tool'
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

export function liteOpenRouterPolicy(profile: LiteProfile, routeValue: ModelRoute): OpenRouterRoutingPolicy | undefined {
  if (routeValue.provider !== 'openrouter') return undefined;
  const routePrices = [profile.primary, profile.fallback]
    .filter((route) => route.provider === 'openrouter')
    .map((route) => routePrice(profile, route))
    .filter((price): price is ModelPrice => Boolean(price));
  if (!routePrice(profile, routeValue) || routePrices.length === 0 || profile.openRouterProviders.length === 0) return undefined;
  return {
    zdr: profile.requireZdr,
    dataCollection: 'deny',
    requireParameters: true,
    allowProviderFallbacks: false,
    only: profile.openRouterProviders,
    maxInputPerMillion: Math.max(...routePrices.map((price) => price.inputPerMillion)),
    maxOutputPerMillion: Math.max(...routePrices.map((price) => price.outputPerMillion)),
    structuredOutputMode: profile.openRouterStructuredMode,
  };
}

export function liteProfileConfigured(profile: LiteProfile): boolean {
  const routes = [profile.primary, profile.fallback];
  return routes.every((item) => {
    if (item.provider !== 'openrouter') return true;
    return Boolean(routePrice(profile, item)) && profile.openRouterProviders.length > 0;
  });
}

/** The judge fails closed exactly like the generation routes: enabled + priced + (for
 *  OpenRouter) allowlisted, or it does not run at all. */
export function liteJudgeConfigured(profile: LiteProfile): boolean {
  if (!profile.judgeEnabled) return false;
  if (profile.judgeRoute.provider !== 'openrouter') return true;
  return Boolean(routePrice(profile, profile.judgeRoute)) && profile.openRouterProviders.length > 0;
}

/** The judge route's OpenRouter policy. Its price caps come from the judge route's OWN
 *  price entry - the generation routes' caps would refuse a costlier vision model. */
export function liteJudgePolicy(profile: LiteProfile): OpenRouterRoutingPolicy | undefined {
  if (profile.judgeRoute.provider !== 'openrouter') return undefined;
  const price = routePrice(profile, profile.judgeRoute);
  if (!price || profile.openRouterProviders.length === 0) return undefined;
  return {
    zdr: profile.requireZdr,
    dataCollection: 'deny',
    requireParameters: true,
    allowProviderFallbacks: false,
    only: profile.openRouterProviders,
    maxInputPerMillion: price.inputPerMillion,
    maxOutputPerMillion: price.outputPerMillion,
    structuredOutputMode: profile.openRouterStructuredMode,
  };
}
