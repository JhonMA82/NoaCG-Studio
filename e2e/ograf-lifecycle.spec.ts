// covers: src/export/targets/ograf.ts
//
// AN OGRAF GRAPHIC RUNS ITS TEMPLATE'S LIFECYCLE AS A PAGE DOES. Under SPX and CasparCG the
// template IS a page: its DOM-ready code waits for DOMContentLoaded, which fires once its whole
// script has run, and its timers end with the page. Inside an OGraf renderer the same code runs
// as a component of a page that loaded long ago and outlives it, so graphic.mjs gives the
// template both halves back: its DOM-ready code runs after its whole script (#964), and dispose()
// stops the timers its code started (#989).
//
// Every package is built by the real OGraf target from a template the real generators made, and
// mounted the way a renderer mounts it: import graphic.mjs, define the element, append it, load().
// The renderer page runs on Playwright's paused clock, so time moves only when a case moves it.

import { test, expect, type Page } from '@playwright/test';
import { installGraphicBody } from './_graphicBody';
import { graphicTemplate, ografFiles, type GraphicSource } from './_ografBuild';

const ORIGIN = 'http://ograf-lifecycle.local';
const START = new Date('2026-10-11T12:00:00Z');
const PAUSED_AT = new Date('2026-10-11T12:00:30Z');

type Result = { statusCode: number; statusMessage?: string };
type Driver = HTMLElement & Record<'load' | 'playAction' | 'dispose', (p: unknown) => Promise<Result>>;

/** Build each source's package in the app, then open a bare renderer page serving each under `/<key>/`. */
async function openRenderer(page: Page, sources: Record<string, GraphicSource>) {
  await page.goto('/app');
  const packages = new Map<string, Map<string, Buffer>>();
  for (const [key, source] of Object.entries(sources)) {
    const files = await ografFiles(page, await graphicTemplate(page, source));
    if (typeof files !== 'object') throw new Error(`${key} did not build: ${files}`);
    packages.set(key, files);
  }
  await page.route(`${ORIGIN}/**`, (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\//, '');
    if (path === '') return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html><head><meta charset="utf-8"><title>Renderer</title></head><body></body></html>' });
    const [key, ...rest] = path.split('/');
    const body = packages.get(key)?.get(rest.join('/'));
    if (body == null) return route.fulfill({ status: 404, body: 'not found' });
    return route.fulfill({ status: 200, contentType: /\.m?js$/.test(path) ? 'application/javascript' : 'application/octet-stream', body });
  });
  await installGraphicBody(page);
  await page.clock.install({ time: START });
  await page.goto(`${ORIGIN}/`);
  await page.clock.pauseAt(PAUSED_AT);
}

/** Mount one package and call `action` on it; `load` mounts it first. Answers the ReturnPayload. */
async function act(page: Page, key: string, action: 'load' | 'playAction' | 'dispose'): Promise<Result> {
  return page.evaluate(async ({ origin, key, action }) => {
    let el = document.querySelector(`[data-key="${key}"]`) as Driver | null;
    if (!el) {
      const mod = await import(`${origin}/${key}/graphic.mjs`);
      customElements.define(`lifecycle-${key}`, mod.default);
      el = document.createElement(`lifecycle-${key}`) as Driver;
      el.dataset.key = key;
      document.body.appendChild(el);
    }
    const params = action === 'load' ? { data: {}, renderType: 'realtime', renderCharacteristics: {} } : {};
    const { statusCode, statusMessage } = await el[action](params);
    return { statusCode, statusMessage };
  }, { origin: ORIGIN, key, action });
}

/**
 * The DOM-ready pattern every generated runtime uses, with a variable assigned BELOW it, where
 * sb21's animation region sets its machine. On a page the DOM-ready code sees the variable set.
 */
const READY_PROBE_JS = `
function readyProbe() {
  var probe = document.getElementById('ready-probe');
  probe.setAttribute('data-runs', String(Number(probe.getAttribute('data-runs') || 0) + 1));
  probe.setAttribute('data-later', String(readyProbeLater));
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', readyProbe);
} else {
  readyProbe();
}
var readyProbeLater = 'set';`;

