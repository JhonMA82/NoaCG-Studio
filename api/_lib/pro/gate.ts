// The ONE admission decision hosted Pro is made of, so the status endpoint, the reservation
// endpoint and the gateway proxy cannot disagree about whether a caller may generate.
//
// This is the lesson `api/_lib/lite/status.ts` already carries in a comment ("if this drifts,
// the panel promises an allowance the reservation will not honour") written as code instead:
// three callers, one function, one answer.

import { bearerToken } from '../http.js';
import { managedAiKey } from '../aiCredentials.js';
import { serverAuthConfigured, verifyUser, type AuthedUser } from '../auth.js';
import { proProfile, proProfileForUser, type ProProfile } from '../aiProProfile.js';
import { proTaskProfile, taskConfigured } from '../aiTaskRegistry.js';
import { liteLedgerConfigured } from '../aiLiteStore.js';
import { resolveUserEntitlement } from '../entitlements.js';
import { routeDisabled, systemSettings } from '../systemSettings.js';
import { allows, type Entitlement } from '../../../src/entitlements/contract.js';
import type { ProUnavailableReason } from '../../../src/ai/proTypes.js';

export interface ProGate {
  profile: ProProfile;
  /** The profile with any per-user development override already applied - what a reservation
   *  must be measured against, and therefore what the status endpoint must report. */
  effectiveProfile: ProProfile;
  user: AuthedUser | null;
  entitlement: Entitlement | null;
  requiresSignIn: boolean;
  available: boolean;
  reason?: ProUnavailableReason;
}

/**
 * Resolve hosted Pro for this request.
 *
 * Every gate fails CLOSED, and the order is deliberate: switched off, then unconfigured (no
 * ledger, no managed key, an unpriced or unapproved route, a route the admin surface has
 * disabled), then not signed in, then not entitled. An account whose plan withdraws `ai.pro`
 * reads the same as the feature being off - there is nothing to buy, so there is no upgrade
 * prompt to show.
 */
export async function resolveProGate(req: Request): Promise<ProGate> {
  const profile = proProfile();
  const requiresSignIn = serverAuthConfigured();
  const user = await verifyUser(bearerToken(req));
  const system = await systemSettings();
  const configured = requiresSignIn
    && taskConfigured(proTaskProfile(profile))
    && liteLedgerConfigured()
    && profile.routes.every((route) => Boolean(managedAiKey(route.provider)))
    // A route switched off from /admin stops serving managed traffic. Pro has no fallback for
    // either of its two roles, so ANY disabled route takes the surface down rather than
    // degrading it - the switch exists to stop spend on a model that has gone wrong, and
    // half a generation is not a cheaper outcome than none.
    && !profile.routes.some((route) => routeDisabled(system, route));
  const entitlement = user ? await resolveUserEntitlement(user.userId) : null;
  const entitled = entitlement ? allows(entitlement, 'ai.pro') : false;
  const available = profile.enabled && configured && Boolean(user) && entitled;
  return {
    profile,
    effectiveProfile: user ? proProfileForUser(profile, user.userId) : profile,
    user,
    entitlement,
    requiresSignIn: requiresSignIn && !user,
    available,
    ...(available
      ? {}
      : !profile.enabled
        ? { reason: 'disabled' as const }
        : !configured
          ? { reason: 'not-configured' as const }
          : !user
            ? { reason: 'sign-in' as const }
            : { reason: 'disabled' as const }),
  };
}
