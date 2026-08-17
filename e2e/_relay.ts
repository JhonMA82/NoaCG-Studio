import type { Page, Route } from '@playwright/test';

/** One row of the local relay's ordered log, as the exported surfaces send and read it. */
export interface RelayRow {
  id: number;
  graphic: string;
  stream: string;
  msg: unknown;
}

/**
 * An in-spec implementation of LOCAL RELAY protocol v1 (the same shapes the conformance
 * harness pins on the real servers - scripts/local-relay.test.mjs) + a static file map, as a
 * Playwright route handler. Shared so every spec that drives an exported package talks to one
 * relay, and so a spec can assert on the SENT ROWS: what an exported operator surface puts on
 * the wire is the contract, not what its own DOM ends up showing.
 */
export function relayServe(files: Map<string, string>): { serve: (route: Route) => unknown; rows: RelayRow[] } {
  const rows: RelayRow[] = [];
  let head = 0;
  const serve = (route: Route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/relay/ping') return route.fulfill({ json: { ok: true, v: 1, head } });
    if (url.pathname === '/relay/head') return route.fulfill({ json: { head } });
    if (url.pathname === '/relay/log') {
      const after = Number(url.searchParams.get('after') ?? '0');
      return route.fulfill({ json: { rows: rows.filter((r) => r.id > after).slice(0, 500), head } });
    }
    if (url.pathname === '/relay/send') {
      const body = route.request().postDataJSON() as { graphic?: string; stream?: string; msg?: unknown; items?: { graphic: string; stream?: string; msg: unknown }[] };
      const items = body.items ?? [body as { graphic: string; stream?: string; msg: unknown }];
      for (const item of items) rows.push({ id: ++head, graphic: String(item.graphic), stream: item.stream || 'program', msg: item.msg });
      return route.fulfill({ json: { head } });
    }
    const file = files.get(decodeURIComponent(url.pathname.replace(/^\//, '')));
    if (file == null) return route.fulfill({ status: 404, body: 'nf' });
    return route.fulfill({ status: 200, contentType: 'text/html', body: file });
  };
  return { serve, rows };
}

/** Point one page's whole origin at the in-spec relay. */
export async function routeOrigin(page: Page, origin: string, serve: (r: Route) => unknown): Promise<void> {
  await page.route(`${origin}/**`, serve);
}
