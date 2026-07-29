// The APPROVED-ROUTE model catalog (docs/AI_PLATFORM_PLAN.md §7) - server-only, never
// serialized to the browser. Free-tier task profiles (api/_lib/aiTaskRegistry.ts) may
// only reference routes listed here and FAIL CLOSED otherwise, exactly the
// liteProfileConfigured() posture: a misconfigured route refuses to run rather than
// falling back to an unapproved one.
//
// `openWeights` is promotion-time PREFERENCE metadata (the ratified §15 decision 1):
// when the NoaCG benchmarks show parity, the open-weight candidate wins the route, but
// a superior proprietary model is never excluded for closed weights alone. Nothing in
// the request path gates on this flag.
//
// Entries are audited by hand at promotion time (docs/AI_LITE_PROMOTION.md). Live
// listings - current prices, context windows, availability - come from the discovery
// module (aiModelDiscovery.ts); the numbers here are the audited snapshot the policy
// layer prices against, refreshed when a route is (re)promoted.

import type { ModelPrice } from './aiGateway.js';
import type { ModelRoute } from '../../src/ai/modelTypes.js';

export interface ApprovedModelCapabilities {
  vision: boolean;
  coding: boolean;
  structuredOutput: boolean;
  contextWindow: number;
}

export interface ApprovedModelEntry {
  route: ModelRoute;
  /** Promotion-time preference metadata - never a per-request gate (plan §15.1). */
  openWeights: boolean;
  capabilities: ApprovedModelCapabilities;
  price: ModelPrice;
  /** Whether the route can honour zero-data-retention routing (Lite requires it). */
  zdrAvailable: boolean;
  notes: string;
}

export const APPROVED_MODEL_CATALOG: readonly ApprovedModelEntry[] = [
  {
    route: { provider: 'openrouter', model: 'google/gemini-2.5-flash-lite' },
    openWeights: false,
    capabilities: { vision: true, coding: false, structuredOutput: true, contextWindow: 1_048_576 },
    price: { inputPerMillion: 0.10, outputPerMillion: 0.40 },
    zdrAvailable: true,
    notes: 'Lite design-spec primary. Proprietary incumbent; stands until the discovery funnel benches an open-weight equal (plan §7).',
  },
  {
    route: { provider: 'openrouter', model: 'google/gemini-2.5-flash' },
    openWeights: false,
    capabilities: { vision: true, coding: false, structuredOutput: true, contextWindow: 1_048_576 },
    price: { inputPerMillion: 0.30, outputPerMillion: 2.50 },
    zdrAvailable: true,
    notes: 'Lite skin vision judge route (docs/AI_LITE_BENCHMARK.md §6b).',
  },
  {
    route: { provider: 'openrouter', model: 'qwen/qwen3-coder-next' },
    openWeights: true,
    capabilities: { vision: false, coding: true, structuredOutput: true, contextWindow: 262_144 },
    price: { inputPerMillion: 0.11, outputPerMillion: 0.80 },
    zdrAvailable: true,
    notes: 'Lite design-spec fallback; open-weight coding candidate for the code benches.',
  },
  {
    route: { provider: 'openrouter', model: 'mistralai/mistral-small-2603' },
    openWeights: true,
    capabilities: { vision: true, coding: false, structuredOutput: true, contextWindow: 131_072 },
    price: { inputPerMillion: 0.15, outputPerMillion: 0.60 },
    zdrAvailable: true,
    notes: 'Open-weight multimodal candidate for the Lite discovery funnel and the vision suite.',
  },
  {
    route: { provider: 'openrouter', model: 'mistralai/mistral-small-24b-instruct-2501' },
    openWeights: true,
    capabilities: { vision: false, coding: false, structuredOutput: true, contextWindow: 32_768 },
    price: { inputPerMillion: 0.05, outputPerMillion: 0.08 },
    zdrAvailable: true,
    notes: 'Open-weight text/structured candidate for the Lite discovery funnel.',
  },
];

export function modelRouteKey(route: ModelRoute): string {
  return `${route.provider}:${route.model}`;
}

const byRouteKey = new Map(APPROVED_MODEL_CATALOG.map((entry) => [modelRouteKey(entry.route), entry]));

export function approvedModelEntry(route: ModelRoute): ApprovedModelEntry | null {
  return byRouteKey.get(modelRouteKey(route)) ?? null;
}

export function approvedModelRoute(route: ModelRoute): boolean {
  return byRouteKey.has(modelRouteKey(route));
}

// Decision 5 (plan §15): WHO PAYS DECIDES THE ROUTE. Free hosted surfaces are funded by
// the project, not the user, so a route NoaCG pays for must be cheap and reachable
// through the OpenRouter adapter - which is why no entry above names OpenAI or Anthropic
// as its provider: those models are reachable only through a user's own sealed key.
// Unlike `openWeights` this IS a gate: the registry refuses a free-tier route that breaks
// it, and the catalog test refuses an entry that could never serve one.
export const FUNDED_ROUTE_PROVIDER = 'openrouter';

/** The per-million ceiling a NoaCG-funded route may cost. Sits above every catalog entry
 *  (the dearest today is the vision judge at 0.30/2.50) with room for a better model, and
 *  below the proprietary flagships a no-revenue project cannot subsidize. Raise it
 *  deliberately, not to admit one model that just missed. */
export const FUNDED_ROUTE_PRICE_CEILING: ModelPrice = {
  inputPerMillion: 1.0,
  outputPerMillion: 5.0,
};

export function fundedRoutePrice(price: ModelPrice): boolean {
  return (
    price.inputPerMillion <= FUNDED_ROUTE_PRICE_CEILING.inputPerMillion &&
    price.outputPerMillion <= FUNDED_ROUTE_PRICE_CEILING.outputPerMillion
  );
}

/** Whether a route may carry spend NoaCG funds. `price` is the caller's EFFECTIVE price
 *  when it has one (a task's price table can be overridden by env), so an operator cannot
 *  point the free tier at an approved model at a price the project would not fund; it
 *  falls back to the audited catalog snapshot. */
export function fundedModelRoute(route: ModelRoute, price?: ModelPrice | null): boolean {
  const entry = approvedModelEntry(route);
  if (!entry) return false;
  if (entry.route.provider !== FUNDED_ROUTE_PROVIDER) return false;
  return fundedRoutePrice(price ?? entry.price);
}

/** The audited price snapshot, keyed `provider:model` - the base of Lite's price table,
 *  so the catalog and the policy layer cannot drift apart. */
export function approvedModelPrices(): Record<string, ModelPrice> {
  const prices: Record<string, ModelPrice> = {};
  for (const entry of APPROVED_MODEL_CATALOG) prices[modelRouteKey(entry.route)] = { ...entry.price };
  return prices;
}
