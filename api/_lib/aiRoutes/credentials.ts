import { json, methodGuard, readJson } from '../http.js';
import {
  canStoreUserAiKeys,
  clearUserAiKeysCookie,
  readUserAiKeys,
  sameOrigin,
  userAiKeysCookie,
} from '../aiCredentials.js';
import { isAiProviderId } from '../../../src/ai/modelTypes.js';

const MAX_BODY_BYTES = 1024;

function invalid(message: string, status = 400): Response {
  return json({ error: { code: 'invalid_request', message, retryable: false } }, status);
}

export default {
  async fetch(req: Request): Promise<Response> {
    if (req.method !== 'PUT' && req.method !== 'DELETE') return methodGuard(req, 'PUT') as Response;
    if (!sameOrigin(req)) return invalid('Credential changes require a same-origin request.', 403);
    if (!canStoreUserAiKeys()) {
      return invalid('User-provided AI key storage is not configured on this server.', 503);
    }

    try {
      const body = await readJson<{ provider?: unknown; key?: unknown }>(req, MAX_BODY_BYTES);
      if (!isAiProviderId(body.provider)) return invalid('Select a valid AI provider.');
      const keys = readUserAiKeys(req);

      if (req.method === 'PUT') {
        if (typeof body.key !== 'string' || body.key.trim().length < 8 || body.key.trim().length > 512) {
          return invalid('Enter a valid provider API key.');
        }
        keys[body.provider] = body.key.trim();
      } else {
        delete keys[body.provider];
      }

      const hasKeys = Object.keys(keys).length > 0;
      return json(
        { ok: true, provider: body.provider, configured: req.method === 'PUT' },
        200,
        { 'set-cookie': hasKeys ? userAiKeysCookie(req, keys) : clearUserAiKeysCookie(req) },
      );
    } catch {
      return invalid('The credential request is invalid.');
    }
  },
};
