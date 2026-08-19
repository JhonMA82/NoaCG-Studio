#!/usr/bin/env node
// THE RECREATE RUNNER - a folder of finished graphic PICTURES in, NoaCG templates out
// (src/ai/spike/recreate.ts; the customer ask behind it: "import my PNGs, give me the same
// graphic with editable fields, playable in the productions").
//
//   node scripts/import-recreate-spike.mjs --control                # FREE. Run FIRST: renders
//                                                                   # two catalog designs as
//                                                                   # ground-truth references,
//                                                                   # proves capture, the
//                                                                   # similarity read and its
//                                                                   # mutation direction with
//                                                                   # no model call.
//   node scripts/import-recreate-spike.mjs --generate --route=vercel:google/gemini-3.7-flash \
//       --max-cost=4 --images=../../example-import-graphics --out=recreate-out [--resume]
//       [--max-iterations=4] [--min-similarity=0.85] [only1.png,only2.png]
//
// THE LOOP. Round 0: recreateEmit - the reference picture plus the recreation contract, the
// frozen spike system prompt, forced TEMPLATE_TOOL. Then, up to --max-iterations times: mount
// the REAL rendered hold (composeDocument, the exact preview pipeline), run the validator
// (productionSpxValidator with fieldPaints), the readability floors, the SIMILARITY read
// against the reference (the measurement recreation answers to), a LONG-VALUE stress frame
// with a per-field reaction check (panels must grow or type must shrink - the "dynamic"
// contract), and the shipped-control-page smoke. Feed findings + BOTH frames back. Stop when
// deliverable - or stop dirty and say so (`deliverable: false` is a first-class result).
//
// Records land results.json-compatible with the spike ledger (usage/costUsd/rounds), plus a
// side-by-side gallery.html and, per graphic, a single-file import.html the wizard's file
// door ingests directly.

import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { devPort } from './dev-port.mjs';
import { readEnvFile } from './ai-bench-server.mjs';
import { requireAllowedRoute } from './harness-route-policy.mjs';

const BASE = `http://localhost:${devPort()}`;

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const value = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
const only = args.find((a) => !a.startsWith('--'))?.split(',').filter(Boolean) ?? null;

const control = flag('control');
const paid = flag('generate');
const resume = flag('resume');
const IMAGES = path.resolve(value('images') ?? 'example-import-graphics');
const OUT = path.resolve(value('out') ?? 'recreate-out');
const MAX_ITERATIONS = Number(value('max-iterations') ?? 4);
// READ OFF the 2026-08-18 round, not chosen: rebuilds the eye calls the same design measured
// 42-58% of active blocks (textures, glyph rasterisation and soft shadows never match
// per-block), scale-broken ones 19-34% (now named by the footprint finding), and the
// wrong-design control 6%. The floor sits under the good cluster with clear air above the
// mutation; the owner's gallery read judges quality.
const MIN_SIMILARITY = Number(value('min-similarity') ?? 0.4);
const DECODING = path.resolve('benchmarks/pro/v1/spike/decoding.json');

if (!control && !paid) {
  console.error('Pick a mode: --control (free, run this first) or --generate (PAID).');
  process.exit(1);
}

const route = value('route');
const maxCost = Number(value('max-cost') ?? 0);
if (paid) {
  if (!route) {
    console.error('PAID mode needs --route=<provider>:<model>.');
    process.exit(1);
  }
  requireAllowedRoute(route, { flag: 'route', reason: value('frontier-reason') });
  if (!Number.isFinite(maxCost) || maxCost <= 0) {
    console.error('--max-cost must be a positive number of dollars. This run spends real money.');
    process.exit(1);
  }
  console.log(`PAID recreate run: ${route}, max ${MAX_ITERATIONS} iteration(s),`
    + ` similarity floor ${MIN_SIMILARITY}, ceiling $${maxCost.toFixed(2)}. This spends real tokens.`);
}

const decoding = JSON.parse(await readFile(DECODING, 'utf8'));

try {
  await fetch(`${BASE}/app`, { signal: AbortSignal.timeout(4000) });
} catch {
  console.error(`Dev server not reachable at ${BASE} - start it first.`);
  process.exit(1);
}

await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on('pageerror', (error) => console.log('  pageerror:', error.message));
await page.goto(`${BASE}/app`, { waitUntil: 'domcontentloaded' });
await page.locator('.topbar').waitFor();
await page.locator('.wz-modal').waitFor({ state: 'visible', timeout: 20_000 }).catch(() => undefined);
await page.keyboard.press('Escape');
await page.locator('.wz-modal').waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => undefined);

if (paid) {
  const fileEnv = await readEnvFile();
  const email = (process.env.E2E_EMAIL ?? fileEnv.E2E_EMAIL ?? '').trim();
  const password = (process.env.E2E_PASSWORD ?? fileEnv.E2E_PASSWORD ?? '').trim();
  if (email && password) {
    try {
      await page.getByRole('button', { name: 'Sign in', exact: true }).click({ timeout: 10_000 });
      await page.locator('#auth-email').fill(email);
      await page.locator('#auth-pass').fill(password);
      await page.locator('.auth-card').getByRole('button', { name: 'Sign in', exact: true }).click();
      await page.locator('.auth-status').waitFor({ state: 'visible', timeout: 20_000 });
      console.log('Signed in for the managed route.');
    } catch (error) {
      console.error(`Sign-in failed (${error.message?.split('\n')[0]}) - continuing signed out.`);
    }
  }
}

/**
 * Fit a picture into the 1920x1080 frame (contain, centred) and read what it is: the fitted
 * PNG the model sees and the diff compares against, plus the painted-checkerboard verdict.
 * The checkerboard is DETECTED, never assumed: two alternating grey tones in square tiles -
 * the way stock sites bake "transparency" into a JPEG - and its cells are neutralised to the
 * capture backdrop (#333), so the diff reads them as "empty", exactly what the contract told
 * the model they mean.
 */
