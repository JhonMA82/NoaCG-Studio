// The one error type the TheSportsDB connector throws (docs/SPORTSDB.md).
//
// The codes deliberately mirror the ones the Production Data API already answers with
// (docs/DATA_API.md, "Errors"), so a caller that already handles `rate_limited` or
// `unavailable` from NoaCG's own endpoint handles them from the provider too, and a feed
// script can decide "keep the last values and retry" from the code alone.

/** Every code this connector can raise. `not_found` is a PROVIDER answer, not an HTTP status:
 *  TheSportsDB answers 200 with `{"events":null}` for an id nobody has. */
export const SPORTSDB_ERROR_CODES = /** @type {const} */ ([
  'invalid', // the caller asked for something malformed (empty id, bad date)
  'unauthorized', // the key was refused (401/403)
  'not_found', // the provider answered, and it holds no such record
  'rate_limited', // 429 - `retryAfter` carries the seconds to wait
  'timeout', // the request took longer than the client's budget
  'unavailable', // 5xx, a network failure, or a non-JSON body from an error page
  'malformed', // JSON parsed, but the payload is not the shape the endpoint documents
]);

export class SportsDbError extends Error {
  /**
   * @param {string} code one of SPORTSDB_ERROR_CODES
   * @param {string} message human-readable, and safe to print - it never carries the API key
   * @param {{ status?: number, retryAfter?: number, endpoint?: string, cause?: unknown }} [detail]
   */
  constructor(code, message, detail = {}) {
    super(message, detail.cause === undefined ? undefined : { cause: detail.cause });
    this.name = 'SportsDbError';
    this.code = code;
    if (detail.status !== undefined) this.status = detail.status;
    if (detail.retryAfter !== undefined) this.retryAfter = detail.retryAfter;
    if (detail.endpoint !== undefined) this.endpoint = detail.endpoint;
  }
}

/** True when retrying the SAME request later could plausibly succeed. A feed uses this to
 *  choose between "keep the last values and try next tick" and "stop, this will never work". */
export function isTransient(error) {
  return (
    error instanceof SportsDbError &&
    (error.code === 'rate_limited' || error.code === 'timeout' || error.code === 'unavailable')
  );
}
