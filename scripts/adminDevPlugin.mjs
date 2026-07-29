// Vite dev middleware for the private admin API, mirroring aiDevPlugin: the browser calls
// the same /api/admin routes in development and in production, and the REAL handlers run in
// both, so the 404-for-everyone-else gate is exercised locally rather than assumed.
//
// The unknown-route answer here matches what a real admin handler returns to an unauthorized
// caller, byte for byte. A dev server that answered `no route users` while production
// answered a bare `Not found` would train the page - and whoever tests it - on a shape that
// does not exist in production.

/** @returns {import('vite').Plugin} */
export function adminApiPlugin() {
  return {
    name: 'noacg-admin-api',
    configureServer(server) {
      server.middlewares.use('/api/admin', (req, res) => {
        void handle(server, req, res);
      });
    },
  };
}

const ROUTES = new Set(['session']);

function notFound(res) {
  res.statusCode = 404;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify({ error: { code: 'not_found', message: 'Not found' } }));
}

async function handle(server, req, res) {
  try {
    const [pathPart, query] = (req.url ?? '/').split('?');
    const route = pathPart.replace(/^\/+|\/+$/g, '');
    if (!ROUTES.has(route)) {
      notFound(res);
      return;
    }

    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    const url = `http://${req.headers.host ?? 'localhost'}/api/admin/${route}${query ? '?' + query : ''}`;
    const request = new Request(url, {
      method: req.method,
      headers: Object.fromEntries(
        Object.entries(req.headers).map(([key, value]) => [
          key,
          Array.isArray(value) ? value.join(', ') : String(value ?? ''),
        ]),
      ),
      body: ['GET', 'HEAD'].includes(req.method ?? 'GET') ? undefined : body,
    });

    const mod = await server.ssrLoadModule(`/api/admin/${route}.ts`);
    const response = await mod.default.fetch(request);
    res.statusCode = response.status;
    response.headers.forEach((value, key) => res.setHeader(key, value));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    // Log for the developer, but answer the caller with the same 404 every other refusal
    // uses: a stack trace reaching the browser would confirm the route exists.
    server.config.logger.error(`[admin-api] ${error instanceof Error ? error.stack : error}`);
    notFound(res);
  }
}
