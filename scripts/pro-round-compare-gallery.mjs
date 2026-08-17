#!/usr/bin/env node
// ONE BLIND PAGE holding two Pro rounds. FREE - it reads two finished rounds and writes HTML.
//
//   node scripts/pro-round-compare-gallery.mjs <roundA> <roundB> --out=<file.html>
//   node scripts/pro-round-compare-gallery.mjs <roundA> <roundB> --out=<file.html> --reveal
//
// WHY A SECOND GALLERY EXISTS. `pro-spike.mjs` writes ONE round's review page, and a round is
// the unit it knows about - two rounds are two pages with two independently-issued id spaces,
// so a reader comparing checkpoints is really comparing two browser tabs and their own memory
// of the first one. This puts every generation from both rounds in ONE shuffled list, and
// nothing on the page says which round an item came from.
//
// IT SHOWS THE RECOMPOSED FRAMES, which is the whole reason the comparison is affordable. A
// round's saved `language.json` is the artefact the money bought; everything after it is
// deterministic, so `--recompose` rebuilds both rounds through TODAY's composer for nothing and
// the two are then separated by their checkpoint alone rather than by whatever the composer
// happened to be on each capture date. An item with no recomposed frame is listed as missing
// rather than silently dropped - a blind page quietly showing 34 of 36 items is a page that
// lies about its own coverage.
//
// THE SHUFFLE IS DETERMINISTIC AND ROUND-BLIND: the sort key is a hash of the issued id, and
// ids are issued over the two rounds' cells INTERLEAVED, so neither position nor id ordinal
// tells a reader which checkpoint produced an item. Re-running with the same inputs produces
// the same page, so a note written against `X-07` still means the same graphic tomorrow.
//
// `--reveal` writes the key beside it. Same rule as the round gallery: write the notes first.

