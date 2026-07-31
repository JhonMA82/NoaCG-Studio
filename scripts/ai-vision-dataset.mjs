// Build the catalog-rendered half of the import-analysis vision dataset
// (docs/AI_PLATFORM_PLAN.md §8). SPENDS NO TOKENS - it renders the house catalog and reads
// the geometry back out of the DOM that drew it, so the labels are exact rather than
// eyeballed: the bounding box, the font and the colour are the ones the browser used.
//
//   npm run bench:vision:dataset [-- out-dir] [--per-category=N]
//
// The dev server must be running (Vite serves the source modules this reads).
//
// This covers the EASY, on-distribution half of the suite by design. The hostile classes
// the plan names - no editable text, odd aspect ratios, flattened artwork, hostile
// typography - cannot come from the catalog, because the catalog is exactly the thing a
// user's imported artwork is not. Those are authored by hand into the same schema and the
// holdout is drawn from them; a scorecard built on catalog renders alone would flatter any
// model and predict nothing about real imports. `datasetSummary` prints that gap rather
// than leaving it to be discovered.

import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { devPort } from './dev-port.mjs';
import {
  GROUND_TRUTH_VERSION,
  VISION_SUITE_ID,
  validateRecord,
} from './ai-vision-bench/groundTruth.mjs';
import { normalized, rgbToHex } from './ai-vision-bench/normalize.mjs';

const args = process.argv.slice(2);
const OUT = path.resolve(args.find((a) => !a.startsWith('--')) || './vision-bench-out');
const PER_CATEGORY = Number(args.find((a) => a.startsWith('--per-category='))?.split('=')[1]) || 4;

/** One controlled opaque backdrop for every capture. Real imported artwork arrives
 *  flattened over something; a keyed graphic composited over whatever happened to be on
 *  screen is not a dataset, it is a screenshot of the app. Recorded in provenance so a
 *  later run cannot silently change what the model was looking at. */
const BACKDROP = '#101418';

// Catalog categories map onto the contract's graphic types (src/ai/importAnalysis/
// contract.ts). Only categories with an HONEST correspondence are rendered: an import the
// analyzer would call 'other' teaches the benchmark nothing about type accuracy.
const CATEGORY_TYPES = {
  'lower-third': 'lower-third',
  'info-card': 'info-graphic',
  scoreboard: 'scoreboard',
  'starting-soon': 'title-card',
};

