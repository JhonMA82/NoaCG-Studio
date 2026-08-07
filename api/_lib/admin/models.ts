// GET /api/admin/models - which models COULD carry NoaCG-funded traffic, and which already do.
//
// The live provider listing (aiModelDiscovery.ts) joined with this repository's audited
// approved-route catalog (aiModelCatalog.ts). The join is the section's entire reason to
// exist: "the provider lists it and it clears our price ceiling" and "we audited it and
// promoted it" are different facts that a page showing only one of them would blur.
//
// THIS SECTION RANKS NOTHING. It cannot say which model is best, because nothing here has
// measured one - quality on this project comes from the NoaCG benchmarks and from nowhere
// else (docs/AI_LITE_PROMOTION.md). Treating a cheap, ZDR-capable, structured-output model as
// a recommendation would be exactly the mistake the promotion doc exists to prevent, so the
// verdicts are eligibility words and there is no score, no ordering by merit and no "best".
//
// IT SPENDS NOTHING. Discovery is a cached GET against a public models listing; no benchmark,
// no generation, no token. Reading this page can never cost money.
//
// IT LEAKS NOTHING. The provider key is used to make the request and is never echoed; the
// provider's marketing description is dropped rather than forwarded. What ships is prices,
// context lengths, capability booleans and route ids.

import { json, methodGuard } from '../http.js';
import { requireAdmin } from '../adminAuth.js';
import { discoverProviderModels } from '../aiModelDiscovery.js';
import { auditedZdr, eligibilityRule, missingApprovedRoutes, modelEligibility } from './eligibility.js';
import { FUNDED_ROUTE_PROVIDER, modelRouteKey } from '../aiModelCatalog.js';
import { AI_TASK_IDS, taskProfile, type AiTaskId } from '../aiTaskRegistry.js';
// The Pro tier's curated routes. Imported from the dependency-light contract, never from
// pipeline.ts - that one pulls in the gateway, telemetry and the canvas-bearing compiler.
import { PRO_STANDARD_ROUTES } from '../../../src/ai/pro/contract.js';
import type {
  AdminImageModelsResponse,
  AdminModelsResponse,
  AdminRouteUse,
} from '../../../src/admin/types.js';

/** What the operator calls each task. Keyed by AiTaskId, so a task added to the registry is a
 *  compile error here until it has a name a human can read. */
const TASK_LABEL: Record<AiTaskId, string> = {
  'lite-design-spec': 'NoaCG Lite',
  'imported-graphic-analysis': 'Import analysis',
};

/**
 * Route key -> what points at it right now, read from the code that CHOOSES each route rather
 * than from any table, so this cannot drift from what actually runs.
 *
 * Two sources, because the product has two mechanisms: the task registry for the registered
 * tasks (Lite, import analysis), and `PRO_STANDARD_ROUTES` for the Pro tier, which pins one
 * curated route per stage and goes through the generic gateway rather than the registry. Both
 * are imported, never copied - a second list here would name the wrong model the first time
 * either is re-benched.
 */
function routesInUse(): Map<string, AdminRouteUse[]> {
  const map = new Map<string, AdminRouteUse[]>();
  const add = (key: string, use: AdminRouteUse) => map.set(key, [...(map.get(key) ?? []), use]);
  for (const taskId of AI_TASK_IDS) {
    const policy = taskProfile(taskId).routePolicy;
    add(modelRouteKey(policy.primary), { task: TASK_LABEL[taskId], slot: 'primary' });
    for (const route of policy.fallbacks) {
      add(modelRouteKey(route), { task: TASK_LABEL[taskId], slot: 'fallback' });
    }
  }
  // No slot: each Pro stage pins exactly one route with nothing behind it, so there is no
  // primary/fallback distinction to report.
  add(modelRouteKey(PRO_STANDARD_ROUTES.concept), { task: 'NoaCG Pro concept' });
  add(modelRouteKey(PRO_STANDARD_ROUTES.interpret), { task: 'NoaCG Pro interpret' });
  return map;
}

/** The funded provider is the only one whose listing this section reads. A model reachable
 *  only through a user's own sealed key is not something the operator can promote, so
 *  listing it would be a page of routes nobody here can choose. */
/** The same "newly discovered" span the eligibility rule uses, in ms - the image listing has
 *  no verdict but the same question ("what appeared since I last looked") still applies. */
function rule30d(): number {
  return eligibilityRule().newModelDays * 86_400_000;
}

/** Discovery reads the gateway's own listing, which is public - the credential only scopes it
 *  to the team. Either form works, same precedence as `managedAiKey`. */
function providerKey(): string | undefined {
  const key = (process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN || '').trim();
  return key || undefined;
}

export default {
  async fetch(req: Request): Promise<Response> {
    const gate = await requireAdmin(req, 'support');
    if (!gate.ok) return gate.response;
    const guard = methodGuard(req, 'GET');
    if (guard) return guard;

    // The IMAGE listing is a different question with different units, so it is a different
    // answer: routes and per-image prices, and deliberately no verdict (src/admin/types.ts).
    if (new URL(req.url).searchParams.get('output') === 'image') {
      const empty: AdminImageModelsResponse = {
        provider: FUNDED_ROUTE_PROVIDER,
        syncedAt: null,
        models: [],
        discoveryFailed: true,
      };
      try {
        const catalog = await discoverProviderModels(FUNDED_ROUTE_PROVIDER, providerKey(), 'image');
        const newSince = Date.now() - rule30d();
        const usedBy = routesInUse();
        return json({
          provider: catalog.provider,
          syncedAt: catalog.syncedAt,
          models: catalog.models.map((model) => {
            const created = model.createdAt ? Date.parse(model.createdAt) : Number.NaN;
            const key = `${model.provider}:${model.id}`;
            return {
              key,
              usedBy: usedBy.get(key) ?? [],
              provider: model.provider,
              model: model.id,
              name: model.name,
              imagePriceUsd: model.imagePriceUsd ?? null,
              inputPerMillion: model.inputPerMillion,
              // Not a verdict - a recorded audit. Same discipline as the text table: 'audited'
              // only where an audit exists, 'unknown' otherwise, never an inferred no.
              ...auditedZdr(model.provider, model.id),
              available: model.available,
              createdAt: model.createdAt,
              isNew: Number.isFinite(created) && created >= newSince,
            };
          }),
          discoveryFailed: false,
        } satisfies AdminImageModelsResponse);
      } catch (error) {
        console.error('admin image model discovery failed:', error instanceof Error ? error.message : error);
        return json(empty);
      }
    }

    const rule = eligibilityRule();
    const empty: AdminModelsResponse = {
      provider: FUNDED_ROUTE_PROVIDER,
      syncedAt: null,
      models: [],
      rule,
      missingApproved: [],
      discoveryFailed: true,
    };

    try {
      const catalog = await discoverProviderModels(FUNDED_ROUTE_PROVIDER, providerKey());
      const response: AdminModelsResponse = {
        provider: catalog.provider,
        syncedAt: catalog.syncedAt,
        models: modelEligibility(catalog.models, { now: Date.now(), usedBy: routesInUse() }),
        rule,
        missingApproved: missingApprovedRoutes(catalog.models, FUNDED_ROUTE_PROVIDER),
        discoveryFailed: false,
      };
      return json(response);
    } catch (error) {
      // OpenRouter being down, rate-limiting us, or answering something unparseable must cost
      // this section and nothing else. The rest of /admin is about THIS instance's own data
      // and has no business failing because a third party did.
      console.error('admin models discovery failed:', error instanceof Error ? error.message : error);
      return json(empty);
    }
  },
};
