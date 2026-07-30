import { bearerToken, ipHash, json, methodGuard, readJson } from '../_lib/http.js';
import { serverAuthConfigured, verifyUser, type AuthedUser } from '../_lib/auth.js';
import { managedAiKey, readUserAiKeys } from '../_lib/aiCredentials.js';
import { executeGatewayRequest, GatewayError, validateGatewayBody } from '../_lib/aiGateway.js';
import { gatewayLedgerEntry, recordGatewayRequest } from '../_lib/aiGatewayLedger.js';
import { checkAiGenerateRateLimit } from '../_lib/rateLimit.js';
import { gatedFeature, resolveUserEntitlement, surfaceRefused } from '../_lib/entitlements.js';
import { allows } from '../../src/entitlements/contract.js';
import { routeDisabled, systemSettings } from '../_lib/systemSettings.js';
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

    /** Resolve the caller once, lazily. BYO-key traffic deliberately needs no account, so an
     *  anonymous caller is never made to pay for a verification round trip - they simply get
     *  the anonymous defaults, which allow BYO. */
    const entitlementFor = async () => {
      if (!auth.verified) {
        auth.user = await verifyUser(bearerToken(req));
        auth.verified = true;
      }
      return resolveUserEntitlement(auth.user?.userId ?? null);
    };

    /** A tagged surface is gated on its own feature key - today only video, on `ai.video`
     *  (src/ai/video/videoGateway.ts stamps every video call). The DECISION lives in
     *  api/_lib/entitlements.ts as two pure functions, because reaching this branch needs a
     *  verified Supabase token and an untestable refusal is how a gate rots.
     *
     *  Only the ordering is here: resolve nothing until a gated surface is actually named and
     *  a token was actually presented, so an anonymous BYO caller never pays for a
     *  verification round trip they cannot be refused by.
     *
     *  HONEST LIMIT: the tag is client-supplied, and this endpoint is a general model proxy -
     *  so the check binds the product's own traffic, not a hand-rolled request that omits the
     *  tag. Nothing stronger exists here (a proxy that will run any prompt cannot know what
     *  the answer is used for), and it is still what makes suspension and the instance-wide
     *  kill switch reach the video harness instead of changing a row nothing reads. */
    const guardSurface = async (): Promise<void> => {
      const feature = gatedFeature(body.surface);
      if (!feature || !bearerToken(req)) return;
      const entitlement = await entitlementFor(); // verifies the token on the way through
      if (surfaceRefused(feature, Boolean(auth.user), entitlement)) {
        throw new GatewayError(
          'authentication_required',
          'AI video generation is not available for this account.',
          403,
          false,
        );
      }
    };

    const keyFor = async (provider: AiProviderId): Promise<string> => {
      const userKey = userKeys[provider];
      if (userKey) {
        // A signed-in account whose plan withdraws bring-your-own-key is refused; an
        // anonymous one is not, because the anonymous default allows it and self-hosted
        // BYO must keep working without an account. The check only costs a round trip when
        // a token was actually presented.
        if (bearerToken(req) && !allows(await entitlementFor(), 'ai.byo-key')) {
          throw new GatewayError(
            'authentication_required',
            'Bring-your-own-key AI is not available for this account.',
            403,
            false,
          );
        }
        return userKey;
      }
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
      // A route switched off from the admin surface stops serving MANAGED traffic. Scoped to
      // the managed key on purpose: the switch exists to stop the platform's own spend on a
      // model that has gone wrong or expensive, and a BYO caller is spending their own money
      // on a model they chose.
      //
      // keyFor is handed a PROVIDER, not a route, so find the route this request would use it
      // for - the primary if it matches, otherwise the fallback that does.
      const candidate = [body.route, ...(body.fallbacks ?? [])].find((route) => route.provider === provider);
      if (candidate && routeDisabled(await systemSettings(), candidate)) {
        // 'unavailable', not a new code: from the caller's side a switched-off route is
        // indistinguishable from one the deployment never had, and it is not retryable by
        // them - so the existing vocabulary already says the true thing.
        throw new GatewayError('unavailable', 'That model is not currently available.', 503, false);
      }
      return managedKey;
    };

    let result: ModelResult | null = null;
    let failure: GatewayError | null = null;
    try {
      // Inside the try so a refusal ledgers exactly like the BYO one does - an entitlement
      // refusal is an outcome worth counting, not a hole in the accounting.
      await guardSurface();
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
