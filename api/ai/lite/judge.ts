// The skin VISION JUDGE endpoint: one server-owned, cost-capped vision call scoring a
// rendered hold frame on legibility / hierarchy / brief-fit / strap-shape. The caller
// (the eval rig today; the app once an in-app capture path exists) reverts to the house
// chassis below the threshold. Same trust posture as /api/ai/lite/generations: the
// browser supplies no model, route, prompt, or policy - only the frame and its context.
// Nothing is stored: the screenshot is judged and dropped; only the judge's provider
// cost is added to the generation's ledger row so the fleet spend ceiling stays honest.

import { bearerToken, ipHash, json, methodGuard, readJson } from '../../_lib/http.js';
import { verifyUser } from '../../_lib/auth.js';
import { managedAiKey } from '../../_lib/aiCredentials.js';
import { estimateModelCost, executeGatewayRequest, GatewayError } from '../../_lib/aiGateway.js';
import { liteError } from '../../_lib/aiLiteHttp.js';
import {
  liteJudgeConfigured,
  liteJudgePolicy,
  liteProfile,
  routePrice,
} from '../../_lib/aiLiteProfile.js';
import { admitLiteIp } from '../../_lib/aiLiteRateLimit.js';
import { getLiteGenerationStore, liteLedgerConfigured } from '../../_lib/aiLiteStore.js';
import {
  LITE_JUDGE_LIMITS,
  LITE_JUDGE_OUTPUT,
  liteJudgeSystemPrompt,
  liteJudgeVerdict,
  validateLiteJudgeScores,
} from '../../../src/ai/liteContract.js';
import type { LiteSkinJudgeRequest, LiteSkinJudgeResult } from '../../../src/ai/liteTypes.js';

// The image ceiling plus JSON overhead for the three small text fields.
const MAX_BODY_BYTES = LITE_JUDGE_LIMITS.imageBase64Chars + 400_000;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
// Every PNG starts with the same 8 signature bytes; base64 keeps them a stable prefix.
const PNG_BASE64_PREFIX = 'iVBORw0KGgo';

function validateJudgeRequest(value: unknown): LiteSkinJudgeRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('object expected');
  const body = value as Record<string, unknown>;
  const allowed = new Set(['generationId', 'brief', 'skinSummary', 'imageBase64']);
  if (!Object.keys(body).every((key) => allowed.has(key))) throw new Error('unknown field');
  if (typeof body.generationId !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.generationId)) throw new Error('generation id');
  if (typeof body.brief !== 'string' || !body.brief.trim() || body.brief.length > LITE_JUDGE_LIMITS.briefChars) {
    throw new Error('brief');
  }
  if (
    typeof body.skinSummary !== 'string'
    || !body.skinSummary.trim()
    || body.skinSummary.length > LITE_JUDGE_LIMITS.summaryChars
  ) throw new Error('skin summary');
  if (
    typeof body.imageBase64 !== 'string'
    || body.imageBase64.length < 100
    || body.imageBase64.length > LITE_JUDGE_LIMITS.imageBase64Chars
    || !body.imageBase64.startsWith(PNG_BASE64_PREFIX)
    || !BASE64.test(body.imageBase64)
  ) throw new Error('image');
  return {
    generationId: body.generationId,
    brief: body.brief.trim(),
    skinSummary: body.skinSummary.trim(),
    imageBase64: body.imageBase64,
  };
}

