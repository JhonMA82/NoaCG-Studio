import { json } from './http.js';

export type LiteApiErrorCode =
  | 'invalid_request'
  | 'authentication_required'
  | 'profile_disabled'
  | 'profile_not_configured'
  | 'allowance_exhausted'
  | 'already_running'
  | 'fleet_capacity'
  | 'cost_ceiling'
  | 'duplicate_request'
  | 'rate_limited'
  | 'provider_unavailable'
  | 'generation_failed'
  | 'not_found';

export function liteError(
  code: LiteApiErrorCode,
  message: string,
  status: number,
  retryable = false,
  headers: Record<string, string> = {},
): Response {
  return json({ error: { code, message, retryable } }, status, headers);
}