async function loadReference(file) {
  const bytes = await readFile(path.join(IMAGES, file));
  const ext = path.extname(file).toLowerCase();
  const mime = ext === '.png' ? 'image/png' : 'image/jpeg';
  const dataUrl = `data:${mime};base64,${bytes.toString('base64')}`;
  return page.evaluate(async (src) => {
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error('unreadable image'));
      i.src = src;
    });
    const W = 1920;
    const H = 1080;
    const k = Math.min(W / img.naturalWidth, H / img.naturalHeight);
    const w = Math.round(img.naturalWidth * k);
    const h = Math.round(img.naturalHeight * k);
    const ox = Math.round((W - w) / 2);
    const oy = Math.round((H - h) / 2);

    // Detect the painted checkerboard on the SOURCE pixels: sample a corner patch, find two
    // dominant near-grey tones alternating with a square period. Greys only - a design's own
    // two-colour pattern is saturated or dark, a transparency checker is #ffffff/#cccccc-ish.
    const sc = document.createElement('canvas');
    sc.width = img.naturalWidth;
    sc.height = img.naturalHeight;
    const sg = sc.getContext('2d', { willReadFrequently: true });
    sg.drawImage(img, 0, 0);
    const sd = sg.getImageData(0, 0, sc.width, sc.height).data;
    const at = (x, y) => {
      const p = (y * sc.width + x) * 4;
      return [sd[p], sd[p + 1], sd[p + 2]];
    };
    const greyish = ([r, g, b]) => Math.max(r, g, b) - Math.min(r, g, b) <= 12 && r >= 90;
    const close = (a, b, tol) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2])) <= tol;
    // Several anchors, because the checker is only visible where the GRAPHIC is not - a HUD
    // frame decorates every corner, a glow tints one - and a single-corner probe missed 3 of
    // the 5 real files. The first anchor whose neighbourhood walks like a checker wins.
    let checker = null; // { g1, g2, period }
    const anchors = [
      [2, 2], [sc.width - 120, 2], [2, sc.height - 120], [sc.width - 120, sc.height - 120],
      [Math.floor(sc.width / 2), 2], [2, Math.floor(sc.height / 2)],
      [sc.width - 120, Math.floor(sc.height / 2)], [Math.floor(sc.width / 2), sc.height - 120],
    ];
    for (const [ax, ay] of anchors) {
      if (checker || ax < 0 || ay < 0) continue;
      const c0 = at(ax, ay);
      if (!greyish(c0)) continue;
      // Walk right until the tone changes: that run length is the tile period candidate.
      let p = 0;
      for (let x = ax + 1; x < Math.min(sc.width, ax + 200); x++) {
        if (!close(at(x, ay), c0, 14)) { p = x - ax; break; }
      }
      if (p < 4 || p > 96 || ax + 2 * p >= sc.width || ay + 2 * p >= sc.height) continue;
      const c1 = at(ax + p, ay);
      const diagonal = at(ax + p, ay + p);
      const below = at(ax, ay + p);
      if (greyish(c1) && !close(c0, c1, 10) && close(diagonal, c0, 14) && close(below, c1, 14)) {
        checker = { g1: c0, g2: c1, period: p };
      }
    }

    // The reference's own FLAT outer backdrop is a stand-in too (the light grey or dark
    // navy design tools export behind an overlay) - the contract tells the model not to
    // paint it, so the diff must not score it either. Round 1 measured the cost of skipping
    // this: an excellent recreation scored 18%, the whole verdict eaten by grey-vs-empty.
    // Detected on the border ring, and only when NEAR-UNIFORM there - a gradient or textured
    // border (a full-screen design's own background) stays, because there the background IS
    // the design and the model must rebuild it.
    let backdrop = null;
    if (!checker) {
      const ring = [];
      const step = Math.max(2, Math.floor(Math.min(sc.width, sc.height) / 200));
      for (let x = 0; x < sc.width; x += step) ring.push(at(x, 1), at(x, sc.height - 2));
      for (let y = 0; y < sc.height; y += step) ring.push(at(1, y), at(sc.width - 2, y));
      const med = [0, 1, 2].map((c) => {
        const s = ring.map((p) => p[c]).sort((m, n) => m - n);
        return s[Math.floor(s.length / 2)];
      });
      // A GREYISH border widens the tolerance: a near-white transparency checker whose two
      // tiles sit ~12 counts apart is too subtle for the tile detector to prove and too
      // varied for the flat test at 10 - the one real file in that gap kept its checker and
      // fired a false footprint finding. A saturated border keeps the tight tolerance (a
      // coloured design background must never read as a stand-in).
      const greyMed = Math.max(...med) - Math.min(...med) <= 12 && med[0] >= 90;
      const tol = greyMed ? 16 : 10;
      const covered = ring.filter((p) => close(p, med, tol)).length / ring.length;
      if (covered >= 0.6) backdrop = { tone: med, tol };
    }

    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const g = canvas.getContext('2d');
    g.fillStyle = '#333333';
    g.fillRect(0, 0, W, H);
    g.drawImage(img, ox, oy, w, h);
    // Neutralise the stand-in by FLOOD FILL from the frame border, never by tone alone: only
    // the outer CONNECTED region is the export's backdrop. A global tone match ate a design's
    // white subtitle bar sitting 8 counts from the grey backdrop - and the loop then
    // faithfully taught the model to paint the bar dark, converging on the corrupted
    // reference. Interior pixels sharing the backdrop's tone are design and stay.
    if (backdrop || checker) {
      const id = g.getImageData(0, 0, W, H);
      const d = id.data;
      const seen = new Uint8Array(W * H);
      const queue = [];
      // A border SEED qualifies against the global tones. A NEIGHBOUR during the flood
      // qualifies by LOCAL CONTINUITY instead: greyish (for a checker) and within a small
      // step of the pixel it was reached from. A vignette or a glow drifts the checker's
      // tiles far past any global tolerance over the frame - the v4 round left residue on
      // two files and fired false footprint findings off it - while the drift per PIXEL is
      // tiny; local continuity follows it, and a design edge is still a hard jump that
      // stops the flood.
      const seedQualifies = (p) => {
        const px = [d[p], d[p + 1], d[p + 2]];
        if (backdrop) return close(px, backdrop.tone, backdrop.tol);
        return (
          Math.max(...px) - Math.min(...px) <= 16 &&
          (close(px, checker.g1, 24) || close(px, checker.g2, 24))
        );
      };
      const stepQualifies = (p, fromP) => {
        const px = [d[p], d[p + 1], d[p + 2]];
        if (backdrop) return close(px, backdrop.tone, backdrop.tol);
        if (Math.max(...px) - Math.min(...px) > 16 || px[0] < 60) return false;
        const from = [d[fromP], d[fromP + 1], d[fromP + 2]];
        // Within one checker STEP of the neighbour: the two tile tones sit ~20-50 apart, so
        // the tolerance must span a tile boundary while a design edge (a saturated or dark
        // panel against the checker) still reads as a jump past it.
        return Math.max(
          Math.abs(px[0] - from[0]),
          Math.abs(px[1] - from[1]),
          Math.abs(px[2] - from[2]),
        ) <= 60;
      };
      const push = (x, y, fromP) => {
        if (x < 0 || y < 0 || x >= W || y >= H) return;
        const i = y * W + x;
        if (seen[i]) return;
        const p = i * 4;
        // The #333 letterbox around a non-16:9 fit is part of the outer region too.
        const letterbox = d[p] === 0x33 && d[p + 1] === 0x33 && d[p + 2] === 0x33;
        if (!letterbox && !(fromP === null ? seedQualifies(p) : stepQualifies(p, fromP))) return;
        seen[i] = 1;
        queue.push(i);
      };
      for (let x = 0; x < W; x++) {
        push(x, 0, null);
        push(x, H - 1, null);
      }
      for (let y = 0; y < H; y++) {
        push(0, y, null);
        push(W - 1, y, null);
      }
      while (queue.length) {
        const i = queue.pop();
        const x = i % W;
        const y = (i / W) | 0;
        const p = i * 4;
        push(x + 1, y, p);
        push(x - 1, y, p);
        push(x, y + 1, p);
        push(x, y - 1, p);
      }
      for (let i = 0; i < seen.length; i++) {
        if (!seen[i]) continue;
        const p = i * 4;
        d[p] = 0x33;
        d[p + 1] = 0x33;
        d[p + 2] = 0x33;
      }
      g.putImageData(id, 0, 0);
    }
    // The graphic's own bounding box in the fitted frame (stand-in already neutralised) -
    // stated in the first prompt so size and position are contract, not convergence.
    const md = g.getImageData(0, 0, W, H).data;
    let rx0 = W, ry0 = H, rx1 = -1, ry1 = -1;
    for (let y = 0; y < H; y += 2) {
      for (let x = 0; x < W; x += 2) {
        const p = (y * W + x) * 4;
        if (
          Math.abs(md[p] - 0x33) > 12 ||
          Math.abs(md[p + 1] - 0x33) > 12 ||
          Math.abs(md[p + 2] - 0x33) > 12
        ) {
          if (x < rx0) rx0 = x;
          if (x > rx1) rx1 = x;
          if (y < ry0) ry0 = y;
          if (y > ry1) ry1 = y;
        }
      }
    }
    const region = rx1 < 0 ? null : { x: rx0, y: ry0, w: rx1 - rx0 + 2, h: ry1 - ry0 + 2 };

    const fitted = canvas.toDataURL('image/png');
    return {
      fittedBase64: fitted.split(',')[1],
      checkerboard: Boolean(checker),
      backdrop: backdrop ? `#${backdrop.tone.map((v) => v.toString(16).padStart(2, '0')).join('')}` : null,
      region,
      sourceWidth: img.naturalWidth,
      sourceHeight: img.naturalHeight,
    };
  }, dataUrl);
}

