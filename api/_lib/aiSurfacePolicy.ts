// The MANAGED-KEY routing policy for a tagged gateway surface.
//
// `POST /api/ai/generate` is a general model proxy and has always called
// `executeGatewayRequest(body, { keyFor })` with no policy at all - so the SPX harness, the
// brainstorm call, the video harness and NoaCG Pro all reached the managed gateway without
// asking for zero-data-retention routing. The profile-owning surfaces
// (api/_lib/aiLiteProfile.ts, api/_lib/aiImportAnalysisProfile.ts) build a policy of their own
// and always have; everything reached through the generic proxy did not.
//
// That gap is only visible from the OUTSIDE once a route's ZDR is claimed as audited: putting
// "ZDR verified: yes" on the /admin Models page while the requests go out unpolicied would be a
// privacy claim production does not honour. This module is what makes the claim true.
//
// TWO DELIBERATE LIMITS, stated rather than discovered later:
//
//   1. MANAGED ONLY. A caller spending their OWN key on their own chosen model is not ours to
//      route - the same line api/ai/generate.ts already draws for the disabled-route switch.
//   2. THE TAG IS CLIENT-SUPPLIED. A request that omits `surface` gets no policy, exactly as
//      it gets no entitlement check (docs/ADMIN.md, "Gating a surface on a shared endpoint").
//      What this buys is real - the product's own Pro traffic is policied - and it is not a
//      guarantee about a hand-rolled request, which no server-side signal could provide.

import { boolEnv } from './aiLiteProfile.js';
import type { GatewayRoutingPolicy } from './aiGateway.js';
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
  // video model picker rather than pinned, so a ZDR directive would refuse whichever of them
  // no ZDR-agreement provider serves - turning a privacy improvement into an outage on a
  // surface whose routes have never been audited. Audit them first, then flip this.
  video: false,
};

/**
 * The gateway policy for a managed call on `surface`, or undefined for an unpoliced one.
 *
 * TWO OPENROUTER DIRECTIVES DIED HERE, both harmlessly. `require_parameters` was already
 * false on this surface (an image request carries `modalities`, which is not a listed
 * provider parameter, so requiring parameters narrowed the endpoint set to nothing and failed
 * every concept call) and has no gateway equivalent to keep. `allow_fallbacks: false` is
 * subsumed: the gateway serves a `zeroDataRetention` request only from providers under a
 * verified ZDR agreement, so there is no non-ZDR path to fall back onto.
 *
 * The PRICE CAPS are the real loss. `FUNDED_ROUTE_PRICE_CEILING` used to ride on every Pro
 * call as `max_price`, so a route that got expensive was refused by the provider; the gateway
 * has no such field. `sort: 'cost'` asks for the cheapest eligible provider, and the ceiling
 * still gates which routes may be catalogued at all - but nothing refuses a call at request
 * time any more. That was never a bound on image work in any case: no ceiling for image
 * tokens has been decided (docs/ADMIN.md §9).
 */
export function surfaceRoutePolicy(
  surface: AiGatewaySurface | undefined,
  route: ModelRoute,
): GatewayRoutingPolicy | undefined {
  if (!surface || !POLICIED_SURFACES[surface]) return undefined;
  if (route.provider !== 'vercel') return undefined;
  return {
    // Default ON, and the opt-out is the same shape the task profiles already have
    // (AI_LITE_REQUIRE_ZDR): an explicit, audited, server-only decision, never a silent
    // degrade. It exists because the gateway makes ZDR a Pro/Enterprise feature - on a Hobby
    // team every Pro generation fails closed with `zdr_unavailable`, which is the correct
    // default and still a decision somebody has to be able to make differently once they have
    // read what it costs. Under OpenRouter this question never arose: ZDR routing was
    // available to any account, so the pin was free.
    zeroDataRetention: boolEnv('AI_SURFACE_REQUIRE_ZDR', true),
    // Pinned on and deliberately NOT behind the switch above. It is free on every plan, so
    // there is no cost to trade away - and Pro's concept call sends a named person and their
    // role to an image model on NoaCG's key, which is the traffic least defensible to leave
    // trainable. Turning ZDR off must not quietly turn this off with it.
    disallowPromptTraining: true,
    sort: 'cost',
    tags: [`surface:${surface}`],
  };
}
