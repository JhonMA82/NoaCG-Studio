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

/** The audited price snapshot, keyed `provider:model` - the base of Lite's price table,
 *  so the catalog and the policy layer cannot drift apart. */
export function approvedModelPrices(): Record<string, ModelPrice> {
  const prices: Record<string, ModelPrice> = {};
  for (const entry of APPROVED_MODEL_CATALOG) prices[modelRouteKey(entry.route)] = { ...entry.price };
  return prices;
}
