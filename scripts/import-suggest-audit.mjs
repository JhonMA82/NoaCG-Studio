// Does automatic field placement actually cover the designs students import - and where would
// an AI analysis add anything a free measurement cannot?
//
// The honest limit, stated first: these ten designs are AUTHORED HERE, by the same session that
// wrote the detector, so this is a LOWER BOUND on difficulty, not a sample of reality. Two
// things keep it from being circular. The design vocabulary comes from
// docs/LOWER_THIRDS_REFERENCE_CORPUS.md §3.4 - the device inventory measured off real
// professional packs (split name, accent block behind a word, hairline rule, bracket corners,
// skewed panel, and above all §4's finding that MOST professional lower thirds have no panel at
// all) - rather than from what the detector happens to like. And every design's intended text
// box is declared BEFORE the run, in the fixture itself, so the score cannot be rationalised
// afterwards.
//
// Each design is rendered TWICE, because the two exports are different questions:
//   - `clean`  - the design as a student is told to export it, with the words left out. This is
//                the input the flow is built for.
//   - `baked`  - the same design with the words drawn in, which is what students actually send
//                when nobody told them otherwise.
//
// Spends NO tokens. The dev server must be running (scripts/dev-port.mjs).
//   node scripts/import-suggest-audit.mjs [--out DIR]
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { devPort } from './dev-port.mjs';

const args = process.argv.slice(2);
const outAt = args.indexOf('--out');
const OUT = path.resolve(outAt >= 0 ? args[outAt + 1] : './import-audit-out');

/**
 * The fixtures. Each draws itself on a 1920x1080 canvas and declares `intent`: where the NAME
 * line is meant to sit and how big it is meant to be. `panel` records whether the design has a
 * backplate at all - the axis the corpus says splits the family in half.
 */
const FIXTURES = `[
  {
    id: 'p1-solid-strap',
    label: 'Solid strap, left aligned (the classic)',
    panel: true,
    intent: { x: 150, y: 800, w: 700, h: 60, size: 56 },
    draw: (g) => {
      g.fillStyle = '#101b2e'; g.fillRect(120, 760, 900, 190);
    },
  },
  {
    id: 'p2-strap-accent',
    label: 'Solid strap with an accent bar',
    panel: true,
    intent: { x: 170, y: 800, w: 700, h: 60, size: 56 },
    draw: (g) => {
      g.fillStyle = '#14243d'; g.fillRect(120, 760, 940, 190);
      g.fillStyle = '#f6a623'; g.fillRect(120, 760, 14, 190);
    },
  },
  {
    id: 'p3-translucent-over-photo',
    label: 'Translucent panel over footage',
    panel: true,
    intent: { x: 190, y: 805, w: 700, h: 60, size: 54 },
    draw: (g) => {
      // Stand-in footage: a graded gradient plus coarse noise.
      const bg = g.createLinearGradient(0, 0, 1920, 1080);
      bg.addColorStop(0, '#20303f'); bg.addColorStop(1, '#0b1116');
      g.fillStyle = bg; g.fillRect(0, 0, 1920, 1080);
      for (let i = 0; i < 5000; i++) {
        g.fillStyle = 'rgba(255,255,255,' + (0.01 + (i % 7) * 0.004) + ')';
        g.fillRect((i * 97) % 1920, (i * 181) % 1080, 3, 3);
      }
      g.fillStyle = 'rgba(8,14,22,0.72)'; g.fillRect(150, 770, 900, 180);
    },
  },
  {
    id: 'p4-gradient-panel',
    label: 'Gradient panel, fading out to the right',
    panel: true,
    intent: { x: 170, y: 800, w: 700, h: 60, size: 56 },
    draw: (g) => {
      const grad = g.createLinearGradient(120, 0, 1200, 0);
      grad.addColorStop(0, 'rgba(10,16,28,0.95)'); grad.addColorStop(1, 'rgba(10,16,28,0)');
      g.fillStyle = grad; g.fillRect(120, 760, 1080, 190);
    },
  },
  {
    id: 'p5-strap-plus-chip',
    label: 'Rounded strap with a separate LIVE chip',
    panel: true,
    intent: { x: 180, y: 805, w: 640, h: 58, size: 54 },
    draw: (g) => {
      g.fillStyle = '#171c26';
      g.beginPath(); g.roundRect(140, 770, 860, 175, 12); g.fill();
      g.fillStyle = '#c0392b';
      g.beginPath(); g.roundRect(140, 700, 150, 52, 6); g.fill();
    },
  },
  {
    id: 'n1-rule-only',
    label: 'Bare type over footage: a hairline rule, no panel',
    panel: false,
    intent: { x: 160, y: 790, w: 700, h: 60, size: 56 },
    draw: (g) => {
      g.fillStyle = '#e8eaee'; g.fillRect(160, 880, 420, 3);
      g.fillStyle = '#f6a623'; g.fillRect(160, 880, 90, 3);
    },
  },
  {
    id: 'n2-nothing-at-all',
    label: 'Bare type, no furniture whatsoever (clean export is an empty frame)',
    panel: false,
    intent: { x: 160, y: 790, w: 700, h: 60, size: 56 },
    draw: () => {},
  },
  {
    id: 'n3-split-name-block',
    label: 'Split name with an accent block behind one word (the corpus device)',
    panel: false,
    intent: { x: 165, y: 795, w: 620, h: 64, size: 60 },
    draw: (g) => {
      g.fillStyle = '#f6a623'; g.fillRect(160, 790, 250, 74);
    },
  },
  {
    id: 'd1-duo-strap',
    label: 'Two-person strap: one panel, two text zones',
    panel: true,
    intent: { x: 170, y: 800, w: 380, h: 56, size: 48 },
    draw: (g) => {
      g.fillStyle = '#101b2e'; g.fillRect(120, 760, 1180, 190);
      g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(710, 790, 2, 130);
    },
  },
  {
    id: 'f1-centred-title',
    label: 'Full-frame title card, centred panel',
    panel: true,
    intent: { x: 560, y: 470, w: 800, h: 90, size: 80 },
    draw: (g) => {
      g.fillStyle = '#0b0f16'; g.fillRect(0, 0, 1920, 1080);
      g.fillStyle = '#161d2a'; g.fillRect(480, 400, 960, 280);
    },
  },
]`;

