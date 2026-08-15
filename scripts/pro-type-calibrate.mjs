#!/usr/bin/env node
// CALIBRATE the spacing and proportion instruments PER GRAPHIC TYPE, and measure Phase A's own
// composition of each one beside the catalog it has to live with (docs/NOACG_PRO_PLAN.md §15.9).
//
//   node scripts/pro-type-calibrate.mjs                  # every Pro graphic type, FREE
//   node scripts/pro-type-calibrate.mjs sponsor-bug      # one of them
//
// WHY THIS EXISTS. Every calibrated number in `src/ai/spike/{spacingCheck,proportionCheck}.ts` was
// read off the lower-third catalog, and Phase B renders the same design language as a sponsor bug
// and a countdown. A threshold that flags many SHIPPED designs of a type is measuring the wrong
// thing for that type - that is the same rule the lower third's own sweep is written under, and
// it is the only honest way to widen a gate the platform is then scored by.
//
// The instruments take an override for every threshold, so a per-type calibration is a set of
// ARGUMENTS (`PRO_GRAPHICS[id].instruments`, src/ai/pro/language/graphics.ts) rather than an edit
// to a shared gate. Nothing here changes what a lower third is judged against.
//
// WHAT IT PRINTS, per type:
//   1. the CATALOG's shipped designs for that type, under the LOWER THIRD's thresholds - which
//      says whether the calibration transfers;
//   2. the same designs under the type's DECLARED thresholds - which says whether the overrides
//      cover the catalog they were derived from;
//   3. Phase A's four stub languages composed as that type, under the type's thresholds - which
//      says whether the composer clears its own gate BY CONSTRUCTION, for zero tokens.
//
// Requires the dev server on this checkout's port (node scripts/dev-port.mjs) and, for the mark
// measurements, the spike's brand fixture - a corner bug measured without a mark measures a
// graphic the product never produces.

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { devPort } from './dev-port.mjs';

const BASE = `http://localhost:${devPort()}`;
const BRANDS = path.resolve('benchmarks/pro/v1/spike/brands.json');
const OUT = path.resolve('benchmarks/pro/v1/spike/type-calibration.json');

const only = process.argv.slice(2).filter((a) => !a.startsWith('--'));

try {
  await fetch(`${BASE}/app`, { signal: AbortSignal.timeout(4000) });
} catch {
  console.error(`Dev server not reachable at ${BASE} - start it first.`);
  process.exit(1);
}

// ── The mark, loaded the way pro-spike loads it ─────────────────────────────────────────
const brandsFixture = JSON.parse(await readFile(BRANDS, 'utf8'));
const rawBrand = brandsFixture.brands[0];
const markFile = path.resolve(path.dirname(BRANDS), rawBrand.mark);
const markBytes = await readFile(markFile);
const markExt = path.extname(markFile).toLowerCase();
const markMime = markExt === '.svg' ? 'image/svg+xml' : markExt === '.png' ? 'image/png' : 'image/jpeg';
const markFileName = path.basename(markFile);
const markDataUrl = `data:${markMime};base64,${markBytes.toString('base64')}`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on('pageerror', (error) => console.log('  pageerror:', error.message));
await page.goto(`${BASE}/app`, { waitUntil: 'domcontentloaded' });
await page.locator('.topbar').waitFor();
await page.locator('.wz-modal').waitFor({ state: 'visible', timeout: 20_000 }).catch(() => undefined);
await page.keyboard.press('Escape');
await page.locator('.wz-modal').waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => undefined);

