import { bearerToken, json, methodGuard, readJson } from '../_lib/http.js';
import { serverAuthConfigured, verifyUser } from '../_lib/auth.js';
import { managedAiKey, readUserAiKeys } from '../_lib/aiCredentials.js';
import { executeGatewayRequest, GatewayError, validateGatewayBody } from '../_lib/aiGateway.js';
import type { AiGatewayErrorBody, AiProviderId } from '../../src/ai/modelTypes.ts';

const MAX_BODY_BYTES = 12_000_000;

function errorResponse(error: GatewayError): Response {
  return json(
    {
      error: {
        code: error.code,
        message: error.message,
        retryable: error.retryable,
      },
    } satisfies AiGatewayErrorBody,
    error.status,
  );
}

export default {
  async fetch(req: Request): Promise<Response> {
    const guard = methodGuard(req, 'POST');
    if (guard) return guard;

    try {
      const body = validateGatewayBody(await readJson<unknown>(req, MAX_BODY_BYTES));
      const userKeys = readUserAiKeys(req);
      const authRequired = serverAuthConfigured();
      let authenticated: boolean | null = null;

      const keyFor = async (provider: AiProviderId): Promise<string> => {
        const userKey = userKeys[provider];
        if (userKey) return userKey;
        const managedKey = managedAiKey(provider);
        if (!managedKey) return '';
        if (authRequired) {
          authenticated ??= Boolean(await verifyUser(bearerToken(req)));
          if (!authenticated) {
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

      return json(await executeGatewayRequest(body, { keyFor }));
    } catch (error) {
      if (error instanceof GatewayError) return errorResponse(error);
      return errorResponse(new GatewayError('invalid_request', 'The AI request is invalid.', 400, false));
    }
  },
};