import { access, copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const value = (name) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const rounds = args.filter((a) => !a.startsWith('--'));
const outFile = value('out');

if (rounds.length !== 2 || !outFile) {
  console.error('usage: node scripts/pro-round-compare-gallery.mjs <roundA> <roundB> --out=<file.html> [--reveal]');
  process.exit(1);
}

/** Stable string hash, the same one the round gallery shuffles with. */
function hash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const exists = async (file) => access(file).then(() => true, () => false);

async function load(dir, letter) {
  const round = JSON.parse(await readFile(path.resolve(dir, 'results.json'), 'utf8'));
  const cells = [];
  for (const r of round.results ?? []) {
    if (r.kind !== 'candidate' || r.skipped || r.error || !r.language) continue;
    cells.push({
      round: letter,
      dir,
      slug: r.slug,
      route: round.route,
      brand: r.brand ?? null,
      divergence: Boolean(r.divergence),
      languageName: r.language?.name ?? null,
      adjustments: r.recomposedAdjustments ?? [],
      hold: r.recomposedHold ?? null,
      stress: r.recomposedStress ?? null,
    });
  }
  return { dir, route: round.route, capturedAt: round.capturedAt, cells };
}

const [A, B] = await Promise.all([load(rounds[0], 'A'), load(rounds[1], 'B')]);

// Interleave before issuing ids, so the ordinal carries no round information even before the
// shuffle - a reader who works out that ids were issued in order still learns nothing.
const interleaved = [];
for (let i = 0; i < Math.max(A.cells.length, B.cells.length); i += 1) {
  if (A.cells[i]) interleaved.push(A.cells[i]);
  if (B.cells[i]) interleaved.push(B.cells[i]);
}
interleaved.forEach((cell, i) => { cell.id = `X-${String(i + 1).padStart(2, '0')}`; });

const shown = [...interleaved].sort((a, b) => hash(a.id) - hash(b.id));

// THE FRAMES ARE COPIED UNDER THE ISSUED ID, and that is not tidiness. Referencing them in
// place would put `round-2026-08-17/recomposed/sports-live.kestrel...png` in the `src`, so the
// round AND the brief are readable from the page source, a hover, or a saved image's filename -
// a gallery that is blind only until someone looks at it is not blind. The copies land in
// `blind/`, which the evidence folder already ignores, because they are reproducible from the
// two rounds for nothing.
const outDir = path.dirname(path.resolve(outFile));
const blindDir = path.resolve(outDir, 'blind');
await mkdir(blindDir, { recursive: true });

const missing = [];
for (const cell of shown) {
  for (const [name, file] of [['hold', cell.hold], ['stress', cell.stress]]) {
    if (!file) { missing.push(`${cell.id} has no recomposed ${name} frame in its ledger`); continue; }
    const from = path.resolve(cell.dir, file);
    if (!(await exists(from))) { missing.push(`${cell.id}: ${file} is missing on disk`); continue; }
    const blind = `${cell.id}.${name}.png`;
    await copyFile(from, path.resolve(blindDir, blind));
    cell[`blind${name === 'hold' ? 'Hold' : 'Stress'}`] = `blind/${blind}`;
  }
}

const sections = shown.map((cell) => `<section id="${cell.id}">
  <h2>${cell.id}</h2>
  <div class="holds">
    ${cell.blindHold ? `<figure><img src="${cell.blindHold}"><figcaption>normal text</figcaption></figure>` : '<p class="note">no normal-text frame</p>'}
    ${cell.blindStress ? `<figure><img src="${cell.blindStress}"><figcaption>stress text</figcaption></figure>` : '<p class="note">no stress-text frame</p>'}
  </div>
</section>`).join('\n');

const page = `<!doctype html><meta charset="utf-8">
<title>NoaCG Pro - two rounds, blind - ${shown.length} items</title>
<style>
body{background:#101216;color:#e8e9ec;font:14px/1.5 system-ui;padding:24px;max-width:1500px;margin:0 auto}
h1{font-size:20px} h2{font-size:16px;border-top:1px solid #2a2d34;padding-top:18px;margin-top:32px}
.lead{color:#9aa0ab;max-width:74ch}
.holds{display:flex;gap:12px;flex-wrap:wrap}
figure{margin:0}
figcaption{color:#9aa0ab;font-size:11px;margin-top:2px}
/* The frames are TRANSPARENT, so they are shown over a checkerboard - a graphic judged on a
   flat dark page is judged against a background it will never have on air. */
img{width:700px;display:block;border:1px solid #2a2d34;
  background-color:#20242b;
  background-image:linear-gradient(45deg,#171a20 25%,transparent 25%),linear-gradient(-45deg,#171a20 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#171a20 75%),linear-gradient(-45deg,transparent 75%,#171a20 75%);
  background-size:24px 24px;
  background-position:0 0,0 12px,12px -12px,-12px 0}
.note{color:#f6a623}
</style>
<h1>NoaCG Pro - two rounds, blind - ${shown.length} items</h1>
<p class="lead">Every item below was composed by <strong>the same platform code</strong>, from a
design language bought in one of two paid rounds. Nothing on this page says which round an item
came from, what it cost, or what any instrument said about it.</p>
<p class="lead">The frames are the <strong>recomposed</strong> ones - each round's saved language
rendered through today's composer - so the only thing separating the two halves of this page is
the checkpoint that wrote the language.</p>
<p class="lead">Read each one for: whether the palette reads at broadcast distance, whether the
type carries a deliberate hierarchy, whether the accent and shape language look decided rather
than defaulted, and whether the stress frame still holds together. Write your notes BEFORE
anything is revealed.</p>
${missing.length ? `<p class="note">${missing.length} frame(s) missing: ${missing.join('; ')}</p>` : ''}
${sections}
`;

await writeFile(path.resolve(outFile), page, 'utf8');
console.log(`wrote ${outFile} - ${shown.length} items (${A.cells.length} + ${B.cells.length})`);
if (missing.length) for (const m of missing) console.log(`  MISSING ${m}`);

if (flag('reveal')) {
  const keyFile = path.resolve(outDir, `${path.basename(outFile, '.html')}-key.html`);
  const rows = shown.map((c) => `<tr><td>${c.id}</td><td>${c.route}</td><td>${c.slug}</td>`
    + `<td>${c.brand ?? '-'}${c.divergence ? ' (divergence)' : ''}</td>`
    + `<td>${c.languageName ?? '-'}</td><td>${c.adjustments.join(', ') || '-'}</td></tr>`).join('\n');
  await writeFile(keyFile, `<!doctype html><meta charset="utf-8">
<title>Key - two rounds</title>
<style>body{background:#101216;color:#e8e9ec;font:13px/1.5 system-ui;padding:24px}
table{border-collapse:collapse} td,th{border:1px solid #2a2d34;padding:4px 8px;text-align:left}</style>
<h1>Key</h1>
<p>A: <code>${A.route}</code> (${path.basename(A.dir)}) · B: <code>${B.route}</code> (${path.basename(B.dir)})</p>
<table><tr><th>id</th><th>route</th><th>cell</th><th>brand</th><th>language name</th><th>composer adjustments</th></tr>
${rows}</table>
`, 'utf8');
  console.log(`wrote ${keyFile}`);
}