// probeMark is MEASURED in the page rather than hand-written, exactly as the paid runner does it.
const probe = await page.evaluate(async (input) => {
  const bust = '?t=' + Date.now();
  const { probeMark } = await import('/src/assets/assetInfo.ts' + bust);
  return probeMark({ path: `images/${input.fileName}`, data: input.dataUrl });
}, { fileName: markFileName, dataUrl: markDataUrl });
if (!probe) {
  console.error(`probeMark could not read ${markFileName} - fix the mark file.`);
  process.exit(1);
}
const mark = { path: `images/${markFileName}`, dataUrl: markDataUrl, probe };
console.log(`mark ${markFileName}: aspect ${probe.aspect.toFixed(2)} · ${probe.backing}`
  + ` · ink luminance ${probe.inkLuminance.toFixed(2)}`
  + `${typeof probe.inkSpread === 'number' ? ` · spread ${probe.inkSpread.toFixed(4)}` : ''}`);

/**
 * Render ONE template's settled hold in an iframe and read both instruments off it, twice: once
 * under the lower third's own thresholds and once under this type's declared overrides.
 */
async function measure(input) {
  return page.evaluate(async ({ template, data, markFieldId, instruments }) => {
    const bust = '?t=' + Date.now();
    const { composeDocument } = await import('/src/preview/composeDocument.ts' + bust);
    const { measureSpacing } = await import('/src/ai/spike/spacingCheck.ts' + bust);
    const { measureProportion } = await import('/src/ai/spike/proportionCheck.ts' + bust);

    document.getElementById('type-cal-frame')?.remove();
    const frame = document.createElement('iframe');
    frame.id = 'type-cal-frame';
    frame.style.cssText = 'position:fixed;left:0;top:0;width:1920px;height:1080px;border:0;'
      + 'z-index:99999;background:#333;color-scheme:dark;';
    document.body.appendChild(frame);
    frame.srcdoc = composeDocument(template);
    await new Promise((resolve) => { frame.onload = resolve; });
    await new Promise((resolve) => setTimeout(resolve, 200));
    const win = frame.contentWindow;
    let error = null;
    try {
      win.update(JSON.stringify(data));
      win.play();
    } catch (e) {
      error = String(e?.message ?? e).slice(0, 200);
    }
    await win.document.fonts.ready;
    await new Promise((resolve) => setTimeout(resolve, 1600));
    const doc = frame.contentDocument;
    const base = { markFieldId: markFieldId ?? null };
    const out = {
      error,
      // The lower third's calibration, unchanged - the control reading.
      l3: {
        spacing: measureSpacing(doc, base),
        proportion: measureProportion(doc, base),
      },
      // The same frame under this type's declared thresholds.
      typed: {
        spacing: measureSpacing(doc, { ...base, ...(instruments.spacing ?? {}) }),
        proportion: measureProportion(doc, { ...base, ...(instruments.proportion ?? {}) }),
      },
    };
    frame.remove();
    return out;
  }, input);
}

const codes = (report) => [
  ...report.spacing.findings.map((f) => f.code),
  ...report.proportion.findings.map((f) => f.code),
];

/** Codes ALONE cannot calibrate anything - "flagged" says a threshold fired, never by how much.
 *  Every finding carries the reading that produced it, and that is what a floor is read off. */
const details = (report) => [
  ...report.spacing.findings.map((f) => `${f.code}: ${f.detail}`),
  ...report.proportion.findings.map((f) => `${f.code}: ${f.detail}`),
];

const row = (label, m) => {
  const p = m.typed.proportion;
  const l3codes = codes(m.l3);
  const typedCodes = codes(m.typed);
  console.log(`  ${label.padEnd(26)}`
    + `type ${String(p.typeRatio ?? '-').padEnd(6)}`
    + `mark ${String(p.markScale ?? '-').padEnd(6)}`
    + `fill ${String(p.panelFill ?? '-').padEnd(6)}`
    + `foot ${String(p.footprint ?? '-').padEnd(7)}`
    + `L3 [${l3codes.join(',') || 'clean'}]  →  typed [${typedCodes.join(',') || 'clean'}]`
    + (m.error ? `  ✗ ${m.error}` : ''));
  // The READING behind every flag, on both calibrations - a floor cannot be set from a code.
  for (const d of details(m.l3)) console.log(`      L3 · ${d}`);
};