/** Mount the settled hold (the iterate runner's capture core), screenshot it, and read the
 *  per-field geometry the dynamic check compares across value lengths. */
async function capture(template, data, file) {
  const playError = await page.evaluate(async ({ template, data }) => {
    const bust = '?t=' + Date.now();
    const { composeDocument } = await import('/src/preview/composeDocument.ts' + bust);
    document.getElementById('recreate-hold-frame')?.remove();
    const frame = document.createElement('iframe');
    frame.id = 'recreate-hold-frame';
    frame.style.cssText = 'position:fixed;left:0;top:0;width:1920px;height:1080px;border:0;'
      + 'z-index:99999;background:#333;color-scheme:dark;';
    document.body.appendChild(frame);
    frame.srcdoc = composeDocument(template);
    await new Promise((resolve) => { frame.onload = resolve; });
    await new Promise((resolve) => setTimeout(resolve, 300));
    const win = frame.contentWindow;
    let error = null;
    try {
      win.update(JSON.stringify(data));
      win.play();
    } catch (e) {
      error = String(e?.message ?? e).slice(0, 300);
    }
    await win.document.fonts.ready;
    await new Promise((resolve) => setTimeout(resolve, 1800));
    return error;
  }, { template, data });

  const fields = await page.evaluate(() => {
    const doc = document.getElementById('recreate-hold-frame')?.contentDocument;
    if (!doc) return {};
    const out = {};
    for (const el of doc.querySelectorAll('[id^="f"]')) {
      if (!/^f\d+$/.test(el.id)) continue;
      const r = el.getBoundingClientRect();
      out[el.id] = {
        x: Math.round(r.x), y: Math.round(r.y),
        w: Math.round(r.width), h: Math.round(r.height),
        fontSize: parseFloat(doc.defaultView.getComputedStyle(el).fontSize) || 0,
      };
    }
    return out;
  });
  const readability = await page.evaluate(async () => {
    const bust = '?t=' + Date.now();
    const { measureReadability } = await import('/src/validation/readabilityCheck.ts' + bust);
    const doc = document.getElementById('recreate-hold-frame')?.contentDocument;
    return doc ? measureReadability(doc, { mode: 'standard', target: { profile: 'tv' }, markFieldId: null }) : null;
  });
  await page.frameLocator('#recreate-hold-frame').locator('body')
    .screenshot({ path: path.join(OUT, file) });
  const shotB64 = (await readFile(path.join(OUT, file))).toString('base64');
  await page.evaluate(() => document.getElementById('recreate-hold-frame')?.remove());
  return { playError, fields, readability, shotB64 };
}

