// Render the AUTHORED half of the import-analysis vision dataset (docs/AI_PLATFORM_PLAN.md
// §8) and append it to the same ground-truth file the catalog generator writes.
// SPENDS NO TOKENS.
//
//   npm run bench:vision:hostile [-- out-dir]
//
// Needs no dev server: each case is self-contained HTML rendered straight into a blank
// page, which is the point - these cases must NOT be house catalog output.

import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { GROUND_TRUTH_VERSION, VISION_SUITE_ID, validateRecord } from './ai-vision-bench/groundTruth.mjs';
import { normalized, rgbToHex } from './ai-vision-bench/normalize.mjs';
import { HOSTILE_CASES, HOSTILE_SUITE_VERSION } from './ai-vision-bench/hostileCases.mjs';

const OUT = path.resolve(process.argv.slice(2).find((a) => !a.startsWith('--')) || './vision-bench-out');
await mkdir(path.join(OUT, 'images'), { recursive: true });

const browser = await chromium.launch();
const records = [];

for (const testCase of HOSTILE_CASES) {
  const page = await browser.newPage({
    viewport: { width: testCase.width, height: testCase.height },
  });
  await page.setContent(`<!DOCTYPE html><html><head><meta name="color-scheme" content="dark">
    <style>
      html,body{margin:0;padding:0;width:${testCase.width}px;height:${testCase.height}px;overflow:hidden}
      body{${testCase.backdrop ?? 'background:#0a0e13'}}
    </style></head><body>${testCase.body}</body></html>`);
  await page.waitForTimeout(250); // let webfont fallback settle before measuring

  const measured = await page.evaluate(({ w, h }) => {
    const out = [];
    for (const el of document.querySelectorAll('[data-role]')) {
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;
      const style = getComputedStyle(el);
      out.push({
        kind: 'text',
        role: el.getAttribute('data-role'),
        bbox: { x: rect.left / w, y: rect.top / h, w: rect.width / w, h: rect.height / h },
        sampleText: (el.textContent ?? '').trim(),
        fontFamily: style.fontFamily,
        fontWeight: Number(style.fontWeight) || 400,
        fontSizeNorm: parseFloat(style.fontSize) / h,
        // An outlined glyph has a transparent FILL, so its colour is the stroke. Reading
        // `color` alone would record "transparent" as the text colour and then score a
        // model wrong for reporting what a human plainly sees.
        color: style.webkitTextStrokeColor && style.color === 'rgba(0, 0, 0, 0)'
          ? style.webkitTextStrokeColor
          : style.color,
        textAlign: style.textAlign,
      });
    }
    return out;
  }, { w: testCase.width, h: testCase.height });

  if (testCase.hasEditableText && !measured.length) {
    console.error(`- ${testCase.id}: declares editable text but nothing measurable - FIX THE CASE`);
    await page.close();
    continue;
  }
  if (!testCase.hasEditableText && measured.length) {
    console.error(`- ${testCase.id}: declared text-free but has data-role elements - FIX THE CASE`);
    await page.close();
    continue;
  }

  const imageName = `${testCase.id}.png`;
  await page.screenshot({
    path: path.join(OUT, 'images', imageName),
    omitBackground: Boolean(testCase.transparent),
  });
  await page.close();

  const record = {
    version: GROUND_TRUTH_VERSION,
    suite: VISION_SUITE_ID,
    hostileVersion: HOSTILE_SUITE_VERSION,
    id: testCase.id,
    source: 'authored',
    split: testCase.split,
    image: `images/${imageName}`,
    truth: {
      graphicType: testCase.graphicType,
      canvas: { aspect: testCase.width / testCase.height },
      hasEditableText: testCase.hasEditableText,
      authoritativeKinds: ['text'],
      regions: measured.map((r) => normalized(r, rgbToHex)),
    },
    provenance: {
      note: testCase.note,
      size: `${testCase.width}x${testCase.height}`,
      transparent: Boolean(testCase.transparent),
    },
  };
  const check = validateRecord(record);
  if (!check.ok) {
    console.error(`- ${testCase.id}: INVALID (${check.errors.join('; ')})`);
    continue;
  }
  records.push(record);
  console.log(`- ${testCase.id} [${testCase.split}] ${testCase.width}x${testCase.height}: `
    + `${record.truth.regions.length} region(s)${testCase.hasEditableText ? '' : ' (text-free tripwire)'}`);
}

await browser.close();

// Append rather than overwrite: the catalog generator owns the same file, and the two
// halves are only a dataset together.
const file = path.join(OUT, 'ground-truth.jsonl');
let existing = [];
try {
  existing = (await readFile(file, 'utf8')).split('\n').filter(Boolean).map((l) => JSON.parse(l));
} catch { /* first run */ }
const kept = existing.filter((r) => r.source !== 'authored'); // re-running replaces this half
await writeFile(file, `${[...kept, ...records].map((r) => JSON.stringify(r)).join('\n')}\n`, 'utf8');

const dev = records.filter((r) => r.split === 'dev').length;
const holdout = records.filter((r) => r.split === 'holdout').length;
const tripwires = records.filter((r) => !r.truth.hasEditableText).length;
console.log(`\n${records.length} authored case(s): ${dev} dev, ${holdout} holdout, ${tripwires} text-free tripwire(s).`);
console.log(`Dataset now ${kept.length + records.length} record(s) in ${file}`);

// The count alone flatters the dataset. Catalog renders are on-distribution and easy, so a
// scorecard dominated by them says more about how house-shaped the fixtures are than about
// how a model handles a real import. State the balance where it cannot be missed.
const authoredShare = records.length / (kept.length + records.length);
console.log(`Balance: ${kept.length} catalog-render (easy, on-distribution) vs `
  + `${records.length} authored (hard) - authored is ${Math.round(authoredShare * 100)}% of the set.`);
if (authoredShare < 0.4) {
  console.log('The hard half is UNDER-WEIGHTED. Read any scorecard from this set as an upper');
  console.log('bound on real-import performance, and add authored cases before trusting it');
  console.log('for a launch decision.');
}
console.log('\nHOLDOUT DISCIPLINE: never tune a prompt against the holdout cases and never');
console.log('quote them in a development report - they exist to catch a model or prompt');
console.log('fitted to the visible half. The holdout is authored, never catalog renders:');
console.log('a holdout drawn from the easy distribution measures nothing.');

