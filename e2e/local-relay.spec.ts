import { test, expect, type Route } from '@playwright/test';
import { createProject } from './_create';
import JSZip from 'jszip';
import { readFileSync } from 'node:fs';

// The LOCAL-CONTROL door (offline local control, no command line): the overlay package
// bundles a localhost relay (two stdlib implementations of protocol v1) + double-click
// launchers, the panel gains a relay SEND transport, and every overlay graphic carries a
// relay RECEIVER that polls the ordered log. The server implementations are conformance-
// tested for real in scripts/local-relay.test.mjs (npm run test:local-relay); THIS spec
// drives both browser ends against an in-spec implementation of the same protocol, so the
// panel's sends and the graphic's receiver are pinned to v1 without spawning a server.

test('the overlay package ships the local-control bundle, and panel drives graphic through the relay protocol', async ({ page, context }) => {
  await createProject(page, { category: 'Lower thirds', name: 'Hairline' });
  await page.getByTestId('dock-tab-export').click();
  await page.locator('.issue', { hasText: 'HTML overlay (OBS / vMix)' }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /Validate & download/ }).click(),
  ]);
  const zip = await JSZip.loadAsync(readFileSync(await download.path()));
  const names = Object.keys(zip.files).filter((n) => !zip.files[n].dir);

  // The bundle: relay implementations, launchers per OS, the manifest.
  for (const wanted of ['relay.ps1', 'relay.py', 'Start controller.cmd', 'start-controller.command', 'start-controller.sh', 'payload.json']) {
    expect(names, wanted).toContain(`hairline/${wanted}`);
  }
  const payload = JSON.parse(await zip.file('hairline/payload.json')!.async('string'));
  expect(payload.v).toBe(1);
  expect(payload.graphics[0].file).toBe('hairline.html');

  const graphicHtml = await zip.file('hairline/hairline.html')!.async('string');
  const panelHtml = await zip.file('hairline/controlpanel.html')!.async('string');
  expect(graphicHtml).toContain('== LOCAL RELAY');
  expect(panelHtml).toContain('/relay/ping');

  // ── Drive both ends against an in-spec relay (protocol v1, same shapes the conformance
  //    harness pins on the real servers). ──
  const rows: { id: number; graphic: string; stream: string; msg: unknown }[] = [];
  let head = 0;
  const files = new Map<string, string>([
    ['hairline.html', graphicHtml],
    ['controlpanel.html', panelHtml],
  ]);
  const serve = (route: Route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/relay/ping') {
      return route.fulfill({ json: { ok: true, v: 1, head } });
    }
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
    const file = files.get(url.pathname.replace(/^\//, ''));
    if (file == null) return route.fulfill({ status: 404, body: 'nf' });
    return route.fulfill({ status: 200, contentType: 'text/html', body: file });
  };

  // The "OBS side": the graphic on the relay origin. Its autoplay runs on load; take it off
  // air first so the relay-driven play is unambiguous.
  const graphic = await context.newPage();
  await graphic.route('http://relay-host.local/**', serve);
  await graphic.goto('http://relay-host.local/hairline.html', { waitUntil: 'load' });
  await graphic.evaluate(() => (window as unknown as { stop(): void }).stop());
  await expect
    .poll(async () => graphic.locator('.lower-third').evaluate((el) => getComputedStyle(el).opacity))
    .toBe('0');

  // The operator side: the panel in "another browser" — a page with NO BroadcastChannel
  // reach (different Playwright context) so only the relay can carry the commands.
  const other = await context.browser()!.newContext();
  const panel = await other.newPage();
  await panel.route('http://relay-host.local/**', serve);
  await panel.goto('http://relay-host.local/controlpanel.html', { waitUntil: 'load' });
  await expect(panel.locator('#status')).toContainText('local relay', { timeout: 6000 });
  // Relay hosting stands the no-listener banner down (its sends are one-way into OBS).
  await panel.waitForTimeout(2800);
  await expect(panel.locator('#nolisten')).toBeHidden();

  await panel.locator('.field', { hasText: 'Name' }).locator('input[type="text"]').first().fill('Via Relay');
  await panel.getByRole('button', { name: '▶ Play' }).click();

  // The graphic's receiver polls the log and applies update + play.
  await expect(graphic.locator('#f0')).toHaveText('Via Relay', { timeout: 6000 });
  await expect
    .poll(async () => graphic.locator('.lower-third').evaluate((el) => getComputedStyle(el).opacity))
    .toBe('1');

  await panel.close();
  await other.close();
  await graphic.close();
});