export default {
  async fetch(req: Request): Promise<Response> {
    const guard = methodGuard(req, 'POST');
    if (guard) return guard;

    const profile = liteProfile();
    if (!profile.enabled) return liteError('profile_disabled', 'NoaCG Lite is currently unavailable.', 503, true);
    if (!liteJudgeConfigured(profile) || !liteLedgerConfigured() || !managedAiKey(profile.judgeRoute.provider)) {
      return liteError('profile_not_configured', 'The Lite skin judge is not enabled on this server.', 503);
    }
    const admission = admitLiteIp(ipHash(req));
    if (!admission.allowed) {
      return liteError('rate_limited', 'Too many Lite requests from this network. Try again shortly.', 429, true, {
        'retry-after': String(admission.retryAfterSeconds),
      });
    }
    const user = await verifyUser(bearerToken(req));
    if (!user) return liteError('authentication_required', 'Sign in to use NoaCG Lite.', 401);

    let request: LiteSkinJudgeRequest;
    try {
      request = validateJudgeRequest(await readJson<unknown>(req, MAX_BODY_BYTES));
    } catch {
      return liteError('invalid_request', 'The judge request exceeds its supported size or shape.', 400);
    }

    // Judging is tied to a real generation the caller owns - the vision spend is only
    // reachable behind a generation that already passed Lite's own admission gates.
    const store = await getLiteGenerationStore();
    const record = await store.get(request.generationId);
    if (!record || record.userId !== user.userId) {
      return liteError('not_found', 'The generation to judge does not exist.', 404);
    }

    const price = routePrice(profile, profile.judgeRoute) ?? undefined;
    const worstCase = estimateModelCost(
      profile.judgeRoute,
      profile.judgeEstimatedInputTokens,
      profile.judgeOutputTokens,
      price,
    );
    if (worstCase === null || worstCase > profile.judgeMaxCostUsd) {
      return liteError('cost_ceiling', 'The configured judge route exceeds its cost ceiling.', 503);
    }
    const openRouter = liteJudgePolicy(profile);
    if (profile.judgeRoute.provider === 'openrouter' && !openRouter) {
      return liteError('profile_not_configured', 'The Lite skin judge is not enabled on this server.', 503);
    }

    try {
      const result = await executeGatewayRequest(
        {
          request: {
            system: liteJudgeSystemPrompt(profile.promptVersion),
            messages: [{
              role: 'user',
              content: [
                { type: 'text', text: JSON.stringify({ brief: request.brief, claimedTreatment: request.skinSummary }) },
                { type: 'image', source: { type: 'base64', media_type: 'image/png', data: request.imageBase64 } },
              ],
            }],
            maxTokens: profile.judgeOutputTokens,
            structuredOutput: LITE_JUDGE_OUTPUT,
          },
          route: profile.judgeRoute,
        },
        { keyFor: async (provider) => managedAiKey(provider) },
        {
          maxAttempts: 2,
          retryLimit: 1,
          timeoutMs: profile.timeoutMs,
          ...(openRouter ? { openRouter } : {}),
        },
      );
      const costUsd = result.usage.estimatedCost?.amount
        ?? estimateModelCost(profile.judgeRoute, result.usage.inputTokens, result.usage.outputTokens, price)
        ?? 0;
      // The judge's spend rides the generation's ledger row, so the daily fleet spend
      // ceiling sees it. Best-effort: an update failure must not void the judgement.
      await store.update(record.id, { providerCostUsd: record.providerCostUsd + costUsd }).catch(() => null);
      if (costUsd > profile.judgeMaxCostUsd) {
        return liteError('cost_ceiling', 'This judge call exceeded its cost ceiling and was discarded.', 503);
      }
      const parsed = validateLiteJudgeScores(result.output);
      if (!parsed) {
        return liteError('generation_failed', 'The judge did not return a usable judgement.', 422);
      }
      const response: LiteSkinJudgeResult = {
        verdict: liteJudgeVerdict(parsed.scores, profile.judgeThreshold),
        scores: parsed.scores,
        reason: parsed.reason,
        threshold: profile.judgeThreshold,
        usage: {
          ...result.usage,
          ...(result.usage.estimatedCost
            ? {}
            : costUsd
              ? { estimatedCost: { amount: costUsd, currency: 'USD' as const, source: 'configured' as const } }
              : {}),
        },
      };
      return json(response);
    } catch (error) {
      if (error instanceof GatewayError) {
        return error.code === 'rate_limited' || error.code === 'unavailable' || error.code === 'timeout'
          ? liteError('provider_unavailable', error.message, error.status, true)
          : liteError('generation_failed', error.message, error.status, false);
      }
      return liteError('generation_failed', 'The Lite skin judge could not complete.', 500);
    }
  },
};