/**
 * The SIMILARITY read: the rendered hold against the fitted reference, both downscaled to
 * 240x135 - every pixel is the MEAN of an 8x8 source block, which is the "same design at
 * viewing distance" question. Per-pixel identity at higher resolution was measured too
 * harsh: an excellent recreation scored 31% because no independent HTML rebuild matches a
 * reference's glyph rasterisation, antialiased edges or texture grain pixel-for-pixel -
 * block means average those away while a wrong colour, a missing element or a shifted panel
 * still moves whole blocks. Score = share of ACTIVE blocks within tolerance; findings name
 * the worst grid cells in frame coordinates with both sides' mean colour, so the model is
 * told WHERE and WHAT rather than "differs".
 */
async function similarity(referenceB64, renderB64) {
  return page.evaluate(async ({ referenceB64, renderB64 }) => {
    const load = (b64) => new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error('diff image unreadable'));
      i.src = 'data:image/png;base64,' + b64;
    });
    const [ref, ren] = await Promise.all([load(referenceB64), load(renderB64)]);
    const W = 240;
    const H = 135;
    const draw = (img) => {
      const c = document.createElement('canvas');
      c.width = W;
      c.height = H;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.fillStyle = '#333333';
      g.fillRect(0, 0, W, H);
      g.drawImage(img, 0, 0, W, H);
      return g.getImageData(0, 0, W, H).data;
    };
    const a = draw(ref);
    const b = draw(ren);
    const TOL = 28;
    // Score over the ACTIVE area only: pixels where either side differs from the shared
    // backdrop. A lower third covers a twentieth of the frame, so a whole-frame score is
    // dominated by empty-vs-empty agreement - the control's mutation (two DIFFERENT designs)
    // scored 97.4% that way, which certifies anything. Active-area scoring is what makes the
    // wrong design score low.
    const BG = 0x33;

    // The render is compared at its BEST SMALL OFFSET (±4 blocks = ±32 source px): a perfect
    // rebuild parked a strap's width off its reference position mismatched every block, the
    // loop then read "everything differs" and rewrote a good design. A viewer does not care
    // about a 30px offset and the operator repositions anyway - the offset is REPORTED as its
    // own finding instead of poisoning every cell.
    const scoreAt = (dx, dy) => {
      let okN = 0;
      let activeN = 0;
      for (let y = 0; y < H; y++) {
        const sy = y + dy;
        if (sy < 0 || sy >= H) continue;
        for (let x = 0; x < W; x++) {
          const sx = x + dx;
          if (sx < 0 || sx >= W) continue;
          const p = (y * W + x) * 4;
          const q = (sy * W + sx) * 4;
          let d = 0;
          let offBgA = 0;
          let offBgB = 0;
          for (let c = 0; c < 3; c++) {
            d = Math.max(d, Math.abs(a[p + c] - b[q + c]));
            offBgA = Math.max(offBgA, Math.abs(a[p + c] - BG));
            offBgB = Math.max(offBgB, Math.abs(b[q + c] - BG));
          }
          if (offBgA > 12 || offBgB > 12) {
            activeN++;
            if (d <= TOL) okN++;
          }
        }
      }
      return { ok: okN, active: activeN, score: activeN ? okN / activeN : 0 };
    };
    let best = { dx: 0, dy: 0, ...scoreAt(0, 0) };
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        if (dx === 0 && dy === 0) continue;
        const s = scoreAt(dx, dy);
        // A shifted score must beat the centred one by a margin, and a smaller shift beats a
        // larger equal one - drift toward big offsets on noise ties would misreport position.
        const margin = 0.02 + 0.002 * (Math.abs(dx) + Math.abs(dy));
        if (s.score > best.score + margin) best = { dx, dy, ...s };
      }
    }

    const COLS = 8;
    const ROWS = 5;
    const cells = Array.from({ length: COLS * ROWS }, () => ({
      diff: 0, n: 0, active: 0, ra: [0, 0, 0], rb: [0, 0, 0],
    }));
    const ok = best.ok;
    const active = best.active;
    for (let y = 0; y < H; y++) {
      const sy = y + best.dy;
      for (let x = 0; x < W; x++) {
        const sx = x + best.dx;
        const inShift = sy >= 0 && sy < H && sx >= 0 && sx < W;
        const p = (y * W + x) * 4;
        const q = inShift ? (sy * W + sx) * 4 : p;
        let d = 0;
        let offBgA = 0;
        let offBgB = 0;
        for (let c = 0; c < 3; c++) {
          d = Math.max(d, Math.abs(a[p + c] - b[q + c]));
          offBgA = Math.max(offBgA, Math.abs(a[p + c] - BG));
          offBgB = Math.max(offBgB, Math.abs(b[q + c] - BG));
        }
        const isActive = inShift && (offBgA > 12 || offBgB > 12);
        const cell = cells[Math.floor(y / (H / ROWS)) * COLS + Math.floor(x / (W / COLS))];
        cell.n++;
        if (isActive) {
          cell.active++;
          if (d > TOL) cell.diff++;
        }
        for (let c = 0; c < 3; c++) {
          cell.ra[c] += a[p + c];
          cell.rb[c] += b[q + c];
        }
      }
    }
    // A cell is named by the share of its ACTIVE pixels that disagree (a small graphic in a
    // big empty cell must still be nameable), but only when the cell holds enough active
    // pixels to mean anything.
    const worst = cells
      .map((cell, i) => ({ ...cell, i }))
      .filter((cell) => cell.active > cell.n * 0.03 && cell.diff / cell.active > 0.25)
      .sort((x, y) => y.diff / y.active - x.diff / x.active)
      .slice(0, 5)
      .map((cell) => {
        const cx = Math.round(((cell.i % COLS) + 0.5) * (1920 / COLS));
        const cy = Math.round((Math.floor(cell.i / COLS) + 0.5) * (1080 / ROWS));
        const mean = (sum) =>
          '#' + sum.map((v) => Math.round(v / cell.n).toString(16).padStart(2, '0')).join('');
        return `around x=${cx}, y=${cy}: ${Math.round((cell.diff / cell.active) * 100)}% of the graphic pixels differ - `
          + `the reference reads ~${mean(cell.ra)} there, your render ~${mean(cell.rb)}`;
      });
    // Under 0.2% active = one side is essentially empty against the other - score 0, never a
    // division-by-nothing pass.
    if (active < W * H * 0.002) return { score: 0, offset: null, footprint: null, worst: ['the render paints almost nothing where the reference has a graphic'] };
    const offset = (best.dx || best.dy)
      ? { x: best.dx * 8, y: best.dy * 8 }
      : null;
    // The FOOTPRINT gap: the two sides' active bounding boxes, in frame px. The round's two
    // best-looking rebuilds scored 19% and 28% because they were drawn at a different SCALE -
    // a defect the block diff can only report as "everything differs", while the bbox gap
    // names the one actionable fix (draw it bigger/smaller, there).
    const bbox = (img) => {
      let x0 = W, y0 = H, x1 = -1, y1 = -1;
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const p = (y * W + x) * 4;
          let off = 0;
          for (let c = 0; c < 3; c++) off = Math.max(off, Math.abs(img[p + c] - BG));
          if (off > 12) {
            if (x < x0) x0 = x;
            if (x > x1) x1 = x;
            if (y < y0) y0 = y;
            if (y > y1) y1 = y;
          }
        }
      }
      return x1 < 0 ? null : { x: x0 * 8, y: y0 * 8, w: (x1 - x0 + 1) * 8, h: (y1 - y0 + 1) * 8 };
    };
    const refBox = bbox(a);
    const renBox = bbox(b);
    let footprint = null;
    if (refBox && renBox) {
      const grew = (m, n) => Math.abs(m - n) / Math.max(m, n) > 0.12;
      if (grew(refBox.w, renBox.w) || grew(refBox.h, renBox.h)) {
        footprint = `the reference graphic occupies about ${refBox.w}x${refBox.h}px at `
          + `x=${refBox.x}, y=${refBox.y}; yours occupies ${renBox.w}x${renBox.h}px at `
          + `x=${renBox.x}, y=${renBox.y} - redraw at the reference's size and position, `
          + `keeping the design`;
      }
    }
    return { score: ok / active, offset, footprint, worst };
  }, { referenceB64, renderB64 });
}

