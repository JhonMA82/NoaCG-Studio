import { bearerToken, ipHash, json, methodGuard, readJson } from '../_lib/http.js';
import { serverAuthConfigured, verifyUser, type AuthedUser } from '../_lib/auth.js';
import { managedAiKey, readUserAiKeys } from '../_lib/aiCredentials.js';
import { executeGatewayRequest, GatewayError, validateGatewayBody } from '../_lib/aiGateway.js';
import { gatewayLedgerEntry, recordGatewayRequest } from '../_lib/aiGatewayLedger.js';
import { checkAiGenerateRateLimit } from '../_lib/rateLimit.js';
import type { AiGatewayErrorBody, AiGatewayRequestBody, AiProviderId, ModelResult } from '../../src/ai/modelTypes.js';

const MAX_BODY_BYTES = 12_000_000;

function errorResponse(error: GatewayError, headers: Record<string, string> = {}): Response {
  return json(
    {
      error: {
        code: error.code,
        message: error.message,
        retryable: error.retryable,
      },
    } satisfies AiGatewayErrorBody,
    error.status,
    headers,
  );
}

export default {
  async fetch(req: Request): Promise<Response> {
    const guard = methodGuard(req, 'POST');
    if (guard) return guard;

    // Pre-body burst protection: refuse a hammering client before parsing up to 12 MB.
    const limited = checkAiGenerateRateLimit(req);
    if (limited) {
      return errorResponse(
        new GatewayError('rate_limited', 'Too many AI requests. Try again shortly.', 429, true),
        { 'retry-after': String(limited.retryAfterSec) },
      );
    }

    let body: AiGatewayRequestBody;
    try {
      body = validateGatewayBody(await readJson<unknown>(req, MAX_BODY_BYTES));
    } catch (error) {
      if (error instanceof GatewayError) return errorResponse(error);
      return errorResponse(new GatewayError('invalid_request', 'The AI request is invalid.', 400, false));
    }

    const userKeys = readUserAiKeys(req);
    const authRequired = serverAuthConfigured();
    const auth: { user: AuthedUser | null; verified: boolean } = { user: null, verified: false };

    const keyFor = async (provider: AiProviderId): Promise<string> => {
      const userKey = userKeys[provider];
      if (userKey) return userKey;
      const managedKey = managedAiKey(provider);
      if (!managedKey) return '';
      if (authRequired) {
        if (!auth.verified) {
          auth.user = await verifyUser(bearerToken(req));
          auth.verified = true;
        }
        if (!auth.user) {
          throw new GatewayError(
            'authentication_required',
            'Sign in to use the NoaCG-managed AI service, or add your own provider key.',
            401,
            false,
          );
        }
      }
      return managedKey;
    };

    let result: ModelResult | null = null;
    let failure: GatewayError | null = null;
    try {
      result = await executeGatewayRequest(body, { keyFor });
    } catch (error) {
      failure = error instanceof GatewayError
        ? error
        : new GatewayError('invalid_request', 'The AI request is invalid.', 400, false);
    }

    // Content-free accounting; awaited so a serverless instance can't drop the write,
    // but never able to fail the request itself.
    await recordGatewayRequest(gatewayLedgerEntry({
      userId: auth.user?.userId ?? null,
      ipHash: ipHash(req),
      body,
      userKeys,
      ...(result ? { result } : { errorCode: failure?.code }),
    }));

    return result ? json(result) : errorResponse(failure ?? new GatewayError('unavailable', 'No AI route was available.', 503, false));
  },
};
