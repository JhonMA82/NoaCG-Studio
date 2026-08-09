// Render the pilot's REFERENCE fixtures - the pictures four briefs in the bank have always
// claimed were attached and never were.
//
//   node scripts/creative-reference-fixtures.mjs [out-dir]
//
// They are SYNTHESISED HERE rather than collected, for two reasons that both matter:
//
//   - Licence. Real broadcast graphics belong to whoever made them. `spx_examples/` is
//     gitignored and licence-restricted for exactly that reason, and a bench fixture that
//     cannot be committed is a bench nobody else can reproduce.
//   - Anti-anchoring (§4). A mood board is not a design: it carries colour, texture and weight
//     and NO composition, so following it closely cannot make every result look like one
//     graphic. A real graphic used as a "mood" reference would smuggle a layout in, which is
//     the failure this rule exists to prevent - and it would make the experiment unreadable,
//     because a good result could mean "the reference pipeline works" or "it copied the
//     picture".
//
// So these are honest instruments: each one carries the ONE property its brief names and
// nothing else. A plate is a busy picture to survive; a mood board is a palette and a texture.

import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { outDir } from './out-dir.mjs';

const OUT = path.resolve(outDir(process.argv[2], './benchmarks/creative/v1/references', 'Usage: node scripts/creative-reference-fixtures.mjs [out-dir]'));

/** Each fixture: the brief that attaches it, its declared purpose, and the picture. */
const FIXTURES = [
  {
    file: 'mood-warm-editorial.png',
    use: 'mood',
    for: 'lt-mood-board',
    // "warm, editorial, papery" - the brief's own words, as colour and texture only.
    html: `<div style="width:1280px;height:800px;display:grid;grid-template-columns:repeat(6,1fr);
      grid-template-rows:repeat(4,1fr);background:#efe7db;font-family:Georgia,serif">
      ${['#efe7db', '#e3d5c0', '#c8ab86', '#8c6a4a', '#5a4632', '#2f2620']
        .map((c) => `<div style="background:${c}"></div>`).join('')}
      <div style="grid-column:1/4;grid-row:2/4;background:#efe7db;position:relative">
        <div style="position:absolute;inset:14% 12%;background:
          repeating-linear-gradient(0deg,#00000010 0 1px,transparent 1px 7px)"></div>
      </div>
      <div style="grid-column:4/7;grid-row:2/3;background:#8c6a4a"></div>
      <div style="grid-column:4/7;grid-row:3/4;background:#e3d5c0;position:relative">
        <div style="position:absolute;left:8%;top:30%;width:46%;height:3px;background:#5a4632"></div>
      </div>
      <div style="grid-column:1/7;grid-row:4/5;background:
        linear-gradient(90deg,#2f2620,#8c6a4a 45%,#e3d5c0)"></div>
    </div>`,
  },
  {
    file: 'plate-concert-stage.png',
    use: 'plate',
    for: 'lt-busy-plate',
    // "bright, busy stage" - hot lights upper-centre, crowd darkness lower-left.
    html: `<div style="width:1280px;height:720px;position:relative;background:#0a0a12;overflow:hidden">
      <div style="position:absolute;inset:0;background:
        radial-gradient(circle at 50% 18%,#fff6d0 0%,#ffb020 12%,#c2410c 26%,transparent 52%)"></div>
      <div style="position:absolute;inset:0;background:
        radial-gradient(circle at 22% 30%,#22d3ee55,transparent 34%),
        radial-gradient(circle at 78% 26%,#a855f755,transparent 34%)"></div>
      ${Array.from({ length: 14 }, (_, i) =>
        `<div style="position:absolute;left:${4 + i * 7}%;bottom:0;width:5%;height:${18 + ((i * 37) % 26)}%;
          background:#05050a;border-radius:40% 40% 0 0"></div>`).join('')}
      <div style="position:absolute;inset:auto 0 0 0;height:34%;background:
        linear-gradient(180deg,transparent,#000000cc)"></div>
    </div>`,
  },
  {
    file: 'mood-fight-poster.png',
    use: 'mood',
    for: 'vs-transform-ref',
    // "the palette and typography VOICE of the attached poster" - so the fixture carries a
    // palette and a voice and deliberately no match-up composition. Handing it a real poster
    // layout would answer the brief's own question for it: the brief asks for a NEW
    // composition built from an old palette, and it can only be read if the reference has no
    // composition to lift.
    html: `<div style="width:1000px;height:1400px;background:#0b0407;position:relative;
      font-family:'Arial Black',Impact,sans-serif;overflow:hidden">
      <div style="position:absolute;inset:0;background:
        radial-gradient(circle at 50% 30%,#7f1d1d,#3b0a0a 45%,#0b0407 75%)"></div>
      <div style="position:absolute;left:0;top:34%;width:100%;height:6px;background:#d4af37"></div>
      <div style="position:absolute;left:0;top:62%;width:100%;height:2px;background:#d4af3766"></div>
      <div style="position:absolute;left:6%;top:40%;color:#f5e6c8;font-size:150px;letter-spacing:-4px">TITLE</div>
      <div style="position:absolute;left:6%;top:56%;color:#d4af37;font-size:44px;letter-spacing:14px">NIGHT</div>
      <div style="position:absolute;left:6%;bottom:8%;color:#8a7355;font-size:26px;letter-spacing:6px">
        HEAVY CONDENSED CAPS · GOLD ON OXBLOOD</div>
    </div>`,
  },
  {
    file: 'plate-arena-wide.png',
    use: 'plate',
    for: 'vs-plate',
    // "busy arena wide shot" - bright pitch across the middle, dark crowd top and bottom.
    html: `<div style="width:1280px;height:720px;position:relative;background:#0d1117;overflow:hidden">
      <div style="position:absolute;inset:28% 0 22% 0;background:
        linear-gradient(180deg,#2f6b34,#3f8b45 40%,#2a5f30)"></div>
      ${Array.from({ length: 9 }, (_, i) =>
        `<div style="position:absolute;left:${i * 11.5}%;top:28%;width:2px;height:50%;background:#ffffff30"></div>`).join('')}
      <div style="position:absolute;inset:0 0 78% 0;background:
        repeating-linear-gradient(90deg,#1b2430 0 6px,#2a3546 6px 12px)"></div>
      <div style="position:absolute;inset:78% 0 0 0;background:
        repeating-linear-gradient(90deg,#161d27 0 6px,#232d3c 6px 12px)"></div>
      <div style="position:absolute;inset:0;background:
        radial-gradient(ellipse at 50% 45%,#ffffff22,transparent 60%)"></div>
    </div>`,
  },
];

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const manifest = [];
for (const fx of FIXTURES) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.setContent(`<body style="margin:0">${fx.html}</body>`);
  const el = await page.$('body > div');
  const buf = await el.screenshot();
  writeFileSync(path.join(OUT, fx.file), buf);
  await page.close();
  manifest.push({ file: fx.file, use: fx.use, for: fx.for, bytes: buf.length });
  console.log(`  ${fx.file}  (${fx.use}, for ${fx.for}) - ${(buf.length / 1024).toFixed(0)} kB`);
}
await browser.close();
writeFileSync(path.join(OUT, 'manifest.json'), `${JSON.stringify({ version: 1, fixtures: manifest }, null, 2)}\n`);
console.log(`\n${manifest.length} fixture(s) -> ${OUT}`);
console.log('These are OUR synthetic references: committable, and carrying no composition to copy.');
