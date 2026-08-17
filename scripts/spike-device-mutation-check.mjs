#!/usr/bin/env node
// MUTATION-CHECK THE DEVICE-EXISTS INSTRUMENT (src/ai/spike/deviceCheck.ts) - FREE.
//
//   node scripts/spike-device-mutation-check.mjs
//
// The instrument's one job is to tell a plain box from a design whose two lines are carried
// by distinguishable geometry (docs/MODEL_VS_HARNESS_STUDY.md §6, level 2). Before any paid
// round trusts its readings, this proves both directions on fixtures whose right answer is
// known by construction - the same discipline `verify-guards-not-vacuously` names: an
// instrument that has never been shown a plain box scoring 0 has never been shown to work.
//
// THE TWO READINGS THAT MATTER MOST:
//   * `plain-box` MUST score 0 - it is the exact shape the instrument exists to name.
//   * `font-size-only` MUST score 0 - the study's explicit exclusion ("NOT font size alone").
//     An instrument that counts typography as a device would score 1 on every plain design.
//
// Requires the dev server on this checkout's port (the instrument is TypeScript served by
// Vite). From a worktree: `node scripts/bench-env.mjs --profile=pro`, then the bench server.

import { chromium } from 'playwright';
import { devPort } from './dev-port.mjs';

const BASE = `http://localhost:${devPort()}`;

const PAGE_CSS = `
  html,body{margin:0;background:#222;color-scheme:dark}
  .frame{position:relative;width:1920px;height:1080px}
  .line{font-family:Arial,sans-serif;color:#fff}
`;

/** Every fixture is a 1920x1080 frame holding two live lines with the house ids. The right
 *  answer is stated beside each one, with the channel(s) a correct instrument may name. */
const FIXTURES = [
  {
    id: 'plain-box',
    expect: false,
    html: `<div class="frame"><div style="position:absolute;left:119px;bottom:119px;background:#1a2233;padding:24px 32px">
      <div id="f0" class="line" style="font-size:44px">Maria Lindqvist</div>
      <div id="f1" class="line" style="font-size:44px">Chief Meteorologist</div>
    </div></div>`,
  },
  {
    id: 'font-size-only',
    expect: false,
    html: `<div class="frame"><div style="position:absolute;left:119px;bottom:119px;background:#1a2233;padding:24px 32px">
      <div id="f0" class="line" style="font-size:52px">Maria Lindqvist</div>
      <div id="f1" class="line" style="font-size:22px">Chief Meteorologist</div>
    </div></div>`,
  },
  {
    id: 'bare-lines',
    expect: false,
    html: `<div class="frame">
      <div id="f0" class="line" style="position:absolute;left:119px;bottom:180px;font-size:52px">Maria Lindqvist</div>
      <div id="f1" class="line" style="position:absolute;left:119px;bottom:130px;font-size:24px">Chief Meteorologist</div>
    </div>`,
  },
  {
    id: 'pill-kicker',
    expect: true,
    channels: ['fill', 'radius'],
    html: `<div class="frame"><div style="position:absolute;left:119px;bottom:119px">
      <div style="display:inline-block;background:#e8b23a;border-radius:999px;padding:6px 18px">
        <div id="f1" class="line" style="font-size:22px;color:#111">Chief Meteorologist</div>
      </div>
      <div style="background:#1a2233;padding:20px 32px;border-radius:6px">
        <div id="f0" class="line" style="font-size:48px">Maria Lindqvist</div>
      </div>
    </div></div>`,
  },
  {
    id: 'chip-inside-bar',
    expect: true,
    channels: ['shape'],
    html: `<div class="frame"><div style="position:absolute;left:119px;bottom:119px;background:#1a2233;padding:24px 32px">
      <div id="f0" class="line" style="font-size:48px">Maria Lindqvist</div>
      <div style="display:inline-block;background:#e8b23a;padding:4px 12px;margin-top:8px">
        <div id="f1" class="line" style="font-size:22px;color:#111">Chief Meteorologist</div>
      </div>
    </div></div>`,
  },
  {
    id: 'boxed-one-line',
    expect: true,
    channels: ['shape'],
    html: `<div class="frame">
      <div style="position:absolute;left:119px;bottom:170px;background:#1a2233;padding:16px 28px">
        <div id="f0" class="line" style="font-size:48px">Maria Lindqvist</div>
      </div>
      <div id="f1" class="line" style="position:absolute;left:119px;bottom:120px;font-size:24px">Chief Meteorologist</div>
    </div>`,
  },
  {
    id: 'axis-inset',
    expect: true,
    channels: ['axis'],
    html: `<div class="frame"><div style="position:absolute;left:119px;bottom:119px;background:#1a2233;padding:24px 32px;width:700px">
      <div id="f0" class="line" style="font-size:48px;text-align:left">Maria Lindqvist</div>
      <div id="f1" class="line" style="font-size:24px;margin-left:160px;display:inline-block">Chief</div>
    </div></div>`,
  },
  {
    id: 'overlap-lockup',
    expect: true,
    channels: ['axis'],
    html: `<div class="frame"><div style="position:absolute;left:119px;bottom:119px">
      <div style="background:#1a2233;padding:20px 32px">
        <div id="f0" class="line" style="font-size:48px">Maria Lindqvist</div>
      </div>
      <div id="f1" class="line" style="position:relative;top:-18px;left:24px;font-size:24px;background:#e8b23a;color:#111;display:inline-block;padding:2px 10px">Chief Meteorologist</div>
    </div></div>`,
  },
];

