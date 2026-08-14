// POST /api/ai/pro/generations - open ONE hosted Pro reservation.
//
// This endpoint spends nothing. It admits the caller and books the generation's worst case
// against the allowance; the model calls themselves go out through the generic gateway proxy
// (api/ai/generate.ts), which admits each one against this reservation and settles its real
// cost into it. That split is not incidental - it is what keeps the route ENGINE-AGNOSTIC.
// Whatever docs/NOACG_PRO_PLAN.md §15 replaces the current pipeline with, however many calls
// it makes and in whatever order, the allowance it spends against is this one.

import { ipHash, json, methodGuard, readJson } from '../http.js';
import { proError } from './http.js';
import { resolveProGate } from './gate.js';
import { admitTaskIp } from '../aiLiteRateLimit.js';
import { PRO_TASK_ID } from '../aiTaskRegistry.js';
import { getLiteGenerationStore, type LiteReservation } from '../aiLiteStore.js';
import type { ProReservationResponse } from '../../../src/ai/proTypes.js';

const MAX_BODY_BYTES = 2_000;
const IDEMPOTENCY = /^[A-Za-z0-9][A-Za-z0-9_-]{15,127}$/;

/** The refusal for every reservation verdict that is not `created`. Same vocabulary as Lite's,
 *  because the reasons are the same reasons. */
export function proReservationError(reservation: Exclude<LiteReservation, { status: 'created' }>): Response {
  if (reservation.status === 'duplicate') {
    return proError('duplicate_request', 'This Pro generation was already started.', 409);
  }
  if (reservation.status === 'user-concurrency') {
    return proError('already_running', 'Finish the current Pro generation before starting another.', 409, true);
  }
  if (reservation.status === 'fleet-concurrency') {
    return proError('shared_capacity', 'NoaCG Pro is temporarily busy. Please try again in a moment.', 503, true);
  }
  if (reservation.status === 'fleet-spend') {
    return proError('fleet_spend_ceiling', 'NoaCG Pro is temporarily unavailable.', 503, false);
  }
  return proError('allowance_exhausted', 'Your current NoaCG Pro allowance has been used.', 429);
}

export default {
  async fetch(req: Request): Promise<Response> {
    const guard = methodGuard(req, 'POST');
    if (guard) return guard;

    // Pre-body burst protection, before any Supabase round trip. Never an entitlement - the
    // allowance below is the authority (aiLiteRateLimit.ts).
    const callerIpHash = ipHash(req);
    const admission = admitTaskIp(PRO_TASK_ID, callerIpHash);
    if (!admission.allowed) {
      return proError('rate_limited', 'Too many Pro requests from this network. Try again shortly.', 429, true, {
        'retry-after': String(admission.retryAfterSeconds),
      });
    }

    const gate = await resolveProGate(req);
    if (!gate.available || !gate.user) {
      if (gate.reason === 'sign-in') {
        return proError('authentication_required', 'Sign in to use NoaCG Pro.', 401);
      }
      if (gate.reason === 'not-configured') {
        return proError('profile_not_configured', 'NoaCG Pro is not fully configured.', 503);
      }
      return proError('profile_disabled', 'NoaCG Pro is currently unavailable.', 503, true);
    }

    let idempotencyKey: string;
    try {
      const body = await readJson<{ idempotencyKey?: unknown }>(req, MAX_BODY_BYTES);
      if (typeof body.idempotencyKey !== 'string' || !IDEMPOTENCY.test(body.idempotencyKey)) {
        throw new Error('idempotency');
      }
      idempotencyKey = body.idempotencyKey;
    } catch {
      return proError('invalid_request', 'The Pro reservation request is invalid.', 400);
    }

    const profile = gate.effectiveProfile;
    const now = Date.now();
    const reservation = await (await getLiteGenerationStore()).reserve({
      userId: gate.user.userId,
      ipHash: callerIpHash,
      idempotencyKey,
      requestedCategory: null,
      now,
      profile: {
        id: 'pro',
        promptVersion: profile.promptVersion,
        // The WHOLE generation's ceiling is booked here, not one call's. Every call this
        // reservation pays for is admitted against that single booking, so a generation that
        // is abandoned halfway still cost the fleet its conservative figure - which is the
        // safe direction to be wrong in (api/_lib/lite/generations.ts carries the argument).
        maxProviderCostUsd: profile.maxProviderCostUsd,
        dailyStarts: profile.dailyStarts,
        monthlyStarts: profile.monthlyStarts,
        dailySuccesses: profile.dailySuccesses,
        monthlySuccesses: profile.monthlySuccesses,
        maxConcurrentPerUser: profile.maxConcurrentPerUser,
        maxConcurrentFleet: profile.maxConcurrentFleet,
        dailyFleetSpendUsd: profile.dailyFleetSpendUsd,
        expiryMs: profile.expiryMs,
      },
    });
    if (reservation.status !== 'created') return proReservationError(reservation);

    const response: ProReservationResponse = {
      generationId: reservation.record.id,
      expiresAt: new Date(reservation.record.expiresAt).toISOString(),
      maxCalls: profile.maxCallsPerGeneration,
      maxGenerationCostUsd: profile.maxProviderCostUsd,
    };
    return json(response, 201);
  },
};
