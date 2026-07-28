// GET /api/ai/tasks/import-analysis/status - availability + public limits + remaining
// allowance for the imported-graphic-analysis task. Mirrors /api/ai/lite/status: never
// routes, providers, models, prices, or endpoint slugs.

import { bearerToken, json, methodGuard } from '../../../_lib/http.js';
import { serverAuthConfigured, verifyUser } from '../../../_lib/auth.js';
import { managedAiKey } from '../../../_lib/aiCredentials.js';
import { importAnalysisProfile } from '../../../_lib/aiImportAnalysisProfile.js';
import { importAnalysisTaskProfile, taskConfigured } from '../../../_lib/aiTaskRegistry.js';
import { getLiteGenerationStore, liteLedgerConfigured } from '../../../_lib/aiLiteStore.js';
import {
  IMPORT_ANALYSIS_LIMITS,
  type ImportAnalysisStatusResponse,
} from '../../../../src/ai/importAnalysis/contract.js';

export default {
  async fetch(req: Request): Promise<Response> {
    const guard = methodGuard(req, 'GET');
    if (guard) return guard;

    const profile = importAnalysisProfile();
    const requiresSignIn = serverAuthConfigured();
    const user = requiresSignIn ? await verifyUser(bearerToken(req)) : null;
    const configured = requiresSignIn
      && taskConfigured(importAnalysisTaskProfile(profile))
      && liteLedgerConfigured()
      && Boolean(managedAiKey(profile.route.provider));
    const available = profile.enabled && configured && Boolean(user);
    const response: ImportAnalysisStatusResponse = {
      task: 'imported-graphic-analysis',
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
      limits: {
        maxImages: IMPORT_ANALYSIS_LIMITS.maxImages,
        maxWidth: IMPORT_ANALYSIS_LIMITS.maxWidth,
        maxHeight: IMPORT_ANALYSIS_LIMITS.maxHeight,
        instructionChars: IMPORT_ANALYSIS_LIMITS.instructionChars,
      },
    };
    if (available && user) {
      const usage = await (await getLiteGenerationStore()).usage('import-analysis', user.userId, Date.now());
      response.allowance = {
        dailySuccessesRemaining: Math.max(0, profile.dailySuccesses - usage.dailySuccesses),
        monthlySuccessesRemaining: Math.max(0, profile.monthlySuccesses - usage.monthlySuccesses),
      };
    }
    return json(response);
  },
};