await mkdir(path.join(OUT, 'images'), { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on('pageerror', (e) => console.error('PAGE ERROR:', e.message));
await page.goto(`http://localhost:${devPort()}/app`, { waitUntil: 'domcontentloaded' });
await page.keyboard.press('Escape'); // close the creation wizard
await page.waitForTimeout(600);

const records = [];
for (const [category, graphicType] of Object.entries(CATEGORY_TYPES)) {
  const variants = await page.evaluate(async (cat) => {
    const { CATALOG } = await import('/src/templates/catalog.ts');
    return (CATALOG[cat] ?? []).map((v) => v.id);
  }, category);
  if (!variants.length) {
    console.log(`- ${category}: no variants (skipped)`);
    continue;
  }
  // Evenly spaced rather than the first N: adjacent catalog ids are often design siblings,
  // so taking the head would sample one look repeatedly.
  const step = Math.max(1, Math.floor(variants.length / PER_CATEGORY));
  const chosen = variants.filter((_, i) => i % step === 0).slice(0, PER_CATEGORY);

  for (const variantId of chosen) {
    const truth = await page.evaluate(async ({ cat, id, BACKDROP }) => {
      const { CATALOG } = await import('/src/templates/catalog.ts');
      const { composeDocument } = await import('/src/preview/composeDocument.ts');
      const variant = (CATALOG[cat] ?? []).find((v) => v.id === id);
      if (!variant) return null;
      const template = variant.create();

      // A broadcast graphic is KEYED - it paints on transparency. Mounted straight over the
      // running app, the editor's own chrome showed through the graphic and landed in the
      // dataset, which would have had the vision model analysing NoaCG's interface. Hide
      // the app and give the frame a controlled opaque backdrop, so the capture contains
      // the graphic and nothing else.
      document.getElementById('root')?.style.setProperty('display', 'none');
      document.body.style.background = BACKDROP;

      return new Promise((resolve) => {
        const frame = document.createElement('iframe');
        frame.id = 'vision-capture-frame';
        frame.style.cssText = 'position:fixed;left:0;top:0;width:1920px;height:1080px;border:0;'
          + `z-index:99999;background:${BACKDROP}`;
        frame.onload = async () => {
          const win = frame.contentWindow;
          const doc = frame.contentDocument;
          try { win.play?.(); } catch { /* the capture below still reports what rendered */ }
          // Settle the entrance before measuring: a mid-flight box is not the graphic.
          await new Promise((r) => setTimeout(r, 1400));

          const regions = [];
          for (const field of template.fields) {
            const el = doc.getElementById(field.field);
            if (!el) continue;
            const rect = el.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) continue;
            const style = win.getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden') continue;
            const text = (el.textContent ?? '').trim();
            if (!text) continue;
            regions.push({
              kind: 'text',
              bbox: {
                x: rect.left / 1920, y: rect.top / 1080,
                w: rect.width / 1920, h: rect.height / 1080,
              },
              fieldTitle: field.title,
              sampleText: text,
              fontFamily: style.fontFamily,
              fontWeight: Number(style.fontWeight) || 400,
              // Cap height is what the contract's fontSizeNorm means; font-size over canvas
              // height is the closest honest proxy available from computed style.
              fontSizeNorm: parseFloat(style.fontSize) / 1080,
              color: style.color,
              textAlign: style.textAlign,
            });
          }
          // Left MOUNTED: the caller screenshots it next and unmounts afterwards. Removing
          // it on a timer here raced the capture.
          resolve({ variantId: id, regions });
        };
        frame.srcdoc = composeDocument(template);
        document.body.appendChild(frame);
      });
    }, { cat: category, id: variantId, BACKDROP });

    if (!truth || !truth.regions.length) {
      console.log(`- ${category}/${variantId}: no measurable text regions (skipped)`);
      continue;
    }

    const recordId = `catalog-${category}-${variantId}`;
    const imageName = `${recordId}.png`;
    // Capture the ELEMENT, not the page: the measured bboxes are normalized against the
    // 1920x1080 frame, so a full-page capture would put every box in the wrong place the
    // moment the page scrolled or the frame was inset.
    const frame = page.locator('#vision-capture-frame');
    await frame.screenshot({ path: path.join(OUT, 'images', imageName) });
    await page.evaluate(() => {
      document.getElementById('vision-capture-frame')?.remove();
      document.getElementById('root')?.style.removeProperty('display');
    });

    const record = {
      version: GROUND_TRUTH_VERSION,
      suite: VISION_SUITE_ID,
      id: recordId,
      source: 'catalog-render',
      // Catalog renders are the PUBLIC dev half. The hidden holdout is authored, so a model
      // cannot be tuned against the easy distribution and then credited for the hard one.
      split: 'dev',
      image: `images/${imageName}`,
      truth: {
        graphicType,
        canvas: { aspect: 1920 / 1080 },
        hasEditableText: true,
        // Catalog renders know their TEXT regions exactly and claim nothing about
        // decoration, so scoring never penalizes a model for reporting a panel or a rule.
        authoritativeKinds: ['text'],
        regions: truth.regions.map((r) => normalized(r, rgbToHex)),
      },
      provenance: {
        category, variantId, backdrop: BACKDROP,
        note: 'geometry read from the rendered DOM; keyed graphic composited over the backdrop',
      },
    };
    const check = validateRecord(record);
    if (!check.ok) {
      console.error(`- ${recordId}: INVALID (${check.errors.join('; ')})`);
      continue;
    }
    records.push(record);
    console.log(`- ${recordId}: ${record.truth.regions.length} text region(s)`);
  }
}

await browser.close();

await writeFile(
  path.join(OUT, 'ground-truth.jsonl'),
  `${records.map((r) => JSON.stringify(r)).join('\n')}\n`,
  'utf8',
);

const roleKnown = records.reduce((n, r) => n + r.truth.regions.filter((x) => x.role).length, 0);
const regionTotal = records.reduce((n, r) => n + r.truth.regions.length, 0);
console.log(`\nWrote ${records.length} record(s) to ${path.join(OUT, 'ground-truth.jsonl')}`);
console.log(`${regionTotal} text regions; ${roleKnown} carry a derivable role ` +
  `(${regionTotal - roleKnown} field titles were too generic to map - those drop out of role accuracy).`);
console.log('\nThis is the EASY, on-distribution half. The suite is not usable for a launch');
console.log('decision until the authored hostile cases exist: no-editable-text tripwires,');
console.log('odd aspect ratios, flattened/transparent artwork, hostile typography - and the');
console.log('hidden holdout is drawn from those, not from these.');