/** The long-value stress data: every text field's sample, doubled in a way that stays
 *  realistic (words, not lorem), so panels must actually react. */
function stressData(template, data) {
  const out = { ...data };
  for (const f of template.fields ?? []) {
    const v = out[f.field];
    if (typeof v !== 'string' || !v.trim()) continue;
    if (/^[\d\s.:+-]+$/.test(v)) {
      out[f.field] = v.replace(/\d(?=[^\d]*$)/, '00');
    } else {
      out[f.field] = `${v} Konstantinopoulos-Extension`;
    }
  }
  return out;
}

/** The dynamic-reaction findings: a text field whose value doubled while its box AND type
 *  size stayed identical is a fixed panel that clips or overflows - the contract's "grows or
 *  reacts" measured. */
function reactionFindings(template, holdFields, stressFields, data, stressed) {
  const findings = [];
  for (const f of template.fields ?? []) {
    if ((data[f.field] ?? '') === (stressed[f.field] ?? '')) continue;
    // Numeric fields (scores, clocks) are exempt: a fixed digit box is that class's own
    // contract - a scoreboard's score cell is SUPPOSED to be a fixed plate.
    if (/^[\d\s.:+-]+$/.test(data[f.field] ?? '')) continue;
    const a = holdFields[f.field];
    const b = stressFields[f.field];
    if (!a || !b) continue;
    const sameBox = Math.abs(a.w - b.w) < 4 && Math.abs(a.h - b.h) < 4;
    const sameType = Math.abs(a.fontSize - b.fontSize) < 0.5;
    if (sameBox && sameType) {
      findings.push(`field ${f.field} ("${f.title ?? f.field}") does not react to longer text: `
        + `its box (${a.w}x${a.h}) and type size (${a.fontSize}px) are unchanged with a value `
        + `twice as long - the panel must grow, wrap, or shrink the type`);
    }
  }
  return findings;
}

const results = [];
let spentUsd = 0;
const kept = new Map();
if (resume) {
  try {
    const prior = JSON.parse(await readFile(path.join(OUT, 'results.json'), 'utf8'));
    for (const r of prior.results ?? []) if (r.deliverable) kept.set(r.slug, r);
    spentUsd = prior.spentUsd ?? 0;
    console.log(`Resuming: ${kept.size} deliverable result(s) kept, $${spentUsd.toFixed(3)} already spent.`);
  } catch {
    console.log('Nothing to resume - starting fresh.');
  }
}

/** One graphic's whole loop. `emitRound(previous)` produces the round's template - the model
 *  in a paid run, a fixture in the control - so the loop logic is identical in both modes. */
