import { bearerToken, json, methodGuard } from '../../_lib/http.js';
import { serverAuthConfigured, verifyUser } from '../../_lib/auth.js';
import { managedAiKey } from '../../_lib/aiCredentials.js';
import { getLiteGenerationStore, liteLedgerConfigured } from '../../_lib/aiLiteStore.js';
import { liteProfile, liteProfileConfigured, liteProfileForUser } from '../../_lib/aiLiteProfile.js';
import type { LiteStatusResponse } from '../../../src/ai/liteTypes.js';

export default {
  async fetch(req: Request): Promise<Response> {
    const guard = methodGuard(req, 'GET');
    if (guard) return guard;

    const profile = liteProfile();
    const requiresSignIn = serverAuthConfigured();
    const user = requiresSignIn ? await verifyUser(bearerToken(req)) : null;
    const routesConfigured = [profile.primary, profile.fallback].every((route) => Boolean(managedAiKey(route.provider)));
    const configured = requiresSignIn
      && liteProfileConfigured(profile)
      && liteLedgerConfigured()
      && routesConfigured;
    const available = profile.enabled && configured && Boolean(user);
    const response: LiteStatusResponse = {
      profile: 'lite',
      enabled: profile.enabled,
      available,
      requiresSignIn: requiresSignIn && !user,
      ...(!profile.enabled
        ? { reason: 'disabled' as const }
        : !configured
          ? { reason: 'not-configured' as const }
          : !user
            ? { reason: 'sign-in' as const }
            : {}),
      supportedCategories: profile.supportedCategories,
      limits: profile.limits,
    };
    if (available && user) {
      const effectiveProfile = liteProfileForUser(profile, user.userId);
      const usage = await (await getLiteGenerationStore()).usage(user.userId, Date.now());
      response.allowance = {
        dailyStartsRemaining: Math.max(0, effectiveProfile.dailyStarts - usage.dailyStarts),
        monthlyStartsRemaining: Math.max(0, effectiveProfile.monthlyStarts - usage.monthlyStarts),
        dailySuccessesRemaining: Math.max(0, effectiveProfile.dailySuccesses - usage.dailySuccesses),
        monthlySuccessesRemaining: Math.max(0, effectiveProfile.monthlySuccesses - usage.monthlySuccesses),
      };
    }
    return json(response);
  },
};
