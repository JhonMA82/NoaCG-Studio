#!/usr/bin/env node
// Measure real broadcast stingers frame by frame, and lay them out for a human to look at.
//
// WHY: the corpus stingers are authored against §2.2 of docs/NOACG_VIDEO_PLAN.md, and three
// rounds of owner review found things no machine check of ours could see - all of them in the
// first half-second. Guessing what a good stinger does is what produced those rounds. This
// reads what real ones actually do: how long they run, where the frame is genuinely covered,
// how many frames of head and tail are empty, and how much of the duration each phase gets.
//
// It is also the honest prototype of the §4.2 per-pixel gate. The alpha statistics here are
// exactly what that gate has to compute on our own rendered frames - PER PIXEL, never an
// average, because an average passes a one-pixel seam that flashes on air.
//
// Usage:  node scripts/stinger-teardown.mjs [inputDir] [outDir]
// Needs ffmpeg + ffprobe on PATH. Spends no tokens and touches no network.

import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const IN_DIR = process.argv[2] ?? 'C:/claude/NoaCG-Studio/example-stingers';
const OUT_DIR = path.resolve(process.argv[3] ?? path.join(ROOT, 'stinger-teardown-out'));

/** Alpha at or above this counts as opaque; at or below, as clear. 12-bit ProRes alpha
 *  round-trips through 8-bit gray with a little rounding slop, and a single count that is one
 *  step off is a measurement artifact, not a hole in the graphic. */
const OPAQUE = 254;
const CLEAR = 1;

function probe(file) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries',
    'stream=codec_name,pix_fmt,width,height,r_frame_rate,nb_frames,duration', '-of', 'json', file],
    { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`ffprobe failed for ${file}: ${r.stderr}`);
  const s = JSON.parse(r.stdout).streams[0];
  const [num, den] = String(s.r_frame_rate).split('/').map(Number);
  return {
    codec: s.codec_name,
    pixFmt: s.pix_fmt,
    width: Number(s.width),
    height: Number(s.height),
    fps: den ? num / den : num,
    frames: Number(s.nb_frames) || null,
    duration: Number(s.duration) || null,
    hasAlpha: /a/.test(String(s.pix_fmt).replace(/[^a-z]/g, '').replace('yuv', '').replace('gbr', '')),
  };
}

/**
 * Per-frame alpha statistics at FULL resolution. ffmpeg extracts the alpha plane as gray and
 * streams it here; nothing is scaled, because a hole one pixel wide is exactly the defect this
 * has to be able to see and any downscale averages it away.
 */
function alphaStats(file, width, height) {
  return new Promise((resolve, reject) => {
    const frameBytes = width * height;
    const ff = spawn('ffmpeg', ['-v', 'error', '-i', file, '-vf', 'alphaextract,format=gray',
      '-f', 'rawvideo', '-pix_fmt', 'gray', '-']);
    const frames = [];
    let buf = Buffer.alloc(0);
    const consume = () => {
      while (buf.length >= frameBytes) {
        const f = buf.subarray(0, frameBytes);
        let min = 255, opaque = 0, clear = 0, sum = 0;
        for (let i = 0; i < frameBytes; i++) {
          const v = f[i];
          if (v < min) min = v;
          if (v >= OPAQUE) opaque++;
          else if (v <= CLEAR) clear++;
          sum += v;
        }
        // Where the non-opaque pixels sit matters more than how many there are: a couple of
        // hundred along the outer border is edge softness nobody sees on air, and the same
        // count in the interior is a hole the outgoing feed flashes through. Counted only
        // when the frame is nearly covered, because that is the only case it decides.
        let borderGaps = 0, interiorGaps = 0;
        if (opaque / frameBytes > 0.99) {
          const B = 2;
          for (let y = 0; y < height; y++) {
            const row = y * width;
            const edgeRow = y < B || y >= height - B;
            for (let x = 0; x < width; x++) {
              if (f[row + x] >= OPAQUE) continue;
              if (edgeRow || x < B || x >= width - B) borderGaps++;
              else interiorGaps++;
            }
          }
        }
        frames.push({
          min,
          opaqueFrac: opaque / frameBytes,
          clearFrac: clear / frameBytes,
          meanAlpha: sum / frameBytes / 255,
          borderGaps,
          interiorGaps,
        });
        buf = buf.subarray(frameBytes);
      }
    };
    ff.stdout.on('data', (d) => { buf = Buffer.concat([buf, d]); consume(); });
    ff.stderr.on('data', () => {});
    ff.on('error', reject);
    ff.on('close', (code) => (code === 0 || frames.length ? resolve(frames) : reject(new Error(`ffmpeg exit ${code}`))));
  });
}

