// The MANAGED-KEY routing policy for a tagged gateway surface.
//
// `POST /api/ai/generate` is a general model proxy and has always called
// `executeGatewayRequest(body, { keyFor })` with no policy at all - so the SPX harness, the
// brainstorm call, the video harness and NoaCG Pro have all reached OpenRouter without asking
// for zero-data-retention routing or refusing data collection. The profile-owning surfaces
// (api/_lib/aiLiteProfile.ts, api/_lib/aiImportAnalysisProfile.ts) build a policy of their own
// and always have; everything reached through the generic proxy did not.
//
// That gap is only visible from the OUTSIDE once a route's ZDR is claimed as audited:
// docs/MODEL_ROUTE_AUDITS.md records that `google/gemini-3.1-flash-image` IS ZDR-servable, and
// putting "audited: yes" on the /admin Models page while the requests go out unpolicied would
// be a privacy claim production does not honour. This module is what makes the claim true.
//
// TWO DELIBERATE LIMITS, stated rather than discovered later:
//
//   1. MANAGED ONLY. A caller spending their OWN key on their own chosen model is not ours to
//      route - the same line api/ai/generate.ts already draws for the disabled-route switch.
//   2. THE TAG IS CLIENT-SUPPLIED. A request that omits `surface` gets no policy, exactly as
//      it gets no entitlement check (docs/ADMIN.md, "Gating a surface on a shared endpoint").
//      What this buys is real - the product's own Pro traffic is policied - and it is not a
//      guarantee about a hand-rolled request, which no server-side signal could provide.

import { FUNDED_ROUTE_PRICE_CEILING } from './aiModelCatalog.js';
import type { OpenRouterRoutingPolicy } from './aiGateway.js';
import type { AiGatewaySurface, ModelRoute } from '../../src/ai/modelTypes.js';

/** Does this surface's managed traffic carry a routing policy? A surface absent from here is
 *  unchanged from before this module existed, which is why the map is explicit rather than a
 *  default: adding a surface to `AiGatewaySurface` must not silently opt it in or out. */
const POLICIED_SURFACES: Record<AiGatewaySurface, boolean> = {
  // Pro's concept call sends the graphic's two text lines - on a real lower third, a named
  // person and their role - to an image model on NoaCG's key. That is third-party personal
  // data, and it is the reason this module exists.
  pro: true,
  // Video is NOT policied here, deliberately. Its routes are user-selectable through the
  // video model picker rather than pinned, so a ZDR directive with no fallback would refuse
  // whichever of them has no ZDR endpoint - turning a privacy improvement into an outage on a
  // surface whose routes have never been audited. Audit them first, then flip this.
  video: false,
};

/**
 * The OpenRouter policy for a managed call on `surface`, or undefined for an unpoliced one.
 *
 * `requireParameters` is FALSE here and true for Lite, and the difference is not an oversight:
 * an image request carries `modalities`, which is not a listed provider parameter, so
 * requiring parameters would narrow the endpoint set to nothing and fail every concept call.
 * The privacy-bearing directives - `zdr`, `dataCollection`, `allowProviderFallbacks` - are
 * unaffected by it.
 *
 * The price caps come from `FUNDED_ROUTE_PRICE_CEILING` rather than the route's own audited
 * price. Capping at the exact audited figure would refuse the route the day the provider moves
 * a cent, and Pro would simply stop working; the ceiling still refuses a route that has become
 * expensive, which is what the cap is for. It does NOT bound image-output tokens - no ceiling
 * for image work has been decided (docs/ADMIN.md §9), and pretending otherwise here would be
 * the same invented rule that section refuses.
 */
export function surfaceRoutePolicy(
  surface: AiGatewaySurface | undefined,
  route: ModelRoute,
): OpenRouterRoutingPolicy | undefined {
  if (!surface || !POLICIED_SURFACES[surface]) return undefined;
  if (route.provider !== 'openrouter') return undefined;
  return {
    zdr: true,
    dataCollection: 'deny',
    requireParameters: false,
    allowProviderFallbacks: false,
    maxInputPerMillion: FUNDED_ROUTE_PRICE_CEILING.inputPerMillion,
    maxOutputPerMillion: FUNDED_ROUTE_PRICE_CEILING.outputPerMillion,
  };
}
