// Server-owned configuration for the imported-graphic-analysis task
// (docs/AI_PLATFORM_PLAN.md §6, docs/AI_TASK_REGISTRY.md). Same posture as
// aiLiteProfile.ts: model routes, prices, privacy policy, quotas, and the kill switch are
// private server environment - the browser sees availability and allowance only.
//
// Disabled by default (AI_TASK_IMPORT_ANALYSIS_ENABLED). Quotas implement the ratified
// §15 decision 3: one image per analysis, 10 successful analyses per day, 100 per month;
// only successes count against the success allowance (starts have their own, looser,
// abuse-oriented caps).

import type { ModelPrice, OpenRouterRoutingPolicy } from './aiGateway.js';
import { approvedModelPrices } from './aiModelCatalog.js';
import { boolEnv, envRoute, intEnv, numberEnv } from './aiLiteProfile.js';
import type { ModelRoute } from '../../src/ai/modelTypes.js';
import { IMPORT_ANALYSIS_VERSION } from '../../src/ai/importAnalysis/contract.js';

export interface ImportAnalysisProfile {
  id: 'import-analysis';
  enabled: boolean;
  promptVersion: string;
  route: ModelRoute;
  prices: Record<string, ModelPrice>;
  openRouterProviders: string[];
  requireZdr: boolean;
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
  estimatedInputTokens: number;
  timeoutMs: number;
  expiryMs: number;
}

function providerEndpoints(): string[] {
  // Its own allowlist, falling back to Lite's: the audited OpenRouter endpoints are
  // usually the same review, and a deployment that audited them once should not need
  // to duplicate the list to turn this task on.
  const own = (process.env.AI_IMPORT_ANALYSIS_OPENROUTER_PROVIDERS ?? '').trim();
  const source = own || (process.env.AI_LITE_OPENROUTER_PROVIDERS ?? '');
  return source.split(',').map((value) => value.trim()).filter(Boolean).slice(0, 8);
}

export function importAnalysisProfile(): ImportAnalysisProfile {
  return {
    id: 'import-analysis',
    enabled: boolEnv('AI_TASK_IMPORT_ANALYSIS_ENABLED'),
    promptVersion: (process.env.AI_IMPORT_ANALYSIS_PROMPT_VERSION ?? IMPORT_ANALYSIS_VERSION)
      .trim().slice(0, 64) || IMPORT_ANALYSIS_VERSION,
    // A vision-capable catalog entry; replaced by the vision-suite benchmark winner at
    // promotion time (env change, no code change - plan §8).
    route: envRoute(
      process.env.AI_IMPORT_ANALYSIS_PROVIDER,
      process.env.AI_IMPORT_ANALYSIS_MODEL,
      { provider: 'openrouter', model: 'google/gemini-2.5-flash' },
    ),
    // The audited catalog snapshot only - no per-task price overrides: an unpriced or
    // uncatalogued route fails closed at the registry gate.
    prices: approvedModelPrices(),
    openRouterProviders: providerEndpoints(),
    requireZdr: boolEnv('AI_IMPORT_ANALYSIS_REQUIRE_ZDR', true),
    maxProviderCostUsd: numberEnv('AI_IMPORT_ANALYSIS_MAX_COST_USD', 0.01, 0.0001, 0.1),
    dailySuccesses: intEnv('AI_IMPORT_ANALYSIS_DAILY_SUCCESSES', 10, 0, 1000),
    monthlySuccesses: intEnv('AI_IMPORT_ANALYSIS_MONTHLY_SUCCESSES', 100, 0, 10_000),
    dailyStarts: intEnv('AI_IMPORT_ANALYSIS_DAILY_STARTS', 20, 0, 2000),
    monthlyStarts: intEnv('AI_IMPORT_ANALYSIS_MONTHLY_STARTS', 200, 0, 20_000),
    maxConcurrentPerUser: intEnv('AI_IMPORT_ANALYSIS_USER_CONCURRENCY', 1, 1, 10),
    maxConcurrentFleet: intEnv('AI_IMPORT_ANALYSIS_FLEET_CONCURRENCY', 10, 1, 1000),
    dailyFleetSpendUsd: numberEnv('AI_IMPORT_ANALYSIS_FLEET_DAILY_SPEND_USD', 10, 0.01, 100_000),
    maxAttempts: 2,
    outputTokens: intEnv('AI_IMPORT_ANALYSIS_OUTPUT_TOKENS', 2000, 200, 8000),
    // One downscaled image plus the instructions; vision tiles dominate, keep it fat.
    estimatedInputTokens: intEnv('AI_IMPORT_ANALYSIS_INPUT_TOKENS', 4000, 1000, 20_000),
    timeoutMs: intEnv('AI_IMPORT_ANALYSIS_TIMEOUT_MS', 30_000, 5000, 120_000),
    expiryMs: intEnv('AI_IMPORT_ANALYSIS_EXPIRY_MINUTES', 15, 5, 120) * 60_000,
  };
}

export function importAnalysisPrice(profile: ImportAnalysisProfile): ModelPrice | null {
  return profile.prices[`${profile.route.provider}:${profile.route.model}`] ?? null;
}

/** The OpenRouter privacy/price policy - the Lite judge pattern: ZDR, no data collection,
 *  no provider-picked fallback, audited endpoints only, price-capped at the route's own
 *  audited entry. */
export function importAnalysisPolicy(profile: ImportAnalysisProfile): OpenRouterRoutingPolicy | undefined {
  if (profile.route.provider !== 'openrouter') return undefined;
  const price = importAnalysisPrice(profile);
  if (!price || profile.openRouterProviders.length === 0) return undefined;
  return {
    zdr: profile.requireZdr,
    dataCollection: 'deny',
    requireParameters: true,
    allowProviderFallbacks: false,
    only: profile.openRouterProviders,
    maxInputPerMillion: price.inputPerMillion,
    maxOutputPerMillion: price.outputPerMillion,
    structuredOutputMode: 'json-schema',
  };
}