const RENDER = `async (fixturesSrc, baked) => {
  const fixtures = eval(fixturesSrc);
  const out = [];
  for (const f of fixtures) {
    const c = document.createElement('canvas');
    c.width = 1920; c.height = 1080;
    const g = c.getContext('2d');
    g.clearRect(0, 0, 1920, 1080);
    f.draw(g);
    if (baked) {
      // The words drawn INTO the file, at the position the design intends.
      g.fillStyle = '#ffffff';
      g.textBaseline = 'top';
      g.font = '700 ' + f.intent.size + 'px sans-serif';
      g.fillText('Alexandra Riva', f.intent.x, f.intent.y);
      g.font = '400 ' + Math.round(f.intent.size * 0.55) + 'px sans-serif';
      g.fillText('Correspondent', f.intent.x, f.intent.y + Math.round(f.intent.size * 1.25));
    }
    out.push({ id: f.id, label: f.label, panel: f.panel, intent: f.intent, data: c.toDataURL('image/png') });
  }
  return out;
}`;

const SUGGEST = `async (images) => {
  const { suggestFieldsForArtwork } = await import('/src/assets/suggestFields.ts');
  const results = [];
  for (const img of images) {
    const r = await suggestFieldsForArtwork(img.data, 1920, 1080);
    results.push({ id: img.id, refusal: r.refusal, plate: r.plate, fields: r.fields });
  }
  return results;
}`;

/**
 * The OTHER free path, and the one that actually owns baked-in text: the Prepare step's
 * erase. The user drags a rectangle over the words; this simulates that with a generous box
 * around the intended text, then reports what the erase MEASURED - whether it judged the
 * background flat enough to fill, and how many lines of ink it found to seed fields from.
 * Without this column the audit would compare AI against the wrong half of the product.
 */
const ERASE = `async (images) => {
  const { eraseRegionFlat } = await import('/src/assets/eraseRegion.ts');
  const out = [];
  for (const img of images) {
    const i = img.intent;
    // A loose lasso, as a person draws: the two lines plus room around them.
    const rect = {
      x: Math.max(0, i.x - 20),
      y: Math.max(0, i.y - 12),
      width: i.w + 40,
      height: Math.round(i.size * 2.2) + 24,
    };
    try {
      const r = await eraseRegionFlat(img.data, rect);
      out.push({ id: img.id, uniform: r.sampling.uniform, lines: r.ink ? r.ink.lines.length : 0 });
    } catch (e) {
      out.push({ id: img.id, uniform: false, lines: 0, error: String(e && e.message || e) });
    }
  }
  return out;
}`;

const port = devPort();
const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('[pageerror]', e.message));
await page.goto(`http://localhost:${port}/app`, { waitUntil: 'domcontentloaded' });

await mkdir(path.join(OUT, 'art'), { recursive: true });