const results = [];
const specs = await page.evaluate(async () => {
  const bust = '?t=' + Date.now();
  const { PRO_GRAPHIC_LIST } = await import('/src/ai/pro/language/graphics.ts' + bust);
  const { typeById } = await import('/src/templates/types/registry.ts' + bust);
  return PRO_GRAPHIC_LIST.map((spec) => ({
    id: spec.id,
    label: spec.label,
    typeId: spec.typeId,
    frequency: spec.frequency,
    takesMark: spec.takesMark,
    instruments: spec.instruments,
    catalogIds: (typeById(spec.typeId)?.designs ?? []).map((d) => d.id),
  }));
});

for (const spec of specs) {
  if (only.length && !only.includes(spec.id)) continue;
  console.log(`\n── ${spec.label} (${spec.typeId}, ${spec.frequency}/60 formats) ──`);
  console.log(`  thresholds: ${JSON.stringify(spec.instruments)}`);

  // 1 + 2. The catalog's own shipped designs for this type.
  console.log(`  CATALOG (${spec.catalogIds.length} shipped design(s)):`);
  for (const id of spec.catalogIds) {
    const built = await page.evaluate(async (input) => {
      const bust = '?t=' + Date.now();
      const cat = await import('/src/templates/catalog.ts' + bust);
      const { packageLines } = await import('/src/ai/pro/language/graphics.ts' + bust);
      const variant = cat.variantById(input.variantId);
      if (!variant) return null;
      const lines = packageLines(input.graphic, {
        name: 'Priya Raghunathan', title: 'Senior Research Fellow', channel: 'Northgate Sport',
      });
      const template = variant.create({
        lines,
        ...(input.takesMark
          ? {
            logoEnabled: true,
            logoAssetPath: input.mark.path,
            importedImages: [{ path: input.mark.path, data: input.mark.dataUrl }],
          }
          : {}),
      });
      const text = template.fields.filter((f) => f.ftype === 'textfield' || f.ftype === 'textarea');
      const data = {};
      text.forEach((f, i) => { data[f.field] = lines[i]?.sample ?? String(f.value ?? ''); });
      const slot = template.fields.find((f) => f.ftype === 'filelist');
      if (input.takesMark && slot) data[slot.field] = input.mark.path;
      return { template, data, markFieldId: input.takesMark && slot ? slot.field : null };
    }, { variantId: id, graphic: spec.id, takesMark: spec.takesMark, mark });
    if (!built) { console.log(`  ${id.padEnd(26)}GONE from the catalog`); continue; }
    const m = await measure({ ...built, instruments: spec.instruments });
    row(id, m);
    results.push({ graphic: spec.id, source: 'catalog', id, ...m });
  }

  // 3. Phase A's own compositions of this type, from the four hand-written stub languages.
  console.log('  PHASE A (four stub languages through the real composer):');
  const languages = await page.evaluate(async () => {
    const bust = '?t=' + Date.now();
    const { STUB_LANGUAGES } = await import('/src/ai/pro/language/stub.ts' + bust);
    return STUB_LANGUAGES.map((l) => l.name);
  });
  for (let i = 0; i < languages.length; i += 1) {
    const built = await page.evaluate(async (input) => {
      const bust = '?t=' + Date.now();
      const { STUB_LANGUAGES } = await import('/src/ai/pro/language/stub.ts' + bust);
      const { composeGraphic, packageLines, PRO_GRAPHICS } = await import('/src/ai/pro/language/graphics.ts' + bust);
      const language = STUB_LANGUAGES[input.index];
      const spec = PRO_GRAPHICS[input.graphic];
      const lines = packageLines(input.graphic, {
        name: 'Priya Raghunathan', title: 'Senior Research Fellow', channel: 'Northgate Sport',
      });
      const composed = composeGraphic(input.graphic, language, {
        lines,
        ...(spec.takesMark
          ? {
            logo: {
              assetPath: input.mark.path,
              images: [{ path: input.mark.path, data: input.mark.dataUrl }],
              backing: input.mark.probe.backing,
              inkLuminance: input.mark.probe.inkLuminance,
              ...(typeof input.mark.probe.inkSpread === 'number'
                ? { inkSpread: input.mark.probe.inkSpread }
                : {}),
            },
          }
          : {}),
      });
      const { template, spacing, adjustments } = composed;
      const text = template.fields.filter((f) => f.ftype === 'textfield' || f.ftype === 'textarea');
      const data = {};
      text.forEach((f, i) => { data[f.field] = lines[i]?.sample ?? String(f.value ?? ''); });
      const slot = template.fields.find((f) => f.ftype === 'filelist');
      if (spec.takesMark && slot) data[slot.field] = input.mark.path;
      return {
        template,
        data,
        markFieldId: spec.takesMark && slot ? slot.field : null,
        plan: {
          padVPx: spacing.padVPx,
          padHPx: spacing.padHPx,
          lineGapPx: spacing.lineGapPx,
          headingPx: spacing.headingPx,
          supportingPx: spacing.supportingPx,
          accentPx: spacing.accentPx,
          preset: spacing.preset,
        },
        adjustments,
      };
    }, { index: i, graphic: spec.id, mark });
    const m = await measure({ ...built, instruments: spec.instruments });
    row(languages[i], m);
    results.push({ graphic: spec.id, source: 'phase-a', id: languages[i], plan: built.plan, adjustments: built.adjustments, ...m });
  }
}