async function runGraphic(slug, reference, emitRound) {
  const started = Date.now();
  const totals = { input: 0, output: 0, reasoning: 0 };
  let cost = 0;
  const rounds = [];
  let previous = null;
  let deliverable = false;
  let final = null;

  for (let round = 0; round <= MAX_ITERATIONS; round += 1) {
    const emitRes = await emitRound(previous, round);
    totals.input += emitRes.usage?.input ?? 0;
    totals.output += emitRes.usage?.output ?? 0;
    totals.reasoning += emitRes.usage?.reasoning ?? 0;
    cost += emitRes.costUsd ?? 0;
    spentUsd += emitRes.costUsd ?? 0;

    const codeDir = path.join(OUT, 'code', slug, `round-${round}`);
    await mkdir(codeDir, { recursive: true });
    await Promise.all([
      writeFile(path.join(codeDir, 'index.html'), emitRes.template.html),
      writeFile(path.join(codeDir, 'template.css'), emitRes.template.css),
      writeFile(path.join(codeDir, 'template.js'), emitRes.template.js),
      writeFile(path.join(codeDir, 'template.json'), `${JSON.stringify(emitRes.template, null, 2)}\n`),
    ]);

    const data = {};
    for (const f of emitRes.template.fields ?? []) data[f.field] = f.value ?? '';
    const hold = await capture(emitRes.template, data, `${slug}.round-${round}.hold.png`);
    const stressed = stressData(emitRes.template, data);
    const stress = await capture(emitRes.template, stressed, `${slug}.round-${round}.stress.png`);
    const sim = await similarity(reference.fittedBase64, hold.shotB64);

    const findings = [];
    if (hold.playError) findings.push(`the template threw at play(): ${hold.playError}`);
    findings.push(...(emitRes.validation?.errors ?? []));
    // Readability is ADVISORY here, unlike the generation sweeps: in a RECREATION the
    // reference sets the type sizes, and a floor the reference itself sits under would
    // deadlock the loop against its own ground truth (the control measured it: catalog sb01
    // paints its team labels at 40px against the 50px primary floor, itself pending
    // re-ratification). Advisories reach the ledger and the gallery; the owner reads them.
    const advisories = (hold.readability?.findings ?? []).map(
      (f) => `advisory (matching the reference may justify it): ${f.detail}`,
    );
    findings.push(...reactionFindings(emitRes.template, hold.fields, stress.fields, data, stressed));
    if (sim.footprint) {
      findings.push(sim.footprint);
    } else if (sim.offset) {
      findings.push(`the whole graphic sits about ${Math.abs(sim.offset.x)}px `
        + `${sim.offset.x > 0 ? 'right' : 'left'} and ${Math.abs(sim.offset.y)}px `
        + `${sim.offset.y > 0 ? 'below' : 'above'} its position in the reference - keep the `
        + `design, move the whole graphic to match`);
    }
    if (sim.score < MIN_SIMILARITY) {
      findings.push(`the render matches only ${(sim.score * 100).toFixed(1)}% of the reference `
        + `(the floor is ${(MIN_SIMILARITY * 100).toFixed(0)}%). Where it differs most:`);
      findings.push(...sim.worst.map((w) => `  ${w}`));
    }
    const smoke = await controlPageSmoke(emitRes.template, `${slug} round ${round}`);
    if (smoke) findings.push(smoke);

    rounds.push({
      round,
      similarity: sim.score,
      worst: sim.worst,
      findings: findings.slice(0, 30),
      advisories,
      validationOk: emitRes.validation?.ok ?? null,
      model: emitRes.model ?? null,
      costUsd: emitRes.costUsd ?? 0,
    });
    final = { template: emitRes.template, round, similarity: sim.score };
    console.log(`  round ${round}: similarity ${(sim.score * 100).toFixed(1)}%`
      + `${findings.length ? `, ${findings.length} finding(s)` : ' - CLEAN'}`);

    if (findings.length === 0) {
      deliverable = true;
      break;
    }
    if (round === MAX_ITERATIONS) break;
    if (paid && spentUsd >= maxCost) {
      console.log(`  stopping dirty: the $${maxCost.toFixed(2)} ceiling is spent.`);
      break;
    }
    previous = {
      template: emitRes.template,
      // Advisories ride along for the model to weigh; only `findings` gate deliverable.
      findings: [...findings, ...advisories],
      screenshot: { mediaType: 'image/png', base64: await downscaleForModel(hold.shotB64) },
    };
  }

  // The importable single file: the wizard's file door parses inline <style>/<script>.
  if (final) {
    const t = final.template;
    const importable = t.html
      .replace(/<\/head>/i, `<style>\n${t.css}\n</style>\n</head>`)
      .replace(/<\/body>/i, `<script>\n${t.js}\n</script>\n</body>`);
    await writeFile(path.join(OUT, `${slug}.import.html`), importable);
  }

  return {
    slug,
    kind: 'candidate',
    arm: 'recreate',
    deliverable,
    rounds,
    finalRound: final?.round ?? null,
    similarity: final?.similarity ?? 0,
    usage: totals,
    costUsd: cost,
    seconds: Math.round((Date.now() - started) / 1000),
  };
}

/** The findings screenshot the model sees - downscaled to 960x540 like the iterate runner's
 *  vision feed, so a round costs image tokens once, not four times. */
async function downscaleForModel(b64) {
  return page.evaluate(async (b64) => {
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = 'data:image/png;base64,' + b64;
    });
    const c = document.createElement('canvas');
    c.width = 960;
    c.height = 540;
    c.getContext('2d').drawImage(img, 0, 0, 960, 540);
    return c.toDataURL('image/png').split(',')[1];
  }, b64);
}

/** The shipped-control-page smoke, verbatim from the iterate runner (its header says why the
 *  bench's own iframe is not enough - qz-primetime aired and the panel threw). */
