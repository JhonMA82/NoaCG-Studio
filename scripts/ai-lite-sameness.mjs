// The SAMENESS metric - "different briefs must produce different designs", measured.
//
//   npm run bench:sameness [-- out-dir] [--house=<dir>]
//
// Free and offline: reads the hold captures already written by the eval runner
// (*-metrics.json rows -> phaseFiles.hold), rasterizes each to a small RGB vector in a
// headless page (no dev server - data URLs only), and reports per candidate label:
//
//   - MEAN pairwise distance: the run's overall visual diversity.
//   - MIN pairwise distance + which pair: the sameness TRIPWIRE - the two briefs whose
//     results look most alike. A healthy mean can hide one near-identical pair.
//   - Per item, the nearest HOUSE reference and its distance, when a house dir is given
//     (default: <out-dir>/calibration when it exists). For the skin suite this is the
//     claim "the skin looks like no house chassis" made checkable.
//
// Distances are mean absolute RGB differences over a 32x32 raster, in [0, 1]. Captures
// share one synthetic stage background, so numbers are comparable only within the same
// capture setup - the report says so rather than pretending an absolute scale.
//
// Writes sameness.json into the out dir; bench:report folds it in when present.

import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { nearestReference, pairwiseSummary } from './ai-lite-bench/sameness.mjs';

const args = process.argv.slice(2);
const flag = (name) => args.find((value) => value.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
const OUT = path.resolve(args.filter((a) => !a.startsWith('--'))[0] || './lite-bench-out');
const HOUSE = flag('house') ? path.resolve(flag('house')) : path.join(OUT, 'calibration');

async function findFiles(dir, predicate, relative = '') {
  const found = [];
  let entries;
  try {
    entries = await readdir(path.join(dir, relative), { withFileTypes: true });
  } catch {
    return found;
  }
  for (const entry of entries) {
    const rel = relative ? path.join(relative, entry.name) : entry.name;
    if (entry.isDirectory() && entry.name !== '.raw-video') found.push(...await findFiles(dir, predicate, rel));
    else if (predicate(entry.name)) found.push(rel);
  }
  return found;
}

// ── Collect the items: every metrics row with a hold capture ─────────────────
const items = []; // { label, id, file }
for (const metricsFile of await findFiles(OUT, (name) => name.endsWith('-metrics.json'))) {
  const parsed = JSON.parse(await readFile(path.join(OUT, metricsFile), 'utf8'));
  const dir = path.dirname(path.join(OUT, metricsFile));
  for (const row of parsed.rows ?? []) {
    if (!row.phaseFiles?.hold) continue;
    items.push({
      label: parsed.candidate,
      id: `${metricsFile.replaceAll('\\', '/')}::${row.fixtureId}`,
      shortId: row.fixtureId,
      skinApplied: Boolean(row.skinApplied),
      file: path.join(dir, row.phaseFiles.hold),
    });
  }
}
if (!items.length) {
  console.error(`No hold captures under ${OUT} - run the eval first (bench:lite / bench:spike).`);
  process.exit(1);
}

// ── Collect the house references (hold stills preferred, any .png as fallback) ─
let houseFiles = await findFiles(HOUSE, (name) => name.endsWith('-hold.png'));
if (!houseFiles.length) houseFiles = await findFiles(HOUSE, (name) => name.endsWith('.png'));
const house = houseFiles.map((rel) => ({ id: rel.replaceAll('\\', '/'), file: path.join(HOUSE, rel) }));
console.log(`${items.length} hold capture(s) under ${OUT}; ${house.length} house reference(s) under ${HOUSE}.`);

// ── Rasterize every capture to a 32x32 RGB vector in a headless page ─────────
const browser = await chromium.launch();
const page = await browser.newPage();
async function vectorOf(file) {
  const dataUrl = `data:image/png;base64,${(await readFile(file)).toString('base64')}`;
  return page.evaluate(async (src) => {
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error('image failed to decode'));
      img.src = src;
    });
    const SIZE = 32;
    const canvas = document.createElement('canvas');
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, SIZE, SIZE);
    const data = ctx.getImageData(0, 0, SIZE, SIZE).data;
    const vector = [];
    for (let i = 0; i < data.length; i += 4) {
      vector.push(data[i] / 255, data[i + 1] / 255, data[i + 2] / 255);
    }
    return vector;
  }, dataUrl);
}
for (const item of items) item.vector = await vectorOf(item.file);
for (const ref of house) ref.vector = await vectorOf(ref.file);
await browser.close();

// ── Summaries per candidate label ────────────────────────────────────────────
const labels = [...new Set(items.map((item) => item.label))];
const summary = [];
for (const label of labels) {
  const own = items.filter((item) => item.label === label);
  const pairwise = pairwiseSummary(own.map((item) => ({ id: item.shortId, vector: item.vector })));
  const houseDistances = house.length
    ? own.map((item) => ({
        id: item.shortId,
        skinApplied: item.skinApplied,
        nearest: nearestReference(item.vector, house),
      }))
    : null;
  summary.push({
    label,
    items: own.length,
    pairwise,
    ...(houseDistances
      ? {
          houseReferenceDir: HOUSE,
          houseDistances,
          minHouseDistance: Math.min(...houseDistances.map((d) => d.nearest.distance)),
        }
      : {}),
  });
}

// ── Print + persist ──────────────────────────────────────────────────────────
const fmt = (x) => (x * 100).toFixed(2);
console.log('\nlabel | items | mean pair dist | MIN pair dist (the tripwire) | most-similar pair');
for (const s of summary) {
  if (s.pairwise) {
    console.log(`${s.label} | ${s.items} | ${fmt(s.pairwise.mean)} | ${fmt(s.pairwise.min)} | ${s.pairwise.minPair.join(' ~ ')}`);
  } else {
    console.log(`${s.label} | ${s.items} | - | - | (fewer than two items)`);
  }
  if (s.houseDistances) {
    for (const d of s.houseDistances) {
      console.log(`  ${d.id}${d.skinApplied ? ' [skinned]' : ''}: nearest house look ${d.nearest.id} at ${fmt(d.nearest.distance)}`);
    }
  }
}
console.log('\nDistances are mean |RGB| deltas x100 over 32x32 rasters sharing one stage background -');
console.log('compare them against each other within one capture setup, never as absolute percentages.');

await writeFile(
  path.join(OUT, 'sameness.json'),
  JSON.stringify({ generatedAt: new Date().toISOString(), outDir: OUT, houseReferenceDir: house.length ? HOUSE : null, summary }, null, 2),
  'utf8',
);
console.log(`Wrote ${path.join(OUT, 'sameness.json')}`);
