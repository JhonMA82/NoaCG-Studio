#!/usr/bin/env node
// The NoaCG Pro GEOMETRY audit - the measurement the Pro benchmark does not make.
//
//   node scripts/pro-geometry-audit.mjs              # all checked-in fixtures
//   node scripts/pro-geometry-audit.mjs news-public  # a subset by id
//
// FREE: it replays the checked-in fixtures (benchmarks/pro/v1/fixtures/<id>/) through the
// real normalizer and compiler, renders the hold frame, and compares what the compiler
// PRODUCED against what the concept image actually CONTAINS. No network, no tokens.
//
// It exists because `pro-bench.mjs` scores validity, field carriage and editability, and
// every one of those can be perfect while the graphic on screen is wrong. Three quantities
// decide whether a reconstruction kept its design, and none of them was ever recorded:
//
//   1. SCALE     - the design unit's share of the concept frame against the compiled box's
//                  share of the 1920x1080 design frame. They must match. A concept returned
//                  at 1376x768 whose pixel coordinates are used as design pixels renders the
//                  whole graphic at 1376/1920 = 0.72 of the size it was designed at, and
//                  nothing downstream can tell, because every part shrinks together.
//   2. TYPE SIZE - the font size the shared field normalizer derives, against the height of
//                  the glyphs actually baked into the concept. A live line materially smaller
//                  than the baked line it replaces is what turns an un-erased plate into two
//                  visibly different copies of the same name.
//   3. FILL      - the mean colour inside a rebuilt panel's own reported box, against the
//                  fill it told CSS to paint. A large distance means the box, the colour, or
//                  both do not describe the pixels.
//
// Requires the dev server on this checkout's port (npm run dev).

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { devPort } from './dev-port.mjs';

const BASE = `http://localhost:${devPort()}`;
const FIXTURES = path.resolve('benchmarks/pro/v1/fixtures');
const BANK = path.resolve('benchmarks/pro/v1/briefs.json');

const only = process.argv.slice(2).find((a) => !a.startsWith('--'))?.split(',').filter(Boolean) ?? null;
const bank = JSON.parse(await readFile(BANK, 'utf8'));
const ids = (await readdir(FIXTURES)).filter((id) => !only || only.includes(id));
if (ids.length === 0) {
  console.error('No fixtures matched.');
  process.exit(1);
}

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

const scaleRatios = [];
const typeRatios = [];
const fillDistances = [];

