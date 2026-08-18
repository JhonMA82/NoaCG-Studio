#!/usr/bin/env node
// RECAPTURE a stepper cell's per-step frames, pressing next() WITHOUT trusting its return
// value. The iterate runner's step capture stopped on `next()` returning undefined - the SPX
// idiom for "no more steps" - but the control-drive proof showed two quiz cells ADVANCING the
// frame while returning nothing (a hand-written next() that does its work and returns no
// timeline). The runner's finding stands as recorded; this backfills the FRAMES so the blind
// read can see the reveal walk it would otherwise judge from the hold alone.
//
//   node scripts/typesweep-stepframes-spike.mjs --out=pro-iterate-out-<model> --bank=benchmarks/pro/v1/custom/briefs.json
//
// FREE - no model call. Patches each recaptured record's `stepFrames` in results.json.
// Named *-spike so the browser-job guard and detector both count it (command-match.mjs).

import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { devPort } from './dev-port.mjs';

const BASE = `http://localhost:${devPort()}`;
const args = process.argv.slice(2);
const value = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
const OUT = path.resolve(value('out') ?? 'pro-iterate-out');
const BANK = path.resolve(value('bank') ?? 'benchmarks/pro/v1/custom/briefs.json');

const ledgerPath = path.join(OUT, 'results.json');
const ledger = JSON.parse(await readFile(ledgerPath, 'utf8'));
const bank = JSON.parse(await readFile(BANK, 'utf8'));
const briefById = new Map(bank.briefs.map((b) => [b.id, b]));

const cells = (ledger.results ?? []).filter((r) => {
  if (r.kind !== 'candidate' || r.error || r.skipped) return false;
  const entry = briefById.get(r.slug.split('.')[0]);
  const steps = Math.min(entry?.brief?.steps?.length ?? 0, 6);
  return steps > 0 && (r.stepFrames?.length ?? 0) < steps;
});
if (!cells.length) {
  console.log('Every stepper cell already carries its full step frames - nothing to do.');
  process.exit(0);
}
console.log(`${cells.length} stepper cell(s) missing frames.`);

async function finalTemplate(slug) {
  const dir = path.join(OUT, 'code', slug);
  const rounds = (await readdir(dir)).filter((d) => d.startsWith('round-'))
    .sort((a, b) => Number(a.slice(6)) - Number(b.slice(6)));
  return JSON.parse(await readFile(path.join(dir, rounds[rounds.length - 1], 'template.json'), 'utf8'));
}

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
await page.locator('.wz-modal').waitFor({ state: 'visible', timeout: 20_000 }).catch(() => undefined);
await page.keyboard.press('Escape');
await page.locator('.wz-modal').waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => undefined);

for (const cell of cells) {
  const entry = briefById.get(cell.slug.split('.')[0]);
  const steps = Math.min(entry.brief.steps.length, 6);
  const template = await finalTemplate(cell.slug);
  const values = Object.fromEntries((entry.brief.fields ?? []).map((f) => [f.id, f.sample]));
  if (cell.fill?.slotFieldId && cell.fill.path) values[cell.fill.slotFieldId] = cell.fill.path;
  await page.evaluate(async ({ template, values }) => {
    const bust = '?t=' + Date.now();
    const { composeDocument } = await import('/src/preview/composeDocument.ts' + bust);
    document.getElementById('stepframe-frame')?.remove();
    const frame = document.createElement('iframe');
    frame.id = 'stepframe-frame';
    frame.style.cssText = 'position:fixed;left:0;top:0;width:1920px;height:1080px;border:0;'
      + 'z-index:99999;background:#333;color-scheme:dark;';
    document.body.appendChild(frame);
    frame.srcdoc = composeDocument(template);
    await new Promise((resolve) => { frame.onload = resolve; });
    await new Promise((resolve) => setTimeout(resolve, 300));
    const win = frame.contentWindow;
    try {
      win.update(JSON.stringify(values));
      win.play();
    } catch { /* the round already recorded the throw */ }
    await win.document.fonts.ready;
    await new Promise((resolve) => setTimeout(resolve, 1800));
  }, { template, values });
  const frames = [];
  for (let k = 1; k <= steps; k += 1) {
    const pressed = await page.evaluate(() => {
      const win = document.getElementById('stepframe-frame')?.contentWindow;
      if (!win || typeof win.next !== 'function') return false;
      try { win.next(); return true; } catch { return false; }
    });
    if (!pressed) break;
    await page.waitForTimeout(1400);
    const file = `${cell.slug}.step-${k}.png`;
    await page.frameLocator('#stepframe-frame').locator('body').screenshot({ path: path.join(OUT, file) });
    frames.push(file);
  }
  await page.evaluate(() => document.getElementById('stepframe-frame')?.remove());
  const record = ledger.results.find((r) => r.slug === cell.slug);
  record.stepFrames = frames;
  console.log(`${cell.slug}: ${frames.length} of ${steps} step frame(s) recaptured`);
}

await browser.close();
await writeFile(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);
console.log('Ledger patched.');