try {
  await fetch(`${BASE}/app`, { signal: AbortSignal.timeout(4000) });
} catch {
  console.error(`Dev server not reachable at ${BASE} - start it first.`);
  process.exit(1);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto(`${BASE}/app`, { waitUntil: 'domcontentloaded' });
await page.locator('.topbar').waitFor();

let failed = 0;
for (const fixture of FIXTURES) {
  const report = await page.evaluate(async ({ html, css }) => {
    const bust = '?t=' + Date.now();
    const { measureDevice } = await import('/src/ai/spike/deviceCheck.ts' + bust);
    const frame = document.createElement('iframe');
    frame.id = 'device-check-frame';
    frame.style.cssText = 'position:fixed;left:0;top:0;width:1920px;height:1080px;border:0;z-index:99999;color-scheme:dark;';
    document.body.appendChild(frame);
    frame.srcdoc = `<!doctype html><style>${css}</style>${html}`;
    await new Promise((resolve) => { frame.onload = resolve; });
    await new Promise((resolve) => setTimeout(resolve, 50));
    const report = measureDevice(frame.contentDocument);
    frame.remove();
    return report;
  }, { html: fixture.html, css: PAGE_CSS });

  const got = report.present;
  const gotChannels = report.channels.map((c) => c.channel);
  const presentOk = got === fixture.expect;
  // When the fixture names channels, at least one of them must be among the reasons - an
  // instrument saying "device" for the WRONG reason is a coincidence, not a measurement.
  const channelOk = !fixture.channels || fixture.channels.some((c) => gotChannels.includes(c));
  const ok = presentOk && channelOk;
  if (!ok) failed += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${fixture.id}: expected ${fixture.expect ? 'device' : 'plain'}`
    + `${fixture.channels ? ` via ${fixture.channels.join('|')}` : ''}`
    + ` -> ${got ? `device [${gotChannels.join(', ')}]` : 'plain'}`);
  if (!ok) {
    console.log(`      carriers: ${JSON.stringify(report.carriers)} · radius ${JSON.stringify(report.radius)}`
      + ` · axisOffset ${report.axisOffset} · overlap ${report.overlapPx}px · notes [${report.notes.join('; ')}]`);
  }
}

await browser.close();
console.log(failed ? `\n${failed} fixture(s) FAILED - do not trust the instrument yet.`
  : '\nAll fixtures agree with construction. The instrument may be trusted for REPORTING (it still never gates).');
process.exit(failed ? 1 : 0);