async function controlPageSmoke(template, name) {
  const smokePage = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = [];
  smokePage.on('pageerror', (error) => errors.push(String(error?.message ?? error).split('\n')[0]));
  try {
    await smokePage.goto(`${BASE}/app`, { waitUntil: 'domcontentloaded' });
    await smokePage.locator('.topbar').waitFor({ timeout: 15_000 });
    await smokePage.locator('.wz-modal').waitFor({ state: 'visible', timeout: 8_000 }).catch(() => undefined);
    await smokePage.keyboard.press('Escape');
    const made = await smokePage.evaluate(async ({ template, name }) => {
      const bust = '?t=' + Date.now();
      const { createGraphic } = await import('/src/model/library.ts' + bust);
      const { doc, error } = createGraphic(template, { name });
      if (error || !doc) return { error: error ?? 'createGraphic returned nothing' };
      const { commitDurableWrites } = await import('/src/model/durableStore.ts' + bust);
      const failure = await commitDurableWrites();
      if (failure) return { error: `durable write refused: ${failure}` };
      return { id: doc.id };
    }, { template, name });
    if (made.error) return `the graphic breaks the shipped control page: it cannot be saved for it (${made.error})`;
    await smokePage.goto(`${BASE}/app#/control/${made.id}`, { waitUntil: 'domcontentloaded' });
    try {
      await smokePage.locator('[data-testid="graphic-control-page"]').waitFor({ timeout: 15_000 });
    } catch {
      return `the graphic breaks the shipped control page: the page never renders${errors.length ? ` (${errors[0]})` : ''}`;
    }
    await smokePage.locator('[data-testid="control-play"]').click({ timeout: 10_000 });
    await smokePage.waitForTimeout(2200);
    if (errors.length) return `the graphic breaks the shipped control page: it throws there (${errors[0]})`;
    return null;
  } catch (error) {
    return `the graphic breaks the shipped control page: ${String(error?.message ?? error).split('\n')[0]}`;
  } finally {
    await smokePage.close();
  }
}

if (control) {
  // ── CONTROL: ground truth from the catalog, zero tokens ────────────────────────────────
  // A catalog design rendered to a PNG is a reference whose PERFECT recreation exists (the
  // design itself), so the capture, the similarity read and the loop's plumbing are provable
  // free: the design against its own render must score near 1, and a DIFFERENT design must
  // score far below it with regions named (the mutation direction - a diff that cannot fail
  // would certify anything).
  const fixtures = await page.evaluate(async () => {
    const bust = '?t=' + Date.now();
    const { variantById } = await import('/src/templates/catalog.ts' + bust);
    const ids = ['lt01', 'sb01'];
    const out = [];
    for (const id of ids) {
      const variant = variantById(id);
      if (!variant) return { error: `catalog variant ${id} is gone - pick another control pair` };
      out.push({ id, template: variant.create({}) });
    }
    return { fixtures: out };
  });
  if (fixtures.error) {
    console.error(fixtures.error);
    process.exit(1);
  }
  for (const fx of fixtures.fixtures) {
    const data = {};
    for (const f of fx.template.fields ?? []) data[f.field] = f.value ?? '';
    const ref = await capture(fx.template, data, `control-${fx.id}.reference.png`);
    const reference = { fittedBase64: ref.shotB64, checkerboard: false };
    console.log(`\n── control:${fx.id} (self) ──`);
    const self = await runGraphic(`control-${fx.id}-self`, reference, async () => ({
      template: fx.template,
      validation: { ok: true, errors: [], warnings: [] },
      usage: { input: 0, output: 0, reasoning: 0 },
      costUsd: 0,
      model: 'control-fixture',
    }));
    results.push(self);
    if (self.similarity < 0.95) {
      console.error(`CONTROL FAILED: ${fx.id} against its own render scored ${self.similarity.toFixed(3)} (< 0.95).`);
      process.exitCode = 1;
    }
  }
  // The mutation: lt01's reference, sb01's template. Must score LOW and name regions.
  const [a, b] = fixtures.fixtures;
  const dataA = {};
  for (const f of a.template.fields ?? []) dataA[f.field] = f.value ?? '';
  const refA = await capture(a.template, dataA, 'control-mutation.reference.png');
  console.log('\n── control:mutation (lt01 reference, sb01 emit) ──');
  const mutated = await runGraphic('control-mutation', { fittedBase64: refA.shotB64, checkerboard: false }, async () => ({
    template: b.template,
    validation: { ok: true, errors: [], warnings: [] },
    usage: { input: 0, output: 0, reasoning: 0 },
    costUsd: 0,
    model: 'control-fixture',
  }));
  results.push(mutated);
  if (mutated.similarity > 0.9 || mutated.rounds[0].worst.length === 0) {
    console.error(`CONTROL FAILED: the wrong design scored ${mutated.similarity.toFixed(3)} with `
      + `${mutated.rounds[0].worst.length} region(s) named - the diff cannot tell designs apart.`);
    process.exitCode = 1;
  }
} else {
  // ── PAID: every picture in the folder, cheapest-first by file size ─────────────────────
  const files = (await readdir(IMAGES, { recursive: true }))
    .filter((f) => /\.(png|jpe?g|webp)$/i.test(f))
    .filter((f) => !only || only.some((o) => f.includes(o)))
    .sort();
  if (files.length === 0) {
    console.error(`No images found under ${IMAGES}.`);
    process.exit(1);
  }
  console.log(`${files.length} picture(s) from ${IMAGES}.`);
  for (const file of files) {
    const slug = file.replace(/[\\/]/g, '-').replace(/\.(png|jpe?g|webp)$/i, '');
    if (kept.has(slug)) {
      results.push(kept.get(slug));
      continue;
    }
    if (spentUsd >= maxCost) {
      console.log(`  SKIPPED ${slug}: the $${maxCost.toFixed(2)} ceiling is spent ($${spentUsd.toFixed(3)}).`);
      results.push({ slug, kind: 'candidate', arm: 'recreate', skipped: true });
      continue;
    }
    console.log(`\n── ${slug} ──`);
    let reference;
    try {
      reference = await loadReference(file);
      await writeFile(
        path.join(OUT, `${slug}.reference.png`),
        Buffer.from(reference.fittedBase64, 'base64'),
      );
    } catch (error) {
      console.error(`  unreadable: ${error.message}`);
      results.push({ slug, kind: 'candidate', arm: 'recreate', error: String(error.message) });
      continue;
    }
    if (reference.checkerboard) console.log('  painted transparency checkerboard detected - masked.');
    if (reference.backdrop) console.log(`  flat stand-in backdrop ${reference.backdrop} detected - masked.`);
    if (reference.region) console.log(`  graphic region ${reference.region.w}x${reference.region.h} at ${reference.region.x},${reference.region.y}.`);
    try {
      const result = await runGraphic(slug, reference, async (previous) => {
        return page.evaluate(async (input) => {
          const bust = '?t=' + Date.now();
          const { recreateEmit } = await import('/src/ai/spike/recreate.ts' + bust);
          const { productionSpxValidator } = await import('/src/ai/litePipeline.ts' + bust);
          const [provider, ...model] = input.route.split(':');
          const result = await recreateEmit({
            name: input.name,
            reference: {
              mediaType: 'image/png',
              base64: input.referenceB64,
              checkerboard: input.checkerboard,
              region: input.region ?? undefined,
            },
            route: { provider, model: model.join(':') },
            decoding: input.decoding,
            validate: productionSpxValidator(null, [], { fieldPaints: true }),
            previous: input.previous ?? undefined,
          });
          return {
            template: result.template,
            validation: {
              ok: result.validation.ok,
              errors: result.validation.errors.map((e) => `${e.rule}: ${e.message.slice(0, 200)}`),
              warnings: result.validation.warnings.length,
            },
            usage: result.usage,
            costUsd: result.costUsd,
            model: result.model,
          };
        }, {
          name: slug,
          referenceB64: reference.fittedBase64,
          checkerboard: reference.checkerboard,
          region: reference.region,
          route,
          decoding,
          previous,
        });
      });
      results.push(result);
      console.log(`  ${result.deliverable ? 'DELIVERABLE' : 'NOT DELIVERABLE (stopped dirty)'}`
        + ` · similarity ${(result.similarity * 100).toFixed(1)}% · $${result.costUsd.toFixed(3)}`);
    } catch (error) {
      console.error(`  FAILED: ${String(error?.message ?? error).split('\n')[0]}`);
      results.push({ slug, kind: 'candidate', arm: 'recreate', error: String(error?.message ?? error).slice(0, 300) });
    }
    await writeFile(path.join(OUT, 'results.json'), `${JSON.stringify({
      base: BASE, capturedAt: new Date().toISOString(), route, images: IMAGES,
      maxIterations: MAX_ITERATIONS, minSimilarity: MIN_SIMILARITY,
      maxCost, spentUsd, decoding, results,
    }, null, 2)}\n`);
  }
}