/** PRE-REGISTERED scoring.
 *  HIT  = a Name field was proposed whose ANCHOR is within one line-height of the intended
 *         anchor on BOTH axes, and whose size is within +/-40% of the intended size.
 *  MISS = fields were proposed and the first one is not that.
 *  NONE = it refused, and said why.
 *
 *  The x tolerance was the intended text WIDTH in the first pass, which is not a criterion at
 *  all: a field parked in the empty half of a strap, past the words it is meant to replace,
 *  scored the same as one on the words. One line-height is what "where the design intends"
 *  can defensibly mean. Recorded rather than quietly changed - it moved four verdicts. */
function score(intent, result) {
  if (!result.fields || result.fields.length === 0) return { verdict: 'NONE', why: result.refusal };
  const f = result.fields[0];
  const pad = intent.size;
  const inside = Math.abs(f.x - intent.x) <= pad && Math.abs(f.y - intent.y) <= pad;
  const sizeOk = f.fontSize >= intent.size * 0.6 && f.fontSize <= intent.size * 1.4;
  return {
    verdict: inside && sizeOk ? 'HIT' : 'MISS',
    why: `proposed ${f.fontSize}px at ${f.x},${f.y} · intended ~${intent.size}px at ${intent.x},${intent.y}`
      + (inside ? '' : ' · OUTSIDE the intended box') + (sizeOk ? '' : ' · size off'),
  };
}

const rows = [];
for (const baked of [false, true]) {
  const rendered = await page.evaluate(
    async ({ renderSrc, fixturesSrc, b }) => {
      const fn = (0, eval)('(' + renderSrc + ')');
      return fn(fixturesSrc, b);
    },
    { renderSrc: RENDER, fixturesSrc: FIXTURES, b: baked },
  );
  const results = await page.evaluate(
    async ({ suggestSrc, imgs }) => {
      const fn = (0, eval)('(' + suggestSrc + ')');
      return fn(imgs);
    },
    { suggestSrc: SUGGEST, imgs: rendered },
  );
  // Only the baked variant has anything to erase.
  const erased = baked
    ? await page.evaluate(
        async ({ eraseSrc, imgs }) => {
          const fn = (0, eval)('(' + eraseSrc + ')');
          return fn(imgs);
        },
        { eraseSrc: ERASE, imgs: rendered },
      )
    : [];
  for (const img of rendered) {
    const result = results.find((r) => r.id === img.id);
    const s = score(img.intent, result);
    const e = erased.find((x) => x.id === img.id);
    rows.push({
      variant: baked ? 'baked' : 'clean',
      ...s,
      erase: e ? (e.uniform ? `flat, ${e.lines} line(s)` : `NOT flat, ${e.lines} line(s)`) : null,
      id: img.id,
      label: img.label,
      panel: img.panel,
    });
    await writeFile(
      path.join(OUT, 'art', `${img.id}-${baked ? 'baked' : 'clean'}.png`),
      Buffer.from(img.data.split(',')[1], 'base64'),
    );
  }
}

await browser.close();

const pad = (s, n) => String(s).padEnd(n);
console.log(
  '\n' + pad('design', 30) + pad('panel', 7) + pad('clean: suggest', 16) + pad('baked: suggest', 16) + 'baked: erase',
);
console.log('-'.repeat(30 + 7 + 16 + 16 + 22));
const ids = [...new Set(rows.map((r) => r.id))];
for (const id of ids) {
  const clean = rows.find((r) => r.id === id && r.variant === 'clean');
  const baked = rows.find((r) => r.id === id && r.variant === 'baked');
  console.log(
    pad(id, 30) + pad(clean.panel ? 'yes' : 'no', 7) + pad(clean.verdict, 16) + pad(baked.verdict, 16) + (baked.erase ?? ''),
  );
}
const tally = (v, variant) => rows.filter((r) => r.verdict === v && r.variant === variant).length;
console.log('\nclean exports: ' + tally('HIT', 'clean') + ' hit, ' + tally('MISS', 'clean') + ' miss, ' + tally('NONE', 'clean') + ' refused (of ' + ids.length + ')');
console.log('baked exports: ' + tally('HIT', 'baked') + ' hit, ' + tally('MISS', 'baked') + ' miss, ' + tally('NONE', 'baked') + ' refused (of ' + ids.length + ')');
console.log('\nper-design detail:');
for (const r of rows) console.log(`  [${r.variant}] ${r.id}: ${r.verdict} - ${r.why ?? ''}`);

await writeFile(path.join(OUT, 'audit.json'), JSON.stringify(rows, null, 1), 'utf8');
console.log(`\nArtwork + audit.json written to ${OUT}`);
