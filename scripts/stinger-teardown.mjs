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
// The measurement itself lives in scripts/lib/stingerAlpha.mjs, shared verbatim with
// scripts/stinger-gate.mjs so our own stingers are judged by the same instrument as the
// commercial ones. Two copies of "is this frame covered" is how the corpus comes to pass a
// gate the market would fail, or the reverse.
//
// Usage:  node scripts/stinger-teardown.mjs [inputDir] [outDir]
// Needs ffmpeg + ffprobe on PATH. Spends no tokens and touches no network.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  alphaStats, buildSheet, isAirablyCovered, isClear, isFullyOpaque, leadingRun, longestRun,
  pct, probe, trailingRun,
} from './lib/stingerAlpha.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const IN_DIR = process.argv[2] ?? 'C:/claude/NoaCG-Studio/example-stingers';
const OUT_DIR = path.resolve(process.argv[3] ?? path.join(ROOT, 'stinger-teardown-out'));

/** A contact sheet: `count` frames evenly spaced across the clip. */
function contactSheet(file, out, meta, count = 12, cols = 6) {
  // A container that reports neither a frame count nor a duration (WebM often does not)
  // still gets a sheet - it just samples on a guess rather than on the real length.
  const total = meta.frameCount ?? meta.frames ?? (meta.duration ? Math.round(meta.duration * meta.fps) : 120);
  const step = Math.max(1, Math.floor(total / count));
  // The comma inside select() must reach ffmpeg ESCAPED, or its filter parser reads it as the
  // separator between two filters and the graph collapses.
  const r = buildSheet({ input: file, out, width: meta.width, height: meta.height,
    selectExpr: `not(mod(n\\,${step}))`, cellW: 360, cols, tmpRoot: OUT_DIR });
  return { ...r, step };
}

/** A strip of the frames AROUND the cover window's edges - where every review finding landed. */
function edgeStrip(file, out, meta, frameIdxs) {
  return buildSheet({ input: file, out, width: meta.width, height: meta.height,
    selectExpr: frameIdxs.map((n) => `eq(n\\,${n})`).join('+'), cellW: 300,
    cols: frameIdxs.length, rows: 1, tmpRoot: OUT_DIR });
}

async function tearDown(file, name) {
  const meta = probe(file);
  const line = { name, ...meta };
  if (!meta.hasAlpha) return { ...line, note: 'no alpha channel - timing and mechanism only' };

  const frames = await alphaStats(file, meta.width, meta.height);
  const n = frames.length;
  const fps = meta.fps;

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
