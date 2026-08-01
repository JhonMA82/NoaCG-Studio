// PLATE VISIBILITY - the measured half of the backdrop ruling (owner, 2026-07-31;
// benchmarks/creative/v1/SMOKE-2026-07-31.md item 5, -vs-lt.md item 4).
//
//   node scripts/creative-plate-visibility.mjs <dir> [--house=<catalog-refs dir>] \
//     [--group=<lower-third|versus|…>] [--json=path]
//
// The question: how much of the video underneath does this graphic leave visible?
//
// A broadcast graphic renders transparent, and the pilot rig composites every hold frame over
// one KNOWN plate (scripts/creative-plate.mjs). So the plate is a measuring instrument: render
// it alone, compare it against each captured frame, and the fraction of pixels that still match
// is the fraction of the picture the graphic did not take. A lower third leaves most of it; a
// full-frame board takes most of it; the frame-flood defect takes ALL of it.
//
// WHY THIS EXISTS AS A MEASUREMENT AND NOT A GATE. The owner ruling splits the question by what
// the spec declared. An OVERLAY covering the canvas is never what was asked for, so that is a
// deterministic refusal in the style gate (src/ai/creative/style.ts stripFrameFlood) and never
// reaches here. A FULL-FRAME board covering the canvas is the job - a results board that fills
// the screen is correct - so there is no honest fixed threshold, and this reports the number
// instead. The floor is CALIBRATED, exactly like criterion 6's copy line: pass --house with the
// catalog reference frames (scripts/creative-catalog-refs.mjs) and the run prints what the
// catalog's own full-frame designs leave visible. A CREATE result below the quietest catalog
// design is covering more than any shipped broadcast graphic does.
//
// THE FLOOR IS PER CATEGORY, and that is not a detail. Calibrated over the lower-third and
// versus references together, the catalog's minimum is 0.0% - vs02 is a full-frame match-up
// that legitimately covers every pixel - and a floor of zero excuses every flood there is. A
// placement class is exactly what this measures, so mixing two of them into one number
// destroys it. The references are grouped by the category in their filename
// (scripts/creative-catalog-refs.mjs writes `<category>-<id>-hold.png`).
//
// IT READS BOTH ENDS. 100.0% plate visible is not a well-behaved overlay: it is a frame the
// graphic never painted at all. That is the empty-capture failure the bracket round saw, and
// against a deterministic plate it is exact rather than approximate - a frame pixel-identical
// to the bare plate rendered NOTHING, which no amount of squinting at a dark PNG will tell you.
//
// FREE - no model calls, no network, no dev server. It reads PNGs already on disk, so it runs
// over an archived round as happily as a fresh one.

import { chromium } from '@playwright/test';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { PLATE_CSS, PLATE_SIZE } from './creative-plate.mjs';

const ARGS = process.argv.slice(2);
const flag = (name) => ARGS.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
const DIR = path.resolve(ARGS.find((a) => !a.startsWith('--')) || './creative-pilot-out');
const HOUSE = flag('house') ? path.resolve(flag('house')) : null;
const GROUP = flag('group') ?? '';
const JSON_OUT = flag('json') ? path.resolve(flag('json')) : path.join(DIR, 'plate-visibility.json');

/** A pixel counts as PLATE when every channel is within this of the reference. The plate is a
 *  deterministic gradient rendered at the same size, so untouched pixels match exactly; the
 *  tolerance covers the PNG round-trip and a graphic's own antialiased edges. */
const TOLERANCE = 6;

async function findPngs(root) {
  const out = [];
  const walk = async (dir) => {
    let entries;
    try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.name.endsWith('.png')) out.push(full);
    }
  };
  await walk(root);
  return out.sort();
}

const frames = await findPngs(DIR);
if (!frames.length) {
  console.error(`No .png frames under ${DIR}.`);
  process.exit(1);
}
const houseFrames = HOUSE ? await findPngs(HOUSE) : [];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: PLATE_SIZE });

// The reference: the same plate, alone, at the same size the rig captured at.
await page.setContent(
  `<body style="margin:0;width:${PLATE_SIZE.width}px;height:${PLATE_SIZE.height}px;background:${PLATE_CSS}"></body>`,
);
const plateShot = (await page.screenshot()).toString('base64');

await page.evaluate(async ({ src, size }) => {
  const decode = async (dataUrl) => {
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error('image failed to decode'));
      img.src = dataUrl;
    });
    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, size.width, size.height);
    return ctx.getImageData(0, 0, size.width, size.height).data;
  };
  window.__decode = decode;
  window.__plate = await decode(src);
}, { src: `data:image/png;base64,${plateShot}`, size: PLATE_SIZE });

/** Fraction of the frame still showing the plate, plus the fraction that is FULLY covered by
 *  something opaque enough to differ from it everywhere - the flood signature. */