test("a template's DOM-ready code runs once its whole script has, as on a page (#964)", async ({ page }) => {
  await openRenderer(page, {
    probe: { kind: 'probe', name: 'Ready Probe', html: '<div id="ready-probe"></div>', css: '', js: READY_PROBE_JS },
    sb21: { kind: 'design', id: 'sb21' },
    sb22: { kind: 'design', id: 'sb22' },
  });
  expect(await act(page, 'probe', 'load')).toEqual({ statusCode: 200 });
  const probe = await page.evaluate(() => {
    const el = graphicBody(document.querySelector('[data-key="probe"]')!).querySelector('#ready-probe')!;
    return { runs: el.getAttribute('data-runs'), later: el.getAttribute('data-later') };
  });
  expect.soft(probe, 'the DOM-ready code ran before the rest of the script, or not exactly once').toEqual({ runs: '1', later: 'set' });
  // The designs the issue reported: their DOM-ready repaint reads the machine their animation region sets.
  for (const key of ['sb21', 'sb22']) {
    expect(await act(page, key, 'load'), `${key} did not load`).toEqual({ statusCode: 200 });
    expect(await act(page, key, 'playAction'), `${key} did not play`).toMatchObject({ statusCode: 200 });
  }
});

/**
 * One timer of each kind, each counting into the probe for as long as it runs: two by bare call,
 * as the generated runtimes write them, and the frames through `window` under a binding of the
 * template's own named like the timer, as hand-written code may (it must neither stop the package
 * from parsing nor escape dispose()).
 */
const TIMER_PROBE_JS = `
function timerProbe(kind) {
  var probe = document.getElementById('timer-probe');
  probe.setAttribute('data-' + kind, String(Number(probe.getAttribute('data-' + kind) || 0) + 1));
}
setInterval(function () { timerProbe('interval'); }, 100);
(function again() { timerProbe('timeout'); setTimeout(again, 100); })();
const requestAnimationFrame = window.requestAnimationFrame;
(function frame() { timerProbe('frame'); requestAnimationFrame(frame); })();`;

test('dispose() stops the timers the template started, so a countdown stops counting (#989)', async ({ page }) => {
  await openRenderer(page, {
    gt09: { kind: 'design', id: 'gt09' },
    probe: { kind: 'probe', name: 'Timer Probe', html: '<div id="timer-probe"></div>', css: '', js: TIMER_PROBE_JS },
  });
  for (const key of ['gt09', 'probe']) {
    expect(await act(page, key, 'load'), `${key} did not load`).toEqual({ statusCode: 200 });
    expect(await act(page, key, 'playAction'), `${key} did not play`).toMatchObject({ statusCode: 200 });
  }
  // What each one's timers write, read off its canvas, which stays readable once it is off the page.
  const canvases = await page.evaluateHandle(() => {
    const canvas = (key: string) => graphicBody(document.querySelector(`[data-key="${key}"]`)!);
    return { gt09: canvas('gt09'), probe: canvas('probe') };
  });
  const counts = () => canvases.evaluate(({ gt09, probe }) => {
    const p = probe.querySelector('#timer-probe')!;
    return {
      clock: gt09.querySelector('.game-timer-clock')!.textContent,
      interval: p.getAttribute('data-interval'),
      timeout: p.getAttribute('data-timeout'),
      frame: p.getAttribute('data-frame'),
    };
  });
  const started = await counts();
  await page.clock.runFor(1_500);
  const running = await counts();
  for (const key of ['clock', 'interval', 'timeout', 'frame'] as const) {
    expect(running[key], `the ${key} was not running before dispose() - nothing was proven`).not.toBe(started[key]);
  }
  for (const key of ['gt09', 'probe']) expect(await act(page, key, 'dispose')).toEqual({ statusCode: 200 });
  const disposed = await counts();
  await page.clock.runFor(1_500);
  expect(await counts(), "a timer the template started still runs after dispose()").toEqual(disposed);
});
