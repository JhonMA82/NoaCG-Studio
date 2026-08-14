#!/usr/bin/env node
// CALIBRATE the SPACING instrument against the hand-authored catalog, and score it against the
// owner's own blind-read words (docs/DESIGN_PRINCIPLES.md §4 and §9).
//
//   node scripts/spike-spacing-calibrate.mjs        # sweep every catalog lower third, FREE
//
// The instrument (src/ai/spike/spacingCheck.ts) reports padding and gaps as ratios of the
// primary type size. Every ratio in it is a threshold someone could have invented, which is
// exactly what this repo refuses (the supportingLineChars rule: replace an adjective with a
// measurement). So the thresholds are read off the CATALOG - 90 hand-authored, shipped lower
// thirds are the house's own definition of correctly spaced - and then checked against the
// items the owner called cramped or over-spaced by eye.
//
// The catalog is ground truth for PASSING, not for failing: a threshold that flags a lot of
// shipped designs is measuring the wrong thing, and one that flags none may simply be loose.
// So the sweep prints the distribution as well as the verdict, and the numbers it prints are
// committed beside the axis fixture so each threshold carries its own evidence.
//
// Requires the dev server on this checkout's port (node scripts/dev-port.mjs).

import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { devPort } from './dev-port.mjs';

const BASE = `http://localhost:${devPort()}`;
const OUT = path.resolve('benchmarks/pro/v1/spike/spacing-calibration.json');

try {
  await fetch(`${BASE}/app`, { signal: AbortSignal.timeout(4000) });
} catch {
  console.error(`Dev server not reachable at ${BASE} - start it first.`);
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

const ids = await page.evaluate(async () => {
  const bust = '?t=' + Date.now();
  const cat = await import('/src/templates/catalog.ts' + bust);
  return cat.variantsFor('lower-third').map((v) => v.id);
});
console.log(`Sweeping ${ids.length} catalog lower thirds…`);

const rows = [];
for (const id of ids) {
  const report = await page.evaluate(async ({ variantId }) => {
    const bust = '?t=' + Date.now();
    const cat = await import('/src/templates/catalog.ts' + bust);
    const { composeDocument } = await import('/src/preview/composeDocument.ts' + bust);
    const { measureSpacing } = await import('/src/ai/spike/spacingCheck.ts' + bust);

    const variant = cat.variantById(variantId);
    if (!variant) return { error: 'gone' };
    const template = variant.create({
      lines: [
        { title: 'Name', sample: 'Alexandra Riva' },
        { title: 'Role', sample: 'Chief Political Correspondent' },
      ],
    });

    document.getElementById('spacing-cal-frame')?.remove();
    const frame = document.createElement('iframe');
    frame.id = 'spacing-cal-frame';
    frame.style.cssText = 'position:fixed;left:0;top:0;width:1920px;height:1080px;border:0;'
      + 'z-index:99999;background:#333;color-scheme:dark;';
    document.body.appendChild(frame);
    frame.srcdoc = composeDocument(template);
    await new Promise((resolve) => { frame.onload = resolve; });
    await new Promise((resolve) => setTimeout(resolve, 200));
    const win = frame.contentWindow;
    try {
      win.update(JSON.stringify({ f0: 'Alexandra Riva', f1: 'Chief Political Correspondent' }));
      win.play();
    } catch { /* a broken lifecycle still paints something - measure what is there */ }
    await win.document.fonts.ready;
    await new Promise((resolve) => setTimeout(resolve, 1800));
    const out = measureSpacing(frame.contentDocument);
    frame.remove();
    return out;
  }, { variantId: id });
  if (report.error) continue;
  rows.push({ id, ...report });
  const codes = report.findings.map((f) => f.code).join(',');
  console.log(`${id.padEnd(6)} pad ${report.padding
    ? `${report.padding.top}/${report.padding.right}/${report.padding.bottom}/${report.padding.left}`
    : '-'}`.padEnd(34)
    + ` gaps [${report.lineGaps.join(', ')}]`.padEnd(26)
    + (codes ? `  ${codes}` : '  clean'));
}
await browser.close();

// ── The distribution the thresholds are read from ────────────────────────────────────────
const pads = rows.filter((r) => r.padding).flatMap((r) => Object.values(r.padding));
const gaps = rows.flatMap((r) => r.lineGaps);
const pct = (arr, p) => {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  return Math.round(s[Math.floor((s.length - 1) * p)] * 100) / 100;
};
const flagged = rows.filter((r) => r.findings.length);
const byCode = {};
for (const r of rows) for (const f of r.findings) byCode[f.code] = (byCode[f.code] ?? 0) + 1;

console.log(`\n${flagged.length}/${rows.length} catalog designs flagged - ${JSON.stringify(byCode)}`);
console.log('padding ratios  p05', pct(pads, 0.05), ' p25', pct(pads, 0.25), ' p50', pct(pads, 0.5), ' p95', pct(pads, 0.95));
console.log('line-gap ratios p05', pct(gaps, 0.05), ' p50', pct(gaps, 0.5), ' p95', pct(gaps, 0.95));
console.log('\nA threshold flagging many SHIPPED designs is measuring the wrong thing.');
console.log('Read the percentiles, set the floor under the catalog, then re-run.');

await writeFile(OUT, `${JSON.stringify({
  sweptAt: null,
  designs: rows.length,
  flagged: flagged.map((r) => ({ id: r.id, codes: r.findings.map((f) => f.code) })),
  byCode,
  percentiles: {
    padding: { p05: pct(pads, 0.05), p25: pct(pads, 0.25), p50: pct(pads, 0.5), p95: pct(pads, 0.95) },
    lineGap: { p05: pct(gaps, 0.05), p50: pct(gaps, 0.5), p95: pct(gaps, 0.95) },
  },
  rows,
}, null, 2)}\n`);
console.log(`\nWritten: ${OUT}`);
