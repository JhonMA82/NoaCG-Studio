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
import { eligibilityRule, missingApprovedRoutes, modelEligibility } from './eligibility.js';
import { FUNDED_ROUTE_PROVIDER } from '../aiModelCatalog.js';
import type { AdminModelsResponse } from '../../../src/admin/types.js';

/** The funded provider is the only one whose listing this section reads. A model reachable
 *  only through a user's own sealed key is not something the operator can promote, so
 *  listing it would be a page of routes nobody here can choose. */
function providerKey(): string | undefined {
  const key = (process.env.OPENROUTER_API_KEY ?? '').trim();
  return key || undefined;
}

export default {
  async fetch(req: Request): Promise<Response> {
    const gate = await requireAdmin(req, 'support');
    if (!gate.ok) return gate.response;
    const guard = methodGuard(req, 'GET');
    if (guard) return guard;

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
        models: modelEligibility(catalog.models, { now: Date.now() }),
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