for (const id of ids) {
  const entry = bank.briefs.find((b) => b.id === id);
  if (!entry) {
    console.log(`\n== ${id} == (no brief in the bank - skipped)`);
    continue;
  }
  const conceptBuf = await readFile(path.join(FIXTURES, id, 'concept.png'));
  const interpretation = JSON.parse(await readFile(path.join(FIXTURES, id, 'interpretation.json'), 'utf8'));

  const out = await page.evaluate(async (input) => {
    const bust = `?t=${Date.now()}`;
    const { normalizeProInterpretation } = await import(`/src/ai/pro/reconstruct/normalize.ts${bust}`);
    const { compileProPlan } = await import(`/src/ai/pro/reconstruct/compile.ts${bust}`);
    const { composeDocument } = await import(`/src/preview/composeDocument.ts${bust}`);
    const { uuid } = await import(`/src/model/id.ts${bust}`);

    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('the fixture concept could not be decoded'));
      el.src = input.conceptDataUrl;
    });
    const W = img.naturalWidth;
    const H = img.naturalHeight;

    // The concept's own pixels, for the two comparisons that need them.
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const px = ctx.getImageData(0, 0, W, H).data;
    const hex = (s) => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];

    const concept = { dataUrl: input.conceptDataUrl, mediaType: 'image/png', width: W, height: H, model: 'fixture', costUsd: 0 };
    const plan = normalizeProInterpretation(input.interpretation, { width: W, height: H }, uuid);
    const compiled = await compileProPlan(plan, concept, input.brief, {});

    // ── Render, and read the placed lines back out of the painted frame ──────────
    const frame = document.createElement('iframe');
    frame.id = 'pro-geometry-frame';
    frame.style.cssText = 'position:fixed;left:0;top:0;width:1920px;height:1080px;border:0;z-index:99999;background:#333;';
    document.body.appendChild(frame);
    frame.srcdoc = composeDocument(compiled.template);
    await new Promise((resolve) => { frame.onload = resolve; });
    await new Promise((resolve) => setTimeout(resolve, 400));
    const win = frame.contentWindow;
    win.update(JSON.stringify(Object.fromEntries(compiled.template.fields.map((f) => [f.field, f.value ?? '']))));
    win.play();
    await win.document.fonts.ready;
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const masks = [...win.document.querySelectorAll('[class$="-mask"]')].map((m) => {
      const r = m.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
    });
    frame.remove();

    // ── 1. SCALE ────────────────────────────────────────────────────────────────
    // The rendered box is read from the placed lines rather than the box element, so this
    // measures what is PAINTED: the horizontal gap between two lines is the same number of
    // design pixels as the gap between their plan coordinates, unless something rescaled.
    const scale = {
      unitFracOfConcept: plan.unit.w / W,
      renderedBoxFracOfFrame: null,
    };
    if (masks.length >= 1 && plan.fields.length >= 1) {
      // box left = the leftmost mask minus that field's offset inside the unit
      const leftmost = masks.reduce((a, b) => (b.x < a.x ? b : a));
      const index = masks.indexOf(leftmost);
      const field = plan.fields[index];
      if (field) {
        const boxLeft = leftmost.x - (field.x - plan.unit.x);
        scale.renderedBoxFracOfFrame = (plan.unit.w) / 1920;
        scale.renderedBoxLeft = boxLeft;
      }
    }

    // ── 2. TYPE SIZE ────────────────────────────────────────────────────────────
    const textRegions = input.interpretation.regions.filter((r) => r.kind === 'text');
    const type = textRegions.map((r, i) => {
      const bx = Math.max(0, Math.round(r.bbox.x * W));
      const by = Math.max(0, Math.round(r.bbox.y * H));
      const bw = Math.max(1, Math.round(r.bbox.w * W));
      const bh = Math.max(1, Math.round(r.bbox.h * H));
      let lumMin = 255;
      let lumMax = 0;
      const rowRange = [];
      for (let y = by; y < Math.min(H, by + bh); y += 1) {
        let mn = 255;
        let mx = 0;
        for (let x = bx; x < Math.min(W, bx + bw); x += 1) {
          const j = (y * W + x) * 4;
          const l = 0.299 * px[j] + 0.587 * px[j + 1] + 0.114 * px[j + 2];
          if (l < mn) mn = l;
          if (l > mx) mx = l;
        }
        rowRange.push(mx - mn);
        if (mn < lumMin) lumMin = mn;
        if (mx > lumMax) lumMax = mx;
      }
      const threshold = Math.max(30, (lumMax - lumMin) * 0.45);
      let first = -1;
      let last = -1;
      rowRange.forEach((v, k) => { if (v >= threshold) { if (first < 0) first = k; last = k; } });
      return {
        title: r.suggestedTitle ?? `text ${i + 1}`,
        bakedGlyphHeight: first < 0 ? null : last - first + 1,
        derivedFontSize: plan.fields[i]?.fontSize ?? null,
      };
    });

    // ── 3. FILL ─────────────────────────────────────────────────────────────────
    const fills = input.interpretation.regions
      .filter((r) => r.treatment === 'rebuild-shape' && r.panel)
      .map((r) => {
        const fill = r.panel.fill;
        const target = fill.kind === 'solid' ? hex(fill.color ?? '#000000') : hex(fill.from ?? '#000000');
        const bx = Math.max(0, Math.round(r.bbox.x * W));
        const by = Math.max(0, Math.round(r.bbox.y * H));
        const bw = Math.max(1, Math.round(r.bbox.w * W));
        const bh = Math.max(1, Math.round(r.bbox.h * H));
        let sr = 0;
        let sg = 0;
        let sb = 0;
        let n = 0;
        for (let y = by; y < Math.min(H, by + bh); y += 1) {
          for (let x = bx; x < Math.min(W, bx + bw); x += 1) {
            const j = (y * W + x) * 4;
            sr += px[j]; sg += px[j + 1]; sb += px[j + 2]; n += 1;
          }
        }
        const mean = [Math.round(sr / n), Math.round(sg / n), Math.round(sb / n)];
        return {
          shape: r.panel.shape,
          reported: fill.kind === 'solid' ? fill.color : `${fill.from}->${fill.to}`,
          meanInBox: `#${mean.map((v) => v.toString(16).padStart(2, '0')).join('')}`,
          distance: Math.round(Math.hypot(mean[0] - target[0], mean[1] - target[1], mean[2] - target[2])),
        };
      });

    return {
      conceptSize: { width: W, height: H },
      unit: plan.unit,
      scale,
      type,
      fills,
      report: {
        panelsRebuilt: compiled.report.panelsRebuilt,
        textErased: compiled.report.textErased,
        ringMatted: compiled.report.ringMatted,
        artDropped: compiled.report.artDropped,
        warnings: compiled.report.warnings.length,
      },
    };
  }, {
    conceptDataUrl: `data:image/png;base64,${conceptBuf.toString('base64')}`,
    interpretation,
    brief: entry.brief,
  });

  const designedFrac = out.scale.unitFracOfConcept;
  const renderedFrac = out.scale.renderedBoxFracOfFrame;
  const scaleRatio = renderedFrac && designedFrac ? renderedFrac / designedFrac : null;
  if (scaleRatio) scaleRatios.push(scaleRatio);

  console.log(`\n== ${id} == concept ${out.conceptSize.width}x${out.conceptSize.height}, unit ${JSON.stringify(out.unit)}`);
  console.log(`  SCALE     designed ${(designedFrac * 100).toFixed(1)}% of the concept's width -> rendered ${(renderedFrac * 100).toFixed(1)}% of the 1920 frame  (ratio ${scaleRatio?.toFixed(2) ?? 'n/a'}; 1.00 is faithful)`);
  for (const t of out.type) {
    const ratio = t.bakedGlyphHeight && t.derivedFontSize ? t.derivedFontSize / t.bakedGlyphHeight : null;
    const effective = ratio === null || scaleRatio === null ? null : ratio * scaleRatio;
    if (effective !== null) typeRatios.push(effective);
    console.log(`  TYPE      ${String(t.title).padEnd(12)} baked glyph ${String(t.bakedGlyphHeight ?? '-').padStart(3)}px -> live ${String(t.derivedFontSize ?? '-').padStart(3)}px  (in the frame: ${effective === null ? 'n/a' : `${effective.toFixed(2)}x the designed size`})`);
  }
  for (const f of out.fills) {
    fillDistances.push(f.distance);
    console.log(`  FILL      ${f.shape.padEnd(10)} told CSS ${f.reported.padEnd(18)} pixels are ${f.meanInBox}  (rgb distance ${f.distance})`);
  }
  console.log(`  REPORT    panels ${out.report.panelsRebuilt}, erased ${out.report.textErased}, ring matted ${out.report.ringMatted}, art dropped ${out.report.artDropped}, warnings ${out.report.warnings}`);
}

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
console.log('\n── summary ──────────────────────────────────────────────────────────────');
console.log(`  design unit rendered at ${mean(scaleRatios).toFixed(2)}x the size it was designed (1.00 is faithful, n=${scaleRatios.length})`);
console.log(`  live text rendered at   ${mean(typeRatios).toFixed(2)}x the baked text it replaces (n=${typeRatios.length})`);
console.log(`  rebuilt fills: mean rgb distance ${mean(fillDistances).toFixed(0)}, within 20 on ${fillDistances.filter((d) => d <= 20).length} of ${fillDistances.length}`);

await browser.close();
