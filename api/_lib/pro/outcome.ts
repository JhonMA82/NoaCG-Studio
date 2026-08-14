// POST /api/ai/pro/outcome - what became of a hosted Pro reservation.
//
// It records the OUTCOME and nothing about money: the cost is written by the server that spent
// it (api/ai/generate.ts settles each call through record_ai_pro_call), because a figure the
// client supplies is not accounting. What the browser knows and the server cannot is whether
// the finished graphic was usable, so that is all it reports.
//
// Content-free, like every other ledger write: an enumerated status, an enumerated failure
// code, and validation rule codes. No prompt, no concept image, no generated code.

import { bearerToken, json, methodGuard, readJson } from '../http.js';
import { verifyUser } from '../auth.js';
import { proError } from './http.js';
import { liteLedgerConfigured, getLiteGenerationStore } from '../aiLiteStore.js';
import type { ProOutcomeRequest } from '../../../src/ai/proTypes.js';

const ID = /^[0-9a-f]{8}-[0-9a-f-]{27,36}$/i;
const CODE = /^[a-z0-9][a-z0-9_.:-]{0,79}$/i;
const STATUSES = new Set(['accepted', 'usable', 'failed']);

function validate(value: unknown): ProOutcomeRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('object');
  const body = value as Record<string, unknown>;
  if (typeof body.generationId !== 'string' || !ID.test(body.generationId)) throw new Error('id');
  if (typeof body.status !== 'string' || !STATUSES.has(body.status)) throw new Error('status');
  if (body.reason !== undefined && (typeof body.reason !== 'string' || !CODE.test(body.reason))) {
    throw new Error('reason');
  }
  if (body.ruleCodes !== undefined) {
    if (!Array.isArray(body.ruleCodes) || body.ruleCodes.length > 30
      || !body.ruleCodes.every((code) => typeof code === 'string' && CODE.test(code))) {
      throw new Error('rules');
    }
  }
  if (body.runtimeMs !== undefined
    && (!Number.isInteger(body.runtimeMs) || Number(body.runtimeMs) < 0 || Number(body.runtimeMs) > 1_800_000)) {
    throw new Error('runtime');
  }
  return body as unknown as ProOutcomeRequest;
}

export default {
  async fetch(req: Request): Promise<Response> {
    const guard = methodGuard(req, 'POST');
    if (guard) return guard;
    if (!liteLedgerConfigured()) {
      return proError('profile_not_configured', 'NoaCG Pro is not fully configured.', 503);
    }
    const user = await verifyUser(bearerToken(req));
    if (!user) return proError('authentication_required', 'Sign in to record a Pro outcome.', 401);

    let body: ProOutcomeRequest;
    try {
      body = validate(await readJson<unknown>(req, 8_000));
    } catch {
      return proError('invalid_request', 'The Pro outcome is invalid.', 400);
    }

    const store = await getLiteGenerationStore();
    const record = await store.get(body.generationId);
    // A missing record and one owned by somebody else answer identically, so this cannot
    // become a generation-id oracle.
    if (!record || record.userId !== user.userId || record.profile !== 'pro') {
      return proError('invalid_request', 'Pro generation not found.', 404);
    }

    await store.update(record.id, {
      status: body.status,
      validationRuleCodes: body.ruleCodes?.slice(0, 30) ?? record.validationRuleCodes,
      // How long the whole generation took, end to end. Recorded because Pro's admission
      // RETRY SPACING is currently an unmeasured default (aiProProfile.ts): Lite's 17.8 s came
      // from 18 real generations, and this column is what will let Pro's be replaced by a real
      // turnover instead of staying a number somebody chose.
      runtimeMs: body.runtimeMs ?? record.runtimeMs,
      rejectionReason: body.status === 'failed' ? body.reason ?? 'generation_failed' : null,
    });
    return json({ recorded: true });
  },
};
