#!/usr/bin/env node
// PROBE the three catalog anchors the 2026-08-19 blind read failed - tk01, ig01, sb01 -
// with the same instruments the audit sweep runs, so their fixes carry measured
// before/after numbers instead of eyeballs (docs/NOACG_PRO_PLAN.md §23.1).
//
//   node scripts/spike-catalog-fix-probe.mjs        # FREE - needs the dev server up
//
// Each variant renders three ways: its own create({}) defaults, the blind page's brief data,
// and that brief's stress values - the last two through BOTH field mappings (the old
// positional one and mapBriefValues), because two of the three read failures were the
// positional mapping's, not the design's. The parity block prints the mapping every OTHER
// anchor type gets under each rule: the four the owner aired must map identically.

import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { devPort } from './dev-port.mjs';

const BASE = `http://localhost:${devPort()}`;
const BANK = path.resolve('benchmarks/pro/v1/custom/briefs.json');

try {
  await fetch(`${BASE}/app`, { signal: AbortSignal.timeout(4000) });
} catch {
  console.error(`Dev server not reachable at ${BASE} - start it first.`);
  process.exit(1);
}

const bank = JSON.parse(await readFile(BANK, 'utf8'));
const briefs = bank.briefs ?? bank;
const briefById = (id) => briefs.find((b) => b.id === id)?.brief;

const ANCHORS = [
  { variantId: 'tk01', briefId: 'tk-news', ticker: true },
  { variantId: 'ig01', briefId: 'st-election', ticker: false },
  { variantId: 'sb01', briefId: 'sb-football', ticker: false },
];
// The four anchors the owner AIRED - their mapping must not move under the semantic rule.
const PARITY = [
  { variantId: 'lt27', briefId: 'lt-markets' },
  { variantId: 'gt05', briefId: 'cd-launch' },
  { variantId: 'qz01', briefId: 'qz-primetime' },
  { variantId: 'sb21', briefId: 'pd-medal' },
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on('pageerror', (error) => console.log('  pageerror:', error.message));
await page.goto(`${BASE}/app`, { waitUntil: 'domcontentloaded' });
await page.locator('.topbar').waitFor();
await page.locator('.wz-modal').waitFor({ state: 'visible', timeout: 20_000 }).catch(() => undefined);
await page.keyboard.press('Escape');
await page.locator('.wz-modal').waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => undefined);

await page.evaluate(async () => {
  const bust = '?t=' + Date.now();
  const cat = await import('/src/templates/catalog.ts' + bust);
  const { composeDocument } = await import('/src/preview/composeDocument.ts' + bust);
  const { measureReadability } = await import('/src/validation/readabilityCheck.ts' + bust);
  const { measureSpacing } = await import('/src/ai/spike/spacingCheck.ts' + bust);
  const { measureTickerMargins } = await import('/src/validation/tickerCheck.ts' + bust);
  const anchors = await import('/src/ai/spike/anchors.ts' + bust);
  window.__cat = cat;
  window.__anchors = anchors;
  window.__mountAndMeasure = async (template, data, ticker) => {
    document.getElementById('fix-probe-frame')?.remove();
    const frame = document.createElement('iframe');
    frame.id = 'fix-probe-frame';
    frame.style.cssText = 'position:fixed;left:0;top:0;width:1920px;height:1080px;border:0;'
      + 'z-index:99999;background:#333;color-scheme:dark;';
    document.body.appendChild(frame);
    frame.srcdoc = composeDocument(template);
    await new Promise((resolve) => { frame.onload = resolve; });
    await new Promise((resolve) => setTimeout(resolve, 250));
    const win = frame.contentWindow;
    let playError = null;
    try {
      if (data) win.update(JSON.stringify(data));
      win.play();
    } catch (e) { playError = String(e && e.message || e); }
    await win.document.fonts.ready;
    await new Promise((resolve) => setTimeout(resolve, 1900));
    const doc = frame.contentDocument;
    const readability = measureReadability(doc, { mode: 'standard', target: { profile: 'tv' } });
    const spacing = measureSpacing(doc, {});
    const tick = ticker ? measureTickerMargins(doc) : null;
    const out = {
      playError,
      readabilityFindings: readability.findings.map((f) => ({ code: f.code, severity: f.severity, detail: f.detail })),
      readings: readability.readings
        .filter((r) => r.role !== 'decorative')
        .map((r) => ({
          desc: `${r.el} "${(r.snippet ?? '').slice(0, 24)}"`,
          fontPx: Math.round(r.fontPx * 10) / 10,
          role: r.role,
          contrast: r.contrast === null ? null : Math.round(r.contrast * 100) / 100,
        })),
      escapes: spacing.escapes.filter((e) => e.isText),
      spacingFindings: spacing.findings.map((f) => f.code),
      ticker: tick ? { band: tick.band, leftPx: tick.leftPx, rightPx: tick.rightPx, findings: tick.findings.map((f) => f.code) } : null,
    };
    frame.remove();
    return out;
  };
});

