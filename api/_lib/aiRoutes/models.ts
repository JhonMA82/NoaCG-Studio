import { json, methodGuard } from '../http.js';
import { managedAiKey, readUserAiKeys } from '../aiCredentials.js';
import { discoverProviderModels } from '../aiModelDiscovery.js';
import { isAiProviderId } from '../../../src/ai/modelTypes.js';

export default {
  async fetch(req: Request): Promise<Response> {
    const guard = methodGuard(req, 'GET');
    if (guard) return guard;
    const provider = new URL(req.url).searchParams.get('provider');
    if (!isAiProviderId(provider)) {
      return json({ error: { code: 'invalid_request', message: 'Select a valid AI provider.' } }, 400);
    }
    try {
      const userKeys = readUserAiKeys(req);
      return json(await discoverProviderModels(
        provider,
        userKeys[provider] || managedAiKey(provider) || undefined,
      ));
    } catch {
      return json({
        provider,
        syncedAt: new Date().toISOString(),
        models: [],
        warning: 'The live model catalog is temporarily unavailable. You can still enter a model id.',
      });
    }
  },
};
