// THE PRODUCTION DATA API - the server-side ingress for automated data into live graphics
// (docs/DATA_API.md; the design constraint it implements is docs/CLOUD_PLAYOUT.md §7).
//
// A connector is a PRODUCER NEXT TO THE OPERATOR, never a second path into the renderer:
// this route turns { values by label } into an ordinary `update` row in the same command log
// every operator surface writes, via control_data_send (control_send's ingest twin) - so
// ordering against operator commands is the log's own, the renderer stays dumb, and "manual
// override" is the operator simply out-writing the feed. Credentials stay here: the caller
// holds a per-production data key (migration 0047), the service-role key never leaves the
// server, and the key is honoured only by the two service-role RPCs, which write nothing but
// update rows - update-only is enforced in the database, not by this file's good manners.
// The in-process gates below are PRE-FILTERS that keep abuse cheap; the DB-side ingest
// budget (25 of any 5 s window, the operator keeping the rest) is the global authority.
//
// The catch-all routes exactly ONE segment on this deployment (scripts/check-api-route-depth
// .mjs - measured, not inferred), so every verb lives one segment deep: /api/data/update
// today, siblings later at no function cost. Function 11 of the 12 budget.

import { apiError, bearerToken, json, methodGuard, readJson } from '../_lib/http.js';
import { checkDataIngestBudget, checkDataIpRateLimit } from '../_lib/rateLimit.js';
import {
  dataApiConfigured,
  mapLabelsToFields,
  parseDataUpdate,
  productionForDataKey,
  resolveTargetGraphic,
  sendDataUpdate,
} from '../_lib/dataIngest.js';

/** Field values, not uploads: a whole scoreboard of labels fits in a few hundred bytes. */
const MAX_BODY_BYTES = 16_384;

const retryAfter = (sec: number): Record<string, string> => ({ 'retry-after': String(sec) });

async function update(req: Request): Promise<Response> {
  const guard = methodGuard(req, 'POST');
  if (guard) return guard;

  const ipGate = checkDataIpRateLimit(req);
  if (ipGate) return apiError('rate_limited', 'Too many requests - slow down.', 429, {}, retryAfter(ipGate.retryAfterSec));

  const key = bearerToken(req);
  if (!key) return apiError('unauthorized', 'Send the production data key as a Bearer token.', 401);
  if (!dataApiConfigured()) return apiError('unavailable', 'The data API is not configured on this deployment.', 503);

  let body: unknown;
  try {
    body = await readJson(req, MAX_BODY_BYTES);
  } catch (error) {
    const code = (error as { code?: string }).code === 'too_large' ? 'too_large' : 'invalid';
    return apiError(code, code === 'too_large' ? 'Request body too large.' : 'The body must be JSON.', code === 'too_large' ? 413 : 400);
  }
  const parsed = parseDataUpdate(body);
  if (!parsed.ok) return apiError('invalid', parsed.error, 400);

  let production;
  try {
    production = await productionForDataKey(key);
  } catch (error) {
    // A transient DB fault must answer in the documented JSON shape, not as the platform's
    // plain-text invocation failure (the dev middleware would mask the difference).
    console.error('Data key resolve failed:', error instanceof Error ? error.message : error);
    return apiError('internal', 'The production could not be resolved.', 500);
  }
  if (!production) return apiError('unauthorized', 'Unknown data key.', 401);

  const budget = checkDataIngestBudget(production.id);
  if (budget) {
    return apiError(
      'rate_limited',
      'This production\'s data budget is spent for the moment - the operator keeps priority.',
      429,
      {},
      retryAfter(budget.retryAfterSec),
    );
  }

  const target = resolveTargetGraphic(production.panel, production.cues, parsed.req);
  if (!target.ok) return apiError('invalid', target.error, 400);

  const mapped = mapLabelsToFields(target.graphic.fields ?? [], parsed.req.values);
  if (Object.keys(mapped.data).length === 0) {
    return apiError('invalid', 'No value matched a field label on that graphic.', 400, {
      issues: [...mapped.ignored.map((l) => `no field labelled "${l}"`), ...mapped.ambiguous.map((l) => `"${l}" is ambiguous`)],
    });
  }

  let event: number;
  try {
    event = await sendDataUpdate(key, target.graphic.name, mapped.data);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // control_data_send's own refusals, translated honestly rather than as a 500.
    if (message.includes('data budget')) return apiError('rate_limited', 'This production\'s data budget is spent for the moment - the operator keeps priority.', 429, {}, retryAfter(5));
    if (message.includes('too many commands')) return apiError('rate_limited', 'The production\'s command log is saturated - slow down.', 429, {}, retryAfter(5));
    if (message.includes('switched off')) return apiError('unauthorized', 'Hosted control is switched off for this production.', 403);
    if (message.includes('unknown data key')) return apiError('unauthorized', 'Unknown data key.', 401);
    console.error('Data update failed:', message);
    return apiError('internal', 'The update could not be written.', 500);
  }

  return json({
    ok: true,
    event,
    graphic: target.graphic.name,
    applied: mapped.data,
    ignored: mapped.ignored,
    ambiguous: mapped.ambiguous,
  });
}

interface Handler {
  fetch(req: Request): Promise<Response>;
}

const ROUTES: Record<string, Handler> = {
  update: { fetch: update },
};

export default {
  async fetch(req: Request): Promise<Response> {
    const path = new URL(req.url).pathname.replace(/^\/api\/data\/?/, '').split('/')[0];
    const handler = ROUTES[path];
    return handler ? handler.fetch(req) : apiError('not_found', 'Not found', 404);
  },
};
