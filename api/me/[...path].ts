// THE CALLER'S OWN SURFACE - one serverless function for everything a visitor may ask or tell
// us about themselves.
//
// Vercel counts a function per routed FILE and the deployment cap is twelve (docs/ADMIN.md §4),
// which this project has already hit once - api/ reached 29 files and production silently
// stopped deploying for four days. So this is the same catch-all shape every other area uses:
// the handlers live in api/_lib/me/, which is not routed and therefore free, and adding
// /api/me/feedback costs no slot at all. `entitlement` behaves exactly as before - same path,
// same method, same body.
//
// The dispatch table is CLOSED, and it is a lookup rather than a dynamic import: a segment from
// the URL must never reach a module specifier.
//
// AUTH IS OPTIONAL ON BOTH ROUTES, and that is the point of grouping them. The editor has no
// login wall (root AGENTS.md, "Auth posture"), so "what may I do" and "here is what I think of
// it" both have to answer for someone who never signs in. Each handler decides what an
// anonymous caller gets; neither refuses one.

import { apiError } from '../_lib/http.js';
import entitlement from '../_lib/me/entitlement.js';
import feedback from '../_lib/me/feedback.js';

interface Handler {
  fetch(req: Request): Promise<Response>;
}

const ROUTES: Record<string, Handler> = {
  entitlement,
  feedback,
};

export default {
  async fetch(req: Request): Promise<Response> {
    const path = new URL(req.url).pathname.replace(/^\/api\/me\/?/, '').split('/')[0];
    const handler = ROUTES[path];
    return handler ? handler.fetch(req) : apiError('not_found', 'Not found', 404);
  },
};
