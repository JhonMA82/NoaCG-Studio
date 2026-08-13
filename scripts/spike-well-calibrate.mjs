#!/usr/bin/env node
// CALIBRATE the bounding-box-well screen against the 2026-08-13 brand round's OWNER LABELS.
//
//   node scripts/spike-well-calibrate.mjs --out=pro-brand-qwen3-coder
//
// The round's owner read named the defect seven times ("visible white background - looks like
// a JPEG pasted on top, not acceptable") and praised the SAME tone twice where it was drawn as
// a real compositional element. Those labels are ground truth a detector can be scored
// against, and the round's code was saved, so scoring is FREE: re-render each generation from
// code/<slug>/, run the same `measureRenderedMark` the round runs, and compare its
// bounding-box findings with what the human flagged.
//
// The labels are pinned here from the archived `notes_filled.md`
// (pro-brand-qwen3-coder-2026-08-13); they are historical data, not configuration.
//
// Requires the dev server on this checkout's port.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { devPort } from './dev-port.mjs';

const BASE = `http://localhost:${devPort()}`;
const OUT = path.resolve(
  process.argv.slice(2).find((a) => a.startsWith('--out='))?.slice('--out='.length) ?? 'pro-brand-qwen3-coder',
);
const BANK = path.resolve('benchmarks/pro/v1/briefs.json');
const BRANDS = path.resolve('benchmarks/pro/v1/spike/brands.json');

/** The owner's blind labels (archived notes_filled.md, 2026-08-13), by slug. */
const OWNER_BOX_FLAGGED = [
  'news-public.aldervale.exemplar',   // B-08 "white square ... like a JPEG pasted. Not acceptable"
  'corporate.aldervale.exemplar',     // B-14 "same transparency problem"
  'portrait-logo.sunbeam.none',       // B-19 "separate image without proper transparency"
  'long-name.kestrel.exemplar',       // B-20 "background ... visibly exposed"
  'non-latin.aldervale.exemplar',     // B-26 "visible white background"
  'non-latin.aldervale.none',         // B-27 "same issue as B-26"
  'news-public.kestrel.none',         // B-32 "visible logo background ... pasted on"
];
/** Items the owner PRAISED with the mark on a drawn surface - these must NOT flag. */
const OWNER_INTEGRATED = [
  'long-name.kestrel.none',           // B-21 "large yellow square ... visually it works"
  'multiline-title.ledger.exemplar',  // B-22 "white background with black logo is effective"
  'empty-optional.sunbeam.none',      // B-25 "logo banner is white ... works visually"
  'high-contrast.ledger.none',        // B-29 "logo is large and placed beside the text"
  'gradient-accent.kestrel.none',     // B-31 "no visible background box around it"
  'news-public.sunbeam.none',         // B-33 "good example of how the logo and text should be combined"
];

const ledger = JSON.parse(await readFile(path.join(OUT, 'results.json'), 'utf8'));
const bank = JSON.parse(await readFile(BANK, 'utf8'));
const brandsFixture = JSON.parse(await readFile(BRANDS, 'utf8'));
const markData = {};
for (const b of brandsFixture.brands) {
  const file = path.resolve(path.dirname(BRANDS), b.mark);
  const bytes = await readFile(file);
  markData[b.id] = `data:image/svg+xml;base64,${bytes.toString('base64')}`;
}

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

const rows = [];
for (const record of ledger.results) {
  if (record.kind !== 'candidate' || record.skipped || record.error) continue;
  if (!record.fill?.slotFieldId) continue;
  const codeDir = path.join(OUT, record.code);
  const [html, css, js] = await Promise.all([
    readFile(path.join(codeDir, 'index.html'), 'utf8'),
    readFile(path.join(codeDir, 'template.css'), 'utf8'),
    readFile(path.join(codeDir, 'template.js'), 'utf8'),
  ]);
  const briefId = record.slug.split('.')[0];
  const entry = bank.briefs.find((b) => b.id === briefId);
  const brand = ledger.brands.find((b) => b.id === record.brand);
  const findings = await page.evaluate(async (input) => {
    const bust = '?t=' + Date.now();
    const { composeDocument } = await import('/src/preview/composeDocument.ts' + bust);
    const { measureRenderedMark } = await import('/src/ai/spike/brand.ts' + bust);
    const { DEFAULT_SETTINGS } = await import('/src/model/types.ts' + bust);
    const template = {
      name: input.slug,
      type: 'lower-third',
      resolution: { width: 1920, height: 1080, label: '1080p' },
      fps: 25,
      html: input.html,
      css: input.css,
      js: input.js,
      fields: [],
      settings: DEFAULT_SETTINGS,
      assets: [{ path: input.markPath, data: input.markDataUrl }],
      layers: [],
    };
    document.getElementById('well-cal-frame')?.remove();
    const frame = document.createElement('iframe');
    frame.id = 'well-cal-frame';
    frame.style.cssText = 'position:fixed;left:0;top:0;width:1920px;height:1080px;border:0;'
      + 'z-index:99999;background:#333;color-scheme:dark;';
    document.body.appendChild(frame);
    frame.srcdoc = composeDocument(template);
    await new Promise((resolve) => { frame.onload = resolve; });
    await new Promise((resolve) => setTimeout(resolve, 200));
    const win = frame.contentWindow;
    try {
      win.update(JSON.stringify(input.data));
      win.play();
    } catch { /* a broken lifecycle still paints something - measure what is there */ }
    await win.document.fonts.ready;
    await new Promise((resolve) => setTimeout(resolve, 1600));
    const report = measureRenderedMark(frame.contentDocument, input.fieldId, input.probe);
    frame.remove();
    return report.findings;
  }, {
    slug: record.slug,
    html,
    css,
    js,
    markPath: record.fill.path,
    markDataUrl: markData[record.brand],
    fieldId: record.fill.slotFieldId,
    probe: brand.mark.probe,
    data: {
      f0: entry.brief.name,
      f1: entry.brief.title,
      [record.fill.slotFieldId]: record.fill.path,
    },
  });
  const boxed = findings.includes('bounding-box-well') || findings.includes('mark-own-background');
  rows.push({ slug: record.slug, boxed, findings });
  console.log(`${record.slug.padEnd(36)} ${boxed ? 'BOX' : '   '} ${findings.join(', ') || 'clean'}`);
}
await browser.close();

// ── Score against the owner ──────────────────────────────────────────────────────────────
const by = new Map(rows.map((r) => [r.slug, r]));
let hit = 0;
console.log('\nOwner-flagged (must flag):');
for (const slug of OWNER_BOX_FLAGGED) {
  const r = by.get(slug);
  const ok = Boolean(r?.boxed);
  if (ok) hit += 1;
  console.log(`  ${ok ? 'CAUGHT' : 'MISSED'}  ${slug}${r ? ` (${r.findings.join(', ') || 'clean'})` : ' (no slot record)'}`);
}
let clean = 0;
console.log('Owner-praised integrations (must NOT flag):');
for (const slug of OWNER_INTEGRATED) {
  const r = by.get(slug);
  const ok = !r?.boxed;
  if (ok) clean += 1;
  console.log(`  ${ok ? 'CLEAN ' : 'FALSE+'}  ${slug}${r ? ` (${r.findings.join(', ') || 'clean'})` : ''}`);
}
console.log(`\n${hit}/${OWNER_BOX_FLAGGED.length} owner flags caught, ${clean}/${OWNER_INTEGRATED.length} praised items clean.`);
console.log('Tune WELL_HUG_RATIO in src/ai/spike/brand.ts until both columns hold, then commit both.');
