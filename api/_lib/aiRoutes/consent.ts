// AI disclosure-notice consent (docs/AI_PLATFORM_PLAN.md §9, ratified decision 2).
// GET  -> has the signed-in caller accepted the CURRENT notice version?
// POST -> record acceptance of the current version (timestamp + version, upserted).
//
// Signed-in only: anonymous acceptance is recorded client-side and never sent here.
// The endpoint stores nothing but the version and timestamp - content-free.

import { bearerToken, json, readJson } from '../http.js';
import { serverAuthConfigured, verifyUser } from '../auth.js';
import { consentStoreConfigured, readAiConsent, recordAiConsent } from '../aiConsentStore.js';
import { AI_NOTICE_VERSION } from '../../../src/ai/consentNotice.js';

const MAX_BODY_BYTES = 1000;

function error(code: string, message: string, status: number): Response {
  return json({ error: { code, message } }, status);
}

export default {
  async fetch(req: Request): Promise<Response> {
    if (req.method !== 'GET' && req.method !== 'POST') {
      return error('invalid', `${req.method} not allowed`, 405);
    }
    if (!serverAuthConfigured() || !consentStoreConfigured()) {
      return error('not_configured', 'Consent storage is not available on this deployment.', 503);
    }
    const user = await verifyUser(bearerToken(req));
    if (!user) return error('authentication_required', 'Sign in to record AI notice acceptance.', 401);

    if (req.method === 'GET') {
      const record = await readAiConsent(user.userId).catch(() => null);
      return json({
        noticeVersion: AI_NOTICE_VERSION,
        accepted: record?.noticeVersion === AI_NOTICE_VERSION,
        ...(record ? { acceptedVersion: record.noticeVersion, acceptedAt: record.acceptedAt } : {}),
      });
    }

    let body: unknown;
    try {
      body = await readJson<unknown>(req, MAX_BODY_BYTES);
    } catch {
      return error('invalid_request', 'The consent request exceeds its supported size or shape.', 400);
    }
    const noticeVersion = body && typeof body === 'object' && !Array.isArray(body)
      ? (body as Record<string, unknown>).noticeVersion
      : undefined;
    // Only the CURRENT version is recordable - a stale client must re-show the new
    // wording rather than record acceptance of text the user never saw.
    if (noticeVersion !== AI_NOTICE_VERSION) {
      return error('stale_notice', 'The notice version is not current. Reload to see the latest notice.', 409);
    }
    try {
      await recordAiConsent(user.userId, AI_NOTICE_VERSION);
    } catch {
      return error('storage_failed', 'The acceptance could not be stored. Try again.', 500);
    }
    return json({ noticeVersion: AI_NOTICE_VERSION, accepted: true });
  },
};