async function plateVisibility(file) {
  const dataUrl = `data:image/png;base64,${(await readFile(file)).toString('base64')}`;
  return page.evaluate(async ({ src, tolerance }) => {
    const shot = await window.__decode(src);
    const plate = window.__plate;
    let visible = 0;
    const total = shot.length / 4;
    for (let i = 0; i < shot.length; i += 4) {
      if (
        Math.abs(shot[i] - plate[i]) <= tolerance &&
        Math.abs(shot[i + 1] - plate[i + 1]) <= tolerance &&
        Math.abs(shot[i + 2] - plate[i + 2]) <= tolerance
      ) visible += 1;
    }
    return visible / total;
  }, { src: dataUrl, tolerance: TOLERANCE });
}

const rows = [];
for (const file of frames) {
  rows.push({ file: path.relative(DIR, file).replaceAll('\\', '/'), plateVisible: await plateVisibility(file) });
}
const houseRows = [];
for (const file of houseFrames) {
  houseRows.push({ file: path.relative(HOUSE, file).replaceAll('\\', '/'), plateVisible: await plateVisibility(file) });
}
await browser.close();

// Below 1% the first decimal hides the whole question: a catalog full-frame design leaves a
// few antialiased pixels of plate (0.003%) and a flooded CREATE result leaves exactly none, and
// rounding both to "0.0%" prints frames sitting BELOW a floor of 0.0%, which reads as a broken
// report rather than as the honest answer that coverage does not discriminate here at all.
const pct = (n) => `${(n * 100).toFixed(n > 0 && n < 0.01 ? 3 : 1)}%`;
const quantile = (values, q) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(q * (sorted.length - 1)))];
};

/** The category a reference frame belongs to: `lower-third-lt11-hold.png` -> `lower-third`.
 *  Trailing id and suffix only - the category itself contains hyphens. */
const groupOf = (file) => path.basename(file).replace(/-[^-]+-hold\.png$/, '');

const groups = {};
for (const row of houseRows) {
  const group = groupOf(row.file);
  (groups[group] ??= []).push(row);
}
const calibration = Object.fromEntries(Object.entries(groups).map(([group, groupRows]) => {
  const values = groupRows.map((r) => r.plateVisible);
  return [group, {
    frames: groupRows.length,
    min: Math.min(...values),
    p10: quantile(values, 0.1),
    median: quantile(values, 0.5),
    quietest: groupRows.reduce((a, b) => (a.plateVisible <= b.plateVisible ? a : b)).file,
  }];
}));

const groupNames = Object.keys(calibration);
const applied = GROUP || (groupNames.length === 1 ? groupNames[0] : '');
const floor = applied ? calibration[applied]?.min ?? null : null;

if (groupNames.length) {
  for (const [group, cal] of Object.entries(calibration)) {
    console.log(
      `${group}: ${cal.frames} reference frame(s) - min ${pct(cal.min)} (${cal.quietest}), ` +
      `p10 ${pct(cal.p10)}, median ${pct(cal.median)}${group === applied ? '   ← the floor applied below' : ''}`,
    );
  }
  if (!applied) {
    console.log(
      `\nSeveral categories present and no --group given, so no floor is applied. ` +
      `Pass --group=<${groupNames.join('|')}>: an overlay floor and a full-frame floor are ` +
      `different measurements and one number over both means nothing.`,
    );
  }
  console.log('');
} else {
  console.log('No --house references given - reporting raw coverage with no calibrated floor.\n');
}

rows.sort((a, b) => a.plateVisible - b.plateVisible);
for (const row of rows) {
  const note = row.plateVisible === 1
    ? '   ← NOTHING PAINTED (pixel-identical to the bare plate)'
    : floor !== null && row.plateVisible < floor ? `   ← below the ${applied} floor` : '';
  console.log(`${pct(row.plateVisible).padStart(7)} plate visible  ${row.file}${note}`);
}

const below = floor !== null ? rows.filter((r) => r.plateVisible < floor) : [];
const empty = rows.filter((r) => r.plateVisible === 1);
if (floor !== null) console.log(`\n${below.length}/${rows.length} frame(s) below the ${applied} floor of ${pct(floor)}.`);
if (empty.length) console.log(`${empty.length}/${rows.length} frame(s) painted NOTHING - those measure the entrance, not the design.`);
await writeFile(JSON_OUT, JSON.stringify(
  { tolerance: TOLERANCE, plate: PLATE_CSS, appliedGroup: applied || null, floor, calibration, rows },
  null,
  2,
));
console.log(`Wrote ${path.relative(process.cwd(), JSON_OUT)}.`);
console.log('This is a MEASUREMENT, not a gate: an overlay that floods is refused deterministically in the style gate; a board that covers is the job.');
