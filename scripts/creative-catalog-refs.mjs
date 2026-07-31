// Catalog HOLD references for the Creative Mode pilot's similarity criterion
// (docs/CREATIVE_MODE_PLAN.md §11.6): capture every catalog design of the given categories on
// the same synthetic stage the pilot bench uses, so `bench:sameness` can measure how close a
// CREATE result sits to the nearest real catalog design.
//
//   node scripts/creative-catalog-refs.mjs [--categories=lower-third,versus,results-board] \
//     [--out=dir] [--per-category=N]
//
// FREE - no model calls, no tokens. It needs the dev server on this checkout's port, because
// it imports the catalog and the preview composer from source.
//
// Criterion 6 is CALIBRATED, not absolute: the same run also reports every catalog design's
// distance to its own nearest catalog NEIGHBOUR, and the median of those is the line under
// which a "creation" is called a copy. Without that calibration a raw distance number means
// nothing - the whole catalog is dark graphics on a dark stage.

import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { devPort } from './dev-port.mjs';

const ARGS = process.argv.slice(2);
const flag = (name) => ARGS.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');

const BASE = `http://localhost:${devPort()}`;
const OUT = path.resolve(flag('out') || './creative-pilot-out/catalog-refs');
const CATEGORIES = (flag('categories') || 'lower-third,versus,results-board').split(',').map((c) => c.trim()).filter(Boolean);
const PER_CATEGORY = Number(flag('per-category') || '0');

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const page = await context.newPage();
await page.exposeFunction('__refShot', async () => (await page.screenshot()).toString('base64'));
await page.goto(`${BASE}/app`, { waitUntil: 'domcontentloaded' });

const ids = await page.evaluate(async ({ categories, perCategory }) => {
  const { variantsFor } = await import('/src/templates/catalog.ts');
  return categories.flatMap((category) => {
    const list = variantsFor(category);
    return (perCategory ? list.slice(0, perCategory) : list).map((v) => ({ id: v.id, category }));
  });
}, { categories: CATEGORIES, perCategory: PER_CATEGORY });

console.log(`Capturing ${ids.length} catalog design(s) from ${CATEGORIES.join(', ')} …`);

const rows = [];
for (const entry of ids) {
  try {
    const shot = await page.evaluate(async (variantId) => {
      const { variantById } = await import('/src/templates/catalog.ts');
      const { composeDocument } = await import('/src/preview/composeDocument.ts');
      const { parseAnimData } = await import('/src/blocks/animData.ts');
      const variant = variantById(variantId);
      if (!variant) return null;
      const template = variant.create();
      document.body.innerHTML = '';
      document.body.style.cssText =
        'margin:0;width:1920px;height:1080px;overflow:hidden;' +
        'background:radial-gradient(circle at 35% 20%,#334155,#111827 58%,#05070a)';
      const frame = document.createElement('iframe');
      frame.style.cssText = 'position:absolute;inset:0;width:1920px;height:1080px;border:0;background:transparent';
      await new Promise((resolve) => {
        frame.onload = resolve;
        frame.srcdoc = composeDocument(template);
        document.body.appendChild(frame);
      });
      try {
        frame.contentWindow?.update?.(JSON.stringify(Object.fromEntries(template.fields.map((f) => [f.field, f.value ?? '']))));
        frame.contentWindow?.play?.();
      } catch { /* a design that throws is the catalog sweep's problem, not this rig's */ }
      const anim = parseAnimData(template.js);
      const entranceMs = anim ? (anim.steps[0].duration / anim.speed) * 1000 : 2000;
      await new Promise((r) => setTimeout(r, entranceMs + 400));
      return window.__refShot();
    }, entry.id);
    if (!shot) continue;
    const file = `${entry.category}-${entry.id}-hold.png`;
    writeFileSync(path.join(OUT, file), Buffer.from(shot, 'base64'));
    rows.push({ fixtureId: entry.id, phaseFiles: { hold: file } });
    process.stdout.write('.');
  } catch (e) {
    console.log(`\n  ${entry.id}: ${String(e?.message ?? e).split('\n')[0]}`);
  }
}

await browser.close();

// Written in the sameness rig's own shape, so the calibration half is one command:
//   npm run bench:sameness -- <this dir>
// which reports each catalog design's distance to its nearest catalog neighbour. The MEDIAN
// of those is criterion 6's copy line.
writeFileSync(
  path.join(OUT, 'catalog-refs-metrics.json'),
  JSON.stringify({ candidate: 'catalog-refs', rows }, null, 2),
);
console.log(`\n${rows.length} reference frame(s) written to ${OUT}.`);
console.log('Calibrate the copy line with:  npm run bench:sameness -- ' + OUT);
console.log('Then measure a pilot run with: npm run bench:sameness -- <pilot out> --house=' + OUT);
