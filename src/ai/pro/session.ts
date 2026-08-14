// The HOSTED NoaCG Pro session: open a reservation, carry it through every model call the
// generation makes, report what became of it.
//
// A session is the whole generation, not one call, because that is what the money is metered
// in: one reservation, one allowance slot, one $0.15 ceiling covering every call inside it.
// The pipeline takes a session and forwards `generationId` on each call; the server admits
// each one against the reservation and records what it cost (api/_lib/pro/managedCall.ts).
//
// ENGINE-AGNOSTIC ON PURPOSE. Nothing here knows how many calls a generation makes or what
// they ask for. docs/NOACG_PRO_PLAN.md §15 replaces the current concept-and-reconstruct
// pipeline; this file should not have to change when it does.

import { getAccessToken } from '../../backend/auth';
import { uuid } from '../../model/id';
import type {
  ProErrorBody,
  ProOutcomeRequest,
  ProOutcomeStatus,
  ProReservationResponse,
  ProStatusResponse,
} from '../proTypes';

export class ProHostedError extends Error {
  readonly code: string;
  readonly retryable: boolean;

  constructor(code: string, message: string, retryable = false) {
    super(message);
    this.name = 'ProHostedError';
    this.code = code;
    this.retryable = retryable;
  }
}

/** One hosted generation's reservation, as the pipeline carries it. */
export interface ProSession {
  generationId: string;
  expiresAt: number;
  maxGenerationCostUsd: number;
}

async function headers(): Promise<Record<string, string>> {
  const token = await getAccessToken();
  return {
    'content-type': 'application/json',
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  };
}

async function checked<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.json().catch(() => null) as ProErrorBody | null;
    throw new ProHostedError(
      body?.error?.code ?? 'generation_failed',
      body?.error?.message ?? 'NoaCG Pro could not complete the request.',
      body?.error?.retryable ?? false,
    );
  }
  return response.json() as Promise<T>;
}

/**
 * Is hosted Pro available to this visitor, and what is left of their allowance?
 *
 * Resolves to null on any failure - an offline build with no `/api`, a network error, a
 * deployment that predates this route. The caller reads null as "no hosted Pro here" and
 * falls back to the behaviour Pro had before it existed: a bring-your-own key, or the
 * deterministic offline stub.
 */
export async function loadProStatus(): Promise<ProStatusResponse | null> {
  try {
    const response = await fetch('/api/ai/pro/status', { headers: await headers() });
    if (!response.ok) return null;
    return await response.json() as ProStatusResponse;
  } catch {
    return null;
  }
}

/**
 * Open a reservation for one generation.
 *
 * The idempotency key is minted here and never reused, so a retried POST returns
 * `duplicate_request` rather than spending a second allowance slot.
 */
export async function openProSession(): Promise<ProSession> {
  const reservation = await checked<ProReservationResponse>(
    await fetch('/api/ai/pro/generations', {
      method: 'POST',
      headers: await headers(),
      body: JSON.stringify({ idempotencyKey: `pro-${uuid()}` }),
    }),
  );
  return {
    generationId: reservation.generationId,
    expiresAt: Date.parse(reservation.expiresAt),
    maxGenerationCostUsd: reservation.maxGenerationCostUsd,
  };
}

/**
 * Report what became of a session. Best-effort by design: the generation already happened and
 * the SPEND is already recorded server-side, so a failed outcome report must never turn a
 * finished graphic into an error the user sees. What is lost is quality attribution, not
 * accounting.
 */
export async function reportProOutcome(
  session: ProSession | null,
  status: ProOutcomeStatus,
  detail: { reason?: string; ruleCodes?: string[] } = {},
): Promise<void> {
  if (!session) return;
  const body: ProOutcomeRequest = {
    generationId: session.generationId,
    status,
    ...(detail.reason ? { reason: detail.reason } : {}),
    ...(detail.ruleCodes?.length ? { ruleCodes: detail.ruleCodes.slice(0, 30) } : {}),
  };
  try {
    await fetch('/api/ai/pro/outcome', {
      method: 'POST',
      headers: await headers(),
      body: JSON.stringify(body),
    });
  } catch {
    /* accounting is the server's; this is only the quality signal */
  }
}
