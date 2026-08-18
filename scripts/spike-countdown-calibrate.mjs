#!/usr/bin/env node
// CALIBRATE the COUNTDOWN spacing thresholds against the shipped countdown/timer catalog.
//
//   node scripts/spike-countdown-calibrate.mjs        # sweep game-timer + starting-soon, FREE
//
// The countdown instrument overrides in src/ai/pro/language/graphics.ts (PRO_GRAPHICS.countdown)
// were calibrated on the four gameTimers designs alone (gt05's 0.26 top padding set the 0.24
// floor). The 2026-08-19 blind read then AIRED both frames that overrode number stopped
// (padding-tight 0.11-0.23, lines-adrift 1.55-1.92 against the inherited 1.4 ceiling) - two
// false stops, zero true ones. The spike-spacing-calibrate discipline says the fix is a wider
// measurement, not a chosen number: the catalog's countdown FAMILY is game timers AND the
// starting-soon holding screens (both `subtype: 'countdown'` clock-bearing types), so this
// sweep reads the distribution off all of them and prints where the floors sit.
//
// The catalog is ground truth for PASSING, not for failing - same rule as the lower-third
// calibration. Requires the dev server on this checkout's port (node scripts/dev-port.mjs).

import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { devPort } from './dev-port.mjs';

const BASE = `http://localhost:${devPort()}`;
const OUT = path.resolve('benchmarks/pro/v1/spike/countdown-calibration.json');

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

const targets = await page.evaluate(async () => {
  const bust = '?t=' + Date.now();
  const cat = await import('/src/templates/catalog.ts' + bust);
  return ['game-timer', 'starting-soon']
    .flatMap((category) => cat.variantsFor(category).map((v) => ({ category, id: v.id })));
});
console.log(`Sweeping ${targets.length} shipped countdown/timer designs…`);

const rows = [];
for (const { category, id } of targets) {
  const report = await page.evaluate(async ({ variantId }) => {
    const bust = '?t=' + Date.now();
    const cat = await import('/src/templates/catalog.ts' + bust);
    const { composeDocument } = await import('/src/preview/composeDocument.ts' + bust);
    const { measureSpacing } = await import('/src/ai/spike/spacingCheck.ts' + bust);
    const { PRO_GRAPHICS } = await import('/src/ai/pro/language/graphics.ts' + bust);

    const variant = cat.variantById(variantId);
    if (!variant) return { error: 'gone' };
    // The design's own defaults: the calibration subject is the shipped design as shipped.
    const template = variant.create({});

    document.getElementById('countdown-cal-frame')?.remove();
    const frame = document.createElement('iframe');
    frame.id = 'countdown-cal-frame';
    frame.style.cssText = 'position:fixed;left:0;top:0;width:1920px;height:1080px;border:0;'
      + 'z-index:99999;background:#333;color-scheme:dark;';
    document.body.appendChild(frame);
    frame.srcdoc = composeDocument(template);
    await new Promise((resolve) => { frame.onload = resolve; });
    await new Promise((resolve) => setTimeout(resolve, 200));
    const win = frame.contentWindow;
    try {
      win.play();
    } catch { /* a broken lifecycle still paints something - measure what is there */ }
    await win.document.fonts.ready;
    await new Promise((resolve) => setTimeout(resolve, 1800));
    // Measured under the COUNTDOWN overrides, so the printed findings are the ones the
    // iterate loop would feed - the raw ratios beside them are what the floors are read from.
    const out = measureSpacing(frame.contentDocument, PRO_GRAPHICS.countdown.instruments.spacing ?? {});
    frame.remove();
    return out;
  }, { variantId: id });
  if (report.error) continue;
  rows.push({ category, id, ...report });
  const codes = report.findings.map((f) => f.code).join(',');
  console.log(`${id.padEnd(6)} pad ${report.padding
    ? `${report.padding.top}/${report.padding.right}/${report.padding.bottom}/${report.padding.left}`
    : '-'}`.padEnd(34)
    + ` gaps [${report.lineGaps.join(', ')}]`.padEnd(30)
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

console.log(`\n${flagged.length}/${rows.length} shipped countdown designs flagged - ${JSON.stringify(byCode)}`);
console.log('padding ratios  min', pct(pads, 0), ' p05', pct(pads, 0.05), ' p25', pct(pads, 0.25), ' p50', pct(pads, 0.5), ' p95', pct(pads, 0.95));
console.log('line-gap ratios min', pct(gaps, 0), ' p05', pct(gaps, 0.05), ' p50', pct(gaps, 0.5), ' p95', pct(gaps, 0.95), ' max', pct(gaps, 1));
console.log('\nA threshold flagging many SHIPPED designs is measuring the wrong thing.');
console.log('Read the percentiles, set the floor under the catalog, then re-run.');

await writeFile(OUT, `${JSON.stringify({
  sweptAt: null,
  designs: rows.length,
  flagged: flagged.map((r) => ({ id: r.id, codes: r.findings.map((f) => f.code) })),
  byCode,
  percentiles: {
    padding: { min: pct(pads, 0), p05: pct(pads, 0.05), p25: pct(pads, 0.25), p50: pct(pads, 0.5), p95: pct(pads, 0.95) },
    lineGap: { min: pct(gaps, 0), p05: pct(gaps, 0.05), p50: pct(gaps, 0.5), p95: pct(gaps, 0.95), max: pct(gaps, 1) },
  },
  rows,
}, null, 2)}\n`);
console.log(`\nWritten: ${OUT}`);
