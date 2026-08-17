#!/usr/bin/env node
// TWO CHECKPOINTS SIDE BY SIDE, LABELLED. FREE - it reads two finished rounds and writes HTML.
//
//   node scripts/pro-model-compare.mjs <roundA> <roundB> --out=<file.html>
//
// THIS IS THE PAGE THE BLIND ONE IS NOT, and both exist on purpose. `pro-round-compare-gallery`
// hides everything so a verdict cannot be anchored by a label; once that read is written, the
// question changes from "is this good" to "what is the difference", and hiding the answer stops
// helping. So this page names the models, pairs each brief's two answers, and prints the design
// language under each - it is for reading a DIFFERENCE, never for reaching a verdict.
//
// IT OPENS WITH THE CONTACT SHEET, and that ordering is the whole point of the file. A per-item
// read structurally cannot see a BETWEEN-item property: every graphic in a round can be good on
// its own page while the round is narrower than the one beside it. That is not hypothetical -
// sameness is Lite's open problem and it was found by a matrix, never by a gallery
// (src/ai/AGENTS.md). One strip per model, all its cells at once, is the smallest instrument
// that can show it, so it goes first and the pairs come after.
//
// THE CONTACT SHEET IS CROPPED and says so in its own caption. These are 1920x1080 frames whose
// graphic occupies a band near the bottom; shown whole at thumbnail size the graphic is a smear
// a few pixels tall and the strip would compare empty space. The crop is a fixed window on that
// band, identical for every cell, so the thumbnails stay comparable to each other - it is a
// reading aid, and the full frame is one click down the page.
//
// It uses the RECOMPOSED frames for the same reason the blind page does: both rounds rebuilt
// through today's composer, so the composer is not one of the differences on screen. Run
// `--recompose` on both rounds first. A cell with no recomposed frame is reported, never dropped.

