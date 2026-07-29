// POST /api/events - the growth funnel's one write path (docs/FUNNEL_EVENTS.md).
//
// The browser never touches the funnel table directly: it has no RLS policy for anon or
// authenticated, so this route (with the Supabase secret key) is the only writer. That
// costs one function call per event and buys two things worth more than the saving - the
// allowlist in funnelEvents.ts is enforced somewhere the client cannot edit, and a scraped
// anon key cannot be used to forge or read a funnel.
//
// Always answers 204, including when nothing was written (no backend, unparseable body,
// rate-limited). Analytics must never surface as an error in a user's console, and a
// response that distinguished "stored" from "dropped" would just be a probe oracle.

import { bearerToken, methodGuard } from './_lib/http.js';
import { verifyUser } from './_lib/auth.js';
import { checkEventsRateLimit } from './_lib/rateLimit.js';
import { funnelEventRow, recordFunnelEvent, type FunnelEventInput } from './_lib/funnelEvents.js';

/** Generous next to a real event (a few hundred bytes) and small enough that the route
 *  never becomes an upload path. */
const MAX_BODY_BYTES = 2_048;

const noContent = (): Response => new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });

export default {
  async fetch(req: Request): Promise<Response> {
    const guard = methodGuard(req, 'POST');
    if (guard) return guard;
    if (checkEventsRateLimit(req)) return noContent();

    let input: FunnelEventInput;
    try {
      const declared = Number(req.headers.get('content-length'));
      if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return noContent();
      const text = await req.text();
      if (text.length > MAX_BODY_BYTES) return noContent();
      input = JSON.parse(text) as FunnelEventInput;
    } catch {
      return noContent();
    }

    // The account half of attribution is taken from the token, never from the body - a
    // client cannot claim to be another user. Anonymous stays anonymous.
    const user = await verifyUser(bearerToken(req));
    // The burst gate above hashes the caller's IP for its key; that hash is deliberately
    // NOT part of the row. The funnel identifies a browser by the id that browser minted
    // for itself, and by nothing else.
    const row = funnelEventRow(input, user?.userId ?? null);
    if (!row) return noContent();

    await recordFunnelEvent(row);
    return noContent();
  },
};
