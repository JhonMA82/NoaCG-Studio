// The imported-graphic-analysis task's one serverless function (see api/admin/[...path].ts).
//
// Two shapes share this prefix: /api/ai/tasks/import-analysis is the analysis call itself, and
// /api/ai/tasks/import-analysis/{status,outcome} are its status and outcome routes. The
// dispatch key is therefore the path AFTER the prefix, joined - 'import-analysis' for the bare
// call, 'import-analysis/status' for the nested one.

import { liteError } from '../../_lib/aiLiteHttp.js';
import analyze from '../../_lib/importAnalysis/analyze.js';
import outcome from '../../_lib/importAnalysis/outcome.js';
import status from '../../_lib/importAnalysis/status.js';

interface Handler {
  fetch(req: Request): Promise<Response>;
}

const ROUTES: Record<string, Handler> = {
  'import-analysis': analyze,
  'import-analysis/status': status,
  'import-analysis/outcome': outcome,
};

export default {
  async fetch(req: Request): Promise<Response> {
    const path = new URL(req.url).pathname.replace(/^\/api\/ai\/tasks\/?/, '').replace(/\/$/, '');
    const handler = ROUTES[path];
    return handler ? handler.fetch(req) : liteError('invalid_request', 'No such task route.', 404);
  },
};
