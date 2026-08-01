// MODEL ELIGIBILITY, and nothing else.
//
// This module answers one mechanical question about a live provider listing: could NoaCG
// point a funded route at this model at all? It is a checklist - provider, price against the
// funded ceiling, structured output, availability - and every one of those facts comes from
// the provider's own catalog.
//
// WHAT IT DELIBERATELY DOES NOT DO. It never ranks, scores, recommends or calls a model good.
// Quality on this project is established by the NoaCG benchmarks and by nothing else
// (docs/AI_LITE_PROMOTION.md); a cheap model that clears every check here can still be
// unusable, and a listing page that implied otherwise would be a route to promoting a model
// nobody measured. Promotion stays a human act against a bench result.
//
// It also spends no money: discovery is a plain GET against a public models listing. Nothing
// in this file can start a generation.

import {
  APPROVED_MODEL_CATALOG,
  FUNDED_ROUTE_PRICE_CEILING,
  FUNDED_ROUTE_PROVIDER,
  modelRouteKey,
} from '../aiModelCatalog.js';
import type { AiDiscoveredModel } from '../../../src/ai/modelTypes.js';
import type {
  AdminModelRow,
  AdminModelVerdict,
  AdminRouteUse,
  ModelBlockCode,
} from '../../../src/admin/types.js';

/** How recently a model has to have appeared in the provider's catalog to be called new.
 *  Long enough that a fortnight of not looking at the page does not hide anything. */
export const NEW_MODEL_DAYS = 30;

/** Zero-data-retention is an AUDITED fact on this project, not a discovered one. The
 *  OpenRouter models listing does not carry a per-model ZDR flag - retention is decided by
 *  the provider routing policy the request asks for (`zdr: true`, api/_lib/aiLiteProfile.ts),
 *  and whether a given model can actually be served under it is checked by hand at promotion
 *  time and recorded in the catalog. So a model outside the catalog reports `unknown` rather
 *  than a guess, because a wrong "yes" here would be a privacy claim nobody verified. */
export type ZdrState = 'audited' | 'unknown';

function priceKnown(model: AiDiscoveredModel): boolean {
  return model.inputPerMillion !== null && model.outputPerMillion !== null;
}

/** Every reason this model could not carry NoaCG-funded traffic, in a fixed vocabulary. An
 *  empty list is what "eligible" means - there is no separate boolean that could disagree
 *  with the list. */
export function blockingReasons(model: AiDiscoveredModel): ModelBlockCode[] {
  const blocks: ModelBlockCode[] = [];
  // Decision 5 (docs/AI_PLATFORM_PLAN.md §15): who pays decides the route. A model NoaCG funds
  // has to be reachable through the OpenRouter adapter.
  if (model.provider !== FUNDED_ROUTE_PROVIDER) blocks.push('not-funded-provider');
  if (!model.available) blocks.push('unavailable');
  if (!model.supportsStructuredOutput) blocks.push('no-structured-output');
  if (!priceKnown(model)) {
    // An unpriced model is not cheap, it is unmeasured - and it cannot be admitted on a
    // ceiling nothing was compared against.
    blocks.push('price-unknown');
  } else if (
    (model.inputPerMillion ?? 0) > FUNDED_ROUTE_PRICE_CEILING.inputPerMillion ||
    (model.outputPerMillion ?? 0) > FUNDED_ROUTE_PRICE_CEILING.outputPerMillion
  ) {
    blocks.push('over-price-ceiling');
  }
  return blocks;
}

function verdictFor(approved: boolean, blocks: ModelBlockCode[]): AdminModelVerdict {
  if (approved) return 'approved';
  return blocks.length === 0 ? 'eligible' : 'ineligible';
}

export interface EligibilityOptions {
  /** The instant "new" is measured back from. Passed in rather than read from the clock, so
   *  the classification is testable. */
  now: number;
  /** Route key -> the tasks currently pointing at it, from the server's task registry. A route
   *  the server does not choose is simply absent; see `usedBy` in src/admin/types.ts. */
  usedBy?: Map<string, AdminRouteUse[]>;
}

/**
 * The live listing joined with the audited catalog, as the admin page reads it.
 *
 * The join is the whole point: `approved` is a fact about THIS repository (a hand-audited
 * entry in aiModelCatalog.ts), `eligible` is a fact about the provider's listing, and the two
 * are different questions that look alike on a page that only showed one of them.
 */
export function modelEligibility(
  models: AiDiscoveredModel[],
  options: EligibilityOptions,
): AdminModelRow[] {
  const approvedByKey = new Map(
    APPROVED_MODEL_CATALOG.map((entry) => [modelRouteKey(entry.route), entry]),
  );
  const newSince = options.now - NEW_MODEL_DAYS * 86_400_000;

  return models.map((model) => {
    const key = `${model.provider}:${model.id}`;
    const entry = approvedByKey.get(key) ?? null;
    const blocks = blockingReasons(model);
    const created = model.createdAt ? Date.parse(model.createdAt) : Number.NaN;
    return {
      key,
      provider: model.provider,
      model: model.id,
      name: model.name,
      contextLength: model.contextLength,
      inputPerMillion: model.inputPerMillion,
      outputPerMillion: model.outputPerMillion,
      structuredOutput: model.supportsStructuredOutput,
      vision: model.inputModalities.indexOf('image') !== -1,
      openWeight: model.openWeight,
      free: model.free,
      available: model.available,
      // Audited only where an audit exists. An approved entry carries the answer the
      // promotion pass recorded; everything else is honestly unknown.
      zdr: entry ? ('audited' as ZdrState) : ('unknown' as ZdrState),
      zdrAvailable: entry ? entry.zdrAvailable : null,
      approved: entry !== null,
      verdict: verdictFor(entry !== null, blocks),
      blocks,
      createdAt: model.createdAt,
      // New AND not already approved: a catalog entry promoted last week is not something the
      // operator needs flagged as a discovery.
      isNew: entry === null && Number.isFinite(created) && created >= newSince,
      // APPROVED is "we audited this and may use it"; USED BY is "traffic is going here right
      // now". They come apart in both directions - an approved route can carry nothing, and a
      // fallback carrying traffic means the primary is failing - which is why the page shows
      // both rather than treating approval as deployment.
      usedBy: options.usedBy?.get(key) ?? [],
    };
  });
}

/** The ceiling and provider the checklist above is measured against, so the page states the
 *  rule it is applying instead of leaving the operator to infer it from the verdicts. */
export function eligibilityRule(): {
  provider: string;
  inputPerMillion: number;
  outputPerMillion: number;
  newModelDays: number;
} {
  return {
    provider: FUNDED_ROUTE_PROVIDER,
    inputPerMillion: FUNDED_ROUTE_PRICE_CEILING.inputPerMillion,
    outputPerMillion: FUNDED_ROUTE_PRICE_CEILING.outputPerMillion,
    newModelDays: NEW_MODEL_DAYS,
  };
}

/** Approved catalog routes the live listing did not return. A promoted route that has
 *  vanished from the provider is an operational problem - the free tier fails closed on it
 *  (aiTaskRegistry.ts), so it stops serving rather than falling back. */
export function missingApprovedRoutes(models: AiDiscoveredModel[], provider: string): string[] {
  const seen = new Set(models.map((model) => `${model.provider}:${model.id}`));
  return APPROVED_MODEL_CATALOG.filter((entry) => entry.route.provider === provider)
    .map((entry) => modelRouteKey(entry.route))
    .filter((key) => !seen.has(key));
}
