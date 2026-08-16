#!/usr/bin/env node
// WHAT THE PLATE INSTRUMENT SAYS ABOUT DESIGNS PEOPLE ALREADY SHIP - the calibration that decides
// whether it may become a gate (docs/NOACG_PRO_PLAN.md §17.2).
//
//   node scripts/plate-legibility-sweep.mjs              # every lower third, FREE
//   node scripts/plate-legibility-sweep.mjs --all        # every category the catalog carries
//
// THE QUESTION IT SETTLES. `measurePlateLegibility` reports text that sits on the picture with no
// surface of its own and cannot clear the contrast floor over a plate that might be anything. That
// is the right question for a Pro graphic whose language chose `panel: none` - but a hand-authored
// SUPER is a deliberate composition, and a catalog full of findings would prove the instrument
// unusable rather than the catalog broken. So it is measured on the catalog first, and the number
// that matters is how many designs a person chose fire it.
//
// Requires the dev server on this checkout's port. Free - no model call, no tokens.

import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { devPort } from './dev-port.mjs';

const args = process.argv.slice(2);
const ALL = args.includes('--all');
const OUT = path.resolve('benchmarks/pro/evidence/plate-legibility.json');
const BASE = `http://localhost:${devPort()}`;

try {
  await fetch(`${BASE}/app`, { signal: AbortSignal.timeout(4000) });
} catch {
  console.error(`Dev server not reachable at ${BASE} - start it first (npm run dev).`);
  process.exit(1);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on('pageerror', (error) => console.log('  pageerror:', error.message));
await page.goto(`${BASE}/app`, { waitUntil: 'domcontentloaded' });
await page.locator('.topbar').waitFor();
await page.locator('.wz-modal').waitFor({ state: 'visible', timeout: 20_000 }).catch(() => undefined);
await page.keyboard.press('Escape');
await page.locator('.wz-modal').waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => undefined);

const categories = await page.evaluate(async (all) => {
  const cat = await import('/src/templates/catalog.ts?t=' + Date.now());
  const ids = all ? Object.keys(cat.CATALOG) : ['lower-third'];
  return ids.map((id) => ({ id, variants: (cat.CATALOG[id] ?? []).map((v) => v.id) }));
}, ALL);

const rows = [];
for (const category of categories) {
  for (const variantId of category.variants) {
    const row = await page.evaluate(async ({ variantId: id, category: categoryId }) => {
      const bust = '?t=' + Date.now();
      const cat = await import('/src/templates/catalog.ts' + bust);
      const { composeDocument } = await import('/src/preview/composeDocument.ts' + bust);
      const { measurePlateLegibility } = await import('/src/validation/plateLegibility.ts' + bust);
      const variant = cat.variantById(id);
      if (!variant) return null;
      const template = variant.create({});
      document.getElementById('plate-frame')?.remove();
      const frame = document.createElement('iframe');
      frame.id = 'plate-frame';
      frame.style.cssText = 'position:fixed;left:0;top:0;width:1920px;height:1080px;border:0;'
        + 'z-index:99999;background:#333;color-scheme:dark;';
      document.body.appendChild(frame);
      frame.srcdoc = composeDocument(template);
      await new Promise((resolve) => { frame.onload = resolve; });
      const win = frame.contentWindow;
      try {
        win.play();
      } catch { /* a design that throws still paints something - measure that */ }
      await win.document.fonts.ready;
      await new Promise((resolve) => setTimeout(resolve, 700));
      const findings = measurePlateLegibility(win.document, win);
      frame.remove();
      return { id, category: categoryId, findings };
    }, { variantId, category: category.id });
    if (!row) continue;
    rows.push(row);
    if (row.findings.length) {
      console.log(`${row.id.padEnd(7)} ${row.findings.length} finding(s)`);
      for (const f of row.findings) {
        console.log(`        #${f.where} ${f.ink} - worst ${f.worst.ratio}:1 on ${f.worst.plate}`
          + ` (floor ${f.floor}, carrier ${f.carrier})`);
      }
    }
  }
}
await browser.close();

const flagged = rows.filter((r) => r.findings.length);
console.log(`\n${flagged.length} of ${rows.length} design(s) have text whose legibility DEPENDS ON`
  + ' THE SHOT - it clears the floor on at least one plate and misses it on another.');
console.log(flagged.length ? `  ${flagged.map((r) => r.id).join(', ')}` : '  none');
console.log('\nA design here is not a defect: a super over controlled footage is a real composition.');
console.log('What the number decides is whether this instrument can REPORT usefully, and whether');
console.log('anything may ever be gated on it.');

await writeFile(OUT, `${JSON.stringify({
  sweptAt: null,
  categories: categories.map((c) => c.id),
  designs: rows.length,
  flagged: flagged.map((r) => r.id),
  rows,
}, null, 2)}\n`);
console.log(`\nWritten: ${OUT}`);