const positionalMap = (fields, vals) => Object.fromEntries(
  fields
    .filter((f) => ['textfield', 'textarea', 'number'].includes(f.ftype))
    .map((f, i) => [f.field, vals[i] ?? String(f.value ?? '')]),
);

function printMeasure(label, m) {
  const parts = [];
  if (m.playError) parts.push(`PLAY ERROR ${m.playError}`);
  for (const f of m.readabilityFindings) parts.push(`${f.severity ?? 'finding'}:${f.code}`);
  for (const c of m.spacingFindings) parts.push(c);
  if (m.escapes.length) parts.push(`text-escapes x${m.escapes.length}`);
  if (m.ticker) {
    parts.push(`band L${m.ticker.leftPx}/R${m.ticker.rightPx}`);
    for (const c of m.ticker.findings) parts.push(c);
  }
  console.log(`  ${label.padEnd(24)} ${parts.length ? parts.join(' · ') : 'clean'}`);
  for (const r of m.readings) {
    console.log(`      ${r.role.padEnd(9)} ${String(r.fontPx).padStart(6)}px  contrast ${r.contrast ?? '-'}  ${r.desc}`);
  }
}

for (const { variantId, briefId, ticker } of ANCHORS) {
  const brief = briefById(briefId);
  console.log(`\n== ${variantId} (brief ${briefId}) ==`);
  const fields = await page.evaluate(({ variantId }) => {
    const v = window.__cat.variantById(variantId);
    return v.create({}).fields.map((f) => ({ field: f.field, ftype: f.ftype, value: f.value }));
  }, { variantId });

  const sample = Object.values(await page.evaluate(({ brief }) => window.__anchors.dataFor(brief), { brief }));
  const stress = Object.values(await page.evaluate(({ brief }) => window.__anchors.stressFor(brief), { brief }));
  const semantic = await page.evaluate(({ fields, sample }) => window.__anchors.mapBriefValues(fields, sample), { fields, sample });
  const semanticStress = await page.evaluate(({ fields, stress }) => window.__anchors.mapBriefValues(fields, stress), { fields, stress });
  const positional = positionalMap(fields, sample);
  const positionalStress = positionalMap(fields, stress);

  const runs = [
    ['defaults', null],
    ['brief positional', positional],
    ['brief semantic', semantic],
    ['stress positional', positionalStress],
    ['stress semantic', semanticStress],
  ];
  for (const [label, data] of runs) {
    const m = await page.evaluate(
      ({ variantId, data, ticker }) => window.__mountAndMeasure(window.__cat.variantById(variantId).create({}), data, ticker),
      { variantId, data, ticker },
    );
    printMeasure(label, m);
  }
}

console.log('\n== mapping parity (the four aired anchors - positional and semantic must agree) ==');
for (const { variantId, briefId } of PARITY) {
  const brief = briefById(briefId);
  if (!brief) { console.log(`  ${variantId}: brief ${briefId} not in bank`); continue; }
  const fields = await page.evaluate(({ variantId }) => {
    const v = window.__cat.variantById(variantId);
    return v.create({}).fields.map((f) => ({ field: f.field, ftype: f.ftype, value: f.value }));
  }, { variantId });
  const sample = Object.values(await page.evaluate(({ brief }) => window.__anchors.dataFor(brief), { brief }));
  const semantic = await page.evaluate(({ fields, sample }) => window.__anchors.mapBriefValues(fields, sample), { fields, sample });
  const positional = positionalMap(fields, sample);
  const same = JSON.stringify(semantic) === JSON.stringify(positional);
  console.log(`  ${variantId.padEnd(6)} ${same ? 'IDENTICAL' : 'DIFFERS'}`);
  if (!same) {
    console.log(`    positional ${JSON.stringify(positional)}`);
    console.log(`    semantic   ${JSON.stringify(semantic)}`);
  }
}

await browser.close();
