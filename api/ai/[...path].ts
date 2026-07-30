// The light /api/ai routes in one function (see api/admin/[...path].ts for the why).
//
// api/ai/generate.ts stays a FUNCTION OF ITS OWN and is deliberately absent from this table:
// it carries maxDuration 300 and reads bodies up to 12 MB, and folding it in here would give
// every cheap config/models call the same heavy configuration.

import { apiError } from '../_lib/http.js';
import config from '../_lib/aiRoutes/config.js';
import consent from '../_lib/aiRoutes/consent.js';
import credentials from '../_lib/aiRoutes/credentials.js';
import models from '../_lib/aiRoutes/models.js';

interface Handler {
  fetch(req: Request): Promise<Response>;
}

const ROUTES: Record<string, Handler> = { config, consent, credentials, models };

export default {
  async fetch(req: Request): Promise<Response> {
    const path = new URL(req.url).pathname.replace(/^\/api\/ai\/?/, '').split('/')[0];
    const handler = ROUTES[path];
    return handler ? handler.fetch(req) : apiError('not_found', 'No such route.', 404);
  },
};
