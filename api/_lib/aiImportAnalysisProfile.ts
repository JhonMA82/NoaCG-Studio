// Server-owned configuration for the imported-graphic-analysis task
// (docs/AI_PLATFORM_PLAN.md §6, docs/AI_TASK_REGISTRY.md). Same posture as
// aiLiteProfile.ts: model routes, prices, privacy policy, quotas, and the kill switch are
// private server environment - the browser sees availability and allowance only.
//
// Disabled by default (AI_TASK_IMPORT_ANALYSIS_ENABLED). Quotas implement the ratified
// §15 decision 3: one image per analysis, 10 successful analyses per day, 100 per month;
// only successes count against the success allowance (starts have their own, looser,
// abuse-oriented caps).

import type { GatewayRoutingPolicy, ModelPrice } from './aiGateway.js';
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
  gatewayProviders: string[];
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

function providerSlugs(): string[] {
  // Its own allowlist, falling back to Lite's: the audited gateway providers are usually the
  // same review, and a deployment that audited them once should not need to duplicate the
  // list to turn this task on.
  const own = (process.env.AI_IMPORT_ANALYSIS_GATEWAY_PROVIDERS ?? '').trim();
  const source = own || (process.env.AI_LITE_GATEWAY_PROVIDERS ?? '');
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
    //
    // The default is the CHEAP tier of the same family (0.10/0.40 against 0.30/2.50), which
    // at one downscaled image and a short JSON answer is roughly $0.0006 a call - inside the
    // owner's ceiling of 100 analyses per EUR with room to spare, where the dearer sibling
    // was not. This surface proposes field rectangles for a human to tick; it is not the
    // design call, and there is no measured quality argument for paying six times as much.
    route: envRoute(
      process.env.AI_IMPORT_ANALYSIS_PROVIDER,
      process.env.AI_IMPORT_ANALYSIS_MODEL,
      { provider: 'vercel', model: 'google/gemini-2.5-flash-lite' },
    ),
    // The audited catalog snapshot only - no per-task price overrides: an unpriced or
    // uncatalogued route fails closed at the registry gate.
    prices: approvedModelPrices(),
    gatewayProviders: providerSlugs(),
    requireZdr: boolEnv('AI_IMPORT_ANALYSIS_REQUIRE_ZDR', true),
    maxProviderCostUsd: numberEnv('AI_IMPORT_ANALYSIS_MAX_COST_USD', 0.01, 0.0001, 0.1),
    // A class works through several graphics in one session and re-runs an analysis with
    // instructions when the first answer is off, so ten a day is a wall a student meets in
    // the first lesson. At the route's price the whole daily allowance is under a cent.
    dailySuccesses: intEnv('AI_IMPORT_ANALYSIS_DAILY_SUCCESSES', 30, 0, 1000),
    monthlySuccesses: intEnv('AI_IMPORT_ANALYSIS_MONTHLY_SUCCESSES', 300, 0, 10_000),
    dailyStarts: intEnv('AI_IMPORT_ANALYSIS_DAILY_STARTS', 60, 0, 2000),
    monthlyStarts: intEnv('AI_IMPORT_ANALYSIS_MONTHLY_STARTS', 600, 0, 20_000),
    maxConcurrentPerUser: intEnv('AI_IMPORT_ANALYSIS_USER_CONCURRENCY', 1, 1, 10),
    maxConcurrentFleet: intEnv('AI_IMPORT_ANALYSIS_FLEET_CONCURRENCY', 10, 1, 1000),
    dailyFleetSpendUsd: numberEnv('AI_IMPORT_ANALYSIS_FLEET_DAILY_SPEND_USD', 10, 0.01, 100_000),
    maxAttempts: 2,
    // A proposal is a handful of rectangles and their type: the observed answers are a few
    // hundred tokens, and the ceiling is what the price estimate is charged against.
    outputTokens: intEnv('AI_IMPORT_ANALYSIS_OUTPUT_TOKENS', 1200, 200, 8000),
    // One downscaled image plus the instructions; vision tiles dominate, keep it fat.
    estimatedInputTokens: intEnv('AI_IMPORT_ANALYSIS_INPUT_TOKENS', 4000, 1000, 20_000),
    timeoutMs: intEnv('AI_IMPORT_ANALYSIS_TIMEOUT_MS', 30_000, 5000, 120_000),
    expiryMs: intEnv('AI_IMPORT_ANALYSIS_EXPIRY_MINUTES', 15, 5, 120) * 60_000,
  };
}

export function importAnalysisPrice(profile: ImportAnalysisProfile): ModelPrice | null {
  return profile.prices[`${profile.route.provider}:${profile.route.model}`] ?? null;
}

/** The gateway privacy policy - the Lite judge pattern: zero data retention, audited
 *  providers only, cheapest first, tagged for per-surface spend. The per-request price cap
 *  OpenRouter enforced has no gateway equivalent; `maxProviderCostUsd` and the approved-catalog
 *  snapshot carry it server-side (see liteGatewayPolicy for the full argument). */
export function importAnalysisPolicy(profile: ImportAnalysisProfile): GatewayRoutingPolicy | undefined {
  if (profile.route.provider !== 'vercel') return undefined;
  if (!importAnalysisPrice(profile) || profile.gatewayProviders.length === 0) return undefined;
  return {
    zeroDataRetention: profile.requireZdr,
    // Pinned on for the reason Lite pins it: free on every plan, and the floor that survives
    // when ZDR is out of reach. It matters most here - the prompt is somebody's artwork.
    disallowPromptTraining: true,
    only: profile.gatewayProviders,
    sort: 'cost',
    tags: ['surface:import-analysis'],
    structuredOutputMode: 'json-schema',
  };
}