await browser.close();

// ── The verdict, stated the way the lower third's sweep states it ────────────────────────
const catalogFlagged = results.filter((r) => r.source === 'catalog' && codes(r.typed).length);
const phaseAFlagged = results.filter((r) => r.source === 'phase-a' && codes(r.typed).length);
const catalogFlaggedL3 = results.filter((r) => r.source === 'catalog' && codes(r.l3).length);

console.log(`\n── VERDICT ──`);
console.log(`catalog under the LOWER THIRD's thresholds: ${catalogFlaggedL3.length}`
  + `/${results.filter((r) => r.source === 'catalog').length} shipped designs flagged`);
console.log(`catalog under the TYPE's thresholds:        ${catalogFlagged.length}`
  + `/${results.filter((r) => r.source === 'catalog').length} shipped designs flagged`);
console.log(`Phase A under the TYPE's thresholds:        ${phaseAFlagged.length}`
  + `/${results.filter((r) => r.source === 'phase-a').length} compositions flagged`);
for (const r of catalogFlagged) console.log(`  catalog ${r.graphic}/${r.id}: ${codes(r.typed).join(', ')}`);
for (const r of phaseAFlagged) console.log(`  phase-a ${r.graphic}/${r.id}: ${codes(r.typed).join(', ')}`);
console.log('\nA threshold flagging many SHIPPED designs is measuring the wrong thing for that');
console.log('type. A Phase A composition flagging anything is a COMPOSER bug, and it is free to');
console.log('find here rather than in a paid round.');

await writeFile(OUT, `${JSON.stringify({
  sweptAt: null,
  results: results.map((r) => ({
    graphic: r.graphic,
    source: r.source,
    id: r.id,
    ...(r.plan ? { plan: r.plan } : {}),
    ...(r.adjustments?.length ? { adjustments: r.adjustments } : {}),
    l3Codes: codes(r.l3),
    typedCodes: codes(r.typed),
    typeRatio: r.typed.proportion.typeRatio,
    markScale: r.typed.proportion.markScale,
    panelFill: r.typed.proportion.panelFill,
    footprint: r.typed.proportion.footprint,
    ...(r.error ? { error: r.error } : {}),
  })),
}, null, 2)}\n`);
console.log(`\nWritten: ${OUT}`);
