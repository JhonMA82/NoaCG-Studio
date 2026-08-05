import { test, expect, type Page, type Route } from '@playwright/test';
import { createProject } from './_create';
import JSZip from 'jszip';
import { readFileSync } from 'node:fs';

/** An in-spec implementation of relay protocol v1 (the same shapes the conformance harness
 *  pins on the real servers) + a static file map, as a Playwright route handler. */
function relayServe(files: Map<string, string>) {
  const rows: { id: number; graphic: string; stream: string; msg: unknown }[] = [];
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

async function routeOrigin(page: Page, origin: string, serve: (r: Route) => unknown) {
  await page.route(`${origin}/**`, serve);
}

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

test('the production controller: preview shows the cue without airing it, Take airs it, tallies follow the log', async ({ page, context }) => {
  // The exported LOCAL-CONTROL production package's operator surface (the page the launcher
  // opens): cue rundown + verbs + PREVIEW/PROGRAM monitors, everything through relay v1.
  await page.goto('/app');
  await page.keyboard.press('Escape');
  const b64 = await page.evaluate(async () => {
    const { variantsFor } = await import('/src/templates/catalog.ts');
    const { createGraphic } = await import('/src/model/library.ts');
    const shows = await import('/src/model/shows.ts');
    const { buildShowZipFor } = await import('/src/export/showExport.ts');
    const tpl = variantsFor('lower-third')[0].create({});
    const { doc } = createGraphic(tpl, { name: 'Anchor Strap' });
    const show = shows.createShowNamed('Controller Show');
    shows.addGraphicToShow(show.id, tpl, { graphicId: doc!.id });
    const fresh0 = shows.loadShows().find((s) => s.id === show.id)!;
    // Two cues on the one graphic: Anna, then Ben (the classic lower-third rundown).
    const cue1 = fresh0.cues![0];
    shows.updateShowCue(show.id, cue1.id, { label: 'Anna', values: { f0: 'Anna Andersson' } });
    shows.addShowCue(show.id, fresh0.graphics[0].id, { label: 'Ben', values: { f0: 'Ben Bergman' } });
    const fresh = shows.loadShows().find((s) => s.id === show.id)!;
    const zip = await buildShowZipFor(fresh, 'html-overlay');
    return zip.generateAsync({ type: 'base64' });
  });

  const zip = await JSZip.loadAsync(b64, { base64: true });
  const files = new Map<string, string>();
  for (const n of Object.keys(zip.files)) {
    if (!zip.files[n].dir && /\.(html|json)$/.test(n)) {
      files.set(n.replace(/^controller_show\//, ''), await zip.file(n)!.async('string'));
    }
  }
  expect([...files.keys()]).toContain('controller.html');
  const manifest = JSON.parse(files.get('payload.json')!) as { graphics: { file: string }[] };
  const graphicFile = manifest.graphics[0].file;
  expect([...files.keys()]).toContain(graphicFile);

  const { serve } = relayServe(files);
  const origin = 'http://ctl-host.local';

  // The "OBS side": the graphic addressed as a PROGRAM stream source — managed, so it must
  // NOT autoplay; it waits for the log.
  const air = await context.newPage();
  await routeOrigin(air, origin, serve);
  await air.goto(`${origin}/${graphicFile}?stream=program`, { waitUntil: 'load' });
  await air.waitForTimeout(600);
  expect(await air.locator('.lower-third').evaluate((el) => getComputedStyle(el).opacity)).toBe('0');

  // The controller.
  const ctl = await context.newPage();
  await routeOrigin(ctl, origin, serve);
  await ctl.goto(`${origin}/controller.html`, { waitUntil: 'load' });
  await expect(ctl.locator('#mode')).toContainText('SHOW');
  await expect(ctl.locator('.cue')).toHaveCount(2);

  // → Preview: the PVW monitor's copy plays with Anna; AIR stays dark.
  await ctl.locator('.cue', { hasText: 'Anna' }).click();
  await ctl.locator('#v-preview').click();
  const pvwFrame = ctl.frameLocator('#stage-pvw iframe');
  await expect(pvwFrame.locator('#f0')).toHaveText('Anna Andersson', { timeout: 6000 });
  await expect
    .poll(async () => pvwFrame.locator('.lower-third').evaluate((el) => getComputedStyle(el).opacity))
    .toBe('1');
  await expect(ctl.locator('.cue', { hasText: 'Anna' })).toHaveClass(/on-pvw/);
  expect(await air.locator('.lower-third').evaluate((el) => getComputedStyle(el).opacity)).toBe('0');

  // ⟳ Take: the program source plays with Anna; the cue wears the red tally; the PGM
  // monitor mirrors air.
  await ctl.locator('#v-take').click();
  await expect(air.locator('#f0')).toHaveText('Anna Andersson', { timeout: 6000 });
  await expect
    .poll(async () => air.locator('.lower-third').evaluate((el) => getComputedStyle(el).opacity))
    .toBe('1');
  await expect(ctl.locator('.cue', { hasText: 'Anna' })).toHaveClass(/on-air/);
  const pgmFrame = ctl.frameLocator('#stage-pgm iframe');
  await expect(pgmFrame.locator('#f0')).toHaveText('Anna Andersson', { timeout: 6000 });

  // Taking Ben on the same graphic REPLACES the layer (same instance, new data).
  await ctl.locator('.cue', { hasText: 'Ben' }).click();
  await ctl.locator('#v-take').click();
  await expect(air.locator('#f0')).toHaveText('Ben Bergman', { timeout: 6000 });
  await expect(ctl.locator('.cue', { hasText: 'Ben' })).toHaveClass(/on-air/);

  // The dashboard's shared vocabulary reached the exported page too
  // (docs/PLAYOUT_DASHBOARD.md): every cue row states the LAYER its graphic airs on, and the
  // layer chips list the stack front to back.
  await expect(ctl.locator('.cue').first().locator('.sub')).toContainText(/^L\d+ · /);
  await expect(ctl.locator('.chip').first()).toContainText(/^L\d+/);

  // SPACE is Take here as well — and never while a field has focus, which is the guard that
  // matters: the cue's fields are on this same surface.
  //
  // The guard is checked by what the SPACE DID, not by what did not change: "the other cue is
  // still on air" passes on its first poll, before a broken guard's take could possibly have
  // landed, so it proves nothing (it passed with the guard deleted). A space that reaches the
  // input cannot race — a broken guard calls preventDefault and the character never arrives.
  await ctl.locator('.cue', { hasText: 'Anna' }).click();
  const field = ctl.locator('.field input').first();
  await field.click();
  await field.fill('Anna');
  await ctl.keyboard.press('Space');
  await ctl.keyboard.type('A');
  await expect(field).toHaveValue('Anna A');

  // Focus off the fields: now SPACE takes the selected cue.
  await ctl.locator('.verbs').click({ position: { x: 5, y: 5 } });
  await ctl.keyboard.press('Space');
  await expect(ctl.locator('.cue', { hasText: 'Anna' })).toHaveClass(/on-air/);

  // ■■ All out clears air.
  await ctl.locator('#v-allout').click();
  await expect
    .poll(async () => air.locator('.lower-third').evaluate((el) => getComputedStyle(el).opacity), { timeout: 6000 })
    .toBe('0');
  await expect(ctl.locator('#live-line')).toContainText('nothing on air');

  await ctl.close();
  await air.close();
});
