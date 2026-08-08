#!/usr/bin/env node
// FREE: take the graphic the machine probe generated, put it in the library, open its
// GENERATED control page (#/control/<id>) and drive it - the end-to-end half of Q2.
//
//   node scripts/pro-machine-drive.mjs [arm]        (arm: taught | plain, default taught)
//
// It reads the emitted code back off disk (pro-machine-out/<arm>.*) so it never re-generates,
// and screenshots the control page before and after pressing what an operator would press.
// The point is not that the page renders - it is WHICH controls exist on it.

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { devPort } from './dev-port.mjs';

const BASE = `http://localhost:${devPort()}`;
const OUT = path.resolve('pro-machine-out');
const arm = process.argv[2] ?? 'taught';

const report = JSON.parse(await readFile(path.join(OUT, 'report.json'), 'utf8'));
const summary = report.arms[arm];
if (!summary || summary.error) {
  console.error(`No usable "${arm}" arm in the report.`);
  process.exit(1);
}
const [html, css, js] = await Promise.all([
  readFile(path.join(OUT, `${arm}.index.html`), 'utf8'),
  readFile(path.join(OUT, `${arm}.template.css`), 'utf8'),
  readFile(path.join(OUT, `${arm}.template.js`), 'utf8'),
]);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
page.on('pageerror', (error) => console.log('  pageerror:', error.message));
await page.goto(`${BASE}/app`, { waitUntil: 'domcontentloaded' });
await page.locator('.topbar').waitFor();

const id = await page.evaluate(async (input) => {
  const bust = `?t=${Date.now()}`;
  const { createGraphic } = await import(`/src/model/library.ts${bust}`);
  const { commitDurableWrites } = await import(`/src/model/durableStore.ts${bust}`);
  const { parseDefinition } = await import(`/src/model/spxDefinition.ts${bust}`);
  // Rebuild the SpxTemplate from the three files the probe wrote. The fields and settings come
  // from the code's own SPXGCTemplateDefinition rather than from a hand-copied summary - the
  // definition IS the contract, so re-reading it is how the saved graphic stays honest.
  const parsed = parseDefinition(input.html);
  const template = {
    name: input.name,
    type: 'custom',
    html: input.html,
    css: input.css,
    js: input.js,
    fields: parsed?.fields ?? [],
    settings: parsed?.settings ?? {},
    assets: [],
    resolution: { width: 1920, height: 1080 },
    fps: 50,
  };
  const { doc } = createGraphic(template, { name: input.name });
  await commitDurableWrites();
  return doc.id;
}, { html, css, js, name: `Clock + scoreboard (${arm})` });

console.log(`Saved as ${id}. Opening #/control/${id} …`);
await page.goto(`${BASE}/app#/control/${id}`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);
await page.screenshot({ path: path.join(OUT, `control-${arm}.png`), fullPage: true });

// What the generated page actually offers an operator.
const surface = await page.evaluate(() => {
  const buttons = [...document.querySelectorAll('button')]
    .map((b) => (b.textContent ?? '').trim())
    .filter(Boolean);
  const inputs = [...document.querySelectorAll('input, textarea, select')]
    .map((el) => el.getAttribute('aria-label') || el.getAttribute('name') || el.id || el.getAttribute('placeholder') || '(unlabelled)');
  return { buttons, inputs, headings: [...document.querySelectorAll('h1,h2,h3')].map((h) => (h.textContent ?? '').trim()) };
});
console.log(`\nControl page for the generated clock+scoreboard:`);
console.log(`  headings: ${surface.headings.join(' | ')}`);
console.log(`  buttons : ${surface.buttons.join(' · ')}`);
console.log(`  inputs  : ${surface.inputs.join(', ')}`);

// The operator's data inputs live inside an ENTRY (docs/SAVED_CONTENT_MODEL.md §4), so a page
// with none shows only the verbs. Add one and look again - otherwise "no inputs" would be a
// statement about an empty rundown rather than about what the machine generated.
const addEntry = page.getByRole('button', { name: /Add entry/ });
if (await addEntry.count()) {
  await addEntry.first().click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(OUT, `control-${arm}-entry.png`), fullPage: true });
}
const withEntry = await page.evaluate(() => ({
  buttons: [...document.querySelectorAll('button')].map((b) => (b.textContent ?? '').trim()).filter(Boolean),
  inputs: [...document.querySelectorAll('input, textarea, select')]
    .map((el) => `${el.getAttribute('aria-label') || el.getAttribute('name') || el.id || el.getAttribute('placeholder') || '(unlabelled)'}:${el.tagName.toLowerCase()}`),
}));
console.log(`\nAfter adding an entry:`);
console.log(`  buttons: ${withEntry.buttons.join(' · ')}`);
console.log(`  inputs : ${withEntry.inputs.join(', ')}`);

// Drive it the way an operator would, and record what the graphic reports back.
await page.getByRole('button', { name: /^▶ Play/ }).first().click();
await page.waitForTimeout(2000);
await page.screenshot({ path: path.join(OUT, `control-${arm}-played.png`), fullPage: true });
const afterPlay = await page.evaluate(() => {
  const frame = document.querySelector('iframe');
  const win = frame?.contentWindow;
  try {
    return { machineState: win?.noacgMachineState ? win.noacgMachineState() : '(no noacgMachineState global)' };
  } catch (error) {
    return { machineState: `threw: ${String(error).slice(0, 120)}` };
  }
});
console.log(`  machine state after Play: ${JSON.stringify(afterPlay.machineState)}`);

await writeFile(path.join(OUT, `control-${arm}.json`), JSON.stringify({ id, ...surface, withEntry, ...afterPlay }, null, 2));
await browser.close();
