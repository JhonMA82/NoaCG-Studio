// The hosted NoaCG Pro paths, mounted in api/ai/[...path].ts as SINGLE SEGMENTS.
//
// WHY `pro-status` AND NOT `pro/status`. Measured on production 2026-08-14: a `[...path].ts`
// function here routes exactly ONE segment. `/api/ai/pro` reached this table and answered its
// own JSON 404; `/api/ai/pro/status` never arrived at all and got the PLATFORM's
// `NOT_FOUND`. The same probe over the rest of the tree agrees - `/api/ai/lite/nonexistent`
// is answered by Lite's router while `/api/ai/lite/a/b` is a platform 404, and
// `/api/ai/tasks/import-analysis` routes while `/api/ai/tasks/import-analysis/status` does
// not. It is not documented; it is what the deployment does.
//
// So a nested path costs a FUNCTION, not a table entry: Lite works only because
// `api/ai/lite/[...path].ts` is its own function, which puts `status` one segment past ITS
// directory. Two spare functions against the Hobby cap of 12 is not headroom to spend on a
// route table - api/ hit 29 once and production silently stopped deploying for four days
// (docs/DEPLOYMENT.md) - so the segment moves into the name instead. The client is our own
// browser code, so the URL shape costs nothing.
//
// The table is CLOSED and the unknown-path answer is Pro's own 404, not a bare one: this
// endpoint is reached by the browser client, which expects a ProErrorBody.

import { proError } from './http.js';
import generations from './generations.js';
import outcome from './outcome.js';
import status from './status.js';

interface Handler {
  fetch(req: Request): Promise<Response>;
}

/** The path segment each handler answers to, under `/api/ai/`. Exported so the browser client
 *  and the reachability guard read the SAME strings this table is built from - a URL written
 *  out twice is how one of them silently stops being served. */
export const PRO_ROUTE_SEGMENTS = {
  status: 'pro-status',
  generations: 'pro-generations',
  outcome: 'pro-outcome',
} as const;

export const PRO_ROUTES: Record<string, Handler> = {
  [PRO_ROUTE_SEGMENTS.status]: status,
  [PRO_ROUTE_SEGMENTS.generations]: generations,
  [PRO_ROUTE_SEGMENTS.outcome]: outcome,
};

/** Answer a Pro path that reached the shared table but names no handler. */
export function proNotFound(): Response {
  return proError('invalid_request', 'No such Pro route.', 404);
}
