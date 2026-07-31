// THE ADMIN SURFACE'S ONE SERVERLESS FUNCTION.
//
// Vercel counts a function per routed FILE, and the deployment cap is 12 (docs/ADMIN.md §4).
// Nine files under api/admin/ meant nine of those twelve for one private surface, so the
// handlers live in api/_lib/admin/ - which is NOT routed, and therefore free - and this
// catch-all dispatches to them. Behaviour is unchanged: same paths, same methods, same
// bodies, same 404.
//
// The dispatch table is CLOSED. An unknown path gets the same fixed 404 every other refusal
// on this surface returns, so the catch-all does not turn /api/admin/<anything> into a probe
// that answers differently from a real route (api/_lib/adminAuth.ts explains why that
// matters). It is deliberately a lookup rather than a dynamic import of the path: a segment
// from the URL must never reach a module specifier.

import { adminNotFound } from '../_lib/adminAuth.js';
import session from '../_lib/admin/session.js';
import overview from '../_lib/admin/overview.js';
import models from '../_lib/admin/models.js';
import users from '../_lib/admin/users.js';
import user from '../_lib/admin/user.js';
import plans from '../_lib/admin/plans.js';
import grants from '../_lib/admin/grants.js';
import usage from '../_lib/admin/usage.js';
import quality from '../_lib/admin/quality.js';
import system from '../_lib/admin/system.js';
import templates from '../_lib/admin/templates.js';
import audit from '../_lib/admin/audit.js';

interface Handler {
  fetch(req: Request): Promise<Response>;
}

const ROUTES: Record<string, Handler> = {
  session,
  overview,
  models,
  users,
  user,
  plans,
  grants,
  usage,
  quality,
  system,
  templates,
  audit,
};

export default {
  async fetch(req: Request): Promise<Response> {
    // Everything after /api/admin/, first segment only. A nested or empty path is not a
    // route here and falls through to the same refusal as an unknown one.
    const path = new URL(req.url).pathname.replace(/^\/api\/admin\/?/, '').split('/')[0];
    const handler = ROUTES[path];
    return handler ? handler.fetch(req) : adminNotFound();
  },
};
