// POST /api/ai/tasks/import-analysis-outcome - content-free acceptance telemetry for an
// analysis (the Lite outcome pattern): applied at least one suggestion, or dismissed the
// proposal (with an enumerated reason). Never the suggestions themselves.

import { bearerToken, json, methodGuard, readJson } from '../http.js';
import { verifyUser } from '../auth.js';
import { liteError } from '../aiLiteHttp.js';
import { getLiteGenerationStore, liteLedgerConfigured } from '../aiLiteStore.js';
import {
  IMPORT_ANALYSIS_DISMISS_REASONS,
  type ImportAnalysisOutcomeRequest,
} from '../../../src/ai/importAnalysis/contract.js';

const ID = /^[0-9a-f]{8}-[0-9a-f-]{27,36}$/i;
const REASONS = new Set<string>(IMPORT_ANALYSIS_DISMISS_REASONS);

function validate(value: unknown): ImportAnalysisOutcomeRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('object');
  const body = value as Record<string, unknown>;
  const allowed = new Set(['analysisId', 'action', 'acceptedRegions', 'dismissReason']);
  if (!Object.keys(body).every((key) => allowed.has(key))) throw new Error('field');
  if (typeof body.analysisId !== 'string' || !ID.test(body.analysisId)) throw new Error('id');
  if (body.action !== 'accepted' && body.action !== 'dismissed') throw new Error('action');
  if (body.acceptedRegions !== undefined && (
    !Number.isInteger(body.acceptedRegions) || Number(body.acceptedRegions) < 0 || Number(body.acceptedRegions) > 50
  )) throw new Error('count');
  if (body.dismissReason !== undefined && (
    body.action !== 'dismissed' || typeof body.dismissReason !== 'string' || !REASONS.has(body.dismissReason)
  )) throw new Error('reason');
  return body as unknown as ImportAnalysisOutcomeRequest;
}

export default {
  async fetch(req: Request): Promise<Response> {
    const guard = methodGuard(req, 'POST');
    if (guard) return guard;
    if (!liteLedgerConfigured()) {
      return liteError('profile_not_configured', 'Graphic analysis is not fully configured.', 503);
    }
    const user = await verifyUser(bearerToken(req));
    if (!user) return liteError('authentication_required', 'Sign in to record an analysis outcome.', 401);
    let body: ImportAnalysisOutcomeRequest;
    try {
      body = validate(await readJson<unknown>(req, 4000));
    } catch {
      return liteError('invalid_request', 'The analysis outcome is invalid.', 400);
    }
    const store = await getLiteGenerationStore();
    const record = await store.get(body.analysisId);
    // Wrong owner, wrong profile, and missing all answer identically - no id oracle.
    if (!record || record.userId !== user.userId || record.profile !== 'import-analysis') {
      return liteError('not_found', 'Analysis not found.', 404);
    }
    if (record.status !== 'usable' && record.status !== 'accepted') {
      return liteError('invalid_request', 'This analysis is not waiting for an outcome.', 409);
    }
    // `acceptedRegions` is validated for shape but deliberately NOT persisted: the
    // ledger has no column for it, and adding one is a decision for when the number
    // proves itself needed - the accepted/dismissed outcome and reason are recorded.
    await store.update(record.id, {
      status: body.action === 'accepted' ? 'accepted' : 'usable',
      feedbackReason: body.action === 'dismissed' ? body.dismissReason ?? 'other' : record.feedbackReason,
      rejectionReason: body.action === 'dismissed' ? 'user_discarded' : null,
    });
    return json({ recorded: true });
  },
};
