// Vite dev middleware for /api/me - what the caller may do, and what the caller thinks of it.
//
// Same shape as aiDevPlugin/adminDevPlugin: the browser calls the same route in development
// and production, and the REAL handler runs in both, so the degrade-to-defaults path and the
// always-204-shaped feedback answer are exercised locally rather than assumed.
//
// There is deliberately NO route list here. The catch-all owns the closed dispatch table, and
// a second copy in the dev server would be a second thing to keep in step - which is how a
// route ends up reachable in one environment and missing in the other. The same reasoning
// adminDevPlugin already records.

/** @returns {import('vite').Plugin} */
export function meApiPlugin() {
  return {
    name: 'noacg-me-api',
    configureServer(server) {
      server.middlewares.use('/api/me', (req, res) => {
        void handle(server, req, res);
      });
    },
  };
}

async function handle(server, req, res) {
  try {
    const [pathPart, query] = (req.url ?? '/').split('?');
    const route = pathPart.replace(/^\/+|\/+$/g, '');

    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    const url = `http://${req.headers.host ?? 'localhost'}/api/me/${route}${query ? '?' + query : ''}`;
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

    const mod = await server.ssrLoadModule('/api/me/[...path].ts');
    const response = await mod.default.fetch(request);
    res.statusCode = response.status;
    response.headers.forEach((value, key) => res.setHeader(key, value));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    // The entitlement client treats any non-2xx as "use the defaults", so a dev-time fault
    // degrades the same way production would rather than blanking the catalog.
    server.config.logger.error(`[me-api] ${error instanceof Error ? error.stack : error}`);
    res.statusCode = 500;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: { code: 'internal', message: 'Request failed.' } }));
  }
}
