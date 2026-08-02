// GET /api/me/entitlement - what the CALLER may do, for the caller's own UI.
//
// The browser needs this for two jobs that were previously guesses: greying a render format the
// server would actually accept, and hiding a template the server considers beta or internal.
// Both were being decided client-side from "is there a user", which is not the question.
//
// It is the SAME resolver the server gates on (api/_lib/entitlements.ts) - the point of the
// endpoint is that there is no second copy of the rules in the browser. Client-side use stays
// UX only; every gated path re-resolves and re-checks, exactly as the render tier always has.
//
// Auth is OPTIONAL: an anonymous caller gets the anonymous defaults rather than a 401, because
// the open editor has to render for someone who never signs in. With no backend configured it
// answers the built-in defaults too, so an offline build needs no branch of its own.
//
// PRIVACY: it answers only about the caller. `hiddenTemplates` is the list THIS caller cannot
// see - never the overlay, never who else can see what, never the beta cohort's membership.

import { bearerToken, json, methodGuard } from '../http.js';
import { verifyUser } from '../auth.js';
import { resolveUserEntitlement } from '../entitlements.js';
import { hiddenTemplateKeys } from '../templateVisibility.js';
import { FEATURE_KEYS, LIMIT_KEYS, type FeatureKey, type LimitKey } from '../../../src/entitlements/contract.js';
import type { MyEntitlement } from '../../../src/entitlements/clientTypes.js';

export default {
  async fetch(req: Request): Promise<Response> {
    const guard = methodGuard(req, 'GET');
    if (guard) return guard;

    const user = await verifyUser(bearerToken(req));
    const entitlement = await resolveUserEntitlement(user?.userId ?? null);

    // The projection is deliberately FLAT - values without their sources. The `why` a value
    // holds is an operator's question, answered on the admin surface against an actor who is
    // allowed to ask it; shipping it here would tell every user which grants exist.
    const features = {} as Record<FeatureKey, boolean>;
    for (const key of FEATURE_KEYS) features[key] = entitlement.features[key].value;
    const limits = {} as Record<LimitKey, number | null>;
    for (const key of LIMIT_KEYS) limits[key] = entitlement.limits[key].value;

    const body: MyEntitlement = {
      signedIn: entitlement.signedIn,
      suspended: entitlement.accountState === 'suspended',
      features,
      limits,
      renderTier: entitlement.renderTier.value,
      renderFormats: entitlement.renderFormats.value,
      hiddenTemplates: await hiddenTemplateKeys(entitlement),
    };

    // Per-user and cheap to recompute; caching it would be the difference between a plan change
    // taking effect now and taking effect whenever a CDN felt like it.
    return json(body);
  },
};