/** The longest run of consecutive frames satisfying pred, as [start, end] inclusive. */
function longestRun(frames, pred) {
  let best = null, start = -1;
  for (let i = 0; i <= frames.length; i++) {
    const ok = i < frames.length && pred(frames[i]);
    if (ok && start < 0) start = i;
    if (!ok && start >= 0) {
      const run = { start, end: i - 1, len: i - start };
      if (!best || run.len > best.len) best = run;
      start = -1;
    }
  }
  return best;
}

function leadingRun(frames, pred) { let n = 0; while (n < frames.length && pred(frames[n])) n++; return n; }
function trailingRun(frames, pred) { let n = 0; while (n < frames.length && pred(frames[frames.length - 1 - n])) n++; return n; }

/**
 * Build one sheet from the frames a select expression picks.
 *
 * THREE PASSES ON PURPOSE. Compositing a transparent clip straight onto a `color` source in
 * one graph looks right and is not: `color` runs at its own frame rate, so `overlay` pairs the
 * first video frame with a dozen background frames and `tile` collects a dozen copies of it.
 * The first version of this did exactly that and produced sheets of flat grey - which reads as
 * "the clip is empty", the most expensive wrong answer available here. Extracting real PNGs,
 * tiling them, then flattening the finished sheet once removes every timing question: the last
 * step composites a single image over a single image.
 */
function buildSheet(file, out, meta, selectExpr, cellW, cols, rows) {
  const cellH = Math.round((cellW * meta.height) / meta.width);
  const tmp = fs.mkdtempSync(path.join(OUT_DIR, 'frames-'));
  try {
    const a = spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', file,
      '-vf', `select='${selectExpr}',scale=${cellW}:${cellH}`, '-vsync', '0',
      path.join(tmp, 'f_%04d.png')], { encoding: 'utf8' });
    if (a.status !== 0) return { ok: false, error: (a.stderr || '').trim().split('\n').pop() };
    const got = fs.readdirSync(tmp).filter((f) => f.endsWith('.png')).length;
    if (got === 0) return { ok: false, error: 'no frames selected' };

    const tiled = path.join(tmp, 'tiled.png');
    const useRows = Math.ceil(got / cols);
    const b = spawnSync('ffmpeg', ['-v', 'error', '-y', '-framerate', '10',
      '-i', path.join(tmp, 'f_%04d.png'),
      '-vf', `tile=${cols}x${rows ?? useRows}:margin=6:padding=4:color=0x00000000`,
      '-frames:v', '1', tiled], { encoding: 'utf8' });
    if (b.status !== 0) return { ok: false, error: (b.stderr || '').trim().split('\n').pop() };

    // Flatten the finished sheet over a mid grey, so transparent regions are visible AS
    // transparent rather than as whatever the viewer's background happens to be.
    const size = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height', '-of', 'csv=p=0', tiled], { encoding: 'utf8' });
    const [tw, th] = size.stdout.trim().split(',').map(Number);
    const c = spawnSync('ffmpeg', ['-v', 'error', '-y',
      '-f', 'lavfi', '-i', `color=c=0x6E6E6E:s=${tw}x${th}`, '-i', tiled,
      '-filter_complex', '[0:v][1:v]overlay=format=auto', '-frames:v', '1', out], { encoding: 'utf8' });
    if (c.status !== 0) return { ok: false, error: (c.stderr || '').trim().split('\n').pop() };
    return { ok: true, frames: got };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

/** A contact sheet: `count` frames evenly spaced across the clip. */
function contactSheet(file, out, meta, count = 12, cols = 6) {
  // A container that reports neither a frame count nor a duration (WebM often does not) still
  // gets a sheet - it just samples on a guess rather than on the real length.
  const total = meta.frameCount ?? meta.frames ?? (meta.duration ? Math.round(meta.duration * meta.fps) : 120);
  const step = Math.max(1, Math.floor(total / count));
  const r = buildSheet(file, out, meta, `not(mod(n\\,${step}))`, 360, cols, null);
  return { ...r, step };
}

/** A strip of the frames AROUND the cover window's edges - where every review finding landed. */
function edgeStrip(file, out, meta, frameIdxs) {
  const expr = frameIdxs.map((n) => `eq(n\\,${n})`).join('+');
  return buildSheet(file, out, meta, expr, 300, frameIdxs.length, 1);
}

const pct = (n) => `${(n * 100).toFixed(1)}%`;

