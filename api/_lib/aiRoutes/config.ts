import { bearerToken, json, methodGuard } from '../http.js';
import { serverAuthConfigured, verifyUser } from '../auth.js';
import { canStoreUserAiKeys, managedAiKey, readUserAiKeys } from '../aiCredentials.js';
import { AI_PROVIDER_IDS } from '../../../src/ai/modelTypes.js';

export default {
  async fetch(req: Request): Promise<Response> {
    const guard = methodGuard(req, 'GET');
    if (guard) return guard;

    const userKeys = readUserAiKeys(req);
    const requiresSignIn = serverAuthConfigured();
    const signedIn = !requiresSignIn || Boolean(await verifyUser(bearerToken(req)));
    return json({
      keyStorageAvailable: canStoreUserAiKeys(),
      providers: AI_PROVIDER_IDS.map((provider) => ({
        id: provider,
        userKey: Boolean(userKeys[provider]),
        managedKey: Boolean(managedAiKey(provider)),
        available: Boolean(userKeys[provider] || (managedAiKey(provider) && signedIn)),
        requiresSignIn: Boolean(!userKeys[provider] && managedAiKey(provider) && requiresSignIn && !signedIn),
      })),
    });
  },
};