await writeFile(path.join(OUT, 'results.json'), `${JSON.stringify({
  base: BASE, capturedAt: new Date().toISOString(), route: route ?? 'control', images: control ? null : IMAGES,
  maxIterations: MAX_ITERATIONS, minSimilarity: MIN_SIMILARITY,
  maxCost, spentUsd, decoding, results,
}, null, 2)}\n`);

// ── The gallery: reference beside every round, verdict on the card ─────────────────────────
const rows = results.filter((r) => r.rounds?.length).map((r) => {
  const cells = r.rounds.map((round) =>
    `<figure><img src="${r.slug}.round-${round.round}.hold.png" loading="lazy">`
    + `<figcaption>round ${round.round} · ${(round.similarity * 100).toFixed(1)}%`
    + `${round.findings.length ? ` · ${round.findings.length} finding(s)` : ' · clean'}</figcaption></figure>`).join('');
  return `<section class="${r.deliverable ? 'ok' : 'dirty'}">
  <h2>${r.slug} — ${r.deliverable ? 'DELIVERABLE' : 'stopped dirty'} · ${(r.similarity * 100).toFixed(1)}% · $${(r.costUsd ?? 0).toFixed(3)}</h2>
  <div class="row"><figure><img src="${r.slug.startsWith('control-') ? `${r.slug.replace(/-self$/, '')}.reference.png` : `${r.slug}.reference.png`}" loading="lazy"><figcaption>reference</figcaption></figure>${cells}</div>
  <details><summary>last round's findings</summary><pre>${(r.rounds.at(-1).findings ?? []).join('\n') || '(none)'}</pre></details>
</section>`;
}).join('\n');
await writeFile(path.join(OUT, 'gallery.html'), `<!doctype html><meta charset="utf-8">
<title>recreate round</title>
<style>
  body { background: #16181d; color: #e8e6e1; font: 14px system-ui; margin: 24px; }
  .row { display: flex; gap: 12px; overflow-x: auto; }
  figure { margin: 0; } img { width: 420px; display: block; border: 1px solid #333; }
  figcaption { color: #9a958c; padding: 4px 0; }
  section { border-left: 3px solid #444; padding: 10px 16px; margin: 18px 0; }
  section.ok { border-color: #3a8f5f; } section.dirty { border-color: #a05252; }
  pre { white-space: pre-wrap; color: #c9c4bb; }
</style>
<h1>recreate — reference vs rounds</h1>
${rows}`);

const done = results.filter((r) => !r.skipped && !r.error);
console.log(`\n${done.length} graphic(s), ${done.filter((r) => r.deliverable).length} deliverable,`
  + ` ${done.filter((r) => !r.deliverable).length} stopped dirty`
  + `${paid ? ` · spent ~$${spentUsd.toFixed(3)} of $${maxCost.toFixed(2)}` : ''}.`);
console.log(`Gallery: ${path.join(OUT, 'gallery.html')}`);

await browser.close();
