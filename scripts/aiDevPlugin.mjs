// Vite dev middleware for the real server-side AI gateway. Browser code always calls the
// same /api/ai routes in development and production; provider keys remain server-only.

/** @returns {import('vite').Plugin} */
export function aiApiPlugin() {
  return {
    name: 'noacg-ai-api',
    configureServer(server) {
      server.middlewares.use('/api/ai', (req, res) => {
        void handle(server, req, res);
      });
    },
  };
}

const ROUTES = new Set([
  'generate',
  'config',
  'credentials',
  'lite/status',
  'lite/generations',
  'lite/outcome',
]);

async function handle(server, req, res) {
  try {
    const [pathPart, query] = (req.url ?? '/').split('?');
    const route = pathPart.replace(/^\/+|\/+$/g, '');
    if (!ROUTES.has(route)) {
      res.statusCode = 404;
      res.end(JSON.stringify({ error: { code: 'not_found', message: `no route ${route}` } }));
      return;
    }

    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    const url = `http://${req.headers.host ?? 'localhost'}/api/ai/${route}${query ? '?' + query : ''}`;
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

    const mod = await server.ssrLoadModule(`/api/ai/${route}.ts`);
    const response = await mod.default.fetch(request);
    res.statusCode = response.status;
    response.headers.forEach((value, key) => res.setHeader(key, value));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    server.config.logger.error(`[ai-api] ${error instanceof Error ? error.stack : error}`);
    res.statusCode = 500;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: { code: 'internal', message: 'AI gateway error.' } }));
  }
}
