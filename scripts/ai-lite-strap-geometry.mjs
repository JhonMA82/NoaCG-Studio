// Measure the rendered graphic's bounding box in every judged hold frame of a bench run.
//
//   node scripts/ai-lite-strap-geometry.mjs <out-dir>
//
// This is the instrument behind docs/AI_LITE_BENCHMARK.md 6e's aspect-ratio numbers: the
// judge's strapShape axis kept calling straps 'a small box', and the only way to know
// whether it was right was to measure what was actually rendered. Free, no model calls.
//
// The preview background is the SAME gradient in every capture, so a per-pixel median
// across many frames reconstructs a clean background plate; anything that differs from it
// by more than a threshold is graphic. Works for bright skins and for black brutalist
// panels alike, which a simple brightness test would not.
//
// Output: aspect ratio (w/h) and frame coverage per row, so "the judge called it a box"
// can be checked against what is actually there.

import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const OUT = process.argv[2];
const SCALE = 4; // 1920x1080 -> 480x270; ample for an aspect ratio

const rows = [];
const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'review-assets') walk(p); continue; }
    if (!e.name.endsWith('-metrics.json')) continue;
    const m = JSON.parse(fs.readFileSync(p, 'utf8'));
    for (const r of m.rows ?? []) {
      if (r.judgeVerdict !== 'pass' && r.judgeVerdict !== 'fail') continue;
      const frame = path.join(path.dirname(p), r.phaseFiles?.hold ?? '');
      if (!r.phaseFiles?.hold || !fs.existsSync(frame)) continue;
      rows.push({
        round: m.candidate.replace('skin-gemini-flash-lite', 'r').replace(/^r-/, 'r'),
        run: path.basename(path.dirname(p)),
        fixture: r.fixtureId.replace('skin-', ''),
        verdict: r.judgeVerdict,
        s: r.judgeScores,
        reason: r.judgeReason ?? '',
        dataUrl: `data:image/png;base64,${fs.readFileSync(frame).toString('base64')}`,
      });
    }
  }
};
walk(OUT);

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto('data:text/html,<canvas id=c></canvas>');

const measured = await page.evaluate(async ({ items, scale }) => {
  const load = (src) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.src = src; });
  const c = document.getElementById('c');
  const ctx = c.getContext('2d', { willReadFrequently: true });
  const W = Math.round(1920 / scale), H = Math.round(1080 / scale);
  c.width = W; c.height = H;

  const pixels = [];
  for (const it of items) {
    const img = await load(it.dataUrl);
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(img, 0, 0, W, H);
    pixels.push(ctx.getImageData(0, 0, W, H).data);
  }

  // Per-pixel median across frames = the clean background plate.
  const n = pixels.length, bg = new Uint8ClampedArray(W * H * 4);
  const buf = new Array(n);
  for (let p = 0; p < W * H * 4; p += 4) {
    for (let ch = 0; ch < 3; ch++) {
      for (let i = 0; i < n; i++) buf[i] = pixels[i][p + ch];
      buf.length = n; buf.sort((a, b) => a - b);
      bg[p + ch] = buf[n >> 1];
    }
  }

  const out = [];
  for (let i = 0; i < n; i++) {
    const d = pixels[i];
    let minX = W, minY = H, maxX = -1, maxY = -1, count = 0;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const p = (y * W + x) * 4;
        const diff = Math.abs(d[p] - bg[p]) + Math.abs(d[p + 1] - bg[p + 1]) + Math.abs(d[p + 2] - bg[p + 2]);
        if (diff <= 24) continue; // tolerance for gradient noise / compression
        count++;
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
    out.push(maxX < 0
      ? { empty: true }
      : { w: (maxX - minX + 1) * scale, h: (maxY - minY + 1) * scale, top: minY * scale, left: minX * scale, px: count });
  }
  return out;
}, { items: rows.map((r) => ({ dataUrl: r.dataUrl })), scale: SCALE });

await browser.close();

const SMALL = /small|box|badge|block|squat|narrow|not a (wide )?strap|too small|unstraplike|more of a box/i;
console.log('fixture           round run  verdict S  ratio  w x h        %frame  judge said "small/box"?');
const flagged = [];
for (let i = 0; i < rows.length; i++) {
  const r = rows[i], m = measured[i];
  if (m.empty) { console.log(`${r.fixture.padEnd(17)} ${r.round.padEnd(4)} ${r.run} ${r.verdict.padEnd(4)} S${r.s.strapShape}  EMPTY FRAME`); continue; }
  const ratio = m.w / m.h;
  const says = SMALL.test(r.reason);
  if (says) flagged.push({ r, m, ratio });
  console.log(
    `${r.fixture.padEnd(17)} ${r.round.padEnd(4)} ${r.run} ${r.verdict.padEnd(4)} S${r.s.strapShape}`
    + `  ${ratio.toFixed(1).padStart(5)}:1 ${String(m.w).padStart(4)}x${String(m.h).padStart(4)}`
    + `  ${((m.w / 1920) * 100).toFixed(0).padStart(3)}%   ${says ? 'YES' : ''}`,
  );
}

console.log(`\n=== ${flagged.length} rows whose stated reason calls the graphic small/box-like ===`);
const wide = flagged.filter((f) => f.ratio >= 3);
console.log(`of those, ${wide.length} are actually at least 3:1 (a strap by proportion):`);
for (const f of wide) {
  console.log(`  ${f.r.fixture} ${f.r.round}/${f.r.run}  ${f.ratio.toFixed(1)}:1  S${f.r.s.strapShape}  "${f.r.reason.slice(0, 90)}"`);
}
const ratios = measured.filter((m) => !m.empty).map((m) => m.w / m.h).sort((a, b) => a - b);
console.log(`\nAll judged frames: median ratio ${ratios[ratios.length >> 1].toFixed(1)}:1,`
  + ` min ${ratios[0].toFixed(1)}:1, max ${ratios[ratios.length - 1].toFixed(1)}:1`);
