// The hosted NoaCG Pro paths, behind api/ai/[...path].ts rather than a function of their own.
//
// WHY NOT api/ai/pro/[...path].ts. The Hobby plan caps a deployment at 12 serverless functions
// and api/ routes 10 today. Once, this tree reached 29 and EVERY production deploy died at
// patchBuild for four days while the repo stayed green (docs/DEPLOYMENT.md). Two spare
// functions is not headroom to spend on a route table; a nested table costs nothing and reads
// the same.
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

const ROUTES: Record<string, Handler> = { generations, outcome, status };

export default {
  async fetch(req: Request): Promise<Response> {
    const path = new URL(req.url).pathname.replace(/^\/api\/ai\/pro\/?/, '').split('/')[0];
    const handler = ROUTES[path];
    return handler ? handler.fetch(req) : proError('invalid_request', 'No such Pro route.', 404);
  },
};