import { access, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
const value = (name) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const rounds = args.filter((a) => !a.startsWith('--'));
const outFile = value('out');

if (rounds.length !== 2 || !outFile) {
  console.error('usage: node scripts/pro-model-compare.mjs <roundA> <roundB> --out=<file.html>');
  process.exit(1);
}

const exists = async (file) => access(file).then(() => true, () => false);
const escape = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

async function load(dir) {
  const round = JSON.parse(await readFile(path.resolve(dir, 'results.json'), 'utf8'));
  const cells = new Map();
  for (const r of round.results ?? []) {
    if (r.kind !== 'candidate' || r.skipped || r.error || !r.language) continue;
    cells.set(r.slug, {
      dir,
      slug: r.slug,
      brand: r.brand ?? null,
      divergence: Boolean(r.divergence),
      language: r.language,
      adjustments: r.recomposedAdjustments ?? [],
      hold: r.recomposedHold ?? null,
      stress: r.recomposedStress ?? null,
      costUsd: r.costUsd ?? 0,
      usage: r.usage ?? null,
    });
  }
  return { dir, route: round.route, capturedAt: round.capturedAt, cells };
}

const [A, B] = await Promise.all(rounds.map(load));

// The brief is the row. Ordered by A's ledger, then anything only B ran, so a round that grew a
// brief still appears rather than being silently matched away.
const slugs = [...A.cells.keys(), ...[...B.cells.keys()].filter((s) => !A.cells.has(s))];

const outDir = path.dirname(path.resolve(outFile));
const rel = (cell, file) => path.relative(outDir, path.resolve(cell.dir, file)).split(path.sep).join('/');

const missing = [];
for (const slug of slugs) {
  for (const [label, round] of [['A', A], ['B', B]]) {
    const cell = round.cells.get(slug);
    if (!cell) { missing.push(`${slug}: round ${label} has no cell`); continue; }
    for (const [name, file] of [['hold', cell.hold], ['stress', cell.stress]]) {
      if (!file) { missing.push(`${slug} (${label}): no recomposed ${name} in the ledger`); continue; }
      if (!(await exists(path.resolve(cell.dir, file)))) missing.push(`${slug} (${label}): ${file} missing on disk`);
    }
  }
}

const modelName = (route) => String(route ?? '').split(':').slice(1).join(':') || String(route);

/** The one-line summary of a design language, in the contract's own vocabulary. */
function summary(l) {
  return [
    `${l.typography?.fontId} ${l.typography?.headingWeight}/${l.typography?.supportingWeight}`,
    `${l.shape?.panel} panel, ${l.shape?.corner} corners`,
    `${l.accent?.form} accent (${l.accent?.weight})`,
    l.density,
    `${l.motion?.character}/${l.motion?.pace}`,
  ].join(' · ');
}

function swatches(l) {
  return ['accent', 'panel', 'text', 'textDim']
    .map((k) => `<span class="sw" style="background:${escape(l.palette?.[k])}" title="${k} ${escape(l.palette?.[k])}"></span>`)
    .join('');
}

// ── the contact sheet: one strip per model, every cell, cropped to the graphic band ─────────
function strip(round) {
  const cells = slugs.map((s) => round.cells.get(s)).filter(Boolean);
  return `<div class="sheet">${cells.map((c) => (c.hold
    ? `<a class="thumb" href="#${escape(c.slug)}" title="${escape(c.slug)} - ${escape(c.language.name)}">
      <span class="crop"><img src="${rel(c, c.hold)}" alt=""></span>
      <span class="tlabel">${escape(c.slug.split('.')[0])}</span></a>`
    : `<span class="thumb missing">${escape(c.slug)}<br>no frame</span>`)).join('')}</div>`;
}

// ── the pairs: one row per brief, the two models' answers beside each other ─────────────────
function pairRow(slug) {
  const a = A.cells.get(slug);
  const b = B.cells.get(slug);
  const seed = a ?? b;
  const cellHtml = (cell, round) => {
    if (!cell) return `<div class="pane"><p class="note">this round has no cell for ${escape(slug)}</p></div>`;
    const l = cell.language;
    return `<div class="pane">
      <h4>${escape(modelName(round.route))}</h4>
      <p class="lang"><strong>${escape(l.name)}</strong> ${swatches(l)}</p>
      <p class="meta">${escape(summary(l))}</p>
      ${cell.adjustments.length ? `<p class="meta adj">composer: ${escape(cell.adjustments.join(', '))}</p>` : ''}
      <div class="frames">
        ${cell.hold ? `<figure><img src="${rel(cell, cell.hold)}"><figcaption>normal text</figcaption></figure>` : ''}
        ${cell.stress ? `<figure><img src="${rel(cell, cell.stress)}"><figcaption>stress text</figcaption></figure>` : ''}
      </div>
      <p class="rationale">${escape(l.rationale)}</p>
    </div>`;
  };
  return `<section id="${escape(slug)}">
  <h2>${escape(slug.split('.')[0])} <span class="brand">${escape(seed?.brand ?? '-')}${seed?.divergence ? ' · divergence' : ''}</span></h2>
  <div class="pair">${cellHtml(a, A)}${cellHtml(b, B)}</div>
</section>`;
}

const page = `<!doctype html><meta charset="utf-8">
<title>Two checkpoints, side by side - ${slugs.length} briefs</title>
<style>
body{background:#101216;color:#e8e9ec;font:14px/1.5 system-ui;padding:24px;max-width:1700px;margin:0 auto}
h1{font-size:21px;margin-bottom:4px} h2{font-size:15px;border-top:1px solid #2a2d34;padding-top:16px;margin-top:30px}
h3{font-size:13px;text-transform:uppercase;letter-spacing:.08em;color:#9aa0ab;margin:26px 0 8px}
h4{font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:#f6a623;margin:0 0 6px}
.lead{color:#9aa0ab;max-width:78ch}
.brand{color:#9aa0ab;font-weight:400;font-size:12px}
.pair{display:grid;grid-template-columns:1fr 1fr;gap:18px}
.pane{min-width:0}
.frames{display:flex;gap:8px;flex-wrap:wrap}
figure{margin:0;min-width:0} figcaption{color:#9aa0ab;font-size:11px;margin-top:2px}
.lang{margin:0 0 2px} .meta{color:#9aa0ab;font-size:12px;margin:0 0 2px}
.adj{color:#f6a623}
.rationale{color:#7f8792;font-size:12px;margin:6px 0 0;max-width:60ch}
.sw{display:inline-block;width:13px;height:13px;border:1px solid #2a2d34;vertical-align:-2px;margin-left:3px}
/* Frames are TRANSPARENT - shown over a checkerboard, because a graphic judged on flat dark is
   judged against a background it will never have on air. */
.chk{background-color:#20242b;
  background-image:linear-gradient(45deg,#171a20 25%,transparent 25%),linear-gradient(-45deg,#171a20 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#171a20 75%),linear-gradient(-45deg,transparent 75%,#171a20 75%);
  background-size:20px 20px;background-position:0 0,0 10px,10px -10px,-10px 0}
.frames img{width:390px;max-width:100%;display:block;border:1px solid #2a2d34;
  background-color:#20242b;
  background-image:linear-gradient(45deg,#171a20 25%,transparent 25%),linear-gradient(-45deg,#171a20 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#171a20 75%),linear-gradient(-45deg,transparent 75%,#171a20 75%);
  background-size:20px 20px;background-position:0 0,0 10px,10px -10px,-10px 0}
.sheet{display:flex;flex-wrap:wrap;gap:6px}
.thumb{display:block;width:260px;text-decoration:none;color:#9aa0ab}
/* The window onto the graphic band. The frame is 1920x1080 with the strap around y 770-960 and
   x 136-1230, so at this scale (420/1920) that lands at y 168-210, x 30-269 - the offsets below
   are those numbers and nothing else. Identical for every cell, which is what keeps the
   thumbnails comparable; object-fit cannot express it, because the image box and the frame
   share an aspect ratio and there is nothing for it to crop. */
.crop{display:block;width:260px;height:74px;overflow:hidden;border:1px solid #2a2d34;
  background-color:#20242b;
  background-image:linear-gradient(45deg,#171a20 25%,transparent 25%),linear-gradient(-45deg,#171a20 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#171a20 75%),linear-gradient(-45deg,transparent 75%,#171a20 75%);
  background-size:14px 14px;background-position:0 0,0 7px,7px -7px,-7px 0}
.crop img{width:420px;display:block;margin:-150px 0 0 -25px}
.tlabel{display:block;font-size:10px;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.thumb.missing{color:#f6a623;font-size:11px}
.note{color:#f6a623}
</style>
<h1>Two checkpoints, side by side</h1>
<p class="lead"><strong>A - ${escape(modelName(A.route))}</strong> (${escape(path.basename(A.dir))}) ·
<strong>B - ${escape(modelName(B.route))}</strong> (${escape(path.basename(B.dir))}). Same briefs, same
brands, same pinned decoding; every graphic composed by the same platform code and rebuilt through
today's composer, so the only difference on this page is the checkpoint that wrote the language.</p>
<p class="lead">This page NAMES the models, which is why it is not the review surface. The blind
page is where a verdict gets formed; this one is for reading the difference once that is done.</p>
${missing.length ? `<p class="note">${missing.length} frame(s) missing: ${escape(missing.join('; '))}</p>` : ''}

<h3>The whole round at once - ${escape(modelName(A.route))}</h3>
${strip(A)}
<h3>The whole round at once - ${escape(modelName(B.route))}</h3>
${strip(B)}
<p class="lead">Thumbnails are CROPPED to a fixed window on the graphic band - identical for every
cell, so they stay comparable to each other, but they are not the full 1920x1080 frame. Click one
for that. <strong>Read these two strips against each other rather than item by item:</strong> a
round can be narrower than the one beside it while every single graphic in it is good, and that
difference is only visible here.</p>

${slugs.map(pairRow).join('\n')}
`;

await writeFile(path.resolve(outFile), page, 'utf8');
console.log(`wrote ${outFile} - ${slugs.length} briefs, ${A.cells.size} + ${B.cells.size} cells`);
for (const m of missing) console.log(`  MISSING ${m}`);
