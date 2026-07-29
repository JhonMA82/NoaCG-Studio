// Vite dev middleware for /api/me - the caller's own entitlement.
//
// Same shape as aiDevPlugin/adminDevPlugin: the browser calls the same route in development
// and production, and the REAL handler runs in both, so the degrade-to-defaults path is
// exercised locally rather than assumed.

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

const ROUTES = new Set(['entitlement']);

async function handle(server, req, res) {
  try {
    const [pathPart, query] = (req.url ?? '/').split('?');
    const route = pathPart.replace(/^\/+|\/+$/g, '');
    if (!ROUTES.has(route)) {
      res.statusCode = 404;
      res.setHeader('content-type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ error: { code: 'not_found', message: 'Not found' } }));
      return;
    }

    const url = `http://${req.headers.host ?? 'localhost'}/api/me/${route}${query ? '?' + query : ''}`;
    const request = new Request(url, {
      method: req.method,
      headers: Object.fromEntries(
        Object.entries(req.headers).map(([key, value]) => [
          key,
          Array.isArray(value) ? value.join(', ') : String(value ?? ''),
        ]),
      ),
    });

    const mod = await server.ssrLoadModule(`/api/me/${route}.ts`);
    const response = await mod.default.fetch(request);
    res.statusCode = response.status;
    response.headers.forEach((value, key) => res.setHeader(key, value));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    // The client treats any non-2xx as "use the defaults", so a dev-time fault degrades the
    // same way production would rather than blanking the catalog.
    server.config.logger.error(`[me-api] ${error instanceof Error ? error.stack : error}`);
    res.statusCode = 500;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: { code: 'internal', message: 'Entitlement lookup failed.' } }));
  }
}