async function tearDown(file, name) {
  const meta = probe(file);
  const line = { name, ...meta };
  if (!meta.hasAlpha) return { ...line, note: 'no alpha channel - timing and mechanism only' };

  const frames = await alphaStats(file, meta.width, meta.height);
  const n = frames.length;
  const fps = meta.fps;

  const isClear = (f) => f.clearFrac === 1;
  const isFullyOpaque = (f) => f.opaqueFrac === 1;
  // The AIRABLE definition of covered, which is not the same as the literal one: a stinger
  // that is opaque everywhere except a hairline along the outer frame border hides a cut
  // perfectly, and demanding literal 100% would reject clips that are demonstrably fine on
  // air. Anything in the INTERIOR is a real hole and disqualifies the frame.
  const isAirablyCovered = (f) => f.interiorGaps === 0 && f.opaqueFrac > 0.99;

  const head = leadingRun(frames, isClear);
  const tail = trailingRun(frames, isClear);
  const cover = longestRun(frames, isFullyOpaque);
  const airableCover = longestRun(frames, isAirablyCovered);
  // How close the clip gets, and what is missing at its best moment.
  const peak = frames.reduce((a, f, i) => (f.opaqueFrac > a.frac ? { frac: f.opaqueFrac, i } : a), { frac: 0, i: -1 });
  const peakFrame = peak.i >= 0 ? frames[peak.i] : null;

  return {
    ...line,
    frameCount: n,
    headEmptyFrames: head,
    tailEmptyFrames: tail,
    cover: cover
      ? { startFrame: cover.start, endFrame: cover.end, frames: cover.len,
          startSec: +(cover.start / fps).toFixed(3), endSec: +(cover.end / fps).toFixed(3),
          shareOfClip: cover.len / n }
      : null,
    airableCover: airableCover
      ? { startFrame: airableCover.start, endFrame: airableCover.end, frames: airableCover.len,
          startSec: +(airableCover.start / fps).toFixed(3), endSec: +(airableCover.end / fps).toFixed(3),
          shareOfClip: airableCover.len / n }
      : null,
    peakOpaque: {
      frac: +peak.frac.toFixed(6),
      frame: peak.i,
      borderGaps: peakFrame ? peakFrame.borderGaps : null,
      interiorGaps: peakFrame ? peakFrame.interiorGaps : null,
    },
    // What an operator would type into an ATEM for this clip, off the AIRABLE window.
    atem: airableCover
      ? { clipDuration: n, triggerPoint: airableCover.start + Math.min(2, airableCover.len - 1), maxMixRate: airableCover.len }
      : null,
    frames,
  };
}

async function main() {
  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const files = fs.readdirSync(IN_DIR).filter((f) => /\.(mov|webm|mp4|mkv|avi)$/i.test(f)).sort();
  if (files.length === 0) throw new Error(`no video files in ${IN_DIR}`);

  const report = [];
  for (const f of files) {
    const full = path.join(IN_DIR, f);
    const slug = f.replace(/\.[^.]+$/, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
    process.stdout.write(`${f} ... `);
    let r;
    try {
      r = await tearDown(full, f);
    } catch (e) {
      console.log(`FAILED: ${e.message}`);
      continue;
    }
    const sheet = contactSheet(full, path.join(OUT_DIR, `${slug}-sheet.png`), r, 12, 6);
    const win = r.airableCover ?? r.cover;
    if (win) {
      const idx = [0, Math.max(0, win.startFrame - 2), win.startFrame,
        Math.round((win.startFrame + win.endFrame) / 2), win.endFrame,
        Math.min(r.frameCount - 1, win.endFrame + 2), r.frameCount - 1];
      edgeStrip(full, path.join(OUT_DIR, `${slug}-edges.png`), r, [...new Set(idx)].sort((a, b) => a - b));
    }
    const { frames, ...summary } = r;
    report.push({ slug, ...summary, sheetStep: sheet.step ?? null });
    console.log(win
      ? `${r.frameCount}f @${r.fps}fps, cover ${win.startFrame}-${win.endFrame} (${pct(win.shareOfClip)}), head ${r.headEmptyFrames}f tail ${r.tailEmptyFrames}f`
      : r.note ?? `${r.frameCount}f, NEVER covers (peak ${pct(r.peakOpaque.frac)}, ${r.peakOpaque.interiorGaps} interior gaps)`);
    // The per-frame series, for anything that wants to plot or re-derive.
    if (Array.isArray(frames)) fs.writeFileSync(path.join(OUT_DIR, `${slug}-alpha.json`),
      JSON.stringify(frames.map((x) => ({ ...x, opaqueFrac: +x.opaqueFrac.toFixed(6), clearFrac: +x.clearFrac.toFixed(6), meanAlpha: +x.meanAlpha.toFixed(6) }))));
  }

  fs.writeFileSync(path.join(OUT_DIR, 'report.json'), JSON.stringify(report, null, 2));
  console.log(`\n${report.length} clips -> ${OUT_DIR}`);
}

main();
