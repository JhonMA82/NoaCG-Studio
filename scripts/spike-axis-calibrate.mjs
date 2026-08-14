#!/usr/bin/env node
// CALIBRATE the alignment-axis instrument against the hand-authored catalog
// (docs/PRO_PHASE1_HANDOFF.md §4, the supportingLineChars rule: replace an adjective with a
// measurement).
//
//   node scripts/spike-axis-calibrate.mjs            # sweep every catalog lower third, FREE
//
// The instrument (src/ai/spike/axisCheck.ts) flags NEAR-MISS axes - two edge clusters a few
// pixels apart but not equal. "A few pixels" is the whole question: too tight misses the
// defect the owner flagged by eye (a 13px name/kicker offset), too loose flags deliberate
// composition. The catalog's lower thirds are the ground truth for DELIBERATE - they are
// hand-authored and shipped - so this sweep renders each one settled, measures it with a wide
// net, and reports how many designs each candidate tolerance would flag. The tolerance that
// stays near zero on the catalog while still reaching the defect's magnitude is the one
// axisCheck.ts pins, and the sweep's output is committed beside the decoding fixture
// (benchmarks/pro/v1/spike/axis-calibration.json) so the number carries its own evidence.
//
// Requires the dev server on this checkout's port (node scripts/dev-port.mjs).

import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { devPort } from './dev-port.mjs';

const BASE = `http://localhost:${devPort()}`;
const OUT = path.resolve('benchmarks/pro/v1/spike/axis-calibration.json');
/** The wide-net ceiling the sweep measures under; candidate tolerances are read below it. */
const SWEEP_PX = 40;
const CANDIDATES = [4, 6, 8, 10, 12, 16, 20, 28];

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
console.log(`Sweeping ${ids.length} catalog lower thirds at a ${SWEEP_PX}px net…`);

const perDesign = [];
for (const id of ids) {
  const report = await page.evaluate(async ({ variantId, sweepPx }) => {
    const bust = '?t=' + Date.now();
    const cat = await import('/src/templates/catalog.ts' + bust);
    const { composeDocument } = await import('/src/preview/composeDocument.ts' + bust);
    const { measureAxes } = await import('/src/ai/spike/axisCheck.ts' + bust);

    const variant = cat.variantById(variantId);
    if (!variant) return { error: 'gone' };
    const template = variant.create({
      lines: [
        { title: 'Name', sample: 'Alexandra Riva' },
        { title: 'Role', sample: 'Chief Political Correspondent' },
      ],
    });

    document.getElementById('axis-cal-frame')?.remove();
    const frame = document.createElement('iframe');
    frame.id = 'axis-cal-frame';
    frame.style.cssText = 'position:fixed;left:0;top:0;width:1920px;height:1080px;border:0;'
      + 'z-index:99999;background:#333;color-scheme:dark;';
    document.body.appendChild(frame);
    frame.srcdoc = composeDocument(template);
    await new Promise((resolve) => { frame.onload = resolve; });
    await new Promise((resolve) => setTimeout(resolve, 200));
    const win = frame.contentWindow;
    win.update(JSON.stringify({ f0: 'Alexandra Riva', f1: 'Chief Political Correspondent' }));
    win.play();
    await win.document.fonts.ready;
    // The SETTLED hold: entrances in the preset bank finish well inside this.
    await new Promise((resolve) => setTimeout(resolve, 1800));
    const doc = frame.contentDocument;
    // Two reads: the COMMITTED defaults (what a round reports - the base rate that matters),
    // and a wide net (the distribution the defaults were picked from, kept as evidence).
    const defaults = measureAxes(doc);
    const wide = measureAxes(doc, { nearMissPx: sweepPx, textMinPx: 0, textMaxPx: sweepPx });
    frame.remove();
    const compact = (n) => ({
      side: n.side, gapPx: n.gapPx, textPair: n.textPair, relationship: n.relationship,
      a: n.a.el, b: n.b.el,
    });
    return {
      elements: defaults.elements,
      flagged: defaults.nearMisses.map(compact),
      skewStraddles: defaults.skewStraddles,
      wide: wide.nearMisses.map(compact),
    };
  }, { variantId: id, sweepPx: SWEEP_PX });
  if (report.error) {
    console.log(`  ${id}: ${report.error}`);
    continue;
  }
  perDesign.push({ id, ...report });
  console.log(`  ${id.padEnd(6)} elements ${String(report.elements).padStart(3)}`
    + ` · FLAGGED by defaults: ${report.flagged.length}`
    + ` · wide-net pairs<=${SWEEP_PX}px: ${report.wide.length}`
    + `${report.skewStraddles.length ? ` · ${report.skewStraddles.length} skew straddle(s)` : ''}`);
  for (const f of report.flagged) {
    console.log(`      ${f.side} ${f.gapPx}px ${f.textPair ? 'text' : 'non-text'} ${f.relationship}: ${f.a} vs ${f.b}`);
  }
}
await browser.close();

// ── The evidence tables ──────────────────────────────────────────────────────────────────
const flaggedDesigns = perDesign.filter((d) => d.flagged.length);
console.log(`\nDefaults flag ${flaggedDesigns.length} of ${perDesign.length} hand-authored designs`
  + ` (${perDesign.reduce((s, d) => s + d.flagged.length, 0)} pairs) - this is the base rate a`
  + ' round\'s reviewer reads flags against.');

const table = CANDIDATES.map((px) => {
  let designsText = 0;
  let designsOther = 0;
  for (const d of perDesign) {
    if (d.wide.some((n) => n.textPair && n.gapPx <= px)) designsText += 1;
    if (d.wide.some((n) => !n.textPair && n.gapPx <= px)) designsOther += 1;
  }
  return { tolerancePx: px, designsText, designsOther };
});
console.log('\nwide-net distribution (designs flagged at each ceiling, after ragged-edge suppression):');
console.log('tolerance  text-pairs  non-text-pairs');
for (const row of table) {
  console.log(`${String(row.tolerancePx).padStart(6)}px  ${String(row.designsText).padStart(9)}`
    + `  ${String(row.designsOther).padStart(13)}`);
}

const skewTotal = perDesign.reduce((s, d) => s + d.skewStraddles.length, 0);
console.log(`\nSkew straddles across the catalog: ${skewTotal}`);

await writeFile(OUT, `${JSON.stringify({
  sweptAt: new Date().toISOString().slice(0, 10),
  designs: perDesign.length,
  sweepNetPx: SWEEP_PX,
  defaults: {
    flaggedDesigns: flaggedDesigns.length,
    flaggedPairs: perDesign.reduce((s, d) => s + d.flagged.length, 0),
  },
  wideNet: table,
  skewStraddlesInCatalog: skewTotal,
  notes: 'Ground truth for axisCheck.ts: the catalog lower thirds are hand-authored, so what the committed defaults flag here is the instrument\'s false-positive base rate on deliberate composition. The wide-net table is the distribution the text/non-text bands were picked from. Per-design detail is deliberately kept so a disputed flag can be traced.',
  perDesign,
}, null, 2)}\n`);
console.log(`\nWritten: ${OUT}`);
console.log('If the defaults flag more than a handful, adjust the bands in axisCheck.ts and re-run.');
